CREATE TABLE IF NOT EXISTS coaching_sessions (
    id UUID PRIMARY KEY,
    scenario TEXT NOT NULL,
    state TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
