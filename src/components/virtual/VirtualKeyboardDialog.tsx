"use client";

import * as React from "react";
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography, ToggleButton, ToggleButtonGroup } from "@mui/material";
import Grid from "@mui/material/Grid";
import CloseIcon from "@mui/icons-material/Close";
import * as Tone from "tone";
import { getAudioEngine } from "@/audio/engine";
import type { StemType } from "@/lib/stems/types";

const KEYMAP: { key: string; midi: number; label: string }[] = [
  { key: "a", midi: 60, label: "A" },
  { key: "w", midi: 61, label: "W" },
  { key: "s", midi: 62, label: "S" },
  { key: "e", midi: 63, label: "E" },
  { key: "d", midi: 64, label: "D" },
  { key: "f", midi: 65, label: "F" },
  { key: "t", midi: 66, label: "T" },
  { key: "g", midi: 67, label: "G" },
  { key: "y", midi: 68, label: "Y" },
  { key: "h", midi: 69, label: "H" },
  { key: "u", midi: 70, label: "U" },
  { key: "j", midi: 71, label: "J" },
  { key: "k", midi: 72, label: "K" },
];

const DRUMMAP: { key: string; label: string; kind: "kick" | "snare" | "hat" | "clap" | "tom" }[] = [
  { key: "a", label: "A", kind: "kick" },
  { key: "s", label: "S", kind: "snare" },
  { key: "d", label: "D", kind: "hat" },
  { key: "f", label: "F", kind: "clap" },
  { key: "g", label: "G", kind: "tom" },
  { key: "h", label: "H", kind: "hat" },
];

export function VirtualKeyboardDialog(props: {
  open: boolean;
  onClose: () => void;
  mode: "synth" | "drums";
  onModeChange: (mode: "synth" | "drums") => void;
  synthOutputStemType: StemType;
  drumsOutputStemType: StemType;
}) {
  const synthRef = React.useRef<Tone.PolySynth | null>(null);
  const drumRef = React.useRef<{
    kick: Tone.MembraneSynth;
    snare: Tone.NoiseSynth;
    hat: Tone.MetalSynth;
    clap: Tone.NoiseSynth;
    tom: Tone.MembraneSynth;
  } | null>(null);
  const held = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    if (!props.open) return;
    (async () => {
      const engine = getAudioEngine();
      await engine.enable();
      await Tone.start();
      const synthOut = engine.getTrackDryInput(props.synthOutputStemType);
      if (!synthRef.current) synthRef.current = new Tone.PolySynth(Tone.Synth);
      try {
        synthRef.current.disconnect();
      } catch {
        // ignore
      }
      synthRef.current.connect(synthOut);

      const drumOut = engine.getTrackDryInput(props.drumsOutputStemType);
      if (!drumRef.current) {
        drumRef.current = {
          kick: new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 10, volume: -6 }),
          snare: new Tone.NoiseSynth({ volume: -10, envelope: { attack: 0.001, decay: 0.2, sustain: 0 } }),
          hat: new Tone.MetalSynth({ volume: -14, envelope: { attack: 0.001, decay: 0.07, release: 0.01 } }),
          clap: new Tone.NoiseSynth({ volume: -12, envelope: { attack: 0.001, decay: 0.12, sustain: 0 } }),
          tom: new Tone.MembraneSynth({ pitchDecay: 0.01, octaves: 4, volume: -10 }),
        };
      }
      try {
        drumRef.current.kick.disconnect();
        drumRef.current.snare.disconnect();
        drumRef.current.hat.disconnect();
        drumRef.current.clap.disconnect();
        drumRef.current.tom.disconnect();
      } catch {
        // ignore
      }
      drumRef.current.kick.connect(drumOut);
      drumRef.current.snare.connect(drumOut);
      drumRef.current.hat.connect(drumOut);
      drumRef.current.clap.connect(drumOut);
      drumRef.current.tom.connect(drumOut);
    })();
  }, [props.drumsOutputStemType, props.open, props.synthOutputStemType]);

  React.useEffect(() => {
    if (!props.open) return;
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (props.mode === "drums") {
        const d = DRUMMAP.find((x) => x.key === k);
        if (!d) return;
        if (held.current.has(k)) return;
        held.current.add(k);
        const dref = drumRef.current;
        if (!dref) return;
        if (d.kind === "kick") dref.kick.triggerAttackRelease("C1", "16n");
        if (d.kind === "snare") dref.snare.triggerAttackRelease("16n");
        // MetalSynth requires (note, duration, time?, velocity?)
        if (d.kind === "hat") dref.hat.triggerAttackRelease("C6", "16n");
        if (d.kind === "clap") dref.clap.triggerAttackRelease("16n");
        if (d.kind === "tom") dref.tom.triggerAttackRelease("G2", "16n");
        return;
      }

      const m = KEYMAP.find((x) => x.key === k);
      if (!m) return;
      if (held.current.has(k)) return;
      held.current.add(k);
      const freq = Tone.Frequency(m.midi, "midi").toFrequency();
      synthRef.current?.triggerAttack(freq);
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (props.mode === "drums") {
        const d = DRUMMAP.find((x) => x.key === k);
        if (!d) return;
        held.current.delete(k);
        return;
      }

      const m = KEYMAP.find((x) => x.key === k);
      if (!m) return;
      held.current.delete(k);
      const freq = Tone.Frequency(m.midi, "midi").toFrequency();
      synthRef.current?.triggerRelease(freq);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      held.current.clear();
    };
  }, [props.mode, props.open]);

  // When switching modes, release any held synth notes so we don't get \"stuck\" piano notes.
  React.useEffect(() => {
    held.current.clear();
    try {
      synthRef.current?.releaseAll();
    } catch {
      // ignore
    }
  }, [props.mode]);

  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Virtual instrument
        <IconButton onClick={props.onClose} sx={{ position: "absolute", right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <ToggleButtonGroup
            value={props.mode}
            exclusive
            onChange={(_, v) => {
              if (!v) return;
              props.onModeChange(v);
            }}
            size="small"
          >
            <ToggleButton value="synth">Synth</ToggleButton>
            <ToggleButton value="drums">Drum machine</ToggleButton>
          </ToggleButtonGroup>
          <Typography color="text.secondary">
            Use your computer keyboard to play. Output routes into the assigned track, so you can record into a stem box.
          </Typography>
          <Grid container spacing={1}>
            {(props.mode === "drums" ? DRUMMAP : KEYMAP).map((k: any) => (
              <Grid key={k.key} size={{ xs: 4, sm: 3, md: 2 }}>
                <Box
                  sx={{
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 2,
                    p: 1,
                    textAlign: "center",
                    bgcolor: "rgba(255,255,255,0.05)",
                  }}
                >
                  <Typography fontWeight={900}>{k.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {props.mode === "drums" ? String(k.kind).toUpperCase() : Tone.Frequency(k.midi, "midi").toNote()}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
          <Typography variant="caption" color="text.secondary">
            Next: Magenta-generated arpeggios that you can “latch” and record into a stem box.
          </Typography>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}


