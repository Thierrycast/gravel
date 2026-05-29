import Link from "next/link"
import { ArrowLeft, SearchX } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"

export default function CryptoAssetNotFound() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Cripto"
        title="Ativo não encontrado"
        description="Não há posição ou histórico disponível para este ativo."
      />
      <section className="surface flex min-h-[300px] flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="rounded-full bg-muted p-4">
          <SearchX className="size-7 text-muted-foreground" />
        </div>
        <div className="max-w-sm space-y-1">
          <h2 className="text-base font-semibold">Verifique o identificador do ativo</h2>
          <p className="text-sm text-muted-foreground">
            Abra a carteira para consultar somente os ativos disponíveis.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/crypto">
            <ArrowLeft className="size-4" />
            Voltar para carteira cripto
          </Link>
        </Button>
      </section>
    </div>
  )
}
