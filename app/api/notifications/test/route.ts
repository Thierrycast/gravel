import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { triggerNotificationDelivery } from "@/lib/domain/notifications"

export const dynamic = "force-dynamic"

/**
 * Dispara uma notificação de teste pelos MESMOS caminhos de entrega das reais
 * (log local, webhook Slack-compatible, ntfy, Telegram, Web Push).
 *
 * Existe porque configurar destino de notificação às cegas é o caminho para
 * descobrir meses depois que nunca chegou nada: o Web Push deste app já ficou
 * silenciosamente morto em produção por falta de chave. A resposta diz quais
 * destinos estavam configurados no momento do disparo, para diferenciar "não
 * chegou" de "não estava ligado".
 */
export async function POST() {
  try {
    const settings = await prisma.userSetting.findUnique({ where: { id: "default" } })
    const pushCount = await prisma.pushSubscription.count()

    const destinos = {
      webhook: Boolean(settings?.notificationWebhookUrl),
      ntfy: Boolean(settings?.ntfyTopicUrl),
      telegram: Boolean(settings?.telegramBotToken && settings?.telegramChatId),
      webPush: pushCount,
    }

    await triggerNotificationDelivery(
      "Gravel: teste de notificação",
      "Se você está lendo isto, este destino está entregando. Disparado pela tela de configurações.",
      "info",
      { origem: "teste manual" },
    )

    return NextResponse.json({ success: true, destinos })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro ao disparar notificação de teste",
      },
      { status: 500 },
    )
  }
}
