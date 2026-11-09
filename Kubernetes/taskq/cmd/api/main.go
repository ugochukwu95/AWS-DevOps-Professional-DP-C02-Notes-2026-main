// Command api accepts jobs over HTTP and stores them in PostgreSQL.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"taskq/internal/db"
)

type server struct {
	pool     *pgxpool.Pool
	log      *slog.Logger
	migrated atomic.Bool

	mu       sync.Mutex
	requests map[int]int64 // HTTP status code -> count
}

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := db.Connect(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Error("database config", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	s := &server{pool: pool, log: log, requests: map[int]int64{}}
	go s.migrateUntilDone(ctx)

	mux := http.NewServeMux()
	mux.HandleFunc("POST /jobs", s.createJob)
	mux.HandleFunc("GET /jobs/{id}", s.getJob)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { fmt.Fprintln(w, "ok") })
	mux.HandleFunc("GET /readyz", s.ready)
	mux.HandleFunc("GET /metrics", s.metrics)

	port := envOr("PORT", "8080")
	srv := &http.Server{Addr: ":" + port, Handler: s.countRequests(mux), ReadHeaderTimeout: 5 * time.Second}

	go func() {
		log.Info("listening", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("listen", "err", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	log.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error("shutdown", "err", err)
	}
}

func (s *server) migrateUntilDone(ctx context.Context) {
	for {
		err := db.Migrate(ctx, s.pool)
		if err == nil {
			s.migrated.Store(true)
			s.log.Info("migrations applied")
			return
		}
		s.log.Warn("migrations failed, retrying in 5s", "err", err)
		select {
		case <-ctx.Done():
			return
		case <-time.After(5 * time.Second):
		}
	}
}

func (s *server) createJob(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Payload json.RawMessage `json:"payload"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body); err != nil || len(body.Payload) == 0 {
		http.Error(w, `body must be {"payload": <json>}`, http.StatusBadRequest)
		return
	}
	id, err := db.CreateJob(r.Context(), s.pool, body.Payload)
	if err != nil {
		s.log.Error("create job", "err", err)
		http.Error(w, "database error", http.StatusServiceUnavailable)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]int64{"id": id})
}

func (s *server) getJob(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	job, err := db.GetJob(r.Context(), s.pool, id)
	switch {
	case errors.Is(err, db.ErrNotFound):
		http.Error(w, "not found", http.StatusNotFound)
	case err != nil:
		s.log.Error("get job", "err", err)
		http.Error(w, "database error", http.StatusServiceUnavailable)
	default:
		writeJSON(w, http.StatusOK, job)
	}
}

// ready fails when the database is unreachable so the pod leaves the Service
// endpoints, but /healthz keeps passing so the kubelet doesn't restart it.
func (s *server) ready(w http.ResponseWriter, r *http.Request) {
	if !s.migrated.Load() {
		http.Error(w, "migrations not applied", http.StatusServiceUnavailable)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), time.Second)
	defer cancel()
	if err := s.pool.Ping(ctx); err != nil {
		http.Error(w, "database unreachable: "+err.Error(), http.StatusServiceUnavailable)
		return
	}
	fmt.Fprintln(w, "ready")
}

func (s *server) metrics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	s.mu.Lock()
	fmt.Fprintln(w, "# TYPE taskq_http_requests_total counter")
	for code, n := range s.requests {
		fmt.Fprintf(w, "taskq_http_requests_total{code=\"%d\"} %d\n", code, n)
	}
	s.mu.Unlock()

	ctx, cancel := context.WithTimeout(r.Context(), time.Second)
	defer cancel()
	if counts, err := db.CountByStatus(ctx, s.pool); err == nil {
		fmt.Fprintln(w, "# TYPE taskq_jobs gauge")
		for status, n := range counts {
			fmt.Fprintf(w, "taskq_jobs{status=%q} %d\n", status, n)
		}
	}
}

type statusRecorder struct {
	http.ResponseWriter
	code int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.code = code
	r.ResponseWriter.WriteHeader(code)
}

func (s *server) countRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec := &statusRecorder{ResponseWriter: w, code: http.StatusOK}
		start := time.Now()
		next.ServeHTTP(rec, r)
		s.mu.Lock()
		s.requests[rec.code]++
		s.mu.Unlock()
		if r.URL.Path != "/healthz" && r.URL.Path != "/readyz" && r.URL.Path != "/metrics" {
			s.log.Info("request", "method", r.Method, "path", r.URL.Path, "code", rec.code, "ms", time.Since(start).Milliseconds())
		}
	})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
