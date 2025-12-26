"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AppBar,
  Box,
  Button,
  Container,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Toolbar,
  Typography,
  IconButton,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { StemGrid } from "@/components/stems/StemGrid";
import { getAudioEngine } from "@/audio/engine";
import { getMidiManager } from "@/midi/manager";

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const supabase = React.useMemo(() => createSupabaseBrowserClient(), []);
  const [title, setTitle] = React.useState<string>("Project");
  const [columnCount, setColumnCount] = React.useState(1);
  const [audioEnabled, setAudioEnabled] = React.useState(false);
  const [monitoring, setMonitoring] = React.useState(false);
  const [audioInputs, setAudioInputs] = React.useState<MediaDeviceInfo[]>([]);
  const [audioDeviceId, setAudioDeviceId] = React.useState<string>("");

  const [midiEnabled, setMidiEnabled] = React.useState(false);
  const [midiInputs, setMidiInputs] = React.useState<{ id: string; name: string }[]>([]);
  const [midiInputId, setMidiInputId] = React.useState<string>("");
  const [lastMidi, setLastMidi] = React.useState<string>("");

  React.useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push("/login");
        return;
      }

      const { data } = await supabase.from("projects").select("title,column_count").eq("id", projectId).single();
      setTitle(data?.title ?? "Project");
      if (typeof data?.column_count === "number" && data.column_count > 0) {
        setColumnCount(data.column_count);
      }
    })();
  }, [projectId, router, supabase]);

  async function addColumn() {
    const next = columnCount + 1;
    setColumnCount(next);
    await supabase.from("projects").update({ column_count: next }).eq("id", projectId);
  }

  async function enableAudio() {
    const engine = getAudioEngine();
    await engine.enable();
    setAudioEnabled(true);
    const devices = await engine.listInputDevices();
    setAudioInputs(devices);
  }

  async function onAudioDeviceChange(id: string) {
    setAudioDeviceId(id);
    const engine = getAudioEngine();
    await engine.setInputDevice(id || null);
  }

  async function onMonitoringChange(on: boolean) {
    setMonitoring(on);
    const engine = getAudioEngine();
    await engine.setMonitoring(on);
  }

  async function enableMidi() {
    const mgr = getMidiManager();
    await mgr.enable();
    setMidiEnabled(true);
    setMidiInputs(mgr.listInputs());
  }

  function onMidiInputChange(id: string) {
    setMidiInputId(id);
    const mgr = getMidiManager();
    mgr.setInput(id || null);
  }

  React.useEffect(() => {
    if (!midiEnabled) return;
    const mgr = getMidiManager();
    const t = setInterval(() => {
      const v = mgr.state.lastNote;
      if (v) setLastMidi(`${v.note} (${Math.round(v.velocity * 127)})`);
    }, 200);
    return () => clearInterval(t);
  }, [midiEnabled]);

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <AppBar position="sticky" color="transparent" elevation={0}>
        <Toolbar>
          <IconButton onClick={() => router.push("/projects")} aria-label="Back to projects">
            <ArrowBackIcon />
          </IconButton>
          <Typography fontWeight={800} sx={{ ml: 1 }}>
            {title}
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth={false} sx={{ py: 3 }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <Box sx={{ flex: 1 }}>
              <Typography fontWeight={900} sx={{ mb: 1 }}>
                Audio Input
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
                <Button variant="contained" onClick={enableAudio} disabled={audioEnabled}>
                  {audioEnabled ? "Audio Enabled" : "Enable Audio"}
                </Button>
                <FormControl sx={{ minWidth: 260 }} size="small" disabled={!audioEnabled}>
                  <InputLabel id="audio-device">Input device</InputLabel>
                  <Select
                    labelId="audio-device"
                    label="Input device"
                    value={audioDeviceId}
                    onChange={(e) => void onAudioDeviceChange(String(e.target.value))}
                  >
                    <MenuItem value="">Default</MenuItem>
                    {audioInputs.map((d) => (
                      <MenuItem key={d.deviceId} value={d.deviceId}>
                        {d.label || d.deviceId}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" color="text.secondary">
                    Monitor
                  </Typography>
                  <Switch checked={monitoring} onChange={(_, v) => void onMonitoringChange(v)} disabled={!audioEnabled} />
                </Stack>
              </Stack>
            </Box>

            <Box sx={{ flex: 1 }}>
              <Typography fontWeight={900} sx={{ mb: 1 }}>
                MIDI
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
                <Button variant="contained" onClick={enableMidi} disabled={midiEnabled}>
                  {midiEnabled ? "MIDI Enabled" : "Enable MIDI"}
                </Button>
                <FormControl sx={{ minWidth: 260 }} size="small" disabled={!midiEnabled}>
                  <InputLabel id="midi-device">MIDI input</InputLabel>
                  <Select
                    labelId="midi-device"
                    label="MIDI input"
                    value={midiInputId}
                    onChange={(e) => onMidiInputChange(String(e.target.value))}
                  >
                    <MenuItem value="">Select…</MenuItem>
                    {midiInputs.map((d) => (
                      <MenuItem key={d.id} value={d.id}>
                        {d.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Typography variant="body2" color="text.secondary">
                  {lastMidi ? `Last note: ${lastMidi}` : "Play a note to test"}
                </Typography>
              </Stack>
            </Box>
          </Stack>

          <StemGrid columnCount={columnCount} onAddColumn={addColumn} />
          <Typography color="text.secondary" variant="body2">
            This is a first pass at device selection and monitoring. Next: wire per-box inputs, FX controls, and stem playback.
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
}


