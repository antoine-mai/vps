package services

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

type nsTestRunner struct {
	reloadFailures int
	reloads        int
	rejectConfig   bool
}

func (r *nsTestRunner) Run(name string, args ...string) ([]byte, error) {
	if name == "rndc" {
		r.reloads++
		if r.reloadFailures > 0 {
			r.reloadFailures--
			return nil, errors.New("reload rejected")
		}
		return nil, nil
	}
	if name == "systemctl" {
		return []byte("not-found"), nil
	}
	if name == "restorecon" {
		return nil, nil
	}
	if r.rejectConfig && name == "named-checkconf" && args[0] == "-z" {
		return []byte("invalid candidate"), errors.New("check failed")
	}
	return exec.Command(name, args...).CombinedOutput()
}
func nsFixture(t *testing.T) (*NameserverService, *nsTestRunner) {
	t.Helper()
	for _, binary := range []string{"named-checkconf", "named-checkzone"} {
		if _, err := exec.LookPath(binary); err != nil {
			t.Skip("BIND validation utilities are required")
		}
	}
	root := t.TempDir()
	main := filepath.Join(root, "named.conf")
	if err := os.WriteFile(main, []byte("// existing configuration\noptions { recursion no; };\n"), 0644); err != nil {
		t.Fatal(err)
	}
	runner := &nsTestRunner{}
	return &NameserverService{main: main, directory: filepath.Join(root, "zones"), runner: runner}, runner
}
func TestNameserverValidationAndIPv6(t *testing.T) {
	for _, item := range []Nameserver{{"ns1.example.com;include", "192.0.2.1"}, {"../etc/passwd", "192.0.2.1"}, {"ns1.example.com", "127.0.0.1"}, {"ns1.example.com", "invalid"}} {
		if _, err := normalizeNameservers([]Nameserver{item}); err == nil {
			t.Fatalf("accepted invalid input: %+v", item)
		}
	}
	result, err := normalizeNameservers([]Nameserver{{"NS1.Example.COM.", "2001:db8::1"}})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(renderNSZone("example.com", result, 1), "IN AAAA 2001:db8::1") {
		t.Fatal("IPv6 record missing")
	}
	if _, err := normalizeNameservers([]Nameserver{{"ns1.example.com", "192.0.2.1"}, {"NS1.EXAMPLE.COM", "192.0.2.2"}}); err == nil {
		t.Fatal("duplicate hostname accepted")
	}
}
func TestNameserverApplyUsesRealBindValidationAndPersists(t *testing.T) {
	service, runner := nsFixture(t)
	items := []Nameserver{{"ns1.example.com", "192.0.2.10"}, {"ns2.example.com", "192.0.2.11"}}
	result, err := service.Apply(items, 0)
	if err != nil {
		t.Fatal(err)
	}
	read, err := service.Read()
	if err != nil || !reflect.DeepEqual(read.Nameservers, items) || read.Revision != 1 {
		t.Fatalf("not persisted: %+v %v", read, err)
	}
	if runner.reloads != 1 {
		t.Fatal("configuration not applied")
	}
	main, _ := os.ReadFile(service.main)
	if !strings.Contains(string(main), "// existing configuration") {
		t.Fatal("existing settings removed")
	}
	if _, err := service.Apply(items, 0); err == nil {
		t.Fatal("stale write accepted")
	}
	result2, err := service.Apply(items, result.Revision)
	if err != nil || result2.Serial <= result.Serial {
		t.Fatalf("serial did not advance: %v", err)
	}
	if _, err = service.Apply(nil, result2.Revision); err != nil {
		t.Fatal(err)
	}
	read, err = service.Read()
	if err != nil || len(read.Nameservers) != 0 {
		t.Fatal("clear nameservers failed")
	}
}
func TestNameserverReloadFailureRestoresFilesAndState(t *testing.T) {
	service, runner := nsFixture(t)
	items := []Nameserver{{"ns1.example.com", "192.0.2.10"}}
	if _, err := service.Apply(items, 0); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(service.main)
	runner.reloadFailures = 1
	if _, err := service.Apply([]Nameserver{{"ns1.example.com", "192.0.2.99"}}, 1); err == nil {
		t.Fatal("reload failure hidden")
	}
	after, _ := os.ReadFile(service.main)
	if string(before) != string(after) {
		t.Fatal("old configuration not restored")
	}
	result, err := service.Read()
	if err != nil || result.Revision != 1 || result.Nameservers[0].Address != "192.0.2.10" {
		t.Fatalf("state changed after failure: %+v %v", result, err)
	}
}
func TestNameserverInvalidCandidateDoesNotChangeActiveConfiguration(t *testing.T) {
	service, runner := nsFixture(t)
	before, _ := os.ReadFile(service.main)
	runner.rejectConfig = true
	if _, err := service.Apply([]Nameserver{{"ns1.example.com", "192.0.2.10"}}, 0); err == nil {
		t.Fatal("invalid config accepted")
	}
	after, _ := os.ReadFile(service.main)
	if string(before) != string(after) || runner.reloads != 0 {
		t.Fatal("invalid config was activated")
	}
}
func TestNameserverDoesNotReplaceExternalZonesOrManualRecords(t *testing.T) {
	service, _ := nsFixture(t)
	external := `options { recursion no; }; zone "example.com" { type forward; forwarders { 192.0.2.10; }; };`
	os.WriteFile(service.main, []byte(external), 0644)
	if _, err := service.Apply([]Nameserver{{"ns1.example.com", "192.0.2.10"}}, 0); err == nil || !strings.Contains(err.Error(), "outside this form") {
		t.Fatalf("external zone overwritten: %v", err)
	}
	os.WriteFile(service.main, []byte("options { recursion no; };\n"), 0644)
	if _, err := service.Apply([]Nameserver{{"ns1.example.com", "192.0.2.10"}}, 0); err != nil {
		t.Fatal(err)
	}
	main, _ := os.ReadFile(service.main)
	_, _, include, _ := managedNSBlock(main)
	zone := filepath.Join(filepath.Dir(include), "example.com.zone")
	file, _ := os.OpenFile(zone, os.O_APPEND|os.O_WRONLY, 0)
	file.WriteString("www IN A 192.0.2.50\n")
	file.Close()
	if _, err := service.Apply([]Nameserver{{"ns1.example.com", "192.0.2.10"}}, 1); err == nil {
		t.Fatal("manual DNS records overwritten")
	}
}
