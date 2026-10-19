#!/usr/bin/env bash
set -euo pipefail

APP_NAME="mthan-vps"
CTL_NAME="mthanctl"
SERVICE_NAME="mthan-vps"
DIST_URL="${DIST_URL:-https://cdn.jsdelivr.net/gh/antoine-mai/mthan-tools-vps@main/public/dist}"
BINARY_URL="${BINARY_URL:-${DIST_URL}/${APP_NAME}}"
CTL_BINARY_URL="${CTL_BINARY_URL:-${DIST_URL}/${CTL_NAME}}"
INSTALL_PATH="${INSTALL_PATH:-/usr/local/bin/${APP_NAME}}"
CTL_INSTALL_PATH="${CTL_INSTALL_PATH:-/usr/local/bin/${CTL_NAME}}"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}@.service"
ROOT_ADDR="${ROOT_ADDR:-:2205}"
ROOT_SERVICE_UNIT=""
REINSTALL=0

usage() {
  cat <<EOF
Usage: install.sh [--reinstall]

Options:
  --reinstall   Stop old service instances, replace binaries, recreate service files, and restart root service.
  -h, --help    Show this help message.

Environment:
  ROOT_ADDR         Root panel bind address. Default: ${ROOT_ADDR}
  DIST_URL          Base URL for both binaries. Default: ${DIST_URL}
  BINARY_URL        Full URL for ${APP_NAME}. Default: ${BINARY_URL}
  CTL_BINARY_URL    Full URL for ${CTL_NAME}. Default: ${CTL_BINARY_URL}
  INSTALL_PATH      Install path for ${APP_NAME}. Default: ${INSTALL_PATH}
  CTL_INSTALL_PATH  Install path for ${CTL_NAME}. Default: ${CTL_INSTALL_PATH}
EOF
}

parse_args() {
  for arg in "$@"; do
    case "${arg}" in
      --reinstall)
        REINSTALL=1
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "unknown argument: ${arg}" >&2
        usage >&2
        exit 1
        ;;
    esac
  done
}

require_root() {
  if [[ "${EUID}" -eq 0 ]]; then
    return
  fi

  echo "${SERVICE_NAME} installer must be run as root" >&2
  exit 1
}

require_command() {
  local command_name="$1"

  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "missing required command: ${command_name}" >&2
    exit 1
  fi
}

has_libcrypt() {
  if command -v ldconfig >/dev/null 2>&1 && ldconfig -p 2>/dev/null | grep -q 'libcrypt\.so\.1'; then
    return 0
  fi

  [[ -e /lib/libcrypt.so.1 ]] ||
    [[ -e /usr/lib/libcrypt.so.1 ]] ||
    [[ -e /lib64/libcrypt.so.1 ]] ||
    [[ -e /usr/lib64/libcrypt.so.1 ]] ||
    [[ -e /lib/x86_64-linux-gnu/libcrypt.so.1 ]] ||
    [[ -e /usr/lib/x86_64-linux-gnu/libcrypt.so.1 ]]
}

install_libcrypt() {
  if has_libcrypt; then
    return
  fi

  echo "Missing runtime dependency: libcrypt.so.1"

  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y libcrypt1
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y libxcrypt-compat
  elif command -v yum >/dev/null 2>&1; then
    yum install -y libxcrypt-compat
  elif command -v pacman >/dev/null 2>&1; then
    pacman -Sy --noconfirm libxcrypt-compat
  elif command -v apk >/dev/null 2>&1; then
    apk add --no-cache libxcrypt-compat
  else
    echo "unable to install libcrypt.so.1 automatically; install libcrypt1 or libxcrypt-compat and rerun this script" >&2
    exit 1
  fi

  if ! has_libcrypt; then
    echo "libcrypt.so.1 is still missing after package installation" >&2
    exit 1
  fi
}

