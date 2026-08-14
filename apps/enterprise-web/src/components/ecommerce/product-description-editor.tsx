"use client";

import dynamic from "next/dynamic";

const ProductDescriptionEditorClient = dynamic(
  () => import("./product-description-editor-client").then((module) => module.ProductDescriptionEditorClient),
  {
    loading: () => <div style={{ minHeight: 260 }}>Loading editor...</div>,
    ssr: false
  }
);

export function ProductDescriptionEditor({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return <ProductDescriptionEditorClient onChange={onChange} value={value} />;
}
