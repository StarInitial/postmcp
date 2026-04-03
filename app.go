package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type App struct {
	ctx             context.Context
	dataDir         string
	configRoot      string
	legacyDataDir   string
	runtimeDir      string
	workspaceRoot   string
	workspaceDBPath string
	settingsPath    string
	mcpMu           sync.Mutex
	sessions        map[string]*managedMCPSession
}

func NewApp() *App {
	return &App{
		sessions: make(map[string]*managedMCPSession),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	if err := a.ensureDataDir(); err != nil {
		fmt.Println("startup error:", err)
	}
}

func (a *App) shutdown(ctx context.Context) {
	a.closeAllMCPSessions()
}

func (a *App) ensureDataDir() error {
	if a.dataDir != "" {
		return nil
	}
	if err := a.ensureWorkspaceRuntime(); err != nil {
		return err
	}

	manager, err := a.loadWorkspaceManager()
	if err != nil {
		return err
	}
	active := findWorkspaceByID(manager.Workspaces, manager.ActiveWorkspaceID)
	if active == nil {
		return fmt.Errorf("active workspace not found: %s", manager.ActiveWorkspaceID)
	}
	a.dataDir = active.Path
	if err := ensureWorkspaceDataLayout(a.dataDir, *active); err != nil {
		return err
	}

	return nil

}

func (a *App) migrateLegacyDataIfNeeded() error {
	collectionsSettings := filepath.Join(a.dataDir, "collections", "setting.json")
	legacyCollections := filepath.Join(a.dataDir, "collections.json")
	if _, err := os.Stat(collectionsSettings); errors.Is(err, os.ErrNotExist) {
		if _, legacyErr := os.Stat(legacyCollections); legacyErr == nil {
			store, readErr := readCollectionStoreLegacy(legacyCollections)
			if readErr != nil {
				return readErr
			}
			if store.UpdatedAt == "" {
				store.UpdatedAt = time.Now().Format(time.RFC3339)
			}
			if err := writeCollectionStoreToDir(a.dataDir, store); err != nil {
				return err
			}
		}
	}

	mcpSettings := filepath.Join(a.dataDir, "mcp", "setting.json")
	legacyMCP := filepath.Join(a.dataDir, "mcp_servers.json")
	if _, err := os.Stat(mcpSettings); errors.Is(err, os.ErrNotExist) {
		if _, legacyErr := os.Stat(legacyMCP); legacyErr == nil {
			store, readErr := readMCPServerStoreLegacy(legacyMCP)
			if readErr != nil {
				return readErr
			}
			if store.UpdatedAt == "" {
				store.UpdatedAt = time.Now().Format(time.RFC3339)
			}
			if err := writeMCPServerStoreToDir(a.dataDir, store); err != nil {
				return err
			}
		}
	}

	for _, mode := range []string{ModeHTTP, ModeMCP} {
		legacyName := "history_http.json"
		if mode == ModeMCP {
			legacyName = "history_mcp.json"
		}
		legacyPath := filepath.Join(a.dataDir, legacyName)
		targetDir := filepath.Join(a.dataDir, "history", mode)
		entries, _ := os.ReadDir(targetDir)
		if len(entries) > 0 {
			continue
		}
		if _, legacyErr := os.Stat(legacyPath); legacyErr != nil {
			continue
		}
		store, readErr := readHistoryStoreLegacy(legacyPath)
		if readErr != nil {
			return readErr
		}
		if err := writeHistoryStoreToDir(a.dataDir, mode, store); err != nil {
			return err
		}
	}

	return nil
}

func (a *App) loadAppSettings() (SettingsStore, error) {
	if err := a.ensureDataDir(); err != nil {
		return SettingsStore{}, err
	}
	return readSettingsStore(a.settingsPath)
}

func (a *App) LoadBootstrapData() (*BootstrapData, error) {
	if err := a.ensureDataDir(); err != nil {
		return nil, err
	}
	manager, err := a.loadWorkspaceManager()
	if err != nil {
		return nil, err
	}
	activeWorkspace := findWorkspaceByID(manager.Workspaces, manager.ActiveWorkspaceID)
	if activeWorkspace == nil {
		return nil, fmt.Errorf("active workspace not found: %s", manager.ActiveWorkspaceID)
	}
	a.dataDir = activeWorkspace.Path

	workspace, err := readWorkspaceStore(filepath.Join(a.dataDir, "workspace.json"))
	if err != nil {
		return nil, err
	}
	collections, err := readCollectionStore(filepath.Join(a.dataDir, "collections.json"))
	if err != nil {
		return nil, err
	}
	mcpServers, err := readMCPServerStore(filepath.Join(a.dataDir, "mcp_servers.json"))
	if err != nil {
		return nil, err
	}
	httpHistory, err := readHistoryStore(filepath.Join(a.dataDir, "history_http.json"))
	if err != nil {
		return nil, err
	}
	mcpHistory, err := readHistoryStore(filepath.Join(a.dataDir, "history_mcp.json"))
	if err != nil {
		return nil, err
	}
	settings, err := readSettingsStore(a.settingsPath)
	if err != nil {
		return nil, err
	}

	return &BootstrapData{
		Workspace:   workspace,
		Collections: collections,
		MCPServers:  mcpServers,
		History: CombinedHistoryStore{
			HTTP: httpHistory,
			MCP:  mcpHistory,
		},
		Settings:         settings,
		WorkspaceManager: manager,
		ActiveWorkspace:  *activeWorkspace,
		LoadedAt:         time.Now().Format(time.RFC3339),
	}, nil
}

func (a *App) SaveWorkspace(store WorkspaceStore) error {
	if err := a.ensureDataDir(); err != nil {
		return err
	}
	store.Version = currentSchemaVersion
	store.UpdatedAt = time.Now().Format(time.RFC3339)
	return writeJSONAtomic(filepath.Join(a.dataDir, "workspace.json"), store)
}

func (a *App) SaveCollections(store CollectionStore) error {
	if err := a.ensureDataDir(); err != nil {
		return err
	}
	store.Version = currentSchemaVersion
	store.UpdatedAt = time.Now().Format(time.RFC3339)
	return writeCollectionStoreToDir(a.dataDir, store)
}

func (a *App) SaveMCPServers(store MCPServerStore) error {
	if err := a.ensureDataDir(); err != nil {
		return err
	}
	store.Version = currentSchemaVersion
	store.UpdatedAt = time.Now().Format(time.RFC3339)
	a.closeRemovedMCPSessions(store.Servers)
	return writeMCPServerStoreToDir(a.dataDir, store)
}

func (a *App) SaveHTTPHistory(store HistoryStore) error {
	if err := a.ensureDataDir(); err != nil {
		return err
	}
	store.Version = currentSchemaVersion
	store.UpdatedAt = time.Now().Format(time.RFC3339)
	return writeHistoryStoreToDir(a.dataDir, ModeHTTP, store)
}

func (a *App) SaveMCPHistory(store HistoryStore) error {
	if err := a.ensureDataDir(); err != nil {
		return err
	}
	store.Version = currentSchemaVersion
	store.UpdatedAt = time.Now().Format(time.RFC3339)
	return writeHistoryStoreToDir(a.dataDir, ModeMCP, store)
}

func (a *App) SaveSettings(store SettingsStore) error {
	if err := a.ensureDataDir(); err != nil {
		return err
	}
	store.Version = currentSchemaVersion
	store.UpdatedAt = time.Now().Format(time.RFC3339)
	return writeJSONAtomic(a.settingsPath, store)
}

func (a *App) LoadHistoryItem(mode string, historyID string) (*HistoryItem, error) {
	if err := a.ensureDataDir(); err != nil {
		return nil, err
	}
	normalizedMode := strings.ToLower(strings.TrimSpace(mode))
	if normalizedMode != ModeMCP {
		normalizedMode = ModeHTTP
	}
	item, err := readHistoryItemFromDir(a.dataDir, normalizedMode, historyID)
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (a *App) DeleteHistoryItem(historyID string) error {
	if err := a.ensureDataDir(); err != nil {
		return err
	}
	if err := deleteHistoryItemFromDir(a.dataDir, ModeHTTP, historyID); err != nil {
		return err
	}
	if err := deleteHistoryItemFromDir(a.dataDir, ModeMCP, historyID); err != nil {
		return err
	}
	return nil
}

func (a *App) DeleteHistoryDay(dayKey string) error {
	if err := a.ensureDataDir(); err != nil {
		return err
	}
	if err := deleteHistoryDayFromDir(a.dataDir, ModeHTTP, dayKey); err != nil {
		return err
	}
	if err := deleteHistoryDayFromDir(a.dataDir, ModeMCP, dayKey); err != nil {
		return err
	}
	return nil
}

func (a *App) ClearHistory() error {
	if err := a.ensureDataDir(); err != nil {
		return err
	}
	if err := clearHistoryDir(a.dataDir, ModeHTTP); err != nil {
		return err
	}
	if err := clearHistoryDir(a.dataDir, ModeMCP); err != nil {
		return err
	}
	return nil
}

func (a *App) TestMCPServer(serverID string) (*MCPServerTestResult, error) {
	server, err := a.getMCPServerByID(serverID)
	if err != nil {
		return nil, err
	}

	start := time.Now()
	managed, err := a.ensureMCPSession(server)
	if err != nil {
		return &MCPServerTestResult{
			Success:    false,
			ServerID:   serverID,
			DurationMs: time.Since(start).Milliseconds(),
			Error:      err.Error(),
		}, nil
	}

	initResult := managed.session.InitializeResult()
	serverName := ""
	serverVersion := ""
	if initResult != nil {
		serverName = initResult.ServerInfo.Name
		serverVersion = initResult.ServerInfo.Version
	}

	return &MCPServerTestResult{
		Success:       true,
		ServerID:      serverID,
		DurationMs:    time.Since(start).Milliseconds(),
		ServerName:    serverName,
		ServerVersion: serverVersion,
	}, nil
}
