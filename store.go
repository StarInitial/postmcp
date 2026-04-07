package main

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

func readWorkspaceStore(path string) (WorkspaceStore, error) {
	store := defaultWorkspaceStore()
	if err := readJSONFile(path, &store); err != nil {
		return store, err
	}
	if len(store.Tabs) == 0 {
		store = defaultWorkspaceStore()
	}
	return store, nil
}

func readCollectionStore(path string) (CollectionStore, error) {
	if store, err := readCollectionStoreFromDir(filepath.Dir(path)); err == nil {
		return store, nil
	}
	store, err := readCollectionStoreLegacy(path)
	if err != nil && os.IsNotExist(err) {
		return defaultCollectionStore(), nil
	}
	return store, err
}

func readMCPServerStore(path string) (MCPServerStore, error) {
	if store, err := readMCPServerStoreFromDir(filepath.Dir(path)); err == nil {
		return store, nil
	}
	store, err := readMCPServerStoreLegacy(path)
	if err != nil && os.IsNotExist(err) {
		return defaultMCPServerStore(), nil
	}
	return store, err
}

func readHistoryStore(path string) (HistoryStore, error) {
	mode := ModeHTTP
	base := strings.ToLower(filepath.Base(path))
	if strings.Contains(base, "mcp") {
		mode = ModeMCP
	}
	if store, err := readHistoryStoreFromDir(filepath.Dir(path), mode); err == nil {
		return store, nil
	}
	store, err := readHistoryStoreLegacy(path)
	if err != nil && os.IsNotExist(err) {
		return defaultHistoryStore(), nil
	}
	return store, err
}

func readSettingsStore(path string) (SettingsStore, error) {
	store := defaultSettingsStore()
	return store, readJSONFile(path, &store)
}

func readJSONFile(path string, out any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read %s: %w", filepath.Base(path), err)
	}
	if len(data) == 0 {
		return nil
	}
	if err := json.Unmarshal(data, out); err != nil {
		backupPath := path + ".broken-" + time.Now().Format("20060102150405")
		_ = os.WriteFile(backupPath, data, 0o644)
		return fmt.Errorf("parse %s: %w", filepath.Base(path), err)
	}
	return nil
}

func readCollectionStoreLegacy(path string) (CollectionStore, error) {
	store := defaultCollectionStore()
	return store, readJSONFile(path, &store)
}

func readMCPServerStoreLegacy(path string) (MCPServerStore, error) {
	store := defaultMCPServerStore()
	return store, readJSONFile(path, &store)
}

func readHistoryStoreLegacy(path string) (HistoryStore, error) {
	store := defaultHistoryStore()
	return store, readJSONFile(path, &store)
}

func writeJSONAtomic(path string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal %s: %w", filepath.Base(path), err)
	}
	tmpFile, err := os.CreateTemp(filepath.Dir(path), filepath.Base(path)+".*.tmp")
	if err != nil {
		return fmt.Errorf("create temp %s: %w", filepath.Base(path), err)
	}
	tmpPath := tmpFile.Name()
	defer os.Remove(tmpPath)

	if _, err := tmpFile.Write(data); err != nil {
		tmpFile.Close()
		return fmt.Errorf("write temp %s: %w", filepath.Base(path), err)
	}
	if err := tmpFile.Close(); err != nil {
		return fmt.Errorf("close temp %s: %w", filepath.Base(path), err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		return fmt.Errorf("replace %s: %w", filepath.Base(path), err)
	}
	return nil
}

type collectionSettingsFile struct {
	Version     int                 `json:"version"`
	UpdatedAt   string              `json:"updatedAt"`
	RootOrder   []string            `json:"rootOrder"`
	ChildOrder  map[string][]string `json:"childOrder"`
	FolderNames map[string]string   `json:"folderNames"`
	EntityFiles map[string]string   `json:"entityFiles"`
}

type collectionEntityFile struct {
	ID       string        `json:"id"`
	Type     string        `json:"type"`
	Name     string        `json:"name"`
	ParentID string        `json:"parentId,omitempty"`
	Request  *SavedRequest `json:"request,omitempty"`
}

type mcpSettingsFile struct {
	Version   int               `json:"version"`
	UpdatedAt string            `json:"updatedAt"`
	Order     []string          `json:"order"`
	FileByID  map[string]string `json:"fileById"`
}

