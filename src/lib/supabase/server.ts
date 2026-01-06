import { createClient } from "@supabase/supabase-js";

export function requireSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (required for server-side uploads)");
  }
  return { url, anonKey, serviceRoleKey };
}

export function createSupabaseAdminClient() {
  const { url, serviceRoleKey } = requireSupabaseEnv();
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function createSupabaseAnonClient() {
  const { url, anonKey } = requireSupabaseEnv();
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function createSupabaseUserClient(accessToken: string) {
  const { url, anonKey } = requireSupabaseEnv();
  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function requireUserFromAuthorizationHeader(req: Request) {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) throw new Error("Missing Authorization Bearer token");
  const token = m[1];
  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) throw new Error("Invalid session token");
  return { user: data.user, accessToken: token };
}


