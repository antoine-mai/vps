package services

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"
)

type Nameserver struct {
	Hostname string `json:"hostname"`
	Address  string `json:"address"`
}
type NameserverSettings struct {
	Nameservers []Nameserver `json:"nameservers"`
	Revision    uint64       `json:"revision"`
	Serial      uint32       `json:"serial"`
	SuggestedIP string       `json:"suggestedIp,omitempty"`
}
type NameserverService struct {
	main      string
	directory string
	runner    containerCommandRunner
}

var nameserverLock sync.Mutex
var dnsLabel = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`)

const nsBegin = "// BEGIN MTHAN NAMESERVERS"
const nsEnd = "// END MTHAN NAMESERVERS"

func NewNameserverService() *NameserverService {
	main := "/etc/bind/named.conf"
	directory := "/etc/bind/mthan-nameservers"
	if _, err := os.Stat(main); os.IsNotExist(err) {
		if _, err := os.Stat("/etc/named.conf"); err == nil {
			main = "/etc/named.conf"
			directory = "/var/named/mthan-nameservers"
		}
	}
	return &NameserverService{main: main, directory: directory, runner: timedContainerCommandRunner{}}
}
func normalizeNameservers(items []Nameserver) ([]Nameserver, error) {
	if len(items) > 20 {
		return nil, errors.New("use at most 20 nameservers")
	}
	seen := map[string]bool{}
	result := make([]Nameserver, 0, len(items))
	for _, item := range items {
		hostname := strings.ToLower(strings.TrimSuffix(strings.TrimSpace(item.Hostname), "."))
		if net.ParseIP(hostname) != nil || len(hostname) > 253 || len(strings.Split(hostname, ".")) < 3 {
			return nil, errors.New("enter a nameserver hostname such as ns1.example.com")
		}
		for _, label := range strings.Split(hostname, ".") {
			if !dnsLabel.MatchString(label) {
				return nil, errors.New("invalid nameserver hostname")
			}
		}
		if seen[hostname] {
			return nil, fmt.Errorf("duplicate nameserver: %s", hostname)
		}
		seen[hostname] = true
		ip := net.ParseIP(strings.TrimSpace(item.Address))
		if ip == nil || ip.IsUnspecified() || ip.IsLoopback() || ip.IsMulticast() || ip.IsLinkLocalUnicast() {
			return nil, errors.New("enter a reachable server IPv4 or IPv6 address")
		}
		result = append(result, Nameserver{Hostname: hostname, Address: ip.String()})
	}
	return result, nil
}
func nsZones(items []Nameserver) []string {
	set := map[string]bool{}
	for _, item := range items {
		set[strings.SplitN(item.Hostname, ".", 2)[1]] = true
	}
	zones := make([]string, 0, len(set))
	for zone := range set {
		zones = append(zones, zone)
	}
	sort.Strings(zones)
	return zones
}
func renderNSZone(zone string, items []Nameserver, serial uint32) string {
	var out strings.Builder
	fmt.Fprintf(&out, "$ORIGIN %s.\n$TTL 3600\n@ IN SOA %s. hostmaster.%s. (%d 3600 900 1209600 300)\n", zone, items[0].Hostname, zone, serial)
	for _, item := range items {
		fmt.Fprintf(&out, "@ IN NS %s.\n", item.Hostname)
	}
	for _, item := range items {
		if strings.HasSuffix(item.Hostname, "."+zone) {
			kind := "A"
			if net.ParseIP(item.Address).To4() == nil {
				kind = "AAAA"
			}
			fmt.Fprintf(&out, "%s. IN %s %s\n", item.Hostname, kind, item.Address)
		}
	}
	return out.String()
}
func managedNSBlock(main []byte) (int, int, string, error) {
	a := bytes.Index(main, []byte(nsBegin))
	b := bytes.Index(main, []byte(nsEnd))
	if a < 0 && b < 0 {
		return -1, -1, "", nil
	}
	if a < 0 || b < a || bytes.Count(main, []byte(nsBegin)) != 1 || bytes.Count(main, []byte(nsEnd)) != 1 {
		return 0, 0, "", errors.New("managed nameserver block is malformed")
	}
	block := strings.TrimSpace(string(main[a+len(nsBegin) : b]))
	if !strings.HasPrefix(block, "include ") || !strings.HasSuffix(block, ";") {
		return 0, 0, "", errors.New("managed nameserver include is invalid")
	}
	var path string
	if err := json.Unmarshal([]byte(strings.TrimSuffix(strings.TrimPrefix(block, "include "), ";")), &path); err != nil {
		return 0, 0, "", err
	}
	return a, b + len(nsEnd), path, nil
}
func (s *NameserverService) readLocked() (NameserverSettings, error) {
	result := NameserverSettings{Nameservers: []Nameserver{}}
	main, err := os.ReadFile(s.main)
	if os.IsNotExist(err) {
		return result, nil
	}
	if err != nil {
		return result, err
	}
	_, _, include, err := managedNSBlock(main)
	if err != nil {
		return result, err
	}
	if include == "" {
		return result, nil
	}
	if !pathWithin(include, s.directory) || filepath.Base(include) != "zones.conf" {
		return result, errors.New("managed nameserver path is outside the expected directory")
	}
	data, err := os.ReadFile(filepath.Join(filepath.Dir(include), "settings.json"))
	if err != nil {
		return result, err
	}
	err = json.Unmarshal(data, &result)
	return result, err
}
func (s *NameserverService) Read() (NameserverSettings, error) {
	nameserverLock.Lock()
	defer nameserverLock.Unlock()
	result, err := s.readLocked()
	if err == nil {
		addresses, _ := net.InterfaceAddrs()
		for _, address := range addresses {
			ip, _, _ := net.ParseCIDR(address.String())
			if ip != nil && ip.To4() != nil && ip.IsGlobalUnicast() && !ip.IsPrivate() {
				result.SuggestedIP = ip.String()
				break
			}
		}
	}
	return result, err
}
func atomicNSFile(path string, data []byte, mode os.FileMode) error {
	f, err := os.CreateTemp(filepath.Dir(path), ".mthan-dns-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	defer f.Close()
	if existing, statErr := os.Stat(path); statErr == nil {
		if stat, ok := existing.Sys().(*syscall.Stat_t); ok {
			if err = f.Chown(int(stat.Uid), int(stat.Gid)); err != nil {
				return err
			}
		}
	}
	if err = f.Chmod(mode); err == nil {
		_, err = f.Write(data)
	}
	if err == nil {
		err = f.Sync()
	}
	if err == nil {
		err = f.Close()
	}
	if err == nil {
		err = os.Rename(f.Name(), path)
	}
	return err
}
func (s *NameserverService) relabel(path string) error {
	if _, err := exec.LookPath("restorecon"); err != nil {
		return nil
	}
	output, err := s.runner.Run("restorecon", "-R", path)
	if err != nil {
		return fmt.Errorf("DNS file labeling failed: %s: %w", output, err)
	}
	return nil
}
func (s *NameserverService) reload() error {
	if _, err := s.runner.Run("rndc", "reload"); err == nil {
		return nil
	}
	for _, unit := range []string{"named.service", "bind9.service"} {
		out, err := s.runner.Run("systemctl", "show", unit, "--property=LoadState", "--value")
		if err == nil && strings.TrimSpace(string(out)) == "loaded" {
			out, err = s.runner.Run("systemctl", "reload-or-restart", unit)
			if err != nil {
				return fmt.Errorf("BIND reload failed: %s: %w", strings.TrimSpace(string(out)), err)
			}
			return nil
		}
	}
	return errors.New("BIND could not be reloaded; check its service and logs")
}
func (s *NameserverService) Apply(items []Nameserver, expected uint64) (NameserverSettings, error) {
	nameserverLock.Lock()
	defer nameserverLock.Unlock()
	normalized, err := normalizeNameservers(items)
	if err != nil {
		return NameserverSettings{}, err
	}
	old, err := s.readLocked()
	if err != nil {
		return old, err
	}
	if old.Revision != expected {
		return old, errors.New("nameservers changed; reload before saving")
	}
	original, err := os.ReadFile(s.main)
	if err != nil {
		return old, errors.New("install and activate BIND 9 before applying nameservers")
	}
	info, err := os.Lstat(s.main)
	if err != nil || !info.Mode().IsRegular() {
		return old, errors.New("BIND configuration must be a regular file")
	}
	output, err := s.runner.Run("named-checkconf", "-l", s.main)
	if err != nil {
		return old, fmt.Errorf("existing BIND configuration is invalid: %s: %w", output, err)
	}
	_, _, previousInclude, err := managedNSBlock(original)
	if err != nil {
		return old, err
	}
	if previousInclude != "" {
		for _, zone := range nsZones(old.Nameservers) {
			stored, readErr := os.ReadFile(filepath.Join(filepath.Dir(previousInclude), zone+".zone"))
			if readErr != nil || string(stored) != renderNSZone(zone, old.Nameservers, old.Serial) {
				return old, errors.New("a managed DNS zone was edited outside this form; its records were left unchanged")
			}
		}
	}
	owned := map[string]bool{}
	for _, zone := range nsZones(old.Nameservers) {
		owned[zone] = true
	}
	desired := map[string]bool{}
	for _, zone := range nsZones(normalized) {
		desired[zone] = true
	}
	for _, line := range strings.Split(string(output), "\n") {
		fields := strings.Fields(line)
		if len(fields) > 0 {
			zone := strings.TrimSuffix(fields[0], ".")
			if desired[zone] && !owned[zone] {
				return old, fmt.Errorf("zone %s already exists outside this form; its DNS records were left unchanged", zone)
			}
		}
	}
	if err = os.MkdirAll(s.directory, 0755); err != nil {
		return old, err
	}
	generation, err := os.MkdirTemp(s.directory, "generation-")
	if err != nil {
		return old, err
	}
	if err = os.Chmod(generation, 0755); err != nil {
		os.RemoveAll(generation)
		return old, err
	}
	committed := false
	defer func() {
		if !committed {
			os.RemoveAll(generation)
		}
	}()
	serial := uint32(time.Now().Unix())
	if serial <= old.Serial {
		serial = old.Serial + 1
	}
	next := NameserverSettings{Nameservers: normalized, Revision: old.Revision + 1, Serial: serial}
	var include strings.Builder
	for _, zone := range nsZones(normalized) {
		file := filepath.Join(generation, zone+".zone")
		if err = os.WriteFile(file, []byte(renderNSZone(zone, normalized, serial)), 0644); err != nil {
			return old, err
		}
		out, checkErr := s.runner.Run("named-checkzone", zone, file)
		if checkErr != nil {
			return old, fmt.Errorf("DNS zone validation failed: %s: %w", out, checkErr)
		}
		fmt.Fprintf(&include, "zone %q IN { type master; file %q; allow-query { any; }; allow-transfer { none; }; };\n", zone, file)
	}
	includePath := filepath.Join(generation, "zones.conf")
	if err = os.WriteFile(includePath, []byte(include.String()), 0644); err != nil {
		return old, err
	}
	data, _ := json.MarshalIndent(next, "", "  ")
	if err = os.WriteFile(filepath.Join(generation, "settings.json"), data, 0600); err != nil {
		return old, err
	}
	if err = s.relabel(generation); err != nil {
		return old, err
	}
	a, b, _, err := managedNSBlock(original)
	if err != nil {
		return old, err
	}
	block := fmt.Sprintf("%s\ninclude %q;\n%s", nsBegin, includePath, nsEnd)
	candidate := append([]byte{}, original...)
	if a < 0 {
		candidate = append(candidate, []byte("\n"+block+"\n")...)
	} else {
		candidate = append(append(append([]byte{}, original[:a]...), []byte(block)...), original[b:]...)
	}
	temp, err := os.CreateTemp(filepath.Dir(s.main), ".mthan-check-*")
	if err != nil {
		return old, err
	}
	checkPath := temp.Name()
	defer os.Remove(checkPath)
	if _, err = temp.Write(candidate); err != nil {
		temp.Close()
		return old, err
	}
	temp.Close()
	if output, err = s.runner.Run("named-checkconf", "-z", checkPath); err != nil {
		return old, fmt.Errorf("BIND validation failed: %s: %w", output, err)
	}
	current, err := os.ReadFile(s.main)
	if err != nil || !bytes.Equal(current, original) {
		return old, errors.New("BIND configuration changed; reload before applying")
	}
	if err = atomicNSFile(s.main, candidate, info.Mode().Perm()); err != nil {
		return old, err
	}
	if err = s.relabel(s.main); err == nil {
		err = s.reload()
	}
	if err != nil {
		restoreErr := atomicNSFile(s.main, original, info.Mode().Perm())
		if restoreErr == nil {
			restoreErr = s.relabel(s.main)
			if restoreErr == nil {
				restoreErr = s.reload()
			}
		}
		if restoreErr != nil {
			committed = true
			return old, fmt.Errorf("%w; rollback requires attention: %v", err, restoreErr)
		}
		return old, err
	}
	committed = true
	return next, nil
}
