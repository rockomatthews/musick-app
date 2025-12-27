export type StemType = "vocals" | "guitar_synth" | "bass" | "drums";

export type AiMidiRequest = {
  stemType: StemType;
  bars?: number;
  temperature?: number;
};

export type AiMidiResult = {
  // Minimal portable representation; later we’ll store a full MIDI file or Magenta NoteSequence JSON.
  notes: { time: number; duration: number; midi: number; velocity: number }[];
  bpm: number;
};

export type AiAudioStemRequest = {
  stemType: StemType;
  prompt: string;
  durationSec: number;
};

export type AiAudioStemResult = {
  // URL or storage path to generated audio
  audioUrl: string;
  format: "wav" | "mp3" | "webm";
};

export interface AiMidiProvider {
  id: string;
  generateMidi(req: AiMidiRequest): Promise<AiMidiResult>;
}

export interface AiAudioProvider {
  id: string;
  generateAudioStem(req: AiAudioStemRequest): Promise<AiAudioStemResult>;
}


