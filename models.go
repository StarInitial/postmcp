package main

import "github.com/google/uuid"

const currentSchemaVersion = 1

const (
	ModeHTTP = "http"
	ModeMCP  = "mcp"
)

const (
	TransportStdio          = "stdio"
	TransportSSE            = "sse"
	TransportStreamableHTTP = "streamable-http"
)

type BootstrapData struct {
	Workspace   WorkspaceStore       `json:"workspace"`
	Collections CollectionStore      `json:"collections"`
	MCPServers  MCPServerStore       `json:"mcpServers"`
	History     CombinedHistoryStore `json:"history"`
	Settings    SettingsStore        `json:"settings"`
	LoadedAt    string               `json:"loadedAt"`
}

type CombinedHistoryStore struct {
	HTTP HistoryStore `json:"http"`
	MCP  HistoryStore `json:"mcp"`
}

type WorkspaceStore struct {
	Version      int            `json:"version"`
	ActiveTabID  string         `json:"activeTabId"`
	Tabs         []WorkspaceTab `json:"tabs"`
	UpdatedAt    string         `json:"updatedAt"`
	SidebarWidth int            `json:"sidebarWidth"`
	SnippetWidth int            `json:"snippetWidth"`
}

type WorkspaceTab struct {
	ID              string         `json:"id"`
	Title           string         `json:"title"`
	Mode            string         `json:"mode"`
	LinkedNodeID    string         `json:"linkedNodeId,omitempty"`
	LinkedHistoryID string         `json:"linkedHistoryId,omitempty"`
	HTTP            HttpRequest    `json:"http"`
	MCP             MCPRequest     `json:"mcp"`
	LastHTTP        *HttpResponse  `json:"lastHttp,omitempty"`
	LastMCP         *MCPCallResult `json:"lastMcp,omitempty"`
	Dirty           bool           `json:"dirty"`
	LastUpdatedAt   string         `json:"lastUpdatedAt"`
}

type CollectionStore struct {
	Version   int              `json:"version"`
	Items     []CollectionNode `json:"items"`
	UpdatedAt string           `json:"updatedAt"`
}

type CollectionNode struct {
	ID       string           `json:"id"`
	Type     string           `json:"type"`
	Name     string           `json:"name"`
	Children []CollectionNode `json:"children,omitempty"`
	Request  *SavedRequest    `json:"request,omitempty"`
}

type SavedRequest struct {
	Mode string      `json:"mode"`
	HTTP HttpRequest `json:"http"`
	MCP  MCPRequest  `json:"mcp"`
}

type MCPServerStore struct {
	Version   int               `json:"version"`
	Servers   []MCPServerConfig `json:"servers"`
	UpdatedAt string            `json:"updatedAt"`
}

type MCPServerConfig struct {
	ID            string         `json:"id"`
	Name          string         `json:"name"`
	Transport     string         `json:"transport"`
	Command       string         `json:"command,omitempty"`
	Args          []string       `json:"args,omitempty"`
	Cwd           string         `json:"cwd,omitempty"`
	Endpoint      string         `json:"endpoint,omitempty"`
	Headers       []KeyValuePair `json:"headers,omitempty"`
	Env           []KeyValuePair `json:"env,omitempty"`
	Disabled      bool           `json:"disabled"`
	TimeoutMs     int            `json:"timeoutMs"`
	ToolCache     []MCPTool      `json:"toolCache,omitempty"`
	PromptCache   []MCPPrompt    `json:"promptCache,omitempty"`
	ResourceCache []MCPResource  `json:"resourceCache,omitempty"`
}

type SettingsStore struct {
	Version          int    `json:"version"`
	UpdatedAt        string `json:"updatedAt"`
	DefaultMode      string `json:"defaultMode"`
	HTTPCodeLanguage string `json:"httpCodeLanguage"`
	MCPCodeLanguage  string `json:"mcpCodeLanguage"`
	HistoryLimit     int    `json:"historyLimit"`
	SnippetCollapsed bool   `json:"snippetCollapsed"`
}

type HistoryStore struct {
	Version   int           `json:"version"`
	Items     []HistoryItem `json:"items"`
	UpdatedAt string        `json:"updatedAt"`
}

type HistoryItem struct {
	ID          string `json:"id"`
	Mode        string `json:"mode"`
	Title       string `json:"title"`
	Subtitle    string `json:"subtitle"`
	Status      string `json:"status"`
	DurationMs  int64  `json:"durationMs"`
	Timestamp   string `json:"timestamp"`
	SummaryJSON string `json:"summaryJson,omitempty"`
}

