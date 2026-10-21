# Agent Work Log

This file is for handoff between agents. Keep entries concise, factual, and newest-first.

## Current Project Context

- Repository: `/home/server/htdocs/mthan/vps`
- Product: MThan VPS, a Go API with a React/TypeScript client.
- Backend areas:
  - `main.go`: Go service entrypoint.
  - `routes/`: HTTP route registration.
  - `routes/api/`: public API routes.
  - `routes/post/`: root-only localhost/internal POST routes.
  - `services/`: business logic, router, auth, filesystem, health, root, and Linux user services.
- Frontend areas:
  - `client/src/`: React/TypeScript source.
  - `client/build/`: built static client assets.
- Common validation:
  - `make test`
  - `make fmt`
  - `make build`
  - `cd client && npm run build`

## Work Entries

### 2026-10-21 - Modernize Docker Containers to subsidebar + details layout

- Goal:
  1. Remove the 4 static summary boxes (`Total Containers`, `Running`, `Stopped`, `Host Directory`) from the Docker Containers page.
  2. Redesign the page into a subsidebar + details layout matching the standard 200px column layout (`md:grid-cols-[200px_1fr]`): container list on the left subsidebar, and detailed container view with action toolbar on the right.
  3. Add `/containers/:id` route support for deep-linking.
- Files changed:
  - `client/src/routes/docker/index.tsx`: Replaced summary cards and table layout with a left 200px subsidebar (search filter, status indicators, refresh and create buttons, container item list) and a right details panel (container header, actions toolbar, general info, networking/port mappings, filesystem paths, and quick actions).
  - `client/src/routes/index.tsx`: Added `/containers/:id` route.
  - `client/build/*`: Rebuilt frontend static assets.
- Validation: Frontend build succeeded (`npm --prefix client run build`), Go tests passed (`go test ./...`), and Go binary built cleanly.

### 2026-10-20 - Align header module title and subsidebars & Add BIND 9 nameserver to settings

- Goal:
  1. Replace static app name in header title box with the active sidebar module title (Dashboard, Users, VHosts, Apps, Containers, Tasking, Files, Backup, Settings, APIs, Agent).
  2. Standardize all subsidebar widths across the application to 200px (`md:grid-cols-[200px_1fr]`) so their right border aligns with the header title box's right border.
  3. Add BIND 9 nameserver management to Settings under Apps with an "Active" (installation/activation) button and configuration viewers for `named.conf`, `named.conf.options`, and `named.conf.local`.
- Files changed:
  - `client/src/_layouts/dashboard.tsx`: Derived active module title dynamically based on the current route and passed it to `Header`. Added optional `headerTitle` prop override.
  - `client/src/routes/settings/sidebar.tsx`: Added `bind9` (Nameserver) to `availableApps`.
  - `client/src/routes/apps/index.tsx`: Registered `bind9` app with port 53; added "Active" button for uninstalled state; added BIND 9 configuration file cards; updated subsidebar grid to `200px`; hooked service action handler to backend.
  - `client/src/routes/containers/index.tsx`, `client/src/routes/tasking/index.tsx`, `client/src/routes/settings/index.tsx`, `client/src/routes/root/users/index.tsx`, `client/src/routes/files/index.tsx`, `client/src/routes/agent/index.tsx`: Standardized subsidebar column widths to `200px` (`md:grid-cols-[200px_1fr]`).
  - `services/apps.go`: Registered `bind9` in `knownApps` and added `ControlService` to manage systemctl services (start, stop, restart).
  - `services/app_install.go`: Added `bind9` package mappings for apt-get, dnf, yum, and pacman; auto-enabled and started service on installation.
  - `services/app_config.go`: Allowed editing `/etc/bind/named.conf`, `/etc/bind/named.conf.options`, `/etc/bind/named.conf.local`, and `/etc/named.conf`.
  - `routes/post/apps/main.go`: Added support for service control actions (`start`, `stop`, `restart`) in addition to installation.
  - `client/build/*`: Rebuilt frontend static assets.
- Validation: Go tests passed (`go test ./...`), Go binary built cleanly, and frontend production build succeeded.

### 2026-10-20 - Auto-focus inputs on login forms (/login and /root/login)

- Goal: Automatically focus the primary input field when entering the login forms (/login and /root/login).
- Files changed:
  - `client/src/routes/login.tsx`: Added `useRef` and `useEffect` autofocus behavior to `LoginForm`. For regular user login (`/login`), focuses the `username` input; for root console login (`/root/login`), focuses the `password` input.
  - `client/build/*`: Rebuilt frontend static assets.
- Validation: Frontend build passed (`npm --prefix client run build`), Go tests passed (`go test ./...`), and binary compiled cleanly.

### 2026-10-20 - Add API management to root users section

