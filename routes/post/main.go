package post

import (
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"strings"

	postapis "mthan/vps/routes/post/apis"
	postapps "mthan/vps/routes/post/apps"
	appconfig "mthan/vps/routes/post/apps/config"
	postcontainers "mthan/vps/routes/post/containers"
	postbackup "mthan/vps/routes/post/backup"
	postfiles "mthan/vps/routes/post/files"
	postlogin "mthan/vps/routes/post/login"
	"mthan/vps/routes/post/ping"
	"mthan/vps/routes/post/session"
	settingsroute "mthan/vps/routes/post/settings"
	posttasking "mthan/vps/routes/post/tasking"
	"mthan/vps/routes/post/terminal"
	"mthan/vps/routes/post/update"
	useradd "mthan/vps/routes/post/user/add"
	userdelete "mthan/vps/routes/post/user/delete"
	postlimits "mthan/vps/routes/post/user/limits"
	userlist "mthan/vps/routes/post/user/list"
	userlogin "mthan/vps/routes/post/user/login"
	useroverview "mthan/vps/routes/post/user/overview"
	userpassword "mthan/vps/routes/post/user/password"
	postvhost "mthan/vps/routes/post/vhost"
	"mthan/vps/services"
)

type Dependencies struct {
	Auth     *services.AuthService
	Sessions *services.SessionService
	Startup  services.StartupConfig
	Update   *services.UpdateService
	System   *services.SystemService
	Settings *services.SettingsService
}

