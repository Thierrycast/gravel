import { test, expect } from "@playwright/test"

test("dashboard loads with main sections visible", async ({ page }) => {
  await page.goto("/")

  await expect(page).toHaveTitle(/Gravel/)

  // Main title from the PageHeader
  await expect(
    page.getByRole("heading", { name: "Painel financeiro" })
  ).toBeVisible()

  // Key section eyebrows rendered on the dashboard
  await expect(page.getByText("Resultado do período")).toBeVisible()
  await expect(page.getByText("Patrimônio ao longo do tempo")).toBeVisible()
  await expect(page.getByText("Movimentações recentes")).toBeVisible()
})

test("transactions page renders header and filters", async ({ page }) => {
  await page.goto("/transactions")

  await expect(
    page.getByRole("heading", { name: "Todas as movimentações" })
  ).toBeVisible()

  // Direction toggle buttons
  await expect(page.getByRole("button", { name: "ALL" })).toBeVisible()
  await expect(page.getByRole("button", { name: "OUT" })).toBeVisible()
  await expect(page.getByRole("button", { name: "IN" })).toBeVisible()
})

test("bills page shows totals card", async ({ page }) => {
  await page.goto("/bills", { waitUntil: "networkidle" })

  await expect(
    page.getByRole("heading", { name: "Faturas", level: 1 })
  ).toBeVisible()
  await expect(page.getByText("Total das Faturas")).toBeVisible({
    timeout: 15_000,
  })
})
