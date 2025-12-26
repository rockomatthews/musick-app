"use client";

import * as Tone from "tone";

export type AudioEngineState = {
  enabled: boolean;
  monitoring: boolean;
  inputDeviceId: string | null;
};

export class AudioEngine {
  private _enabled = false;
  private _monitoring = false;
  private _inputDeviceId: string | null = null;

  private input: Tone.UserMedia | null = null;
  private gain = new Tone.Gain(1);
  private eq = new Tone.EQ3(0, 0, 0);
  private compressor = new Tone.Compressor(-18, 3);
  private delay = new Tone.FeedbackDelay("8n", 0.25);
  private reverb = new Tone.Reverb({ decay: 2.2, wet: 0.15 });

  // Destination for recording and/or monitoring
  private meter = new Tone.Meter(0.8);

  get state(): AudioEngineState {
    return {
      enabled: this._enabled,
      monitoring: this._monitoring,
      inputDeviceId: this._inputDeviceId,
    };
  }

  async enable() {
    if (this._enabled) return;
    await Tone.start();
    this._enabled = true;

    // FX chain routes into the main output
    this.gain.chain(this.eq, this.compressor, this.delay, this.reverb, this.meter, Tone.getDestination());
  }

  async listInputDevices(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audioinput");
  }

  async setInputDevice(deviceId: string | null) {
    this._inputDeviceId = deviceId;
    if (!this._enabled) return;

    if (this.input) {
      try {
        this.input.disconnect();
        await this.input.close();
      } catch {
        // ignore
      }
      this.input = null;
    }

    const input = new Tone.UserMedia();
    await input.open(deviceId || undefined);
    this.input = input;

    if (this._monitoring) {
      this.input.connect(this.gain);
    }
  }

  async setMonitoring(on: boolean) {
    this._monitoring = on;
    if (!this._enabled) return;
    if (!this.input) {
      // lazily open default input if monitoring requested
      if (on) await this.setInputDevice(this._inputDeviceId);
      return;
    }

    try {
      this.input.disconnect();
    } catch {
      // ignore
    }
    if (on) this.input.connect(this.gain);
  }

  setFx(params: { gain?: number; eqLow?: number; eqMid?: number; eqHigh?: number; delayWet?: number; reverbWet?: number }) {
    if (typeof params.gain === "number") this.gain.gain.value = params.gain;
    if (typeof params.eqLow === "number") this.eq.low.value = params.eqLow;
    if (typeof params.eqMid === "number") this.eq.mid.value = params.eqMid;
    if (typeof params.eqHigh === "number") this.eq.high.value = params.eqHigh;
    if (typeof params.delayWet === "number") this.delay.wet.value = params.delayWet;
    if (typeof params.reverbWet === "number") this.reverb.wet.value = params.reverbWet;
  }

  getLevel(): number {
    if (!this._enabled) return -Infinity;
    return this.meter.getValue() as number;
  }
}

let singleton: AudioEngine | null = null;

export function getAudioEngine() {
  if (!singleton) singleton = new AudioEngine();
  return singleton;
}


