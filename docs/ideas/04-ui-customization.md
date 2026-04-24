# Ideia: Customização de Interface (UI Modular)

Permitir que o usuário molde o dashboard ao seu perfil de uso.

## 1. Dashboard Widgets
- **Toggle de Módulos:** Ativar/Desativar seções do dashboard (ex: Ocultar Cripto, Ocultar Metas, Ocultar Faturas).
- **Default View:** Definir qual o período padrão ao abrir o app (MTD, 30d, 7d).

## 3. Comunicação e Feedback (Toasts & Notifications)
O sistema hoje é muito silencioso. A ideia é adicionar camadas de feedback imediato e lembretes externos.
- **Toasts (Feedback de Ação):** Usar `sonner` para mensagens rápidas na UI:
    - *"Sync iniciado. Verificando Pluggy..."*
    - *"Transação ignorada com sucesso."*
    - *"Configurações de API salvas localmente."*
- **Web Notifications API (Alertas de Sistema):** Notificações do navegador mesmo com a aba em segundo plano (via Service Worker):
    - *"Lembrete: Fatura X vence hoje!"* (Puxando de `DomainBill`).
    - *"Sync completo: 12 novas movimentações."*
    - *"Saldo em conta atingiu o limite de segurança de R$ 500."*
