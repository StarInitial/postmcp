package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) ensureWorkspaceRuntime() error {
	if a.workspaceDBPath != "" && a.settingsPath != "" && a.workspaceRoot != "" {
		return nil
	}

	configDir, err := os.UserConfigDir()
	if err != nil {
		return fmt.Errorf("resolve user config dir: %w", err)
	}

	a.configRoot = filepath.Join(configDir, "post-mcp")
	a.legacyDataDir = filepath.Join(a.configRoot, "data")
	a.runtimeDir = filepath.Join(a.configRoot, "workspace-runtime")
	a.workspaceRoot = filepath.Join(a.runtimeDir, "workspaces")
	a.workspaceDBPath = filepath.Join(a.runtimeDir, "workspace_manager.json")
	a.settingsPath = filepath.Join(a.runtimeDir, "settings.json")

	if err := os.MkdirAll(a.workspaceRoot, 0o755); err != nil {
		return fmt.Errorf("create workspace root: %w", err)
	}

	if _, err := os.Stat(a.settingsPath); errors.Is(err, os.ErrNotExist) {
		settings := defaultSettingsStore()
		if existing, readErr := readSettingsStore(filepath.Join(a.legacyDataDir, "settings.json")); readErr == nil {
			settings = existing
		}
		settings.Version = currentSchemaVersion
		settings.UpdatedAt = time.Now().Format(time.RFC3339)
		if err := writeJSONAtomic(a.settingsPath, settings); err != nil {
			return err
		}
	}

	if _, err := os.Stat(a.workspaceDBPath); errors.Is(err, os.ErrNotExist) {
		store := defaultWorkspaceManagerStore()
		store.Workspaces[0].Path = filepath.Join(a.workspaceRoot, "default")
		if err := ensureWorkspaceDataLayout(store.Workspaces[0].Path, store.Workspaces[0]); err != nil {
			return err
		}
		if err := seedDefaultWorkspaceFromLegacyIfNeeded(store.Workspaces[0].Path, a.legacyDataDir); err != nil {
			return err
		}
		if err := a.saveWorkspaceManager(store); err != nil {
			return err
		}
	}

	store, err := a.loadWorkspaceManager()
	if err != nil {
		return err
	}
	for i := range store.Workspaces {
		if err := ensureWorkspaceDataLayout(store.Workspaces[i].Path, store.Workspaces[i]); err != nil {
			return err
		}
	}

	return nil
}

func seedDefaultWorkspaceFromLegacyIfNeeded(targetDir string, legacyDir string) error {
	workspacePath := filepath.Join(targetDir, "workspace.json")
	if _, err := os.Stat(workspacePath); err == nil {
		return nil
	}

	if _, err := os.Stat(filepath.Join(legacyDir, "workspace.json")); err != nil {
		return nil
	}

	if err := copyFile(filepath.Join(legacyDir, "workspace.json"), workspacePath); err != nil {
		return err
	}
	for _, dir := range []string{"collections", "mcp", "history"} {
		if err := copyDir(filepath.Join(legacyDir, dir), filepath.Join(targetDir, dir)); err != nil {
			return err
		}
	}
	return nil
}

func ensureWorkspaceDataLayout(workspaceDir string, descriptor WorkspaceDescriptor) error {
	if err := os.MkdirAll(workspaceDir, 0o755); err != nil {
		return fmt.Errorf("create workspace dir: %w", err)
	}

	defaults := []struct {
		name  string
		value any
	}{
		{"workspace.json", defaultWorkspaceStore()},
		{"setting.json", workspaceSettingFromDescriptor(descriptor)},
	}
	for _, file := range defaults {
		path := filepath.Join(workspaceDir, file.name)
		if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
			if err := writeJSONAtomic(path, file.value); err != nil {
				return err
			}
		}
	}

	for _, dir := range []string{
		filepath.Join(workspaceDir, "collections", "entities"),
		filepath.Join(workspaceDir, "mcp"),
		filepath.Join(workspaceDir, "history", "http"),
		filepath.Join(workspaceDir, "history", "mcp"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("create dir %s: %w", dir, err)
		}
	}

	structuredDefaults := []struct {
		path  string
		value any
	}{
		{
			path: filepath.Join(workspaceDir, "collections", "setting.json"),
			value: collectionSettingsFile{
				Version:     currentSchemaVersion,
				RootOrder:   []string{},
				ChildOrder:  map[string][]string{},
				FolderNames: map[string]string{},
				EntityFiles: map[string]string{},
			},
		},
		{
			path: filepath.Join(workspaceDir, "mcp", "setting.json"),
			value: mcpSettingsFile{
				Version:  currentSchemaVersion,
				Order:    []string{},
				FileByID: map[string]string{},
			},
		},
	}
	for _, item := range structuredDefaults {
		if _, err := os.Stat(item.path); errors.Is(err, os.ErrNotExist) {
			if err := writeJSONAtomic(item.path, item.value); err != nil {
				return err
			}
		}
	}

	return nil
}

