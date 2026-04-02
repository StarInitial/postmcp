export namespace main {
	
	export class SettingsStore {
	    version: number;
	    updatedAt: string;
	    defaultMode: string;
	    httpCodeLanguage: string;
	    mcpCodeLanguage: string;
	    historyLimit: number;
	    snippetCollapsed: boolean;
	    httpVersion: string;
	    requestTimeout: number;
	    maxResponseSize: number;
	    noCacheHeader: boolean;
	    retainHeadersOnLinkClick: boolean;
	    followRedirects: boolean;
	    showIconsWithTabs: boolean;
	    sslVerification: boolean;
	    languageDetection: string;
	    alwaysOpenInNewTab: boolean;
	    askOnCloseUnsaved: boolean;
	    editorFontFamily: string;
	    editorFontSize: number;
	    editorIndentCount: number;
	    editorIndentType: string;
	    themeColor: string;
	    themeMode: string;
	    themeColors: string[];
	
	    static createFrom(source: any = {}) {
	        return new SettingsStore(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.updatedAt = source["updatedAt"];
	        this.defaultMode = source["defaultMode"];
	        this.httpCodeLanguage = source["httpCodeLanguage"];
	        this.mcpCodeLanguage = source["mcpCodeLanguage"];
	        this.historyLimit = source["historyLimit"];
	        this.snippetCollapsed = source["snippetCollapsed"];
	        this.httpVersion = source["httpVersion"];
	        this.requestTimeout = source["requestTimeout"];
	        this.maxResponseSize = source["maxResponseSize"];
	        this.noCacheHeader = source["noCacheHeader"];
	        this.retainHeadersOnLinkClick = source["retainHeadersOnLinkClick"];
	        this.followRedirects = source["followRedirects"];
	        this.showIconsWithTabs = source["showIconsWithTabs"];
	        this.sslVerification = source["sslVerification"];
	        this.languageDetection = source["languageDetection"];
	        this.alwaysOpenInNewTab = source["alwaysOpenInNewTab"];
	        this.askOnCloseUnsaved = source["askOnCloseUnsaved"];
	        this.editorFontFamily = source["editorFontFamily"];
	        this.editorFontSize = source["editorFontSize"];
	        this.editorIndentCount = source["editorIndentCount"];
	        this.editorIndentType = source["editorIndentType"];
	        this.themeColor = source["themeColor"];
	        this.themeMode = source["themeMode"];
	        this.themeColors = source["themeColors"];
	    }
	}
	export class HistoryItem {
	    id: string;
	    mode: string;
	    title: string;
	    subtitle: string;
	    status: string;
	    durationMs: number;
	    timestamp: string;
	    summaryJson?: string;
	
	    static createFrom(source: any = {}) {
	        return new HistoryItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.mode = source["mode"];
	        this.title = source["title"];
	        this.subtitle = source["subtitle"];
	        this.status = source["status"];
	        this.durationMs = source["durationMs"];
	        this.timestamp = source["timestamp"];
	        this.summaryJson = source["summaryJson"];
	    }
	}
	export class HistoryStore {
	    version: number;
	    items: HistoryItem[];
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new HistoryStore(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.items = this.convertValues(source["items"], HistoryItem);
	        this.updatedAt = source["updatedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CombinedHistoryStore {
	    http: HistoryStore;
	    mcp: HistoryStore;
	
	    static createFrom(source: any = {}) {
	        return new CombinedHistoryStore(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.http = this.convertValues(source["http"], HistoryStore);
	        this.mcp = this.convertValues(source["mcp"], HistoryStore);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class MCPResource {
	    name: string;
	    title: string;
	    description: string;
	    uri?: string;
	    uriTemplate?: string;
	    mimeType?: string;
	    size?: number;
	    kind: string;
	
	    static createFrom(source: any = {}) {
	        return new MCPResource(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.title = source["title"];
	        this.description = source["description"];
	        this.uri = source["uri"];
	        this.uriTemplate = source["uriTemplate"];
	        this.mimeType = source["mimeType"];
	        this.size = source["size"];
	        this.kind = source["kind"];
	    }
	}
	export class MCPPromptArgument {
	    name: string;
	    title: string;
	    description: string;
	    required: boolean;
	
	    static createFrom(source: any = {}) {
	        return new MCPPromptArgument(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.title = source["title"];
	        this.description = source["description"];
	        this.required = source["required"];
	    }
	}
	export class MCPPrompt {
	    name: string;
	    title: string;
	    description: string;
	    arguments: MCPPromptArgument[];
	
	    static createFrom(source: any = {}) {
	        return new MCPPrompt(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.title = source["title"];
	        this.description = source["description"];
	        this.arguments = this.convertValues(source["arguments"], MCPPromptArgument);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class MCPTool {
	    name: string;
	    title: string;
	    description: string;
	    inputSchema: any;
	    outputSchema?: any;
	
	    static createFrom(source: any = {}) {
	        return new MCPTool(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.title = source["title"];
	        this.description = source["description"];
	        this.inputSchema = source["inputSchema"];
	        this.outputSchema = source["outputSchema"];
	    }
	}
	export class MCPServerConfig {
	    id: string;
	    name: string;
	    transport: string;
	    command?: string;
	    args?: string[];
	    cwd?: string;
	    endpoint?: string;
	    headers?: KeyValuePair[];
	    env?: KeyValuePair[];
	    disabled: boolean;
	    timeoutMs: number;
	    toolCache?: MCPTool[];
	    promptCache?: MCPPrompt[];
	    resourceCache?: MCPResource[];
	
	    static createFrom(source: any = {}) {
	        return new MCPServerConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.transport = source["transport"];
	        this.command = source["command"];
	        this.args = source["args"];
	        this.cwd = source["cwd"];
	        this.endpoint = source["endpoint"];
	        this.headers = this.convertValues(source["headers"], KeyValuePair);
	        this.env = this.convertValues(source["env"], KeyValuePair);
	        this.disabled = source["disabled"];
	        this.timeoutMs = source["timeoutMs"];
	        this.toolCache = this.convertValues(source["toolCache"], MCPTool);
	        this.promptCache = this.convertValues(source["promptCache"], MCPPrompt);
	        this.resourceCache = this.convertValues(source["resourceCache"], MCPResource);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class MCPServerStore {
	    version: number;
	    servers: MCPServerConfig[];
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new MCPServerStore(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.servers = this.convertValues(source["servers"], MCPServerConfig);
	        this.updatedAt = source["updatedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SavedRequest {
	    mode: string;
	    http: HttpRequest;
	    mcp: MCPRequest;
	
	    static createFrom(source: any = {}) {
	        return new SavedRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.mode = source["mode"];
	        this.http = this.convertValues(source["http"], HttpRequest);
	        this.mcp = this.convertValues(source["mcp"], MCPRequest);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CollectionNode {
	    id: string;
	    type: string;
	    name: string;
	    children?: CollectionNode[];
	    request?: SavedRequest;
	
	    static createFrom(source: any = {}) {
	        return new CollectionNode(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.type = source["type"];
	        this.name = source["name"];
	        this.children = this.convertValues(source["children"], CollectionNode);
	        this.request = this.convertValues(source["request"], SavedRequest);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CollectionStore {
	    version: number;
	    items: CollectionNode[];
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new CollectionStore(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.items = this.convertValues(source["items"], CollectionNode);
	        this.updatedAt = source["updatedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class MCPContentItem {
	    type: string;
	    text?: string;
	    json?: string;
	
	    static createFrom(source: any = {}) {
	        return new MCPContentItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.text = source["text"];
	        this.json = source["json"];
	    }
	}
	export class MCPCallResult {
	    serverId: string;
	    toolName: string;
	    durationMs: number;
	    content: MCPContentItem[];
	    structuredContent: string;
	    isError: boolean;
	    error?: string;
	    requestedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new MCPCallResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serverId = source["serverId"];
	        this.toolName = source["toolName"];
	        this.durationMs = source["durationMs"];
	        this.content = this.convertValues(source["content"], MCPContentItem);
	        this.structuredContent = source["structuredContent"];
	        this.isError = source["isError"];
	        this.error = source["error"];
	        this.requestedAt = source["requestedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class HttpResponse {
	    statusCode: number;
	    statusText: string;
	    durationMs: number;
	    sizeBytes: number;
	    headers: KeyValuePair[];
	    body: string;
	    contentType: string;
	    error?: string;
	    requestedAt: string;
	    resolvedUrl?: string;
	    snippetTarget?: string;
	
	    static createFrom(source: any = {}) {
	        return new HttpResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.statusCode = source["statusCode"];
	        this.statusText = source["statusText"];
	        this.durationMs = source["durationMs"];
	        this.sizeBytes = source["sizeBytes"];
	        this.headers = this.convertValues(source["headers"], KeyValuePair);
	        this.body = source["body"];
	        this.contentType = source["contentType"];
	        this.error = source["error"];
	        this.requestedAt = source["requestedAt"];
	        this.resolvedUrl = source["resolvedUrl"];
	        this.snippetTarget = source["snippetTarget"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class MCPRequest {
	    serverId: string;
	    toolName: string;
	    argumentsJson: string;
	    promptName?: string;
	    promptArgs?: string;
	    resourceUri?: string;
	
	    static createFrom(source: any = {}) {
	        return new MCPRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serverId = source["serverId"];
	        this.toolName = source["toolName"];
	        this.argumentsJson = source["argumentsJson"];
	        this.promptName = source["promptName"];
	        this.promptArgs = source["promptArgs"];
	        this.resourceUri = source["resourceUri"];
	    }
	}
	export class HttpFormDataItem {
	    id: string;
	    key: string;
	    value: string;
	    enabled: boolean;
	    valueType?: string;
	    fileName?: string;
	    filePath?: string;
	    fileBase64?: string;
	
	    static createFrom(source: any = {}) {
	        return new HttpFormDataItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.key = source["key"];
	        this.value = source["value"];
	        this.enabled = source["enabled"];
	        this.valueType = source["valueType"];
	        this.fileName = source["fileName"];
	        this.filePath = source["filePath"];
	        this.fileBase64 = source["fileBase64"];
	    }
	}
	export class HttpBody {
	    mode: string;
	    contentType: string;
	    raw: string;
	    rawType?: string;
	    formData: HttpFormDataItem[];
	    urlEncoded: KeyValuePair[];
	    binaryFile?: string;
	    binaryName?: string;
	    binaryBase64?: string;
	    previewLabel?: string;
	
	    static createFrom(source: any = {}) {
	        return new HttpBody(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.mode = source["mode"];
	        this.contentType = source["contentType"];
	        this.raw = source["raw"];
	        this.rawType = source["rawType"];
	        this.formData = this.convertValues(source["formData"], HttpFormDataItem);
	        this.urlEncoded = this.convertValues(source["urlEncoded"], KeyValuePair);
	        this.binaryFile = source["binaryFile"];
	        this.binaryName = source["binaryName"];
	        this.binaryBase64 = source["binaryBase64"];
	        this.previewLabel = source["previewLabel"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class HttpAuth {
	    type: string;
	    username: string;
	    password: string;
	    token: string;
	
	    static createFrom(source: any = {}) {
	        return new HttpAuth(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.username = source["username"];
	        this.password = source["password"];
	        this.token = source["token"];
	    }
	}
	export class HttpCookieItem {
	    id: string;
	    name: string;
	    value: string;
	    enabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new HttpCookieItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.value = source["value"];
	        this.enabled = source["enabled"];
	    }
	}
	export class HttpCookieScope {
	    id: string;
	    host: string;
	    cookies: HttpCookieItem[];
	
	    static createFrom(source: any = {}) {
	        return new HttpCookieScope(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.host = source["host"];
	        this.cookies = this.convertValues(source["cookies"], HttpCookieItem);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class KeyValuePair {
	    id: string;
	    key: string;
	    value: string;
	    enabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new KeyValuePair(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.key = source["key"];
	        this.value = source["value"];
	        this.enabled = source["enabled"];
	    }
	}
	export class HttpRequest {
	    name: string;
	    method: string;
	    url: string;
	    query: KeyValuePair[];
	    headers: KeyValuePair[];
	    cookieScopes: HttpCookieScope[];
	    auth: HttpAuth;
	    body: HttpBody;
	    timeoutMs: number;
	
	    static createFrom(source: any = {}) {
	        return new HttpRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.method = source["method"];
	        this.url = source["url"];
	        this.query = this.convertValues(source["query"], KeyValuePair);
	        this.headers = this.convertValues(source["headers"], KeyValuePair);
	        this.cookieScopes = this.convertValues(source["cookieScopes"], HttpCookieScope);
	        this.auth = this.convertValues(source["auth"], HttpAuth);
	        this.body = this.convertValues(source["body"], HttpBody);
	        this.timeoutMs = source["timeoutMs"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class WorkspaceTab {
	    id: string;
	    title: string;
	    mode: string;
	    linkedNodeId?: string;
	    linkedHistoryId?: string;
	    http: HttpRequest;
	    mcp: MCPRequest;
	    lastHttp?: HttpResponse;
	    lastMcp?: MCPCallResult;
	    dirty: boolean;
	    lastUpdatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new WorkspaceTab(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.mode = source["mode"];
	        this.linkedNodeId = source["linkedNodeId"];
	        this.linkedHistoryId = source["linkedHistoryId"];
	        this.http = this.convertValues(source["http"], HttpRequest);
	        this.mcp = this.convertValues(source["mcp"], MCPRequest);
	        this.lastHttp = this.convertValues(source["lastHttp"], HttpResponse);
	        this.lastMcp = this.convertValues(source["lastMcp"], MCPCallResult);
	        this.dirty = source["dirty"];
	        this.lastUpdatedAt = source["lastUpdatedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class WorkspaceStore {
	    version: number;
	    activeTabId: string;
	    tabs: WorkspaceTab[];
	    updatedAt: string;
	    sidebarWidth: number;
	    snippetWidth: number;
	
	    static createFrom(source: any = {}) {
	        return new WorkspaceStore(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.activeTabId = source["activeTabId"];
	        this.tabs = this.convertValues(source["tabs"], WorkspaceTab);
	        this.updatedAt = source["updatedAt"];
	        this.sidebarWidth = source["sidebarWidth"];
	        this.snippetWidth = source["snippetWidth"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BootstrapData {
	    workspace: WorkspaceStore;
	    collections: CollectionStore;
	    mcpServers: MCPServerStore;
	    history: CombinedHistoryStore;
	    settings: SettingsStore;
	    loadedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new BootstrapData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.workspace = this.convertValues(source["workspace"], WorkspaceStore);
	        this.collections = this.convertValues(source["collections"], CollectionStore);
	        this.mcpServers = this.convertValues(source["mcpServers"], MCPServerStore);
	        this.history = this.convertValues(source["history"], CombinedHistoryStore);
	        this.settings = this.convertValues(source["settings"], SettingsStore);
	        this.loadedAt = source["loadedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	
	
	
	
	
	
	
	
	
	
	export class MCPCallRequest {
	    serverId: string;
	    toolName: string;
	    argumentsJson: string;
	
	    static createFrom(source: any = {}) {
	        return new MCPCallRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serverId = source["serverId"];
	        this.toolName = source["toolName"];
	        this.argumentsJson = source["argumentsJson"];
	    }
	}
	
	
	export class MCPDiscoverResult {
	    serverId: string;
	    tools: MCPTool[];
	    prompts: MCPPrompt[];
	    resources: MCPResource[];
	    connected: boolean;
	    serverName?: string;
	    serverVersion?: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new MCPDiscoverResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serverId = source["serverId"];
	        this.tools = this.convertValues(source["tools"], MCPTool);
	        this.prompts = this.convertValues(source["prompts"], MCPPrompt);
	        this.resources = this.convertValues(source["resources"], MCPResource);
	        this.connected = source["connected"];
	        this.serverName = source["serverName"];
	        this.serverVersion = source["serverVersion"];
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class MCPPromptRequest {
	    serverId: string;
	    promptName: string;
	    arguments: Record<string, string>;
	    argumentsJson?: string;
	
	    static createFrom(source: any = {}) {
	        return new MCPPromptRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serverId = source["serverId"];
	        this.promptName = source["promptName"];
	        this.arguments = source["arguments"];
	        this.argumentsJson = source["argumentsJson"];
	    }
	}
	export class MCPPromptResultView {
	    serverId: string;
	    promptName: string;
	    durationMs: number;
	    description: string;
	    messages: string[];
	    requestedAt: string;
	    error?: string;
	    argumentsJson?: string;
	
	    static createFrom(source: any = {}) {
	        return new MCPPromptResultView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serverId = source["serverId"];
	        this.promptName = source["promptName"];
	        this.durationMs = source["durationMs"];
	        this.description = source["description"];
	        this.messages = source["messages"];
	        this.requestedAt = source["requestedAt"];
	        this.error = source["error"];
	        this.argumentsJson = source["argumentsJson"];
	    }
	}
	export class MCPReadResourceResult {
	    serverId: string;
	    uri: string;
	    durationMs: number;
	    contents: string[];
	    requestedAt: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new MCPReadResourceResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serverId = source["serverId"];
	        this.uri = source["uri"];
	        this.durationMs = source["durationMs"];
	        this.contents = source["contents"];
	        this.requestedAt = source["requestedAt"];
	        this.error = source["error"];
	    }
	}
	
	
	
	export class MCPServerImportResult {
	    added: MCPServerConfig[];
	    warnings: string[];
	    servers: MCPServerStore;
	
	    static createFrom(source: any = {}) {
	        return new MCPServerImportResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.added = this.convertValues(source["added"], MCPServerConfig);
	        this.warnings = source["warnings"];
	        this.servers = this.convertValues(source["servers"], MCPServerStore);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class MCPServerTestResult {
	    success: boolean;
	    serverId: string;
	    durationMs: number;
	    serverName?: string;
	    serverVersion?: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new MCPServerTestResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.serverId = source["serverId"];
	        this.durationMs = source["durationMs"];
	        this.serverName = source["serverName"];
	        this.serverVersion = source["serverVersion"];
	        this.error = source["error"];
	    }
	}
	
	
	
	

}

