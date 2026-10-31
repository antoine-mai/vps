# MThan VPS

Simple Go API with a React client.

## Structure

```text
.
├── client/       # React app
├── routes/       # HTTP route registration
│   ├── api/      # Public API routes
│   └── post/     # Root-only localhost/internal POST routes
├── scripts/      # Shell scripts
├── services/     # Business logic, router, and startup services
├── main.go       # Go entrypoint
└── go.mod
```

## Install service

```sh
curl -fsSL https://cdn.jsdelivr.net/gh/antoine-mai/mthan-tools-vps@main/public/install.sh | sudo bash
```

The installer must be run as `root`. It downloads `mthan-vps` and `mthanctl`, installs them to `/usr/local/bin`, creates the systemd service template, writes the root service environment file, and starts the root service.

The app verifies Linux user passwords against `/etc/shadow`, so the binary needs `libcrypt.so.1` at runtime. The installer checks for it and installs the matching package when possible:

```text
Debian/Ubuntu: libcrypt1
RHEL/Fedora/Amazon Linux: libxcrypt-compat
Arch Linux: libxcrypt-compat
Alpine: libxcrypt-compat
```

Default download source:

```text
https://cdn.jsdelivr.net/gh/antoine-mai/mthan-tools-vps@main/public/dist
```

Installed files:

```text
/usr/local/bin/mthan-vps
/usr/local/bin/mthanctl
/etc/systemd/system/mthan-vps@.service
/etc/mthan-vps/root.env
```

Installed service:

```text
mthan-vps@root.service  public root panel and root helper, APP_ADDR=:2205
```

After installation, the script prints the root panel URL, usually:

```text
http://<SERVER_IP>:2205
```

User activation is managed from the root panel after install. Root-only `/post/*` routes reject cross-origin public calls: they accept requests from the same host as the root panel or from localhost.

### Reinstall

Use `--reinstall` to stop old `mthan-vps@*.service` and legacy `vps@*.service` instances, remove old service files and binaries, install fresh binaries, and restart the root service:

```sh
curl -fsSL https://cdn.jsdelivr.net/gh/antoine-mai/mthan-tools-vps@main/public/install.sh | sudo bash -s -- --reinstall
```

### Installer options

The installer supports:

```text
--reinstall   Stop old service instances, replace binaries, recreate service files, and restart root service.
-h, --help    Show installer help.
```

Environment overrides:

```sh
ROOT_ADDR=":2205" \
DIST_URL="https://cdn.jsdelivr.net/gh/antoine-mai/mthan-tools-vps@main/public/dist" \
INSTALL_PATH="/usr/local/bin/mthan-vps" \
CTL_INSTALL_PATH="/usr/local/bin/mthanctl" \
sudo -E bash public/install.sh
```

Supported variables:

```text
ROOT_ADDR         Root panel bind address. Default: :2205
DIST_URL          Base URL for both binaries.
BINARY_URL        Full URL for mthan-vps. Overrides DIST_URL for the app binary.
CTL_BINARY_URL    Full URL for mthanctl. Overrides DIST_URL for the control binary.
INSTALL_PATH      Install path for mthan-vps.
CTL_INSTALL_PATH  Install path for mthanctl.
```

### Service management

```sh
sudo systemctl status mthan-vps@root.service
sudo systemctl restart mthan-vps@root.service
sudo journalctl -u mthan-vps@root.service -f
```

If systemd reports `error while loading shared libraries: libcrypt.so.1`, install the runtime package and restart.

Debian/Ubuntu:

```sh
sudo apt-get update && sudo apt-get install -y libcrypt1
sudo systemctl restart mthan-vps@root.service
```

RHEL/Fedora/Amazon Linux:

```sh
sudo dnf install -y libxcrypt-compat
sudo systemctl restart mthan-vps@root.service
```

Arch Linux:

```sh
sudo pacman -Sy --noconfirm libxcrypt-compat
sudo systemctl restart mthan-vps@root.service
```

## Podman ownership and boot recovery

Podman is the only supported container engine. The root panel manages root's Podman store and can administer a selected user's separate rootless store; each user panel manages only its own account. Commands receive a clean environment with the owner's HOME, config/data paths, runtime directory and systemd user bus. Remote connection variables from another account are not inherited. Existing Dockerfile/Compose build formats and image registries remain usable; existing Docker containers are not automatically migrated.

The installer installs Podman plus rootless dependencies and runs `mthanctl podman-setup`. Installing Podman from the app runs the same provisioning code. It enables the system `podman-restart.service`, provides a user unit when the distribution does not ship one, and configures existing interactive accounts, including normal users with custom home paths. Distribution-provided restart units take precedence over the generated fallback. New app-created users receive distinct subordinate UID/GID ranges, verified linger, a running `user@UID.service`, and an enabled user restart unit. Provisioning failures are reported rather than ignored; an already-created account is retained for repair.

New containers default to `--restart always`. Explicit `no` and `on-failure` policies are not a promise of boot startup; the enabled restart service follows the installed Podman unit's policy filters. A user unit operates on that user's store, not root's. Linger keeps the user manager available without an interactive login.

Repair or apply configuration on an existing installation, as root:

```sh
mthanctl podman-setup          # Host services and existing interactive accounts
mthanctl podman-setup alice    # One existing non-root Linux account
loginctl show-user alice -p Linger --value
systemctl is-enabled podman-restart.service
runuser -u alice -- env -i HOME=/home/alice USER=alice LOGNAME=alice \
  PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  XDG_RUNTIME_DIR=/run/user/$(id -u alice) \
  DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u alice)/bus \
  systemctl --user is-enabled podman-restart.service
```

The setup does not start or stop containers immediately. Boot behavior should be verified on a disposable VPS before scheduling a production reboot. Existing Docker daemon installations are not uninstalled by this source change.

### Upgrading through the admin Update button

No terminal command is required for the Podman migration. After the updated main binary starts as root, it automatically applies the existing-user setup in the background, installing Podman/rootless packages if needed. A versioned success receipt is written to settings only after completion; failed or interrupted setup is retried on the next root-service start. This migration is embedded in `mthan-vps` and does not require an updated `mthanctl` binary.

Open the admin Update dialog to see **Podman user setup** and use **Apply user setup** / **Retry setup** to rerun it. The status and trigger endpoints are root-authenticated `/post/update/podman` (GET/POST). Concurrent setup requests share one running operation. A binary update and a successful Podman setup are separate statuses; setup failure leaves the admin available for repair.

## Simple nameserver settings

Root Settings → Apps → Nameserver now offers hostname/IP rows and **Save & apply**. Names such as `ns1.example.com` and `ns2.example.com` receive A/AAAA host records, NS records and an SOA in app-managed bootstrap zones. A detected public IPv4 address is suggested, and additional rows reuse the first address. Advanced raw configuration remains collapsed below the form.

The root-only GET/PUT `/post/nameservers` API validates names/IPs, checks revision conflicts, runs `named-checkzone` and `named-checkconf`, and applies BIND through `rndc` or its systemd unit. Managed generations keep the prior configuration available for rollback. Existing externally managed zones and manually edited managed zone files are refused rather than overwritten. Generated configurations live under `/etc/bind/mthan-nameservers` or `/var/named/mthan-nameservers`; only a marked include is added to the main config.

This creates bootstrap nameserver records, not a general website/mail zone editor. Register child nameservers/glue at the domain registrar, ensure BIND listens on the intended address and TCP/UDP 53 is reachable, and provision the remaining records before delegating a live domain. The form does not change registrar settings, listener options or firewall rules. No production DNS configuration is changed by tests; tests run real BIND validators against temporary files and mock daemon reloads.
