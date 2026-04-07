package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type managedMCPSession struct {
	server     MCPServerConfig
	client     *mcp.Client
	session    *mcp.ClientSession
	httpClient *http.Client
	mu         sync.Mutex
}

func (a *App) DiscoverMCPServer(serverID string) (*MCPDiscoverResult, error) {
	server, err := a.getMCPServerByID(serverID)
	if err != nil {
		return nil, err
	}
	managed, err := a.ensureMCPSession(server)
	if err != nil {
		return &MCPDiscoverResult{ServerID: serverID, Error: err.Error()}, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), normalizedTimeout(server.TimeoutMs))
	defer cancel()

	var (
		tools     []MCPTool
		prompts   []MCPPrompt
		resources []MCPResource
		toolsErr  error
	)

	var wg sync.WaitGroup
	wg.Add(3)
	go func() {
		defer wg.Done()
		tools, toolsErr = listAllTools(ctx, managed.session)
	}()
	go func() {
		defer wg.Done()
		prompts, _ = listAllPrompts(ctx, managed.session)
	}()
	go func() {
		defer wg.Done()
		resources, _ = listAllResources(ctx, managed.session)
	}()
	wg.Wait()

	if toolsErr != nil {
		return &MCPDiscoverResult{ServerID: serverID, Error: toolsErr.Error()}, nil
	}

	result := &MCPDiscoverResult{
		ServerID:   serverID,
		Tools:      tools,
		Prompts:    prompts,
		Resources:  resources,
		Connected:  true,
		ServerName: server.Name,
	}
	if init := managed.session.InitializeResult(); init != nil {
		result.ServerName = init.ServerInfo.Name
		result.ServerVersion = init.ServerInfo.Version
	}
	_ = a.updateServerCaches(serverID, tools, prompts, resources)
	return result, nil
}

func (a *App) ExecuteMCPTool(req MCPCallRequest) (*MCPCallResult, error) {
	server, err := a.getMCPServerByID(req.ServerID)
	if err != nil {
		return nil, err
	}
	managed, err := a.ensureMCPSession(server)
	if err != nil {
		return nil, err
	}
	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), normalizedTimeout(server.TimeoutMs))
	defer cancel()

	arguments := map[string]any{}
	if strings.TrimSpace(req.ArgumentsJSON) != "" {
		if err := json.Unmarshal([]byte(req.ArgumentsJSON), &arguments); err != nil {
			return nil, fmt.Errorf("parse MCP arguments JSON: %w", err)
		}
	}

	response, err := managed.session.CallTool(ctx, &mcp.CallToolParams{Name: req.ToolName, Arguments: arguments})
	if err != nil {
		result := &MCPCallResult{
			ServerID:    req.ServerID,
			ToolName:    req.ToolName,
			DurationMs:  time.Since(start).Milliseconds(),
			Error:       err.Error(),
			IsError:     true,
			RequestedAt: start.Format(time.RFC3339),
		}
		a.appendHistory(ModeMCP, HistoryItem{
			ID:          uuid.NewString(),
			Mode:        ModeMCP,
			Title:       server.Name + " / " + req.ToolName,
			Subtitle:    err.Error(),
			Status:      "error",
			DurationMs:  result.DurationMs,
			Timestamp:   start.Format(time.RFC3339),
			SummaryJSON: summarizeJSON(map[string]any{"request": req, "response": result}),
		})
		return result, nil
	}

	result := &MCPCallResult{
		ServerID:          req.ServerID,
		ToolName:          req.ToolName,
		DurationMs:        time.Since(start).Milliseconds(),
		Content:           flattenMCPContent(response.Content),
		StructuredContent: summarizeJSON(response.StructuredContent),
		IsError:           response.IsError,
		RequestedAt:       start.Format(time.RFC3339),
	}
	if response.GetError() != nil {
		result.Error = response.GetError().Error()
		result.IsError = true
	}

	a.appendHistory(ModeMCP, HistoryItem{
		ID:          uuid.NewString(),
		Mode:        ModeMCP,
		Title:       server.Name + " / " + req.ToolName,
		Subtitle:    boolStatus(!result.IsError),
		Status:      boolStatus(!result.IsError),
		DurationMs:  result.DurationMs,
		Timestamp:   start.Format(time.RFC3339),
		SummaryJSON: summarizeJSON(map[string]any{"request": req, "response": result}),
	})

	return result, nil
}