type KeyValuePair struct {
	ID      string `json:"id"`
	Key     string `json:"key"`
	Value   string `json:"value"`
	Enabled bool   `json:"enabled"`
}

type HttpRequest struct {
	Name         string            `json:"name"`
	Method       string            `json:"method"`
	URL          string            `json:"url"`
	Query        []KeyValuePair    `json:"query"`
	Headers      []KeyValuePair    `json:"headers"`
	CookieScopes []HttpCookieScope `json:"cookieScopes"`
	Auth         HttpAuth          `json:"auth"`
	Body         HttpBody          `json:"body"`
	TimeoutMs    int               `json:"timeoutMs"`
}

type HttpCookieScope struct {
	ID      string           `json:"id"`
	Host    string           `json:"host"`
	Cookies []HttpCookieItem `json:"cookies"`
}

type HttpCookieItem struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Value   string `json:"value"`
	Enabled bool   `json:"enabled"`
}

type HttpAuth struct {
	Type     string `json:"type"`
	Username string `json:"username"`
	Password string `json:"password"`
	Token    string `json:"token"`
}

type HttpBody struct {
	Mode         string             `json:"mode"`
	ContentType  string             `json:"contentType"`
	Raw          string             `json:"raw"`
	RawType      string             `json:"rawType,omitempty"`
	FormData     []HttpFormDataItem `json:"formData"`
	URLEncoded   []KeyValuePair     `json:"urlEncoded"`
	BinaryFile   string             `json:"binaryFile,omitempty"`
	BinaryName   string             `json:"binaryName,omitempty"`
	BinaryBase64 string             `json:"binaryBase64,omitempty"`
	PreviewLabel string             `json:"previewLabel,omitempty"`
}

type HttpFormDataItem struct {
	ID         string `json:"id"`
	Key        string `json:"key"`
	Value      string `json:"value"`
	Enabled    bool   `json:"enabled"`
	ValueType  string `json:"valueType,omitempty"`
	FileName   string `json:"fileName,omitempty"`
	FilePath   string `json:"filePath,omitempty"`
	FileBase64 string `json:"fileBase64,omitempty"`
}

type HttpResponse struct {
	StatusCode    int            `json:"statusCode"`
	StatusText    string         `json:"statusText"`
	DurationMs    int64          `json:"durationMs"`
	SizeBytes     int            `json:"sizeBytes"`
	Headers       []KeyValuePair `json:"headers"`
	Body          string         `json:"body"`
	ContentType   string         `json:"contentType"`
	Error         string         `json:"error,omitempty"`
	RequestedAt   string         `json:"requestedAt"`
	ResolvedURL   string         `json:"resolvedUrl,omitempty"`
	SnippetTarget string         `json:"snippetTarget,omitempty"`
}

type MCPRequest struct {
	ServerID      string `json:"serverId"`
	ToolName      string `json:"toolName"`
	ArgumentsJSON string `json:"argumentsJson"`
	PromptName    string `json:"promptName,omitempty"`
	PromptArgs    string `json:"promptArgs,omitempty"`
	ResourceURI   string `json:"resourceUri,omitempty"`
}

type MCPDiscoverResult struct {
	ServerID      string        `json:"serverId"`
	Tools         []MCPTool     `json:"tools"`
	Prompts       []MCPPrompt   `json:"prompts"`
	Resources     []MCPResource `json:"resources"`
	Connected     bool          `json:"connected"`
	ServerName    string        `json:"serverName,omitempty"`
	ServerVersion string        `json:"serverVersion,omitempty"`
	Error         string        `json:"error,omitempty"`
}

type MCPTool struct {
	Name         string `json:"name"`
	Title        string `json:"title"`
	Description  string `json:"description"`
	InputSchema  any    `json:"inputSchema"`
	OutputSchema any    `json:"outputSchema,omitempty"`
}

type MCPPrompt struct {
	Name        string              `json:"name"`
	Title       string              `json:"title"`
	Description string              `json:"description"`
	Arguments   []MCPPromptArgument `json:"arguments"`
}

