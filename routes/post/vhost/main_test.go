package vhost

import (
	"bytes"
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

func TestPostVHost_Create_WithoutSession(t *testing.T) {
	sessions := setupTestSessions(t)
	handler := Handler(sessions, services.NewVHostService())

	req := httptest.NewRequest(http.MethodPost, "/post/vhost/create", bytes.NewReader([]byte(`{}`)))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", rec.Code)
	}
}

func TestPostVHost_Create_MethodNotAllowed(t *testing.T) {
	sessions := setupTestSessions(t)
	session, err := sessions.Create(services.AuthenticatedUser{UID: 1001, Username: "john"}, "user")
	if err != nil {
		t.Fatalf("failed to create session: %v", err)
	}

	handler := Handler(sessions, services.NewVHostService())
	req := httptest.NewRequest(http.MethodGet, "/post/vhost/create", nil)
	req.AddCookie(&http.Cookie{Name: services.UserSessionCookieName, Value: session.Token})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected status 405, got %d", rec.Code)
	}
}

func TestPostVHost_Create_InvalidBody(t *testing.T) {
	sessions := setupTestSessions(t)
	session, err := sessions.Create(services.AuthenticatedUser{UID: 1001, Username: "john"}, "user")
	if err != nil {
		t.Fatalf("failed to create session: %v", err)
	}

	handler := Handler(sessions, services.NewVHostService())
	req := httptest.NewRequest(http.MethodPost, "/post/vhost/create", bytes.NewReader([]byte(`invalid json`)))
	req.AddCookie(&http.Cookie{Name: services.UserSessionCookieName, Value: session.Token})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", rec.Code)
	}
}

func TestPostVHost_OtherRoutes_RequireRoot(t *testing.T) {
	sessions := setupTestSessions(t)
	userSession, err := sessions.Create(services.AuthenticatedUser{UID: 1001, Username: "john"}, "user")
	if err != nil {
		t.Fatalf("failed to create user session: %v", err)
	}

	handler := Handler(sessions, services.NewVHostService())

	// A user session accessing /post/vhost/list should be rejected with 401
	req := httptest.NewRequest(http.MethodGet, "/post/vhost/list", nil)
	req.AddCookie(&http.Cookie{Name: services.UserSessionCookieName, Value: userSession.Token})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401 for non-root accessing /post/vhost/list, got %d", rec.Code)
	}
}