install_caddy() {
  if command -v caddy >/dev/null 2>&1; then
    echo "Caddy is already installed"
  elif command -v apt-get >/dev/null 2>&1; then
    echo "Installing Caddy from the official Debian repository"
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
    local key_file
    key_file="$(mktemp)"
    curl -1fsSL "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" -o "${key_file}"
    gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg "${key_file}"
    rm -f "${key_file}"
    curl -1fsSL "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" -o /etc/apt/sources.list.d/caddy-stable.list
    chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y caddy
  elif command -v dnf >/dev/null 2>&1; then
    echo "Installing Caddy from the official COPR repository"
    dnf install -y dnf-plugins-core
    dnf -y copr enable @caddy/caddy
    dnf install -y caddy
  elif command -v yum >/dev/null 2>&1; then
    echo "Installing Caddy from the official COPR repository"
    yum install -y yum-plugin-copr
    yum -y copr enable @caddy/caddy
    yum install -y caddy
  elif command -v pacman >/dev/null 2>&1; then
    echo "Installing Caddy from the Arch repository"
    pacman -Sy --noconfirm --needed caddy
  else
    echo "unable to install required Caddy public server on this distribution" >&2
    exit 1
  fi

  if ! command -v caddy >/dev/null 2>&1; then
    echo "Caddy installation did not provide a caddy binary" >&2
    exit 1
  fi

  systemctl enable --now caddy
  configure_caddy_users_dir
}

install_docker() {
  if command -v docker > /dev/null 2>&1; then
    echo "Docker is already installed: $(docker --version 2>/dev/null || true)"
    systemctl enable --now docker 2>/dev/null || true
    return
  fi

  echo "Installing Docker..."
  local installed=0

  if command -v apt-get > /dev/null 2>&1; then
    apt-get update
    if DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io; then
      installed=1
    fi
  elif command -v dnf > /dev/null 2>&1; then
    if dnf install -y docker-ce moby-engine || dnf install -y docker; then
      installed=1
    fi
  elif command -v yum > /dev/null 2>&1; then
    if yum install -y docker; then
      installed=1
    fi
  elif command -v pacman > /dev/null 2>&1; then
    if pacman -Sy --noconfirm --needed docker; then
      installed=1
    fi
  fi

  # Fallback to official docker installation script if package manager didn't install docker
  if [[ "${installed}" -eq 0 ]] || ! command -v docker > /dev/null 2>&1; then
    echo "Attempting official Docker convenience script..."
    if command -v curl > /dev/null 2>&1; then
      curl -fsSL https://get.docker.com | sh || true
    elif command -v wget > /dev/null 2>&1; then
      wget -qO- https://get.docker.com | sh || true
    fi
  fi

  if command -v docker > /dev/null 2>&1; then
    echo "Docker installed successfully: $(docker --version 2>/dev/null || true)"
    systemctl enable --now docker 2>/dev/null || true
  else
    echo "Warning: Docker could not be installed automatically. Install it manually if needed." >&2
  fi
}

install_podman() {
  if command -v podman > /dev/null 2>&1; then
    echo "Podman is already installed"
    return
  fi

  echo "Installing Podman..."
  local installed=0

  if command -v apt-get > /dev/null 2>&1; then
    apt-get update
    if DEBIAN_FRONTEND=noninteractive apt-get install -y podman; then
      installed=1
    fi
  elif command -v dnf > /dev/null 2>&1; then
    if dnf install -y podman; then
      installed=1
    fi
  elif command -v yum > /dev/null 2>&1; then
    if yum install -y podman; then
      installed=1
    fi
  elif command -v pacman > /dev/null 2>&1; then
    if pacman -Sy --noconfirm --needed podman; then
      installed=1
    fi
  fi

  if [[ "${installed}" -eq 1 ]] && command -v podman > /dev/null 2>&1; then
    echo "Podman installed successfully: $(podman --version 2>/dev/null || true)"
  else
    echo "Warning: Podman could not be installed automatically. Install it manually if needed." >&2
  fi
}

