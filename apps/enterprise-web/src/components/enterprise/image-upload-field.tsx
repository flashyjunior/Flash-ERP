"use client";

import { ImagePlus, LoaderCircle, Trash2, Upload } from "lucide-react";
import {
  type ChangeEvent,
  useId,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";

type UploadState =
  | {
      status: "idle";
      message: string;
    }
  | {
      status: "submitting" | "success" | "error";
      message: string;
    };

type ImageUploadFieldProps = {
  label: string;
  value: string;
  onChange: Dispatch<SetStateAction<string>> | ((nextValue: string) => void);
  uploadEndpoint: string;
  uploadSubjectLabel: string;
  placeholder?: string;
  className?: string;
  browseLabel?: string;
  clearLabel?: string;
  acceptedFileHelpText?: string;
  emptyTitle?: string;
  emptyDetail?: string;
  layout?: "split" | "stacked";
};

export function ImageUploadField({
  label,
  value,
  onChange,
  uploadEndpoint,
  uploadSubjectLabel,
  placeholder,
  className = "",
  browseLabel = "Browse image",
  clearLabel = "Clear image",
  acceptedFileHelpText = "Flash ERP accepts PNG, JPG, WEBP, GIF, and AVIF uploads up to 5 MB.",
  emptyTitle = "No image selected",
  emptyDetail = "Use browse to upload media into Flash ERP or paste an existing asset URL.",
  layout = "split"
}: ImageUploadFieldProps) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>({
    status: "idle",
    message: ""
  });

  async function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setUploadState({
      status: "submitting",
      message: `Uploading ${file.name} into Flash ERP ${uploadSubjectLabel} media...`
    });

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(uploadEndpoint, {
        method: "POST",
        body: formData
      });
      const payload = (await response.json()) as {
        url?: string;
        message?: string;
      };

      if (!response.ok || !payload.url) {
        throw new Error(payload.message ?? `Flash ERP could not upload the ${uploadSubjectLabel}.`);
      }

      onChange(payload.url);
      setUploadState({
        status: "success",
        message: payload.message ?? `${file.name} is now attached as the ${uploadSubjectLabel}.`
      });
    } catch (error) {
      setUploadState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : `Flash ERP could not upload the ${uploadSubjectLabel}.`
      });
    } finally {
      event.target.value = "";
    }
  }

  return (
    <div className={`space-y-2 ${className}`.trim()}>
      <span className="block text-sm font-semibold text-stone-900">{label}</span>
      <div
        className={
          layout === "stacked"
            ? "grid gap-3"
            : "grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_15rem]"
        }
      >
        <div className="space-y-3">
          <input
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            value={value}
          />
          <input
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            className="hidden"
            id={inputId}
            onChange={(event) => void handleFileSelection(event)}
            ref={fileInputRef}
            type="file"
          />
          <div className="flex flex-wrap gap-3">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-full border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900 transition hover:border-sky-400 hover:text-sky-950"
              disabled={uploadState.status === "submitting"}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              {uploadState.status === "submitting" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {browseLabel}
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
              disabled={uploadState.status === "submitting" || !value}
              onClick={() => onChange("")}
              type="button"
            >
              <Trash2 className="h-4 w-4" />
              {clearLabel}
            </button>
          </div>
          <p className="text-xs leading-5 text-stone-500">{acceptedFileHelpText}</p>
          {uploadState.message ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                uploadState.status === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : uploadState.status === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-sky-200 bg-sky-50 text-sky-800"
              }`}
            >
              {uploadState.message}
            </div>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-[1.35rem] border border-dashed border-stone-300 bg-stone-50">
          {value ? (
            <img
              alt={`${label} preview`}
              className={`${layout === "stacked" ? "min-h-36" : "min-h-52"} h-full w-full object-cover`}
              src={value}
            />
          ) : (
            <div
              className={`flex ${layout === "stacked" ? "min-h-36" : "min-h-52"} flex-col items-center justify-center gap-3 px-5 text-center text-stone-500`}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-stone-200 bg-white text-stone-500">
                <ImagePlus className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-700">{emptyTitle}</p>
                <p className="mt-1 text-xs leading-5 text-stone-500">{emptyDetail}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
