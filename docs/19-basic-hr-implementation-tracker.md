# Flash ERP Basic HR Implementation Tracker

Updated: 2026-06-27

This tracker defines the first practical Human Resources module for Flash ERP. The target is a usable employee, attendance, leave, document, exit, and visitor-management foundation. It is intentionally not a full payroll, recruitment, performance, or biometric-attendance system.

## Status Legend

- Done: implemented and verified.
- In progress: currently being implemented.
- Next: the next recommended slice.
- Planned: scoped but not started.
- Blocked: waiting on a decision, dependency, or external fix.

## Current Checkpoint

- Status: Basic Human Resources, Visitor Management, HR reporting, full payroll, benefits, employee loans/advances, expense claims, and travel slices `035-050` are complete.
- Current slice: none active; the next HR expansion should be scoped from a new request.
- Existing Finance payroll GL mappings and posting batches are now the Finance-owned posting boundary used by approved HR payroll runs.
- HR department, position, employee, protected compensation, attendance, leave, document, employee-exit, visitor, reporting, statutory payroll, payroll-run, payslip, filing, benefits, loans/advances, expense claims, travel, and Finance-integration models plus their APIs, permissions, navigation, and focused workspaces are complete.
- Normal seed now creates eight practical baseline employee masters requested for operating and testing the HR workflows; it does not seed compensation, attendance, leave transactions, documents, exits, or visits.
- Existing company, currency, store/shop, user, Finance dimension, document-numbering, upload, audit, and permission patterns should be reused before adding new infrastructure.

## Scope Guardrails

- HR owns employee and organization records. Authentication users remain separate and may be linked optionally to employees.
- HR Department is the organization source of truth. Each active department can be mirrored to one Finance `DEPARTMENT` dimension for budgeting, payroll posting, and departmental reporting; users should not maintain the same department independently in two places.
- Employee records are company-scoped and may be assigned to a primary shop/site for operational reporting.
- Payroll now includes setup data, effective-dated statutory rules, gross-to-net calculation, run approval, payslips, statutory schedules/exports, filing status tracking, and Finance posting.
- Employee self-service, recruitment, advanced rostering, performance management, and external statutory-portal integrations are deferred.
- Attendance is manual-entry first, with integration hooks for biometric devices or imported time logs later.
- Leave is day-based in the basic release. Hourly leave and advanced accrual rules are deferred.
- HR documents store controlled metadata and a file link using the existing upload/storage pattern; sensitive files require HR permissions.
- Employee exits preserve history. Finalized employees and related HR transactions are not hard-deleted.
- Visitor Management uses active HR departments and employees for the person/department being visited.

## Planned Navigation

Human Resources:

- Overview
- Employees
- Departments & Positions
- Attendance
- Leave Management
- HR Documents
- Employee Exits
- Visitor Register
- Payroll
- Benefits
- Loans & Advances
- Expense Claims
- Travel

HR Reports are exposed from the central Reports page under the Human Resources category instead of remaining as a Human Resources sidebar item.

The Visitor Register should remain visible to authorized reception/security users without exposing salary, bank, statutory, or confidential employee-document data.

## Planned Permissions

| Permission | Purpose |
| --- | --- |
| `hr.view` | View non-sensitive employee and organization records. |
| `hr.organization.manage` | Maintain departments, positions, and employee categories. |
| `hr.employee.manage` | Create and update employee master records. |
| `hr.compensation.view` | View salary, allowance, deduction, statutory, and bank data. |
| `hr.compensation.manage` | Maintain payroll setup data without running payroll. |
| `hr.attendance.manage` | Enter and correct attendance records. |
| `hr.leave.manage` | Maintain leave types, balances, requests, and approvals. |
| `hr.document.manage` | Upload and maintain protected employee documents. |
| `hr.exit.manage` | Record and finalize employee exits. |
| `hr.visitor.view` | View the visitor register and visitors currently on premises. |
| `hr.visitor.manage` | Register, check in, check out, and cancel visits. |
| `hr.payroll.view` | View protected payroll runs, payslips, and statutory schedules. |
| `hr.payroll.manage` | Calculate and maintain payroll runs and statutory setup. |
| `hr.payroll.approve` | Approve, reopen, and post payroll runs. |
| `hr.payroll.file` | Mark statutory filings as filed or paid. |
| `hr.benefits.manage` | Maintain benefit plans and employee enrollments. |
| `hr.employee-finance.view` | View employee loans, advances, claims, and travel workflows. |
| `hr.employee-finance.manage` | Maintain employee finance requests and operational details. |
| `hr.employee-finance.approve` | Approve, reject, disburse, pay, or settle employee finance workflows. |