func workspaceSettingFromDescriptor(descriptor WorkspaceDescriptor) WorkspaceNamespaceSettings {
	settings := defaultWorkspaceNamespaceSettings()
	settings.WorkspaceID = descriptor.ID
	settings.Name = descriptor.Name
	settings.Description = descriptor.Description
	settings.Creator = descriptor.Creator
	settings.GitURL = descriptor.GitURL
	if strings.TrimSpace(descriptor.GitBranch) != "" {
		settings.GitBranch = descriptor.GitBranch
	}
	settings.IncludeHistoryInGit = descriptor.IncludeHistoryInGit
	settings.UpdatedAt = time.Now().Format(time.RFC3339)
	return settings
}

func findWorkspaceByID(items []WorkspaceDescriptor, id string) *WorkspaceDescriptor {
	for i := range items {
		if items[i].ID == id {
			return &items[i]
		}
	}
	return nil
}

func (a *App) loadWorkspaceManager() (WorkspaceManagerStore, error) {
	store := defaultWorkspaceManagerStore()
	if err := readJSONFile(a.workspaceDBPath, &store); err != nil {
		return store, err
	}
	if len(store.Workspaces) == 0 {
		store = defaultWorkspaceManagerStore()
	}
	for i := range store.Workspaces {
		if strings.TrimSpace(store.Workspaces[i].Path) == "" {
			if store.Workspaces[i].ID == "default" {
				store.Workspaces[i].Path = filepath.Join(a.workspaceRoot, "default")
			} else {
				store.Workspaces[i].Path = filepath.Join(a.workspaceRoot, sanitizeNameForFile(store.Workspaces[i].Name, 32)+"-"+store.Workspaces[i].ID[:8])
			}
		}
		if strings.TrimSpace(store.Workspaces[i].GitBranch) == "" {
			store.Workspaces[i].GitBranch = "main"
		}
	}
	if strings.TrimSpace(store.ActiveWorkspaceID) == "" {
		store.ActiveWorkspaceID = store.Workspaces[0].ID
	}
	store.MaxWorkspaceCount = maxWorkspaceCount
	return store, nil
}

func (a *App) saveWorkspaceManager(store WorkspaceManagerStore) error {
	store.Version = currentSchemaVersion
	store.UpdatedAt = time.Now().Format(time.RFC3339)
	store.MaxWorkspaceCount = maxWorkspaceCount
	return writeJSONAtomic(a.workspaceDBPath, store)
}

func (a *App) UpdateWorkspaceFeatureSettings(req WorkspaceFeatureSettingsRequest) (*WorkspaceManagerStore, error) {
	if err := a.ensureDataDir(); err != nil {
		return nil, err
	}
	store, err := a.loadWorkspaceManager()
	if err != nil {
		return nil, err
	}
	store.MultiWorkspaceEnabled = req.MultiWorkspaceEnabled
	store.GitEnabled = req.GitEnabled
	if err := a.saveWorkspaceManager(store); err != nil {
		return nil, err
	}
	return &store, nil
}

func (a *App) SwitchWorkspace(workspaceID string) (*BootstrapData, error) {
	if err := a.ensureDataDir(); err != nil {
		return nil, err
	}
	store, err := a.loadWorkspaceManager()
	if err != nil {
		return nil, err
	}
	target := findWorkspaceByID(store.Workspaces, workspaceID)
	if target == nil {
		return nil, fmt.Errorf("workspace not found: %s", workspaceID)
	}
	store.ActiveWorkspaceID = target.ID
	target.LastOpenedAt = time.Now().Format(time.RFC3339)
	target.UpdatedAt = target.LastOpenedAt
	for i := range store.Workspaces {
		if store.Workspaces[i].ID == target.ID {
			store.Workspaces[i] = *target
			break
		}
	}
	if err := a.saveWorkspaceManager(store); err != nil {
		return nil, err
	}
	a.closeAllMCPSessions()
	a.dataDir = target.Path
	return a.LoadBootstrapData()
}

func (a *App) ListWorkspaceManager() (*WorkspaceManagerStore, error) {
	if err := a.ensureDataDir(); err != nil {
		return nil, err
	}
	store, err := a.loadWorkspaceManager()
	if err != nil {
		return nil, err
	}
	return &store, nil
}