func (a *App) GetMCPPrompt(req MCPPromptRequest) (*MCPPromptResultView, error) {
	server, err := a.getMCPServerByID(req.ServerID)
	if err != nil {
		return nil, err
	}
	managed, err := a.ensureMCPSession(server)
	if err != nil {
		return nil, err
	}
	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), normalizedTimeout(server.TimeoutMs))
	defer cancel()

	args := req.Arguments
	if len(args) == 0 && strings.TrimSpace(req.ArgumentsJS) != "" {
		if err := json.Unmarshal([]byte(req.ArgumentsJS), &args); err != nil {
			return nil, fmt.Errorf("parse prompt arguments: %w", err)
		}
	}

	response, err := managed.session.GetPrompt(ctx, &mcp.GetPromptParams{Name: req.PromptName, Arguments: args})
	if err != nil {
		return nil, err
	}

	view := &MCPPromptResultView{
		ServerID:      req.ServerID,
		PromptName:    req.PromptName,
		DurationMs:    time.Since(start).Milliseconds(),
		Description:   response.Description,
		Messages:      flattenPromptMessages(response),
		RequestedAt:   start.Format(time.RFC3339),
		ArgumentsJSON: summarizeJSON(args),
	}
	return view, nil
}

func (a *App) ReadMCPResource(serverID string, resourceURI string) (*MCPReadResourceResult, error) {
	server, err := a.getMCPServerByID(serverID)
	if err != nil {
		return nil, err
	}
	managed, err := a.ensureMCPSession(server)
	if err != nil {
		return nil, err
	}
	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), normalizedTimeout(server.TimeoutMs))
	defer cancel()

	response, err := managed.session.ReadResource(ctx, &mcp.ReadResourceParams{URI: resourceURI})
	if err != nil {
		return nil, err
	}

	contents := make([]string, 0, len(response.Contents))
	for _, item := range response.Contents {
		if item == nil {
			continue
		}
		if item.Text != "" {
			contents = append(contents, item.Text)
			continue
		}
		if len(item.Blob) > 0 {
			contents = append(contents, fmt.Sprintf("[binary %d bytes]", len(item.Blob)))
		}
	}

	return &MCPReadResourceResult{
		ServerID:    serverID,
		URI:         resourceURI,
		DurationMs:  time.Since(start).Milliseconds(),
		Contents:    contents,
		RequestedAt: start.Format(time.RFC3339),
	}, nil
}

func (a *App) ImportMCPServers(raw string) (*MCPServerImportResult, error) {
	if err := a.ensureDataDir(); err != nil {
		return nil, err
	}
	store, err := readMCPServerStore(filepath.Join(a.dataDir, "mcp_servers.json"))
	if err != nil {
		return nil, err
	}
	imported, warnings, err := parseImportedMCPServers(raw)
	if err != nil {
		return nil, err
	}

	existing := map[string]bool{}
	for _, server := range store.Servers {
		existing[server.Name+"|"+server.Transport+"|"+server.Endpoint+"|"+server.Command] = true
	}
	added := []MCPServerConfig{}
	for _, server := range imported {
		key := server.Name + "|" + server.Transport + "|" + server.Endpoint + "|" + server.Command
		if existing[key] {
			warnings = append(warnings, "Skipped duplicate server: "+server.Name)
			continue
		}
		added = append(added, server)
		store.Servers = append(store.Servers, server)
		existing[key] = true
	}

	store.Version = currentSchemaVersion
	store.UpdatedAt = time.Now().Format(time.RFC3339)
	if err := writeMCPServerStoreToDir(a.dataDir, store); err != nil {
		return nil, err
	}

	return &MCPServerImportResult{Added: added, Warnings: warnings, Servers: store}, nil
}

