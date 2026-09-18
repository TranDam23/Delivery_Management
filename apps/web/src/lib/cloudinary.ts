import { createHash } from "node:crypto";

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  /** Thư mục gốc chứa ảnh của hệ thống trên Cloudinary. */
  rootFolder: string;
}

export interface CloudinaryUploadResult {
  url: string;
  public_id: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
}

/** Đọc cấu hình từ env; trả null nếu chưa khai báo đủ key. */
export function getCloudinaryConfig(): CloudinaryConfig | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) return null;
  const rootFolder = (process.env.CLOUDINARY_UPLOAD_FOLDER?.trim() || "delivertrust").replace(/^\/+|\/+$/g, "");
  return { cloudName, apiKey, apiSecret, rootFolder };
}

/**
 * Chữ ký cho Upload API: nối các tham số (trừ file, api_key, resource_type)
 * theo thứ tự alphabet dạng key=value&..., thêm API secret rồi băm SHA-1.
 */
function signParams(params: Record<string, string>, apiSecret: string): string {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(payload + apiSecret).digest("hex");
}

/** Tải ảnh lên Cloudinary bằng upload có chữ ký; API secret không rời server. */
export async function uploadImageToCloudinary(
  config: CloudinaryConfig,
  file: Blob,
  options: { folder: string; context?: Record<string, string> },
): Promise<CloudinaryUploadResult> {
  const params: Record<string, string> = {
    folder: `${config.rootFolder}/${options.folder}`,
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
  if (options.context && Object.keys(options.context).length > 0) {
    // Giá trị context không được chứa ký tự phân tách | và =.
    params.context = Object.entries(options.context)
      .map(([key, value]) => `${key}=${value.replace(/[|=]/g, "_")}`)
      .join("|");
  }

  const form = new FormData();
  form.append("file", file);
  for (const [key, value] of Object.entries(params)) form.append(key, value);
  form.append("api_key", config.apiKey);
  form.append("signature", signParams(params, config.apiSecret));

  const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  const payload = (await response.json().catch(() => null)) as
    | (Partial<CloudinaryUploadResult> & { secure_url?: string; error?: { message?: string } })
    | null;
  if (!response.ok || !payload?.secure_url || !payload.public_id) {
    throw new Error(payload?.error?.message ?? `Cloudinary trả lỗi ${response.status}`);
  }

  return {
    url: payload.secure_url,
    public_id: payload.public_id,
    width: Number(payload.width ?? 0),
    height: Number(payload.height ?? 0),
    bytes: Number(payload.bytes ?? 0),
    format: String(payload.format ?? ""),
  };
}

/**
 * Ảnh minh chứng chỉ chấp nhận URL do chính hệ thống tải lên Cloudinary,
 * không nhận link ảnh tùy ý từ Internet.
 */
export function isOwnCloudinaryImage(url: string, config: CloudinaryConfig | null = getCloudinaryConfig()): boolean {
  if (!config) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:"
      && parsed.hostname === "res.cloudinary.com"
      && parsed.pathname.startsWith(`/${config.cloudName}/image/upload/`)
      && parsed.pathname.includes(`/${config.rootFolder}/`);
  } catch {
    return false;
  }
}
