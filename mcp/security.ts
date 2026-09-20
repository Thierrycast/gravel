import { timingSafeEqual } from "node:crypto"

export type McpScope = "read" | "write"

export const WRITE_TOOLS = new Set([
  "set_financial_inbox_item_status",
  "set_monthly_close_step",
  "complete_monthly_close",
  "create_transaction",
  "update_transaction",
  "delete_transaction",
  "update_account",
  "pay_bill",
  "create_goal",
  "update_goal",
  "create_scenario",
  "delete_scenario",
  "create_lend",
  "update_lend",
  "delete_lend",
  "create_automation_rule",
  "delete_automation_rule",
  "trigger_sync",
  "refresh_item",
  "refresh_account_balance",
  "enrich_items",
  "set_detected_recurring_status",
  "update_settings",
])

export function resolveMcpScope(value?: string): McpScope {
  return value?.trim().toLowerCase() === "write" ? "write" : "read"
}

export function canCallTool(scope: McpScope, toolName: string) {
  return scope === "write" || !WRITE_TOOLS.has(toolName)
}

export function validBearer(authorization: string | undefined, expectedToken: string) {
  const prefix = "Bearer "
  if (!authorization?.startsWith(prefix) || !expectedToken) return false
  const received = Buffer.from(authorization.slice(prefix.length), "utf8")
  const expected = Buffer.from(expectedToken, "utf8")
  return received.length === expected.length && timingSafeEqual(received, expected)
}
