package services

import (
	"errors"
	"fmt"
	"mthan/vps/internal/podman"
	"os"
	"os/exec"
	"strings"
)

var appPackages = map[string]map[string][][]string{
	"apt-get": {
		"caddy":  {{"caddy"}},
		"podman": {{"podman", "uidmap", "slirp4netns", "fuse-overlayfs", "crun"}},
		"rclone": {{"rclone"}},
	},
	"dnf": {
		"caddy":  {{"caddy"}},
		"podman": {{"podman", "shadow-utils", "slirp4netns", "fuse-overlayfs", "crun"}},
		"rclone": {{"rclone"}},
	},
	"yum": {
		"caddy":  {{"caddy"}},
		"podman": {{"podman", "shadow-utils", "slirp4netns", "fuse-overlayfs", "crun"}},
		"rclone": {{"rclone"}},
	},
	"pacman": {
		"caddy":  {{"caddy"}},
		"podman": {{"podman", "shadow", "slirp4netns", "fuse-overlayfs", "crun"}},
		"rclone": {{"rclone"}},
	},
}

func InstallApp(name string) error {
	manager := packageManager()
	if manager == "" {
		return errors.New("no supported package manager found")
	}
	options := appPackages[manager][name]
	if len(options) == 0 {
		return errors.New("unsupported app")
	}
	if manager == "apt-get" {
		cmd := exec.Command(manager, "update")
		cmd.Env = append(os.Environ(), "DEBIAN_FRONTEND=noninteractive")
		if output, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("package index update failed: %s", conciseCommandOutput(output))
		}
	}
	var lastOutput []byte
	for _, packages := range options {
		args := installArguments(manager, packages)
		cmd := exec.Command(manager, args...)
		cmd.Env = append(os.Environ(), "DEBIAN_FRONTEND=noninteractive")
		output, err := cmd.CombinedOutput()
		if err == nil {
			if name == "podman" {
				return podman.SetupHost()
			}
			if name == "caddy" {
				_ = EnsureCaddyMThanUsers()
			}

			return nil
		}
		lastOutput = output
	}
	return fmt.Errorf("app installation failed: %s", conciseCommandOutput(lastOutput))
}

func packageManager() string {
	for _, manager := range []string{"apt-get", "dnf", "yum", "pacman"} {
		if _, err := exec.LookPath(manager); err == nil {
			return manager
		}
	}
	return ""
}

func installArguments(manager string, packages []string) []string {
	if manager == "pacman" {
		return append([]string{"-Sy", "--noconfirm", "--needed"}, packages...)
	}
	return append([]string{"install", "-y"}, packages...)
}

func conciseCommandOutput(output []byte) string {
	value := strings.TrimSpace(string(output))
	if len(value) > 1000 {
		value = value[len(value)-1000:]
	}
	if value == "" {
		return "package manager returned an error"
	}
	return value
}