- Goal: Enable root to access and manage API keys for any user from the root Users portal (`/users/:username/apis`).
- Files changed:
  - `routes/post/apis/main.go`: Added support for `owner` query parameter in `GET` and `owner` field in `POST` payload, allowing root to filter API keys by owner and create API keys on behalf of users.
  - `client/src/routes/apis/index.tsx`: Added `embedded` and `owner` props to `APIsRoute`, supporting scoped API key listing, creation, updates, and deletion.
  - `client/src/routes/root/users/index.tsx`: Added `apis` to `UserSection`, added `APIs` sub-item navigation and context menu item, and rendered `<APIsRoute embedded owner={selectedUser.username} />`.
  - `client/build/*`: Rebuilt frontend static assets.
- Validation: Frontend build passed (`npm run build`), Go tests passed (`go test ./...`), and binary compiled cleanly.

### 2026-10-19 - Align VHosts sidebar width with header title box (200px)

- Goal: Reduce the header title box width and VHosts subsidebar width to 200px so their right borders align seamlessly.
- Files changed:
  - `client/src/_layouts/_components/header.tsx`: Reduced header title container from `md:w-[280px] md:px-6` to `md:w-[200px] md:px-4`; reduced update countdown timer to 5s.
  - `client/src/routes/vhosts/index.tsx`: Changed subsidebar grid column from `md:grid-cols-[220px_1fr]` to `md:grid-cols-[200px_1fr]`.
  - `client/build/*`: Rebuilt frontend static assets.
- Validation: Frontend build passed (`npm run build`), Go tests passed (`go test ./...`), and binary compiled cleanly.

### 2026-10-19 - Concurrent Docker & Podman installation and system container management

- Goal: Install Docker concurrently with Podman (Podman rootless for users, Docker for system/root services), configure root directory structure matching standard users (`/root/htdocs`, `/root/backup`, `/root/logs`, `/root/data`, `/root/config`), update installer with `--reinstall` safety (do not stop or wipe user services/data), and add "Containers" sidebar navigation item for managing root system Docker containers.
- Files changed:
  - `public/install.sh`: Added `install_docker()` alongside `install_podman()`, added `configure_root_directories()` to set up `/root/{htdocs,backup,logs,data,config}`; adjusted `cleanup_old_install()` so `--reinstall` only restarts `mthan-vps@root.service` and never stops or wipes user instances or directories.
  - `services/containers.go`: Added Docker integration for UID 0/root (`docker ps -a`, `docker inspect`, `docker logs`, `docker rm -f`, `docker run`), scanning `/root/htdocs` for container definitions and Dockerfiles; ensured `ListAll()` strictly lists user apps, while `ListForOwner("root")` handles root Docker containers.
  - `services/containers_test.go`: Added `TestParseDockerContainers`.
  - `client/src/_layouts/_components/sidebar.tsx`: Added "Containers" item (`/containers`) for root.
  - `client/src/routes/docker/index.tsx`: Created independent layout and page for Docker System Containers exclusively for root (no user list, no subsidebar, dedicated stats, Docker container actions, logs, Dockerfile viewer, and create container modal with no owner selection).
  - `client/src/routes/containers/index.tsx`: Reverted back to strictly managing user apps (Podman rootless) with the user subsidebar.
  - `client/src/routes/index.tsx`: Mapped `/containers` directly to `DockerContainersRoute`, removed `/containers/:owner`.
  - `client/build/*`: Rebuilt frontend static assets.
- Validation: Go test suite passed (`go test -v ./...`), binary compiled cleanly (`go build -buildvcs=false .`), and client built without errors (`npm run build`).

### 2026-10-18 - Lock VHost owner modal to current user

- Goal: In root view, when viewing a specific user (e.g. `/users/:username/vhosts`), lock the Owner field in Create VHost modal to that user.
- Files changed: `client/src/routes/vhosts/index.tsx`, `client/build/*`.
- Important decisions: When `defaultOwner` is supplied (from `ownerFilter`), the Owner select element is disabled and shows a lock icon indicator ("Locked to current user"), preventing unintended assignment to root or another user while preserving `defaultOwner` in form submission.
- Validation: `npm run build` passed cleanly; `git diff --check` passed.

### 2026-07-24 - Browser-scoped root login

- Goal: Require the root password again after the browser session ends.
- Files changed: non-persistent root cookie, root-only sessionStorage login state, root settings bootstrap check, and work log.
- Important decisions: root login no longer sets cookie Max-Age; root UI state is tab/browser-session scoped while regular-user login persistence remains unchanged.
- Validation: full Go test suite, TypeScript production build, application/control binary build, and `git diff --check`; frontend build has only pre-existing lint warnings.

### 2026-07-24 - Root-only global settings and credentials

