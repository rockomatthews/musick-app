"use client";

import * as React from "react";
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from "@mui/material";
import Grid from "@mui/material/Grid2";
import CloseIcon from "@mui/icons-material/Close";
import * as Tone from "tone";
import { getAudioEngine } from "@/audio/engine";

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

export function VirtualKeyboardDialog(props: { open: boolean; onClose: () => void }) {
  const synthRef = React.useRef<Tone.PolySynth | null>(null);
  const held = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    if (!props.open) return;
    (async () => {
      const engine = getAudioEngine();
      await engine.enable();
      await Tone.start();
      if (!synthRef.current) {
        const s = new Tone.PolySynth(Tone.Synth);
        s.connect(engine.getFxInput());
        synthRef.current = s;
      }
    })();
  }, [props.open]);

  React.useEffect(() => {
    if (!props.open) return;
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const m = KEYMAP.find((x) => x.key === k);
      if (!m) return;
      if (held.current.has(k)) return;
      held.current.add(k);
      const freq = Tone.Frequency(m.midi, "midi").toFrequency();
      synthRef.current?.triggerAttack(freq);
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
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
  }, [props.open]);

  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Virtual keyboard
        <IconButton onClick={props.onClose} sx={{ position: "absolute", right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography color="text.secondary">
            Use your computer keyboard to play notes. This routes through the same FX chain as Audio/MIDI.
          </Typography>
          <Grid container spacing={1}>
            {KEYMAP.map((k) => (
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
                    {Tone.Frequency(k.midi, "midi").toNote()}
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