func readCollectionStoreFromDir(dataDir string) (CollectionStore, error) {
	settingsPath := filepath.Join(dataDir, "collections", "setting.json")
	entitiesDir := filepath.Join(dataDir, "collections", "entities")

	settings := collectionSettingsFile{}
	if err := readJSONFile(settingsPath, &settings); err != nil {
		if !os.IsNotExist(err) {
			return CollectionStore{}, err
		}
	}

	entries, err := os.ReadDir(entitiesDir)
	if err != nil {
		if os.IsNotExist(err) {
			return defaultCollectionStore(), nil
		}
		return CollectionStore{}, fmt.Errorf("read collection entities: %w", err)
	}

	nodes := make(map[string]collectionEntityFile)
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".json") {
			continue
		}
		entity := collectionEntityFile{}
		if err := readJSONFile(filepath.Join(entitiesDir, entry.Name()), &entity); err != nil {
			return CollectionStore{}, err
		}
		if strings.TrimSpace(entity.ID) == "" {
			continue
		}
		nodes[entity.ID] = entity
	}
	if len(nodes) == 0 {
		return defaultCollectionStore(), nil
	}

	if len(settings.RootOrder) == 0 {
		settings.RootOrder = rebuildCollectionRootOrder(settings, nodes)
	}
	if len(settings.ChildOrder) == 0 {
		settings.ChildOrder = rebuildCollectionChildOrder(nodes)
	}

	var buildNode func(id string) CollectionNode
	buildNode = func(id string) CollectionNode {
		entity := nodes[id]
		node := CollectionNode{ID: entity.ID, Type: entity.Type, Name: entity.Name, Request: entity.Request}
		childIDs := settings.ChildOrder[id]
		if len(childIDs) == 0 {
			return node
		}
		node.Children = make([]CollectionNode, 0, len(childIDs))
		for _, childID := range childIDs {
			if _, ok := nodes[childID]; !ok {
				continue
			}
			node.Children = append(node.Children, buildNode(childID))
		}
		return node
	}

	items := make([]CollectionNode, 0, len(settings.RootOrder))
	seenRoots := map[string]bool{}
	for _, id := range settings.RootOrder {
		if _, ok := nodes[id]; !ok {
			continue
		}
		if seenRoots[id] {
			continue
		}
		seenRoots[id] = true
		items = append(items, buildNode(id))
	}

	if len(items) == 0 {
		for _, id := range rebuildCollectionRootOrder(settings, nodes) {
			if seenRoots[id] {
				continue
			}
			if _, ok := nodes[id]; !ok {
				continue
			}
			seenRoots[id] = true
			items = append(items, buildNode(id))
		}
	}

	return CollectionStore{
		Version:   currentSchemaVersion,
		Items:     items,
		UpdatedAt: settings.UpdatedAt,
	}, nil
}

func rebuildCollectionChildOrder(nodes map[string]collectionEntityFile) map[string][]string {
	childOrder := map[string][]string{}
	for _, entity := range nodes {
		parentID := strings.TrimSpace(entity.ParentID)
		if parentID == "" {
			continue
		}
		childOrder[parentID] = append(childOrder[parentID], entity.ID)
	}
	for parentID := range childOrder {
		sort.Strings(childOrder[parentID])
	}
	return childOrder
}

func rebuildCollectionRootOrder(settings collectionSettingsFile, nodes map[string]collectionEntityFile) []string {
	roots := make([]string, 0)
	seen := map[string]bool{}
	for _, id := range settings.RootOrder {
		if _, ok := nodes[id]; !ok || seen[id] {
			continue
		}
		seen[id] = true
		roots = append(roots, id)
	}
	for id, entity := range nodes {
		if seen[id] {
			continue
		}
		if strings.TrimSpace(entity.ParentID) != "" {
			continue
		}
		seen[id] = true
		roots = append(roots, id)
	}
	return roots
}

