import { NextResponse } from "next/server";
import { createSupabaseAdminClient, requireUserFromAuthorizationHeader } from "@/lib/supabase/server";

function guessExt(contentType: string | null) {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("audio/mpeg") || ct.includes("audio/mp3")) return "mp3";
  if (ct.includes("audio/wav") || ct.includes("audio/x-wav")) return "wav";
  if (ct.includes("audio/ogg")) return "ogg";
  if (ct.includes("audio/webm")) return "webm";
  return "mp3";
}

export async function POST(req: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing ELEVENLABS_API_KEY" }, { status: 501 });
  }

  let userId = "";
  try {
    const { user } = await requireUserFromAuthorizationHeader(req);
    userId = user.id;
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as any;
  const text = String(body?.text ?? "").trim();
  const durationSeconds = Math.max(0.5, Math.min(22, Number(body?.durationSeconds ?? 2)));
  const title = String(body?.title ?? text).slice(0, 200) || "Generated SFX";
  const projectId = body?.projectId ? String(body.projectId) : null;

  if (!text) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  const r = await fetch("https://api.elevenlabs.io/v1/text-to-sound-effects/convert", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text,
      duration_seconds: durationSeconds,
      prompt_influence: 0.6,
    }),
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    return NextResponse.json({ error: `ElevenLabs error (${r.status})`, details: txt }, { status: 502 });
  }

  const contentType = r.headers.get("content-type") ?? "audio/mpeg";
  const ext = guessExt(contentType);
  const audioBuf = Buffer.from(await r.arrayBuffer());

  const supabase = createSupabaseAdminClient();
  const storagePath = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("sound-effects").upload(storagePath, audioBuf, {
    contentType,
    upsert: false,
  });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: publicUrlData } = supabase.storage.from("sound-effects").getPublicUrl(storagePath);
  const publicUrl = publicUrlData.publicUrl;

  const { data: inserted, error: insErr } = await supabase
    .from("sound_effects")
    .insert({
      source: "elevenlabs",
      source_id: null,
      title,
      license: "CUSTOM",
      attribution: "Generated via ElevenLabs",
      source_url: null,
      duration_sec: durationSeconds,
      tags: [],
      storage_bucket: "sound-effects",
      storage_path: storagePath,
      created_by: userId,
    })
    .select("id")
    .single();

  if (insErr || !inserted?.id) {
    try {
      await supabase.storage.from("sound-effects").remove([storagePath]);
    } catch {
      // ignore
    }
    return NextResponse.json({ error: insErr?.message ?? "Failed to insert sound_effects row" }, { status: 500 });
  }

  if (projectId) {
    const { data: proj } = await supabase.from("projects").select("owner_user_id").eq("id", projectId).maybeSingle();
    if (proj?.owner_user_id === userId) {
      await supabase.from("project_sound_effects").insert({
        project_id: projectId,
        sound_effect_id: inserted.id,
        created_by: userId,
      });
    }
  }

  return NextResponse.json({ soundEffectId: inserted.id, storagePath, publicUrl });
}


