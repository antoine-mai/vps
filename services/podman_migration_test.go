package services

import (
	"errors"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

func migrationSettings(t *testing.T) *SettingsService {
	t.Helper()
	t.Setenv(settingsDBEnv, filepath.Join(t.TempDir(), "settings.sqlite"))
	settings, err := NewSettingsService()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { settings.db.Close() })
	return settings
}
func waitMigration(t *testing.T, m *PodmanMigration) PodmanSetupStatus {
	t.Helper()
	limit := time.Now().Add(3 * time.Second)
	for time.Now().Before(limit) {
		s := m.Status()
		if s.State != "running" {
			return s
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("migration did not finish")
	return PodmanSetupStatus{}
}
func TestPodmanMigrationRunsOnceAndSerializesRetry(t *testing.T) {
	settings := migrationSettings(t)
	var calls atomic.Int32
	release := make(chan struct{})
	migration := NewPodmanMigration(settings)
	migration.setup = func() error { calls.Add(1); <-release; return nil }
	if !migration.Start(false) {
		t.Fatal("initial setup did not start")
	}
	if migration.Start(true) {
		t.Fatal("overlapping setup was accepted")
	}
	close(release)
	if s := waitMigration(t, migration); s.State != "done" {
		t.Fatal(s)
	}
	restored := NewPodmanMigration(settings)
	restored.setup = func() error { t.Error("completed migration reran on restart"); return nil }
	if restored.Start(false) {
		t.Fatal("receipt ignored")
	}
	if calls.Load() != 1 {
		t.Fatalf("setup ran %d times", calls.Load())
	}
}
func TestPodmanMigrationFailureIsVisibleAndRetriesAfterRestart(t *testing.T) {
	settings := migrationSettings(t)
	settings.Set(podmanMigrationKey, "done")
	migration := NewPodmanMigration(settings)
	migration.setup = func() error { return errors.New("linger failed") }
	migration.Start(true)
	if s := waitMigration(t, migration); s.State != "failed" || s.Error == "" {
		t.Fatal(s)
	}
	if settings.Get(podmanMigrationKey, "") == "done" {
		t.Fatal("failure retained success receipt")
	}
	retry := NewPodmanMigration(settings)
	retry.setup = func() error { return nil }
	if !retry.Start(false) {
		t.Fatal("failed migration was not retried")
	}
	if s := waitMigration(t, retry); s.State != "done" {
		t.Fatal(s)
	}
}
