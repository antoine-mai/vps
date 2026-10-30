package vhost

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"mthan/vps/services"
)

func setupTestSessions(t *testing.T) *services.SessionService {
	t.Helper()
	t.Setenv("SESSION_PATH", filepath.Join(t.TempDir(), "session"))
	return services.NewSessionService()
}

func TestHandler_Unauthorized(t *testing.T) {
	sessions := setupTestSessions(t)
	handler := Handler(sessions, services.NewVHostService(), "http://127.0.0.1:9999")

	req := httptest.NewRequest(http.MethodPost, "/api/vhost/create", bytes.NewReader([]byte(`{}`)))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", rec.Code)
	}
}

func TestHandler_Create_MethodNotAllowed(t *testing.T) {
	sessions := setupTestSessions(t)
	session, err := sessions.Create(services.AuthenticatedUser{UID: 1001, Username: "john"}, "user")
	if err != nil {
		t.Fatalf("failed to create session: %v", err)
	}

	handler := Handler(sessions, services.NewVHostService(), "http://127.0.0.1:9999")
	req := httptest.NewRequest(http.MethodGet, "/api/vhost/create", nil)
	req.AddCookie(&http.Cookie{Name: services.UserSessionCookieName, Value: session.Token})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected status 405, got %d", rec.Code)
	}
}

func TestHandler_Create_InvalidBody(t *testing.T) {
	sessions := setupTestSessions(t)
	session, err := sessions.Create(services.AuthenticatedUser{UID: 1001, Username: "john"}, "user")
	if err != nil {
		t.Fatalf("failed to create session: %v", err)
	}

	handler := Handler(sessions, services.NewVHostService(), "http://127.0.0.1:9999")
	req := httptest.NewRequest(http.MethodPost, "/api/vhost/create", bytes.NewReader([]byte(`invalid json`)))
	req.AddCookie(&http.Cookie{Name: services.UserSessionCookieName, Value: session.Token})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", rec.Code)
	}
}

func TestHandler_Create_ForwardToPost(t *testing.T) {
	sessions := setupTestSessions(t)
	session, err := sessions.Create(services.AuthenticatedUser{UID: 1001, Username: "john"}, "user")
	if err != nil {
		t.Fatalf("failed to create session: %v", err)
	}

	// Mock post server
	var receivedCookie string
	var receivedInput services.CreateVHostInput
	mockPostServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/post/vhost/create" {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		if cookie, err := r.Cookie(services.UserSessionCookieName); err == nil {
			receivedCookie = cookie.Value
		}
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &receivedInput)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":   "ok",
			"hostname": "example.com",
		})
	}))
	defer mockPostServer.Close()

	handler := Handler(sessions, services.NewVHostService(), mockPostServer.URL)
	payload := []byte(`{"hostname":"example.com","target":"8080","owner":"attacker"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/vhost/create", bytes.NewReader(payload))
	req.AddCookie(&http.Cookie{Name: services.UserSessionCookieName, Value: session.Token})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	if receivedCookie != session.Token {
		t.Fatalf("expected cookie %q, got %q", session.Token, receivedCookie)
	}

	// Check owner is forced to session username
	if receivedInput.Owner != "john" {
		t.Fatalf("expected owner to be overwritten with 'john', got %q", receivedInput.Owner)
	}

	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response JSON: %v", err)
	}
	if resp["status"] != "ok" || resp["hostname"] != "example.com" {
		t.Fatalf("unexpected response: %+v", resp)
	}
}

func TestHandler_Create_PostUnavailable(t *testing.T) {
	sessions := setupTestSessions(t)
	session, err := sessions.Create(services.AuthenticatedUser{UID: 1001, Username: "john"}, "user")
	if err != nil {
		t.Fatalf("failed to create session: %v", err)
	}

	// Bad URL that immediately fails
	handler := Handler(sessions, services.NewVHostService(), "http://127.0.0.1:1")
	payload := []byte(`{"hostname":"example.com","target":"8080"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/vhost/create", bytes.NewReader(payload))
	req.AddCookie(&http.Cookie{Name: services.UserSessionCookieName, Value: session.Token})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status 503, got %d", rec.Code)
	}
}
