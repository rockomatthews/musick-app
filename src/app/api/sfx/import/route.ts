import { NextResponse } from "next/server";
import type { SfxImportRequest, SfxImportResponse } from "@/lib/sfx/providers";
import { createSupabaseAdminClient, requireUserFromAuthorizationHeader } from "@/lib/supabase/server";

function guessExt(contentType: string | null, url: string) {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("audio/mpeg") || ct.includes("audio/mp3")) return "mp3";
  if (ct.includes("audio/wav") || ct.includes("audio/x-wav")) return "wav";
  if (ct.includes("audio/ogg")) return "ogg";
  if (ct.includes("audio/webm")) return "webm";
  const m = url.match(/\.([a-z0-9]{2,5})(\?|#|$)/i);
  return m ? m[1].toLowerCase() : "mp3";
}

export async function POST(req: Request) {
  let userId = "";
  try {
    const { user } = await requireUserFromAuthorizationHeader(req);
    userId = user.id;
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Partial<SfxImportRequest> | null;
  if (!body?.provider || !body?.providerItemId || !body?.title || !body?.previewUrl) {
    return NextResponse.json({ error: "Missing provider/providerItemId/title/previewUrl" }, { status: 400 });
  }
  if (body.provider !== "freesound" && body.provider !== "elevenlabs") {
    return NextResponse.json({ error: "Unsupported provider (MVP supports freesound/elevenlabs)" }, { status: 400 });
  }

  // Fetch remote bytes server-side so we don't expose provider keys or hit CORS issues.
  const remote = await fetch(body.previewUrl, { cache: "no-store" });
  if (!remote.ok) {
    const txt = await remote.text().catch(() => "");
    return NextResponse.json({ error: `Failed to fetch audio (${remote.status})`, details: txt }, { status: 502 });
  }
  const contentType = remote.headers.get("content-type");
  const ext = guessExt(contentType, body.previewUrl);
  const audioBuf = Buffer.from(await remote.arrayBuffer());

  const supabase = createSupabaseAdminClient();
  const storagePath = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("sound-effects")
    .upload(storagePath, audioBuf, {
      contentType: contentType ?? "application/octet-stream",
      upsert: false,
    });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: publicUrlData } = supabase.storage.from("sound-effects").getPublicUrl(storagePath);
  const publicUrl = publicUrlData.publicUrl;

  const tags = Array.isArray(body.tags) ? body.tags.map(String).slice(0, 40) : [];
  const durationSec = typeof body.durationSec === "number" ? body.durationSec : null;

  const { data: inserted, error: insErr } = await supabase
    .from("sound_effects")
    .insert({
      source: body.provider,
      source_id: String(body.providerItemId),
      title: String(body.title).slice(0, 200),
      license: body.license ?? null,
      attribution: body.attribution ?? null,
      source_url: body.sourceUrl ?? null,
      duration_sec: durationSec,
      tags,
      storage_bucket: "sound-effects",
      storage_path: storagePath,
      created_by: userId,
    })
    .select("id")
    .single();

  if (insErr || !inserted?.id) {
    // best-effort cleanup
    try {
      await supabase.storage.from("sound-effects").remove([storagePath]);
    } catch {
      // ignore
    }
    return NextResponse.json({ error: insErr?.message ?? "Failed to insert sound_effects row" }, { status: 500 });
  }

  if (body.projectId) {
    // Only project owners can attach (RLS policy). We use service role so we must enforce the rule here.
    const { data: proj } = await supabase.from("projects").select("owner_user_id").eq("id", body.projectId).maybeSingle();
    if (proj?.owner_user_id === userId) {
      await supabase.from("project_sound_effects").insert({
        project_id: body.projectId,
        sound_effect_id: inserted.id,
        created_by: userId,
      });
    }
  }

  const resp: SfxImportResponse = { soundEffectId: inserted.id, storagePath, publicUrl };
  return NextResponse.json(resp);
}


