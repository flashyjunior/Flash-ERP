import process from "node:process";

if (
  process.env.NODE_ENV === "production" ||
  process.env.FLASH_ERP_TRIAL_SAMPLE_DATA_TEST !== "true"
) {
  throw new Error(
    "The trial sample-data test worker requires a non-production runtime and explicit opt-in.",
  );
}

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
    retailOrgId: string;
    userId: string;
    actorLabel: string;
  };

  const { createTrialSampleData } = await import(
    "../apps/enterprise-web/src/server/trials/trial-sample-data"
  );

  console.log(JSON.stringify(await createTrialSampleData(input)));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
