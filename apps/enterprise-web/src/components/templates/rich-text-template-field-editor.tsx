"use client";

import { Editor } from "@tinymce/tinymce-react";
import type { Editor as TinyMCEEditor } from "tinymce";
import { useMemo, useRef, useState } from "react";

import type { ThermalReceiptTemplateTokenDefinition } from "@/lib/templates/thermal-receipt-templates";

import "tinymce/tinymce";
import "tinymce/models/dom";
import "tinymce/icons/default";
import "tinymce/themes/silver";
import "tinymce/plugins/advlist";
import "tinymce/plugins/autolink";
import "tinymce/plugins/autoresize";
import "tinymce/plugins/fullscreen";
import "tinymce/plugins/help";
import "tinymce/plugins/link";
import "tinymce/plugins/lists";
import "tinymce/plugins/preview";
import "tinymce/plugins/searchreplace";
import "tinymce/plugins/table";
import "tinymce/plugins/visualblocks";
import "tinymce/plugins/wordcount";
import "tinymce/skins/ui/oxide/skin.js";
import "tinymce/skins/content/default/content.js";

export type RichTextTemplateFieldProps = {
  name: string;
  label: string;
  description?: string;
  tokens: ThermalReceiptTemplateTokenDefinition[];
  value: string;
  defaultTemplate: string;
  minHeight?: number;
  onValueChange?: (value: string) => void;
};

function groupTokens(tokens: ThermalReceiptTemplateTokenDefinition[]) {
  return tokens.reduce<Array<{ group: string; items: ThermalReceiptTemplateTokenDefinition[] }>>(
    (groups, token) => {
      const existingGroup = groups.find((entry) => entry.group === token.group);

      if (existingGroup) {
        existingGroup.items.push(token);
        return groups;
      }

      groups.push({
        group: token.group,
        items: [token]
      });

      return groups;
    },
    []
  );
}

export function RichTextTemplateFieldEditor({
  name,
  label,
  description,
  tokens,
  value,
  defaultTemplate,
  minHeight = 520,
  onValueChange
}: RichTextTemplateFieldProps) {
  const editorRef = useRef<TinyMCEEditor | null>(null);
  const [content, setContent] = useState(value);
  const tokenGroups = useMemo(() => groupTokens(tokens), [tokens]);

  function insertToken(token: string) {
    const tokenText = `{${token}}`;

    if (editorRef.current) {
      editorRef.current.focus();
      editorRef.current.insertContent(tokenText);
      return;
    }

    setContent((current) => {
      const nextValue = `${current}${tokenText}`;
      onValueChange?.(nextValue);
      return nextValue;
    });
  }

  function restoreDefaultTemplate() {
    setContent(defaultTemplate);
    editorRef.current?.setContent(defaultTemplate);
    onValueChange?.(defaultTemplate);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-sm font-medium text-stone-700">{label}</span>
          {description ? <p className="mt-1 text-sm text-stone-500">{description}</p> : null}
        </div>

        <button
          className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-700 transition hover:border-stone-500 hover:text-stone-950"
          onClick={restoreDefaultTemplate}
          type="button"
        >
          Restore starter
        </button>
      </div>

      <div className="rounded-[1.5rem] border border-stone-200 bg-stone-50/85">
        <div className="border-b border-stone-200 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
            Supported placeholders
          </p>
          <p className="mt-2 text-sm text-stone-600">
            Click any token to insert it into the receipt. Flash ERP resolves the values when the
            thermal slip is rendered on the desktop.
          </p>

          <div className="mt-4 space-y-4">
            {tokenGroups.map((group) => (
              <div key={group.group}>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  {group.group}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {group.items.map((token) => (
                    <button
                      className="inline-flex items-center gap-2 rounded-full border border-[var(--brand)]/25 bg-white px-3 py-1.5 text-xs font-semibold text-[var(--brand-deep)] transition hover:border-[var(--brand)] hover:bg-[var(--brand-glow)]"
                      key={token.token}
                      onClick={() => insertToken(token.token)}
                      title={token.description}
                      type="button"
                    >
                      <span>{`{${token.token}}`}</span>
                      <span className="text-stone-500">{token.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4">
          <Editor
            init={{
              autoresize_bottom_margin: 18,
              autoresize_overflow_padding: 16,
              branding: false,
              browser_spellcheck: true,
              content_style: `
                body {
                  font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
                  font-size: 14px;
                  line-height: 1.65;
                  color: #292524;
                  padding: 18px;
                }

                table {
                  border-collapse: collapse;
                  width: 100%;
                }

                td,
                th {
                  border: 1px solid rgba(87, 83, 78, 0.18);
                  padding: 10px 12px;
                  vertical-align: top;
                }
              `,
              height: minHeight,
              invalid_elements:
                "script,iframe,object,embed,form,input,button,textarea,select,option,meta,link",
              menubar: "file edit view insert format tools table help",
              plugins: [
                "advlist",
                "autolink",
                "autoresize",
                "fullscreen",
                "help",
                "link",
                "lists",
                "preview",
                "searchreplace",
                "table",
                "visualblocks",
                "wordcount"
              ],
              promotion: false,
              resize: true,
              statusbar: true,
              toolbar:
                "undo redo | blocks | bold italic underline | forecolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | link table | searchreplace visualblocks preview fullscreen | removeformat help",
              toolbar_mode: "sliding",
              valid_elements:
                "a[href|target|rel],br,div[style|align|class],em,i,hr,h1,h2,h3,h4,h5,h6,li,ol,p[style|align|class],span[style|class],strong,b,sub,sup,table[style|width|align|border|cellpadding|cellspacing|class],tbody,thead,tfoot,tr,td[style|width|colspan|rowspan|align|class],th[style|width|colspan|rowspan|align|class],u,ul"
            }}
            licenseKey="gpl"
            onEditorChange={(nextValue) => {
              setContent(nextValue);
              onValueChange?.(nextValue);
            }}
            onInit={(_, editor) => {
              editorRef.current = editor;
            }}
            rollback={false}
            textareaName={name}
            value={content}
          />
        </div>
      </div>
    </div>
  );
}