func Register(mux *http.ServeMux, deps Dependencies) {
	mux.Handle("OPTIONS /post/", postOnly(deps.Startup, deps.Sessions, http.HandlerFunc(noContent)))
	mux.Handle("POST /post/login", postOnly(deps.Startup, deps.Sessions, postlogin.Handler(deps.Auth, deps.Sessions)))
	mux.Handle("POST /post/user/login", postOnly(deps.Startup, deps.Sessions, userlogin.Handler(deps.Auth)))
	mux.Handle("POST /post/user/add", postOnly(deps.Startup, deps.Sessions, useradd.Handler(deps.Settings)))
	mux.Handle("POST /post/user/delete", postOnly(deps.Startup, deps.Sessions, userdelete.Handler()))
	mux.Handle("GET /post/session", postOnly(deps.Startup, deps.Sessions, session.Handler(deps.Sessions)))
	mux.Handle("GET /post/system", postOnly(deps.Startup, deps.Sessions, authenticatedSystemHandler(deps.Sessions, deps.System)))
	mux.Handle("GET /post/update", postOnly(deps.Startup, deps.Sessions, update.CheckHandler(deps.Update)))
	mux.Handle("POST /post/update", postOnly(deps.Startup, deps.Sessions, update.SelfUpdateHandler(deps.Update)))
	mux.Handle("POST /post/ping", postOnly(deps.Startup, deps.Sessions, ping.Handler()))
	mux.Handle("GET /post/user/list", postOnly(deps.Startup, deps.Sessions, userlist.Handler()))
	mux.Handle("GET /post/user/overview", postOnly(deps.Startup, deps.Sessions, useroverview.Handler()))
	mux.Handle("POST /post/user/password", postOnly(deps.Startup, deps.Sessions, userpassword.Handler()))
	mux.Handle("GET /post/files", postOnly(deps.Startup, deps.Sessions, postfiles.Handler(deps.Sessions)))
	mux.Handle("POST /post/files", postOnly(deps.Startup, deps.Sessions, postfiles.Handler(deps.Sessions)))
	mux.Handle("PATCH /post/files", postOnly(deps.Startup, deps.Sessions, postfiles.Handler(deps.Sessions)))
	mux.Handle("DELETE /post/files", postOnly(deps.Startup, deps.Sessions, postfiles.Handler(deps.Sessions)))
	userLimitsSvc, _ := services.NewUserLimitsService(deps.Settings.DB())
	cronTaskSvc, _ := services.NewCronTaskService(deps.Settings.DB(), userLimitsSvc)
	containerSvc := services.NewContainerService()
	if userLimitsSvc != nil {
		containerSvc.SetLimitsService(userLimitsSvc)
	}

	mux.Handle("GET /post/apps", postOnly(deps.Startup, deps.Sessions, postapps.Handler(deps.Sessions)))
	mux.Handle("GET /post/containers", postOnly(deps.Startup, deps.Sessions, postcontainers.Handler(deps.Sessions, containerSvc)))
	mux.Handle("POST /post/containers/create", postOnly(deps.Startup, deps.Sessions, postcontainers.CreateHandler(deps.Sessions, containerSvc)))
	mux.Handle("POST /post/containers/action", postOnly(deps.Startup, deps.Sessions, postcontainers.ActionHandler(deps.Sessions, containerSvc)))
	mux.Handle("GET /post/containers/logs", postOnly(deps.Startup, deps.Sessions, postcontainers.LogsHandler(deps.Sessions, containerSvc)))
	mux.Handle("GET /post/containers/dockerfile", postOnly(deps.Startup, deps.Sessions, postcontainers.DockerfileHandler(deps.Sessions, containerSvc)))
	mux.Handle("PUT /post/containers/dockerfile", postOnly(deps.Startup, deps.Sessions, postcontainers.DockerfileHandler(deps.Sessions, containerSvc)))
	mux.Handle("GET /post/containers/templates", postOnly(deps.Startup, deps.Sessions, postcontainers.TemplatesHandler(deps.Sessions, deps.Settings)))
	mux.Handle("PUT /post/containers/templates", postOnly(deps.Startup, deps.Sessions, postcontainers.TemplatesHandler(deps.Sessions, deps.Settings)))
	mux.Handle("POST /post/containers/templates/reset", postOnly(deps.Startup, deps.Sessions, postcontainers.ResetTemplatesHandler(deps.Sessions, deps.Settings)))
	if cronTaskSvc != nil {
		mux.Handle("GET /post/tasking", postOnly(deps.Startup, deps.Sessions, posttasking.Handler(deps.Sessions, cronTaskSvc)))
		mux.Handle("GET /post/tasking/list", postOnly(deps.Startup, deps.Sessions, posttasking.Handler(deps.Sessions, cronTaskSvc)))
		mux.Handle("POST /post/tasking", postOnly(deps.Startup, deps.Sessions, posttasking.Handler(deps.Sessions, cronTaskSvc)))
		mux.Handle("POST /post/tasking/create", postOnly(deps.Startup, deps.Sessions, posttasking.Handler(deps.Sessions, cronTaskSvc)))
		mux.Handle("POST /post/tasking/update", postOnly(deps.Startup, deps.Sessions, posttasking.UpdateHandler(deps.Sessions, cronTaskSvc)))
		mux.Handle("POST /post/tasking/toggle", postOnly(deps.Startup, deps.Sessions, posttasking.ToggleHandler(deps.Sessions, cronTaskSvc)))
		mux.Handle("POST /post/tasking/delete", postOnly(deps.Startup, deps.Sessions, posttasking.DeleteHandler(deps.Sessions, cronTaskSvc)))
		mux.Handle("POST /post/tasking/run", postOnly(deps.Startup, deps.Sessions, posttasking.RunHandler(deps.Sessions, cronTaskSvc)))
	}
	if userLimitsSvc != nil {
		mux.Handle("GET /post/user/limits", postOnly(deps.Startup, deps.Sessions, postlimits.Handler(deps.Sessions, userLimitsSvc)))
		mux.Handle("POST /post/user/limits", postOnly(deps.Startup, deps.Sessions, postlimits.Handler(deps.Sessions, userLimitsSvc)))
	}
	mux.Handle("POST /post/apps", postOnly(deps.Startup, deps.Sessions, postapps.Handler(deps.Sessions)))
	mux.Handle("GET /post/apps/config", postOnly(deps.Startup, deps.Sessions, appconfig.Handler(deps.Sessions, services.NewAppConfigService())))
	mux.Handle("PUT /post/apps/config", postOnly(deps.Startup, deps.Sessions, appconfig.Handler(deps.Sessions, services.NewAppConfigService())))
	mux.Handle("GET /post/apis", postOnly(deps.Startup, deps.Sessions, postapis.Handler(deps.Sessions, deps.Settings)))
	mux.Handle("POST /post/apis", postOnly(deps.Startup, deps.Sessions, postapis.Handler(deps.Sessions, deps.Settings)))
	mux.Handle("PATCH /post/apis", postOnly(deps.Startup, deps.Sessions, postapis.Handler(deps.Sessions, deps.Settings)))
	mux.Handle("DELETE /post/apis", postOnly(deps.Startup, deps.Sessions, postapis.Handler(deps.Sessions, deps.Settings)))
	mux.Handle("GET /post/settings", postOnly(deps.Startup, deps.Sessions, settingsroute.Handler(deps.Sessions, deps.Settings)))
	mux.Handle("PUT /post/settings", postOnly(deps.Startup, deps.Sessions, settingsroute.Handler(deps.Sessions, deps.Settings)))
	vhostHandler := postvhost.Handler(deps.Sessions, services.NewVHostService())
	mux.Handle("GET /post/vhost", postOnly(deps.Startup, deps.Sessions, vhostHandler))
	mux.Handle("GET /post/vhost/", postOnly(deps.Startup, deps.Sessions, vhostHandler))
	mux.Handle("POST /post/vhost", postOnly(deps.Startup, deps.Sessions, vhostHandler))
	mux.Handle("POST /post/vhost/", postOnly(deps.Startup, deps.Sessions, vhostHandler))
	mux.Handle("PUT /post/vhost/", postOnly(deps.Startup, deps.Sessions, vhostHandler))
	mux.Handle("DELETE /post/vhost/", postOnly(deps.Startup, deps.Sessions, vhostHandler))
	mux.Handle("GET /post/terminal", postOnly(deps.Startup, deps.Sessions, terminal.Handler(deps.Sessions, deps.Startup, true)))
	mux.Handle("GET /post/backup", postOnly(deps.Startup, deps.Sessions, postbackup.Handler(deps.Sessions, services.NewBackupService())))
	mux.Handle("POST /post/backup", postOnly(deps.Startup, deps.Sessions, postbackup.Handler(deps.Sessions, services.NewBackupService())))
	mux.Handle("DELETE /post/backup", postOnly(deps.Startup, deps.Sessions, postbackup.Handler(deps.Sessions, services.NewBackupService())))
	mux.Handle("POST /post/backup/restore", postOnly(deps.Startup, deps.Sessions, postbackup.RestoreHandler(deps.Sessions, services.NewBackupService())))
	if backupStorageSvc, err := services.NewBackupStorageService(deps.Settings.DB()); err == nil {
		mux.Handle("GET /post/backup/storage", postOnly(deps.Startup, deps.Sessions, postbackup.StorageHandler(deps.Sessions, backupStorageSvc)))
		mux.Handle("POST /post/backup/storage", postOnly(deps.Startup, deps.Sessions, postbackup.StorageHandler(deps.Sessions, backupStorageSvc)))
		mux.Handle("DELETE /post/backup/storage", postOnly(deps.Startup, deps.Sessions, postbackup.StorageHandler(deps.Sessions, backupStorageSvc)))
	}
}

