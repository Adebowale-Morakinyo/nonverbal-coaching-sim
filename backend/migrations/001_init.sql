CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condition TEXT NOT NULL CHECK (condition IN ('verbal_only', 'full_multimodal')),
  interview_type TEXT NOT NULL DEFAULT 'behavioural',
  participant_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  pre_confidence INT,
  post_confidence INT
);

CREATE TABLE IF NOT EXISTS turns (
  id SERIAL PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  role TEXT NOT NULL CHECK (role IN ('ai', 'candidate')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS facial_snapshots (
  id SERIAL PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  eye_contact_ratio NUMERIC(4,3),
  head_stability NUMERIC(4,3),
  facial_activity NUMERIC(4,3)
);

CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  verbal_analysis JSONB,
  nonverbal_summary JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
