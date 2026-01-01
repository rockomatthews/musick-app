"use client";

import * as Tone from "tone";
import { encode } from "wav-encoder";

export type RecordingResult = {
  mimeType: string;
  blob: Blob;
  durationMs: number;
};

export class NodeRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private startedAt = 0;
  private streamDest: MediaStreamAudioDestinationNode | null = null;
  private sourceNode: AudioNode | null = null;

  async startFrom(source: AudioNode) {
    if (this.recorder) throw new Error("Recording already in progress");
    const ctx = Tone.getContext().rawContext as AudioContext;
    this.streamDest = ctx.createMediaStreamDestination();
    this.sourceNode = source;
    source.connect(this.streamDest);

    const stream = this.streamDest.stream;
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    this.recorder = new MediaRecorder(stream, { mimeType });
    this.chunks = [];
    this.startedAt = Date.now();

    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(250);
  }

  async stop(): Promise<RecordingResult> {
    if (!this.recorder) throw new Error("No recording in progress");
    const recorder = this.recorder;
    const streamDest = this.streamDest;
    const sourceNode = this.sourceNode;
    this.recorder = null;
    this.streamDest = null;
    this.sourceNode = null;

    const stoppedAt = Date.now();
    const durationMs = Math.max(0, stoppedAt - this.startedAt);

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });

    try {
      if (sourceNode && streamDest) sourceNode.disconnect(streamDest);
    } catch {
      // ignore
    }
    try {
      streamDest?.disconnect();
    } catch {
      // ignore
    }

    const blob = new Blob(this.chunks, { type: recorder.mimeType });
    return { blob, mimeType: recorder.mimeType, durationMs };
  }
}

export class MasterRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private startedAt = 0;
  private streamDest: MediaStreamAudioDestinationNode | null = null;

  async start() {
    if (this.recorder) throw new Error("Recording already in progress");
    const ctx = Tone.getContext().rawContext as AudioContext;
    this.streamDest = ctx.createMediaStreamDestination();

    // Tap Tone's master output into a MediaStream
    const destNode = Tone.getDestination().input as unknown as AudioNode;
    destNode.connect(this.streamDest);

    const stream = this.streamDest.stream;
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    this.recorder = new MediaRecorder(stream, { mimeType });
    this.chunks = [];
    this.startedAt = Date.now();

    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };

    this.recorder.start(250);
  }

  async stop(): Promise<RecordingResult> {
    if (!this.recorder) throw new Error("No recording in progress");
    const recorder = this.recorder;
    const streamDest = this.streamDest;
    this.recorder = null;
    this.streamDest = null;

    const stoppedAt = Date.now();
    const durationMs = Math.max(0, stoppedAt - this.startedAt);

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });

    try {
      streamDest?.disconnect();
    } catch {
      // ignore
    }

    const blob = new Blob(this.chunks, { type: recorder.mimeType });
    return { blob, mimeType: recorder.mimeType, durationMs };
  }

  // Optional: convert a WebAudio buffer to WAV (useful for export later).
  static async audioBufferToWavBlob(buffer: AudioBuffer): Promise<Blob> {
    const wavData = await encode({
      sampleRate: buffer.sampleRate,
      channelData: Array.from({ length: buffer.numberOfChannels }).map((_, i) => buffer.getChannelData(i)),
    });
    return new Blob([wavData], { type: "audio/wav" });
  }
}

let singleton: MasterRecorder | null = null;

export function getMasterRecorder() {
  if (!singleton) singleton = new MasterRecorder();
  return singleton;
}


