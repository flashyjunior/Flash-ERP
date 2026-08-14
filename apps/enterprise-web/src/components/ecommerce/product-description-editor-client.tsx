"use client";

import { Editor } from "@tinymce/tinymce-react";

import "tinymce/tinymce";
import "tinymce/models/dom";
import "tinymce/icons/default";
import "tinymce/themes/silver";
import "tinymce/plugins/advlist";
import "tinymce/plugins/autolink";
import "tinymce/plugins/link";
import "tinymce/plugins/lists";
import "tinymce/plugins/wordcount";
import "tinymce/skins/ui/oxide/skin.js";
import "tinymce/skins/content/default/content.js";

export function ProductDescriptionEditorClient({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Editor
      init={{
        branding: false,
        browser_spellcheck: true,
        content_style: `
          body {
            font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
            font-size: 14px;
            line-height: 1.65;
            color: #17251d;
            padding: 14px;
          }
        `,
        height: 260,
        invalid_elements: "script,iframe,object,embed,form,input,button,textarea,select,option,meta,link,img,video,audio",
        menubar: false,
        plugins: ["advlist", "autolink", "link", "lists", "wordcount"],
        promotion: false,
        resize: true,
        statusbar: true,
        toolbar:
          "undo redo | blocks | bold italic underline | bullist numlist outdent indent | link | removeformat",
        toolbar_mode: "sliding",
        valid_elements:
          "a[href|target|rel],blockquote,br,em,i,hr,h2,h3,h4,li,ol,p,strong,b,u,ul"
      }}
      licenseKey="gpl"
      onEditorChange={onChange}
      rollback={false}
      value={value}
    />
  );
}
