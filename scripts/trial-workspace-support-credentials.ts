import path from "node:path";

import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "@prisma/client";
import { trialSupportLoginId } from "../packages/domain/src/trial-support.js";
import dotenv from "dotenv";

import { deriveTrialSupportPassword } from "./trial-support-credentials-core";

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });
}

const USAGE = `Usage: tsx scripts/trial-workspace-support-credentials.ts <workspace-slug | request-no | owner-email>

Prints the Flash support account credentials for one provisioned trial
workspace so Flash ERP staff can sign in and assist the customer.

Required environment:
  DATABASE_URL                          Control-plane SQL Server connection
  FLASH_ERP_TRIAL_PROVISIONER_SECRET    Shared secret used to derive passwords

Example:
  npx tsx scripts/trial-workspace-support-credentials.ts acme-retail-3fa1b2c9
`;

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    process.stderr.write(`${name} is required.\n\n${USAGE}`);
    process.exit(2);
  }
  return value;
}

async function main() {
  const lookup = process.argv[2]?.trim();
  if (!lookup) {
    process.stderr.write(USAGE);
    process.exit(2);
  }

  const controlUrl = requiredEnvironment("DATABASE_URL");
  const provisionerSecret = requiredEnvironment("FLASH_ERP_TRIAL_PROVISIONER_SECRET");
  const control = new PrismaClient({ adapter: new PrismaMssql(controlUrl) });

  try {
    const normalized = lookup.toLowerCase();
    const row = await control.trialSignupRequest.findFirst({
      where: {
        OR: [
          { workspaceSlug: lookup },
          { requestNo: lookup },
          { emailNormalized: normalized },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        requestNo: true,
        companyName: true,
        email: true,
        status: true,
        workspaceSlug: true,
        workspaceUrl: true,
        onlineStoreUrl: true,
        storefrontUrl: true,
        trialStartsAt: true,
        trialExpiresAt: true,
        failureCode: true,
        failureMessage: true,
      },
    });

    if (!row) {
      process.stderr.write(
        `No trial request matched "${lookup}". Check the workspace slug, request number, or owner email in the control-plane trial_signup_request table.\n`
      );
      process.exitCode = 1;
      return;
    }

    const line = (label: string, value: string | null | undefined) =>
      process.stdout.write(`${label.padEnd(24)} ${value ?? "-"}\n`);

    process.stdout.write("\n=== Flash ERP trial support access ===\n");
    line("Request", row.requestNo);
    line("Company", row.companyName);
    line("Owner email", row.email);
    line("Status", row.status);
    if (row.trialStartsAt) line("Trial starts", row.trialStartsAt.toISOString());
    if (row.trialExpiresAt) line("Trial expires", row.trialExpiresAt.toISOString());
    if (row.workspaceUrl) line("HQ workspace URL", row.workspaceUrl);
    if (row.onlineStoreUrl) line("Online store URL", row.onlineStoreUrl);
    if (row.storefrontUrl) line("Storefront URL", row.storefrontUrl);

    if (!row.workspaceSlug) {
      process.stdout.write(
        "\nThe workspace has not been allocated yet (status AWAITING_PROVISIONER/PROVISIONING). Retry once the request is ACTIVE.\n"
      );
      if (row.status === "FAILED") {
        process.stdout.write(`Failure: ${row.failureCode ?? "unknown"} - ${row.failureMessage ?? ""}\n`);
      }
      process.exitCode = row.status === "ACTIVE" ? 1 : 0;
      return;
    }

    const loginId = trialSupportLoginId(row.workspaceSlug);
    const password = deriveTrialSupportPassword(provisionerSecret, row.id);
    line("Support login ID", loginId);
    line("Support password", password);

    const now = new Date();
    if (row.status !== "ACTIVE" || !row.trialExpiresAt || row.trialExpiresAt.getTime() <= now.getTime()) {
      process.stdout.write(
        "\nWarning: this trial is not currently ACTIVE, so the support account is disabled and sign-in will be blocked.\n"
      );
    } else {
      process.stdout.write(
        `\nThe support account is protected: workspace users cannot modify it, change its password, or disable it,\n` +
          `and every sign-in is recorded in the workspace security log. The password stays valid until the trial\n` +
          `expires, and it never matches any other workspace (it is derived from this trial's request id).\n`
      );
    }
    process.stdout.write("\n");
  } finally {
    await control.$disconnect();
  }
}

main().catch(async (error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack || error.message : String(error)}\n`
  );
  process.exit(1);
});