func (a *App) ensureMCPSession(server MCPServerConfig) (*managedMCPSession, error) {
	a.mcpMu.Lock()
	if managed, ok := a.sessions[server.ID]; ok && managed.session != nil {
		a.mcpMu.Unlock()
		return managed, nil
	}
	a.mcpMu.Unlock()

	client := mcp.NewClient(&mcp.Implementation{Name: "post-mcp", Version: "0.1.0"}, nil)
	httpClient := &http.Client{Timeout: normalizedTimeout(server.TimeoutMs), Transport: newHeaderRoundTripper(server.Headers)}

	var transport mcp.Transport
	switch server.Transport {
	case TransportStdio:
		cmd := exec.Command(server.Command, server.Args...)
		if server.Cwd != "" {
			cmd.Dir = server.Cwd
		}
		cmd.Env = mergeEnv(server.Env)
		configureStdioCommand(cmd)
		transport = &mcp.CommandTransport{Command: cmd, TerminateDuration: 2 * time.Second}
	case TransportSSE:
		transport = &mcp.SSEClientTransport{Endpoint: server.Endpoint, HTTPClient: httpClient}
	case TransportStreamableHTTP:
		transport = &mcp.StreamableClientTransport{Endpoint: server.Endpoint, HTTPClient: httpClient, MaxRetries: 2}
	default:
		return nil, fmt.Errorf("unsupported MCP transport: %s", server.Transport)
	}

	ctx, cancel := context.WithTimeout(context.Background(), normalizedTimeout(server.TimeoutMs))
	defer cancel()
	session, err := client.Connect(ctx, transport, nil)
	if err != nil {
		return nil, fmt.Errorf("connect MCP server %s: %w", server.Name, err)
	}

	managed := &managedMCPSession{server: server, client: client, session: session, httpClient: httpClient}
	a.mcpMu.Lock()
	defer a.mcpMu.Unlock()
	if existing, ok := a.sessions[server.ID]; ok && existing.session != nil {
		if managed.session != nil {
			_ = managed.session.Close()
		}
		return existing, nil
	}
	a.sessions[server.ID] = managed
	return managed, nil
}

func (a *App) getMCPServerByID(serverID string) (MCPServerConfig, error) {
	if err := a.ensureDataDir(); err != nil {
		return MCPServerConfig{}, err
	}
	store, err := readMCPServerStore(filepath.Join(a.dataDir, "mcp_servers.json"))
	if err != nil {
		return MCPServerConfig{}, err
	}
	for _, server := range store.Servers {
		if server.ID == serverID {
			return server, nil
		}
	}
	return MCPServerConfig{}, fmt.Errorf("MCP server not found: %s", serverID)
}

func (a *App) updateServerCaches(serverID string, tools []MCPTool, prompts []MCPPrompt, resources []MCPResource) error {
	store, err := readMCPServerStore(filepath.Join(a.dataDir, "mcp_servers.json"))
	if err != nil {
		return err
	}
	for index := range store.Servers {
		if store.Servers[index].ID != serverID {
			continue
		}
		store.Servers[index].ToolCache = tools
		store.Servers[index].PromptCache = prompts
		store.Servers[index].ResourceCache = resources
		break
	}
	store.UpdatedAt = time.Now().Format(time.RFC3339)
	return writeMCPServerStoreToDir(a.dataDir, store)
}

func listAllTools(ctx context.Context, session *mcp.ClientSession) ([]MCPTool, error) {
	tools := []MCPTool{}
	cursor := ""
	for {
		result, err := session.ListTools(ctx, &mcp.ListToolsParams{Cursor: cursor})
		if err != nil {
			return nil, err
		}
		for _, tool := range result.Tools {
			tools = append(tools, MCPTool{
				Name:         tool.Name,
				Title:        tool.Title,
				Description:  tool.Description,
				InputSchema:  tool.InputSchema,
				OutputSchema: tool.OutputSchema,
			})
		}
		if result.NextCursor == "" {
			break
		}
		cursor = result.NextCursor
	}
	return tools, nil
}

func listAllPrompts(ctx context.Context, session *mcp.ClientSession) ([]MCPPrompt, error) {
	prompts := []MCPPrompt{}
	cursor := ""
	for {
		result, err := session.ListPrompts(ctx, &mcp.ListPromptsParams{Cursor: cursor})
		if err != nil {
			return nil, err
		}
		for _, prompt := range result.Prompts {
			args := make([]MCPPromptArgument, 0, len(prompt.Arguments))
			for _, arg := range prompt.Arguments {
				args = append(args, MCPPromptArgument{Name: arg.Name, Title: arg.Title, Description: arg.Description, Required: arg.Required})
			}
			prompts = append(prompts, MCPPrompt{Name: prompt.Name, Title: prompt.Title, Description: prompt.Description, Arguments: args})
		}
		if result.NextCursor == "" {
			break
		}
		cursor = result.NextCursor
	}
	return prompts, nil
}

