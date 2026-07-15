package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/db"
	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/llm"
	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/session"
	"github.com/adebowale/nonverbal-coaching-sim/backend/internal/ws"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type Repository interface {
	CreateSession(context.Context, session.Condition, session.InterviewType, *string, *int) (session.Session, error)
	GetSession(context.Context, uuid.UUID) (session.Session, error)
	GetSessionDetail(context.Context, uuid.UUID) (session.SessionDetail, error)
	AddTurn(context.Context, uuid.UUID, session.Role, string) (session.Turn, error)
	ListTurns(context.Context, uuid.UUID) ([]session.Turn, error)
	EndSession(context.Context, uuid.UUID, *int) (session.Session, error)
	AddSnapshot(context.Context, session.FacialSnapshot) (session.FacialSnapshot, error)
	ListSnapshots(context.Context, uuid.UUID) ([]session.FacialSnapshot, error)
	CreateReport(context.Context, uuid.UUID, json.RawMessage, json.RawMessage) (session.Report, error)
	GetReport(context.Context, uuid.UUID) (session.Report, error)
}

type Server struct {
	mux            *http.ServeMux
	repo           Repository
	llm            llm.Client
	hubs           *ws.Manager
	logger         *slog.Logger
	allowedOrigins map[string]struct{}
	upgrader       websocket.Upgrader
}

type Config struct {
	Repository     Repository
	LLM            llm.Client
	Hubs           *ws.Manager
	Logger         *slog.Logger
	AllowedOrigins []string
}

func NewRouter(config Config) http.Handler {
	server := &Server{
		mux:            http.NewServeMux(),
		repo:           config.Repository,
		llm:            config.LLM,
		hubs:           config.Hubs,
		logger:         config.Logger,
		allowedOrigins: make(map[string]struct{}),
	}
	if server.hubs == nil {
		server.hubs = ws.NewManager()
	}
	if server.logger == nil {
		server.logger = slog.Default()
	}
	for _, origin := range config.AllowedOrigins {
		origin = strings.TrimSpace(origin)
		if origin != "" {
			server.allowedOrigins[origin] = struct{}{}
		}
	}
	server.upgrader = websocket.Upgrader{CheckOrigin: server.checkOrigin}

	server.routes()
	return server.withCORS(server.mux)
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /healthz", s.health)
	s.mux.HandleFunc("POST /api/sessions", s.createSession)
	s.mux.HandleFunc("GET /api/sessions/{id}", s.getSession)
	s.mux.HandleFunc("POST /api/sessions/{id}/turns", s.addTurn)
	s.mux.HandleFunc("POST /api/sessions/{id}/end", s.endSession)
	s.mux.HandleFunc("POST /api/sessions/{id}/snapshot", s.addSnapshot)
	s.mux.HandleFunc("GET /api/sessions/{id}/report", s.getReport)
	s.mux.HandleFunc("GET /ws/{id}", s.websocket)
	s.mux.HandleFunc("/", s.notFound)
}

func (s *Server) health(w http.ResponseWriter, req *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) notFound(w http.ResponseWriter, req *http.Request) {
	writeError(w, http.StatusNotFound, "not found")
}

func (s *Server) createSession(w http.ResponseWriter, req *http.Request) {
	var input struct {
		Condition       string  `json:"condition"`
		InterviewType   string  `json:"interview_type"`
		ParticipantCode *string `json:"participant_code"`
		PreConfidence   *int    `json:"pre_confidence"`
	}
	if !decodeJSON(w, req, &input) {
		return
	}

	condition, err := session.ParseCondition(input.Condition)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	interviewType, err := session.ParseInterviewType(input.InterviewType)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	created, err := s.repo.CreateSession(req.Context(), condition, interviewType, input.ParticipantCode, input.PreConfidence)
	if err != nil {
		s.logError("create session failed", err)
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":             created.ID,
		"condition":      created.Condition,
		"interview_type": created.InterviewType,
	})
}

