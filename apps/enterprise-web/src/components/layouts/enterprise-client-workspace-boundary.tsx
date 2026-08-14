"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { EnterpriseShell } from "@/components/layouts/enterprise-shell";

export function EnterpriseClientWorkspaceBoundary({
  activeSection,
  children,
  description,
  eyebrow,
  heading
}: {
  activeSection: string;
  children: ReactNode;
  description: string;
  eyebrow: string;
  heading: string;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  if (ready) return children;

  return (
    <EnterpriseShell
      activeSection={activeSection}
      description={description}
      eyebrow={eyebrow}
      heading={heading}
    >
      <section
        aria-busy="true"
        aria-label={`Loading ${heading}`}
        className="flex min-h-72 items-center justify-center rounded-lg border border-stone-200 bg-white"
      >
        <LoaderCircle className="h-6 w-6 animate-spin text-stone-500" />
      </section>
    </EnterpriseShell>
  );
}