- Goal: Audit root/user navigation and prevent regular users from accessing global Settings or API credential management.
- Files changed: root-only React routes/sidebar/header shortcuts, root-only settings context behavior, removed user settings API registration/handler, API route map, and work log.
- Important decisions: Users, Settings, Apps Settings, and API Credentials exist only in `/root`; `/api/settings` was removed because it exposed the shared global SettingsService to any valid user session; regular users retain Dashboard, scoped Files/Containers/Terminal, and read-only VHosts.
- Validation: full Go test suite, TypeScript production build, application/control binary build, `/api/settings` route scan, and `git diff --check`; frontend build has only pre-existing lint warnings.

### 2026-07-24 - Root-only Users navigation

- Goal: Keep Linux user management visible only in the root portal.
- Files changed: role-aware sidebar navigation and work log.
- Important decisions: `/root` renders the Users item; the regular-user portal omits it, while backend `/post/user/*` authorization remains the enforcement boundary.
- Validation: TypeScript production build, application/control binary build, and `git diff --check`; frontend build has only pre-existing lint warnings.

### 2026-07-24 - Root user-management context menu

- Goal: Add a right-click action menu to each Linux user in the root Users list.
- Files changed: user-list context-menu state, positioning/dismissal behavior, navigation and existing user actions, and work log.
- Important decisions: the menu reuses Overview, Files, Apps, Terminal, cPanel activation, and guarded deletion flows; deletion stays unavailable for UID 0; clicking outside, resizing, losing focus, or pressing Escape closes the menu.
- Validation: TypeScript production build, application/control binary build, and `git diff --check`; frontend build has only pre-existing lint warnings.

### 2026-07-23 - Distinct user and root login screens

- Goal: Make `/login` visibly user-focused and `/root/login` a separate privileged login that asks only for the root password.
- Files changed: split login layouts/form behavior, server-enforced root username, and work log.
- Important decisions: `/post/login` always authenticates the fixed `root` account regardless of request payload; the root screen uses a dedicated warning-oriented visual treatment while the user screen retains username/password login.
- Validation: Go formatting/full tests, TypeScript production build, application/control binary build, and `git diff --check`; frontend build has only pre-existing lint warnings.

### 2026-07-23 - Separate user and root portals

- Goal: Serve regular-user access at `/` and reserve `/root` for the fixed root account.
- Files changed: dual client runtimes and React basename, mode-specific login state/redirects, user terminal endpoint, session-owned shell selection, global POST root-session enforcement, user login rules, and work log.
- Important decisions: `/root` uses only UID 0 sessions; `/` accepts any authenticated non-root Linux account; user terminals ignore client-selected usernames and run as the session owner; all privileged `/post/*` routes require a root session except the explicit login/health handshakes.
- Validation: Go formatting, full Go test suite, TypeScript production build, application/control binary build, and `git diff --check`; frontend build has only pre-existing lint warnings.

### 2026-07-23 - Prevent regular-user root sessions

- Goal: Prevent a regular Linux account authenticated through the root login endpoint from receiving root terminal and control-panel access.
- Files changed: root login UID enforcement, session mode/UID invariants, terminal defense-in-depth check, session regression tests, and work log.
- Important decisions: root sessions require UID 0 and user sessions reject UID 0; previously persisted inconsistent sessions are invalidated when accessed.
- Validation: Go formatting, full Go test suite, and `git diff --check`.

### 2026-07-20 - Caddy-only VHosts inventory

- Goal: Make the VHosts sidebar destination list the public hosts configured in Caddy.
- Files changed: Caddy-only discovery, root POST vhost endpoints, live VHosts page, removed placeholder root/user tables, and work log.
- Important decisions: Nginx and Apache parser helpers remain tested but are no longer discovery sources; root uses `/post/vhost/*`, users use `/api/vhost/*`; the page is read-only and reflects the adapted Caddyfile.
- Validation: Go formatting/tests, TypeScript type-check, production client build, and `git diff --check`.

### 2026-07-20 - Caddy as required public server

- Goal: Make Caddy the standard public web server for ports 80 and 443 and install it with the panel.
- Files changed: installer package setup/service enablement, system app detection/install plans/tests, settings catalog/header validation, Caddy global config editor, port ownership display, and work log.
- Important decisions: the installer uses Caddy's official Debian/COPR packages or the Arch package and fails if Caddy cannot be installed/started; Nginx no longer claims the public ports in Apps; Caddyfile is an allowlisted editable global config.
- Validation: shell syntax, Go formatting/tests, TypeScript type-check, production client build, and `git diff --check`.

### 2026-07-20 - Route groups limited to API and POST

- Goal: Keep every HTTP handler under the actual `/api` or `/post` route group.
- Files changed: API/Post settings handlers, shared settings validation service, route imports, removed shared routes/settings handler, and work log.
- Important decisions: `routes/` now contains only the root registrar plus `api/` and `post/`; setting validation belongs to services rather than a third route namespace.
- Validation: Go formatting/tests, route-tree scan, and `git diff --check`.

