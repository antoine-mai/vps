package services

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

var allowedContainerID = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_.-]*$`)
var allowedAppName = regexp.MustCompile(`^[a-z0-9_-]+$`)

var (
	ErrContainerDockerfileDenied  = errors.New("Dockerfile access denied")
	ErrContainerDockerfileMissing = errors.New("Dockerfile not found")
)

type ContainerDockerfile struct {
	Content string `json:"content"`
	Path    string `json:"path"`
}

type Container struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Image        string   `json:"image"`
	Command      string   `json:"command,omitempty"`
	Engine       string   `json:"engine"`
	Owner        string   `json:"owner"`
	State        string   `json:"state"`
	Status       string   `json:"status"`
	CreatedAt    string   `json:"createdAt,omitempty"`
	Ports        []string `json:"ports"`
	Type         string   `json:"type"`                   // "docker" | "direct"
	Runtime      string   `json:"runtime,omitempty"`      // "php", "node", "python", "static", "docker"
	Path         string   `json:"path"`                   // absolute path: /home/<user>/htdocs/<app>
	RelativePath string   `json:"relativePath"`           // relative: htdocs/<app>
}

type AppMeta struct {
	Name        string   `json:"name"`
	Owner       string   `json:"owner"`
	Type        string   `json:"type"`              // "docker" | "direct"
	Runtime     string   `json:"runtime,omitempty"` // "php", "node", "python", "static", "docker"
	Image       string   `json:"image,omitempty"`
	ContainerID string   `json:"containerId,omitempty"`
	Ports       []string `json:"ports,omitempty"`
	CreatedAt   string   `json:"createdAt,omitempty"`
}

func readAppMeta(dir string) (AppMeta, bool) {
	data, err := os.ReadFile(filepath.Join(dir, ".app.json"))
	if err != nil {
		return AppMeta{}, false
	}
	var meta AppMeta
	if err := json.Unmarshal(data, &meta); err != nil {
		return AppMeta{}, false
	}
	return meta, true
}

func chownUser(path string, linuxUser LinuxUser) {
	if linuxUser.UID <= 0 {
		return
	}
	gid := linuxUser.UID
	if u, err := user.Lookup(linuxUser.Username); err == nil {
		if g, err := strconv.Atoi(u.Gid); err == nil {
			gid = g
		}
	}
	_ = os.Chown(path, linuxUser.UID, gid)
}

func writeAppMeta(dir string, meta AppMeta, linuxUser LinuxUser) error {
	data, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return err
	}
	path := filepath.Join(dir, ".app.json")
	if err := os.WriteFile(path, data, 0644); err != nil {
		return err
	}
	chownUser(path, linuxUser)
	return nil
}

func detectDirectRuntime(dir string) string {
	if _, err := os.Stat(filepath.Join(dir, "index.php")); err == nil {
		return "php"
	}
	if _, err := os.Stat(filepath.Join(dir, "composer.json")); err == nil {
		return "php"
	}
	if _, err := os.Stat(filepath.Join(dir, "package.json")); err == nil {
		return "node"
	}
	if _, err := os.Stat(filepath.Join(dir, "server.js")); err == nil {
		return "node"
	}
	if _, err := os.Stat(filepath.Join(dir, "requirements.txt")); err == nil {
		return "python"
	}
	if _, err := os.Stat(filepath.Join(dir, "app.py")); err == nil {
		return "python"
	}
	if _, err := os.Stat(filepath.Join(dir, "main.py")); err == nil {
		return "python"
	}
	if _, err := os.Stat(filepath.Join(dir, "index.html")); err == nil {
		return "static"
	}
	return "custom"
}

func scaffoldDirectApp(dir, appName, runtime string, linuxUser LinuxUser) error {
	switch runtime {
	case "php":
		content := fmt.Sprintf("<?php\n// Application: %s\nheader('Content-Type: text/html; charset=utf-8');\n?>\n<!DOCTYPE html>\n<html>\n<head><title>%s</title><style>body{font-family:system-ui,sans-serif;padding:2rem;line-height:1.6}</style></head>\n<body>\n  <h1>Welcome to %s</h1>\n  <p>Your PHP application is ready in <code>htdocs/%s</code>.</p>\n  <hr/>\n  <p>PHP Version: <?php echo phpversion(); ?></p>\n</body>\n</html>\n", appName, appName, appName, appName)
		_ = os.WriteFile(filepath.Join(dir, "index.php"), []byte(content), 0644)
		chownUser(filepath.Join(dir, "index.php"), linuxUser)
	case "node":
		pkg := fmt.Sprintf("{\n  \"name\": \"%s\",\n  \"version\": \"1.0.0\",\n  \"description\": \"Node.js application\",\n  \"main\": \"server.js\",\n  \"scripts\": {\n    \"start\": \"node server.js\"\n  }\n}\n", appName)
		srv := fmt.Sprintf("const http = require('http');\nconst port = process.env.PORT || 3000;\n\nconst server = http.createServer((req, res) => {\n  res.statusCode = 200;\n  res.setHeader('Content-Type', 'text/html; charset=utf-8');\n  res.end('<h1>Welcome to %s</h1><p>Node.js application running in <code>htdocs/%s</code></p>');\n});\n\nserver.listen(port, () => {\n  console.log('Server running on port ' + port);\n});\n", appName, appName)
		_ = os.WriteFile(filepath.Join(dir, "package.json"), []byte(pkg), 0644)
		_ = os.WriteFile(filepath.Join(dir, "server.js"), []byte(srv), 0644)
		chownUser(filepath.Join(dir, "package.json"), linuxUser)
		chownUser(filepath.Join(dir, "server.js"), linuxUser)
	case "python":
		appPy := fmt.Sprintf("import os\nfrom http.server import HTTPServer, BaseHTTPRequestHandler\n\nPORT = int(os.environ.get(\"PORT\", 8000))\n\nclass Handler(BaseHTTPRequestHandler):\n    def do_GET(self):\n        self.send_response(200)\n        self.send_header(\"Content-type\", \"text/html; charset=utf-8\")\n        self.end_headers()\n        html = f\"<h1>Welcome to %s</h1><p>Python application running in <code>htdocs/%s</code></p>\"\n        self.wfile.write(html.encode(\"utf-8\"))\n\nif __name__ == \"__main__\":\n    server = HTTPServer((\"\", PORT), Handler)\n    print(f\"Server listening on port {PORT}\")\n    server.serve_forever()\n", appName, appName)
		_ = os.WriteFile(filepath.Join(dir, "app.py"), []byte(appPy), 0644)
		chownUser(filepath.Join(dir, "app.py"), linuxUser)
	default:
		indexHtml := fmt.Sprintf("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n  <title>%s</title>\n  <style>\n    body { font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif; display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0; background: #f8fafc; color: #0f172a; }\n    .card { background: white; padding: 2.5rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); max-width: 500px; text-align: center; }\n    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #1e293b; }\n    p { color: #64748b; font-size: 0.95rem; line-height: 1.5; }\n    code { background: #f1f5f9; padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.85rem; color: #3b82f6; }\n  </style>\n</head>\n<body>\n  <div class=\"card\">\n    <h1>🚀 %s</h1>\n    <p>Your application is ready in <code>htdocs/%s</code>.</p>\n    <p>Upload or edit your files in the File Manager to start building.</p>\n  </div>\n</body>\n</html>\n", appName, appName, appName)
		_ = os.WriteFile(filepath.Join(dir, "index.html"), []byte(indexHtml), 0644)
		chownUser(filepath.Join(dir, "index.html"), linuxUser)
	}
	return nil
}

type containerCommandRunner interface {
	Run(name string, args ...string) ([]byte, error)
}

type containerTimeoutRunner interface {
	RunWithTimeout(timeout time.Duration, name string, args ...string) ([]byte, error)
}

type timedContainerCommandRunner struct{}

func (timedContainerCommandRunner) Run(name string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return exec.CommandContext(ctx, name, args...).CombinedOutput()
}

func (timedContainerCommandRunner) RunWithTimeout(timeout time.Duration, name string, args ...string) ([]byte, error) {
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	return exec.CommandContext(ctx, name, args...).CombinedOutput()
}

type ContainerService struct {
	runner containerCommandRunner
	limits *UserLimitsService
}

func NewContainerService() *ContainerService {
	return &ContainerService{runner: timedContainerCommandRunner{}}
}

func (s *ContainerService) SetLimitsService(limits *UserLimitsService) {
	s.limits = limits
}

func (s *ContainerService) ListAll() []Container {
	result := s.listRootContainers()
	users, _ := HomeUsers()

	var mu sync.Mutex
	var wait sync.WaitGroup
	limit := make(chan struct{}, 4)
	for _, linuxUser := range users {
		if linuxUser.UID <= 0 {
			continue
		}
		wait.Add(1)
		go func(u LinuxUser) {
			defer wait.Done()
			limit <- struct{}{}
			apps := s.ListForOwner(u.Username)
			<-limit
			mu.Lock()
			result = append(result, apps...)
			mu.Unlock()
		}(linuxUser)
	}
	wait.Wait()
	sortContainers(result)
	return result
}

func (s *ContainerService) ListCurrentUser(username string) []Container {
	return s.ListForOwner(username)
}

func (s *ContainerService) listRawContainersForOwner(owner string) []Container {
	output, err := s.runForOwner("podman", owner, "ps", "-a", "--format", "json")
	if err != nil {
		return []Container{}
	}
	return parsePodmanContainers(output, owner)
}

func (s *ContainerService) ListForOwner(owner string) []Container {
	if owner == "root" || owner == "system" {
		return s.listRootContainers()
	}

	linuxUser, exists, err := HomeUser(owner)
	if err != nil || !exists || linuxUser.UID <= 0 {
		return []Container{}
	}

	htdocsDir := filepath.Join(linuxUser.Home, "htdocs")
	_ = os.MkdirAll(htdocsDir, 0755)
	chownUser(htdocsDir, linuxUser)

	rawContainers := s.listRawContainersForOwner(owner)
	containersByName := make(map[string]Container)
	containersByID := make(map[string]Container)
	for _, c := range rawContainers {
		if c.Name != "" {
			containersByName[c.Name] = c
		}
		if c.ID != "" {
			containersByID[c.ID] = c
		}
	}

	seenApps := make(map[string]bool)
	var result []Container

	entries, err := os.ReadDir(htdocsDir)
	if err == nil {
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			appName := entry.Name()
			if strings.HasPrefix(appName, ".") {
				continue
			}
			seenApps[appName] = true
			appPath := filepath.Join(htdocsDir, appName)
			appMeta, hasMeta := readAppMeta(appPath)

			var matchedContainer *Container
			if hasMeta && appMeta.ContainerID != "" {
				if c, ok := containersByID[appMeta.ContainerID]; ok {
					matchedContainer = &c
				}
			}
			if matchedContainer == nil {
				if c, ok := containersByName[appName]; ok {
					matchedContainer = &c
				}
			}

			if matchedContainer != nil {
				c := *matchedContainer
				c.Type = "docker"
				if appMeta.Runtime != "" {
					c.Runtime = appMeta.Runtime
				} else {
					c.Runtime = "docker"
				}
				c.Path = appPath
				c.RelativePath = filepath.Join("htdocs", appName)
				result = append(result, c)
			} else if hasMeta && appMeta.Type == "docker" {
				result = append(result, Container{
					ID:           appMeta.ContainerID,
					Name:         appName,
					Image:        appMeta.Image,
					Engine:       "podman",
					Owner:        owner,
					State:        "stopped",
					Status:       "Stopped",
					CreatedAt:    appMeta.CreatedAt,
					Ports:        appMeta.Ports,
					Type:         "docker",
					Runtime:      "docker",
					Path:         appPath,
					RelativePath: filepath.Join("htdocs", appName),
				})
			} else {
				runtime := appMeta.Runtime
				if runtime == "" {
					runtime = detectDirectRuntime(appPath)
				}
				result = append(result, Container{
					ID:           appName,
					Name:         appName,
					Engine:       "direct",
					Owner:        owner,
					State:        "ready",
					Status:       "Ready",
					Type:         "direct",
					Runtime:      runtime,
					Path:         appPath,
					RelativePath: filepath.Join("htdocs", appName),
					CreatedAt:    appMeta.CreatedAt,
				})
			}
		}
	}

	for _, c := range rawContainers {
		if c.Name != "" && !seenApps[c.Name] {
			appDir := filepath.Join(htdocsDir, c.Name)
			_ = os.MkdirAll(appDir, 0755)
			chownUser(appDir, linuxUser)
			_ = writeAppMeta(appDir, AppMeta{
				Name:        c.Name,
				Owner:       owner,
				Type:        "docker",
				Runtime:     "docker",
				Image:       c.Image,
				ContainerID: c.ID,
				Ports:       c.Ports,
				CreatedAt:   c.CreatedAt,
			}, linuxUser)

			c.Type = "docker"
			c.Runtime = "docker"
			c.Path = appDir
			c.RelativePath = filepath.Join("htdocs", c.Name)
			result = append(result, c)
			seenApps[c.Name] = true
		}
	}

	sortContainers(result)
	return result
}

func (s *ContainerService) ActionAll(engine, owner, id, action string) error {
	if owner == "root" || owner == "system" {
		if engine == "" {
			engine = "docker"
		}
		args, err := containerActionArgs(id, action)
		if err != nil {
			return err
		}
		_, err = s.runForOwner(engine, owner, args...)
		if action == "rm" {
			appDir := filepath.Join("/root/htdocs", id)
			_ = os.RemoveAll(appDir)
		}
		return err
	}

	linuxUser, exists, err := HomeUser(owner)
	if err != nil || !exists {
		return errors.New("invalid app owner")
	}

	appName := id
	containers := s.listRawContainersForOwner(owner)
	var matchedContainer *Container
	for _, c := range containers {
		if c.ID == id || c.Name == id {
			matchedContainer = &c
			appName = c.Name
			break
		}
	}

	if action == "rm" {
		if matchedContainer != nil {
			_, _ = s.runForOwner("podman", owner, "rm", "-f", matchedContainer.ID)
		}
		appDir := filepath.Join(linuxUser.Home, "htdocs", appName)
		if pathWithin(appDir, filepath.Join(linuxUser.Home, "htdocs")) {
			_ = os.RemoveAll(appDir)
		}
		return nil
	}

	if matchedContainer != nil {
		args, err := containerActionArgs(matchedContainer.ID, action)
		if err != nil {
			return err
		}
		_, err = s.runForOwner(engine, owner, args...)
		return err
	}

	return nil
}

func (s *ContainerService) LogsAll(engine, owner, id string) (string, error) {
	if owner == "root" || owner == "system" {
		if !allowedContainerID.MatchString(id) {
			return "", errors.New("invalid container")
		}
		if engine == "" {
			engine = "docker"
		}
		output, err := s.runForOwner(engine, owner, "logs", "--tail", "200", id)
		if err == nil {
			return string(output), nil
		}
		appDir := filepath.Join("/root/htdocs", id)
		for _, logFile := range []string{"app.log", "logs/app.log", "output.log", "error.log"} {
			logPath := filepath.Join(appDir, logFile)
			if data, rErr := os.ReadFile(logPath); rErr == nil {
				return string(data), nil
			}
		}
		return string(output), err
	}

	linuxUser, exists, err := HomeUser(owner)
	if err != nil || !exists {
		return "", errors.New("invalid app owner")
	}

	containers := s.listRawContainersForOwner(owner)
	for _, c := range containers {
		if c.ID == id || c.Name == id {
			output, err := s.runForOwner(engine, owner, "logs", "--tail", "200", c.ID)
			return string(output), err
		}
	}

	appDir := filepath.Join(linuxUser.Home, "htdocs", id)
	for _, logFile := range []string{"app.log", "logs/app.log", "output.log", "error.log"} {
		logPath := filepath.Join(appDir, logFile)
		if data, err := os.ReadFile(logPath); err == nil {
			return string(data), nil
		}
	}
	return fmt.Sprintf("Direct application located at htdocs/%s\nNo container logs or log file detected.", id), nil
}

func (s *ContainerService) ActionCurrentUser(username, id, action string) error {
	return s.ActionAll("podman", username, id, action)
}

func (s *ContainerService) LogsCurrentUser(username, id string) (string, error) {
	return s.LogsAll("podman", username, id)
}

func (s *ContainerService) DockerfileAll(engine, owner, id string) (ContainerDockerfile, error) {
	if owner == "root" || owner == "system" {
		appDir := filepath.Join("/root/htdocs", id)
		for _, name := range []string{"Dockerfile", "Containerfile"} {
			dfPath := filepath.Join(appDir, name)
			if _, statErr := os.Stat(dfPath); statErr == nil {
				return readContainerDockerfile(dfPath)
			}
		}
	} else if linuxUser, exists, err := HomeUser(owner); err == nil && exists {
		appDir := filepath.Join(linuxUser.Home, "htdocs", id)
		for _, name := range []string{"Dockerfile", "Containerfile"} {
			dfPath := filepath.Join(appDir, name)
			if _, statErr := os.Stat(dfPath); statErr == nil {
				return readContainerDockerfile(dfPath)
			}
		}
	}
	path, err := s.containerDockerfilePath(engine, owner, id)
	if err != nil {
		return ContainerDockerfile{}, err
	}
	return readContainerDockerfile(path)
}

func (s *ContainerService) WriteDockerfileAll(engine, owner, id, content string) (ContainerDockerfile, error) {
	if owner == "root" || owner == "system" {
		appDir := filepath.Join("/root/htdocs", id)
		if stat, statErr := os.Stat(appDir); statErr == nil && stat.IsDir() {
			dfPath := filepath.Join(appDir, "Dockerfile")
			return writeContainerDockerfile(dfPath, content)
		}
	} else if linuxUser, exists, err := HomeUser(owner); err == nil && exists {
		appDir := filepath.Join(linuxUser.Home, "htdocs", id)
		if stat, statErr := os.Stat(appDir); statErr == nil && stat.IsDir() {
			dfPath := filepath.Join(appDir, "Dockerfile")
			return writeContainerDockerfile(dfPath, content)
		}
	}
	path, err := s.containerDockerfilePath(engine, owner, id)
	if err != nil {
		return ContainerDockerfile{}, err
	}
	return writeContainerDockerfile(path, content)
}

func (s *ContainerService) DockerfileCurrentUser(username, id string) (ContainerDockerfile, error) {
	return s.DockerfileAll("podman", username, id)
}

func (s *ContainerService) WriteDockerfileCurrentUser(username, id, content string) (ContainerDockerfile, error) {
	return s.WriteDockerfileAll("podman", username, id, content)
}

func (s *ContainerService) containerDockerfilePath(engine, owner, id string) (string, error) {
	if !allowedContainerID.MatchString(id) {
		return "", ErrContainerDockerfileDenied
	}
	output, err := s.runForOwner(engine, owner, "inspect", id)
	if err != nil {
		return "", err
	}
	return containerDockerfilePathFromInspect(output, engine, owner)
}

func containerDockerfilePathFromInspect(output []byte, engine, owner string) (string, error) {
	var inspected []map[string]any
	if json.Unmarshal(output, &inspected) != nil || len(inspected) == 0 {
		return "", ErrContainerDockerfileMissing
	}
	config, _ := inspected[0]["Config"].(map[string]any)
	labels, _ := config["Labels"].(map[string]any)
	path := strings.TrimSpace(fmt.Sprint(labels["mthan.dockerfile"]))
	if path == "" || path == "<nil>" {
		path = strings.TrimSpace(fmt.Sprint(labels["mthan.containerfile"]))
	}
	if path == "" || path == "<nil>" {
		workingDirectory := strings.TrimSpace(fmt.Sprint(labels["com.docker.compose.project.working_dir"]))
		if workingDirectory != "" && workingDirectory != "<nil>" {
			path = filepath.Join(workingDirectory, "Dockerfile")
			if _, err := os.Stat(path); err != nil {
				containerfilePath := filepath.Join(workingDirectory, "Containerfile")
				if _, err := os.Stat(containerfilePath); err == nil {
					path = containerfilePath
				}
			}
		}
	}
	path = filepath.Clean(path)
	if path == "." || !filepath.IsAbs(path) {
		return "", ErrContainerDockerfileMissing
	}
	if owner != "root" && owner != "system" {
		linuxUser, exists, lookupErr := HomeUser(owner)
		if lookupErr != nil || !exists || !pathWithin(path, linuxUser.Home) {
			return "", ErrContainerDockerfileDenied
		}
	}
	return path, nil
}

func readContainerDockerfile(path string) (ContainerDockerfile, error) {
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return ContainerDockerfile{}, ErrContainerDockerfileMissing
	}
	if err != nil || !info.Mode().IsRegular() || info.Size() > maxAppConfigSize {
		return ContainerDockerfile{}, ErrContainerDockerfileDenied
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return ContainerDockerfile{}, err
	}
	return ContainerDockerfile{Content: string(content), Path: path}, nil
}

func writeContainerDockerfile(path, content string) (ContainerDockerfile, error) {
	if len(content) > maxAppConfigSize || strings.ContainsRune(content, 0) {
		return ContainerDockerfile{}, ErrContainerDockerfileDenied
	}
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() {
		return ContainerDockerfile{}, ErrContainerDockerfileDenied
	}
	temporary, err := os.CreateTemp(filepath.Dir(path), ".mthan-dockerfile-*")
	if err != nil {
		return ContainerDockerfile{}, err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(info.Mode().Perm()); err != nil {
		temporary.Close()
		return ContainerDockerfile{}, err
	}
	if _, err := temporary.WriteString(content); err != nil {
		temporary.Close()
		return ContainerDockerfile{}, err
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return ContainerDockerfile{}, err
	}
	if err := temporary.Close(); err != nil {
		return ContainerDockerfile{}, err
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		return ContainerDockerfile{}, err
	}
	return ContainerDockerfile{Content: content, Path: path}, nil
}

func pathWithin(path, root string) bool {
	cleanPath := filepath.Clean(path)
	cleanRoot := filepath.Clean(root)
	return cleanPath == cleanRoot || strings.HasPrefix(cleanPath, cleanRoot+string(filepath.Separator))
}

func (s *ContainerService) runForOwnerWithTimeout(timeout time.Duration, engine, owner string, args ...string) ([]byte, error) {
	if tr, ok := s.runner.(containerTimeoutRunner); ok {
		if owner == "root" || owner == "system" {
			cmd := "docker"
			if engine == "podman" {
				cmd = "podman"
			}
			return tr.RunWithTimeout(timeout, cmd, args...)
		}
		linuxUser, exists, err := HomeUser(owner)
		if err != nil || !exists || linuxUser.UID < 0 {
			return nil, errors.New("invalid container owner")
		}
		command := []string{
			"--user", linuxUser.Username, "--", "env", "HOME=" + linuxUser.Home,
			fmt.Sprintf("XDG_RUNTIME_DIR=/run/user/%d", linuxUser.UID), "podman",
		}
		return tr.RunWithTimeout(timeout, "runuser", append(command, args...)...)
	}
	return s.runForOwner(engine, owner, args...)
}

func (s *ContainerService) runForOwner(engine, owner string, args ...string) ([]byte, error) {
	if owner == "root" || owner == "system" {
		cmd := "docker"
		if engine == "podman" {
			cmd = "podman"
		}
		return s.runner.Run(cmd, args...)
	}
	linuxUser, exists, err := HomeUser(owner)
	if err != nil || !exists || linuxUser.UID < 0 {
		return nil, errors.New("invalid container owner")
	}
	command := []string{
		"--user", linuxUser.Username, "--", "env", "HOME=" + linuxUser.Home,
		fmt.Sprintf("XDG_RUNTIME_DIR=/run/user/%d", linuxUser.UID), "podman",
	}
	return s.runner.Run("runuser", append(command, args...)...)
}

type CreateContainerInput struct {
	Name          string            `json:"name"`
	Image         string            `json:"image"`
	Owner         string            `json:"owner"`
	Command       string            `json:"command,omitempty"`
	RestartPolicy string            `json:"restartPolicy,omitempty"`
	Ports         []string          `json:"ports,omitempty"`
	Volumes       []string          `json:"volumes,omitempty"`
	Env           map[string]string `json:"env,omitempty"`
	Type          string            `json:"type,omitempty"`    // "docker" | "direct"
	Runtime       string            `json:"runtime,omitempty"` // "php" | "node" | "python" | "static"
}

func buildCreateContainerArgs(input CreateContainerInput) ([]string, error) {
	input.Image = strings.TrimSpace(input.Image)
	if input.Image == "" {
		return nil, errors.New("container image is required")
	}
	if strings.ContainsAny(input.Image, " \t\r\n;&|`$><\"'") {
		return nil, errors.New("invalid image name")
	}

	args := []string{"run", "-d"}

	input.Name = strings.TrimSpace(input.Name)
	if input.Name != "" {
		if !allowedAppName.MatchString(input.Name) {
			return nil, errors.New("invalid container name: lowercase letters, numbers, hyphens (-), and underscores (_) only")
		}
		args = append(args, "--name", input.Name)
	}

	if input.RestartPolicy != "" {
		switch input.RestartPolicy {
		case "no", "always", "on-failure", "unless-stopped":
			args = append(args, "--restart", input.RestartPolicy)
		default:
			return nil, errors.New("invalid restart policy")
		}
	}

	for _, p := range input.Ports {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if strings.ContainsAny(p, " \t\r\n;&|`$><\"'") {
			return nil, fmt.Errorf("invalid port mapping: %s", p)
		}
		args = append(args, "-p", p)
	}

	for _, v := range input.Volumes {
		v = strings.TrimSpace(v)
		if v == "" {
			continue
		}
		if strings.ContainsAny(v, " \t\r\n;&|`$><\"'") {
			return nil, fmt.Errorf("invalid volume mapping: %s", v)
		}
		args = append(args, "-v", v)
	}

	for k, val := range input.Env {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		if strings.ContainsAny(k, "= \t\r\n;&|`$><\"'") {
			return nil, fmt.Errorf("invalid environment variable key: %s", k)
		}
		args = append(args, "-e", fmt.Sprintf("%s=%s", k, val))
	}

	args = append(args, input.Image)

	if cmd := strings.TrimSpace(input.Command); cmd != "" {
		args = append(args, strings.Fields(cmd)...)
	}

	return args, nil
}

