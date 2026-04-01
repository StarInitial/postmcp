const uuid = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `id-${Math.random().toString(16).slice(2)}-${Date.now()}`
}

export const modes = {
  http: 'http',
  mcp: 'mcp',
}

export const transports = {
  stdio: 'stdio',
  sse: 'sse',
  streamableHttp: 'streamable-http',
}

export function newPair(key = '', value = '') {
  return {
    id: uuid(),
    key,
    value,
    enabled: true,
  }
}

export function newFormDataPair(key = '', value = '') {
  return {
    id: uuid(),
    key,
    value,
    enabled: true,
    valueType: 'text',
    fileName: '',
    filePath: '',
    fileBase64: '',
  }
}

export function newCookieItem(name = '', value = '') {
  return {
    id: uuid(),
    name,
    value,
    enabled: true,
  }
}

export function newCookieScope(host = '') {
  return {
    id: uuid(),
    host,
    cookies: [],
  }
}

export function createDefaultHttpRequest() {
  return {
    name: '',
    method: 'GET',
    url: '',
    query: [],
    headers: [],
    cookieScopes: [],
    auth: {
      type: 'none',
      username: '',
      password: '',
      token: '',
    },
    body: {
      mode: 'none',
      contentType: 'application/json',
      raw: '',
      rawType: 'json',
      formData: [],
      urlEncoded: [],
      binaryFile: '',
      binaryName: '',
      binaryBase64: '',
    },
    timeoutMs: 30000,
  }
}

export function createDefaultMcpRequest(serverId = '') {
  return {
    serverId,
    toolName: '',
    argumentsJson: '{}',
    promptName: '',
    promptArgs: '{}',
    resourceUri: '',
  }
}

export function createWorkspaceTab(mode = modes.http, mcpServers = []) {
  const defaultServerId = mode === modes.mcp ? mcpServers[0]?.id ?? '' : ''
  return {
    id: uuid(),
    title: mode === modes.http ? '新建 HTTP 请求' : '新建 MCP 调用',
    mode,
    linkedNodeId: '',
    linkedHistoryId: '',
    http: createDefaultHttpRequest(),
    mcp: createDefaultMcpRequest(defaultServerId),
    dirty: true,
    lastUpdatedAt: new Date().toISOString(),
  }
}

export function createServerDraft() {
  return {
    id: uuid(),
    name: '',
    transport: transports.stdio,
    command: '',
    args: [],
    cwd: '',
    endpoint: '',
    headers: [],
    env: [],
    disabled: false,
    timeoutMs: 30000,
    toolCache: [],
    promptCache: [],
    resourceCache: [],
  }
}

export function createCollectionFolder(name = '新建文件夹') {
  return {
    id: uuid(),
    type: 'folder',
    name,
    children: [],
  }
}

export function createCollectionRequest(name, mode, request) {
  return {
    id: uuid(),
    type: 'request',
    name,
    request: {
      mode,
      http: request.http ?? createDefaultHttpRequest(),
      mcp: request.mcp ?? createDefaultMcpRequest(),
    },
  }
}

export function createDefaultBootstrap() {
  const tab = createWorkspaceTab()
  return {
    workspace: {
      version: 1,
      activeTabId: tab.id,
      tabs: [tab],
      updatedAt: '',
      sidebarWidth: 280,
      snippetWidth: 340,
    },
    collections: {
      version: 1,
      items: [],
      updatedAt: '',
    },
    mcpServers: {
      version: 1,
      servers: [],
      updatedAt: '',
    },
    history: {
      http: {
        version: 1,
        items: [],
        updatedAt: '',
      },
      mcp: {
        version: 1,
        items: [],
        updatedAt: '',
      },
    },
    settings: {
      version: 1,
      updatedAt: '',
      defaultMode: modes.http,
      httpCodeLanguage: 'curl',
      mcpCodeLanguage: 'json',
      historyLimit: 500,
      snippetCollapsed: false,
    },
    loadedAt: new Date().toISOString(),
  }
}

export function ensureTrailingBlankPair(items = []) {
  const rows = items.length ? [...items] : [newPair()]
  const last = rows[rows.length - 1]
  if (!last || last.key || last.value) {
    rows.push(newPair())
  }
  return rows
}

export function ensureTrailingBlankFormData(items = []) {
  const rows = items.length
    ? items.map((item) => ({
        ...newFormDataPair(),
        ...item,
        valueType: item?.valueType === 'file' ? 'file' : 'text',
      }))
    : [newFormDataPair()]
  const last = rows[rows.length - 1]
  const hasValue = Boolean(last?.key || last?.value || last?.fileName || last?.filePath)
  if (!last || hasValue) {
    rows.push(newFormDataPair())
  }
  return rows
}

export function prettyJson(value) {
  try {
    if (typeof value === 'string') {
      return JSON.stringify(JSON.parse(value), null, 2)
    }
    return JSON.stringify(value ?? {}, null, 2)
  } catch {
    return typeof value === 'string' ? value : '{}'
  }
}

export function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}
