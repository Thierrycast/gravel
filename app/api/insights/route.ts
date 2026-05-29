import { NextResponse } from "next/server"
import { getBehavioralNudges } from "@/lib/domain/ai-engine"
import { checkBenfordsLaw, detectHiddenSubscriptions } from "@/lib/domain/forensics"
import { serializeForJson } from "@/lib/core/http"

export async function GET() {
  const [nudges, benford, hiddenSubs] = await Promise.all([
    getBehavioralNudges(),
    checkBenfordsLaw(),
    detectHiddenSubscriptions()
  ])

  return NextResponse.json(serializeForJson({
    nudges,
    forensics: {
      benford,
      hiddenSubs
    }
  }))
}