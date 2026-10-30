package services

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

var DefaultUserDirectories = []string{"backup", "logs", "data", "htdocs", "config"}

const DefaultUserContainersConfig = `[engine]
# Each owner uses their own systemd cgroup hierarchy and event log.
cgroup_manager = "systemd"
events_logger = "file"
`

func ProvisionUserContainersConfig(home string, uid, gid int) error {
	configDir := filepath.Join(home, ".config")
	if info, err := os.Lstat(configDir); err == nil && (!info.IsDir() || info.Mode()&os.ModeSymlink != 0) {
		return fmt.Errorf("config directory must be a real directory")
	}
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return err
	}
	if err := os.Chmod(configDir, 0755); err != nil {
		return err
	}
	if err := os.Chown(configDir, uid, gid); err != nil {
		return err
	}

	containersDir := filepath.Join(configDir, "containers")
	if info, err := os.Lstat(containersDir); err == nil && (!info.IsDir() || info.Mode()&os.ModeSymlink != 0) {
		return fmt.Errorf("containers directory must be a real directory")
	}
	if err := os.MkdirAll(containersDir, 0755); err != nil {
		return err
	}
	if err := os.Chmod(containersDir, 0755); err != nil {
		return err
	}
	if err := os.Chown(containersDir, uid, gid); err != nil {
		return err
	}

	configFile := filepath.Join(containersDir, "containers.conf")
	if info, err := os.Lstat(configFile); err == nil {
		if !info.Mode().IsRegular() {
			return fmt.Errorf("containers.conf must be a regular file")
		}
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.WriteFile(configFile, []byte(DefaultUserContainersConfig), 0644); err != nil {
		return err
	}
	if err := os.Chmod(configFile, 0644); err != nil {
		return err
	}
	return os.Chown(configFile, uid, gid)
}

func ProvisionUserHome(home string, uid, gid int) error {
	if err := os.MkdirAll(home, 0755); err != nil {
		return err
	}
	if err := os.Chmod(home, 0711); err != nil {
		return err
	}
	if err := os.Chown(home, uid, gid); err != nil {
		return err
	}

	for _, name := range DefaultUserDirectories {
		directory := filepath.Join(home, name)
		if err := os.MkdirAll(directory, 0755); err != nil {
			return err
		}
		if err := os.Chmod(directory, 0755); err != nil {
			return err
		}
		if err := os.Chown(directory, uid, gid); err != nil {
			return err
		}
	}

	if err := ProvisionUserContainersConfig(home, uid, gid); err != nil {
		return err
	}

	return nil
}

type LinuxUser struct {
	CPanelEnabled bool   `json:"cpanelEnabled"`
	HasPassword   bool   `json:"hasPassword"`
	Home          string `json:"home"`
	Name          string `json:"name"`
	Shell         string `json:"shell"`
	UID           int    `json:"uid"`
	Username      string `json:"username"`
}

func HomeUser(username string) (LinuxUser, bool, error) {
	users, err := HomeUsers()
	if err != nil {
		return LinuxUser{}, false, err
	}
	for _, linuxUser := range users {
		if linuxUser.Username == username {
			return linuxUser, true, nil
		}
	}
	return LinuxUser{}, false, nil
}

func HomeUsers() ([]LinuxUser, error) {
	return homeUsersIn("/home", passwdUsersByName())
}

func HomeUsersWithAccess() ([]LinuxUser, error) {
	users, err := HomeUsers()
	if err != nil {
		return nil, err
	}
	return userAccessFromShadow(users, "/etc/shadow")
}

func userAccessFromShadow(users []LinuxUser, shadowPath string) ([]LinuxUser, error) {
	file, err := os.Open(shadowPath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	hashes := make(map[string]string)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		parts := strings.SplitN(scanner.Text(), ":", 3)
		if len(parts) >= 2 {
			hashes[parts[0]] = parts[1]
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}

	for index := range users {
		users[index].HasPassword, users[index].CPanelEnabled = passwordAccessState(hashes[users[index].Username])
	}
	return users, nil
}

func passwordAccessState(hash string) (bool, bool) {
	locked := strings.HasPrefix(hash, "!") || strings.HasPrefix(hash, "*")
	usableHash := strings.TrimLeft(hash, "!")
	hasPassword := usableHash != "" && usableHash != "*"
	return hasPassword, hasPassword && !locked
}

func homeUsersIn(homeRoot string, passwdUsers map[string]passwdUser) ([]LinuxUser, error) {
	entries, err := os.ReadDir(homeRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return []LinuxUser{}, nil
		}
		return nil, err
	}

	users := make([]LinuxUser, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		name := entry.Name()
		home := filepath.Join(homeRoot, name)
		linuxUser := LinuxUser{
			Home:     home,
			Name:     name,
			Shell:    passwdUsers[name].Shell,
			UID:      -1,
			Username: name,
		}

		if passwdUsers[name].Username != "" {
			linuxUser.Username = passwdUsers[name].Username
			linuxUser.UID = passwdUsers[name].UID
		}

		users = append(users, linuxUser)
	}

	return users, nil
}

type passwdUser struct {
	Shell    string
	UID      int
	Username string
}

func passwdUsersByName() map[string]passwdUser {
	file, err := os.Open("/etc/passwd")
	if err != nil {
		return map[string]passwdUser{}
	}
	defer file.Close()

	users := make(map[string]passwdUser)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		parts := strings.Split(scanner.Text(), ":")
		if len(parts) < 7 {
			continue
		}

		uid, _ := strconv.Atoi(parts[2])
		users[parts[0]] = passwdUser{
			Shell:    parts[6],
			UID:      uid,
			Username: parts[0],
		}
	}

	return users
}