func (a *App) SelectFolder() (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("context unavailable")
	}
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: "选择工作空间目录"})
}

func (a *App) DetectWorkspaceGit(path string) (*WorkspaceGitDetectionResult, error) {
	workspacePath := filepath.Clean(strings.TrimSpace(path))
	if workspacePath == "" || workspacePath == "." {
		return nil, fmt.Errorf("workspace path is required")
	}
	info, err := os.Stat(workspacePath)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("workspace path is not a directory: %s", workspacePath)
	}

	remote, branch, err := readGitRemoteAndBranch(workspacePath)
	if err != nil {
		return nil, err
	}
	return &WorkspaceGitDetectionResult{
		GitURL:    strings.TrimSpace(remote),
		GitBranch: strings.TrimSpace(branch),
	}, nil
}

func (a *App) CreateWorkspace(req WorkspaceCreateRequest) (*WorkspaceManagerStore, error) {
	if err := a.ensureDataDir(); err != nil {
		return nil, err
	}
	store, err := a.loadWorkspaceManager()
	if err != nil {
		return nil, err
	}
	if len(store.Workspaces) >= maxWorkspaceCount {
		return nil, fmt.Errorf("workspace count exceeds limit: %d", maxWorkspaceCount)
	}

	mode := strings.ToLower(strings.TrimSpace(req.Mode))
	if mode == "" {
		mode = "create"
	}
	if mode != "create" && mode != "import" {
		return nil, fmt.Errorf("invalid workspace mode: %s", req.Mode)
	}

	name := strings.TrimSpace(req.Name)
	workspacePath := ""
	if mode == "create" {
		if name == "" {
			return nil, fmt.Errorf("workspace name is required")
		}
		parentDir := strings.TrimSpace(req.Path)
		if parentDir == "" {
			parentDir = a.workspaceRoot
		}
		parentDir = filepath.Clean(parentDir)
		if err := os.MkdirAll(parentDir, 0o755); err != nil {
			return nil, fmt.Errorf("prepare workspace parent dir: %w", err)
		}
		folderName := sanitizeNameForFile(name, 64)
		workspacePath = filepath.Join(parentDir, folderName)
		if info, err := os.Stat(workspacePath); err == nil {
			if !info.IsDir() {
				return nil, fmt.Errorf("workspace path is not a directory: %s", workspacePath)
			}
			entries, readErr := os.ReadDir(workspacePath)
			if readErr != nil {
				return nil, readErr
			}
			if len(entries) > 0 {
				return nil, fmt.Errorf("workspace directory already exists and is not empty: %s", workspacePath)
			}
		} else if !errors.Is(err, os.ErrNotExist) {
			return nil, err
		}
	} else {
		importSource := strings.ToLower(strings.TrimSpace(req.ImportSource))
		if importSource == "" {
			importSource = "local"
		}
		if importSource != "local" && importSource != "remote" {
			return nil, fmt.Errorf("invalid import source: %s", req.ImportSource)
		}

		workspacePath = filepath.Clean(strings.TrimSpace(req.Path))
		if workspacePath == "" || workspacePath == "." {
			return nil, fmt.Errorf("import path is required")
		}

		if importSource == "local" {
			info, err := os.Stat(workspacePath)
			if err != nil {
				return nil, err
			}
			if !info.IsDir() {
				return nil, fmt.Errorf("import path is not a directory: %s", workspacePath)
			}
			entries, err := os.ReadDir(workspacePath)
			if err != nil {
				return nil, err
			}
			if len(entries) == 0 {
				return nil, fmt.Errorf("import directory is empty: %s", workspacePath)
			}
			if name == "" {
				name = filepath.Base(workspacePath)
			}
			parsedRemote, parsedBranch, err := readGitRemoteAndBranch(workspacePath)
			if err == nil {
				if strings.TrimSpace(req.GitURL) == "" {
					req.GitURL = parsedRemote
				}
				if strings.TrimSpace(req.GitBranch) == "" && strings.TrimSpace(parsedBranch) != "" {
					req.GitBranch = parsedBranch
				}
			}
		} else {
			gitURL := strings.TrimSpace(req.GitURL)
			if gitURL == "" {
				return nil, fmt.Errorf("git url is required for remote import")
			}
			gitBranch := strings.TrimSpace(req.GitBranch)
			cloneBranch := gitBranch
			if cloneBranch == "" {
				cloneBranch = "main"
			}

			if workspacePathInUse(store.Workspaces, workspacePath) {
				return nil, fmt.Errorf("workspace path already registered: %s", workspacePath)
			}

			if info, err := os.Stat(workspacePath); err == nil {
				if !info.IsDir() {
					return nil, fmt.Errorf("import path is not a directory: %s", workspacePath)
				}
				entries, readErr := os.ReadDir(workspacePath)
				if readErr != nil {
					return nil, readErr
				}
				if len(entries) > 0 {
					return nil, fmt.Errorf("remote import target directory must be empty: %s", workspacePath)
				}
			} else if !errors.Is(err, os.ErrNotExist) {
				return nil, err
			}

			parentDir := filepath.Dir(workspacePath)
			if err := os.MkdirAll(parentDir, 0o755); err != nil {
				return nil, fmt.Errorf("prepare remote import parent dir: %w", err)
			}

			if _, err := runGit(parentDir, "clone", "--branch", cloneBranch, "--single-branch", gitURL, workspacePath); err != nil {
				return nil, err
			}

			if name == "" {
				name = filepath.Base(workspacePath)
			}
			req.GitURL = gitURL
			req.GitBranch = cloneBranch
		}
	}
	if name == "" {
		name = "未命名工作空间"
	}
	if workspacePathInUse(store.Workspaces, workspacePath) {
		return nil, fmt.Errorf("workspace path already registered: %s", workspacePath)
	}

	workspaceID := uuid.NewString()

	gitBranch := strings.TrimSpace(req.GitBranch)
	if gitBranch == "" {
		gitBranch = "main"
	}

	descriptor := WorkspaceDescriptor{
		ID:                  workspaceID,
		Name:                name,
		Description:         strings.TrimSpace(req.Description),
		Path:                workspacePath,
		Creator:             strings.TrimSpace(req.Creator),
		GitURL:              strings.TrimSpace(req.GitURL),
		GitBranch:           gitBranch,
		IncludeHistoryInGit: req.IncludeHistoryInGit,
		ReadOnly:            false,
		CreatedAt:           time.Now().Format(time.RFC3339),
		UpdatedAt:           time.Now().Format(time.RFC3339),
		LastOpenedAt:        time.Now().Format(time.RFC3339),
	}

	if mode == "create" {
		if err := ensureWorkspaceDataLayout(descriptor.Path, descriptor); err != nil {
			return nil, err
		}
	}
	if err := writeJSONAtomic(filepath.Join(descriptor.Path, "setting.json"), workspaceSettingFromDescriptor(descriptor)); err != nil {
		return nil, err
	}

	store.Workspaces = append(store.Workspaces, descriptor)
	sort.SliceStable(store.Workspaces, func(i, j int) bool {
		if store.Workspaces[i].ReadOnly != store.Workspaces[j].ReadOnly {
			return store.Workspaces[i].ReadOnly
		}
		return strings.ToLower(store.Workspaces[i].Name) < strings.ToLower(store.Workspaces[j].Name)
	})
	if err := a.saveWorkspaceManager(store); err != nil {
		return nil, err
	}
	return &store, nil
}

