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
  // Master bus input; everything (track wet outs, stem playback) can connect here.
  private masterIn = new Tone.Gain(1);
  private masterGain = new Tone.Gain(1);
  private masterEq = new Tone.EQ3(0, 0, 0);
  private masterCompressor = new Tone.Compressor(-18, 3);
  private masterDelay = new Tone.FeedbackDelay("8n", 0.25);
  private masterReverb = new Tone.Reverb({ decay: 2.2, wet: 0.15 });

  // Destination for recording and/or monitoring
  private meter = new Tone.Meter(0.8);

  private monitorTarget: Tone.ToneAudioNode | null = null;

  private tracks = new Map<
    string,
    {
      dryIn: Tone.Gain;
      gain: Tone.Gain;
      eq: Tone.EQ3;
      compressor: Tone.Compressor;
      delay: Tone.FeedbackDelay;
      reverb: Tone.Reverb;
      wetOut: Tone.Gain;
    }
  >();

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

    // Master FX chain routes into the main output
    this.masterIn.chain(
      this.masterGain,
      this.masterEq,
      this.masterCompressor,
      this.masterDelay,
      this.masterReverb,
      this.meter,
      Tone.getDestination(),
    );

    this.monitorTarget = this.masterIn;
  }

  private ensureTrack(stemType: string) {
    const key = stemType;
    const existing = this.tracks.get(key);
    if (existing) return existing;
    const dryIn = new Tone.Gain(1);
    const gain = new Tone.Gain(1);
    const eq = new Tone.EQ3(0, 0, 0);
    const compressor = new Tone.Compressor(-18, 3);
    const delay = new Tone.FeedbackDelay("8n", 0.0);
    const reverb = new Tone.Reverb({ decay: 2.2, wet: 0.0 });
    const wetOut = new Tone.Gain(1);
    // Track chain -> master
    dryIn.chain(gain, eq, compressor, delay, reverb, wetOut, this.masterIn);
    const t = { dryIn, gain, eq, compressor, delay, reverb, wetOut };
    this.tracks.set(key, t);
    return t;
  }

  getFxInput() {
    // Backwards-compat: treat as master bus input.
    return this.masterIn;
  }

  getTrackDryInput(stemType: string) {
    return this.ensureTrack(stemType).dryIn;
  }

  getTrackWetOutput(stemType: string) {
    return this.ensureTrack(stemType).wetOut;
  }

  setTrackFx(
    stemType: string,
    params: {
      gain?: number;
      eqLow?: number;
      eqMid?: number;
      eqHigh?: number;
      delayWet?: number;
      reverbWet?: number;
    },
  ) {
    const t = this.ensureTrack(stemType);
    if (typeof params.gain === "number") t.gain.gain.value = params.gain;
    if (typeof params.eqLow === "number") t.eq.low.value = params.eqLow;
    if (typeof params.eqMid === "number") t.eq.mid.value = params.eqMid;
    if (typeof params.eqHigh === "number") t.eq.high.value = params.eqHigh;
    if (typeof params.delayWet === "number") t.delay.wet.value = params.delayWet;
    if (typeof params.reverbWet === "number") t.reverb.wet.value = params.reverbWet;
  }

  setMonitorTarget(node: Tone.ToneAudioNode) {
    this.monitorTarget = node;
    if (!this._enabled || !this._monitoring || !this.input) return;
    try {
      this.input.disconnect();
    } catch {
      // ignore
    }
    this.input.connect(this.monitorTarget);
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
      this.input.connect(this.monitorTarget ?? this.masterIn);
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
    if (on) this.input.connect(this.monitorTarget ?? this.masterIn);
  }

  setFx(params: { gain?: number; eqLow?: number; eqMid?: number; eqHigh?: number; delayWet?: number; reverbWet?: number }) {
    if (typeof params.gain === "number") this.masterGain.gain.value = params.gain;
    if (typeof params.eqLow === "number") this.masterEq.low.value = params.eqLow;
    if (typeof params.eqMid === "number") this.masterEq.mid.value = params.eqMid;
    if (typeof params.eqHigh === "number") this.masterEq.high.value = params.eqHigh;
    if (typeof params.delayWet === "number") this.masterDelay.wet.value = params.delayWet;
    if (typeof params.reverbWet === "number") this.masterReverb.wet.value = params.reverbWet;
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