func listAllResources(ctx context.Context, session *mcp.ClientSession) ([]MCPResource, error) {
	resources := []MCPResource{}
	resourceResult, err := session.ListResources(ctx, &mcp.ListResourcesParams{})
	if err == nil {
		for _, resource := range resourceResult.Resources {
			resources = append(resources, MCPResource{
				Name:        resource.Name,
				Title:       resource.Title,
				Description: resource.Description,
				URI:         resource.URI,
				MIMEType:    resource.MIMEType,
				Size:        resource.Size,
				Kind:        "resource",
			})
		}
	}
	templateResult, templateErr := session.ListResourceTemplates(ctx, &mcp.ListResourceTemplatesParams{})
	if templateErr == nil {
		for _, template := range templateResult.ResourceTemplates {
			resources = append(resources, MCPResource{
				Name:        template.Name,
				Title:       template.Title,
				Description: template.Description,
				URITemplate: template.URITemplate,
				MIMEType:    template.MIMEType,
				Kind:        "template",
			})
		}
	}
	if err != nil && templateErr != nil {
		return nil, err
	}
	return resources, nil
}

func flattenMCPContent(content []mcp.Content) []MCPContentItem {
	items := make([]MCPContentItem, 0, len(content))
	for _, item := range content {
		switch value := item.(type) {
		case *mcp.TextContent:
			items = append(items, MCPContentItem{Type: "text", Text: value.Text})
		default:
			items = append(items, MCPContentItem{Type: "json", JSON: summarizeJSON(value)})
		}
	}
	return items
}

func flattenPromptMessages(result *mcp.GetPromptResult) []string {
	messages := make([]string, 0, len(result.Messages))
	for _, message := range result.Messages {
		payload := summarizeJSON(message)
		if payload != "" {
			messages = append(messages, payload)
		}
	}
	return messages
}

func boolStatus(ok bool) string {
	if ok {
		return "ok"
	}
	return "error"
}

func mergeEnv(pairs []KeyValuePair) []string {
	env := os.Environ()
	merged := append([]string{}, env...)
	for _, pair := range enabledPairs(pairs) {
		merged = append(merged, pair.Key+"="+pair.Value)
	}
	return merged
}

type headerRoundTripper struct {
	headers []KeyValuePair
	base    http.RoundTripper
}

func newHeaderRoundTripper(headers []KeyValuePair) http.RoundTripper {
	base := http.DefaultTransport
	return &headerRoundTripper{headers: headers, base: base}
}

func (r *headerRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	cloned := req.Clone(req.Context())
	for _, header := range enabledPairs(r.headers) {
		cloned.Header.Set(header.Key, header.Value)
	}
	return r.base.RoundTrip(cloned)
}

func parseImportedMCPServers(raw string) ([]MCPServerConfig, []string, error) {
	var payload any
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return nil, nil, fmt.Errorf("parse MCP server JSON: %w", err)
	}
	warnings := []string{}
	servers := []MCPServerConfig{}

	collect := func(fallbackName string, value any) {
		server, warning := parseImportedMCPServer(fallbackName, value)
		if warning != "" {
			warnings = append(warnings, warning)
		}
		if server.ID != "" {
			servers = append(servers, server)
		}
	}

	switch typed := payload.(type) {
	case []any:
		for _, value := range typed {
			collect("", value)
		}
	case map[string]any:
		if rawServers, ok := typed["mcpServers"].(map[string]any); ok {
			for name, value := range rawServers {
				collect(name, value)
			}
			break
		}

		if rawArray, ok := typed["servers"].([]any); ok {
			for _, value := range rawArray {
				collect("", value)
			}
			break
		}

		collect("", typed)
	default:
		return nil, nil, fmt.Errorf("parse MCP server JSON: unsupported top-level JSON type")
	}

	if len(servers) == 0 {
		return nil, warnings, fmt.Errorf("no MCP server definitions found")
	}
	return servers, warnings, nil
}