func (s *ContainerService) CreateContainer(input CreateContainerInput) (string, error) {
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || !allowedAppName.MatchString(input.Name) {
		return "", errors.New("invalid app name: lowercase letters, numbers, hyphens (-), and underscores (_) only")
	}

	input.Owner = strings.TrimSpace(input.Owner)
	if input.Owner == "" {
		return "", errors.New("app owner is required")
	}

	isRoot := input.Owner == "root" || input.Owner == "system"
	var linuxUser LinuxUser
	if isRoot {
		input.Owner = "root"
		linuxUser = LinuxUser{
			Username: "root",
			Home:     "/root",
			UID:      0,
		}
	} else {
		u, exists, err := HomeUser(input.Owner)
		if err != nil || !exists || u.UID <= 0 {
			return "", errors.New("invalid app owner: user must exist and be non-root")
		}
		linuxUser = u
	}

	if input.Type == "" {
		if input.Image != "" {
			input.Type = "docker"
		} else {
			input.Type = "direct"
		}
	}

	// Ensure home is executable (0711) and htdocs is readable (0755) for web server traversal
	if linuxUser.Home != "" && linuxUser.Home != "/" {
		if !isRoot {
			_ = os.Chmod(linuxUser.Home, 0711)
		}
		htdocsDir := filepath.Join(linuxUser.Home, "htdocs")
		_ = os.MkdirAll(htdocsDir, 0755)
		_ = os.Chmod(htdocsDir, 0755)
		chownUser(htdocsDir, linuxUser)
	}

	appDir := filepath.Join(linuxUser.Home, "htdocs", input.Name)
	if _, err := os.Stat(appDir); err == nil {
		return "", fmt.Errorf("app folder htdocs/%s already exists", input.Name)
	}

	if err := os.MkdirAll(appDir, 0755); err != nil {
		return "", err
	}
	_ = os.Chmod(appDir, 0755)
	chownUser(appDir, linuxUser)

	if input.Type == "direct" {
		if input.Runtime == "" {
			input.Runtime = "static"
		}
		if err := scaffoldDirectApp(appDir, input.Name, input.Runtime, linuxUser); err != nil {
			_ = os.RemoveAll(appDir)
			return "", err
		}
		_ = writeAppMeta(appDir, AppMeta{
			Name:      input.Name,
			Owner:     input.Owner,
			Type:      "direct",
			Runtime:   input.Runtime,
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
		}, linuxUser)
		return input.Name, nil
	}

	// Docker App
	if s.limits != nil {
		userApps := s.ListForOwner(input.Owner)
		if err := s.limits.CheckContainerLimit(input.Owner, len(userApps)); err != nil {
			_ = os.RemoveAll(appDir)
			return "", err
		}
	}

	hasAppMount := false
	for _, v := range input.Volumes {
		parts := strings.Split(v, ":")
		if len(parts) >= 2 && (parts[0] == appDir || parts[0] == "." || parts[0] == "./") {
			hasAppMount = true
			break
		}
	}
	if !hasAppMount {
		input.Volumes = append(input.Volumes, appDir+":/app")
	}

	for i, v := range input.Volumes {
		v = strings.TrimSpace(v)
		if v == "" {
			continue
		}
		parts := strings.Split(v, ":")
		if len(parts) >= 2 {
			hostPath := parts[0]
			if !filepath.IsAbs(hostPath) {
				hostPath = filepath.Join(appDir, hostPath)
				parts[0] = hostPath
				input.Volumes[i] = strings.Join(parts, ":")
			}
			if !pathWithin(hostPath, linuxUser.Home) {
				_ = os.RemoveAll(appDir)
				return "", fmt.Errorf("volume host path must be within %s", linuxUser.Home)
			}
			_ = os.MkdirAll(hostPath, 0755)
			chownUser(hostPath, linuxUser)
		}
	}

	args, err := buildCreateContainerArgs(input)
	if err != nil {
		_ = os.RemoveAll(appDir)
		return "", err
	}

	appLabels := []string{
		"--label", "mthan.app.name=" + input.Name,
		"--label", "mthan.app.owner=" + input.Owner,
		"--label", "mthan.app.type=docker",
		"--label", "mthan.app.path=" + appDir,
	}
	if len(args) >= 2 {
		args = append(args[:2], append(appLabels, args[2:]...)...)
	}

	engine := "podman"
	if isRoot {
		engine = "docker"
	}
	output, err := s.runForOwnerWithTimeout(3*time.Minute, engine, input.Owner, args...)
	if err != nil {
		_ = os.RemoveAll(appDir)
		outStr := strings.TrimSpace(string(output))
		if outStr != "" {
			return "", fmt.Errorf("%s", outStr)
		}
		return "", err
	}
	containerID := strings.TrimSpace(string(output))
	if len(containerID) > 12 {
		containerID = containerID[:12]
	}

	_ = writeAppMeta(appDir, AppMeta{
		Name:        input.Name,
		Owner:       input.Owner,
		Type:        "docker",
		Runtime:     "docker",
		Image:       input.Image,
		ContainerID: containerID,
		Ports:       input.Ports,
		CreatedAt:   time.Now().UTC().Format(time.RFC3339),
	}, linuxUser)

	return containerID, nil
}