install_rclone() {
  if command -v rclone >/dev/null 2>&1; then
    echo "rclone is already installed"
    return
  fi

  echo "Installing rclone..."
  local installed=0

  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    if DEBIAN_FRONTEND=noninteractive apt-get install -y rclone; then
      installed=1
    fi
  elif command -v dnf >/dev/null 2>&1; then
    if dnf install -y rclone; then
      installed=1
    fi
  elif command -v yum >/dev/null 2>&1; then
    if yum install -y rclone; then
      installed=1
    fi
  elif command -v pacman >/dev/null 2>&1; then
    if pacman -Sy --noconfirm --needed rclone; then
      installed=1
    fi
  fi

  if [[ "${installed}" -eq 0 ]] || ! command -v rclone >/dev/null 2>&1; then
    echo "Attempting official rclone installation script..."
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL https://rclone.org/install.sh | bash || true
    elif command -v wget >/dev/null 2>&1; then
      wget -qO- https://rclone.org/install.sh | bash || true
    fi
  fi

  if ! command -v rclone >/dev/null 2>&1; then
    echo "rclone installation did not provide an rclone binary" >&2
    exit 1
  fi

  echo "rclone installed successfully: $(rclone version 2>/dev/null | head -n 1)"
}

configure_caddy_users_dir() {
  local caddy_conf_dir="/etc/caddy/mthan-users"
  local caddyfile="/etc/caddy/Caddyfile"
  local import_line="import /etc/caddy/mthan-users/*"

  echo "Configuring Caddy mthan-users directory: ${caddy_conf_dir}"
  mkdir -p "${caddy_conf_dir}"

  # Migrate files from legacy /etc/caddy/Caddyfile.d/mthan-users if exists
  if [[ -d "/etc/caddy/Caddyfile.d/mthan-users" ]]; then
    cp -rn /etc/caddy/Caddyfile.d/mthan-users/* "${caddy_conf_dir}/" 2>/dev/null || true
  fi

  if [[ ! -f "${caddyfile}" ]]; then
    mkdir -p "/etc/caddy"
    echo "${import_line}" > "${caddyfile}"
  else
    if grep -qF "import /etc/caddy/Caddyfile.d/mthan-users/*" "${caddyfile}"; then
      sed -i 's|import /etc/caddy/Caddyfile.d/mthan-users/\*|import /etc/caddy/mthan-users/\*|g' "${caddyfile}"
    fi
    if ! grep -qF "${import_line}" "${caddyfile}"; then
      echo -e "\n${import_line}" >> "${caddyfile}"
    fi
  fi

  if command -v caddy >/dev/null 2>&1; then
    caddy reload --config "${caddyfile}" 2>/dev/null || systemctl reload caddy 2>/dev/null || true
  fi
}

configure_home_mode() {
  echo "Configuring user home permissions (HOME_MODE 0711)..."
  if [[ -f /etc/login.defs ]]; then
    if grep -q "^HOME_MODE" /etc/login.defs; then
      sed -i 's/^HOME_MODE.*/HOME_MODE\t0711/' /etc/login.defs
    else
      echo -e "\nHOME_MODE\t0711" >> /etc/login.defs
    fi
  fi

  for home_dir in /home/*; do
    if [[ -d "${home_dir}" ]]; then
      chmod 711 "${home_dir}" 2>/dev/null || true
      if [[ -d "${home_dir}/htdocs" ]]; then
        chmod 755 "${home_dir}/htdocs" 2>/dev/null || true
      fi
    fi
  done
}

configure_root_directories() {
  echo "Configuring root directories (htdocs, backup, logs, data, config)..."
  local root_home="/root"
  for dir in htdocs backup logs data config; do
    mkdir -p "${root_home}/${dir}"
    chmod 755 "${root_home}/${dir}" 2>/dev/null || true
  done
}

download_binary() {
  local name="$1"
  local url="$2"
  local install_path="$3"
  local tmp_file
  tmp_file="$(mktemp)"

  echo "Downloading ${name} from ${url}"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "${url}" -o "${tmp_file}"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "${tmp_file}" "${url}"
  else
    echo "missing required command: curl or wget" >&2
    rm -f "${tmp_file}"
    exit 1
  fi

  install -m 0755 "${tmp_file}" "${install_path}"
  rm -f "${tmp_file}"
}

download_binaries() {
  download_binary "${APP_NAME}" "${BINARY_URL}" "${INSTALL_PATH}"
  download_binary "${CTL_NAME}" "${CTL_BINARY_URL}" "${CTL_INSTALL_PATH}"
}

create_service() {
  cat >"${SERVICE_FILE}" <<EOF
[Unit]
Description=MThan VPS service for %I
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=%I
ExecStart=${INSTALL_PATH}
Restart=on-failure
RestartSec=3
Environment=APP_ENV=production
EnvironmentFile=-/etc/${SERVICE_NAME}/%i.env

[Install]
WantedBy=multi-user.target
EOF
}

write_service_env() {
  local env_file="/etc/${SERVICE_NAME}/root.env"

  mkdir -p "/etc/${SERVICE_NAME}"

  cat >"${env_file}" <<EOF
APP_ADDR=${ROOT_ADDR}
EOF
}

start_service() {
  systemctl daemon-reload
  write_service_env
  ROOT_SERVICE_UNIT="${SERVICE_NAME}@root.service"
  systemctl enable "${ROOT_SERVICE_UNIT}"
  if [[ "${REINSTALL}" == "1" ]]; then
    systemctl restart "${ROOT_SERVICE_UNIT}"
  else
    systemctl start "${ROOT_SERVICE_UNIT}"
  fi
}

resolve_root_url() {
  local port
  port=$(echo "${ROOT_ADDR}" | sed 's/.*://')

  local ip=""
  # Try to fetch public IP (with timeout to prevent hanging)
  if command -v curl >/dev/null 2>&1; then
    ip=$(curl -fsSL --connect-timeout 2 https://ipinfo.io/ip 2>/dev/null || true)
  elif command -v wget >/dev/null 2>&1; then
    ip=$(wget -qO- --timeout=2 https://ipinfo.io/ip 2>/dev/null || true)
  fi

  # Fallback to local IP if public IP failed
  if [[ -z "${ip}" ]]; then
    if command -v hostname >/dev/null 2>&1; then
      ip=$(hostname -I | awk '{print $1}' || true)
    fi
  fi

  # Ultimate fallback
  if [[ -z "${ip}" ]]; then
    ip="<YOUR_SERVER_IP>"
  fi

  echo "http://${ip}:${port}"
}

cleanup_old_install() {
  echo "Cleaning up old installation..."

  # Stop and disable legacy vps@*.service instances if any
  local legacy_units
  legacy_units=$(
    systemctl list-units --type=service --all --plain --no-legend --no-pager "vps@*.service" 2>/dev/null | awk '{print $1}' | grep -E "^vps@[^.]+\\.service$"
  ) || true
  for unit in ${legacy_units}; do
    if [[ -n "${unit}" ]]; then
      echo "Stopping legacy service: ${unit}"
      systemctl stop "${unit}" || true
      systemctl disable "${unit}" || true
    fi
  done

  # For mthan-vps: ONLY stop root service for update. DO NOT stop or disable user services!
  echo "Stopping root service for reinstallation..."
  systemctl stop "${SERVICE_NAME}@root.service" 2>/dev/null || true

  # Clean up service files
  rm -f "/etc/systemd/system/${SERVICE_NAME}@.service"
  rm -f "/etc/systemd/system/vps@.service"

  # Clean up binaries
  rm -f "/usr/local/bin/vps"
  rm -f "${INSTALL_PATH}"
  rm -f "${CTL_INSTALL_PATH}"

  systemctl daemon-reload || true
}

main() {
  parse_args "$@"

  require_root
  require_command install
  require_command mktemp
  require_command systemctl

  install_libcrypt
  install_caddy
  install_docker
  install_podman
  install_rclone
  configure_home_mode
  configure_root_directories

  if [[ "${REINSTALL}" == "1" ]]; then
    cleanup_old_install
  fi
  download_binaries
  create_service
  start_service

  local root_url
  root_url=$(resolve_root_url)

  echo "${SERVICE_NAME} installed successfully"
  echo "Binary: ${INSTALL_PATH}"
  echo "Control binary: ${CTL_INSTALL_PATH}"
  echo "Service template: ${SERVICE_FILE}"
  echo "Root service instance: ${ROOT_SERVICE_UNIT}"
  echo "Root service URL: ${root_url}"
}

main "$@"
