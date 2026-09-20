import { describe, expect, it, vi } from "vitest"

import { generateAiText } from "./provider"

describe("provider OpenAI-compatible", () => {
  const config = {
    kind: "openai-compatible" as const,
    baseUrl: "http://provider.invalid/v1",
    model: "modelo-teste",
    apiKey: "segredo-teste",
    timeoutMs: 1000,
  }

  it("gera texto sem depender de um serviço real", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "Resumo pronto" } }] }), { status: 200 })
    )

    await expect(generateAiText(config, "prompt", fetchMock)).resolves.toBe("Resumo pronto")
    expect(fetchMock.mock.calls[0][0]).toBe("http://provider.invalid/v1/chat/completions")
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it.each([401, 429, 503])("normaliza HTTP %s sem vazar a chave", async (status) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("segredo-teste", { status }))
    let message = ""
    try {
      await generateAiText(config, "prompt", fetchMock)
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).not.toContain(config.apiKey)
    expect(message).toBeTruthy()
  })

  it("rejeita JSON inválido e resposta vazia", async () => {
    const invalidJson = vi.fn<typeof fetch>().mockResolvedValue(new Response("não-json", { status: 200 }))
    await expect(generateAiText(config, "prompt", invalidJson)).rejects.toThrow("JSON inválido")

    const empty = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), { status: 200 })
    )
    await expect(generateAiText(config, "prompt", empty)).rejects.toThrow("sem conteúdo")
  })
})
