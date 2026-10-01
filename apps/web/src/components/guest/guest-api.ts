export async function guestPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json() as { success: boolean; data?: T; error?: string };
  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.error ?? "Yêu cầu chưa thực hiện được.");
  }
  return result.data;
}
