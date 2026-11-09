// Package db holds the PostgreSQL queries shared by the api and the worker.
package db

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Arbitrary constant shared by every replica so only one applies migrations at a time.
const migrationLockID = 724001

var ErrNotFound = errors.New("job not found")

type Job struct {
	ID        int64           `json:"id"`
	Payload   json.RawMessage `json:"payload"`
	Status    string          `json:"status"`
	Result    *string         `json:"result,omitempty"`
	Attempts  int             `json:"attempts"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

// Connect creates a pool. pgxpool connects lazily, so this succeeds even if Postgres is down.
func Connect(ctx context.Context, url string) (*pgxpool.Pool, error) {
	if url == "" {
		return nil, errors.New("DATABASE_URL is empty")
	}
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	cfg.MaxConns = 5
	return pgxpool.NewWithConfig(ctx, cfg)
}

func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()

	// Session-level advisory locks belong to a connection, so lock and migrate on the same one.
	if _, err := conn.Exec(ctx, "SELECT pg_advisory_lock($1)", migrationLockID); err != nil {
		return err
	}
	defer conn.Exec(context.WithoutCancel(ctx), "SELECT pg_advisory_unlock($1)", migrationLockID)

	files, err := fs.Glob(migrations, "migrations/*.sql")
	if err != nil {
		return err
	}
	sort.Strings(files)
	for _, f := range files {
		sql, err := migrations.ReadFile(f)
		if err != nil {
			return err
		}
		if _, err := conn.Exec(ctx, string(sql)); err != nil {
			return fmt.Errorf("%s: %w", f, err)
		}
	}
	return nil
}

func CreateJob(ctx context.Context, pool *pgxpool.Pool, payload json.RawMessage) (int64, error) {
	var id int64
	err := pool.QueryRow(ctx, "INSERT INTO jobs (payload) VALUES ($1) RETURNING id", payload).Scan(&id)
	return id, err
}

func GetJob(ctx context.Context, pool *pgxpool.Pool, id int64) (Job, error) {
	var j Job
	err := pool.QueryRow(ctx, `
		SELECT id, payload, status, result, attempts, created_at, updated_at
		FROM jobs WHERE id = $1`, id).
		Scan(&j.ID, &j.Payload, &j.Status, &j.Result, &j.Attempts, &j.CreatedAt, &j.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return j, ErrNotFound
	}
	return j, err
}

// CountByStatus feeds the taskq_jobs gauge on the api's /metrics endpoint.
func CountByStatus(ctx context.Context, pool *pgxpool.Pool) (map[string]int64, error) {
	rows, err := pool.Query(ctx, "SELECT status, count(*) FROM jobs GROUP BY status")
	if err != nil {
		return nil, err
	}
	counts := map[string]int64{"pending": 0, "running": 0, "done": 0, "failed": 0}
	for rows.Next() {
		var s string
		var n int64
		if err := rows.Scan(&s, &n); err != nil {
			return nil, err
		}
		counts[s] = n
	}
	return counts, rows.Err()
}

// ClaimJob returns pgx.ErrNoRows when there is nothing to do. Jobs stuck in
// 'running' for 5 minutes are assumed to belong to a dead worker and are reclaimed.
func ClaimJob(ctx context.Context, pool *pgxpool.Pool) (Job, error) {
	var j Job
	err := pool.QueryRow(ctx, `
		UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = now()
		WHERE id = (
			SELECT id FROM jobs
			WHERE status = 'pending'
			   OR (status = 'running' AND updated_at < now() - interval '5 minutes')
			ORDER BY id
			FOR UPDATE SKIP LOCKED
			LIMIT 1
		)
		RETURNING id, payload, attempts`).Scan(&j.ID, &j.Payload, &j.Attempts)
	return j, err
}

func FinishJob(ctx context.Context, pool *pgxpool.Pool, id int64, status, result string) error {
	_, err := pool.Exec(ctx,
		"UPDATE jobs SET status = $2, result = $3, updated_at = now() WHERE id = $1",
		id, status, result)
	return err
}
