"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import {
  AppBar,
  Box,
  Button,
  Container,
  Divider,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  Switch,
  TextField,
  Toolbar,
  Typography,
  IconButton,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import KeyboardIcon from "@mui/icons-material/Keyboard";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { StemGrid } from "@/components/stems/StemGrid";
import { getAudioEngine } from "@/audio/engine";
import { getMidiManager } from "@/midi/manager";
import * as Tone from "tone";
import { getMasterRecorder } from "@/audio/recorder";
import { MagentaMidiProvider, playAiMidi } from "@/ai/magenta/midi";
import type { StemType } from "@/lib/stems/types";
import { ProfileMenu } from "@/components/ProfileMenu";
import type { StemBoxStatus } from "@/components/stems/StemBox";
import { VirtualKeyboardDialog } from "@/components/virtual/VirtualKeyboardDialog";

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const supabase = React.useMemo(() => createSupabaseBrowserClient(), []);
  const [userId, setUserId] = React.useState<string | null>(null);
  const [isOwner, setIsOwner] = React.useState(false);
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
  const [virtualOpen, setVirtualOpen] = React.useState(false);

  const [fxGain, setFxGain] = React.useState(1);
  const [fxDelay, setFxDelay] = React.useState(0.25);
  const [fxReverb, setFxReverb] = React.useState(0.15);

  const [approvedAudio, setApprovedAudio] = React.useState<
    { stemId: string; stemType: string; columnIndex: number; url: string }[]
  >([]);
  const [playingStemId, setPlayingStemId] = React.useState<string | null>(null);
  const playerRef = React.useRef<Tone.Player | null>(null);

  const [isRecording, setIsRecording] = React.useState(false);
  const [lastRecordingUrl, setLastRecordingUrl] = React.useState<string | null>(null);
  const [lastRecordingBlob, setLastRecordingBlob] = React.useState<Blob | null>(null);

  const [submitStemType, setSubmitStemType] = React.useState<string>("vocals");
  const [submitColumn, setSubmitColumn] = React.useState<number>(0);
  const [submitNote, setSubmitNote] = React.useState<string>("");
  const [isSubmittingStem, setIsSubmittingStem] = React.useState(false);
  const [pendingStems, setPendingStems] = React.useState<
    { id: string; stem_type: string; column_index: number; created_at: string; created_by: string }[]
  >([]);
  const [coverUrl, setCoverUrl] = React.useState<string | null>(null);

  const [cellStatus, setCellStatus] = React.useState<Map<string, StemBoxStatus>>(new Map());
  const [cellApprovedStemId, setCellApprovedStemId] = React.useState<Map<string, string>>(new Map());
  const [cellLatestAudioUrl, setCellLatestAudioUrl] = React.useState<Map<string, string>>(new Map());
  const [cellLatestStemId, setCellLatestStemId] = React.useState<Map<string, string>>(new Map());
  const [playingCellKey, setPlayingCellKey] = React.useState<string | null>(null);

  const [stemRecTarget, setStemRecTarget] = React.useState<{ stemType: StemType; columnIndex: number } | null>(null);
  const [stemRecPhase, setStemRecPhase] = React.useState<"idle" | "countin" | "recording">("idle");
  const countInTimerRef = React.useRef<number | null>(null);
  const cellPlayerRef = React.useRef<Tone.Player | null>(null);

  const refreshStems = React.useCallback(async () => {
    const { data: stems } = await supabase
      .from("stems")
      .select("id,stem_type,column_index,status,created_at,created_by,stem_assets(kind,storage_path)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    const statusMap = new Map<string, StemBoxStatus>();
    const approvedIdMap = new Map<string, string>();
    const latestUrlMap = new Map<string, string>();
    const latestStemIdMap = new Map<string, string>();
    const pending: { id: string; stem_type: string; column_index: number; created_at: string; created_by: string }[] = [];
    const approvedAudioNext: { stemId: string; stemType: string; columnIndex: number; url: string }[] = [];

    // Iterate newest→oldest (we requested created_at desc), so first audio we see per cell becomes "latest"
    for (const s of (stems as any[]) ?? []) {
      const k = `${s.stem_type}:${s.column_index}`;
      const st: "pending" | "approved" | "rejected" = s.status;

      // Choose best visible status per cell: approved > pending > empty
      const cur = statusMap.get(k);
      if (st === "approved") statusMap.set(k, "approved");
      else if (st === "pending" && cur !== "approved") statusMap.set(k, "pending");

      if (st === "approved") {
        approvedIdMap.set(k, s.id);
      }

      const assets = (s.stem_assets as any[]) ?? [];
      for (const a of assets) {
        if (a.kind !== "audio") continue;
        const p = String(a.storage_path ?? "");
        if (!p) continue;
        const url =
          p.startsWith("http://") || p.startsWith("https://")
            ? p
            : supabase.storage.from("stems").getPublicUrl(p).data.publicUrl ?? null;
        if (!url) continue;

        // For the global list, show approved and pending separately? For now: include both so "anyone can listen"
        approvedAudioNext.push({ stemId: s.id, stemType: s.stem_type, columnIndex: s.column_index, url });

        // For per-cell playback, keep the newest stem with audio (pending or approved)
        if (!latestUrlMap.has(k)) {
          latestUrlMap.set(k, url);
          latestStemIdMap.set(k, s.id);
        }
      }

      if (st === "pending") {
        pending.push({
          id: s.id,
          stem_type: s.stem_type,
          column_index: s.column_index,
          created_at: s.created_at,
          created_by: s.created_by,
        });
      }
    }

    setCellStatus(statusMap);
    setCellApprovedStemId(approvedIdMap);
    setCellLatestAudioUrl(latestUrlMap);
    setCellLatestStemId(latestStemIdMap);
    setPendingStems(pending);
    setApprovedAudio(approvedAudioNext);
  }, [projectId, supabase]);

  React.useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push("/login");
        return;
      }
      setUserId(sessionData.session.user.id);

      const { data } = await supabase
        .from("projects")
        .select("title,column_count,owner_user_id,cover_image_path")
        .eq("id", projectId)
        .single();
      setTitle(data?.title ?? "Project");
      if (typeof data?.column_count === "number" && data.column_count > 0) {
        setColumnCount(data.column_count);
      }
      setIsOwner(Boolean(data?.owner_user_id && data.owner_user_id === sessionData.session.user.id));
      if (data?.cover_image_path) {
        const p = String(data.cover_image_path);
        const url =
          p.startsWith("http://") || p.startsWith("https://")
            ? p
            : supabase.storage.from("project-images").getPublicUrl(p).data.publicUrl ?? null;
        setCoverUrl(url);
      }
      await refreshStems();
    })();
  }, [projectId, refreshStems, router, supabase]);

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
    // Ensure Tone audio context is started and FX bus exists, even if user only uses MIDI.
    const engine = getAudioEngine();
    await engine.enable();
    const mgr = getMidiManager();
    await mgr.enable();
    mgr.setOutput(engine.getFxInput());
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

  React.useEffect(() => {
    if (!audioEnabled && !midiEnabled) return;
    const engine = getAudioEngine();
    engine.setFx({ gain: fxGain, delayWet: fxDelay, reverbWet: fxReverb });
  }, [audioEnabled, midiEnabled, fxDelay, fxGain, fxReverb]);

  async function playApprovedStem(stemId: string, url: string) {
    const engine = getAudioEngine();
    await engine.enable();

    if (playerRef.current) {
      try {
        playerRef.current.stop();
        playerRef.current.dispose();
      } catch {
        // ignore
      }
      playerRef.current = null;
    }

    const player = new Tone.Player(url);
    player.connect(engine.getFxInput());
    await player.load(url);
    player.start();

    playerRef.current = player;
    setPlayingStemId(stemId);
  }

  function stopApprovedStem() {
    if (!playerRef.current) return;
    try {
      playerRef.current.stop();
      playerRef.current.dispose();
    } catch {
      // ignore
    }
    playerRef.current = null;
    setPlayingStemId(null);
  }

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <AppBar position="sticky" color="transparent" elevation={0}>
        <Toolbar>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexGrow: 1 }}>
            <Link href="/" style={{ display: "inline-flex", alignItems: "center" }}>
              <Image
                src="/musick-logo.svg"
                alt="Musick.Studio"
                width={160}
                height={32}
                priority
                style={{ height: 28, width: "auto" }}
              />
            </Link>
            <IconButton onClick={() => router.push("/projects")} aria-label="Back to projects">
              <ArrowBackIcon />
            </IconButton>
            <Typography fontWeight={800} sx={{ ml: 0.5 }}>
              {title}
            </Typography>
          </Stack>
          <ProfileMenu />
        </Toolbar>
      </AppBar>

      <Container maxWidth={false} sx={{ py: 3 }}>
        <Stack spacing={2}>
          {isOwner ? (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography fontWeight={900}>Project cover image</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                This image shows up on the homepage carousels.
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 2 }} alignItems={{ sm: "center" }}>
                {coverUrl ? (
                  <Box
                    component="img"
                    src={coverUrl}
                    alt="Project cover"
                    sx={{ width: 220, height: 124, objectFit: "cover", borderRadius: 2, border: "1px solid rgba(255,255,255,0.12)" }}
                  />
                ) : (
                  <Box sx={{ width: 220, height: 124, borderRadius: 2, bgcolor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }} />
                )}
                <Button variant="outlined" component="label">
                  Upload cover image
                  <input
                    hidden
                    type="file"
                    accept="image/jpeg,image/png"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      try {
                        const allowed = new Set(["image/jpeg", "image/png"]);
                        if (!allowed.has(file.type)) {
                          throw new Error("Cover image must be a JPG or PNG.");
                        }
                        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
                        const path = `projects/${projectId}/covers/${Date.now()}.${ext}`;
                        const { error: upErr } = await supabase.storage.from("project-images").upload(path, file, {
                          contentType: file.type || "application/octet-stream",
                          upsert: true,
                        });
                        if (upErr) throw upErr;
                        const { error: dbErr } = await supabase.from("projects").update({ cover_image_path: path }).eq("id", projectId);
                        if (dbErr) throw dbErr;
                        const url = supabase.storage.from("project-images").getPublicUrl(path).data.publicUrl ?? null;
                        setCoverUrl(url);
                        alert("Cover image updated!");
                      } catch (err) {
                        alert(err instanceof Error ? err.message : "Cover upload failed");
                      }
                    }}
                  />
                </Button>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                Requires a Supabase Storage bucket named <code>project-images</code>.
              </Typography>
            </Paper>
          ) : null}

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

            <Box sx={{ flex: 1 }}>
              <Typography fontWeight={900} sx={{ mb: 1 }}>
                Virtual
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
                <Button variant="contained" startIcon={<KeyboardIcon />} onClick={() => setVirtualOpen(true)}>
                  Open keyboard
                </Button>
                <Typography variant="body2" color="text.secondary">
                  Play with A/W/S/E/D… then record into a stem box.
                </Typography>
              </Stack>
            </Box>
          </Stack>

          <VirtualKeyboardDialog open={virtualOpen} onClose={() => setVirtualOpen(false)} />

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography fontWeight={900} sx={{ mb: 1 }}>
              FX (global)
            </Typography>
            <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
              <Box sx={{ flex: 1, minWidth: 220 }}>
                <Typography variant="body2" color="text.secondary">
                  Gain
                </Typography>
                <Slider
                  min={0}
                  max={2}
                  step={0.01}
                  value={fxGain}
                  onChange={(_, v) => setFxGain(Number(v))}
                  disabled={!audioEnabled && !midiEnabled}
                />
              </Box>
              <Box sx={{ flex: 1, minWidth: 220 }}>
                <Typography variant="body2" color="text.secondary">
                  Delay Wet
                </Typography>
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={fxDelay}
                  onChange={(_, v) => setFxDelay(Number(v))}
                  disabled={!audioEnabled && !midiEnabled}
                />
              </Box>
              <Box sx={{ flex: 1, minWidth: 220 }}>
                <Typography variant="body2" color="text.secondary">
                  Reverb Wet
                </Typography>
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={fxReverb}
                  onChange={(_, v) => setFxReverb(Number(v))}
                  disabled={!audioEnabled && !midiEnabled}
                />
              </Box>
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
              <Typography fontWeight={900} sx={{ flex: 1 }}>
                Recording (master)
              </Typography>
              <Button
                variant="contained"
                color={isRecording ? "error" : "primary"}
                disabled={!audioEnabled && !midiEnabled}
                onClick={async () => {
                  const engine = getAudioEngine();
                  await engine.enable();
                  const rec = getMasterRecorder();
                  if (!isRecording) {
                    setLastRecordingUrl(null);
                    setLastRecordingBlob(null);
                    await rec.start();
                    setIsRecording(true);
                  } else {
                    const res = await rec.stop();
                    const url = URL.createObjectURL(res.blob);
                    setLastRecordingUrl(url);
                    setLastRecordingBlob(res.blob);
                    setIsRecording(false);
                  }
                }}
              >
                {isRecording ? "Stop recording" : "Start recording"}
              </Button>
              {lastRecordingUrl ? (
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="outlined"
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = lastRecordingUrl;
                      a.download = `music-land-master-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.webm`;
                      a.click();
                    }}
                  >
                    Download
                  </Button>
                  <Button
                    variant="outlined"
                    disabled={!lastRecordingBlob}
                    onClick={async () => {
                      if (!lastRecordingBlob) return;
                      const path = `projects/${projectId}/recordings/${Date.now()}-master.webm`;
                      const { error } = await supabase.storage.from("recordings").upload(path, lastRecordingBlob, {
                        contentType: lastRecordingBlob.type || "audio/webm",
                        upsert: false,
                      });
                      if (error) {
                        alert(`Upload failed: ${error.message}`);
                        return;
                      }
                      alert(`Uploaded to recordings/${path}`);
                    }}
                  >
                    Upload to Supabase
                  </Button>
                </Stack>
              ) : null}
            </Stack>
            {lastRecordingUrl ? (
              <Box sx={{ mt: 2 }}>
                <audio controls src={lastRecordingUrl} style={{ width: "100%" }} />
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                This records the master output (MIDI synth + any monitored input + stem playback).
              </Typography>
            )}
          </Paper>

          <StemGrid
            columnCount={columnCount}
            onAddColumn={addColumn}
            onAiMidi={async (stemType: StemType, _columnIndex: number) => {
              const engine = getAudioEngine();
              await engine.enable();
              // Generate and audition (not yet saved as an asset)
              const midi = await MagentaMidiProvider.generateMidi({ stemType, bars: 2, temperature: 1.1 });
              await playAiMidi(midi);
            }}
            statusFor={(stemType, columnIndex) => cellStatus.get(`${stemType}:${columnIndex}`) ?? "empty"}
            isRecordingFor={(stemType, columnIndex) =>
              Boolean(stemRecTarget && stemRecTarget.stemType === stemType && stemRecTarget.columnIndex === columnIndex && stemRecPhase !== "idle")
            }
            canPlayFor={(stemType, columnIndex) => cellLatestAudioUrl.has(`${stemType}:${columnIndex}`)}
            isPlayingFor={(stemType, columnIndex) => playingCellKey === `${stemType}:${columnIndex}`}
            onPlayToggle={async (stemType, columnIndex) => {
              const k = `${stemType}:${columnIndex}`;
              const url = cellLatestAudioUrl.get(k);
              if (!url) return;

              const engine = getAudioEngine();
              await engine.enable();

              // toggle off
              if (playingCellKey === k) {
                try {
                  cellPlayerRef.current?.stop();
                  cellPlayerRef.current?.dispose();
                } catch {
                  // ignore
                }
                cellPlayerRef.current = null;
                setPlayingCellKey(null);
                return;
              }

              // stop current
              try {
                cellPlayerRef.current?.stop();
                cellPlayerRef.current?.dispose();
              } catch {
                // ignore
              }
              cellPlayerRef.current = null;

              const player = new Tone.Player(url);
              player.connect(engine.getFxInput());
              await player.load(url);
              player.start();
              cellPlayerRef.current = player;
              setPlayingCellKey(k);
            }}
            onRecordToggle={async (stemType, columnIndex) => {
              if (!userId) {
                alert("Please login again.");
                return;
              }
              if (isRecording) {
                alert("Stop the master recording first.");
                return;
              }

              // Stop current box recording
              if (stemRecTarget && stemRecTarget.stemType === stemType && stemRecTarget.columnIndex === columnIndex) {
                if (stemRecPhase === "countin") {
                  if (countInTimerRef.current) window.clearTimeout(countInTimerRef.current);
                  countInTimerRef.current = null;
                  setStemRecTarget(null);
                  setStemRecPhase("idle");
                  return;
                }
                if (stemRecPhase === "recording") {
                  try {
                    const rec = getMasterRecorder();
                    const res = await rec.stop();
                    setStemRecPhase("idle");
                    setStemRecTarget(null);

                    // Create stem row (pending), upload audio, create asset
                    const { data: stem, error: stemErr } = await supabase
                      .from("stems")
                      .insert({
                        project_id: projectId,
                        stem_type: stemType,
                        column_index: columnIndex,
                        status: "pending",
                        created_by: userId,
                      })
                      .select("id")
                      .single();
                    if (stemErr) throw stemErr;

                    const storagePath = `projects/${projectId}/stems/${stemType}/col-${columnIndex + 1}/${Date.now()}-recorded.webm`;
                    try {
                      const { error: upErr } = await supabase.storage.from("stems").upload(storagePath, res.blob, {
                        contentType: res.blob.type || "audio/webm",
                        upsert: false,
                      });
                      if (upErr) throw upErr;

                      const { error: assetErr } = await supabase.from("stem_assets").insert({
                        stem_id: stem.id,
                        kind: "audio",
                        storage_path: storagePath,
                        metadata_json: { source: "record", countIn: 3, bpm: 120 },
                      });
                      if (assetErr) throw assetErr;
                    } catch (e) {
                      // Roll back the stem row if upload/asset insert fails.
                      await supabase.from("stems").delete().eq("id", stem.id);
                      throw e;
                    }

                    alert("Recorded + submitted as pending stem!");
                    await refreshStems();
                    return;
                  } catch (err) {
                    alert(err instanceof Error ? err.message : "Recording submit failed");
                    await refreshStems();
                    return;
                  }
                }
              }

              // If another box recording is active, block
              if (stemRecPhase !== "idle") {
                alert("Finish the current stem recording first.");
                return;
              }

              // Start count-in then begin recording
              const engine = getAudioEngine();
              await engine.enable();

              setStemRecTarget({ stemType, columnIndex });
              setStemRecPhase("countin");

              // 3-click count-in at 120 BPM (quarter note = 500ms)
              try {
                const synth = new Tone.MembraneSynth({ volume: -6 }).toDestination();
                const now = Tone.now() + 0.05;
                const beatSec = 0.5;
                for (let i = 0; i < 3; i += 1) {
                  synth.triggerAttackRelease(i === 0 ? "C5" : "C4", "16n", now + i * beatSec, 0.9);
                }
                countInTimerRef.current = window.setTimeout(async () => {
                  countInTimerRef.current = null;
                  try {
                    const rec = getMasterRecorder();
                    await rec.start();
                    setStemRecPhase("recording");
                  } catch (e) {
                    setStemRecTarget(null);
                    setStemRecPhase("idle");
                    alert(e instanceof Error ? e.message : "Failed to start recording");
                  }
                }, 3 * beatSec * 1000);
              } catch {
                // If click synth fails, still try to record after the delay
                countInTimerRef.current = window.setTimeout(async () => {
                  countInTimerRef.current = null;
                  try {
                    const rec = getMasterRecorder();
                    await rec.start();
                    setStemRecPhase("recording");
                  } catch (e) {
                    setStemRecTarget(null);
                    setStemRecPhase("idle");
                    alert(e instanceof Error ? e.message : "Failed to start recording");
                  }
                }, 1500);
              }
            }}
          />

          <Divider />

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography fontWeight={900}>Submit a stem (pending approval)</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Upload an audio file as a proposed stem. The project owner approves/rejects it.
            </Typography>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mt: 2 }} alignItems={{ md: "center" }}>
              <FormControl sx={{ minWidth: 220 }} size="small">
                <InputLabel id="submit-stem-type">Stem</InputLabel>
                <Select
                  labelId="submit-stem-type"
                  label="Stem"
                  value={submitStemType}
                  onChange={(e) => setSubmitStemType(String(e.target.value))}
                >
                  <MenuItem value="vocals">Vocals</MenuItem>
                  <MenuItem value="guitar_synth">Guitar / Synth</MenuItem>
                  <MenuItem value="bass">Bass</MenuItem>
                  <MenuItem value="drums">Drums</MenuItem>
                </Select>
              </FormControl>

              <FormControl sx={{ minWidth: 160 }} size="small">
                <InputLabel id="submit-col">Column</InputLabel>
                <Select
                  labelId="submit-col"
                  label="Column"
                  value={String(submitColumn)}
                  onChange={(e) => setSubmitColumn(Number(e.target.value))}
                >
                  {Array.from({ length: columnCount }).map((_, i) => (
                    <MenuItem key={i} value={i}>
                      {i + 1}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                size="small"
                label="Note (optional)"
                value={submitNote}
                onChange={(e) => setSubmitNote(e.target.value)}
                sx={{ flex: 1, minWidth: 220 }}
              />

              <Button variant="outlined" component="label" disabled={isSubmittingStem || !userId}>
                Choose audio file
                <input
                  hidden
                  type="file"
                  accept="audio/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    if (!userId) {
                      alert("Please login again.");
                      return;
                    }
                    setIsSubmittingStem(true);
                    try {
                      // 1) Create stem row (pending)
                      const { data: stem, error: stemErr } = await supabase
                        .from("stems")
                        .insert({
                          project_id: projectId,
                          stem_type: submitStemType,
                          column_index: submitColumn,
                          status: "pending",
                          created_by: userId,
                        })
                        .select("id")
                        .single();
                      if (stemErr) throw stemErr;

                      // 2) Upload audio to Storage bucket "stems"
                      const ext = (file.name.split(".").pop() || "webm").toLowerCase();
                      const storagePath = `projects/${projectId}/stems/${submitStemType}/col-${submitColumn + 1}/${Date.now()}.${ext}`;
                      const { error: upErr } = await supabase.storage
                        .from("stems")
                        .upload(storagePath, file, { contentType: file.type || "application/octet-stream" });
                      if (upErr) throw upErr;

                      // 3) Create stem_assets row
                      const { error: assetErr } = await supabase.from("stem_assets").insert({
                        stem_id: stem.id,
                        kind: "audio",
                        storage_path: storagePath,
                        metadata_json: { originalName: file.name, note: submitNote || null },
                      });
                      if (assetErr) throw assetErr;

                      alert("Submitted! Waiting for owner approval.");

                      const { data: pending } = await supabase
                        .from("stems")
                        .select("id,stem_type,column_index,created_at,created_by")
                        .eq("project_id", projectId)
                        .eq("status", "pending")
                        .order("created_at", { ascending: false });
                      setPendingStems((pending as any[]) ?? []);
                    } catch (err) {
                      alert(err instanceof Error ? err.message : "Submit failed");
                    } finally {
                      setIsSubmittingStem(false);
                    }
                  }}
                />
              </Button>
            </Stack>

            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
              Requires a Supabase Storage bucket named <code>stems</code> with upload allowed for authenticated users.
            </Typography>
          </Paper>

          {isOwner ? (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography fontWeight={900}>Owner review (pending stems)</Typography>
              {pendingStems.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  No pending stems.
                </Typography>
              ) : (
                <List>
                  {pendingStems.map((s) => (
                    <ListItem
                      key={s.id}
                      secondaryAction={
                        <Stack direction="row" spacing={1}>
                          <Button
                            size="small"
                            variant="contained"
                            onClick={async () => {
                              const { error } = await supabase
                                .from("stems")
                                .update({ status: "approved", approved_by: userId })
                                .eq("id", s.id);
                              if (error) alert(error.message);
                              const { data: pending } = await supabase
                                .from("stems")
                                .select("id,stem_type,column_index,created_at,created_by")
                                .eq("project_id", projectId)
                                .eq("status", "pending")
                                .order("created_at", { ascending: false });
                              setPendingStems((pending as any[]) ?? []);
                            }}
                          >
                            Approve
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            onClick={async () => {
                              const { error } = await supabase
                                .from("stems")
                                .update({ status: "rejected", approved_by: userId })
                                .eq("id", s.id);
                              if (error) alert(error.message);
                              const { data: pending } = await supabase
                                .from("stems")
                                .select("id,stem_type,column_index,created_at,created_by")
                                .eq("project_id", projectId)
                                .eq("status", "pending")
                                .order("created_at", { ascending: false });
                              setPendingStems((pending as any[]) ?? []);
                            }}
                          >
                            Reject
                          </Button>
                        </Stack>
                      }
                    >
                      <ListItemText
                        primary={`${s.stem_type} • Col ${s.column_index + 1}`}
                        secondary={`Submitted ${new Date(s.created_at).toLocaleString()} by ${s.created_by}`}
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </Paper>
          ) : null}

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography fontWeight={900}>Approved stems</Typography>
              <Button
                size="small"
                variant="outlined"
                onClick={async () => {
                  // quick refresh
                  const { data: stems } = await supabase
                    .from("stems")
                    .select("id,stem_type,column_index,status,stem_assets(kind,storage_path)")
                    .eq("project_id", projectId)
                    .eq("status", "approved");
                  const audio: { stemId: string; stemType: string; columnIndex: number; url: string }[] = [];
                  for (const s of (stems as any[]) ?? []) {
                    const assets = (s.stem_assets as any[]) ?? [];
                    for (const a of assets) {
                      if (a.kind !== "audio") continue;
                      const p = String(a.storage_path ?? "");
                      if (!p) continue;
                      if (p.startsWith("http://") || p.startsWith("https://")) {
                        audio.push({ stemId: s.id, stemType: s.stem_type, columnIndex: s.column_index, url: p });
                      } else {
                        const { data } = supabase.storage.from("stems").getPublicUrl(p);
                        if (data.publicUrl) audio.push({ stemId: s.id, stemType: s.stem_type, columnIndex: s.column_index, url: data.publicUrl });
                      }
                    }
                  }
                  setApprovedAudio(audio);
                }}
              >
                Refresh
              </Button>
            </Stack>

            {approvedAudio.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                No approved audio stems yet.
              </Typography>
            ) : (
              <List>
                {approvedAudio.map((s) => (
                  <ListItem key={`${s.stemId}-${s.url}`} disablePadding secondaryAction={
                    playingStemId === s.stemId ? (
                      <IconButton onClick={stopApprovedStem} aria-label="Stop">
                        <StopIcon />
                      </IconButton>
                    ) : (
                      <IconButton onClick={() => void playApprovedStem(s.stemId, s.url)} aria-label="Play">
                        <PlayArrowIcon />
                      </IconButton>
                    )
                  }>
                    <ListItemButton onClick={() => (playingStemId === s.stemId ? stopApprovedStem() : void playApprovedStem(s.stemId, s.url))}>
                      <ListItemText primary={`${s.stemType} • Col ${s.columnIndex + 1}`} secondary={s.url} />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}

            <Typography variant="caption" color="text.secondary">
              Playback currently expects audio assets to be either a full URL, or a path in a Supabase Storage bucket named <code>stems</code>.
            </Typography>
          </Paper>

          <Typography color="text.secondary" variant="body2">
            Next: recording (master mix), then submit/approve flow + uploading stems into Storage.
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
}