func authenticatedSystemHandler(sessions *services.SessionService, system *services.SystemService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := sessions.GetRootSession(r); !ok {
			http.Error(w, "session invalid", http.StatusUnauthorized)
			return
		}
		status, err := system.Status()
		if err != nil {
			http.Error(w, "system information unavailable", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(status); err != nil {
			http.Error(w, "system information unavailable", http.StatusInternalServerError)
		}
	})
}

func postOnly(startup services.StartupConfig, sessions *services.SessionService, next http.Handler) http.Handler {
	return sameDomainOrLocalhostOnly(rootOnly(startup, rootSessionOnly(sessions, next)))
}

func rootSessionOnly(sessions *services.SessionService, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodOptions:
			next.ServeHTTP(w, r)
			return
		case r.URL.Path == "/post/login", r.URL.Path == "/post/user/login", r.URL.Path == "/post/ping", r.URL.Path == "/post/vhost/create", r.URL.Path == "/post/vhost/create/":
			next.ServeHTTP(w, r)
			return
		}

		if _, ok := sessions.GetRootSession(r); !ok {
			http.Error(w, "session invalid", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func rootOnly(startup services.StartupConfig, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !startup.IsRoot {
			http.Error(w, "root process required", http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func sameDomainOrLocalhostOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		source := requestSource(r)
		if !isAllowedPostSource(r, source) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		if source != "" {
			w.Header().Set("Access-Control-Allow-Origin", source)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Add("Vary", "Origin")
		}

		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		next.ServeHTTP(w, r)
	})
}

func requestSource(r *http.Request) string {
	if origin := r.Header.Get("Origin"); origin != "" {
		return origin
	}

	if referer := r.Header.Get("Referer"); referer != "" {
		return referer
	}

	return ""
}

func isAllowedPostSource(r *http.Request, source string) bool {
	if source == "" {
		return isLocalhost(remoteHost(r.RemoteAddr))
	}

	parsed, err := url.Parse(source)
	if err != nil || parsed.Host == "" {
		return false
	}

	sourceHost := strings.ToLower(parsed.Hostname())
	requestHost := strings.ToLower(hostname(r.Host))

	return sourceHost == requestHost || isLocalhost(sourceHost)
}

func hostname(host string) string {
	if parsedHost, _, err := net.SplitHostPort(host); err == nil {
		return strings.Trim(parsedHost, "[]")
	}

	return strings.Trim(host, "[]")
}

func remoteHost(remoteAddr string) string {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		return hostname(remoteAddr)
	}

	return strings.ToLower(host)
}

func isLocalhost(host string) bool {
	switch strings.ToLower(strings.Trim(host, "[]")) {
	case "localhost", "127.0.0.1", "::1":
		return true
	default:
		return false
	}
}

func noContent(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNoContent)
}
