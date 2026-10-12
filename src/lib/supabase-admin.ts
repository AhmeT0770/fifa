import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RankedDatabase } from "./supabase.types";

let cachedClient: SupabaseClient<RankedDatabase> | null = null;

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  cachedClient ??= createClient<RankedDatabase>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cachedClient;
}
