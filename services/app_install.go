package services

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

var appPackages = map[string]map[string][][]string{
	"apt-get": {
		"bind9":  {{"bind9", "bind9utils"}},
		"caddy":  {{"caddy"}},
		"docker": {{"docker.io"}, {"docker-ce"}},
		"podman": {{"podman"}},
		"rclone": {{"rclone"}},
	},
	"dnf": {
		"bind9":  {{"bind", "bind-utils"}},
		"caddy":  {{"caddy"}},
		"docker": {{"docker-ce"}, {"moby-engine"}, {"docker"}},
		"podman": {{"podman"}},
		"rclone": {{"rclone"}},
	},
	"yum": {
		"bind9":  {{"bind", "bind-utils"}},
		"caddy":  {{"caddy"}},
		"docker": {{"docker"}, {"docker-ce"}},
		"podman": {{"podman"}},
		"rclone": {{"rclone"}},
	},
	"pacman": {
		"bind9":  {{"bind"}},
		"caddy":  {{"caddy"}},
		"docker": {{"docker"}},
		"podman": {{"podman"}},
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
			if name == "caddy" {
				_ = EnsureCaddyMThanUsers()
			}
			if name == "bind9" {
				_ = exec.Command("systemctl", "enable", "--now", "named.service").Run()
				_ = exec.Command("systemctl", "enable", "--now", "bind9.service").Run()
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
