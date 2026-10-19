package vhost

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"mthan/vps/services"
)

func Handler(sessions *services.SessionService, vhosts *services.VHostService, postBaseURL ...string) http.Handler {
	baseURL := ""
	if len(postBaseURL) > 0 {
		baseURL = postBaseURL[0]
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		session, ok := sessions.GetUserSession(r)
		if !ok {
			http.Error(w, "session invalid", http.StatusUnauthorized)
			return
		}

		path := strings.TrimPrefix(r.URL.Path, "/api/vhost")
		switch path {
		case "", "/":
			if r.Method == http.MethodPost {
				handleCreateVHost(w, r, session, baseURL, vhosts)
				return
			}
			writeJSON(w, http.StatusOK, vhosts.Status())
		case "/list":
			writeJSON(w, http.StatusOK, map[string]any{"vhosts": vhosts.SummariesForOwner(session.Username)})
		case "/create":
			if r.Method != http.MethodPost {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				return
			}
			handleCreateVHost(w, r, session, baseURL, vhosts)
		case "/config":
			_ = services.CreateUserCaddyfile(session.Username)
			configPath := services.UserCaddyfilePath(session.Username)
			configs := services.NewAppConfigService()
			if r.Method == http.MethodGet {
				file, err := configs.Read("caddy", configPath)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				writeJSON(w, http.StatusOK, file)
				return
			}
			var input struct {
				Content string `json:"content"`
			}
			if json.NewDecoder(r.Body).Decode(&input) != nil {
				http.Error(w, "invalid request body", http.StatusBadRequest)
				return
			}
			file, err := configs.Write("caddy", configPath, input.Content)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			_ = vhosts.Reload()
			writeJSON(w, http.StatusOK, file)
			return
		default:
			hostname := strings.TrimPrefix(path, "/")
			if hostname == "" || strings.Contains(hostname, "/") {
				http.Error(w, "vhost not found", http.StatusNotFound)
				return
			}
			if r.Method == http.MethodDelete {
				err := vhosts.Delete(hostname, session.Username)
				if errors.Is(err, services.ErrVHostNotFound) {
					http.Error(w, "vhost not found", http.StatusNotFound)
					return
				}
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				w.WriteHeader(http.StatusNoContent)
				return
			}
			host, err := vhosts.Get(hostname)
			if errors.Is(err, services.ErrVHostNotFound) {
				http.Error(w, "vhost not found", http.StatusNotFound)
				return
			}
			if err != nil {
				http.Error(w, "vhost information unavailable", http.StatusInternalServerError)
				return
			}
			if !strings.EqualFold(host.Owner, session.Username) {
				http.Error(w, "vhost not found", http.StatusNotFound)
				return
			}
			writeJSON(w, http.StatusOK, host)
		}
	})
}

func handleCreateVHost(w http.ResponseWriter, r *http.Request, session services.Session, postBaseURL string, vhosts *services.VHostService) {
	var input services.CreateVHostInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	input.Owner = session.Username

	if strings.TrimSpace(postBaseURL) != "" {
		payload, err := json.Marshal(input)
		if err != nil {
			http.Error(w, "failed to marshal request", http.StatusInternalServerError)
			return
		}

		targetURL := strings.TrimRight(postBaseURL, "/") + "/post/vhost/create"
		req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, targetURL, bytes.NewReader(payload))
		if err != nil {
			http.Error(w, "failed to create request", http.StatusInternalServerError)
			return
		}
		req.Header.Set("Content-Type", "application/json")
		if session.Token != "" {
			req.AddCookie(&http.Cookie{
				Name:  services.UserSessionCookieName,
				Value: session.Token,
			})
		}

		client := &http.Client{Timeout: 15 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			http.Error(w, "post service unavailable", http.StatusServiceUnavailable)
			return
		}
		defer resp.Body.Close()

		respBody, err := io.ReadAll(resp.Body)
		if err != nil {
			http.Error(w, "failed to read post response", http.StatusInternalServerError)
			return
		}

		contentType := resp.Header.Get("Content-Type")
		if contentType == "" {
			contentType = "application/json"
		}
		w.Header().Set("Content-Type", contentType)
		w.WriteHeader(resp.StatusCode)
		_, _ = w.Write(respBody)
		return
	}

	if err := vhosts.CreateVHost(input); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":   "ok",
		"hostname": services.CleanHostname(input.Hostname),
	})
}

func writeJSON(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}