func (s *ContainerService) CreateCurrentUser(username string, input CreateContainerInput) (string, error) {
	input.Owner = username
	return s.CreateContainer(input)
}

func containerActionArgs(id, action string) ([]string, error) {
	if !allowedContainerID.MatchString(id) {
		return nil, errors.New("invalid container")
	}
	if action != "start" && action != "stop" && action != "restart" && action != "rm" {
		return nil, errors.New("invalid container action")
	}
	if action == "rm" {
		return []string{"rm", "-f", id}, nil
	}
	return []string{action, id}, nil
}

func isCurrentUser(username string) bool {
	current, err := user.Current()
	return err == nil && current.Username == username
}

func (s *ContainerService) listRootContainers() []Container {
	var rawContainers []Container
	if output, err := s.runner.Run("docker", "ps", "-a", "--format", "{{json .}}"); err == nil && len(output) > 0 {
		rawContainers = parseDockerContainers(output, "root")
	} else if output, err := s.runner.Run("docker", "ps", "-a", "--format", "json"); err == nil && len(output) > 0 {
		rawContainers = parseDockerContainers(output, "root")
	} else if output, err := s.runner.Run("podman", "ps", "-a", "--format", "json"); err == nil && len(output) > 0 {
		rawContainers = parsePodmanContainers(output, "root")
	}

	htdocsDir := "/root/htdocs"
	_ = os.MkdirAll(htdocsDir, 0755)

	containersByName := make(map[string]Container)
	containersByID := make(map[string]Container)
	for _, c := range rawContainers {
		if c.Name != "" {
			containersByName[c.Name] = c
		}
		if c.ID != "" {
			containersByID[c.ID] = c
		}
	}

	seenApps := make(map[string]bool)
	var result []Container

	entries, err := os.ReadDir(htdocsDir)
	if err == nil {
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			appName := entry.Name()
			if strings.HasPrefix(appName, ".") {
				continue
			}
			seenApps[appName] = true
			appPath := filepath.Join(htdocsDir, appName)
			appMeta, hasMeta := readAppMeta(appPath)

			var matchedContainer *Container
			if hasMeta && appMeta.ContainerID != "" {
				if c, ok := containersByID[appMeta.ContainerID]; ok {
					matchedContainer = &c
				}
			}
			if matchedContainer == nil {
				if c, ok := containersByName[appName]; ok {
					matchedContainer = &c
				}
			}

			if matchedContainer != nil {
				c := *matchedContainer
				c.Type = "docker"
				if appMeta.Runtime != "" {
					c.Runtime = appMeta.Runtime
				} else {
					c.Runtime = "docker"
				}
				c.Path = appPath
				c.RelativePath = filepath.Join("htdocs", appName)
				result = append(result, c)
			} else if hasMeta && appMeta.Type == "docker" {
				result = append(result, Container{
					ID:           appMeta.ContainerID,
					Name:         appName,
					Image:        appMeta.Image,
					Engine:       "docker",
					Owner:        "root",
					State:        "stopped",
					Status:       "Stopped",
					CreatedAt:    appMeta.CreatedAt,
					Ports:        appMeta.Ports,
					Type:         "docker",
					Runtime:      "docker",
					Path:         appPath,
					RelativePath: filepath.Join("htdocs", appName),
				})
			} else {
				runtime := appMeta.Runtime
				if runtime == "" {
					runtime = detectDirectRuntime(appPath)
				}
				result = append(result, Container{
					ID:           appName,
					Name:         appName,
					Engine:       "direct",
					Owner:        "root",
					State:        "ready",
					Status:       "Ready",
					Type:         "direct",
					Runtime:      runtime,
					Path:         appPath,
					RelativePath: filepath.Join("htdocs", appName),
					CreatedAt:    appMeta.CreatedAt,
				})
			}
		}
	}

	for _, c := range rawContainers {
		if !seenApps[c.Name] && (c.ID == "" || !seenApps[c.ID]) {
			result = append(result, c)
		}
	}

	return result
}

