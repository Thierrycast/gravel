'use client'

import { useEffect } from 'react'
import { PageError } from '@/components/page-error'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Root Error Boundary]', error)
  }, [error])

  return (
    <div className="container max-w-5xl mx-auto py-12 px-4">
      <PageError 
        message={error.message || "Ocorreu um erro inesperado na aplicação."} 
        refetch={() => reset()} 
      />
    </div>
  )
}
