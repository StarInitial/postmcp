import { createDefaultHttpRequest, newCookieItem, newCookieScope, newPair } from '../workbench/lib/defaults'

function tokenizeCurl(input) {
  const tokens = []
  let current = ''
  let quote = ''
  let escaping = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]

    if (escaping) {
      current += char
      escaping = false
      continue
    }

    if (char === '\\') {
      const nextChar = input[index + 1]
      if (quote) {
        if (nextChar === quote || nextChar === '\\') {
          escaping = true
          continue
        }
        current += char
        continue
      }
      if (nextChar === '"' || nextChar === "'" || nextChar === '\\' || /\s/.test(nextChar || '')) {
        escaping = true
        continue
      }
      current += char
      continue
    }

    if (quote) {
      if (char === quote) {
        quote = ''
      } else {
        current += char
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (current) {
    tokens.push(current)
  }

  return tokens
}

function parseHeader(headerLine) {
  const separatorIndex = headerLine.indexOf(':')
  if (separatorIndex === -1) {
    return newPair(headerLine.trim(), '')
  }

  return newPair(headerLine.slice(0, separatorIndex).trim(), headerLine.slice(separatorIndex + 1).trim())
}

function stripWrappingQuotes(value) {
  const text = String(value || '').trim()
  if (!text) {
    return ''
  }
  const first = text[0]
  const last = text[text.length - 1]
  if ((first === '"' || first === "'") && last === first) {
    return text.slice(1, -1)
  }
  return text
}

function fileNameFromPath(filePath) {
  const normalized = String(filePath || '').trim().replace(/\\/g, '/')
  if (!normalized) {
    return ''
  }
  const parts = normalized.split('/')
  return parts[parts.length - 1] || ''
}

function parseFormEntry(entry, { allowFile = true } = {}) {
  const separatorIndex = entry.indexOf('=')
  if (separatorIndex < 0) {
    return null
  }

  const key = entry.slice(0, separatorIndex).trim()
  if (!key) {
    return null
  }

  const rawValue = entry.slice(separatorIndex + 1).trim()
  if (allowFile && rawValue.startsWith('@')) {
    const filePath = stripWrappingQuotes(rawValue.slice(1))
    return {
      key,
      valueType: 'file',
      value: '',
      filePath,
      fileName: fileNameFromPath(filePath),
      fileBase64: '',
    }
  }

  return {
    key,
    valueType: 'text',
    value: stripWrappingQuotes(rawValue),
    filePath: '',
    fileName: '',
    fileBase64: '',
  }
}

function ensureUrl(token) {
  return /^https?:\/\//i.test(token) || /^localhost[:/]/i.test(token) || /^127\.0\.0\.1[:/]/.test(token)
}

function parseCookieLine(value) {
  return String(value || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const separatorIndex = item.indexOf('=')
      if (separatorIndex < 0) {
        return null
      }
      const name = item.slice(0, separatorIndex).trim()
      if (!name) {
        return null
      }
      return {
        name,
        value: item.slice(separatorIndex + 1).trim(),
      }
    })
    .filter(Boolean)
}

function extractHost(urlText) {
  try {
    if (!urlText) {
      return ''
    }
    return new URL(urlText).hostname || ''
  } catch {
    return ''
  }
}

export function tryImportCurl(commandText) {
  if (!commandText || !commandText.trim().startsWith('curl ')) {
    return null
  }

  const tokens = tokenizeCurl(commandText.trim())
  if (!tokens.length || tokens[0] !== 'curl') {
    return null
  }

  const request = createDefaultHttpRequest()
  const headers = []
  const importedCookies = []
  const formData = []
  let inferredMethod = ''
  let rawBody = ''

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]
    const next = tokens[index + 1]

    if (token === '-X' || token === '--request') {
      inferredMethod = (next || 'GET').toUpperCase()
      index += 1
      continue
    }

    if (token === '-H' || token === '--header') {
      if (next) {
        const parsedHeader = parseHeader(next)
        if (parsedHeader.key.toLowerCase() === 'cookie') {
          importedCookies.push(...parseCookieLine(parsedHeader.value))
        } else {
          headers.push(parsedHeader)
        }
        index += 1
      }
      continue
    }

    if (token === '-b' || token === '--cookie') {
      if (next && next.includes('=')) {
        importedCookies.push(...parseCookieLine(next))
      }
      index += 1
      continue
    }

    if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary' || token === '--data-urlencode') {
      rawBody = next || ''
      if (!inferredMethod) {
        inferredMethod = 'POST'
      }
      index += 1
      continue
    }

    if (token === '-F' || token === '--form' || token === '--form-string') {
      if (next) {
        const parsedItem = parseFormEntry(next, { allowFile: token !== '--form-string' })
        if (parsedItem) {
          formData.push(parsedItem)
        }
      }
      if (!inferredMethod) {
        inferredMethod = 'POST'
      }
      index += 1
      continue
    }

    if (token === '-u' || token === '--user') {
      const credential = next || ''
      const separatorIndex = credential.indexOf(':')
      request.auth.type = 'basic'
      request.auth.username = separatorIndex >= 0 ? credential.slice(0, separatorIndex) : credential
      request.auth.password = separatorIndex >= 0 ? credential.slice(separatorIndex + 1) : ''
      index += 1
      continue
    }

    if (!token.startsWith('-') && !request.url && ensureUrl(token)) {
      request.url = token.startsWith('http') ? token : `http://${token}`
    }
  }

  request.method = inferredMethod || 'GET'
  request.headers = headers
  request.body.raw = rawBody
  const cookieHost = extractHost(request.url)
  if (cookieHost && importedCookies.length) {
    request.cookieScopes = [
      {
        ...newCookieScope(cookieHost),
        cookies: importedCookies.map((item) => newCookieItem(item.name, item.value)),
      },
    ]
  }

  const contentType = headers.find((header) => header.key.toLowerCase() === 'content-type')?.value || ''
  if (formData.length) {
    request.body.mode = 'form-data'
    request.body.contentType = 'multipart/form-data'
    request.body.formData = formData.map((item) => ({
      ...newPair(item.key, item.value),
      valueType: item.valueType,
      fileName: item.fileName,
      filePath: item.filePath,
      fileBase64: item.fileBase64,
    }))
  } else if (rawBody) {
    if (contentType.includes('application/json')) {
      request.body.mode = 'raw'
      request.body.rawType = 'json'
      request.body.contentType = 'application/json'
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      request.body.mode = 'x-www-form-urlencoded'
      request.body.contentType = 'application/x-www-form-urlencoded'
      request.body.urlEncoded = rawBody.split('&').map((part) => {
        const [key, value = ''] = part.split('=')
        return newPair(decodeURIComponent(key || ''), decodeURIComponent(value || ''))
      })
    } else {
      request.body.mode = 'raw'
      request.body.rawType = contentType.includes('javascript') ? 'javascript' : 'text'
      request.body.contentType = contentType || 'text/plain'
    }
  }

  return request
}