func workspacePathInUse(items []WorkspaceDescriptor, path string) bool {
	target := filepath.Clean(strings.TrimSpace(path))
	for i := range items {
		itemPath := filepath.Clean(strings.TrimSpace(items[i].Path))
		if strings.EqualFold(itemPath, target) {
			return true
		}
	}
	return false
}

func isWorkspaceDataLayout(workspacePath string) (bool, error) {
	requiredFiles := []string{
		"workspace.json",
		"setting.json",
		filepath.Join("collections", "setting.json"),
		filepath.Join("mcp", "setting.json"),
	}
	for _, relativePath := range requiredFiles {
		fullPath := filepath.Join(workspacePath, relativePath)
		info, err := os.Stat(fullPath)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return false, nil
			}
			return false, err
		}
		if info.IsDir() {
			return false, nil
		}
	}

	requiredDirs := []string{
		filepath.Join("collections", "entities"),
		filepath.Join("history", "http"),
		filepath.Join("history", "mcp"),
	}
	for _, relativePath := range requiredDirs {
		fullPath := filepath.Join(workspacePath, relativePath)
		info, err := os.Stat(fullPath)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return false, nil
			}
			return false, err
		}
		if !info.IsDir() {
			return false, nil
		}
	}

	return true, nil
}

func (a *App) UpdateWorkspace(req WorkspaceUpdateRequest) (*WorkspaceManagerStore, error) {
	if err := a.ensureDataDir(); err != nil {
		return nil, err
	}
	store, err := a.loadWorkspaceManager()
	if err != nil {
		return nil, err
	}
	target := findWorkspaceByID(store.Workspaces, req.ID)
	if target == nil {
		return nil, fmt.Errorf("workspace not found: %s", req.ID)
	}
	if target.ReadOnly {
		return nil, fmt.Errorf("default workspace is read-only")
	}

	if name := strings.TrimSpace(req.Name); name != "" {
		target.Name = name
	}
	target.Description = strings.TrimSpace(req.Description)
	target.Creator = strings.TrimSpace(req.Creator)
	target.IncludeHistoryInGit = req.IncludeHistoryInGit

	nextURL := strings.TrimSpace(req.GitURL)
	if strings.TrimSpace(target.GitURL) == "" && nextURL != "" {
		hasLocal, err := workspaceHasLocalData(target.Path)
		if err != nil {
			return nil, err
		}
		hasRemote, err := gitRemoteHasContent(nextURL)
		if err != nil {
			return nil, err
		}
		if hasLocal && hasRemote {
			return nil, fmt.Errorf("cannot attach remote repository when both local and remote already contain data")
		}
	}
	target.GitURL = nextURL
	branch := strings.TrimSpace(req.GitBranch)
	if branch == "" {
		branch = "main"
	}
	target.GitBranch = branch
	target.UpdatedAt = time.Now().Format(time.RFC3339)

	if err := writeJSONAtomic(filepath.Join(target.Path, "setting.json"), workspaceSettingFromDescriptor(*target)); err != nil {
		return nil, err
	}
	if err := a.saveWorkspaceManager(store); err != nil {
		return nil, err
	}
	return &store, nil
}

