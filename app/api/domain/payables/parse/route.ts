import { extractText, getDocumentProxy } from "unpdf"

import { jsonError, jsonOk } from "@/lib/core/http"
import { findBoletoInText, parseBoleto, type ParsedBoleto } from "@/lib/domain/boleto"

export const dynamic = "force-dynamic"

const MAX_PDF_BYTES = 5 * 1024 * 1024

/**
 * Lê um boleto sem gravar nada: a tela mostra valor e vencimento para conferir
 * antes de salvar. Aceita `{ code }` em JSON ou um PDF em `file` (multipart).
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? ""
    let boleto: ParsedBoleto | null = null

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData()
      const file = form.get("file")
      if (!(file instanceof File)) return jsonError(new Error("Envie o PDF do boleto."), 400)
      if (file.size > MAX_PDF_BYTES) return jsonError(new Error("PDF maior que 5 MB."), 400)
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") {
        return jsonError(new Error("O arquivo não é um PDF."), 400)
      }
      const pdf = await getDocumentProxy(bytes)
      const { text } = await extractText(pdf, { mergePages: true })
      boleto = findBoletoInText(text)
      if (!boleto) {
        return jsonError(
          new Error("Não achei a linha digitável no PDF. Cole o código do boleto (o banco deixa copiar)."),
          422,
        )
      }
    } else {
      const body = (await request.json().catch(() => null)) as { code?: unknown } | null
      if (typeof body?.code !== "string") return jsonError(new Error("Informe o código do boleto."), 400)
      const parsed = parseBoleto(body.code)
      if (!parsed.ok) return jsonError(new Error(parsed.error), 422)
      boleto = parsed.boleto
    }

    return jsonOk({ results: boleto })
  } catch (error) {
    return jsonError(error)
  }
}
