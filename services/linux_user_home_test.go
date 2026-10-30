package services

import (
	"os"
	"path/filepath"
	"testing"
)

func TestProvisionUserHomeCreatesDefaultDirectories(t *testing.T) {
	home := filepath.Join(t.TempDir(), "user-test")
	if err := ProvisionUserHome(home, os.Getuid(), os.Getgid()); err != nil {
		t.Fatalf("ProvisionUserHome() error = %v", err)
	}

	homeInfo, err := os.Stat(home)
	if err != nil {
		t.Fatalf("stat home error: %v", err)
	}
	if homeInfo.Mode().Perm() != 0711 {
		t.Fatalf("home mode = %o, want 0711", homeInfo.Mode().Perm())
	}

	for _, name := range DefaultUserDirectories {
		info, err := os.Stat(filepath.Join(home, name))
		if err != nil {
			t.Fatalf("expected %s directory: %v", name, err)
		}
		if !info.IsDir() {
			t.Fatalf("expected %s to be a directory", name)
		}
		if info.Mode().Perm() != 0755 {
			t.Fatalf("expected %s mode 0755, got %o", name, info.Mode().Perm())
		}
	}

	confPath := filepath.Join(home, ".config", "containers", "containers.conf")
	confInfo, err := os.Stat(confPath)
	if err != nil {
		t.Fatalf("expected containers.conf: %v", err)
	}
	if !confInfo.Mode().IsRegular() {
		t.Fatalf("expected containers.conf to be a regular file")
	}
	if confInfo.Mode().Perm() != 0644 {
		t.Fatalf("expected containers.conf mode 0644, got %o", confInfo.Mode().Perm())
	}
	content, err := os.ReadFile(confPath)
	if err != nil {
		t.Fatalf("read containers.conf error: %v", err)
	}
	if string(content) != DefaultUserContainersConfig {
		t.Fatalf("unexpected containers.conf content: %s", string(content))
	}
}

func TestProvisionUserContainersConfigPreservesCustomSettings(t *testing.T) {
	home := t.TempDir()
	if err := ProvisionUserContainersConfig(home, os.Getuid(), os.Getgid()); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(home, ".config", "containers", "containers.conf")
	custom := []byte(`[engine]
cgroup_manager = "systemd"
events_logger = "journald"
`)
	if err := os.WriteFile(path, custom, 0644); err != nil {
		t.Fatal(err)
	}
	if err := ProvisionUserContainersConfig(home, os.Getuid(), os.Getgid()); err != nil {
		t.Fatal(err)
	}
	got, _ := os.ReadFile(path)
	if string(got) != string(custom) {
		t.Fatal("custom Podman settings overwritten")
	}
}