## Slice Board

| Slice | Status | Purpose | Acceptance Gate |
| --- | --- | --- | --- |
| 035. HR organization foundation | Done | Add the HR module shell, departments, positions, employee categories, department-to-Finance mapping, and permissions. | Organization setup is company-scoped, active HR departments supply dropdowns, and department Finance mappings do not create duplicate master data. |
| 036. Employee master and payroll setup data | Done | Add employee records, reporting lines, shop/site assignment, compensation setup, statutory IDs, and bank details. | Active and separated employees are traceable, sensitive data is permission-gated, and no payroll calculation is implied. |
| 037. Attendance foundation | Done | Capture daily manual attendance, lateness, absence, check-in/out, and overtime. | One auditable daily record per employee can be maintained and summarized by company, department, shop, employee, and date. |
| 038. Leave management foundation | Done | Add leave types, annual balances, requests, approval status, and balance consumption. | Requests cannot exceed applicable balance, approval history is retained, and maternity/paternity/sick/annual leave are supported. |
| 039. HR document register | Done | Store protected links and metadata for employment, identity, certificate, warning, and appraisal documents. | Documents can be filtered by employee/type/expiry and access is restricted to authorized HR users. |
| 040. Employee exit management | Done | Track resignation/termination, exit reason, settlement status, asset return, and finalization. | Exit workflow updates employee status without deleting history and incomplete settlement/asset return remains visible. |
| 041. Visitor management | Done | Register visitors and manage check-in, check-out, cancellation, host employee, and host department. | Reception can see who is on premises, departments load from HR, and timestamps/status transitions are audited. |
| 042. Basic HR reporting and completion gate | Done | Add HR overview metrics, operational reports, exports, audit review, and Payroll GL handoff readiness. | Basic HR reports reconcile to source records, permissions are verified, and schema/seed/typecheck/build gates pass. |
| 043. Payroll statutory foundation | Done | Add effective-dated Ghana PAYE, SSNIT, pension, filing-calendar, and employee statutory setup. | Statutory rates are configurable, source-referenced, effective-dated, and selected deterministically by payroll period. |
| 044. Payroll calculation and run control | Done | Calculate gross-to-net payroll from employee salary/pay items with protected run review and approval. | Employee totals reconcile to run totals and approved runs are immutable without an authorized reopen. |
| 045. Payslips and statutory filing | Done | Add printable payslips, PAYE/SSNIT/Tier-2 schedules, exports, due dates, and filed/paid tracking. | Payslips reconcile to run detail and filing schedules reconcile to statutory liabilities. |
| 046. Payroll Finance integration | Done | Post approved payroll expense, employee deductions, employer cost, net pay, and statutory liabilities through Finance. | Payroll creates one idempotent balanced Finance posting batch/journal and preserves source drilldown. |
| 047. Benefits administration | Done | Maintain benefit plans and employee enrollments with employee/employer contributions and payroll treatment. | Active enrollments calculate into payroll exactly once and Finance receives balanced benefit expense/liability impact. |
| 048. Employee loans and salary advances | Done | Manage approval, disbursement, outstanding balances, payroll recovery, and settlement. | Disbursements post employee receivables/cash and payroll repayments reduce both net pay and the receivable balance. |
| 049. Expense claims | Done | Capture itemized employee claims, approval, rejection, payment, and GL coding. | Paid claims post balanced expense/cash journals using approved lines and cannot be paid twice. |
| 050. Travel management | Done | Manage travel requests, approvals, advances, actual settlement, and variance tracking. | Travel advances and settlements remain traceable to employee advances, travel expense, cash, and payable balances. |

## 035. HR Organization Foundation

Status: Done

