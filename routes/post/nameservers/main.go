package nameservers

import (
	"encoding/json"
	"mthan/vps/services"
	"net/http"
)

func Handler(sessions *services.SessionService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := sessions.GetRootSession(r); !ok {
			http.Error(w, "session invalid", http.StatusUnauthorized)
			return
		}
		svc := services.NewNameserverService()
		var result services.NameserverSettings
		var err error
		if r.Method == http.MethodGet {
			result, err = svc.Read()
		} else {
			var input struct {
				Nameservers      []services.Nameserver `json:"nameservers"`
				ExpectedRevision uint64                `json:"expectedRevision"`
			}
			if json.NewDecoder(http.MaxBytesReader(w, r.Body, 32768)).Decode(&input) != nil {
				http.Error(w, "invalid nameserver settings", http.StatusBadRequest)
				return
			}
			result, err = svc.Apply(input.Nameservers, input.ExpectedRevision)
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	})
}
