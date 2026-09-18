"use client";

import { Camera, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiUpload } from "@/lib/api-client";
import { compressImage } from "@/lib/image-compress";

interface UploadedImage {
  url: string;
}

/**
 * Chụp ảnh minh chứng bằng camera sau của điện thoại, nén rồi tải ngay lên
 * Cloudinary qua API của hệ thống. onChange nhận URL ảnh đã lưu (null khi
 * chưa có ảnh hoặc đang tải lại).
 */
export function ProofPhotoInput({
  label,
  required,
  value,
  onChange,
  onUploadingChange,
}: {
  label: string;
  required?: boolean;
  value: string | null;
  onChange: (url: string | null) => void;
  onUploadingChange?: (uploading: boolean) => void;
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function handleFile(file: File | undefined): Promise<void> {
    if (!file) return;
    setError(null);
    setUploading(true);
    onUploadingChange?.(true);
    onChange(null);
    try {
      const compressed = await compressImage(file);
      setPreviewUrl(URL.createObjectURL(compressed));
      const form = new FormData();
      form.append("file", compressed, "proof.jpg");
      form.append("purpose", "delivery_proof");
      const image = await apiUpload<UploadedImage>("/api/uploads/images", form);
      onChange(image.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tải được ảnh");
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <p className="mb-2 text-[12px] font-medium">{label}{required ? <span className="text-dt-yellow"> *</span> : null}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      {previewUrl ? (
        <div className="relative overflow-hidden rounded-dt border border-dt-border bg-dt-panel2">
          {/* eslint-disable-next-line @next/next/no-img-element -- ảnh blob cục bộ, không qua next/image */}
          <img src={previewUrl} alt="Ảnh minh chứng vừa chụp" className="max-h-64 w-full object-contain" />
          <div className="flex items-center justify-between gap-2 border-t border-dt-border px-3 py-2 text-[12px]">
            <span className={uploading ? "flex items-center gap-1.5 text-dt-muted" : value ? "text-dt-green" : "text-red-300"}>
              {uploading ? <><Loader2 size={14} className="animate-spin" /> Đang tải ảnh lên...</> : value ? "Đã lưu ảnh" : "Chưa lưu được ảnh"}
            </span>
            <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} className="flex min-h-10 items-center gap-1.5 rounded-md px-3 text-dt-yellow disabled:opacity-50">
              <RefreshCw size={14} /> Chụp lại
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-dt border border-dashed border-dt-yellow/50 bg-dt-yellow/5 text-[13px] text-dt-yellow disabled:opacity-50"
        >
          <Camera size={26} />
          Chụp ảnh
        </button>
      )}
      {error ? <p role="alert" className="mt-2 flex items-start gap-1.5 text-[12px] text-red-300"><TriangleAlert size={14} className="mt-0.5 shrink-0" />{error}</p> : null}
    </div>
  );
}