Implemented:

- Added company-scoped `ErpHrDepartment`, `ErpHrPosition`, and `ErpEmployeeCategory` models plus an idempotent SQL Server migration.
- Added stable department/position codes, active/inactive controls, self-referencing position reporting lines, and circular-hierarchy validation.
- Made HR Department the editable source and synchronized every HR department to exactly one Finance `DEPARTMENT` dimension.
- Seeded Permanent, Contract, Casual, and Intern employee categories without demo employees.
- Added employee and visitor document-number sequences with `EMP` and `VIS` prefixes.
- Added 11 HR permissions and seeded `HR_ADMIN`, `HR_OFFICER`, `HR_MANAGER`, and `VISITOR_RECEPTION` roles.
- Added server-authorized department, position, and employee-category APIs.
- Added a permission-aware Human Resources sidebar group and a compact tabbed Departments & Positions workspace.
- Kept department-head assignment reserved for the Employee Master slice instead of creating a duplicate person source.

Verified:

- `npm run prisma:format`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npx prisma db push --schema prisma/schema.prisma`
- `npm run build:domain`
- `npm run prisma:seed`
- `npm --workspace @flash-erp/domain run typecheck`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- Disposable live repository smoke confirmed department-to-Finance mapping and position reporting hierarchy, then removed the smoke records.
- Live seed smoke confirmed 11 HR permissions, four employee categories, employee/visitor numbering sequences, and the four HR/reception roles.
- Production build generated a completed `BUILD_ID` and route manifests for `/human-resources`, `/human-resources/organization`, and the three HR organization APIs.
- Route smoke on `http://localhost:3001/human-resources/organization` returned the expected sign-in redirect when unauthenticated.

Scope:

- Add a Human Resources navigation group and focused organization setup page.
- Add company-scoped department records with code, name, description, active status, and optional department head.
- Add company-scoped job positions with code, title, department, reports-to position, description, and active status.
- Add employee categories for `PERMANENT`, `CONTRACT`, `CASUAL`, and `INTERN`.
- Mirror each active HR department to one existing Finance dimension of type `DEPARTMENT`; HR remains the editable source for code, name, and status.
- Add document-number sequences needed for employee and visitor identifiers without hard-coded row counts.
- Add permission keys and role assignments for HR administration, HR operations, management approval, and visitor reception.
- Seed no employees in the organization-foundation slice itself; baseline employee masters may be added through the Employee Master slice when explicitly required.

Acceptance:

- Department and position codes are unique within a company.
- Positions can be filtered by department and inactive positions cannot be assigned to new employees.
- A department cannot map to more than one Finance department dimension and a Finance department dimension cannot be claimed by multiple HR departments in the same company.
- Department-head assignment supports the initial empty state and can be completed after employees exist.
- Navigation and APIs enforce permissions on the server, not only in the UI.
- Prisma format/validate/generate, database push or migration, seed, typecheck, and production build pass.

## 036. Employee Master and Payroll Setup Data

Status: Done

Implemented:

- Added company-scoped employee records with numbered employee IDs, personal/emergency contacts, employment status, department, position, category, reporting manager, shop assignment, optional login linkage, and department-head assignment.
- Added protected payroll setup for basic salary, active Finance currency, payment frequency, tax/SSNIT identifiers, bank details, and recurring fixed/percentage allowances and deductions.
- Added validation for active organization choices, same-company reporting managers, circular reporting lines, unique login links, and position-to-department alignment.
- Added permission-aware Employee Master APIs and a focused employee workspace with Personal, Employment, and Payroll Setup tabs; compensation fields are omitted unless the session has compensation permission.
- Kept payroll calculation and posting outside HR while preserving the existing Finance Payroll GL staging boundary.
- Seeded eight practical baseline employees across HR, Finance, Operations, and Sales, including valid positions, reporting managers, department heads, and one shop assignment, without payroll amounts or HR transactions.

Verified:

- Live repository smoke reserved `EMP-000003`, saved compensation and two recurring pay items, exposed compensation to an authorized workspace request, and removed all disposable employee records afterward.
- Seed check confirmed eight idempotent baseline employee masters and no disposable employee records.
- Prisma format/validate/generate, SQL Server database push, seed, domain build, enterprise typecheck, and production build passed.
- Production routes include `/human-resources/employees`, `/api/human-resources/employees`, and `/api/human-resources/employees/compensation`.