func (s *Server) getSession(w http.ResponseWriter, req *http.Request) {
	sessionID, ok := parseSessionID(w, req)
	if !ok {
		return
	}
	detail, err := s.repo.GetSessionDetail(req.Context(), sessionID)
	if err != nil {
		s.handleRepoError(w, err, "session not found", "failed to get session")
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (s *Server) addTurn(w http.ResponseWriter, req *http.Request) {
	sessionID, ok := parseSessionID(w, req)
	if !ok {
		return
	}
	var input struct {
		Content string `json:"content"`
	}
	if !decodeJSON(w, req, &input) {
		return
	}
	input.Content = strings.TrimSpace(input.Content)
	if input.Content == "" {
		writeError(w, http.StatusBadRequest, "content is required")
		return
	}

	response, turnIndex, err := s.processCandidateTurn(req.Context(), sessionID, input.Content)
	if err != nil {
		s.handleRepoError(w, err, "session not found", "failed to process turn")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"type":       "ai_response",
		"content":    response,
		"turn_index": turnIndex,
	})
}

func (s *Server) endSession(w http.ResponseWriter, req *http.Request) {
	sessionID, ok := parseSessionID(w, req)
	if !ok {
		return
	}
	var input struct {
		PostConfidence *int `json:"post_confidence"`
	}
	if req.Body != nil && req.ContentLength != 0 {
		if !decodeJSON(w, req, &input) {
			return
		}
	}

	report, err := s.generateReport(req.Context(), sessionID, input.PostConfidence)
	if err != nil {
		s.handleRepoError(w, err, "session not found", "failed to end session")
		return
	}
	writeJSON(w, http.StatusOK, report)
}

func (s *Server) addSnapshot(w http.ResponseWriter, req *http.Request) {
	sessionID, ok := parseSessionID(w, req)
	if !ok {
		return
	}
	var input struct {
		EyeContactRatio float64 `json:"eye_contact_ratio"`
		HeadStability   float64 `json:"head_stability"`
		FacialActivity  float64 `json:"facial_activity"`
	}
	if !decodeJSON(w, req, &input) {
		return
	}
	if err := validateRatio(input.EyeContactRatio, "eye_contact_ratio"); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := validateRatio(input.HeadStability, "head_stability"); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := validateRatio(input.FacialActivity, "facial_activity"); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	snapshot, err := s.repo.AddSnapshot(req.Context(), session.FacialSnapshot{
		SessionID:       sessionID,
		EyeContactRatio: input.EyeContactRatio,
		HeadStability:   input.HeadStability,
		FacialActivity:  input.FacialActivity,
	})
	if err != nil {
		s.logError("add snapshot failed", err)
		writeError(w, http.StatusInternalServerError, "failed to store snapshot")
		return
	}
	writeJSON(w, http.StatusCreated, snapshot)
}

func (s *Server) getReport(w http.ResponseWriter, req *http.Request) {
	sessionID, ok := parseSessionID(w, req)
	if !ok {
		return
	}
	report, err := s.repo.GetReport(req.Context(), sessionID)
	if err != nil {
		s.handleRepoError(w, err, "report not found", "failed to get report")
		return
	}
	writeJSON(w, http.StatusOK, report)
}

func (s *Server) websocket(w http.ResponseWriter, req *http.Request) {
	sessionID, ok := parseSessionID(w, req)
	if !ok {
		return
	}
	if _, err := s.repo.GetSession(req.Context(), sessionID); err != nil {
		s.handleRepoError(w, err, "session not found", "failed to get session")
		return
	}

	conn, err := s.upgrader.Upgrade(w, req, nil)
	if err != nil {
		s.logError("websocket upgrade failed", err)
		return
	}
	defer conn.Close()

	hub := s.hubs.HubFor(sessionID)
	hub.Register(conn)
	defer hub.Unregister(conn)

	for {
		var message struct {
			Type    string `json:"type"`
			Content string `json:"content"`
		}
		if err := conn.ReadJSON(&message); err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				s.logError("websocket read failed", err)
			}
			return
		}

		switch message.Type {
		case "candidate_turn":
			response, turnIndex, err := s.processCandidateTurn(req.Context(), sessionID, message.Content)
			if err != nil {
				_ = conn.WriteJSON(map[string]string{"type": "error", "error": err.Error()})
				continue
			}
			if err := conn.WriteJSON(map[string]any{"type": "ai_response", "content": response, "turn_index": turnIndex}); err != nil {
				s.logError("websocket write failed", err)
				return
			}
		case "end_session":
			report, err := s.generateReport(req.Context(), sessionID, nil)
			if err != nil {
				_ = conn.WriteJSON(map[string]string{"type": "error", "error": err.Error()})
				continue
			}
			if err := conn.WriteJSON(map[string]any{"type": "session_ended", "report": report}); err != nil {
				s.logError("websocket write failed", err)
				return
			}
		default:
			_ = conn.WriteJSON(map[string]string{"type": "error", "error": "unsupported message type"})
		}
	}
}

