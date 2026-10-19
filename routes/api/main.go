package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	apiapis "mthan/vps/routes/api/apis"
	apibackup "mthan/vps/routes/api/backup"
	containersroute "mthan/vps/routes/api/containers"
	apifiles "mthan/vps/routes/api/files"
	apitasking "mthan/vps/routes/api/tasking"
	apilimits "mthan/vps/routes/api/user/limits"
	vhostroute "mthan/vps/routes/api/vhost"
	"mthan/vps/routes/post/terminal"
	"mthan/vps/services"
)

type Dependencies struct {
	Health      *services.HealthService
	PostBaseURL string
	Sessions    *services.SessionService
	System      *services.SystemService
	Startup     services.StartupConfig
	Settings    *services.SettingsService
}

func Register(mux *http.ServeMux, deps Dependencies) {
	postClient := newPostClient(deps.PostBaseURL)

	mux.Handle("OPTIONS /api", public(http.HandlerFunc(noContent)))
	mux.Handle("OPTIONS /api/", public(http.HandlerFunc(noContent)))

	mux.Handle("GET /api", public(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{
			"service": "vps",
			"status":  "ok",
		})
	})))

	mux.Handle("GET /api/healthz", public(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, deps.Health.Status())
	})))

	mux.Handle("GET /api/session", public(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		session, ok := requestSession(r, deps.Sessions)
		if !ok {
			http.Error(w, "session invalid", http.StatusUnauthorized)
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"session": session,
			"status":  "ok",
		})
	})))

	mux.Handle("GET /api/system", public(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requestSession(r, deps.Sessions); !ok {
			http.Error(w, "session invalid", http.StatusUnauthorized)
			return
		}
		status, err := deps.System.Status()
		if err != nil {
			http.Error(w, "system information unavailable", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, status)
	})))

	mux.Handle("GET /api/apps", public(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requestSession(r, deps.Sessions); !ok {
			http.Error(w, "session invalid", http.StatusUnauthorized)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"apps": services.DetectApps()})
	})))
	mux.Handle("POST /api/login", public(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var credentials services.LoginCredentials
		if err := json.NewDecoder(r.Body).Decode(&credentials); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		user, err := postClient.LoginUser(r.Context(), credentials)
		if err != nil {
			writeLoginError(w, err)
			return
		}

		session, err := deps.Sessions.Create(user, "user")
		if err != nil {
			http.Error(w, "session could not be created", http.StatusInternalServerError)
			return
		}

		setSessionCookie(w, r, deps.Sessions, session)
		writeJSON(w, http.StatusOK, loginResponse{
			Session: &session,
			Status:  "ok",
			User:    user,
		})
	})))

	mux.Handle("GET /api/files", public(apifiles.Handler(deps.Sessions)))
	mux.Handle("POST /api/files", public(apifiles.Handler(deps.Sessions)))
	mux.Handle("PATCH /api/files", public(apifiles.Handler(deps.Sessions)))
	mux.Handle("DELETE /api/files", public(apifiles.Handler(deps.Sessions)))
	var userLimitsSvc *services.UserLimitsService
	var cronTaskSvc *services.CronTaskService
	if deps.Settings != nil && deps.Settings.DB() != nil {
		userLimitsSvc, _ = services.NewUserLimitsService(deps.Settings.DB())
		cronTaskSvc, _ = services.NewCronTaskService(deps.Settings.DB(), userLimitsSvc)
	}
	containerSvc := services.NewContainerService()
	if userLimitsSvc != nil {
		containerSvc.SetLimitsService(userLimitsSvc)
	}

	mux.Handle("GET /api/containers", public(containersroute.UserHandler(deps.Sessions, containerSvc)))
	mux.Handle("GET /api/containers/templates", public(containersroute.UserTemplatesHandler(deps.Sessions, deps.Settings)))
	mux.Handle("POST /api/containers/create", public(containersroute.UserCreateHandler(deps.Sessions, containerSvc, deps.Settings)))
	mux.Handle("POST /api/containers/action", public(containersroute.UserActionHandler(deps.Sessions, containerSvc)))
	mux.Handle("GET /api/containers/logs", public(containersroute.UserLogsHandler(deps.Sessions, containerSvc)))
	mux.Handle("GET /api/containers/dockerfile", public(containersroute.UserDockerfileHandler(deps.Sessions, containerSvc)))
	mux.Handle("PUT /api/containers/dockerfile", public(containersroute.UserDockerfileHandler(deps.Sessions, containerSvc)))
	if cronTaskSvc != nil {
		mux.Handle("GET /api/tasking", public(apitasking.Handler(deps.Sessions, cronTaskSvc)))
		mux.Handle("GET /api/tasking/list", public(apitasking.Handler(deps.Sessions, cronTaskSvc)))
		mux.Handle("POST /api/tasking", public(apitasking.Handler(deps.Sessions, cronTaskSvc)))
		mux.Handle("POST /api/tasking/create", public(apitasking.Handler(deps.Sessions, cronTaskSvc)))
		mux.Handle("POST /api/tasking/update", public(apitasking.UpdateHandler(deps.Sessions, cronTaskSvc)))
		mux.Handle("POST /api/tasking/toggle", public(apitasking.ToggleHandler(deps.Sessions, cronTaskSvc)))
		mux.Handle("POST /api/tasking/delete", public(apitasking.DeleteHandler(deps.Sessions, cronTaskSvc)))
		mux.Handle("POST /api/tasking/run", public(apitasking.RunHandler(deps.Sessions, cronTaskSvc)))
	}
	if userLimitsSvc != nil && cronTaskSvc != nil {
		mux.Handle("GET /api/user/limits", public(apilimits.Handler(deps.Sessions, userLimitsSvc, cronTaskSvc, containerSvc)))
	}
	vhostHandler := public(vhostroute.Handler(deps.Sessions, services.NewVHostService(), deps.PostBaseURL))
	mux.Handle("GET /api/vhost", vhostHandler)
	mux.Handle("GET /api/vhost/", vhostHandler)
	mux.Handle("POST /api/vhost", vhostHandler)
	mux.Handle("POST /api/vhost/", vhostHandler)
	mux.Handle("PUT /api/vhost/", vhostHandler)
	mux.Handle("DELETE /api/vhost/", vhostHandler)
	mux.Handle("GET /api/terminal", public(terminal.Handler(deps.Sessions, deps.Startup, false)))
	mux.Handle("GET /api/backup", public(apibackup.Handler(deps.Sessions, services.NewBackupService())))
	mux.Handle("POST /api/backup", public(apibackup.Handler(deps.Sessions, services.NewBackupService())))
	mux.Handle("DELETE /api/backup", public(apibackup.Handler(deps.Sessions, services.NewBackupService())))
	mux.Handle("POST /api/backup/restore", public(apibackup.RestoreHandler(deps.Sessions, services.NewBackupService())))
	if deps.Settings != nil {
		mux.Handle("GET /api/apis", public(apiapis.Handler(deps.Sessions, deps.Settings)))
		mux.Handle("POST /api/apis", public(apiapis.Handler(deps.Sessions, deps.Settings)))
		mux.Handle("PATCH /api/apis", public(apiapis.Handler(deps.Sessions, deps.Settings)))
		mux.Handle("DELETE /api/apis", public(apiapis.Handler(deps.Sessions, deps.Settings)))

		if backupStorageSvc, err := services.NewBackupStorageService(deps.Settings.DB()); err == nil {
			mux.Handle("GET /api/backup/storage", public(apibackup.StorageHandler(deps.Sessions, backupStorageSvc)))
			mux.Handle("POST /api/backup/storage", public(apibackup.StorageHandler(deps.Sessions, backupStorageSvc)))
			mux.Handle("DELETE /api/backup/storage", public(apibackup.StorageHandler(deps.Sessions, backupStorageSvc)))
		}
	}

	mux.Handle("GET /healthz", public(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, deps.Health.Status())
	})))
}

