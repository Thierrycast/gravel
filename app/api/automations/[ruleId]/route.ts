import { prisma } from "@/lib/prisma"
import { jsonOk, jsonError } from "@/lib/core/http"
import { NextRequest } from "next/server"

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  try {
    const { ruleId } = await params
    const body = await request.json()
    const { matchType, matchField, matchValue, domainCategoryId, priority, active, provider } = body

    const rule = await prisma.categoryRule.update({
      where: { id: ruleId },
      data: {
        ...(matchType !== undefined && { matchType }),
        ...(matchField !== undefined && { matchField }),
        ...(matchValue !== undefined && { matchValue }),
        ...(domainCategoryId !== undefined && { domainCategoryId }),
        ...(priority !== undefined && { priority }),
        ...(active !== undefined && { active }),
        ...(provider !== undefined && { provider }),
      },
    })

    return jsonOk({ results: rule })
  } catch (error) {
    return jsonError(error)
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  try {
    const { ruleId } = await params

    await prisma.categoryRule.delete({ where: { id: ruleId } })

    return jsonOk({ results: null })
  } catch (error) {
    return jsonError(error)
  }
}
