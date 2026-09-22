SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'[dbo].[Permission]', N'U') IS NULL
   OR OBJECT_ID(N'[dbo].[Role]', N'U') IS NULL
   OR OBJECT_ID(N'[dbo].[RolePermission]', N'U') IS NULL
BEGIN
    THROW 51000, 'Permission, Role, and RolePermission must exist before navigation permissions are seeded.', 1;
END;

DECLARE @Now DATETIME2 = SYSUTCDATETIME();
DECLARE @PermissionSeed TABLE (
    [code] NVARCHAR(1000) NOT NULL PRIMARY KEY,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000) NULL
);

INSERT INTO @PermissionSeed ([code], [name], [description])
VALUES
    (N'ecommerce.console.access', N'Access ecommerce staff console', N'Open and operate customer orders, catalog publication, payment options, and storefront setup.'),
    (N'fuel.dip.capture', N'Capture tank dips', N'Capture station tank dip readings and required fuel evidence.'),
    (N'fuel.meter-reading.capture', N'Capture meter readings', N'Capture station nozzle meter readings and required fuel evidence.'),
    (N'fuel.reconciliation.manage', N'Manage station fuel reconciliation', N'Run station fuel daily reconciliation from tank, dip, receipt, and meter activity.'),
    (N'fuel.station.view', N'View station fuel operations', N'Open the online-store fuel operations workspace for station-side fuel capture.'),
    (N'fuel.supplier-receipt.capture', N'Capture supplier fuel receipts', N'Record supplier fuel receipts into station tanks from the online-store fuel workspace.'),
    (N'fuel.tank.manage', N'Manage station fuel tanks', N'Create and maintain station fuel tank records from the online-store fuel workspace.'),
    (N'hr.document.manage', N'Manage HR documents', N'Upload and maintain protected employee document metadata and files.'),
    (N'hr.employee-finance.view', N'View employee finance workflows', N'View employee loans, salary advances, expense claims, travel, and their Finance references.'),
    (N'hr.leave.manage', N'Manage leave', N'Maintain leave types, balances, requests, approvals, rejection, and cancellation.'),
    (N'hr.payroll.view', N'View payroll', N'View protected payroll runs, employee calculations, payslips, and statutory filings.'),
    (N'hr.view', N'View human resources', N'View non-sensitive employee, organization, attendance, leave, exit, and visitor information.'),
    (N'hr.visitor.view', N'View visitor register', N'View expected visitors, visitors currently on premises, and visit history.'),
    (N'inventory.view', N'View inventory', N'View inventory posture, balances, counts, and serial state.'),
    (N'master.bank.manage', N'Manage banks', N'Create and maintain bank, branch, and account-number setup for banking and non-cash settlement.'),
    (N'master.category.manage', N'Manage categories', N'Create and maintain product categories under departments.'),
    (N'master.customer.manage', N'Manage customers', N'Create and maintain customer masters, account posture, and customer setup.'),
    (N'master.department.manage', N'Manage departments', N'Create and maintain top-level product departments.'),
    (N'master.loyalty.manage', N'Manage loyalty', N'Maintain loyalty earning, redemption policy, and loyalty setup.'),
    (N'master.product.manage', N'Manage products', N'Create and maintain product masters, attributes, pricing posture, and serial rules.'),
    (N'master.promotion.manage', N'Manage promotions', N'Maintain promotion and discount policies.'),
    (N'master.store.manage', N'Manage stores', N'Create and maintain stores, warehouse-enabled sites, and terminals.'),
    (N'master.supplier.manage', N'Manage suppliers', N'Create and maintain supplier masters and sourcing posture.'),
    (N'master.tax.manage', N'Manage tax', N'Create and maintain enterprise tax profiles and defaults.'),
    (N'master.tender.manage', N'Manage tenders', N'Create and maintain tender methods, refund rules, and drawer rules.'),
    (N'operations.dashboard.view', N'View operations dashboard', N'View operational dashboards and estate-level health posture.'),
    (N'pos.sale.process', N'Process sales', N'Capture normal sales and complete baskets at POS.'),
    (N'security.audit-log.view', N'View audit logs', N'View security and administrative audit activity.'),
    (N'security.data-purge.execute', N'Purge enterprise data', N'Irreversibly delete transactional and selected master data for the whole organisation.'),
    (N'security.log.view', N'View security logs', N'Review security-specific warnings, alerts, and events.'),
    (N'security.online-user.view', N'View online users', N'View currently active branch operator sessions and open-shift operators.'),
    (N'security.password-policy.manage', N'Manage password policy', N'Set password complexity, lockout, and session timeout policy.'),
    (N'security.privilege.manage', N'Manage privileges', N'Assign granular privileges to roles and control effective access posture.'),
    (N'security.role.manage', N'Manage roles', N'Create and maintain security roles.'),
    (N'security.user.manage', N'Manage security users', N'Create and maintain centrally managed retail-user accounts.'),
    (N'settings.company.manage', N'Manage company settings', N'Update company profile, identity, and enterprise-level company settings.'),
    (N'settings.ldap.manage', N'Manage LDAP settings', N'Configure enterprise LDAP connectivity, sync posture, and directory mappings.'),
    (N'settings.license.manage', N'Manage licensing', N'View and manage enterprise shop, node, and terminal licensing.'),
    (N'settings.receipt-template.manage', N'Manage receipt templates', N'Design and publish thermal receipt templates for stores.'),
    (N'settings.retail-user.manage', N'Manage retail users', N'Maintain retail-user profiles, home stores, and operational assignment.'),
    (N'settings.sms.manage', N'Manage SMS settings', N'Configure enterprise SMS providers, sender IDs, and delivery reporting.'),
    (N'settings.smtp.manage', N'Manage SMTP settings', N'Configure enterprise SMTP credentials and outbound messaging defaults.'),
    (N'sync.monitor', N'Monitor sync', N'Review sync topology, queue posture, and node health.');

