const baseUrl = process.env.BASE_URL ?? "http://localhost:3000"
const internalApiKey = process.env.INTERNAL_API_KEY
const runSync = process.env.RUN_SYNC === "true"

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(internalApiKey ? { "X-INTERNAL-API-KEY": internalApiKey } : {}),
      "Content-Type": "application/json",
    },
  })

  const text = await response.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }

  if (!response.ok) {
    throw new Error(`${path} -> ${response.status} ${JSON.stringify(body)}`)
  }

  console.log(`${path} -> ok`)
  return body
}

async function main() {
  if (runSync) {
    await request("/api/admin/sync/full", {
      method: "POST",
      body: JSON.stringify({}),
    })
  } else if (internalApiKey) {
    await request("/api/admin/rebuild/domain-read-models", {
      method: "POST",
      body: JSON.stringify({}),
    })
  }

  await request("/api/accounts")
  await request("/api/transactions?pageSize=5")
  await request("/api/categories")
  await request("/api/bills")
  await request("/api/crypto?pageSize=5")
  await request("/api/portfolio")
  await request("/api/projection?months=3")
  await request("/api/recurring")
  await request("/api/recurring/expenses")
  await request("/api/recurring/income")
  await request("/api/domain/metrics/overview?period=mtd")
  await request("/api/domain/metrics/cash-flow?period=12m&groupBy=month")
  await request("/api/domain/metrics/crypto/assets?period=all&pageSize=5")
  await request("/api/domain/metrics/spending/categories?period=mtd&limit=5")
  await request("/api/domain/metrics/spending/merchants?period=mtd&limit=5")

  console.log("smoke backend concluido")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
