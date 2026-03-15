import { prisma } from "@/lib/prisma"
import { jsonOk, jsonError } from "@/lib/core/http"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const tags = await prisma.tag.findMany({
      orderBy: { name: "asc" },
    })

    return jsonOk({ results: tags })
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, color } = body

    if (!name || typeof name !== "string") {
      return jsonError(new Error("Nome da tag é obrigatório"), 400)
    }

    const tag = await prisma.tag.create({
      data: {
        name: name.trim(),
        color: color ?? "#6366f1",
      },
    })

    return jsonOk({ results: tag })
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint")
    ) {
      return jsonError(new Error("Já existe uma tag com este nome"), 409)
    }
    return jsonError(error)
  }
}
