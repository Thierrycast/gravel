const baseUrl = "http://localhost:3000"

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      "Content-Type": "application/json",
    },
  })

  let body = null
  try {
    body = await response.json()
  } catch {
    // ignore
  }
  return { status: response.status, body }
}

async function test() {
  console.log("1. Criando transação manual...")
  const createRes = await request("/api/domain/transactions/create", {
    method: "POST",
    body: JSON.stringify({
      description: "Teste Deletar",
      amount: 123.45,
      direction: "OUTFLOW",
      occurredAt: new Date().toISOString()
    })
  })

  if (createRes.status !== 200) {
    console.error("Erro ao criar transação:", createRes.body)
    process.exit(1)
  }

  const transactionId = createRes.body.results.id
  console.log(`Transação criada: ${transactionId}`)

  console.log("2. Verificando se a transação existe via GET...")
  const getRes = await request(`/api/domain/transactions/${transactionId}`)
  if (getRes.status !== 200) {
    console.error("Erro ao buscar transação:", getRes.body)
    process.exit(1)
  }
  console.log("Transação encontrada.")

  console.log("3. Deletando a transação...")
  const deleteRes = await request(`/api/domain/transactions/${transactionId}`, {
    method: "DELETE"
  })

  if (deleteRes.status !== 200) {
    console.error("Erro ao deletar transação:", deleteRes.body)
    process.exit(1)
  }
  console.log("Transação deletada com sucesso.")

  console.log("4. Verificando se a transação foi realmente removida (GET deve dar 404)...")
  const getRes2 = await request(`/api/domain/transactions/${transactionId}`)
  if (getRes2.status === 404) {
    console.log("Confirmado: Transação não encontrada (404).")
  } else {
    console.error(`Erro: Transação ainda existe ou outro status retornado: ${getRes2.status}`, getRes2.body)
    process.exit(1)
  }

  console.log("5. Tentando deletar novamente (deve dar 404)...")
  const deleteRes2 = await request(`/api/domain/transactions/${transactionId}`, {
    method: "DELETE"
  })
  if (deleteRes2.status === 404) {
    console.log("Confirmado: Segundo delete retornou 404.")
  } else {
    console.error(`Erro: Segundo delete retornou status inesperado: ${deleteRes2.status}`, deleteRes2.body)
    process.exit(1)
  }

  console.log("6. Tentando deletar uma transação não-manual (se existir)...")
  const listRes = await request("/api/transactions?pageSize=20")
  if (listRes.body && Array.isArray(listRes.body)) {
    const nonManual = listRes.body.find(t => t.sourceProvider !== "MANUAL")
    if (nonManual) {
      console.log(`Tentando deletar transação não-manual: ${nonManual.id} (provider: ${nonManual.sourceProvider})`)
      const deleteRes3 = await request(`/api/domain/transactions/${nonManual.id}`, {
        method: "DELETE"
      })
      if (deleteRes3.status === 400) {
        console.log("Confirmado: Delete de transação não-manual bloqueado (400).")
      } else {
        console.error(`Erro: Status inesperado ao deletar não-manual: ${deleteRes3.status}`, deleteRes3.body)
        process.exit(1)
      }
    } else {
      console.log("Nenhuma transação não-manual encontrada para testar bloqueio.")
    }
  }

  console.log("\nTodos os testes de DELETE passaram!")
}

test().catch(err => {
  console.error(err)
  process.exit(1)
})