Scope:

- Add an employee master with employee number, first/middle/last/display name, gender, date of birth, phone, email, address, and emergency-contact details.
- Capture department, position, reporting manager, employee category, employment date, primary shop/site, salary type, and employment status.
- Support employment statuses `ACTIVE`, `RESIGNED`, `TERMINATED`, and `INACTIVE` with controlled transitions.
- Optionally link an employee to an existing application user without making every employee a login user.
- Add a protected payroll profile with basic salary, currency loaded from active `ErpCurrency` rows, payment frequency, tax ID, SSNIT ID, bank name, branch, account name, and account number.
- Add recurring allowance and deduction rows with code, description, fixed amount or percentage, effective dates, and active status.
- Keep payroll setup ready for the existing Finance Payroll GL staging contract without calculating or posting payroll yet.

Acceptance:

- Employee numbers are reserved using company document numbering and remain unique.
- Required department, position, category, employment date, salary type, and status values use controlled options.
- Reporting managers must be active employees in the same company.
- Position choices respect the selected department.
- Salary, statutory, and bank data is hidden unless the user has compensation permission.
- Employee directory and detail views clearly separate personal, employment, payroll setup, documents, leave, attendance, and exit information.

## 037. Attendance Foundation

Status: Done

Implemented:

- Added one company-scoped attendance record per employee/work date with present, late, absent, leave, and off-day statuses.
- Added manual check-in/out, late minutes, overtime hours, notes, employee department/shop snapshots, entry source, and entered/updated-by metadata.
- Added correction history with before/after JSON snapshots and changed-by timestamps.
- Added duplicate-day, time-order, active-employee, and non-negative lateness/overtime validation.
- Reworked attendance into a batch roster loaded by work date and any combination of department, position, and shop filters.
- Added row-level Present checkboxes, editable check-in/check-out times, late minutes, overtime, calculated work time, mark-all-present, default-time application, and one batch-save action.
- Merged previously saved records back into the roster so repeated loads preserve existing ticks and times while allowing further corrections.

Verified:

- Live repository smoke created attendance, corrected it from Present to Late, and confirmed two audit-history records with the final late/overtime values before cleanup.
- Batch smoke loaded two filtered employees, saved both rows, reloaded both saved entries, and confirmed an unchanged repeat save did not create spurious corrections.
- Production routes include `/human-resources/attendance` and `/api/human-resources/attendance`.
- Enterprise typecheck and production build passed.

Scope:

- Add daily attendance records by employee and work date.
- Capture attendance status, check-in time, check-out time, late minutes, overtime hours, note, entry source, and entered-by user.
- Support manual creation and correction with created/updated audit metadata.
- Provide daily and period grids filtered by company, department, shop, employee, date, and status.
- Prepare an import/integration reference without implementing biometric hardware.

Acceptance:

- Duplicate daily attendance for the same employee/date is prevented or handled as an audited correction.
- Check-out cannot be earlier than check-in and numeric lateness/overtime values cannot be negative.
- Absence, lateness, attendance, and overtime totals reconcile to detail records.
- Historical corrections preserve who changed the record and when.

## 038. Leave Management Foundation

Status: Done

Implemented:

- Added company leave types, annual employee entitlements, opening/allocated/adjusted/used/pending balances, and calculated available balances.
- Seeded Annual, Sick, Maternity, and Paternity leave types without employee transactions.
- Added draft/submitted/approved/rejected/cancelled request states, manager approver defaults, decision/cancellation metadata, overlap checks, gender eligibility, and balance reservation.
- Added exact-once pending-to-used balance movement on approval and balance release on rejection/cancellation.
- Added Leave Type, Entitlement, Request, and Decision APIs plus a tabbed Leave Management workspace.
- Moved Leave Type maintenance into `Settings > Leave Types`; the operational Leave page now stays focused on requests and balances.

Verified:

- Live repository smoke submitted and approved a two-day Annual Leave request, confirmed pending days returned to `0` and used days became `2`, then removed all disposable request/entitlement rows.
- Live seed check confirmed four active leave types and four active employee categories, with no disposable HR records.
- Production routes include `/human-resources/leave` and all four Leave Management API routes.
- Enterprise typecheck and production build passed.

Scope:

- Seed basic leave types for annual, sick, maternity, and paternity leave.
- Add annual employee leave entitlements with opening, accrued/allocated, used, pending, adjusted, and available balances.
- Add leave requests with start date, end date, requested days, reason, status, approver, approval date, decision note, and cancellation context.
- Support `DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, and `CANCELLED` states.
- Make department managers available as default approvers while preserving HR override permission.

Acceptance:

- Approved requests consume balance exactly once; rejected/cancelled requests do not consume balance.
- Pending requests reserve balance to prevent over-requesting.
- End date cannot precede start date and requests cannot overlap another active request for the same employee.
- Leave balance and request history are visible from the employee record and central Leave page.

## 039. HR Document Register

Status: Done

Implemented:

- Added protected employee-document metadata for employment letters, contracts, IDs, certificates, warnings, appraisals, and other HR records.
- Added private server-side file storage plus permission-checked streaming; document binaries are not stored in SQL Server or exposed through public asset URLs.
- Added upload and external-link validation, issue/expiry dates, reference numbers, notes, uploader audit data, and soft archive fields.
- Added central employee/type/status/expiry filters, expiry metrics, employee-level document links, and permission-aware open/edit/archive actions.

Verified:

- Live repository smoke created and soft-archived a protected document and confirmed its final status was `DELETED` before cleanup.
- Production routes include `/human-resources/documents` and the document create, upload, archive, and protected-file APIs.
- Prisma validation, SQL Server push, seed, enterprise typecheck, production build, and protected route smoke passed.

Scope:

- Add document metadata for employment letters, contracts, ID documents, certificates, warning letters, and appraisal documents.
- Capture employee, document type, title, document/reference number, issue date, expiry date, file name, file URL, note, uploaded by, and uploaded timestamp.
- Reuse the established upload/storage service and avoid storing binary files directly in SQL Server.
- Add employee-level and central document views with expiry filters.

Acceptance:

- Only authorized HR users can open protected document files or metadata.
- Required document type and file/link validations cannot be bypassed through the API.
- Expiring and expired documents can be filtered and reported.
- Removing a document record is soft/audited and does not silently erase employment history.

## 040. Employee Exit Management

Status: Done

Implemented:

- Added one preserved employee-exit record per employee with resignation/termination dates, reason, notes, settlement status, asset-return status, and confirmation metadata.
- Added draft save, finalization, and authorized reopen flows with date validation and read-only finalized records.
- Finalization changes the employee to `RESIGNED` or `TERMINATED`; reopening restores the previous status without deleting employee or exit history.
- Added incomplete-exit metrics, checklist visibility, and focused draft/finalized actions.

Verified:

- Live repository smoke finalized an exit, confirmed employee status `RESIGNED`, reopened it, and confirmed employee status returned to `ACTIVE` before cleanup.
- Production routes include `/human-resources/exits` and the exit save/action APIs.
- Enterprise typecheck, production build, and protected route smoke passed.

Scope:

- Add exit records for resignation and termination.
- Capture notice date, last working date, resignation date, termination date, exit reason, note, final-settlement status, asset-return status, confirmed by, and confirmed date.
- Support `NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, and `WAIVED` checklist statuses where applicable.
- Update employee status when an exit is finalized while preserving the employee record and history.

Acceptance:

- Resignation and termination dates are validated against employment date and last working date.
- Finalization requires an exit reason and explicit settlement/asset statuses.
- Finalized exits are read-only except through an authorized correction workflow.
- Separated employees are excluded from new attendance and leave entry by default but remain reportable.

## 041. Visitor Management

Status: Done

Implemented:

- Added numbered visitor visits with identity/contact details, organization, purpose, expected time, optional pass number, and active employee/department host choices.
- Added controlled `REGISTERED`, `CHECKED_IN`, `CHECKED_OUT`, and `CANCELLED` transitions with system-stamped times and immutable transition logs.
- Added reception metrics and filtered expected, on-premises, overdue, and history views without loading protected employee data.
- Kept visitor view/manage permissions separate from compensation, employee-document, and exit permissions.