func parseImportedMCPServer(fallbackName string, raw any) (MCPServerConfig, string) {
	obj, ok := raw.(map[string]any)
	if !ok {
		return MCPServerConfig{}, "Skipped invalid MCP server entry"
	}
	transport := firstStringValue(obj, "transport", "type")
	endpoint := firstStringValue(obj, "endpoint", "url", "baseUrl", "baseURL")
	if transport == "" {
		if endpoint != "" {
			transport = TransportStreamableHTTP
		} else {
			transport = TransportStdio
		}
	}
	if strings.EqualFold(transport, "streamedhttp") || strings.EqualFold(transport, "streamablehttp") {
		transport = TransportStreamableHTTP
	}
	if strings.EqualFold(transport, "http") {
		transport = TransportStreamableHTTP
	}
	if strings.EqualFold(transport, "stdio") {
		transport = TransportStdio
	}
	if strings.EqualFold(transport, "sse") {
		transport = TransportSSE
	}

	name := stringValue(obj, "name")
	if name == "" {
		name = fallbackName
	}
	if name == "" {
		name = "Imported MCP Server"
	}
	server := MCPServerConfig{
		ID:        uuid.NewString(),
		Name:      name,
		Transport: transport,
		Command:   stringValue(obj, "command"),
		Args:      stringArray(obj["args"]),
		Cwd:       stringValue(obj, "cwd"),
		Endpoint:  endpoint,
		Headers:   kvPairsFromMap(obj["headers"]),
		Env:       kvPairsFromMap(obj["env"]),
		Disabled:  boolValue(obj, "disabled") || boolInverseValue(obj, "isActive"),
		TimeoutMs: 30000,
	}
	if server.Transport == TransportStdio && server.Command == "" {
		return MCPServerConfig{}, "Skipped stdio MCP server without command: " + name
	}
	if (server.Transport == TransportSSE || server.Transport == TransportStreamableHTTP) && server.Endpoint == "" {
		return MCPServerConfig{}, "Skipped remote MCP server without endpoint: " + name
	}
	return server, ""
}

func firstStringValue(obj map[string]any, keys ...string) string {
	for _, key := range keys {
		if value := stringValue(obj, key); value != "" {
			return value
		}
	}
	return ""
}

func boolValue(obj map[string]any, key string) bool {
	value, ok := obj[key]
	if !ok || value == nil {
		return false
	}
	b, _ := value.(bool)
	return b
}

func boolInverseValue(obj map[string]any, key string) bool {
	value, ok := obj[key]
	if !ok || value == nil {
		return false
	}
	b, _ := value.(bool)
	return !b
}

func stringValue(obj map[string]any, key string) string {
	value, ok := obj[key]
	if !ok || value == nil {
		return ""
	}
	s, _ := value.(string)
	return s
}

func stringArray(raw any) []string {
	values, ok := raw.([]any)
	if !ok {
		return []string{}
	}
	result := make([]string, 0, len(values))
	for _, value := range values {
		if s, ok := value.(string); ok {
			result = append(result, s)
		}
	}
	return result
}

func kvPairsFromMap(raw any) []KeyValuePair {
	obj, ok := raw.(map[string]any)
	if !ok {
		return []KeyValuePair{}
	}
	result := make([]KeyValuePair, 0, len(obj))
	for key, value := range obj {
		result = append(result, KeyValuePair{ID: uuid.NewString(), Key: key, Value: fmt.Sprint(value), Enabled: true})
	}
	return result
}

func (a *App) appendHistory(mode string, item HistoryItem) {
	if a.dataDir == "" {
		return
	}
	settings, err := a.loadAppSettings()
	limit := 500
	if err == nil && settings.HistoryLimit > 0 {
		limit = settings.HistoryLimit
	}
	_ = appendHistoryItemToDir(a.dataDir, mode, item, limit)
}

func (a *App) closeRemovedMCPSessions(servers []MCPServerConfig) {
	allowed := map[string]bool{}
	for _, server := range servers {
		allowed[server.ID] = true
	}
	a.mcpMu.Lock()
	defer a.mcpMu.Unlock()
	for id, session := range a.sessions {
		if allowed[id] {
			continue
		}
		if session.session != nil {
			_ = session.session.Close()
		}
		delete(a.sessions, id)
	}
}

func (a *App) closeAllMCPSessions() {
	a.mcpMu.Lock()
	defer a.mcpMu.Unlock()
	for id, session := range a.sessions {
		if session.session != nil {
			_ = session.session.Close()
		}
		delete(a.sessions, id)
	}
}