func writeCollectionStoreToDir(dataDir string, store CollectionStore) error {
	collectionsDir := filepath.Join(dataDir, "collections")
	entitiesDir := filepath.Join(collectionsDir, "entities")
	if err := os.MkdirAll(entitiesDir, 0o755); err != nil {
		return fmt.Errorf("create collections dir: %w", err)
	}

	settingsPath := filepath.Join(collectionsDir, "setting.json")
	previous := collectionSettingsFile{}
	if err := readJSONFile(settingsPath, &previous); err != nil {
		if !os.IsNotExist(err) {
			return err
		}
		previous.EntityFiles = map[string]string{}
	}
	if previous.EntityFiles == nil {
		previous.EntityFiles = map[string]string{}
	}

	rootOrder := make([]string, 0, len(store.Items))
	childOrder := make(map[string][]string)
	folderNames := make(map[string]string)
	entityFiles := map[string]string{}
	entities := make(map[string]collectionEntityFile)

	var walk func(nodes []CollectionNode, parentID string)
	walk = func(nodes []CollectionNode, parentID string) {
		for _, node := range nodes {
			if parentID == "" {
				rootOrder = append(rootOrder, node.ID)
			} else {
				childOrder[parentID] = append(childOrder[parentID], node.ID)
			}
			entities[node.ID] = collectionEntityFile{
				ID:       node.ID,
				Type:     node.Type,
				Name:     node.Name,
				ParentID: parentID,
				Request:  node.Request,
			}
			if node.Type == "folder" {
				folderNames[node.ID] = node.Name
			}
			if len(node.Children) > 0 {
				walk(node.Children, node.ID)
			}
		}
	}
	walk(store.Items, "")

	for id, entity := range entities {
		fileName := previous.EntityFiles[id]
		if strings.TrimSpace(fileName) == "" {
			fileName = fmt.Sprintf("%s__%s__%s.json", sanitizeNameForFile(entity.Type, 16), sanitizeNameForFile(entity.Name, 48), id)
		}
		entityFiles[id] = fileName
		if err := writeJSONAtomic(filepath.Join(entitiesDir, fileName), entity); err != nil {
			return err
		}
	}

	for id, fileName := range previous.EntityFiles {
		if _, ok := entities[id]; ok {
			continue
		}
		_ = os.Remove(filepath.Join(entitiesDir, fileName))
	}

	settings := collectionSettingsFile{
		Version:     currentSchemaVersion,
		UpdatedAt:   store.UpdatedAt,
		RootOrder:   rootOrder,
		ChildOrder:  childOrder,
		FolderNames: folderNames,
		EntityFiles: entityFiles,
	}
	return writeJSONAtomic(settingsPath, settings)
}

func readMCPServerStoreFromDir(dataDir string) (MCPServerStore, error) {
	dir := filepath.Join(dataDir, "mcp")
	if _, err := os.Stat(dir); err != nil {
		if os.IsNotExist(err) {
			return defaultMCPServerStore(), nil
		}
		return MCPServerStore{}, fmt.Errorf("read mcp dir: %w", err)
	}

	settings := mcpSettingsFile{}
	_ = readJSONFile(filepath.Join(dir, "setting.json"), &settings)

	entries, err := os.ReadDir(dir)
	if err != nil {
		return MCPServerStore{}, fmt.Errorf("read mcp dir entries: %w", err)
	}

	serversByID := map[string]MCPServerConfig{}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".json") || entry.Name() == "setting.json" {
			continue
		}
		server := MCPServerConfig{}
		if err := readJSONFile(filepath.Join(dir, entry.Name()), &server); err != nil {
			return MCPServerStore{}, err
		}
		if strings.TrimSpace(server.ID) == "" {
			continue
		}
		serversByID[server.ID] = server
	}

	servers := make([]MCPServerConfig, 0, len(serversByID))
	used := map[string]bool{}
	for _, id := range settings.Order {
		server, ok := serversByID[id]
		if !ok {
			continue
		}
		servers = append(servers, server)
		used[id] = true
	}
	for id, server := range serversByID {
		if used[id] {
			continue
		}
		servers = append(servers, server)
	}

	return MCPServerStore{Version: currentSchemaVersion, Servers: servers, UpdatedAt: settings.UpdatedAt}, nil
}

func writeMCPServerStoreToDir(dataDir string, store MCPServerStore) error {
	dir := filepath.Join(dataDir, "mcp")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create mcp dir: %w", err)
	}

	settingsPath := filepath.Join(dir, "setting.json")
	settings := mcpSettingsFile{}
	if err := readJSONFile(settingsPath, &settings); err != nil && !os.IsNotExist(err) {
		return err
	}
	if settings.FileByID == nil {
		settings.FileByID = map[string]string{}
	}

	order := make([]string, 0, len(store.Servers))
	currentIDs := map[string]bool{}
	for _, server := range store.Servers {
		order = append(order, server.ID)
		currentIDs[server.ID] = true
		fileName := settings.FileByID[server.ID]
		if strings.TrimSpace(fileName) == "" {
			fileName = fmt.Sprintf("%s__%s.json", sanitizeNameForFile(server.Name, 48), server.ID)
		}
		settings.FileByID[server.ID] = fileName
		if err := writeJSONAtomic(filepath.Join(dir, fileName), server); err != nil {
			return err
		}
	}

	for id, fileName := range settings.FileByID {
		if currentIDs[id] {
			continue
		}
		_ = os.Remove(filepath.Join(dir, fileName))
		delete(settings.FileByID, id)
	}

	settings.Version = currentSchemaVersion
	settings.UpdatedAt = store.UpdatedAt
	settings.Order = order
	return writeJSONAtomic(settingsPath, settings)
}