### 2026-07-20 - Apps moved into Settings

- Goal: Make system apps sub-items of Apps Settings with route-backed detail pages.
- Files changed: shared Settings sidebar/app catalog, Settings and Apps layouts, route table, global sidebar/header links, User Overview links, and work log.
- Important decisions: the top-level Apps navigation and `/apps/*` routes are removed; app details use `/settings/apps/:appname`; `/settings/apps` remains the installed/header shortcut overview.
- Validation: TypeScript type-check, production client build, route reference scan, and `git diff --check`.

### 2026-07-20 - Container Dockerfile editor

- Goal: Edit the host Dockerfile associated with a listed Docker or Podman container.
- Files changed: safe Dockerfile discovery/read/write service, root/user routes, Containers action/modal, and work log.
- Important decisions: discovery uses `mthan.dockerfile` then Compose working-directory metadata; rootless Podman paths are jailed to the owner's home; only existing regular files up to 2 MiB are editable; saving never rebuilds or recreates a container.
- Validation: Go formatting/tests, TypeScript type-check, production client build, and `git diff --check`.

### 2026-07-20 - Per-user cPanel access status

- Goal: Show whether each Linux user can authenticate with cPanel and activate access by setting a password.
- Files changed: shadow-derived access status service/tests, user list response, root-only password route, User Details status/actions/modal, and work log.
- Important decisions: password hashes never leave the server; empty/locked password entries disable cPanel access; activation validates the selected home user and sets its Linux password through argument-safe `chpasswd` input.
- Validation: Go formatting/tests, TypeScript type-check, production client build, and `git diff --check`.

### 2026-07-20 - Container controls and logs

- Goal: Operate containers and inspect recent logs from the Containers inventory.
- Files changed: owner-aware container command service, root/user action and logs routes, Containers controls/modal, and work log.
- Important decisions: actions are limited to start/stop/restart; IDs and engines are validated; rootless Podman commands execute as the owning Linux user; logs are capped at the latest 200 lines.
- Validation: Go formatting/tests, TypeScript type-check, production client build, and `git diff --check`.

### 2026-07-20 - Editable container-engine configuration

- Goal: Make Docker and Podman global configuration paths directly editable from Apps.
- Files changed: allowlisted atomic config file service/tests, root-only GET/PUT route, Apps configuration cards/modal, and work log.
- Important decisions: only explicit Docker/Podman system paths are accepted; JSON is validated; symlinks/non-regular targets and files over 2 MiB are rejected; saving never restarts an engine automatically.
- Validation: Go formatting/tests, TypeScript type-check, production client build, and `git diff --check`.

### 2026-07-20 - Consistent user list route

- Goal: Keep root Linux-user actions under one `/post/user/*` namespace.
- Files changed: user list handler location, POST route registration, Users client, and work log.
- Important decisions: `/post/users` is replaced by `/post/user/list` without a legacy alias.
- Validation: Go formatting/tests, TypeScript type-check, and `git diff --check`.

### 2026-07-20 - Containers inventory page

- Goal: Separate global container-engine configuration from the operational list of containers.
- Files changed: container discovery service, separate root POST and user API handlers, sidebar/router/API map, Containers page, tests, and work log.
- Important decisions: root sees system Docker plus rootless Podman containers grouped by Linux owner; non-root sessions see only their own Podman inventory; listing commands are fixed and Podman executes under the owning user without a shared socket.
- Validation: Go formatting/tests, TypeScript type-check, production client build, and `git diff --check`.

### 2026-07-20 - Virtual host discovery API

- Goal: Expose public web-server ownership and virtual-host discovery under `/api/vhost`.
- Files changed: vhost discovery service/parser, authenticated API routes/tests, and work log.
- Important decisions: port ownership comes from listening processes; Nginx, Caddy, and Apache use their native configuration dump/adaptation commands; hostname lookup never reaches a shell command; all vhost endpoints require a valid session.
- Validation: Go formatting, targeted tests, full Go tests, and `git diff --check`.

### 2026-07-20 - Container engine configuration and header layout

- Goal: Place pinned app shortcuts on the left, improve App Details fields, and add Docker/Podman configuration pages.
- Files changed: header layout, Apps details, and work log.
- Important decisions: shortcuts now follow the app title; App Details omits Port for apps without a fixed network port; Docker remains system-managed while Podman is explicitly rootless and isolated per Linux user, with no shared root service/socket controls.
- Validation: TypeScript type-check and `git diff --check`.

### 2026-07-17 - Restore system Node.js 22

- Goal: Restore Node.js as a system app and make Node.js 22 the default installation target.
- Files changed: app detection/install plans and tests, Apps/User Overview/Settings/Header UI, settings validation, and work log.
- Important decisions: Debian/RHEL families configure the fixed NodeSource 22.x repository before package installation; Arch installs `nodejs-lts-jod`; Node.js is again detectable, installable, and pinnable.
- Validation: Go formatting, targeted Go tests, TypeScript type-check, and `git diff --check`; no frontend production build.
- Known follow-up: existing non-22 Node.js installations are reported as installed and are not automatically replaced.

