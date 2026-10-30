package services

import (
	"os"
	"os/user"
	"strings"
	"testing"
)

func TestDockerEngineIsRejectedBeforeAnyCommand(t *testing.T) {
	svc := NewContainerService()
	if err := svc.ActionAll("docker", "root", "abc", "start"); err == nil {
		t.Fatal("Docker engine accepted")
	}
	if _, err := svc.LogsAll("docker", "root", "abc"); err == nil {
		t.Fatal("Docker logs accepted")
	}
	if _, err := svc.DockerfileAll("docker", "root", "abc"); err == nil {
		t.Fatal("Docker inspect accepted")
	}
}
func TestPodmanOwnerEnvironmentDoesNotInheritOtherAccounts(t *testing.T) {
	current, err := user.Current()
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("CONTAINER_HOST", "unix:///root/other.sock")
	t.Setenv("XDG_RUNTIME_DIR", "/run/user/0")
	name, args, err := podmanOwnerCommand(current.Username, "ps")
	if err != nil {
		if os.Geteuid() != 0 {
			t.Skip("current account is outside /home")
		}
		t.Fatal(err)
	}
	if name != "env" || args[0] != "-i" {
		t.Fatalf("environment not sanitized: %s %v", name, args)
	}
	command := strings.Join(args, " ")
	if strings.Contains(command, "CONTAINER_HOST=") || !strings.HasSuffix(command, "podman ps") {
		t.Fatalf("wrong environment: %v", args)
	}
	if os.Geteuid() != 0 {
		if _, _, err := podmanOwnerCommand("root", "ps"); err == nil {
			t.Fatal("non-root user can target root store")
		}
	}
}
func TestNewContainersRestartAfterRebootByDefault(t *testing.T) {
	args, err := buildCreateContainerArgs(CreateContainerInput{Name: "test", Image: "alpine"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(strings.Join(args, " "), "--restart always") {
		t.Fatalf("missing boot restart policy: %v", args)
	}
}
