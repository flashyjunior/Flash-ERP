import { activateTrialOwner } from "../apps/enterprise-web/src/server/trials/trial-owner-activation";

async function readInput() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
    token: string;
    password: string;
  };
}

async function main() {
  const input = await readInput();
  const result = await activateTrialOwner(input.token, input.password);
  if (!result.loginId) throw new Error("Trial owner activation did not return the login ID.");
  process.stdout.write(`${result.message}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
