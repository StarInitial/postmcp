export async function invokeBackend(method, ...args) {
  const target = window?.go?.main?.App?.[method]

  if (typeof target !== 'function') {
    throw new Error(`Wails backend method unavailable: ${method}`)
  }

  return target(...args)
}

export function hasBackend() {
  return typeof window?.go?.main?.App?.LoadBootstrapData === 'function'
}
