/** Sinal estruturado de quitação: descrições e categorias variam entre bancos. */
export function hasPluggyBillPaymentOperation(metadataJson?: string | null): boolean {
  if (!metadataJson) return false;
  try {
    const metadata = JSON.parse(metadataJson) as { operationType?: unknown };
    return metadata.operationType === "PAGAMENTO_FATURA";
  } catch {
    return false;
  }
}
