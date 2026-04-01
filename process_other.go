//go:build !windows

package main

import "os/exec"

func configureStdioCommand(cmd *exec.Cmd) {
}