func (s *ContainerService) listRootPodman() []Container {
	return s.listRootContainers()
}

func (s *ContainerService) listRootlessPodman(linuxUser LinuxUser) []Container {
	output, err := s.runner.Run(
		"runuser", "--user", linuxUser.Username, "--", "env",
		"HOME="+linuxUser.Home, fmt.Sprintf("XDG_RUNTIME_DIR=/run/user/%d", linuxUser.UID),
		"podman", "ps", "-a", "--format", "json",
	)
	if err != nil {
		return nil
	}
	return parsePodmanContainers(output, linuxUser.Username)
}

func parseDockerContainers(output []byte, owner string) []Container {
	var items []map[string]any
	if json.Unmarshal(output, &items) == nil {
		result := make([]Container, 0, len(items))
		for _, item := range items {
			result = append(result, containerFromItem(item, "docker", owner))
		}
		return result
	}

	var result []Container
	scanner := bufio.NewScanner(bytes.NewReader(output))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var item map[string]any
		if err := json.Unmarshal([]byte(line), &item); err == nil {
			result = append(result, containerFromItem(item, "docker", owner))
		}
	}
	return result
}

func containerFromItem(item map[string]any, engine, owner string) Container {
	name := strings.TrimPrefix(firstName(item), "/")
	return Container{
		ID:           firstTextField(item, "Id", "ID"),
		Name:         name,
		Image:        firstTextField(item, "Image", "ImageName"),
		Command:      joinedField(item["Command"]),
		Engine:       engine,
		Owner:        owner,
		State:        firstTextField(item, "State", "Status"),
		Status:       firstTextField(item, "Status", "State"),
		CreatedAt:    formatCreatedAt(item["CreatedAt"]),
		Ports:        containerPorts(item["Ports"]),
		Type:         "docker",
		Runtime:      "docker",
	}
}

