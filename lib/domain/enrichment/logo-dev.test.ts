import { afterEach, describe, expect, it } from "vitest"

import {
  buildLogoDevCryptoUrl,
  buildLogoDevUrl,
  resolveMerchantDomain,
} from "./logo-dev"

const originalPublishableKey = process.env.LOGO_DEV_PUBLISHABLE_KEY

describe("logo-dev helpers", () => {
  afterEach(() => {
    process.env.LOGO_DEV_PUBLISHABLE_KEY = originalPublishableKey
  })

  it("resolve dominios conhecidos sem chamada externa", () => {
    expect(resolveMerchantDomain("Netflix Brasil")).toBe("netflix.com")
    expect(resolveMerchantDomain("Banco Inter")).toBe("bancointer.com.br")
    expect(resolveMerchantDomain("Bizzinternet")).toBeNull()
    expect(resolveMerchantDomain("C6 Bank")).toBe("c6bank.com.br")
  })

  it("monta CDN com publishable key, sem secret key", () => {
    process.env.LOGO_DEV_PUBLISHABLE_KEY = "pk_test"
    const url = buildLogoDevUrl("netflix.com")
    expect(url).toContain("https://img.logo.dev/netflix.com")
    expect(url).toContain("token=pk_test")
    expect(url).not.toContain("sk_")
  })

  it("mantem fallback local para cripto quando nao ha publishable key", () => {
    delete process.env.LOGO_DEV_PUBLISHABLE_KEY
    expect(buildLogoDevCryptoUrl("BTC")).toBeNull()
  })
})
