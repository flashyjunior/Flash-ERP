import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

type QueryClassification = "BOUNDED" | "SCOPED" | "REFERENCE" | "UNBOUNDED" | "DYNAMIC";

type QueryRecord = {
  file: string;
  line: number;
  model: string;
  operation: "findMany" | "groupBy";
  classification: QueryClassification;
  hasTake: boolean;
  hasWhere: boolean;
  hasOrderBy: boolean;
};

const root = process.cwd();
const scanRoot = path.join(root, "apps", "enterprise-web", "src", "server");
const approvedReferenceQueries = new Set([
  "apps/enterprise-web/src/server/repositories/enterprise-security.repository.ts:permission.findMany",
  "apps/enterprise-web/src/server/repositories/store-sync.repository.ts:permission.findMany"
]);

function collectTypeScriptFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(absolutePath);
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")
      ? [absolutePath]
      : [];
  });
}

function propertyName(property: ts.ObjectLiteralElementLike) {
  if (!property.name) return null;
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
    return property.name.text;
  }
  return null;
}

function prismaModelName(expression: ts.Expression) {
  if (!ts.isPropertyAccessExpression(expression)) return "unknown";
  return expression.name.text;
}

function inspectSourceFile(filePath: string): QueryRecord[] {
  const content = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const records: QueryRecord[] = [];

  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      (node.expression.name.text === "findMany" || node.expression.name.text === "groupBy")
    ) {
      const operation = node.expression.name.text;
      const argument = node.arguments[0];
      const isObjectArgument = Boolean(argument && ts.isObjectLiteralExpression(argument));
      const properties = isObjectArgument
        ? (argument as ts.ObjectLiteralExpression).properties.map(propertyName).filter(Boolean)
        : [];
      const hasTake = properties.includes("take");
      const hasWhere = properties.includes("where");
      const hasOrderBy = properties.includes("orderBy");
      const relativeFile = path.relative(root, filePath).replaceAll("\\", "/");
      const model = prismaModelName(node.expression.expression);
      const queryKey = `${relativeFile}:${model}.${operation}`;
      const classification: QueryClassification = !isObjectArgument
        ? "DYNAMIC"
        : hasTake
          ? "BOUNDED"
          : hasWhere
            ? "SCOPED"
            : approvedReferenceQueries.has(queryKey)
              ? "REFERENCE"
              : "UNBOUNDED";
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

      records.push({
        file: relativeFile,
        line: position.line + 1,
        model,
        operation,
        classification,
        hasTake,
        hasWhere,
        hasOrderBy
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return records;
}

const records = collectTypeScriptFiles(scanRoot).flatMap(inspectSourceFile);
const counts = records.reduce<Record<QueryClassification, number>>(
  (summary, record) => {
    summary[record.classification] += 1;
    return summary;
  },
  { BOUNDED: 0, SCOPED: 0, REFERENCE: 0, UNBOUNDED: 0, DYNAMIC: 0 }
);
const reviewQueue = records.filter((record) =>
  ["SCOPED", "UNBOUNDED", "DYNAMIC"].includes(record.classification)
);
const evidence = {
  generatedAt: new Date().toISOString(),
  scanRoot: path.relative(root, scanRoot).replaceAll("\\", "/"),
  definitions: {
    BOUNDED: "The query has a direct take limit.",
    SCOPED: "The query has a where clause but no direct row limit.",
    REFERENCE: "The complete small reference registry is intentionally required.",
    UNBOUNDED: "The query has neither a direct where clause nor a direct row limit.",
    DYNAMIC: "The query arguments are not a directly inspectable object literal."
  },
  counts: {
    total: records.length,
    ...counts,
    reviewRequired: reviewQueue.length
  },
  records
};
const outputPath = path.resolve(
  process.env.FLASH_ERP_QUERY_AUDIT_OUTPUT_PATH ??
    "artifacts/capacity/enterprise-query-budget-audit.json"
);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

process.stdout.write(
  `Enterprise query budget audit: ${records.length} queries; ${counts.BOUNDED} bounded, ${counts.SCOPED} scoped, ${counts.REFERENCE} approved reference, ${counts.UNBOUNDED} unbounded, ${counts.DYNAMIC} dynamic.\n`
);
for (const record of reviewQueue.slice(0, 25)) {
  process.stdout.write(
    `${record.classification.padEnd(9)} ${record.file}:${record.line} ${record.model}.${record.operation}\n`
  );
}
if (reviewQueue.length > 25) {
  process.stdout.write(`... ${reviewQueue.length - 25} additional review item(s) are in the JSON evidence.\n`);
}
process.stdout.write(`Query-budget evidence written to ${outputPath}\n`);

if (
  process.env.FLASH_ERP_QUERY_AUDIT_FAIL_ON_UNBOUNDED === "1" &&
  (counts.UNBOUNDED > 0 || counts.DYNAMIC > 0)
) {
  process.exitCode = 1;
}
