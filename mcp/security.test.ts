import { describe, expect, it } from "vitest"

import { canCallTool, resolveMcpScope, validBearer } from "./security"

describe("segurança do MCP", () => {
  it("usa read-only por padrão", () => {
    expect(resolveMcpScope()).toBe("read")
    expect(canCallTool("read", "get_financial_snapshot")).toBe(true)
    expect(canCallTool("read", "create_transaction")).toBe(false)
  })

  it("libera mutações somente no escopo write", () => {
    expect(resolveMcpScope("write")).toBe("write")
    expect(canCallTool("write", "create_transaction")).toBe(true)
  })

  it("valida bearer token sem aceitar formatos parciais", () => {
    expect(validBearer("Bearer token-correto", "token-correto")).toBe(true)
    expect(validBearer("Bearer token-errado", "token-correto")).toBe(false)
    expect(validBearer("token-correto", "token-correto")).toBe(false)
  })
})
