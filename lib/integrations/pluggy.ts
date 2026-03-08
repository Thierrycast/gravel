const defaultBaseUrl = "https://api.pluggy.ai"

function getEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing env var: ${name}`)
  }
  return value
}

function getBaseUrl() {
  return process.env.PLUGGY_API_BASE ?? defaultBaseUrl
}

function getHeaderName() {
  return process.env.PLUGGY_API_KEY_HEADER ?? "X-API-KEY"
}

function getAuthPath() {
  return process.env.PLUGGY_AUTH_PATH ?? "/auth"
}

function getConnectTokenPath() {
  return process.env.PLUGGY_CONNECT_TOKEN_PATH ?? "/connect_token"
}

export async function createApiKey() {
  const clientId = getEnv("PLUGGY_CLIENT_ID")
  const clientSecret = getEnv("PLUGGY_CLIENT_SECRET")

  const response = await fetch(`${getBaseUrl()}${getAuthPath()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      clientId,
      clientSecret,
    }),
    cache: "no-store",
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Pluggy auth error: ${response.status} ${text}`)
  }

  return response.json()
}

type ConnectTokenOptions = {
  webhookUrl?: string
  clientUserId?: string
  oauthRedirectUrl?: string
  avoidDuplicates?: boolean
  itemId?: string
}

export async function createConnectToken(
  apiKey: string,
  options?: ConnectTokenOptions
) {
  const response = await fetch(`${getBaseUrl()}${getConnectTokenPath()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [getHeaderName()]: apiKey,
    },
    body: options ? JSON.stringify(options) : undefined,
    cache: "no-store",
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Pluggy connect token error: ${response.status} ${text}`)
  }

  return response.json()
}