func historyDir(dataDir string, mode string) string {
	if mode == ModeMCP {
		return filepath.Join(dataDir, "history", "mcp")
	}
	return filepath.Join(dataDir, "history", "http")
}

func historyFileName(item HistoryItem) string {
	ts := compactHistoryTimestamp(item.Timestamp)
	status := sanitizeNameForFile(item.Status, 24)
	if status == "" {
		status = "na"
	}
	return fmt.Sprintf("%s__%s__%s__%d.json", ts, item.ID, status, item.DurationMs)
}

func compactHistoryTimestamp(raw string) string {
	parsed, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return "00000000T000000.000Z"
	}
	return parsed.UTC().Format("20060102T150405.000Z")
}

func encodeHistoryMeta(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "h-"
	}
	if utf8.RuneCountInString(trimmed) > 90 {
		runes := []rune(trimmed)
		trimmed = string(runes[:90])
	}
	replaced := strings.ReplaceAll(trimmed, "\n", " ")
	replaced = strings.ReplaceAll(replaced, "\r", " ")
	return "h-" + hex.EncodeToString([]byte(replaced))
}

func parseHistoryFileName(name string, mode string) (HistoryItem, bool) {
	if !strings.HasSuffix(strings.ToLower(name), ".json") {
		return HistoryItem{}, false
	}
	trimmed := strings.TrimSuffix(name, filepath.Ext(name))
	parts := strings.Split(trimmed, "__")
	if len(parts) != 4 && len(parts) != 6 {
		return HistoryItem{}, false
	}
	duration, _ := strconv.ParseInt(parts[3], 10, 64)
	timeValue := ""
	if parsed, err := time.Parse("20060102T150405.000Z", parts[0]); err == nil {
		timeValue = parsed.UTC().Format(time.RFC3339)
	}
	if timeValue == "" {
		timeValue = time.Now().UTC().Format(time.RFC3339)
	}
	item := HistoryItem{
		ID:         parts[1],
		Mode:       mode,
		Status:     parts[2],
		DurationMs: duration,
		Timestamp:  timeValue,
	}
	if len(parts) == 6 {
		if !strings.HasPrefix(parts[4], "h-") || !strings.HasPrefix(parts[5], "h-") {
			return HistoryItem{}, false
		}
		item.Title = decodeHistoryMeta(parts[4])
		item.Subtitle = decodeHistoryMeta(parts[5])
	}
	return item, true
}

func decodeHistoryMeta(raw string) string {
	if raw == "h-" {
		return ""
	}
	if !strings.HasPrefix(raw, "h-") {
		return ""
	}
	decoded, err := hex.DecodeString(strings.TrimPrefix(raw, "h-"))
	if err != nil {
		return ""
	}
	return string(decoded)
}

func readHistoryStoreFromDir(dataDir string, mode string) (HistoryStore, error) {
	dir := historyDir(dataDir, mode)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return defaultHistoryStore(), nil
		}
		return HistoryStore{}, fmt.Errorf("read history dir: %w", err)
	}

	items := make([]HistoryItem, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		item, ok := readHistoryEntry(filepath.Join(dir, entry.Name()), entry.Name(), mode)
		if !ok {
			continue
		}
		items = append(items, item)
	}

	sort.SliceStable(items, func(i, j int) bool {
		return items[i].Timestamp > items[j].Timestamp
	})

	return HistoryStore{Version: currentSchemaVersion, Items: items, UpdatedAt: time.Now().Format(time.RFC3339)}, nil
}

