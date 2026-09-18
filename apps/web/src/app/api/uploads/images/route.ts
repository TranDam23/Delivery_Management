import type { NextRequest } from "next/server";
import { RoleCode } from "@delivery/shared";
import { fail, ok } from "@/lib/api-response";
import { getAuthFromRequest } from "@/lib/auth";
import { getCloudinaryConfig, uploadImageToCloudinary } from "@/lib/cloudinary";

/** Ảnh đã được client nén; chặn file lớn để không đầy bộ nhớ server. */
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

/** Mục đích ảnh quyết định thư mục lưu và vai trò được phép tải. */
const PURPOSES: Record<string, { folder: string; roles: RoleCode[] }> = {
  delivery_proof: { folder: "delivery-proofs", roles: [RoleCode.DELIVERY_STAFF, RoleCode.ADMIN] },
};

/**
 * POST /api/uploads/images — tải một ảnh lên Cloudinary (multipart/form-data).
 * Trường: file (ảnh), purpose (mặc định delivery_proof). Trả về URL để gửi
 * kèm các API nghiệp vụ, ví dụ image_url của mốc giao hàng.
 */
export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  if (!auth) return fail("Unauthorized", 401);

  const config = getCloudinaryConfig();
  if (!config) {
    return fail("Máy chủ chưa cấu hình Cloudinary (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)", 503);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Dữ liệu tải lên phải ở dạng multipart/form-data", 400);
  }

  const purposeKey = String(form.get("purpose") ?? "delivery_proof");
  const purpose = PURPOSES[purposeKey];
  if (!purpose) return fail("Mục đích tải ảnh không hợp lệ", 400);
  if (!purpose.roles.includes(auth.roleCode)) return fail("Forbidden", 403);

  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) return fail("Chưa chọn ảnh", 400);
  if (!ALLOWED_TYPES.has(file.type)) return fail("Chỉ nhận ảnh JPG, PNG, WEBP hoặc HEIC", 400);
  if (file.size > MAX_BYTES) return fail("Ảnh vượt quá 8 MB", 400);

  const month = new Date().toISOString().slice(0, 7);
  try {
    const image = await uploadImageToCloudinary(config, file, {
      folder: `${purpose.folder}/${month}`,
      context: { uploaded_by: auth.userId, role: auth.roleCode },
    });
    return ok(image, 201);
  } catch (error) {
    console.error("Cloudinary upload failed", error);
    return fail(error instanceof Error ? `Không tải được ảnh: ${error.message}` : "Không tải được ảnh", 502);
  }
}
