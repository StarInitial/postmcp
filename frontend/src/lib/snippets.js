import { parseJson } from './defaults'

const escapeString = (value = '') => value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')

const enabledPairs = (pairs = []) => pairs.filter((pair) => pair.enabled && pair.key)

function extractHost(urlText) {
  try {
    if (!urlText) {
      return ''
    }
    return new URL(urlText).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function cookieHostMatches(scopeHost, requestHost) {
  const normalizedScope = String(scopeHost || '').trim().replace(/^\./, '').toLowerCase()
  if (!normalizedScope || !requestHost) {
    return false
  }
  return requestHost === normalizedScope || requestHost.endsWith(`.${normalizedScope}`)
}

function buildCookieHeader(http) {
  const host = extractHost(http?.url)
  if (!host) {
    return ''
  }
  const cookieParts = []
  ;(http?.cookieScopes || []).forEach((scope) => {
    if (!cookieHostMatches(scope?.host, host)) {
      return
    }
    ;(scope?.cookies || []).forEach((cookie) => {
      const name = String(cookie?.name || '').trim()
      if (!cookie?.enabled || !name) {
        return
      }
      cookieParts.push(`${name}=${String(cookie?.value || '')}`)
    })
  })
  return cookieParts.join('; ')
}

function resolvedHeaders(http) {
  const headers = enabledPairs(http?.headers || []).map((header) => ({ ...header }))
  const managedCookie = buildCookieHeader(http)
  if (!managedCookie) {
    return headers
  }

  const existingCookie = headers.find((header) => String(header.key || '').toLowerCase() === 'cookie')
  if (existingCookie) {
    existingCookie.value = existingCookie.value ? `${existingCookie.value}; ${managedCookie}` : managedCookie
    return headers
  }

  return [...headers, { key: 'Cookie', value: managedCookie }]
}

function buildHttpBody(http) {
  switch (http.body.mode) {
    case 'raw':
      return http.body.raw || ''
    case 'json':
      return http.body.raw || ''
    case 'x-www-form-urlencoded': {
      const params = new URLSearchParams()
      enabledPairs(http.body.urlEncoded).forEach((pair) => params.set(pair.key, pair.value))
      return params.toString()
    }
    default:
      return ''
  }
}

export function generateHttpSnippet(http, language = 'curl') {
  const method = (http.method || 'GET').toUpperCase()
  const headers = resolvedHeaders(http)
  const body = buildHttpBody(http)

  switch (language) {
    case 'fetch': {
      const headerLines = headers.map((header) => `    "${escapeString(header.key)}": "${escapeString(header.value)}"`).join(',\n')
      return `fetch("${escapeString(http.url || '')}", {\n  method: "${method}",\n  headers: {\n${headerLines || '    // add headers'}\n  },${body ? `\n  body: ${JSON.stringify(body)},` : ''}\n})\n  .then((response) => response.text())\n  .then(console.log)`
    }
    case 'go': {
      const headerLines = headers.map((header) => `req.Header.Set(${JSON.stringify(header.key)}, ${JSON.stringify(header.value)})`).join('\n')
      return `body := strings.NewReader(${JSON.stringify(body)})\nreq, err := http.NewRequest(${JSON.stringify(method)}, ${JSON.stringify(http.url || '')}, body)\nif err != nil {\n    panic(err)\n}\n${headerLines || '// set headers here'}\nresp, err := http.DefaultClient.Do(req)\nif err != nil {\n    panic(err)\n}\ndefer resp.Body.Close()`
    }
    case 'python': {
      const headerMap = Object.fromEntries(headers.map((header) => [header.key, header.value]))
      return `import requests\n\nresponse = requests.request(\n    ${JSON.stringify(method)},\n    ${JSON.stringify(http.url || '')},\n    headers=${JSON.stringify(headerMap, null, 4)},${body ? `\n    data=${JSON.stringify(body)}` : ''}\n)\n\nprint(response.text)`
    }
    case 'axios': {
      const headerMap = Object.fromEntries(headers.map((header) => [header.key, header.value]))
      return `import axios from "axios"\n\nconst response = await axios({\n  method: ${JSON.stringify(method.toLowerCase())},\n  url: ${JSON.stringify(http.url || '')},\n  headers: ${JSON.stringify(headerMap, null, 2)},${body ? `\n  data: ${JSON.stringify(body)},` : ''}\n})\n\nconsole.log(response.data)`
    }
    case 'curl':
    default: {
      const parts = [`curl --request ${method}`, JSON.stringify(http.url || '')]
      headers.forEach((header) => parts.push(`--header ${JSON.stringify(`${header.key}: ${header.value}`)}`))
      if (body) {
        parts.push(`--data ${JSON.stringify(body)}`)
      }
      return parts.join(' \\\n  ')
    }
  }
}

export function generateMcpSnippet(mcp, server, language = 'json') {
  const args = parseJson(mcp.argumentsJson || '{}', {})

  switch (language) {
    case 'typescript':
      return `const payload = {\n  server: ${JSON.stringify(server?.name || '')},\n  tool: ${JSON.stringify(mcp.toolName || '')},\n  arguments: ${JSON.stringify(args, null, 2)}\n}\n\nconsole.log(payload)`
    case 'python':
      return `payload = {\n    "server": ${JSON.stringify(server?.name || '')},\n    "tool": ${JSON.stringify(mcp.toolName || '')},\n    "arguments": ${JSON.stringify(args, null, 4)}\n}\n\nprint(payload)`
    case 'json':
    default:
      return JSON.stringify(
        {
          server: server?.name || '',
          transport: server?.transport || '',
          tool: mcp.toolName || '',
          arguments: args,
        },
        null,
        2,
      )
  }
}
