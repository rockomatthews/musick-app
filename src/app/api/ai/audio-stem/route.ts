import { NextResponse } from "next/server";
import type { AiAudioStemRequest } from "@/ai/providers/types";

export async function POST(req: Request) {
  const enabled = process.env.AI_AUDIO_ENABLED === "true";
  if (!enabled) {
    return NextResponse.json(
      { error: "AI audio stem generation not enabled" },
      { status: 501 },
    );
  }

  const body = (await req.json()) as Partial<AiAudioStemRequest>;
  if (!body?.prompt || !body?.stemType || !body?.durationSec) {
    return NextResponse.json({ error: "Missing prompt/stemType/durationSec" }, { status: 400 });
  }

  // Stub: provider integration goes here (Replicate/HF/vendor/etc).
  return NextResponse.json(
    { error: "No audio provider configured yet" },
    { status: 501 },
  );
}