func containerPorts(value any) []string {
	if s, ok := value.(string); ok && s != "" {
		parts := strings.Split(s, ",")
		var res []string
		for _, p := range parts {
			trimmed := strings.TrimSpace(p)
			if trimmed != "" {
				res = append(res, trimmed)
			}
		}
		return res
	}
	return podmanPorts(value)
}

func parsePodmanContainers(output []byte, owner string) []Container {
	var items []map[string]any
	if json.Unmarshal(output, &items) != nil {
		return []Container{}
	}
	result := make([]Container, 0, len(items))
	for _, item := range items {
		result = append(result, Container{
			ID: firstTextField(item, "Id", "ID"), Name: firstName(item), Image: firstTextField(item, "Image", "ImageName"),
			Command: joinedField(item["Command"]), Engine: "podman", Owner: owner,
			State: firstTextField(item, "State", "Status"), Status: firstTextField(item, "Status", "State"),
			CreatedAt: formatCreatedAt(item["CreatedAt"]), Ports: containerPorts(item["Ports"]),
		})
	}
	return result
}

func textField(item map[string]any, key string) string {
	if value, ok := item[key].(string); ok {
		return value
	}
	for candidate, raw := range item {
		if strings.EqualFold(candidate, key) {
			if value, ok := raw.(string); ok {
				return value
			}
		}
	}
	return ""
}

