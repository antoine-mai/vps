package services

import (
	"fmt"
	"os/exec"
	"sync"

	"mthan/vps/internal/podman"
)

const podmanMigrationKey = "migration_podman_owners_v1"

type PodmanSetupStatus struct {
	State string `json:"state"`
	Error string `json:"error,omitempty"`
}
type PodmanMigration struct {
	mu       sync.Mutex
	settings *SettingsService
	status   PodmanSetupStatus
	setup    func() error
}

func NewPodmanMigration(settings *SettingsService) *PodmanMigration {
	return &PodmanMigration{settings: settings, status: PodmanSetupStatus{State: "pending"}, setup: func() error {
		for _, binary := range []string{"podman", "newuidmap", "newgidmap", "slirp4netns", "fuse-overlayfs", "crun"} {
			if _, err := exec.LookPath(binary); err != nil {
				return InstallApp("podman")
			}
		}
		return podman.SetupHost()
	}}
}
func (m *PodmanMigration) Status() PodmanSetupStatus {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.status
}
func (m *PodmanMigration) Start(force bool) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.status.State == "running" {
		return false
	}
	if !force && m.settings.Get(podmanMigrationKey, "") == "done" {
		m.status = PodmanSetupStatus{State: "done"}
		return false
	}
	if err := m.settings.Set(podmanMigrationKey, "pending"); err != nil {
		m.status = PodmanSetupStatus{State: "failed", Error: err.Error()}
		return false
	}
	m.status = PodmanSetupStatus{State: "running"}
	go m.run()
	return true
}
func (m *PodmanMigration) run() {
	err := m.setup()
	if err == nil {
		err = m.settings.Set(podmanMigrationKey, "done")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if err != nil {
		m.status = PodmanSetupStatus{State: "failed", Error: fmt.Sprintf("Podman user setup failed: %v", err)}
		return
	}
	m.status = PodmanSetupStatus{State: "done"}
}
