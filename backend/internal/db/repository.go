package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/session"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	if databaseURL == "" {
		return nil, errors.New("DATABASE_URL is required")
	}
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return pool, nil
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) CreateSession(ctx context.Context, condition session.Condition, interviewType session.InterviewType, participantCode *string, preConfidence *int) (session.Session, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO sessions (condition, interview_type, participant_code, pre_confidence)
		VALUES ($1, $2, $3, $4)
		RETURNING id, condition, interview_type, participant_code, created_at, ended_at, pre_confidence, post_confidence
	`, condition, interviewType, participantCode, preConfidence)
	return scanSession(row)
}

func (r *Repository) GetSession(ctx context.Context, id uuid.UUID) (session.Session, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, condition, interview_type, participant_code, created_at, ended_at, pre_confidence, post_confidence
		FROM sessions
		WHERE id = $1
	`, id)
	return scanSession(row)
}

func (r *Repository) GetSessionDetail(ctx context.Context, id uuid.UUID) (session.SessionDetail, error) {
	found, err := r.GetSession(ctx, id)
	if err != nil {
		return session.SessionDetail{}, err
	}
	turns, err := r.ListTurns(ctx, id)
	if err != nil {
		return session.SessionDetail{}, err
	}
	return session.SessionDetail{Session: found, Turns: turns}, nil
}

func (r *Repository) AddTurn(ctx context.Context, sessionID uuid.UUID, role session.Role, content string) (session.Turn, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO turns (session_id, role, content)
		VALUES ($1, $2, $3)
		RETURNING id, session_id, role, content, created_at
	`, sessionID, role, content)
	return scanTurn(row)
}

func (r *Repository) ListTurns(ctx context.Context, sessionID uuid.UUID) ([]session.Turn, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, session_id, role, content, created_at
		FROM turns
		WHERE session_id = $1
		ORDER BY id ASC
	`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var turns []session.Turn
	for rows.Next() {
		turn, err := scanTurn(rows)
		if err != nil {
			return nil, err
		}
		turns = append(turns, turn)
	}
	return turns, rows.Err()
}

func (r *Repository) EndSession(ctx context.Context, id uuid.UUID, postConfidence *int) (session.Session, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE sessions
		SET ended_at = NOW(), post_confidence = COALESCE($2, post_confidence)
		WHERE id = $1
		RETURNING id, condition, interview_type, participant_code, created_at, ended_at, pre_confidence, post_confidence
	`, id, postConfidence)
	return scanSession(row)
}

func (r *Repository) AddSnapshot(ctx context.Context, snapshot session.FacialSnapshot) (session.FacialSnapshot, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO facial_snapshots (session_id, eye_contact_ratio, head_stability, facial_activity)
		VALUES ($1, $2, $3, $4)
		RETURNING id, session_id, captured_at, eye_contact_ratio, head_stability, facial_activity
	`, snapshot.SessionID, snapshot.EyeContactRatio, snapshot.HeadStability, snapshot.FacialActivity)
	return scanSnapshot(row)
}

func (r *Repository) ListSnapshots(ctx context.Context, sessionID uuid.UUID) ([]session.FacialSnapshot, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, session_id, captured_at, eye_contact_ratio, head_stability, facial_activity
		FROM facial_snapshots
		WHERE session_id = $1
		ORDER BY id ASC
	`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var snapshots []session.FacialSnapshot
	for rows.Next() {
		snapshot, err := scanSnapshot(rows)
		if err != nil {
			return nil, err
		}
		snapshots = append(snapshots, snapshot)
	}
	return snapshots, rows.Err()
}

func (r *Repository) CreateReport(ctx context.Context, sessionID uuid.UUID, verbalAnalysis json.RawMessage, nonverbalSummary json.RawMessage) (session.Report, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO reports (session_id, verbal_analysis, nonverbal_summary)
		VALUES ($1, $2, NULLIF($3::jsonb, 'null'::jsonb))
		RETURNING id, session_id, verbal_analysis, COALESCE(nonverbal_summary, 'null'::jsonb), created_at
	`, sessionID, verbalAnalysis, nullableJSON(nonverbalSummary))
	return scanReport(row)
}

func (r *Repository) GetReport(ctx context.Context, sessionID uuid.UUID) (session.Report, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, session_id, verbal_analysis, COALESCE(nonverbal_summary, 'null'::jsonb), created_at
		FROM reports
		WHERE session_id = $1
		ORDER BY created_at DESC
		LIMIT 1
	`, sessionID)
	return scanReport(row)
}

func (r *Repository) SessionsTableExists(ctx context.Context) error {
	var exists bool
	if err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM information_schema.tables
			WHERE table_schema = 'public' AND table_name = 'sessions'
		)
	`).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return errors.New("sessions table does not exist")
	}
	return nil
}

func scanSession(row pgx.Row) (session.Session, error) {
	var output session.Session
	if err := row.Scan(
		&output.ID,
		&output.Condition,
		&output.InterviewType,
		&output.ParticipantCode,
		&output.CreatedAt,
		&output.EndedAt,
		&output.PreConfidence,
		&output.PostConfidence,
	); err != nil {
		return session.Session{}, err
	}
	return output, nil
}

func scanTurn(row pgx.Row) (session.Turn, error) {
	var output session.Turn
	if err := row.Scan(&output.ID, &output.SessionID, &output.Role, &output.Content, &output.CreatedAt); err != nil {
		return session.Turn{}, err
	}
	return output, nil
}

func scanSnapshot(row pgx.Row) (session.FacialSnapshot, error) {
	var output session.FacialSnapshot
	if err := row.Scan(&output.ID, &output.SessionID, &output.CapturedAt, &output.EyeContactRatio, &output.HeadStability, &output.FacialActivity); err != nil {
		return session.FacialSnapshot{}, err
	}
	return output, nil
}

func scanReport(row pgx.Row) (session.Report, error) {
	var output session.Report
	if err := row.Scan(&output.ID, &output.SessionID, &output.VerbalAnalysis, &output.NonverbalSummary, &output.CreatedAt); err != nil {
		return session.Report{}, err
	}
	if string(output.NonverbalSummary) == "null" {
		output.NonverbalSummary = nil
	}
	return output, nil
}

func nullableJSON(value json.RawMessage) json.RawMessage {
	if len(value) == 0 {
		return json.RawMessage("null")
	}
	return value
}

func NotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func WrapMigrationError(path string, err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("migration %s failed: %w", path, err)
}