Verified:

- Live repository smoke registered, checked in, and checked out a visit and confirmed three status-log rows before cleanup.
- Production routes include `/human-resources/visitors` and the visitor registration/action APIs.
- Seed, enterprise typecheck, production build, and protected route smoke passed.

Scope:

- Add visitor registration with visitor name, phone number, company/organization, ID type, ID number, purpose, host employee, and host department.
- Load host departments from active HR departments and host people from active employees.
- Capture check-in and check-out timestamps, visitor status, optional visitor/pass number, registered-by user, and cancellation reason.
- Support `REGISTERED`, `CHECKED_IN`, `CHECKED_OUT`, and `CANCELLED` states.
- Provide reception views for expected visitors, visitors currently on premises, visit history, and overdue check-outs.

Acceptance:

- A visit requires at least one valid host employee or host department.
- Check-in/check-out timestamps are system-stamped, with controlled correction permission and audit metadata.
- A checked-out or cancelled visit cannot be checked in again without a new visit record.
- Visitor screens do not expose employee compensation, bank, statutory, or confidential-document data.

## 042. Basic HR Reporting and Completion Gate

Status: Done

Implemented:

- Added Human Resources overview metrics for headcount, attendance, pending leave, document expiry, incomplete exits, and visitors on premises.
- Added exportable Employee Directory, Attendance, Leave Balance/History, HR Document Expiry, Employee Exit, Visitor Log, and permission-filtered audit grids.
- Added consistent department, site, and date filters while retaining compensation, document, and visitor permission boundaries.
- Moved HR Reports into the central Reports workspace under its own Human Resources category.
- Restored rounded HR/payroll controls so the newer module surfaces match the rest of the application.

Verified:

- Live reporting repository smoke reconciled eight report employees to eight active seeded employee masters.
- Production routes include `/human-resources` and `/human-resources/reports`.
- Prisma, seed, typecheck, production build, and protected route gates passed.

Scope:

- Add overview metrics for active headcount, department/category distribution, attendance today, absences/late arrivals, pending leave, upcoming document expiry, incomplete exits, and visitors on premises.
- Add exportable Employee Directory, Attendance Summary, Leave Balance/History, Employee Exit, HR Document Expiry, and Visitor Log reports.
- Confirm department dimensions and employee payroll setup can be referenced by future Payroll GL staging without duplicate employee masters.
- Add audit inquiry for sensitive compensation/document changes and visitor status changes.
- Complete navigation, permissions, empty states, validation messages, seed behavior, and implementation documentation.

Acceptance:

- Reports reconcile to source grids for the same company/date/filter scope.
- Shop/site and department filters are consistently enforced.
- Sensitive report columns require the same permissions as sensitive screens.
- Normal seed creates only the requested baseline employee masters; it creates no attendance, leave, payroll amounts, exits, documents, or visitors.
- Prisma format/validate/generate, database push or migration, seed, typecheck, production build, and route smoke gates pass.

## 043. Payroll Statutory Foundation

Status: Done

Implemented:

- Added effective-dated statutory rule sets and graduated monthly tax bands with source names and official-reference URLs.
- Seeded Ghana resident PAYE bands, non-resident and casual-worker rates, employee/employer pension rates, Tier-1/Tier-2 remittance shares, 2026 SSNIT insurable limits, and filing due days.
- Extended protected employee payroll setup with tax residency, monthly relief, pension status, Tier-2 trustee/member context, and taxable/pensionable pay-item flags.
- Added separate payroll view, manage, approve, and file permissions with HR role grants.

Scope:

- Add effective-dated statutory rule sets and graduated tax bands instead of hard-coding tax logic into payroll runs.
- Seed Ghana resident PAYE bands published by GRA, employee/employer pension contribution rates, mandatory Tier-2 allocation, 2026 SSNIT minimum/maximum insurable earnings, and filing due-day metadata.
- Extend protected employee payroll setup with tax residency, statutory relief, pension participation, and Tier-2 trustee context.

