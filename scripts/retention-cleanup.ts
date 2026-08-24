import "dotenv/config"
import { openDatabase } from "../src/db/client.js"

const DEFAULT_RETENTION_DAYS = 400
const DELETE_CONFIRMATION = "delete-expired-analytics"

function retentionDays(value: string | undefined): number {
  if (!value) return DEFAULT_RETENTION_DAYS
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 365 || parsed > 3_650) {
    throw new Error(
      "ANALYTICS_RETENTION_DAYS must be an integer from 365 to 3650"
    )
  }
  return parsed
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error("DATABASE_URL is required")
  const days = retentionDays(process.env.ANALYTICS_RETENTION_DAYS)
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const cutoffIso = cutoff.toISOString()
  const execute = process.argv.includes("--execute")
  const handle = openDatabase(databaseUrl)
  if (!handle) throw new Error("Unable to open database")

  try {
    const [
      invocationCount,
      activationCount,
      receiptCount,
      riskEvaluationCount,
    ] = await Promise.all([
      handle.sql<{ count: number }[]>`
        select count(*)::int as count from invocations where created_at < ${cutoffIso}::timestamptz
      `,
      handle.sql<{ count: number }[]>`
        select count(*)::int as count from activation_events where created_at < ${cutoffIso}::timestamptz
      `,
      handle.sql<{ count: number }[]>`
        select count(*)::int as count from usage_receipts where created_at < ${cutoffIso}::timestamptz
      `,
      handle.sql<{ count: number }[]>`
        select count(*)::int as count from risk_evaluations where created_at < ${cutoffIso}::timestamptz
      `,
    ])
    const report = {
      mode: execute ? "execute" : "dry-run",
      retention_days: days,
      cutoff: cutoff.toISOString(),
      expired_rows: {
        invocations: invocationCount[0]?.count ?? 0,
        activation_events: activationCount[0]?.count ?? 0,
        usage_receipts: receiptCount[0]?.count ?? 0,
        risk_evaluations: riskEvaluationCount[0]?.count ?? 0,
      },
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

    if (!execute) return
    if (
      process.env.ANALYTICS_RETENTION_DELETE_CONFIRM !== DELETE_CONFIRMATION
    ) {
      throw new Error(
        `Refusing deletion: set ANALYTICS_RETENTION_DELETE_CONFIRM=${DELETE_CONFIRMATION}`
      )
    }

    await handle.sql.begin(async (transaction) => {
      await transaction`delete from risk_evaluations where created_at < ${cutoffIso}::timestamptz`
      await transaction`delete from usage_receipts where created_at < ${cutoffIso}::timestamptz`
      await transaction`delete from activation_events where created_at < ${cutoffIso}::timestamptz`
      await transaction`delete from invocations where created_at < ${cutoffIso}::timestamptz`
    })
    process.stdout.write("Expired analytics rows deleted in one transaction.\n")
  } finally {
    await handle.close()
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  )
  process.exitCode = 1
})
