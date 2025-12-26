"use client";

import * as Tone from "tone";
import { WebMidi } from "webmidi";

export type MidiState = {
  enabled: boolean;
  inputId: string | null;
  lastNote: { note: string; velocity: number } | null;
};

export class MidiManager {
  private _enabled = false;
  private _inputId: string | null = null;
  private _lastNote: { note: string; velocity: number } | null = null;

  private synth = new Tone.PolySynth(Tone.Synth).toDestination();
  private inputListenerCleanup: (() => void) | null = null;

  get state(): MidiState {
    return {
      enabled: this._enabled,
      inputId: this._inputId,
      lastNote: this._lastNote,
    };
  }

  async enable() {
    if (this._enabled) return;
    await WebMidi.enable();
    this._enabled = true;
  }

  listInputs() {
    if (!this._enabled) return [];
    return WebMidi.inputs.map((i) => ({ id: i.id, name: i.name || i.manufacturer || i.id }));
  }

  setInput(inputId: string | null) {
    this._inputId = inputId;
    if (!this._enabled) return;

    if (this.inputListenerCleanup) {
      this.inputListenerCleanup();
      this.inputListenerCleanup = null;
    }

    const input = inputId ? WebMidi.getInputById(inputId) : null;
    if (!input) return;

    const onNoteOn = (e: any) => {
      const note = e.note?.identifier ?? `${e.note?.name}${e.note?.octave ?? ""}`;
      const velocity = e.velocity ?? 0;
      this._lastNote = { note, velocity };
      const freq = e.note?.frequency;
      if (typeof freq === "number") {
        this.synth.triggerAttackRelease(freq, "8n", Tone.now(), Math.min(1, Math.max(0, velocity)));
      }
    };

    input.addListener("noteon", onNoteOn);
    this.inputListenerCleanup = () => {
      try {
        input.removeListener("noteon", onNoteOn);
      } catch {
        // ignore
      }
    };
  }
}

let singleton: MidiManager | null = null;

export function getMidiManager() {
  if (!singleton) singleton = new MidiManager();
  return singleton;
}


