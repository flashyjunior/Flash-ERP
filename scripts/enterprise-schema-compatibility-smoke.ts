import {
  isEnterpriseSqlServerDatabase,
  prisma
} from "../apps/enterprise-web/src/lib/db/prisma";
import { ensureInventoryLocationSalesOrderSchemaCompatibility } from "../apps/enterprise-web/src/server/repositories/schema-compatibility.repository";

async function main() {
  delete process.env.DATABASE_URL;

  if (!isEnterpriseSqlServerDatabase()) {
    throw new Error("The enterprise datasource was not detected as SQL Server.");
  }

  await ensureInventoryLocationSalesOrderSchemaCompatibility();
  console.log("Enterprise SQL Server schema compatibility smoke passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