func requestSession(r *http.Request, sessions *services.SessionService) (services.Session, bool) {
	return sessions.GetUserSession(r)
}

var (
	errPostAuthUnavailable = errors.New("post auth unavailable")
	errPostLoginFailed     = errors.New("post login failed")
)

type loginResponse struct {
	Session *services.Session          `json:"session,omitempty"`
	Status  string                     `json:"status"`
	User    services.AuthenticatedUser `json:"user"`
}

type postClient struct {
	baseURL    string
	httpClient *http.Client
}

func newPostClient(baseURL string) postClient {
	return postClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

func (c postClient) LoginUser(ctx context.Context, credentials services.LoginCredentials) (services.AuthenticatedUser, error) {
	payload, err := json.Marshal(credentials)
	if err != nil {
		return services.AuthenticatedUser{}, err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/post/user/login", bytes.NewReader(payload))
	if err != nil {
		return services.AuthenticatedUser{}, err
	}
	request.Header.Set("Content-Type", "application/json")

	response, err := c.httpClient.Do(request)
	if err != nil {
		return services.AuthenticatedUser{}, errPostAuthUnavailable
	}
	defer response.Body.Close()

	switch response.StatusCode {
	case http.StatusOK:
	case http.StatusUnauthorized:
		return services.AuthenticatedUser{}, services.ErrInvalidCredentials
	case http.StatusForbidden, http.StatusServiceUnavailable:
		return services.AuthenticatedUser{}, errPostAuthUnavailable
	default:
		return services.AuthenticatedUser{}, errPostLoginFailed
	}

	var login loginResponse
	if err := json.NewDecoder(response.Body).Decode(&login); err != nil {
		return services.AuthenticatedUser{}, errPostLoginFailed
	}

	return login.User, nil
}

func writeLoginError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, services.ErrInvalidCredentials):
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
	case errors.Is(err, errPostAuthUnavailable):
		http.Error(w, "auth unavailable", http.StatusServiceUnavailable)
	default:
		http.Error(w, "login failed", http.StatusInternalServerError)
	}
}

func setSessionCookie(w http.ResponseWriter, r *http.Request, sessions *services.SessionService, session services.Session) {
	http.SetCookie(w, &http.Cookie{
		HttpOnly: true,
		MaxAge:   sessions.MaxAge(),
		Name:     services.UserSessionCookieName,
		Path:     "/",
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil,
		Value:    session.Token,
	})
}

func public(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		next.ServeHTTP(w, r)
	})
}

func noContent(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNoContent)
}

func writeJSON(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)

	if err := json.NewEncoder(w).Encode(payload); err != nil {
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
	}
}