### 2026-07-17 - Remove system Node.js app

- Goal: Remove Node.js from system Apps because Node versions will be managed per Linux user through NVM.
- Files changed: app detection/install plans and tests, Apps/User Overview/Settings/Header UI, settings validation and stale header-pin cleanup, and work log.
- Important decisions: Node.js is no longer detected, installable, pinnable, or displayed as a system app; existing `node` header pins are removed when settings load.
- Validation: Go formatting, targeted Go tests, TypeScript type-check, and `git diff --check`; no frontend production build.
- Known follow-up: per-user NVM management is not implemented yet.

### 2026-07-17 - System app installation

- Goal: Install supported apps directly from `/apps` and simplify app display names.
- Files changed: package installation service/tests, authenticated Apps POST route, Apps UI, and work log.
- Important decisions: package names and command arguments are allowlisted for apt, dnf/yum, and pacman families; installation status and detected version refresh from the existing Apps API; display names are concise product names.
- Validation: Go formatting, targeted Go tests, TypeScript type-check, and `git diff --check`; no frontend production build.
- Known follow-up: third-party repositories such as Docker CE must already be configured when distro-native fallback packages are unavailable.

### 2026-07-17 - Add user app by upload or Git

- Goal: Add apps to a user's `htdocs` folder from a ZIP upload or Git repository.
- Files changed: user app service and route, route registration, Users Apps UI, and work log.
- Important decisions: app names are restricted; destinations must not already exist; ZIP traversal and symlinks are rejected; Git clone uses argument-safe execution; created files are owned by the target Linux user.
- Validation: Go formatting, targeted Go tests, TypeScript type-check, and `git diff --check`; no frontend production build.
- Known follow-up: none.

### 2026-07-17 - API credential management

- Goal: Implement the APIs page and persistent `apis` SQLite table, including accepted IP restrictions.
- Files changed: settings database migration, API credential service/tests, authenticated root routes, APIs page, and work log.
- Important decisions: secrets are returned once and only SHA-256 hashes are stored; accepted IPs are stored as a JSON array and validated as IP addresses or CIDR ranges; an empty list allows all IPs; keys can be enabled, disabled, edited, and deleted.
- Validation: Go formatting, targeted Go tests, TypeScript type-check, and `git diff --check`; no frontend production build.
- Known follow-up: API key authentication for product endpoints is not implemented yet.

### 2026-07-17 - APIs sidebar item

- Goal: Add APIs navigation immediately above Settings in the global sidebar.
- Files changed: sidebar, React route table, APIs placeholder route, and work log.
- Important decisions: `/apis` is a real React Router destination with an English Coming soon state, avoiding a dead navigation item.
- Validation: TypeScript type-check and `git diff --check`; no frontend production build.
- Known follow-up: API management functionality is not implemented yet.

### 2026-07-17 - User overview system app status

- Goal: Show installation and version information from the system Apps route in User Overview.
- Files changed: app detection service/tests, system Apps route client merge, Users Overview UI, and work log.
- Important decisions: `/post/apps` is the single source for both views; versions are detected from installed binaries across supported distros; PHP reports all detected versions; User Overview links each item to its `/apps/{app}` route.
- Validation: Go formatting, targeted Go tests, TypeScript type-check, and `git diff --check`; no frontend production build.
- Known follow-up: none.

### 2026-07-17 - User app directory listing

- Goal: List a user's apps from the direct child directories of their `htdocs` folder.
- Files changed: Linux user service/tests, root-only user apps route registration and handler, Users UI, and work log.
- Important decisions: only immediate directories under `<home>/htdocs` are returned; regular files and nested descendants are excluded; usernames resolve through the existing `/home` user list instead of becoming raw filesystem paths; each app renders as an expandable accordion item ready for additional details and configuration.
- Validation: Go formatting, targeted Go tests, TypeScript type-check, and `git diff --check`; no frontend production build.
- Known follow-up: none.

### 2026-07-17 - User home folder provisioning

- Goal: Simplify the temporary User Overview and provision standard folders for every new Linux user.
- Files changed: Users route, Linux user service and test, user creation route, and work log.
- Important decisions: Overview shows an English Coming soon state; the user-type badge was replaced by compact UID, Home, and Shell boxes on the same row as the username; new homes always contain `backup`, `logs`, `data`, `htdocs`, and `config`; home and child ownership use the created user's UID/GID; failed provisioning rolls back the account.
- Validation: Go formatting, targeted Go tests, TypeScript type-check, and `git diff --check`; no frontend production build.
- Known follow-up: none.

