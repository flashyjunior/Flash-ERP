"use client";

import type { Dispatch, SetStateAction } from "react";

import { ImageUploadField } from "@/components/enterprise/image-upload-field";

type ProductImageFieldProps = {
  label: string;
  value: string;
  onChange: Dispatch<SetStateAction<string>> | ((nextValue: string) => void);
  placeholder?: string;
  className?: string;
};

export function ProductImageField({
  label,
  value,
  onChange,
  placeholder = "Upload a product image or paste an existing media URL",
  className = ""
}: ProductImageFieldProps) {
  return (
    <ImageUploadField
      className={className}
      emptyDetail="Use browse to upload media into Flash ERP or paste an existing asset URL."
      emptyTitle="No product image selected"
      label={label}
      onChange={onChange}
      placeholder={placeholder}
      uploadEndpoint="/api/catalog/product-media"
      uploadSubjectLabel="product image"
      value={value}
    />
  );
}
