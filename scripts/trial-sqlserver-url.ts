export type SqlServerConnection = {
  server: string;
  port?: number;
  database: string;
  user: string;
  password: string;
  encrypt: string;
  trustServerCertificate: string;
};

function parseEndpoint(value: string) {
  const endpoint = value.trim();
  const bracketed = endpoint.match(/^\[([^\]]+)](?::(\d+))?$/);
  const delimited = endpoint.match(/^([^:,]+)[:,](\d+)$/);
  const match = bracketed || delimited;
  if (!match) return { server: endpoint };
  if (!match[2]) return { server: match[1] };

  const port = Number.parseInt(match[2], 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("The trial SQL Server URL contains an invalid port.");
  }
  return { server: match[1], port };
}

function prismaEndpoint(input: SqlServerConnection) {
  const server = input.server.includes(":") ? `[${input.server}]` : input.server;
  return input.port ? `${server}:${input.port}` : server;
}

function mssqlEndpoint(input: SqlServerConnection) {
  return input.port ? `${input.server},${input.port}` : input.server;
}

export function parseSqlServerUrl(value: string): SqlServerConnection {
  const trimmed = value.trim().replace(/^"|"$/g, "");
  const body = trimmed.replace(/^sqlserver:\/\//i, "");
  const [rawEndpoint, ...parts] = body.split(";");
  const values = new Map<string, string>();
  for (const part of parts) {
    const separator = part.indexOf("=");
    if (separator > 0) {
      values.set(part.slice(0, separator).trim().toLowerCase(), part.slice(separator + 1));
    }
  }

  const endpoint = parseEndpoint(
    rawEndpoint || values.get("server") || values.get("data source") || ""
  );
  if (!endpoint.server) throw new Error("The trial SQL Server URL does not contain a server.");

  return {
    ...endpoint,
    database: values.get("database") ?? values.get("initial catalog") ?? "",
    user: values.get("user") ?? values.get("user id") ?? values.get("uid") ?? "",
    password: values.get("password") ?? values.get("pwd") ?? "",
    encrypt: values.get("encrypt") ?? "false",
    trustServerCertificate:
      values.get("trustservercertificate") ?? values.get("trust server certificate") ?? "true"
  };
}

export function prismaSqlServerUrl(input: SqlServerConnection) {
  return [
    `sqlserver://${prismaEndpoint(input)}`,
    `database=${input.database}`,
    input.user ? `user=${input.user}` : "",
    input.password ? `password=${input.password}` : "",
    `encrypt=${input.encrypt}`,
    `trustServerCertificate=${input.trustServerCertificate}`
  ]
    .filter(Boolean)
    .join(";");
}

export function mssqlConnectionString(input: SqlServerConnection) {
  return [
    `Server=${mssqlEndpoint(input)}`,
    `Database=${input.database}`,
    input.user ? `User Id=${input.user}` : "",
    input.password ? `Password=${input.password}` : "",
    `Encrypt=${input.encrypt}`,
    `TrustServerCertificate=${input.trustServerCertificate}`
  ]
    .filter(Boolean)
    .join(";");
}