## 044. Payroll Calculation and Run Control

Status: Done

Implemented:

- Added numbered payroll runs with employee and component snapshots for basic pay, allowances, deductions, pensionable/insurable earnings, PAYE, SSNIT, Tier-2, employer cost, and net pay.
- Added calculation, deterministic statutory-version selection, recalculation, approval, authorized reopen, and posted-state locking.
- Added central payroll run and employee-result grids with permission-gated actions.

Scope:

- Add numbered payroll runs and employee-level calculation snapshots for basic pay, recurring earnings/deductions, taxable income, PAYE, SSNIT, Tier-2, employer cost, and net pay.
- Support draft calculation, recalculation, review, approval, reopen, and immutable posted states.
- Preserve component-level lines and the exact statutory rule-set version used by each run.

## 045. Payslips and Statutory Filing

Status: Done

Implemented:

- Added protected printable payslips for approved and posted payroll runs.
- Corrected protected payslip generation so existing calculated run-employee rows open as an unapproved payroll preview instead of falling through to a 404.
- Added PAYE, SSNIT, and Tier-2 filing schedules, CSV exports, due dates, liability totals, and filed/paid references.
- Kept external portal submission manual because no authorized GRA/SSNIT integration contract or credentials were supplied.

Scope:

- Add protected printable payslips and central payslip inquiry.
- Generate PAYE, SSNIT, and Tier-2 schedules with CSV exports, due dates, liability totals, filed/paid references, and status history.
- Keep portal submission manual unless an authorized GRA/SSNIT integration contract and credentials are supplied.

## 046. Payroll Finance Integration

Status: Done

Implemented:

- Converted approved payroll totals into the existing Finance Payroll GL batch contract using Finance-owned mappings.
- Posted gross payroll expense, employer pension expense, net-pay payable, PAYE, employee/other deductions, and employer pension liabilities through the shared accounting engine.
- Linked payroll run, posting batch, Finance journal, and statutory filing liabilities with idempotent post protection and journal drilldown.

Verified:

- Live disposable payroll smoke calculated GHS `11,000.00` gross, GHS `605.00` employee pension, GHS `2,197.25` PAYE, GHS `7,997.75` net pay, and GHS `1,430.00` employer pension.
- The smoke generated PAYE, SSNIT, and Tier-2 filing schedules and posted Finance journal `GL-000033` with debit and credit totals of GHS `12,430.00`; all disposable payroll, profile, pay-item, and journal rows were then removed.
- `npm run prisma:format`, `npm run prisma:validate`, `npm run prisma:generate`, `npx prisma db push --schema prisma/schema.prisma`, `npm run prisma:seed`, `npm run build:domain`, enterprise typecheck, and enterprise production build passed.
- Production routes include `/human-resources/payroll`, `/human-resources/payroll/payslips/[payrollRunEmployeeId]`, and all payroll rule/run/action/filing/export APIs.

Scope:

- Convert approved payroll totals into the existing Finance Payroll GL batch contract.
- Post salary/wage expense, employer pension cost, net-pay payable, PAYE payable, employee pension payable, and employer pension payable through the shared accounting engine.
- Make Finance posting idempotent and preserve payroll run, posting batch, journal, and filing-liability drilldown links.

## 047. Benefits Administration

Status: Done

Implemented:

- Added company-scoped benefit plans with fixed or percentage employee and employer contributions, provider references, effective dates, taxable/pensionable flags, and active controls.
- Added employee benefit enrollments with effective windows and payroll inclusion.
- Fed active benefit enrollments into payroll snapshots as employee benefit deductions, employer benefit cost, net-pay impact, and Finance benefit expense/liability mappings.

Verified:

