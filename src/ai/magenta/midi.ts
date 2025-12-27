"use client";

import * as Tone from "tone";
import type { AiMidiProvider, AiMidiRequest, AiMidiResult } from "@/ai/providers/types";
import { MusicRNN } from "@magenta/music/esm/music_rnn";
import { quantizeNoteSequence, unquantizeSequence } from "@magenta/music/esm/core/sequences";

const CHECKPOINT = "https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/basic_rnn";

let rnn: MusicRNN | null = null;

async function getRnn() {
  if (!rnn) {
    rnn = new MusicRNN(CHECKPOINT);
    await rnn.initialize();
  }
  return rnn;
}

function toAiMidiResult(ns: any, bpm: number): AiMidiResult {
  const notes =
    (ns.notes ?? []).map((n: any) => ({
      time: Number(n.startTime ?? 0),
      duration: Math.max(0.05, Number((n.endTime ?? 0) - (n.startTime ?? 0))),
      midi: Number(n.pitch ?? 60),
      velocity: Math.max(0, Math.min(1, Number(n.velocity ?? 80) / 127)),
    })) ?? [];
  return { notes: notes.map((n: any) => ({ ...n, velocity: Math.round(n.velocity * 127) })), bpm };
}

export const MagentaMidiProvider: AiMidiProvider = {
  id: "magenta_music_rnn_basic",
  async generateMidi(req: AiMidiRequest): Promise<AiMidiResult> {
    const bars = Math.max(1, Math.min(8, req.bars ?? 2));
    const temperature = Math.max(0.1, Math.min(2.0, req.temperature ?? 1.1));

    // Seed: a single middle-C note, 1 beat long at 120 BPM.
    const seed: any = {
      notes: [{ pitch: 60, startTime: 0, endTime: 0.5, velocity: 90 }],
      totalTime: 0.5,
      tempos: [{ time: 0, qpm: 120 }],
    };

    const model = await getRnn();
    const stepsPerQuarter = 4;
    const steps = bars * 4 * stepsPerQuarter;
    const continued = await model.continueSequence(quantizeNoteSequence(seed, stepsPerQuarter), steps, temperature);
    const unq = unquantizeSequence(continued, 120);
    return toAiMidiResult(unq, 120);
  },
};

export async function playAiMidi(result: AiMidiResult) {
  await Tone.start();
  const synth = new Tone.PolySynth(Tone.Synth).toDestination();
  const now = Tone.now() + 0.1;
  for (const n of result.notes) {
    const freq = Tone.Frequency(n.midi, "midi").toFrequency();
    const vel = Math.max(0, Math.min(1, n.velocity / 127));
    synth.triggerAttackRelease(freq, n.duration, now + n.time, vel);
  }
  // auto-dispose after playback window
  const total = Math.max(...result.notes.map((n) => n.time + n.duration), 0) + 0.5;
  setTimeout(() => synth.dispose(), (total + 0.5) * 1000);
}


