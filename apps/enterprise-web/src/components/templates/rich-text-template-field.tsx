"use client";

import dynamic from "next/dynamic";

import type { RichTextTemplateFieldProps } from "./rich-text-template-field-editor";

const RichTextTemplateFieldEditor = dynamic<RichTextTemplateFieldProps>(
  () =>
    import("./rich-text-template-field-editor").then(
      (module) => module.RichTextTemplateFieldEditor
    ),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-3">
        <div className="rounded-[1.5rem] border border-stone-200 bg-stone-50/85 p-5 text-sm text-stone-600">
          Loading template designer...
        </div>
      </div>
    )
  }
);

export function RichTextTemplateField(props: RichTextTemplateFieldProps) {
  return <RichTextTemplateFieldEditor {...props} />;
}
