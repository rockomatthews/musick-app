import { NextResponse } from "next/server";
import { requireUserFromAuthorizationHeader } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    await requireUserFromAuthorizationHeader(req);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing ELEVENLABS_API_KEY" }, { status: 501 });
  }

  const body = (await req.json().catch(() => null)) as any;
  const text = String(body?.text ?? "").trim();
  const durationSeconds = Math.max(0.5, Math.min(22, Number(body?.durationSeconds ?? 2)));

  if (!text) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  // ElevenLabs: text-to-sound-effects convert endpoint.
  // We return raw audio bytes to the client for immediate preview; client can call /api/sfx/import
  // to persist into Supabase Storage.
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

  const buf = Buffer.from(await r.arrayBuffer());
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": r.headers.get("content-type") ?? "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}


