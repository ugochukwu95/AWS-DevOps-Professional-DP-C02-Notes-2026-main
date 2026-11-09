CREATE TABLE IF NOT EXISTS jobs (
    id         bigserial PRIMARY KEY,
    payload    jsonb       NOT NULL,
    status     text        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'running', 'done', 'failed')),
    result     text,
    attempts   int         NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_claimable_idx ON jobs (status, id);
