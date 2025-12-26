import { createClient } from "@supabase/supabase-js";

export function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return {
    url,
    anonKey,
    isConfigured: Boolean(url && anonKey),
  };
}

export function createSupabaseBrowserClient() {
  const { url, anonKey } = getSupabasePublicConfig();

  // Important: during `next build`, pages may be prerendered before env vars are configured.
  // We return a valid-but-placeholder client to avoid crashing the build; runtime UI will
  // guide the developer if config is missing.
  return createClient(url ?? "http://localhost:54321", anonKey ?? "public-anon-key", {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}


