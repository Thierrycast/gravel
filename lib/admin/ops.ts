import { randomUUID } from "node:crypto"

import {
  OpsRunStatus,
  type SourceProvider,
} from "@prisma/client"

import { prisma } from "@/lib/prisma"

const defaultLockTtlMs = 5 * 60 * 1000

export async function acquireSyncLock(
  lockKey: string,
  owner = randomUUID(),
  ttlMs = defaultLockTtlMs
) {
  const existing = await prisma.opsSyncLock.findUnique({
    where: { lockKey },
  })

  const now = new Date()
  const expiresAt = new Date(now.getTime() + ttlMs)

  if (existing && existing.expiresAt > now) {
    throw new Error(`Lock ativo para ${lockKey}`)
  }

  await prisma.opsSyncLock.upsert({
    where: { lockKey },
    update: {
      owner,
      lockedAt: now,
      expiresAt,
    },
    create: {
      lockKey,
      owner,
      lockedAt: now,
      expiresAt,
    },
  })

  return owner
}

export async function releaseSyncLock(lockKey: string, owner: string) {
  await prisma.opsSyncLock.deleteMany({
    where: {
      lockKey,
      owner,
    },
  })
}

export async function startOpsRun(input: {
  provider: SourceProvider
  scope: string
  resource: string
  trigger?: string
  requestJson?: string
}) {
  return prisma.opsSyncRun.create({
    data: {
      provider: input.provider,
      scope: input.scope,
      resource: input.resource,
      status: OpsRunStatus.RUNNING,
      trigger: input.trigger ?? "manual",
      requestJson: input.requestJson,
    },
  })
}

export async function completeOpsRun(
  runId: string,
  summary: unknown,
  status: OpsRunStatus = OpsRunStatus.SUCCESS
) {
  return prisma.opsSyncRun.update({
    where: { id: runId },
    data: {
      status,
      summaryJson: JSON.stringify(summary),
      finishedAt: new Date(),
    },
  })
}

export async function failOpsRun(
  runId: string,
  input: {
    provider: SourceProvider
    resource: string
    scopeId?: string
    message: string
    meta?: unknown
  }
) {
  await prisma.opsSyncFailure.create({
    data: {
      runId,
      provider: input.provider,
      resource: input.resource,
      scopeId: input.scopeId,
      message: input.message,
      metaJson: input.meta ? JSON.stringify(input.meta) : undefined,
    },
  })

  return prisma.opsSyncRun.update({
    where: { id: runId },
    data: {
      status: OpsRunStatus.ERROR,
      errorMessage: input.message,
      finishedAt: new Date(),
    },
  })
}

export async function updateCheckpoint(input: {
  provider: SourceProvider
  resource: string
  cursorKey: string
  value?: string
  meta?: unknown
}) {
  return prisma.opsSyncCheckpoint.upsert({
    where: {
      provider_resource_cursorKey: {
        provider: input.provider,
        resource: input.resource,
        cursorKey: input.cursorKey,
      },
    },
    update: {
      value: input.value,
      metaJson: input.meta ? JSON.stringify(input.meta) : undefined,
    },
    create: {
      provider: input.provider,
      resource: input.resource,
      cursorKey: input.cursorKey,
      value: input.value,
      metaJson: input.meta ? JSON.stringify(input.meta) : undefined,
    },
  })
}

export async function markDomainSyncState(input: {
  stateKey: string
  status: OpsRunStatus
  lastSourceUpdatedAt?: Date | null
  meta?: unknown
}) {
  return prisma.domainSyncState.upsert({
    where: { stateKey: input.stateKey },
    update: {
      status: input.status,
      lastProjectedAt: new Date(),
      lastSourceUpdatedAt: input.lastSourceUpdatedAt ?? undefined,
      metaJson: input.meta ? JSON.stringify(input.meta) : undefined,
    },
    create: {
      stateKey: input.stateKey,
      status: input.status,
      lastProjectedAt: new Date(),
      lastSourceUpdatedAt: input.lastSourceUpdatedAt ?? undefined,
      metaJson: input.meta ? JSON.stringify(input.meta) : undefined,
    },
  })
}