import { ChevronDown, FileText } from "lucide-react";
import Link from "next/link";

import { EnterpriseShell } from "@/components/layouts/enterprise-shell";

export function EnterpriseHrReportsCatalog() {
  return (
    <EnterpriseShell
      activeSection="reports"
      description="Choose a report group and open an export-ready workspace."
      eyebrow="HQ reporting"
      heading="Reports"
    >
      <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <details className="group/report max-w-xl" open>
          <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-sm font-semibold text-stone-950">
            <ChevronDown className="h-4 w-4 shrink-0 text-stone-500" />
            <span>Human Resources</span>
            <span className="ml-auto rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
              1
            </span>
          </summary>
          <ul className="mt-2 border-l border-stone-200 pl-5">
            <li>
              <Link
                className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-blue-700 transition hover:bg-blue-50 hover:text-blue-900"
                href="/human-resources/reports"
              >
                <FileText className="h-4 w-4 shrink-0 fill-stone-900 text-stone-900" />
                <span>HR operational reports</span>
              </Link>
            </li>
          </ul>
        </details>
      </section>
    </EnterpriseShell>
  );
}
