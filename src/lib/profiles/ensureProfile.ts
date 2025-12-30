"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function ensureProfile(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from("profiles").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) return; // fail open
  if (data) return;

  // Create an empty profile row the first time we see a user.
  await supabase.from("profiles").insert({ user_id: userId });
}


