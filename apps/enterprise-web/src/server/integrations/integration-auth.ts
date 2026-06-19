import {
  assertEnterprisePermission,
  EnterpriseAuthError
} from "@/server/auth/enterprise-session";

type IntegrationPrincipal = {
  authType: "api-key" | "session";
  principal: string;
};

function configuredApiKeys() {
  return [
    process.env.FLASH_ERP_INTEGRATION_API_KEY,
    ...(process.env.FLASH_ERP_INTEGRATION_API_KEYS ?? "").split(",")
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";

  if (/^bearer\s+/i.test(authorization)) {
    return authorization.replace(/^bearer\s+/i, "").trim();
  }

  return "";
}

export async function assertIntegrationApiAccess(
  request: Request,
  requiredPermissions = ["operations.dashboard.view"]
): Promise<IntegrationPrincipal> {
  const suppliedApiKey = request.headers.get("x-api-key")?.trim() || readBearerToken(request);
  const apiKeys = configuredApiKeys();

  if (apiKeys.length > 0 && suppliedApiKey && apiKeys.includes(suppliedApiKey)) {
    return {
      authType: "api-key",
      principal: "integration-api-key"
    };
  }

  try {
    const session = await assertEnterprisePermission(requiredPermissions, { any: true });

    return {
      authType: "session",
      principal: session.loginId
    };
  } catch (error) {
    if (apiKeys.length > 0) {
      throw new EnterpriseAuthError("Provide a valid Flash ERP integration API key.", 401);
    }

    throw error;
  }
}
