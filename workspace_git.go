package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

func (a *App) CheckGitAvailable() (*WorkspaceGitCheckResult, error) {
	cmd := exec.Command("git", "--version")
	configureStdioCommand(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return &WorkspaceGitCheckResult{Available: false, Error: strings.TrimSpace(string(out))}, nil
	}
	return &WorkspaceGitCheckResult{Available: true, Version: strings.TrimSpace(string(out))}, nil
}

func (a *App) PreviewWorkspacePush(workspaceID string) (*WorkspacePushPreview, error) {
	if err := a.ensureDataDir(); err != nil {
		return nil, err
	}
	store, err := a.loadWorkspaceManager()
	if err != nil {
		return nil, err
	}
	workspace := findWorkspaceByID(store.Workspaces, workspaceID)
	if workspace == nil {
		return nil, fmt.Errorf("workspace not found: %s", workspaceID)
	}
	if strings.TrimSpace(workspace.GitURL) == "" {
		return &WorkspacePushPreview{WorkspaceID: workspaceID, Changes: []WorkspaceGitResourceChange{}, Branch: workspace.GitBranch, Remote: ""}, nil
	}
	if err := a.ensureWorkspaceGitRepoReady(workspaceID, workspace); err != nil {
		return nil, err
	}

	status, err := runGitRaw(workspace.Path, "-c", "core.quotepath=false", "status", "--porcelain", "-z")
	if err != nil {
		return nil, err
	}
	changes := parseGitStatusPorcelainZ(status, workspace.IncludeHistoryInGit)
	return &WorkspacePushPreview{
		WorkspaceID: workspaceID,
		Changes:     changes,
		Branch:      workspace.GitBranch,
		Remote:      workspace.GitURL,
	}, nil
}

func (a *App) PullWorkspace(workspaceID string) (*WorkspaceGitActionResult, error) {
	if err := a.ensureDataDir(); err != nil {
		return nil, err
	}
	store, err := a.loadWorkspaceManager()
	if err != nil {
		return nil, err
	}
	workspace := findWorkspaceByID(store.Workspaces, workspaceID)
	if workspace == nil {
		return nil, fmt.Errorf("workspace not found: %s", workspaceID)
	}
	if strings.TrimSpace(workspace.GitURL) == "" {
		return nil, fmt.Errorf("workspace has no remote repository")
	}
	branch := strings.TrimSpace(workspace.GitBranch)
	if branch == "" {
		branch = "main"
	}
	if _, err := runGit(workspace.Path, "pull", "--no-rebase", "origin", branch); err != nil {
		return nil, err
	}
	return &WorkspaceGitActionResult{WorkspaceID: workspaceID, Branch: branch, Summary: "拉取并合并完成"}, nil
}

func (a *App) PushWorkspaceChanges(req WorkspacePushRequest) (*WorkspaceGitActionResult, error) {
	if err := a.ensureDataDir(); err != nil {
		return nil, err
	}
	store, err := a.loadWorkspaceManager()
	if err != nil {
		return nil, err
	}
	workspace := findWorkspaceByID(store.Workspaces, req.WorkspaceID)
	if workspace == nil {
		return nil, fmt.Errorf("workspace not found: %s", req.WorkspaceID)
	}
	if strings.TrimSpace(workspace.GitURL) == "" {
		return nil, fmt.Errorf("workspace has no remote repository")
	}
	if err := a.ensureWorkspaceGitRepoReady(req.WorkspaceID, workspace); err != nil {
		return nil, err
	}
	branch := strings.TrimSpace(req.Branch)
	if branch == "" {
		branch = strings.TrimSpace(workspace.GitBranch)
	}
	if branch == "" {
		branch = "main"
	}

	if len(req.Paths) == 0 {
		preview, err := a.PreviewWorkspacePush(req.WorkspaceID)
		if err != nil {
			return nil, err
		}
		for _, item := range preview.Changes {
			if item.Selected {
				req.Paths = append(req.Paths, item.Path)
			}
		}
	}
	if len(req.Paths) == 0 {
		return nil, fmt.Errorf("no paths selected for push")
	}

	args := []string{"add", "--"}
	for _, path := range req.Paths {
		normalized := filepath.ToSlash(strings.TrimSpace(path))
		if normalized == "" {
			continue
		}
		args = append(args, normalized)
	}
	if len(args) == 2 {
		return nil, fmt.Errorf("no valid paths selected for push")
	}
	if _, err := runGit(workspace.Path, args...); err != nil {
		return nil, err
	}

	message := strings.TrimSpace(req.Message)
	if message == "" {
		message = "chore(workspace): sync resources"
	}
	if _, err := runGit(workspace.Path, "commit", "-m", message); err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "nothing to commit") {
			return &WorkspaceGitActionResult{WorkspaceID: req.WorkspaceID, Branch: branch, Summary: "无变更可提交"}, nil
		}
		return nil, err
	}
	if _, err := runGit(workspace.Path, "push", "origin", branch); err != nil {
		return nil, err
	}
	return &WorkspaceGitActionResult{WorkspaceID: req.WorkspaceID, Branch: branch, Summary: "推送完成"}, nil
}

