/**
 * Hook de inicialização do servidor Next. É o único lugar que roda uma vez por
 * processo (não por request, não por render) — o lugar certo para o agendador.
 *
 * Antes disso, o único gatilho periódico era uma chamada solta no `RootLayout`,
 * que só rodava quando alguém abria o app. Se ninguém abrisse, nada sincronizava.
 */
export async function register() {
  // Durante o build o Next executa este módulo; não subir timers nem tocar o
  // banco nessa fase.
  if (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build"
  ) {
    return
  }

  // Só no runtime Node — o agendador usa Prisma e timers.
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return
  }

  if (process.env.GRAVEL_DISABLE_SCHEDULER === "1") {
    console.log("[instrumentation] agendador desativado por GRAVEL_DISABLE_SCHEDULER=1")
    return
  }

  // Gera (ou carrega) a chave do cofre e o token interno antes de qualquer coisa
  // usá-los. Num produto o usuário não inventa esses valores: são infraestrutura,
  // e a chave do cofre não poderia vir da tela porque a tela precisa dela para
  // criptografar o que você digita.
  const { bootstrapVaultKeys } = await import("@/lib/server/vault-key")
  bootstrapVaultKeys()

  const { startScheduler } = await import("@/lib/ingestion/scheduler")
  startScheduler()
}