func readHistoryEntry(path string, name string, mode string) (HistoryItem, bool) {
	item, ok := parseHistoryFileName(name, mode)
	stored := HistoryItem{}
	if err := readJSONFile(path, &stored); err == nil && strings.TrimSpace(stored.ID) != "" {
		if strings.TrimSpace(stored.Mode) == "" {
			stored.Mode = mode
		}
		if !ok {
			return stored, true
		}
		if strings.TrimSpace(stored.Timestamp) == "" {
			stored.Timestamp = item.Timestamp
		}
		if strings.TrimSpace(stored.Status) == "" {
			stored.Status = item.Status
		}
		if stored.DurationMs == 0 {
			stored.DurationMs = item.DurationMs
		}
		return stored, true
	}
	if !ok {
		return HistoryItem{}, false
	}
	return item, true
}

func writeHistoryStoreToDir(dataDir string, mode string, store HistoryStore) error {
	dir := historyDir(dataDir, mode)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create history dir: %w", err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("read history dir entries: %w", err)
	}
	existing := map[string]string{}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		item, ok := parseHistoryFileName(entry.Name(), mode)
		if !ok {
			continue
		}
		existing[item.ID] = entry.Name()
	}

	active := map[string]bool{}
	for _, item := range store.Items {
		active[item.ID] = true
		fileName := historyFileName(item)
		if oldName, ok := existing[item.ID]; ok {
			_ = os.Remove(filepath.Join(dir, oldName))
		}
		if err := writeJSONAtomic(filepath.Join(dir, fileName), item); err != nil {
			return err
		}
	}

	for id, oldName := range existing {
		if active[id] {
			continue
		}
		_ = os.Remove(filepath.Join(dir, oldName))
	}

	return nil
}

func appendHistoryItemToDir(dataDir string, mode string, item HistoryItem, limit int) error {
	store, err := readHistoryStoreFromDir(dataDir, mode)
	if err != nil {
		if !os.IsNotExist(err) {
			return err
		}
		store = defaultHistoryStore()
	}
	store.Items = append([]HistoryItem{item}, store.Items...)
	store.Items = dedupeAndSortHistory(store.Items, limit)
	return writeHistoryStoreToDir(dataDir, mode, store)
}

func readHistoryItemFromDir(dataDir string, mode string, id string) (HistoryItem, error) {
	dir := historyDir(dataDir, mode)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return HistoryItem{}, fmt.Errorf("read history dir entries: %w", err)
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		item, ok := readHistoryEntry(filepath.Join(dir, entry.Name()), entry.Name(), mode)
		if !ok || item.ID != id {
			continue
		}
		return item, nil
	}
	return HistoryItem{}, fmt.Errorf("history item not found: %s", id)
}

func deleteHistoryItemFromDir(dataDir string, mode string, id string) error {
	dir := historyDir(dataDir, mode)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("read history dir entries: %w", err)
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		item, ok := readHistoryEntry(filepath.Join(dir, entry.Name()), entry.Name(), mode)
		if !ok || item.ID != id {
			continue
		}
		return os.Remove(filepath.Join(dir, entry.Name()))
	}
	return nil
}

func deleteHistoryDayFromDir(dataDir string, mode string, dayKey string) error {
	dir := historyDir(dataDir, mode)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("read history dir entries: %w", err)
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		item, ok := readHistoryEntry(filepath.Join(dir, entry.Name()), entry.Name(), mode)
		if !ok {
			continue
		}
		if !strings.HasPrefix(item.Timestamp, dayKey) {
			continue
		}
		_ = os.Remove(filepath.Join(dir, entry.Name()))
	}
	return nil
}

func clearHistoryDir(dataDir string, mode string) error {
	dir := historyDir(dataDir, mode)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("read history dir entries: %w", err)
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		_ = os.Remove(filepath.Join(dir, entry.Name()))
	}
	return nil
}

func sanitizeNameForFile(raw string, maxLen int) string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "item"
	}
	replacer := strings.NewReplacer("<", "_", ">", "_", ":", "_", "\"", "_", "/", "_", "\\", "_", "|", "_", "?", "_", "*", "_")
	value = replacer.Replace(value)
	value = strings.ReplaceAll(value, " ", "_")
	value = strings.Trim(value, "._")
	if value == "" {
		value = "item"
	}
	if maxLen > 0 && utf8.RuneCountInString(value) > maxLen {
		runes := []rune(value)
		value = string(runes[:maxLen])
	}
	return value
}

func dedupeAndSortHistory(items []HistoryItem, limit int) []HistoryItem {
	if limit <= 0 {
		limit = 500
	}
	sort.SliceStable(items, func(i, j int) bool {
		return items[i].Timestamp > items[j].Timestamp
	})
	if len(items) > limit {
		items = items[:limit]
	}
	return items
}
