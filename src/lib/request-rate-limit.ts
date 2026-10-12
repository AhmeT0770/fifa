import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "./supabase-admin";

type WindowEntry = { start: number; count: number };

declare global {
  // eslint-disable-next-line no-var
  var __fifa_rate_limits__: Map<string, WindowEntry> | undefined;
}

const requests = globalThis.__fifa_rate_limits__ ?? new Map<string, WindowEntry>();
globalThis.__fifa_rate_limits__ = requests;

type RateLimitResult = { allowed: boolean; retryAfter: number; configured: boolean };

function checkLocalLimit(request: Request, key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const headers = request.headers;
  const ip = headers.get("x-real-ip")
    || headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
    || "unknown";
  const bucketKey = `${key}:${ip}`;
  let entry = requests.get(bucketKey);

  if (!entry || now - entry.start >= windowMs) {
    entry = { start: now, count: 0 };
    requests.set(bucketKey, entry);
  }

  if (requests.size > 10_000) {
    for (const [storedKey, storedEntry] of requests) {
      if (now - storedEntry.start >= windowMs) requests.delete(storedKey);
    }
    if (requests.size > 10_000 && !requests.has(bucketKey)) {
      return { allowed: false, retryAfter: Math.ceil(windowMs / 1000), configured: true };
    }
  }

  if (entry.count >= limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((entry.start + windowMs - now) / 1000)),
      configured: true,
    };
  }

  entry.count += 1;
  return { allowed: true, retryAfter: 0, configured: true };
}

/** Uses the shared database in production and a small process-local window during local development. */
export async function checkRequestLimit(
  request: Request,
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    if (process.env.VERCEL) return { allowed: false, retryAfter: 60, configured: false };
    return checkLocalLimit(request, key, limit, windowMs);
  }

  const ip = request.headers.get("x-real-ip")
    || request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
    || "unknown";
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const addressHash = createHash("sha256").update(secret).update("\0").update(ip).digest("hex");
  const bucketKey = `${key}:${addressHash}`;
  const { data, error } = await supabase.rpc("check_app_rate_limit", {
    p_bucket_key: bucketKey,
    p_limit: limit,
    p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
  });

  if (error) throw new Error(`İstek limiti kontrol edilemedi: ${error.message}`);
  const result = data?.[0];
  if (!result) throw new Error("İstek limiti sonucu alınamadı.");
  return { allowed: result.allowed, retryAfter: result.retry_after, configured: true };
}