### 2026-07-17 - Global multi-tab terminal

- Goal: Use one persistent terminal panel for root and all user shells across the app.
- Files changed: terminal context, Main, Dashboard layout, Terminal panel, Users route, and work log.
- Important decisions: terminal provider lives above routes; main sidebar activates the root tab; a user's Terminal action adds a `su -` tab; hiding or navigating does not destroy terminal tabs/sessions after first mount.
- Validation: TypeScript type-check, targeted Go tests, and `git diff --check`; no frontend production build.
- Known follow-up: none.

### 2026-07-17 - React Router migration

- Goal: Replace manual pathname routing and full-page nested navigation with React Router.
- Files changed: package manifests, Main, route table, sidebar/header navigation, Apps, Settings, Users, and work log.
- Important decisions: use `react-router-dom` v6; nested app/settings/user URLs use params; internal navigation uses Link/useNavigate; Back/Forward is router-managed.
- Validation: TypeScript type-check and `git diff --check`; no frontend production build.
- Known follow-up: top-level pages still own their DashboardLayout instances, but nested navigation no longer remounts the document/sidebar.

### 2026-07-17 - Per-user terminal section

- Goal: Add a Terminal sub-item for every Linux user.
- Files changed: terminal WebSocket backend/component, Users route, and work log.
- Important decisions: route is `/users/{username}/terminal`; root sessions launch `su - <username>` using a separate command argument; login shell starts in the target user's home; non-root sessions and unknown accounts are rejected.
- Validation: targeted Go tests, TypeScript syntax parser, and `git diff --check`; no frontend production build.
- Known follow-up: folder-only `/home` entries without a matching system account cannot open a terminal.

### 2026-07-17 - Preserve sessions through update restarts

- Goal: Prevent transient 502/network failures during update from logging the user out.
- Files changed: user context, Login route, and work log.
- Important decisions: only HTTP 401 invalidates local login state; network/5xx preserves it while protected APIs remain server-validated; login distinguishes invalid credentials from temporary server failures and never renders proxy HTML.
- Validation: TypeScript syntax parser and `git diff --check`; no frontend production build.
- Known follow-up: none.

### 2026-07-17 - Suppress transient update gateway errors

- Goal: Do not show harmless 502/503/504 or network errors while the API is restarting.
- Files changed: update header component and work log.
- Important decisions: background check errors are suppressed during the update/reconnect workflow; post-reconnect confirmation failures remain visible.
- Validation: TypeScript syntax parser and `git diff --check`; no frontend production build.
- Known follow-up: none.

### 2026-07-17 - Nested user sections

- Goal: Add Overview, Files, and Apps sub-items for every user.
- Files changed: root route matcher, Users route, and work log.
- Important decisions: user routes are `/users/{username}/overview`, `/files`, and `/apps`; direct URLs select the matching user and section; `/users` defaults to the first user's overview.
- Validation: TypeScript syntax parser and `git diff --check`; no frontend production build.
- Known follow-up: User Apps is an empty state until per-user app assignments are implemented.

### 2026-07-17 - List all home-directory users

- Goal: Make `/users` list every directory directly under `/home`.
- Files changed: Linux users service/tests and work log.
- Important decisions: removed the `user-` prefix filter; directories without an `/etc/passwd` account are still listed with UID -1; regular files are ignored.
- Validation: targeted Go tests and `git diff --check`; no frontend production build.
- Known follow-up: none.

### 2026-07-17 - Configurable automatic Linux usernames

- Goal: Make automatic username generation optional for new Linux users.
- Files changed: settings defaults/validation/UI, user creation UI/backend/tests, and work log.
- Important decisions: `users_auto_username` defaults to false; manual usernames are required and validated when disabled; automatic names use `user-` plus eight lowercase alphanumeric characters.
- Validation: targeted Go tests, TypeScript syntax parser, and `git diff --check`; no frontend production build.
- Known follow-up: none.

### 2026-07-17 - Nested settings routes

- Goal: Give each Settings section a dedicated URL.
- Files changed: route matcher, main sidebar, Settings route, and work log.
- Important decisions: routes are `/settings/general`, `/settings/users`, and `/settings/apps`; `/settings` falls back to General Settings.
- Validation: TypeScript syntax parser and `git diff --check`; no frontend production build.
- Known follow-up: none.

### 2026-07-17 - Prefixed settings and Linux user defaults

- Goal: Rename User Settings to Users Settings and persist defaults used by Linux user creation.
- Files changed: settings database/service/API, app context, Settings route, user-add route, tests, and work log.
- Important decisions: sidebar order is General → Users → Apps; keys use `general_`, `users_`, and `apps_`; legacy keys migrate automatically; useradd uses configured shell, home base, and create-home preference.
- Validation: targeted Go tests and `git diff --check`; no frontend production build.
- Known follow-up: none.

