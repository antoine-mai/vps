package services

import (
	"context"
	"errors"
	"os/exec"
	"regexp"
	"time"
)

type AppStatus struct {
	Name       string   `json:"name"`
	Installed  bool     `json:"installed"`
	Manageable bool     `json:"manageable"`
	Running    bool     `json:"running"`
	Service    string   `json:"serviceName,omitempty"`
	Version    string   `json:"version"`
	Versions   []string `json:"versions,omitempty"`
}

type appDefinition struct {
	name        string
	binaries    []string
	services    []string
	versionArgs []string
}

var knownApps = []appDefinition{
	{name: "bind9", binaries: []string{"named", "/usr/sbin/named", "/usr/bin/named"}, services: []string{"named.service", "bind9.service"}, versionArgs: []string{"-v"}},
	{name: "caddy", binaries: []string{"caddy", "/usr/bin/caddy", "/usr/local/bin/caddy"}, services: []string{"caddy.service"}, versionArgs: []string{"version"}},
	{name: "docker", binaries: []string{"docker", "/usr/bin/docker"}, services: []string{"docker.service", "docker.socket"}, versionArgs: []string{"--version"}},
	{name: "podman", binaries: []string{"podman", "/usr/bin/podman", "/usr/local/bin/podman"}, versionArgs: []string{"--version"}},
	{name: "rclone", binaries: []string{"rclone", "/usr/bin/rclone", "/usr/local/bin/rclone"}, versionArgs: []string{"version"}},
}

var semanticVersionPattern = regexp.MustCompile(`\d+(?:\.\d+){1,3}`)

func DetectApps() []AppStatus {
	statuses := make([]AppStatus, 0, len(knownApps))
	for _, app := range knownApps {
		installed := hasBinary(app.binaries)
		version := ""
		if installed {
			version = detectedAppVersion(app.binaries, app.versionArgs)
		}

		service := ""
		if len(app.services) > 0 {
			service = app.services[0]
		}
		running := false
		if installed {
			service, running = serviceStatus(app.services)
		}

		statuses = append(statuses, AppStatus{
			Name:       app.name,
			Installed:  installed,
			Manageable: len(app.services) > 0,
			Running:    running,
			Service:    service,
			Version:    version,
		})
	}
	return statuses
}

func detectedAppVersion(binaries, args []string) string {
	for _, name := range binaries {
		binary, err := exec.LookPath(name)
		if err != nil {
			continue
		}
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		output, _ := exec.CommandContext(ctx, binary, args...).CombinedOutput()
		cancel()
		if version := semanticVersionPattern.FindString(string(output)); version != "" {
			return version
		}
	}
	return ""
}

func hasBinary(names []string) bool {
	for _, name := range names {
		if _, err := exec.LookPath(name); err == nil {
			return true
		}
	}
	return false
}

func serviceStatus(names []string) (string, bool) {
	for _, name := range names {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		err := exec.CommandContext(ctx, "systemctl", "is-active", "--quiet", name).Run()
		cancel()
		if err == nil {
			return name, true
		}
	}
	if len(names) > 0 {
		return names[0], false
	}
	return "", false
}

func ControlService(name, action string) error {
	for _, app := range knownApps {
		if app.name == name {
			if len(app.services) == 0 {
				return errors.New("app has no manageable services")
			}
			svc, _ := serviceStatus(app.services)
			if svc == "" {
				svc = app.services[0]
			}
			switch action {
			case "start", "stop", "restart":
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				defer cancel()
				return exec.CommandContext(ctx, "systemctl", action, svc).Run()
			default:
				return errors.New("unsupported action")
			}
		}
	}
	return errors.New("unknown app")
}
