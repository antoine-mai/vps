# TASK SPECIFICATION FOR SHELL SCRIPT AUTOMATION

## Goal
Implement or update a Bash setup script for an automated VPS management platform. The script must configure a multi-tenant Linux environment running Rootless Podman and GitHub Actions Self-Hosted Runners (or deployment agents) without permission issues, runtime environment leaks, or premature process termination.

## System Context & Failure Analysis
- **Root Cause of `/run/user/0/libpod: permission denied`:**
  - Non-login shells, subshells, runner systemd units, or improper user-switching (`su <user>` without `-l`) inherit or fall back to `XDG_RUNTIME_DIR=/run/user/0`.
- **Root Cause of container crashes after 1–2 days:**
  - `systemd-logind` cleans up user runtime directories (`/run/user/<UID>`) and terminates user cgroups when user sessions close, killing `conmon` and active rootless containers.
  - Podman falls back to `cgroupfs` when the user's `systemd` session bus (`user@<UID>.service`) is inactive.

---

## Technical Requirements to Implement

The script must provide two modular, idempotent functions:
1. `init_global_podman_host()`: Executed once during VPS provisioning (as `root`).
2. `provision_podman_user(username)`: Executed whenever a new tenant/user is onboarded (as `root`).

---

### Module 1: `init_global_podman_host()`

Execute with `root` privileges. Must be strictly idempotent.

1. **System-wide Podman Engine Configuration:**
   - Path: `/etc/containers/containers.conf`
   - Requirements:
     - Set `cgroup_manager = "systemd"` under `[engine]`.
     - Set `events_logger = "file"` under `[engine]`.

2. **Global Environment Auto-Discovery:**
   - Path: `/etc/profile.d/podman_rootless.sh`
   - File mode: `0755`
   - Logic:
     - Check if current EUID >= 1000.
     - If true, export:
       - `XDG_RUNTIME_DIR="/run/user/$(id -u)"`
       - `DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"`

3. **Dirty Environment Sanitization (Anti-Leak Guard):**
   - Path: `/etc/bashrc`
   - Logic:
     - Append a safeguard block checking if `EUID != 0` AND `XDG_RUNTIME_DIR == "/run/user/0"`.
     - If triggered, overwrite `XDG_RUNTIME_DIR="/run/user/$EUID"` and `DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$EUID/bus"`.

4. **Skeleton Template Synchronization:**
   - Path: `/etc/skel/.bashrc`
   - Append:
     - `export XDG_RUNTIME_DIR="/run/user/$(id -u)"`
     - `export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"`

5. **SubUID/SubGID Range Verification:**
   - Ensure `/etc/login.defs` specifies standard sub-allocation defaults:
     - `SUB_UID_MIN 100000`, `SUB_UID_COUNT 65536`
     - `SUB_GID_MIN 100000`, `SUB_GID_COUNT 65536`

---

### Module 2: `provision_podman_user(username)`

Takes exactly one parameter: `username`. Executed as `root`.

1. **User Existence & SubUID/SubGID Range:**
   - If user does not exist, create using: `useradd -m -s /bin/bash "$username"`.
   - Verify entry exists in `/etc/subuid` and `/etc/subgid`. If absent, run:
     `usermod --add-subuids 100000-165535 --add-subgids 100000-165535 "$username"` (auto-calculate next available range if needed).

2. **Persistent Runtime Session (Linger):**
   - Execute: `loginctl enable-linger "$username"`
   - Assert: Verify `loginctl show-user "$username" -p Linger --value` equals `yes`.

3. **Daemonize User Systemd Manager:**
   - Resolve `USER_UID=$(id -u "$username")`.
   - Execute:
     - `systemctl start "user@${USER_UID}.service"`
     - `systemctl enable "user@${USER_UID}.service"`

4. **Runner Environment Injection (Conditional):**
   - If an actions-runner path exists (e.g., `/home/$username/actions-runner/.env`), ensure the following lines exist:
     - `XDG_RUNTIME_DIR=/run/user/<USER_UID>`
     - `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/<USER_UID>/bus`

5. **Runtime Cleanliness & Verification:**
   - Run storage/lock sanitation:
     - `su -l "$username" -c "podman system renumber"`
   - Health check command:
     - `su -l "$username" -c "podman info --format '{{.Host.CgroupManager}} - {{.Store.RunRoot}}'"`
   - Validation criteria:
     - Output must match regex: `^systemd - /run/user/[0-9]+/containers$`
     - Exit status must be `0`.

---

## Coding Standards for Output Script
- Shell: `#!/usr/bin/env bash`
- Safety directives: `set -euo pipefail`
- Idempotency: All file writes must avoid duplicating existing configuration lines (use `grep -q` checks before appending).
- Logging: Provide clean structured output: `[INFO]`, `[SUCCESS]`, `[ERROR]`.
