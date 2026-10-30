package services

import (
	"reflect"
	"testing"
)

func TestParseRootPodmanContainers(t *testing.T) {
	output := []byte(`[{
        "Id":"root123",
        "Names":["caddy-proxy"],
        "Image":"docker.io/library/caddy:latest",
        "Command":["caddy","run"],
        "State":"running",
        "Status":"Up 1 hour",
        "CreatedAt":1753000000,
        "Ports":[{"host_ip":"0.0.0.0","host_port":80,"container_port":80,"protocol":"tcp"}]
    }]`)
	containers := parsePodmanContainers(output, "root")
	if len(containers) != 1 {
		t.Fatalf("got %d containers, want 1", len(containers))
	}
	got := containers[0]
	if got.Engine != "podman" || got.Owner != "root" || got.Name != "caddy-proxy" || got.State != "running" {
		t.Fatalf("unexpected container: %#v", got)
	}
	if !reflect.DeepEqual(got.Ports, []string{"0.0.0.0:80->80/tcp"}) {
		t.Fatalf("unexpected ports: %#v", got.Ports)
	}
}

func TestParsePodmanContainers(t *testing.T) {
	output := []byte(`[{
        "Id":"def456",
        "Names":["api"],
        "Image":"docker.io/library/node:22",
        "Command":["node","server.js"],
        "State":"running",
        "Status":"Up 5 minutes",
        "CreatedAt":1753005600,
        "Ports":[{"host_ip":"127.0.0.1","host_port":3000,"container_port":3000,"protocol":"tcp"}]
    }]`)
	containers := parsePodmanContainers(output, "alice")
	if len(containers) != 1 {
		t.Fatalf("got %d containers, want 1", len(containers))
	}
	got := containers[0]
	if got.Engine != "podman" || got.Owner != "alice" || got.Name != "api" || got.Command != "node server.js" {
		t.Fatalf("unexpected container: %#v", got)
	}
	if !reflect.DeepEqual(got.Ports, []string{"127.0.0.1:3000->3000/tcp"}) {
		t.Fatalf("unexpected ports: %#v", got.Ports)
	}
}

func TestContainerActionArgs(t *testing.T) {
	for _, action := range []string{"start", "stop", "restart"} {
		args, err := containerActionArgs("c123", action)
		if err != nil || len(args) != 2 || args[0] != action || args[1] != "c123" {
			t.Fatalf("unexpected args for %s: %v, %v", action, args, err)
		}
	}
	args, err := containerActionArgs("c123", "rm")
	if err != nil || len(args) != 3 || args[0] != "rm" || args[1] != "-f" || args[2] != "c123" {
		t.Fatalf("unexpected args for rm: %v, %v", args, err)
	}
	if _, err := containerActionArgs("c123", "invalid"); err == nil {
		t.Fatal("expected error for invalid action")
	}
}

func TestBuildCreateContainerArgs(t *testing.T) {
	input := CreateContainerInput{
		Name:          "my-nginx",
		Image:         "nginx:alpine",
		RestartPolicy: "unless-stopped",
		Ports:         []string{"8080:80"},
		Volumes:       []string{"/home/user/html:/usr/share/nginx/html:ro"},
		Env:           map[string]string{"ENV_VAR": "production"},
		Command:       "nginx -g 'daemon off;'",
	}
	args, err := buildCreateContainerArgs(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expectedPrefix := []string{"run", "-d", "--name", "my-nginx", "--restart", "unless-stopped", "-p", "8080:80", "-v", "/home/user/html:/usr/share/nginx/html:ro", "-e", "ENV_VAR=production", "nginx:alpine"}
	if len(args) < len(expectedPrefix) {
		t.Fatalf("expected at least %d args, got %d: %v", len(expectedPrefix), len(args), args)
	}

	// Test missing image
	if _, err := buildCreateContainerArgs(CreateContainerInput{}); err == nil {
		t.Fatal("expected error for empty image")
	}

	// Test invalid container name (spaces, uppercase, special chars)
	if _, err := buildCreateContainerArgs(CreateContainerInput{Image: "alpine", Name: "invalid name with space"}); err == nil {
		t.Fatal("expected error for invalid container name with spaces")
	}
	if _, err := buildCreateContainerArgs(CreateContainerInput{Image: "alpine", Name: "My-App"}); err == nil {
		t.Fatal("expected error for uppercase container name")
	}
	if _, err := buildCreateContainerArgs(CreateContainerInput{Image: "alpine", Name: "app.name"}); err == nil {
		t.Fatal("expected error for dot in container name")
	}
}