func firstTextField(item map[string]any, keys ...string) string {
	for _, key := range keys {
		if value := textField(item, key); value != "" {
			return value
		}
	}
	return ""
}

func firstName(item map[string]any) string {
	if names, ok := item["Names"].([]any); ok && len(names) > 0 {
		return fmt.Sprint(names[0])
	}
	return firstTextField(item, "Names", "Name")
}

func joinedField(value any) string {
	switch current := value.(type) {
	case string:
		return current
	case []any:
		parts := make([]string, 0, len(current))
		for _, part := range current {
			parts = append(parts, fmt.Sprint(part))
		}
		return strings.Join(parts, " ")
	default:
		return ""
	}
}

func podmanPorts(value any) []string {
	items, ok := value.([]any)
	if !ok {
		return []string{}
	}
	result := make([]string, 0, len(items))
	for _, raw := range items {
		port, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		hostIP := fmt.Sprint(port["host_ip"])
		if hostIP == "<nil>" || hostIP == "" {
			hostIP = "0.0.0.0"
		}
		hostPort := numberText(port["host_port"])
		containerPort := numberText(port["container_port"])
		protocol := fmt.Sprint(port["protocol"])
		if protocol == "<nil>" || protocol == "" {
			protocol = "tcp"
		}
		if hostPort != "" && containerPort != "" {
			result = append(result, hostIP+":"+hostPort+"->"+containerPort+"/"+protocol)
		} else if containerPort != "" {
			result = append(result, containerPort+"/"+protocol)
		}
	}
	return result
}

func numberText(value any) string {
	switch number := value.(type) {
	case float64:
		return fmt.Sprintf("%.0f", number)
	case string:
		return number
	default:
		return ""
	}
}

func formatCreatedAt(value any) string {
	if value == nil {
		return ""
	}
	if seconds, ok := value.(float64); ok && seconds > 0 {
		return time.Unix(int64(seconds), 0).UTC().Format(time.RFC3339)
	}
	return fmt.Sprint(value)
}

func sortContainers(containers []Container) {
	sort.Slice(containers, func(i, j int) bool {
		if containers[i].Owner == containers[j].Owner {
			if containers[i].Engine == containers[j].Engine {
				return containers[i].Name < containers[j].Name
			}
			return containers[i].Engine < containers[j].Engine
		}
		return containers[i].Owner < containers[j].Owner
	})
}