- Live employee-finance smoke created a benefit plan/enrollment and confirmed payroll captured employee benefit deduction `5`.
- `npm run prisma:validate`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`
- Production routes include `/human-resources/benefits`, `/api/human-resources/benefits/plans`, and `/api/human-resources/benefits/enrollments`.

Scope:

- Add benefit plans and employee enrollments with fixed or percentage employee/employer contributions, effective dates, taxability, pensionability, and provider references.
- Feed active benefit contributions into payroll snapshots, net-pay deductions, employer cost, and Finance benefit expense/liability mappings.

## 048. Employee Loans and Salary Advances

Status: Done

Implemented:

- Added employee loan and salary-advance requests with approval/rejection, disbursement, installment amount, outstanding balance, and repayment history.
- Posted disbursements through Finance as employee advance receivable debit and selected cashbook account credit, with posted cashbook entries and journal drilldown.
- Applied payroll loan recoveries exactly once on payroll posting, reducing both employee net pay and the outstanding employee receivable balance.

Verified:

- Live employee-finance smoke approved/disbursed a salary advance, posted its Finance journal, posted payroll recovery `25`, and confirmed outstanding balance moved from `100` to `75` with one repayment row.
- `npm run prisma:validate`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`
- Production routes include `/human-resources/loans`, `/api/human-resources/loans`, and `/api/human-resources/loans/actions`.

Scope:

- Add employee loan/advance requests, approval, cashbook-backed disbursement, installment setup, outstanding balance, payroll recovery, and settlement history.
- Post disbursement to Employee Advances and cash, then post payroll recovery against the employee receivable exactly once.

## 049. Expense Claims

Status: Done

Implemented:

- Added itemized employee expense claims with expense date, category, description, GL expense account coding, amount, submit/approve/reject/pay states, and payment journal references.
- Posted paid claims through Finance as approved expense debits and selected cashbook account credits, with posted cashbook entries.
- Blocked unapproved, rejected, and already-paid claims from posting twice.

Verified:

- Live employee-finance smoke submitted, approved, and paid a disposable expense claim, then confirmed its balanced Finance journal before cleanup.
- `npm run prisma:validate`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`
- Production routes include `/human-resources/expense-claims`, `/api/human-resources/expense-claims`, and `/api/human-resources/expense-claims/actions`.

Scope:

- Add itemized employee expense claims with expense-account coding, evidence references, approval/rejection, payment account, and Finance journal links.
- Prevent rejected, unapproved, or already-paid claims from posting to Finance.

## 050. Travel Management

Status: Done

Implemented:

- Added employee travel requests with destination, purpose, dates, estimated amount, approval/rejection, cashbook-backed advances, actual expense lines, returned cash, and settlement journals.
- Posted travel advances through Finance to employee advances and cashbook, then settled actual travel expenses against the advance with payable or returned-cash handling as needed.
- Preserved travel advance, expense, returned cash, payable, and employee balance references for drilldown.

Verified:

- Live employee-finance smoke approved a travel request, issued an advance, settled actual expenses with returned cash, and confirmed balanced Finance journals before cleanup.
- `npm run prisma:validate`
- `npm --workspace @flash-erp/enterprise-web run typecheck`
- `npm --workspace @flash-erp/enterprise-web run build`
- Production routes include `/human-resources/travel`, `/api/human-resources/travel`, and `/api/human-resources/travel/actions`.

Scope:

- Add travel requests with destination, purpose, dates, estimated cost, approval, advance issue, actual settlement, returned amount, and Finance journal links.
- Keep travel advance, expense, employee payable, returned cash, and outstanding employee advance values reconcilable.

## Deferred Beyond Basic HR

- Recruitment, vacancies, applicants, interviews, and offers.
- Full onboarding/offboarding task orchestration.
- Shift scheduling, roster optimization, biometric clocks, and geofenced attendance.
- Performance appraisal workflows, goals, competencies, and review cycles.
- Training, certification programs, succession planning, and talent management.
- Employee/manager self-service portals and mobile HR.
- Visitor badge printing, access-control hardware, watchlists, and pre-registration links.

## Tracker Rules

- Update this tracker before starting each HR slice and after verification.
- Keep only one slice marked `Next` or `In progress` at a time.
- Check existing company, user, shop, Finance dimension, upload, numbering, audit, and permission patterns before creating any parallel implementation.
- Do not mark a slice Done until its schema, seed, typecheck, build, permission, and route gates pass when touched.
- Keep sensitive employee data out of logs, seed output, public APIs, and unrestricted exports.
- Reuse HR department and employee records everywhere host, manager, payroll, attendance, leave, document, and exit dropdowns are required.
