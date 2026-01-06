import { NextResponse } from "next/server";
import { createSupabaseUserClient, requireUserFromAuthorizationHeader } from "@/lib/supabase/server";

export async function GET(req: Request) {
  let accessToken = "";
  let userId = "";
  try {
    const auth = await requireUserFromAuthorizationHeader(req);
    accessToken = auth.accessToken;
    userId = auth.user.id;
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const scope = (url.searchParams.get("scope") ?? "mine") as "mine" | "project";
  const projectId = url.searchParams.get("projectId");

  const supabase = createSupabaseUserClient(accessToken);
  if (scope === "project") {
    if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    const { data, error } = await supabase
      .from("project_sound_effects")
      .select("sound_effect_id, sound_effects:sound_effect_id(id,title,license,attribution,duration_sec,storage_path,storage_bucket,created_at)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ scope, results: data ?? [] });
  }

  const { data, error } = await supabase
    .from("sound_effects")
    .select("id,title,license,attribution,duration_sec,storage_bucket,storage_path,created_at")
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ scope, results: data ?? [] });
}


