"use client";

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.8;

async function decodeImage(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // Xoay ảnh theo EXIF để ảnh chụp dọc từ điện thoại không bị nằm ngang.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Một số trình duyệt không hỗ trợ tùy chọn trên; thử cách dưới.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Thu nhỏ ảnh chụp từ camera (thường 3–12 MB) về cạnh dài tối đa 1600px, dạng
 * JPEG, để tải lên nhanh qua 4G. Không đọc được ảnh (ví dụ HEIC trên Chrome)
 * thì trả nguyên file cho server kiểm tra.
 */
export async function compressImage(file: File): Promise<Blob> {
  try {
    const source = await decodeImage(file);
    const width = "naturalWidth" in source ? source.naturalWidth : source.width;
    const height = "naturalHeight" in source ? source.naturalHeight : source.height;
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    if ("close" in source) source.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
