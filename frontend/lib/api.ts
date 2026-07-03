import type { ApiResponse, PaginationMeta } from "@/lib/types"

// Thin fetch wrapper over the backend REST API. All calls go through the
// Next.js rewrite (/api/v1/* -> FastAPI on :8031) so the browser stays
// same-origin and no CORS setup is needed.
const BASE = "/api/v1"

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T; meta?: PaginationMeta }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.error ?? body.detail ?? detail
    } catch {
      // non-JSON error body — keep statusText
    }
    throw new ApiError(detail, res.status)
  }
  const body = (await res.json()) as ApiResponse<T>
  if (body.success === false) throw new ApiError(body.error ?? "请求失败", res.status)
  return { data: body.data, meta: body.meta }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
}