BEGIN TRANSACTION;

MERGE [dbo].[Permission] WITH (HOLDLOCK) AS [target]
USING @PermissionSeed AS [source]
ON [target].[code] = [source].[code]
WHEN MATCHED THEN
    UPDATE SET
        [target].[name] = [source].[name],
        [target].[description] = [source].[description],
        [target].[updatedAt] = @Now
WHEN NOT MATCHED THEN
    INSERT ([id], [code], [name], [description], [createdAt], [updatedAt])
    VALUES (CONVERT(NVARCHAR(36), NEWID()), [source].[code], [source].[name], [source].[description], @Now, @Now);

INSERT INTO [dbo].[RolePermission] ([roleId], [permissionId], [createdAt])
SELECT
    [role].[id],
    [permission].[id],
    @Now
FROM [dbo].[Role] AS [role]
CROSS JOIN @PermissionSeed AS [seed]
INNER JOIN [dbo].[Permission] AS [permission]
    ON [permission].[code] = [seed].[code]
WHERE [role].[code] = N'HQ_ADMIN'
  AND NOT EXISTS (
      SELECT 1
      FROM [dbo].[RolePermission] AS [existing]
      WHERE [existing].[roleId] = [role].[id]
        AND [existing].[permissionId] = [permission].[id]
  );

INSERT INTO [dbo].[RolePermission] ([roleId], [permissionId], [createdAt])
SELECT
    [role].[id],
    [permission].[id],
    @Now
FROM [dbo].[Role] AS [role]
INNER JOIN [dbo].[Permission] AS [permission]
    ON [permission].[code] = N'settings.license.manage'
WHERE [role].[code] = N'FLASH_SUPPORT'
  AND NOT EXISTS (
      SELECT 1
      FROM [dbo].[RolePermission] AS [existing]
      WHERE [existing].[roleId] = [role].[id]
        AND [existing].[permissionId] = [permission].[id]
  );

DELETE [grant]
FROM [dbo].[RolePermission] AS [grant]
INNER JOIN [dbo].[Role] AS [role]
    ON [role].[id] = [grant].[roleId]
INNER JOIN [dbo].[Permission] AS [permission]
    ON [permission].[id] = [grant].[permissionId]
WHERE [role].[code] = N'FLASH_SUPPORT'
  AND [permission].[code] NOT IN (
      N'operations.dashboard.view',
      N'master.customer.manage',
      N'master.supplier.manage',
      N'master.tax.manage',
      N'master.tender.manage',
      N'master.bank.manage',
      N'master.department.manage',
      N'master.category.manage',
      N'master.product.manage',
      N'master.store.manage',
      N'master.loyalty.manage',
      N'master.promotion.manage',
      N'settings.company.manage',
      N'settings.ldap.manage',
      N'settings.smtp.manage',
      N'settings.sms.manage',
      N'settings.license.manage',
      N'settings.receipt-template.manage',
      N'settings.retail-user.manage',
      N'settings.option.manage',
      N'inventory.view',
      N'sync.monitor',
      N'ecommerce.console.access'
  );

COMMIT TRANSACTION;
