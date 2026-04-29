import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { serializeForJson } from "@/lib/core/http"

export async function GET() {
  const settings = await prisma.userSetting.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  })
  return NextResponse.json(serializeForJson(settings))
}

export async function PATCH(request: Request) {
  const body = await request.json()
  const { 
    monthlySalary, 
    showFutureSalary, 
    showFutureAccounts, 
    syncIntervalHours, 
    syncLookbackDays,
    dashboardConfigJson,
    vaultEnabled,
    vaultMasterPassword,
    vaultInactivityMin 
  } = body

  const settings = await prisma.userSetting.update({
    where: { id: "default" },
    data: {
      monthlySalary: monthlySalary !== undefined ? monthlySalary : undefined,
      showFutureSalary: showFutureSalary !== undefined ? showFutureSalary : undefined,
      showFutureAccounts: showFutureAccounts !== undefined ? showFutureAccounts : undefined,
      syncIntervalHours: syncIntervalHours !== undefined ? syncIntervalHours : undefined,
      syncLookbackDays: syncLookbackDays !== undefined ? syncLookbackDays : undefined,
      dashboardConfigJson: dashboardConfigJson !== undefined ? dashboardConfigJson : undefined,
      vaultEnabled: vaultEnabled !== undefined ? vaultEnabled : undefined,
      vaultMasterPassword: vaultMasterPassword !== undefined ? vaultMasterPassword : undefined,
      vaultInactivityMin: vaultInactivityMin !== undefined ? vaultInactivityMin : undefined,
    },
  })
  return NextResponse.json(serializeForJson(settings))
}
