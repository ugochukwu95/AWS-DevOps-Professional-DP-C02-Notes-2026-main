// Command worker claims pending jobs from PostgreSQL and processes them.
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"taskq/internal/db"
)

type worker struct {
	pool *pgxpool.Pool
	log  *slog.Logger
	s3   *s3.Client
	cfg  settings

	lastLoop  atomic.Int64 // unix seconds, read by /healthz
	processed atomic.Int64
	failed    atomic.Int64
	leaked    [][]byte // LEAK_MB_PER_JOB keeps memory here on purpose
}

type settings struct {
	pollInterval time.Duration
	workDuration time.Duration
	burnCPU      time.Duration
	leakMB       int
	bucket       string
}

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	cfg, err := loadSettings()
	if err != nil {
		log.Error("config", "err", err)
		os.Exit(1)
	}
	pool, err := db.Connect(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Error("database config", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	w := &worker{pool: pool, log: log, cfg: cfg}
	if cfg.bucket != "" {
		awsCfg, err := config.LoadDefaultConfig(ctx)
		if err != nil {
			log.Error("aws config", "err", err)
			os.Exit(1)
		}
		w.s3 = s3.NewFromConfig(awsCfg)
	}
	w.lastLoop.Store(time.Now().Unix())

	go w.serveHealth(envOr("HEALTH_PORT", "8081"))
	log.Info("worker started", "poll", cfg.pollInterval, "work", cfg.workDuration, "bucket", cfg.bucket)
	w.run(ctx)
	log.Info("worker stopped")
}

func (w *worker) run(ctx context.Context) {
	for {
		w.lastLoop.Store(time.Now().Unix())
		if ctx.Err() != nil {
			return
		}
		// A job that has started finishes even after SIGTERM; we stop between jobs.
		worked, err := w.processOne(context.WithoutCancel(ctx))
		if err != nil {
			w.log.Warn("poll failed", "err", err)
		}
		if worked {
			continue
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(w.cfg.pollInterval):
		}
	}
}

func (w *worker) processOne(ctx context.Context) (bool, error) {
	job, err := db.ClaimJob(ctx, w.pool)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	log := w.log.With("job", job.ID, "attempt", job.Attempts)
	log.Info("claimed")

	result, err := w.work(ctx, job)
	status := "done"
	if err != nil {
		status, result = "failed", err.Error()
		w.failed.Add(1)
		log.Error("job failed", "err", err)
	} else {
		w.processed.Add(1)
	}
	if err := db.FinishJob(ctx, w.pool, job.ID, status, result); err != nil {
		return true, fmt.Errorf("finish job %d: %w", job.ID, err)
	}
	log.Info("finished", "status", status)
	return true, nil
}

func (w *worker) work(ctx context.Context, job db.Job) (string, error) {
	time.Sleep(w.cfg.workDuration)

	if w.cfg.burnCPU > 0 {
		deadline := time.Now().Add(w.cfg.burnCPU)
		for time.Now().Before(deadline) {
		}
	}
	if w.cfg.leakMB > 0 {
		buf := make([]byte, w.cfg.leakMB<<20)
		for i := range buf {
			buf[i] = 1 // touch every page so it counts toward RSS
		}
		w.leaked = append(w.leaked, buf)
		w.log.Info("leaked memory", "total_mb", len(w.leaked)*w.cfg.leakMB)
	}

	sum := sha256.Sum256(job.Payload)
	result := hex.EncodeToString(sum[:])

	if w.s3 != nil {
		_, err := w.s3.PutObject(ctx, &s3.PutObjectInput{
			Bucket: aws.String(w.cfg.bucket),
			Key:    aws.String(fmt.Sprintf("results/%d.txt", job.ID)),
			Body:   strings.NewReader(result + "\n"),
		})
		if err != nil {
			return "", fmt.Errorf("upload result: %w", err)
		}
	}
	return result, nil
}

func (w *worker) serveHealth(port string) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(rw http.ResponseWriter, _ *http.Request) {
		age := time.Now().Unix() - w.lastLoop.Load()
		if age > 30 {
			http.Error(rw, fmt.Sprintf("poll loop stalled for %ds", age), http.StatusServiceUnavailable)
			return
		}
		fmt.Fprintln(rw, "ok")
	})
	mux.HandleFunc("GET /metrics", func(rw http.ResponseWriter, _ *http.Request) {
		rw.Header().Set("Content-Type", "text/plain; version=0.0.4")
		fmt.Fprintln(rw, "# TYPE taskq_jobs_processed_total counter")
		fmt.Fprintf(rw, "taskq_jobs_processed_total %d\n", w.processed.Load())
		fmt.Fprintln(rw, "# TYPE taskq_jobs_failed_total counter")
		fmt.Fprintf(rw, "taskq_jobs_failed_total %d\n", w.failed.Load())
	})
	srv := &http.Server{Addr: ":" + port, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	if err := srv.ListenAndServe(); err != nil {
		w.log.Error("health server", "err", err)
		os.Exit(1)
	}
}

func loadSettings() (settings, error) {
	var s settings
	var err error
	if s.pollInterval, err = time.ParseDuration(envOr("POLL_INTERVAL", "1s")); err != nil {
		return s, fmt.Errorf("POLL_INTERVAL: %w", err)
	}
	if s.workDuration, err = time.ParseDuration(envOr("WORK_DURATION", "500ms")); err != nil {
		return s, fmt.Errorf("WORK_DURATION: %w", err)
	}
	if s.burnCPU, err = time.ParseDuration(envOr("BURN_CPU", "0s")); err != nil {
		return s, fmt.Errorf("BURN_CPU: %w", err)
	}
	if s.leakMB, err = strconv.Atoi(envOr("LEAK_MB_PER_JOB", "0")); err != nil {
		return s, fmt.Errorf("LEAK_MB_PER_JOB: %w", err)
	}
	s.bucket = os.Getenv("RESULTS_BUCKET")
	return s, nil
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
