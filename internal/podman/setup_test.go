package podman

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestSetupIsIsolatedIdempotentAndEnablesUserBoot(t *testing.T) {
	root := t.TempDir()
	bin := filepath.Join(root, "bin")
	for _, dir := range []string{bin, filepath.Join(root, "etc"), filepath.Join(root, "home/alice"), filepath.Join(root, "home/bob"), filepath.Join(root, "srv/users/carol")} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatal(err)
		}
	}
	os.WriteFile(filepath.Join(root, "etc/passwd"), []byte("root:x:0:0::/root:/bin/bash\nalice:x:1001:1001::/home/alice:/bin/bash\nbob:x:1002:1002::/home/bob:/bin/bash\ncarol:x:1003:1003::/srv/users/carol:/bin/bash\n"), 0644)
	mocks := map[string]string{
		"id":        "echo 0",
		"podman":    "exit 0",
		"getent":    "if [ $# -eq 1 ]; then cat \"$MTHAN_PODMAN_SETUP_ROOT/etc/passwd\"; else awk -F: -v u=\"$2\" '$1==u' \"$MTHAN_PODMAN_SETUP_ROOT/etc/passwd\"; fi",
		"systemctl": "printf 'systemctl %s\\n' \"$*\" >> \"$MTHAN_PODMAN_SETUP_ROOT/calls\"",
		"runuser":   "printf 'runuser %s\\n' \"$*\" >> \"$MTHAN_PODMAN_SETUP_ROOT/calls\"",
		"loginctl":  "printf 'loginctl %s\\n' \"$*\" >> \"$MTHAN_PODMAN_SETUP_ROOT/calls\"; if [ \"$1\" = show-user ]; then if [ -e \"$MTHAN_PODMAN_SETUP_ROOT/fail-linger\" ]; then echo no; else echo yes; fi; fi",
		"usermod":   "file=subuid; [ \"$1\" = --add-subgids ] && file=subgid; start=${2%-*}; end=${2#*-}; printf '%s:%s:%s\\n' \"$3\" \"$start\" \"$((end-start+1))\" >> \"$MTHAN_PODMAN_SETUP_ROOT/etc/$file\"",
	}
	for name, source := range mocks {
		if err := os.WriteFile(filepath.Join(bin, name), []byte("#!/bin/sh\n"+source+"\n"), 0755); err != nil {
			t.Fatal(err)
		}
	}
	run := func(args ...string) ([]byte, error) {
		cmd := exec.Command("bash", append([]string{"-s", "--"}, args...)...)
		cmd.Stdin = strings.NewReader(setupScript)
		cmd.Env = append(os.Environ(), "PATH="+bin+":/usr/bin:/bin", "MTHAN_PODMAN_SETUP_ROOT="+root)
		return cmd.CombinedOutput()
	}
	for i := 0; i < 2; i++ {
		if out, err := run("host"); err != nil {
			t.Fatalf("setup: %s: %v", out, err)
		}
	}
	for _, file := range []string{"subuid", "subgid"} {
		data, _ := os.ReadFile(filepath.Join(root, "etc", file))
		if string(data) != "alice:100000:65536\nbob:165536:65536\ncarol:231072:65536\n" {
			t.Fatalf("%s ranges duplicated/overlap: %s", file, data)
		}
	}
	calls, _ := os.ReadFile(filepath.Join(root, "calls"))
	for _, want := range []string{"loginctl enable-linger alice", "systemctl start user@1001.service", "loginctl enable-linger bob", "loginctl enable-linger carol", "systemctl --user enable podman-restart.service", "XDG_RUNTIME_DIR=/run/user/1002", "DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus"} {
		if !strings.Contains(string(calls), want) {
			t.Errorf("missing %q in %s", want, calls)
		}
	}
	for _, scope := range []string{"system", "user"} {
		unit, err := os.ReadFile(filepath.Join(root, "etc/systemd", scope, "podman-restart.service"))
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(unit), "restart-policy=always") {
			t.Fatal("restart policy missing")
		}
	}
	vendorDir := filepath.Join(root, "usr/lib/systemd/system")
	os.MkdirAll(vendorDir, 0755)
	vendor := []byte("[Unit]\nDescription=Distribution Podman restart\n")
	os.WriteFile(filepath.Join(vendorDir, "podman-restart.service"), vendor, 0644)
	if out, err := run("host"); err != nil {
		t.Fatalf("vendor setup: %s: %v", out, err)
	}
	if _, err := os.Stat(filepath.Join(root, "etc/systemd/system/podman-restart.service")); !os.IsNotExist(err) {
		t.Fatal("managed fallback hides the vendor unit")
	}
	os.WriteFile(filepath.Join(root, "fail-linger"), []byte("fail"), 0644)
	if out, err := run("user", "alice"); err == nil || !strings.Contains(string(out), "Linger was not enabled") {
		t.Fatalf("linger failure was hidden: %v %s", err, out)
	}
}
