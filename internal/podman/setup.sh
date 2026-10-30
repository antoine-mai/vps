#!/usr/bin/env bash
set -euo pipefail
# A prefix is used only by the isolated setup tests.
setup_root="${MTHAN_PODMAN_SETUP_ROOT:-}"
fail() { echo "[ERROR] $*" >&2; exit 1; }
[[ "$(id -u)" == 0 ]] || fail "Podman provisioning requires root."
command -v systemctl >/dev/null || fail "systemd is required."
command -v loginctl >/dev/null || fail "systemd-logind is required."
install -d -m 0755 "${setup_root}/run/lock"
exec 8>"${setup_root}/run/lock/mthan-podman-setup.lock"
flock -x 8

install_units() {
  local binary unit_dir target vendor
  binary="$(command -v podman || true)"
  binary="${binary:-/usr/bin/podman}"
  for target in system user; do
    unit_dir="${setup_root}/etc/systemd/${target}"
    install -d -m 0755 "$unit_dir"
    # Retire only our fallback when a distribution-supplied unit becomes available.
    for vendor in "${setup_root}/usr/lib/systemd/${target}/podman-restart.service" "${setup_root}/lib/systemd/${target}/podman-restart.service"; do
      if [[ -f "$vendor" && -f "${unit_dir}/podman-restart.service" ]] && grep -q '^Description=Restart this owner' "${unit_dir}/podman-restart.service"; then
        rm "${unit_dir}/podman-restart.service"
      fi
    done
    # Preserve the distribution's unit, including its supported restart filters.
    if [[ ! -e "${unit_dir}/podman-restart.service" && ! -e "${setup_root}/usr/lib/systemd/${target}/podman-restart.service" && ! -e "${setup_root}/lib/systemd/${target}/podman-restart.service" ]]; then
      cat > "${unit_dir}/podman-restart.service" <<UNIT
[Unit]
Description=Restart this owner's Podman containers after boot
Wants=network-online.target
After=network-online.target
ConditionPathIsExecutable=${binary}

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=${binary} start --all --filter restart-policy=always --filter restart-policy=unless-stopped

[Install]
WantedBy=default.target
UNIT
      chmod 0644 "${unit_dir}/podman-restart.service"
    fi
  done
  systemctl daemon-reload
  systemctl enable podman-restart.service
}

subids() {
  local username="$1" uid="$2" next file found
  install -d -m 0755 "${setup_root}/run/lock"
  (
    flock -x 9
    touch "${setup_root}/etc/subuid" "${setup_root}/etc/subgid"
    chmod 0644 "${setup_root}/etc/subuid" "${setup_root}/etc/subgid"
    next="$(awk -F: 'BEGIN {end=100000} $2~/^[0-9]+$/ && $3~/^[0-9]+$/ {if ($2+$3>end) end=$2+$3} END {printf "%.0f",end}' "${setup_root}/etc/subuid" "${setup_root}/etc/subgid")"
    [[ "$next" -le 4294901759 ]] || fail "No subordinate ID range is available."
    for file in subuid subgid; do
      found="$(awk -F: -v user="$username" -v uid="$uid" '($1==user || $1==uid) && $3>=65536 {print 1;exit}' "${setup_root}/etc/${file}")"
      if [[ "$found" != 1 ]]; then
        if [[ "$file" == subuid ]]; then usermod --add-subuids "${next}-$((next+65535))" "$username"
        else usermod --add-subgids "${next}-$((next+65535))" "$username"; fi
      fi
    done
  ) 9>"${setup_root}/run/lock/mthan-podman-subids.lock"
}

provision_user() {
  local username="$1" entry uid home
  [[ "$username" =~ ^[a-zA-Z_][a-zA-Z0-9_.-]*\$?$ ]] || fail "Invalid Linux username."
  entry="$(getent passwd "$username")" || fail "Linux user not found: $username"
  IFS=: read -r _ _ uid _ _ home _ <<< "$entry"
  [[ "$uid" =~ ^[0-9]+$ && "$uid" -gt 0 && "$home" == /* ]] || fail "Rootless setup requires a non-root Linux user."
  subids "$username" "$uid"
  loginctl enable-linger "$username"
  [[ "$(loginctl show-user "$username" -p Linger --value)" == yes ]] || fail "Linger was not enabled for $username."
  systemctl start "user@${uid}.service"
  runuser --user "$username" -- env -i "HOME=$home" "USER=$username" "LOGNAME=$username" "PATH=$PATH" \
    "XDG_RUNTIME_DIR=/run/user/$uid" "DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$uid/bus" \
    systemctl --user daemon-reload
  runuser --user "$username" -- env -i "HOME=$home" "USER=$username" "LOGNAME=$username" "PATH=$PATH" \
    "XDG_RUNTIME_DIR=/run/user/$uid" "DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$uid/bus" \
    systemctl --user enable podman-restart.service
}

case "${1:-}" in
  user)
    install_units
    provision_user "${2:?Linux username is required}"
    ;;
  host)
    command -v podman >/dev/null || fail "Install Podman before configuring the host."
    install_units
    install -d -m 0755 "${setup_root}/etc/profile.d" "${setup_root}/etc/containers/containers.conf.d"
    cat > "${setup_root}/etc/profile.d/mthan-podman.sh" <<'PROFILE'
# Give each non-root login its own systemd runtime and bus.
if [ "$(id -u)" -ne 0 ]; then
    XDG_RUNTIME_DIR="/run/user/$(id -u)"
    DBUS_SESSION_BUS_ADDRESS="unix:path=${XDG_RUNTIME_DIR}/bus"
    export XDG_RUNTIME_DIR DBUS_SESSION_BUS_ADDRESS
fi
PROFILE
    chmod 0644 "${setup_root}/etc/profile.d/mthan-podman.sh"
    cat > "${setup_root}/etc/containers/containers.conf.d/50-mthan.conf" <<'CONFIG'
[engine]
cgroup_manager = "systemd"
events_logger = "file"
CONFIG
    # Enable rootless startup for existing interactive accounts as well as new ones.
    while IFS=: read -r username _ uid _ _ home shell; do
      if [[ "$uid" -gt 0 && ( "$uid" -ge 1000 || "$home" == /home/* ) && "$home" == /* && "$home" != / && "$shell" != */nologin && "$shell" != */false && -d "${setup_root}${home}" ]]; then
        provision_user "$username"
      fi
    done < <(getent passwd)
    ;;
  *) fail "Usage: podman setup: host | user <username>" ;;
esac
echo '[SUCCESS] Podman provisioning completed.'
