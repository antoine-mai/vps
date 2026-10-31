package podman

import (
	"context"
	_ "embed"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

//go:embed setup.sh
var setupScript string

func SetupHost() error                { return runSetup("host") }
func SetupUser(username string) error { return runSetup("user", username) }
func runSetup(args ...string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, "bash", append([]string{"-s", "--"}, args...)...)
	cmd.Stdin = strings.NewReader(setupScript)
	for _, item := range os.Environ() {
		if !strings.HasPrefix(item, "MTHAN_PODMAN_SETUP_ROOT=") {
			cmd.Env = append(cmd.Env, item)
		}
	}
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("Podman setup failed: %w: %s", err, strings.TrimSpace(string(output)))
	}
	return nil
}
