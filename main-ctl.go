//go:build ctl

package main

import (
	"fmt"
	"mthan/vps/internal/podman"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		return
	}

	switch os.Args[1] {
	case "podman-setup":
		var err error
		if len(os.Args) == 2 {
			err = podman.SetupHost()
		} else if len(os.Args) == 3 {
			err = podman.SetupUser(os.Args[2])
		} else {
			fmt.Fprintln(os.Stderr, "Usage: mthanctl podman-setup [username]")
			os.Exit(1)
		}
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	case "help", "-h", "--help":
		usage()
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", os.Args[1])
		usage()
		os.Exit(1)
	}
}

func usage() {
	fmt.Println("Usage: mthanctl <command>")
	fmt.Println()
	fmt.Println("Commands:")
	fmt.Println("  podman-setup [username]  Configure Podman boot services and rootless users")
	fmt.Println("  help    Show this help message")
}