### 2026-07-17 - User settings and sortable app shortcuts

- Goal: Add User Settings and redesign Apps Settings for installed and pinned apps.
- Files changed: Settings route and work log.
- Important decisions: Apps Settings uses installed/header columns; pinned apps support drag/drop and accessible up/down sorting; the narrow header-pin subtitle was removed.
- Validation: `git diff --check`; no frontend production build.
- Known follow-up: none.

### 2026-07-17 - App header pin action

- Goal: Add or remove each app from the global header directly from its app page.
- Files changed: Apps route and work log.
- Important decisions: icon-only Pin/PinOff action sits beside service controls and uses the existing SQLite-backed `header_apps` setting.
- Validation: `git diff --check`; no frontend production build.
- Known follow-up: none.

### 2026-07-17 - Nested app routes

- Goal: Give every app a dedicated URL such as `/apps/nginx` and `/apps/docker`.
- Files changed: route matcher, main sidebar, Header shortcuts, Apps route, and work log.
- Important decisions: `/apps` remains valid; app selection updates browser history; Back/Forward restores the selected app.
- Validation: `git diff --check`; no frontend production build.
- Known follow-up: none.

### 2026-07-17 - SQLite settings and app header shortcuts

- Goal: Persist panel settings and configurable app shortcuts in SQLite.
- Files changed: settings service/routes/tests, route dependencies, app context/API map, Header, Apps route, Settings route, and Go module files.
- Important decisions: default database path is `~/.mthan-vps/data/db.sqlite`; `settings` uses key/value rows; Settings sidebar includes General Settings and Apps Settings; header shortcuts are configurable per app.
- Validation: targeted Go tests and `git diff --check`; no frontend production build.
- Known follow-up: none.

### 2026-07-17 - General settings sidebar

- Goal: Add the first Settings section with persistent app identity and appearance preferences.
- Files changed: app context, dashboard layout, color-mode utilities/switch, Settings route, and app-settings utility.
- Important decisions: Settings uses a left sidebar with `General Settings`; App Name updates the header/document title; color mode supports System, Light, and Dark and applies immediately.
- Validation: `git diff --check`; no frontend production build.
- Known follow-up: none.

### 2026-07-17 - Post-update reload countdown

- Goal: Avoid reloading while the reverse proxy may still return a transient 502 after API restart.
- Files changed: `client/src/_layouts/_components/header.tsx`, `.agents/works.md`.
- Important decisions: wait 10 seconds after successful reconnect and update confirmation, show the countdown in the modal, then reload the window.
- Validation: `git diff --check`; no frontend production build.
- Known follow-up: none.

### 2026-07-16 - Update reload and consolidated PHP app

- Goal: Reload safely after update reconnect and represent PHP versions as configuration of one app.
- Files changed:
  - `client/src/_layouts/_components/header.tsx`
  - `client/src/routes/apps/index.tsx`
  - `services/apps.go`
  - `services/apps_test.go`
- Important decisions:
  - Window reload occurs only after two successful health responses and update confirmation.
  - PHP is a single Apps sidebar entry; detected PHP 8.1–8.4 versions appear in its configuration panel.
  - PHP service detection is limited to services matching detected versions.
- Validation: targeted Go tests and `git diff --check`; no frontend production build.
- Known follow-up: none.

### 2026-07-16 - Cross-distribution app detection

- Goal: Add Docker, Podman, Node.js, and parallel PHP versions to the Apps panel.
- Files changed:
  - `services/apps.go`
  - `services/apps_test.go`
  - `client/src/routes/apps/index.tsx`
- Important decisions:
  - Added PHP 8.1–8.4 as separate apps.
  - Detection supports Debian/Ubuntu versioned PHP-FPM names, RHEL/Remi paths and units, and Arch/RHEL generic PHP-FPM units.
  - Node.js is installation-only and does not expose system service controls.
  - Docker and Podman detect their native systemd service/socket states.
- Validation: targeted Go tests and `git diff --check` passed; frontend production build was intentionally not run for this incremental UI change.
- Known follow-up: service action buttons still use the existing client-side placeholder behavior and need a backend action endpoint before they control real services.

### 2026-07-08 - Debian RPM Arch installer support

- Goal: Update app/install docs so the service can install runtime dependencies on Debian, RPM-based systems, and Arch.
- Files changed:
  - `README.md`
  - `scripts/install.sh`
  - `.agents/works.md`
- Important decisions:
  - Kept the app's cgo/libcrypt auth implementation because Linux password login needs `crypt(3)`.
  - Added `pacman` support to install `libxcrypt-compat` on Arch Linux.
  - README now documents runtime dependency commands for Debian/Ubuntu, RHEL/Fedora/Amazon Linux, and Arch Linux.
- Validation: pending.
- Known follow-up: Push updated installer and rebuilt dist binaries before testing the remote install command on fresh VPS images.