func (s *Server) processCandidateTurn(ctx context.Context, sessionID uuid.UUID, content string) (string, int, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return "", 0, errors.New("content is required")
	}

	found, err := s.repo.GetSession(ctx, sessionID)
	if err != nil {
		return "", 0, err
	}
	if _, err := s.repo.AddTurn(ctx, sessionID, session.RoleCandidate, content); err != nil {
		return "", 0, err
	}
	turns, err := s.repo.ListTurns(ctx, sessionID)
	if err != nil {
		return "", 0, err
	}
	aiResponse, err := s.llm.InterviewResponse(ctx, found.InterviewType, turns)
	if err != nil {
		return "", 0, err
	}
	aiTurn, err := s.repo.AddTurn(ctx, sessionID, session.RoleAI, aiResponse)
	if err != nil {
		return "", 0, err
	}
	return aiResponse, aiTurn.ID, nil
}

func (s *Server) generateReport(ctx context.Context, sessionID uuid.UUID, postConfidence *int) (session.Report, error) {
	ended, err := s.repo.EndSession(ctx, sessionID, postConfidence)
	if err != nil {
		return session.Report{}, err
	}
	turns, err := s.repo.ListTurns(ctx, sessionID)
	if err != nil {
		return session.Report{}, err
	}
	verbalReport, err := s.llm.VerbalReport(ctx, ended.InterviewType, turns)
	if err != nil {
		return session.Report{}, err
	}

	var nonverbalSummary json.RawMessage
	if ended.Condition == session.ConditionFullMultimodal {
		snapshots, err := s.repo.ListSnapshots(ctx, sessionID)
		if err != nil {
			return session.Report{}, err
		}
		nonverbalSummary, err = summarizeNonverbal(snapshots)
		if err != nil {
			return session.Report{}, err
		}
	}

	return s.repo.CreateReport(ctx, sessionID, verbalReport, nonverbalSummary)
}

func summarizeNonverbal(snapshots []session.FacialSnapshot) (json.RawMessage, error) {
	if len(snapshots) == 0 {
		return json.Marshal(map[string]any{
			"samples":           0,
			"eye_contact_ratio": nil,
			"head_stability":    nil,
			"facial_activity":   nil,
			"summary":           "No facial snapshots were captured.",
		})
	}

	var eyeContact, headStability, facialActivity float64
	for _, snapshot := range snapshots {
		eyeContact += snapshot.EyeContactRatio
		headStability += snapshot.HeadStability
		facialActivity += snapshot.FacialActivity
	}
	count := float64(len(snapshots))

	return json.Marshal(map[string]any{
		"samples":           len(snapshots),
		"eye_contact_ratio": eyeContact / count,
		"head_stability":    headStability / count,
		"facial_activity":   facialActivity / count,
		"summary":           "Averages are computed from two-second facial indicator snapshots.",
	})
}

func decodeJSON(w http.ResponseWriter, req *http.Request, target any) bool {
	decoder := json.NewDecoder(req.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return false
	}
	return true
}

func parseSessionID(w http.ResponseWriter, req *http.Request) (uuid.UUID, bool) {
	sessionID, err := uuid.Parse(req.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid session id")
		return uuid.Nil, false
	}
	return sessionID, true
}

func validateRatio(value float64, name string) error {
	if value < 0 || value > 1 {
		return errors.New(name + " must be between 0 and 1")
	}
	return nil
}

func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		origin := req.Header.Get("Origin")
		if s.originAllowed(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if req.Method == http.MethodOptions {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, req)
	})
}

func (s *Server) checkOrigin(req *http.Request) bool {
	return s.originAllowed(req.Header.Get("Origin"))
}

func (s *Server) originAllowed(origin string) bool {
	if origin == "" {
		return true
	}
	if len(s.allowedOrigins) == 0 {
		return true
	}
	_, ok := s.allowedOrigins[origin]
	return ok
}

func (s *Server) handleRepoError(w http.ResponseWriter, err error, notFoundMessage string, fallbackMessage string) {
	if db.NotFound(err) {
		writeError(w, http.StatusNotFound, notFoundMessage)
		return
	}
	s.logError(fallbackMessage, err)
	writeError(w, http.StatusInternalServerError, fallbackMessage)
}

func (s *Server) logError(message string, err error) {
	if s.logger != nil {
		s.logger.Error(message, slog.String("error", err.Error()))
	}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		slog.Default().Error("write json failed", slog.String("error", err.Error()))
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
