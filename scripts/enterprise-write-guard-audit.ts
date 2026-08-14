import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

type WriteRouteRecord = {
  file: string;
  line: number;
  method: string;
  guarded: boolean;
};

const root = process.cwd();
const routesRoot = path.join(root, "apps", "enterprise-web", "src", "app", "api");
const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function collectRouteFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectRouteFiles(absolutePath);
    return entry.isFile() && entry.name === "route.ts" ? [absolutePath] : [];
  });
}

function isExported(node: ts.Node & { modifiers?: ts.NodeArray<ts.ModifierLike> }) {
  return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function inspectRoute(filePath: string): WriteRouteRecord[] {
  const content = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const records: WriteRouteRecord[] = [];

  const addRecord = (method: string, node: ts.Node, body: ts.Node | undefined) => {
    if (!writeMethods.has(method) || !body) return;
    const bodyText = body.getText(sourceFile);
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    records.push({
      file: path.relative(root, filePath).replaceAll("\\", "/"),
      line: position.line + 1,
      method,
      guarded:
        bodyText.includes("runEnterpriseOperation") &&
        bodyText.includes('"TRANSACTIONAL_WRITE"')
    });
  };

  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      isExported(statement)
    ) {
      addRecord(statement.name.text, statement, statement.body);
      continue;
    }
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        const initializer = declaration.initializer;
        if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
          addRecord(declaration.name.text, declaration, initializer.body);
        }
      }
    }
  }

  return records;
}

const records = collectRouteFiles(routesRoot).flatMap(inspectRoute);
const guarded = records.filter((record) => record.guarded);
const unguarded = records.filter((record) => !record.guarded);
const evidence = {
  generatedAt: new Date().toISOString(),
  scanRoot: path.relative(root, routesRoot).replaceAll("\\", "/"),
  counts: {
    total: records.length,
    guarded: guarded.length,
    unguarded: unguarded.length
  },
  records
};
const outputPath = path.resolve(
  process.env.FLASH_ERP_WRITE_GUARD_AUDIT_OUTPUT_PATH ??
    "artifacts/capacity/enterprise-write-guard-audit.json"
);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
process.stdout.write(
  `Enterprise write guard audit: ${records.length} mutation handlers; ${guarded.length} guarded, ${unguarded.length} awaiting adoption.\n`
);
for (const record of unguarded.slice(0, 30)) {
  process.stdout.write(`${record.method.padEnd(6)} ${record.file}:${record.line}\n`);
}
if (unguarded.length > 30) {
  process.stdout.write(`... ${unguarded.length - 30} additional route(s) are in the JSON evidence.\n`);
}
process.stdout.write(`Write-guard evidence written to ${outputPath}\n`);

if (process.env.FLASH_ERP_WRITE_GUARD_FAIL_ON_UNGUARDED === "1" && unguarded.length > 0) {
  process.exitCode = 1;
}