### 2026-07-08 - libcrypt runtime dependency

- Goal: Fix VPS runtime error `/usr/local/bin/mthan-vps: error while loading shared libraries: libcrypt.so.1`.
- Files changed:
  - `README.md`
  - `scripts/install.sh`
  - `.agents/works.md`
- Important decisions:
  - Kept cgo/libcrypt auth path because Linux user login verifies `/etc/shadow` hashes through `crypt(3)`.
  - Added installer check for `libcrypt.so.1`.
  - Installer now attempts to install `libcrypt1` on apt systems and `libxcrypt-compat` on dnf/yum/apk systems before starting service.
  - README now documents the runtime dependency and manual recovery command.
- Validation: pending.
- Known follow-up: Push updated installer to the distribution repo before relying on one-line remote install.

### 2026-07-08 - GitHub raw 429 install workaround

- Goal: Investigate install command failing with `curl: (22) The requested URL returned error: 429`.
- Files changed:
  - `README.md`
  - `scripts/install.sh`
  - `.agents/works.md`
- Important decisions:
  - Confirmed `github.com/.../raw/...` redirects to `raw.githubusercontent.com`, which returned `HTTP/2 429` from GitHub/Fastly.
  - Confirmed jsDelivr URLs returned `HTTP/2 200` for `scripts/install.sh`, `bin/mthan-vps`, and `bin/mthanctl`.
  - Updated installer default `BIN_URL` and README install commands to use jsDelivr.
- Validation:
  - `curl -I -L https://github.com/antoine-mai/mthan-tools-vps/raw/main/scripts/install.sh`
  - `curl -fsSL https://raw.githubusercontent.com/antoine-mai/mthan-tools-vps/main/scripts/install.sh | head -5`
  - `curl -I -L https://cdn.jsdelivr.net/gh/antoine-mai/mthan-tools-vps@main/scripts/install.sh`
  - `curl -I -L https://cdn.jsdelivr.net/gh/antoine-mai/mthan-tools-vps@main/bin/mthan-vps`
  - `curl -I -L https://cdn.jsdelivr.net/gh/antoine-mai/mthan-tools-vps@main/bin/mthanctl`
- Known follow-up: Push changes to GitHub so the public install command uses the updated script.

### 2026-07-08 - README and installer help

- Goal: Update installation documentation to match `scripts/install.sh`.
- Files changed:
  - `README.md`
  - `scripts/install.sh`
  - `.agents/works.md`
- Important decisions:
  - Documented root install flow, installed files, root URL, `--reinstall`, environment overrides, and common systemd commands.
  - Added the same environment override details to `install.sh --help`.
- Validation: not run; documentation/help text only.
- Known follow-up: none.

### 2026-07-07 - Agent rules and handoff files

- Created `.agents/rules/project.md` with project rules for future agents.
- Created `.agents/works.md` as the shared handoff log.
- Observed pre-existing modified files:
  - `client/src/_layouts/_components/header.tsx`
  - `client/src/routes/root/users/index.tsx`
- Validation: not run; documentation-only change.

## Handoff Template

### YYYY-MM-DD - Short task title

- Goal:
- Files changed:
- Important decisions:
- Validation:
- Known follow-up:
# Public distribution layout migration

- Goal: Move the published installer to `public/install.sh` and all distribution artifacts from `bin`/`dist` into `public/dist`.
- Changed: build scripts, Makefile, development watcher exclusions, updater URLs, static-client fallbacks, README, and project rules now use the public layout.
- Validation: `bash -n` passed for build, control build, deploy, and installer scripts; `git diff --check` passed. Full builds were not run.
# VHost edit and delete actions

- Added root-only Edit and Delete actions to the Caddy VHosts table.
- Edit opens a Caddyfile modal and reloads Caddy after saving.
- Delete removes the matching top-level site block, reloads Caddy, and restores the previous file if reload fails.
# Files explorer item context menu

- Added a right-click context menu to every file and directory in the Files sidebar.
- Supports Open, directory refresh, and copying the absolute path, with viewport-aware positioning and automatic dismissal.
# Files editor color-mode support

- Replaced the FileEditor hard-coded slate dark palette with semantic theme colors.
- Empty, loading, error, binary, editor, line-number, tab, and status states now follow light and dark mode.
# Files context-menu mutations

- Added Rename and Delete for file-system items, plus New File and New Folder for directories.
- Added authenticated POST/PATCH/DELETE handlers for both root and standard-user Files routes.
- Standard-user mutations remain jailed to the resolved home path; root/home explorer nodes cannot be renamed or deleted.
# Resilient user terminals

- Added a 20-second application heartbeat so idle terminal WebSockets remain active through proxies and NAT gateways.
- Terminal tabs now detect disconnects, display connection status, and automatically reconnect to a fresh shell.
- The terminal session effect now correctly follows its target username.
