// ============================================================
// Fetch dengan retry otomatis untuk error jaringan/5xx.
// Berguna untuk API calls yang mungkin gagal sementara.
// ============================================================

export async function fetchWithRetry(
  url: string,
  options?: RequestInit & { retries?: number; retryDelay?: number }
): Promise<Response> {
  const { retries = 2, retryDelay = 1000, ...fetchOptions } = options ?? {};

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, fetchOptions);

      // Retry hanya untuk server error (5xx) dan 429 (rate limit)
      if (attempt < retries && (res.status >= 500 || res.status === 429)) {
        const delay = res.status === 429
          ? Math.min(Number(res.headers.get("retry-after") ?? "3") || 3, 10) * 1000
          : retryDelay * (attempt + 1);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      return res;
    } catch (e) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, retryDelay * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }

  throw new Error("fetchWithRetry: max retries exceeded");
}