type MCPPromptArgument struct {
	Name        string `json:"name"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Required    bool   `json:"required"`
}

type MCPResource struct {
	Name        string `json:"name"`
	Title       string `json:"title"`
	Description string `json:"description"`
	URI         string `json:"uri,omitempty"`
	URITemplate string `json:"uriTemplate,omitempty"`
	MIMEType    string `json:"mimeType,omitempty"`
	Size        int64  `json:"size,omitempty"`
	Kind        string `json:"kind"`
}

type MCPCallRequest struct {
	ServerID      string `json:"serverId"`
	ToolName      string `json:"toolName"`
	ArgumentsJSON string `json:"argumentsJson"`
}

type MCPCallResult struct {
	ServerID          string           `json:"serverId"`
	ToolName          string           `json:"toolName"`
	DurationMs        int64            `json:"durationMs"`
	Content           []MCPContentItem `json:"content"`
	StructuredContent string           `json:"structuredContent"`
	IsError           bool             `json:"isError"`
	Error             string           `json:"error,omitempty"`
	RequestedAt       string           `json:"requestedAt"`
}

type MCPContentItem struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
	JSON string `json:"json,omitempty"`
}

type MCPPromptRequest struct {
	ServerID    string            `json:"serverId"`
	PromptName  string            `json:"promptName"`
	Arguments   map[string]string `json:"arguments"`
	ArgumentsJS string            `json:"argumentsJson,omitempty"`
}

type MCPPromptResultView struct {
	ServerID      string   `json:"serverId"`
	PromptName    string   `json:"promptName"`
	DurationMs    int64    `json:"durationMs"`
	Description   string   `json:"description"`
	Messages      []string `json:"messages"`
	RequestedAt   string   `json:"requestedAt"`
	Error         string   `json:"error,omitempty"`
	ArgumentsJSON string   `json:"argumentsJson,omitempty"`
}

type MCPReadResourceResult struct {
	ServerID    string   `json:"serverId"`
	URI         string   `json:"uri"`
	DurationMs  int64    `json:"durationMs"`
	Contents    []string `json:"contents"`
	RequestedAt string   `json:"requestedAt"`
	Error       string   `json:"error,omitempty"`
}

type MCPServerImportResult struct {
	Added    []MCPServerConfig `json:"added"`
	Warnings []string          `json:"warnings"`
	Servers  MCPServerStore    `json:"servers"`
}

type MCPServerTestResult struct {
	Success       bool   `json:"success"`
	ServerID      string `json:"serverId"`
	DurationMs    int64  `json:"durationMs"`
	ServerName    string `json:"serverName,omitempty"`
	ServerVersion string `json:"serverVersion,omitempty"`
	Error         string `json:"error,omitempty"`
}

func newKeyValue(key string, value string) KeyValuePair {
	return KeyValuePair{ID: uuid.NewString(), Key: key, Value: value, Enabled: true}
}

func newFormDataItem(key string, value string) HttpFormDataItem {
	return HttpFormDataItem{ID: uuid.NewString(), Key: key, Value: value, Enabled: true, ValueType: "text"}
}

func defaultWorkspaceStore() WorkspaceStore {
	tab := defaultWorkspaceTab()
	return WorkspaceStore{
		Version:      currentSchemaVersion,
		ActiveTabID:  tab.ID,
		Tabs:         []WorkspaceTab{tab},
		SidebarWidth: 280,
		SnippetWidth: 320,
	}
}

func defaultWorkspaceTab() WorkspaceTab {
	return WorkspaceTab{
		ID:    uuid.NewString(),
		Title: "New HTTP Request",
		Mode:  ModeHTTP,
		HTTP: HttpRequest{
			Method:       "GET",
			TimeoutMs:    30000,
			Query:        []KeyValuePair{newKeyValue("", "")},
			Headers:      []KeyValuePair{newKeyValue("", "")},
			CookieScopes: []HttpCookieScope{},
			Auth:         HttpAuth{Type: "none"},
			Body: HttpBody{
				Mode:        "none",
				ContentType: "application/json",
				Raw:         "",
				RawType:     "json",
				FormData:    []HttpFormDataItem{newFormDataItem("", "")},
				URLEncoded:  []KeyValuePair{newKeyValue("", "")},
			},
		},
		MCP:   MCPRequest{ArgumentsJSON: "{}", PromptArgs: "{}"},
		Dirty: true,
	}
}

func defaultCollectionStore() CollectionStore {
	return CollectionStore{Version: currentSchemaVersion, Items: []CollectionNode{}}
}

func defaultMCPServerStore() MCPServerStore {
	return MCPServerStore{Version: currentSchemaVersion, Servers: []MCPServerConfig{}}
}

func defaultHistoryStore() HistoryStore {
	return HistoryStore{Version: currentSchemaVersion, Items: []HistoryItem{}}
}

func defaultSettingsStore() SettingsStore {
	return SettingsStore{
		Version:          currentSchemaVersion,
		DefaultMode:      ModeHTTP,
		HTTPCodeLanguage: "curl",
		MCPCodeLanguage:  "json",
		HistoryLimit:     500,
		SnippetCollapsed: true,
	}
}