func parseGitStatusPorcelainZ(raw []byte, includeHistory bool) []WorkspaceGitResourceChange {
	entries := strings.Split(string(raw), "\x00")
	out := make([]WorkspaceGitResourceChange, 0, len(entries))
	for i := 0; i < len(entries); i++ {
		entry := entries[i]
		if entry == "" || len(entry) < 4 {
			continue
		}
		statusCode := strings.TrimSpace(entry[:2])
		path := entry[3:]
		if strings.HasPrefix(statusCode, "R") || strings.HasPrefix(statusCode, "C") {
			if i+1 < len(entries) && entries[i+1] != "" {
				path = entries[i+1]
				i++
			}
		}
		path = filepath.ToSlash(strings.TrimSpace(path))
		if path == "" {
			continue
		}
		if !includeHistory && strings.HasPrefix(path, "history/") {
			continue
		}
		status := "modified"
		if strings.Contains(statusCode, "A") || strings.HasPrefix(statusCode, "??") {
			status = "added"
		}
		if strings.Contains(statusCode, "D") {
			status = "deleted"
		}
		out = append(out, WorkspaceGitResourceChange{
			Path:     path,
			Status:   status,
			Resource: classifyWorkspaceResource(path),
			Selected: true,
		})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Status != out[j].Status {
			return out[i].Status < out[j].Status
		}
		return out[i].Path < out[j].Path
	})
	return out
}

func classifyWorkspaceResource(path string) string {
	value := filepath.ToSlash(strings.ToLower(path))
	switch {
	case strings.HasPrefix(value, "collections/entities/"):
		return "collection-item"
	case strings.HasPrefix(value, "collections/folders/"):
		return "collection-folder"
	case strings.HasPrefix(value, "collections/"):
		return "collection"
	case strings.HasPrefix(value, "history/"):
		return "history"
	case strings.HasPrefix(value, "mcp/"):
		return "mcp"
	case value == "workspace.json":
		return "workspace"
	case value == "setting.json":
		return "setting"
	default:
		return "other"
	}
}

func readGitRemoteAndBranch(workdir string) (string, string, error) {
	if _, err := os.Stat(filepath.Join(workdir, ".git")); err != nil {
		if os.IsNotExist(err) {
			return "", "", nil
		}
		return "", "", err
	}

	remote, err := runGit(workdir, "remote", "get-url", "origin")
	if err != nil && !strings.Contains(strings.ToLower(err.Error()), "no such remote") {
		return "", "", err
	}
	if err != nil {
		remote = ""
	}

	branch, err := runGit(workdir, "branch", "--show-current")
	if err != nil {
		return strings.TrimSpace(remote), "", nil
	}

	return strings.TrimSpace(remote), strings.TrimSpace(branch), nil
}

func runGitRaw(workdir string, args ...string) ([]byte, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = workdir
	configureStdioCommand(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		text := strings.TrimSpace(string(out))
		if text == "" {
			text = err.Error()
		}
		return nil, fmt.Errorf("git %s failed: %s", strings.Join(args, " "), text)
	}
	return out, nil
}

func runGit(workdir string, args ...string) (string, error) {
	out, err := runGitRaw(workdir, args...)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func (a *App) ensureWorkspaceGitRepoReady(workspaceID string, workspace *WorkspaceDescriptor) error {
	if workspace == nil {
		return fmt.Errorf("workspace not found: %s", workspaceID)
	}
	if _, err := runGit(workspace.Path, "rev-parse", "--is-inside-work-tree"); err == nil {
		return nil
	}
	_, err := a.EnsureWorkspaceGitRepo(workspaceID)
	return err
}

func (a *App) EnsureWorkspaceGitRepo(workspaceID string) (*WorkspaceGitActionResult, error) {
	if err := a.ensureDataDir(); err != nil {
		return nil, err
	}
	store, err := a.loadWorkspaceManager()
	if err != nil {
		return nil, err
	}
	workspace := findWorkspaceByID(store.Workspaces, workspaceID)
	if workspace == nil {
		return nil, fmt.Errorf("workspace not found: %s", workspaceID)
	}
	if _, err := runGit(workspace.Path, "rev-parse", "--is-inside-work-tree"); err == nil {
		return &WorkspaceGitActionResult{WorkspaceID: workspaceID, Branch: workspace.GitBranch, Summary: "Git 仓库已存在"}, nil
	}
	if _, err := runGit(workspace.Path, "init"); err != nil {
		return nil, err
	}
	branch := strings.TrimSpace(workspace.GitBranch)
	if branch == "" {
		branch = "main"
	}
	_, _ = runGit(workspace.Path, "checkout", "-b", branch)
	if strings.TrimSpace(workspace.GitURL) != "" {
		_, _ = runGit(workspace.Path, "remote", "remove", "origin")
		if _, err := runGit(workspace.Path, "remote", "add", "origin", workspace.GitURL); err != nil {
			return nil, err
		}
	}
	workspace.UpdatedAt = time.Now().Format(time.RFC3339)
	if err := a.saveWorkspaceManager(store); err != nil {
		return nil, err
	}
	return &WorkspaceGitActionResult{WorkspaceID: workspaceID, Branch: branch, Summary: "已初始化 Git 仓库"}, nil
}