func (a *App) DeleteWorkspace(req WorkspaceDeleteRequest) (*WorkspaceDeleteResult, error) {
	if err := a.ensureDataDir(); err != nil {
		return nil, err
	}
	store, err := a.loadWorkspaceManager()
	if err != nil {
		return nil, err
	}

	index := -1
	for i := range store.Workspaces {
		if store.Workspaces[i].ID == req.ID {
			index = i
			break
		}
	}
	if index < 0 {
		return nil, fmt.Errorf("workspace not found: %s", req.ID)
	}

	target := store.Workspaces[index]
	if target.ReadOnly {
		return nil, fmt.Errorf("default workspace is read-only")
	}

	deleteFileErr := ""
	if req.DeleteLocalFiles {
		workspacePath := strings.TrimSpace(target.Path)
		if workspacePath == "" {
			deleteFileErr = "文件删除失败：工作空间目录为空"
		} else if err := os.RemoveAll(workspacePath); err != nil {
			deleteFileErr = fmt.Sprintf("文件删除失败：%s", err.Error())
		}
	}

	store.Workspaces = append(store.Workspaces[:index], store.Workspaces[index+1:]...)
	if len(store.Workspaces) == 0 {
		return nil, fmt.Errorf("cannot remove the last workspace")
	}

	wasActive := store.ActiveWorkspaceID == target.ID
	if wasActive {
		store.ActiveWorkspaceID = store.Workspaces[0].ID
	}

	if err := a.saveWorkspaceManager(store); err != nil {
		return nil, err
	}

	active := findWorkspaceByID(store.Workspaces, store.ActiveWorkspaceID)
	if active != nil {
		a.dataDir = active.Path
	}
	if wasActive {
		a.closeAllMCPSessions()
	}

	return &WorkspaceDeleteResult{Manager: store, FileDeleteError: deleteFileErr}, nil
}

func workspaceHasLocalData(path string) (bool, error) {
	entries, err := os.ReadDir(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return false, nil
		}
		return false, err
	}
	for _, entry := range entries {
		name := strings.ToLower(entry.Name())
		if name == ".git" {
			continue
		}
		return true, nil
	}
	return false, nil
}

func gitRemoteHasContent(remoteURL string) (bool, error) {
	cmd := exec.Command("git", "ls-remote", "--heads", remoteURL)
	configureStdioCommand(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return false, fmt.Errorf("check remote: %s", strings.TrimSpace(string(out)))
	}
	return strings.TrimSpace(string(out)) != "", nil
}

func copyFile(src string, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0o644)
}

func copyDir(src string, dst string) error {
	entries, err := os.ReadDir(src)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return err
	}
	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())
		if entry.IsDir() {
			if err := copyDir(srcPath, dstPath); err != nil {
				return err
			}
			continue
		}
		if err := copyFile(srcPath, dstPath); err != nil {
			return err
		}
	}
	return nil
}
