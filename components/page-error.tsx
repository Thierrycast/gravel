import { AlertCircle, RefreshCcw } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

interface PageErrorProps {
  message?: string
  refetch?: () => void
}

export function PageError({ message = "Erro ao carregar dados", refetch }: PageErrorProps) {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Erro</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-4">
          <span>{message}</span>
          {refetch && (
            <Button variant="outline" size="sm" onClick={() => refetch()} className="shrink-0 h-8 gap-1.5 border-destructive/30 hover:bg-destructive/10 hover:text-destructive">
              <RefreshCcw className="h-3.5 w-3.5" />
              Tentar novamente
            </Button>
          )}
        </AlertDescription>
      </Alert>
    </div>
  )
}

export function CardError({ message = "Erro", refetch }: PageErrorProps) {
  return (
    <div className="p-4 border border-destructive/50 rounded-lg bg-destructive/5 text-destructive text-sm flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4" />
        <span>{message}</span>
      </div>
      {refetch && (
        <button onClick={() => refetch()} className="hover:underline flex items-center gap-1 font-medium">
          <RefreshCcw className="h-3 w-3" />
          Repetir
        </button>
      )}
    </div>
  )
}