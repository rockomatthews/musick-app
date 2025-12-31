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
  const [bpm, setBpm] = React.useState(120);
  const [columnDurations, setColumnDurations] = React.useState<Map<number, number>>(new Map()); // seconds
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
  const [cellSubmissions, setCellSubmissions] = React.useState<
    Map<string, { userId: string; stemId: string; audioUrl: string | null; locked: boolean }[]>
  >(new Map());
  const [profileMap, setProfileMap] = React.useState<Map<string, { label: string; avatarUrl: string | null }>>(
    new Map(),
  );

  const [stemRecTarget, setStemRecTarget] = React.useState<{ stemType: StemType; columnIndex: number } | null>(null);
  const [stemRecPhase, setStemRecPhase] = React.useState<"idle" | "countin" | "recording">("idle");
  const countInTimerRef = React.useRef<number | null>(null);
  const cellPlayerRef = React.useRef<Tone.Player | null>(null);
  const stemAutoStopRef = React.useRef<number | null>(null);
  const stemRecTargetRef = React.useRef<{ stemType: StemType; columnIndex: number } | null>(null);
  const stemRecPhaseRef = React.useRef<"idle" | "countin" | "recording">("idle");

  React.useEffect(() => {
    stemRecTargetRef.current = stemRecTarget;
  }, [stemRecTarget]);
  React.useEffect(() => {
    stemRecPhaseRef.current = stemRecPhase;
  }, [stemRecPhase]);

  const stopAndSubmitStemRecording = React.useCallback(
    async (stemType: StemType, columnIndex: number) => {
      // Ensure we’re still recording this exact target
      if (stemRecPhaseRef.current !== "recording") return;
      const t = stemRecTargetRef.current;
      if (!t || t.stemType !== stemType || t.columnIndex !== columnIndex) return;

      if (stemAutoStopRef.current) window.clearTimeout(stemAutoStopRef.current);
      stemAutoStopRef.current = null;

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
            metadata_json: {
              source: "record",
              countIn: 3,
              bpm,
              durationSec: columnDurations.get(columnIndex) ?? 8,
            },
          });
          if (assetErr) throw assetErr;
        } catch (e) {
          // Roll back the stem row if upload/asset insert fails.
          await supabase.from("stems").delete().eq("id", stem.id);
          throw e;
        }

        alert("Recorded + submitted!");
        await refreshStems();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Recording submit failed");
        await refreshStems();
      }
    },
    [bpm, columnDurations, projectId, refreshStems, supabase, userId],
  );

  const refreshStems = React.useCallback(async () => {
    const { data: stems } = await supabase
      .from("stems")
      .select("id,stem_type,column_index,status,created_at,created_by,locked,stem_assets(kind,storage_path)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    const statusMap = new Map<string, StemBoxStatus>();
    const approvedIdMap = new Map<string, string>();
    const latestUrlMap = new Map<string, string>();
    const latestStemIdMap = new Map<string, string>();
    const pending: { id: string; stem_type: string; column_index: number; created_at: string; created_by: string }[] = [];
    const approvedAudioNext: { stemId: string; stemType: string; columnIndex: number; url: string }[] = [];
    const submissionsMap = new Map<string, { userId: string; stemId: string; audioUrl: string | null; locked: boolean }[]>();
    const userIds = new Set<string>();

    // Iterate newest→oldest (we requested created_at desc), so first audio we see per cell becomes "latest"
    for (const s of (stems as any[]) ?? []) {
      const k = `${s.stem_type}:${s.column_index}`;
      const st: "pending" | "approved" | "rejected" = s.status;
      const locked = Boolean(s.locked);

      // Choose best visible status per cell: approved > pending > empty
      const cur = statusMap.get(k);
      if (st === "approved") statusMap.set(k, "approved");
      else if (st === "pending" && cur !== "approved") statusMap.set(k, "pending");

      if (st === "approved") {
        approvedIdMap.set(k, s.id);
      }

      const assets = (s.stem_assets as any[]) ?? [];
      let audioUrl: string | null = null;
      for (const a of assets) {
        if (a.kind !== "audio") continue;
        const p = String(a.storage_path ?? "");
        if (!p) continue;
        const url =
          p.startsWith("http://") || p.startsWith("https://")
            ? p
            : supabase.storage.from("stems").getPublicUrl(p).data.publicUrl ?? null;
        if (!url) continue;
        audioUrl = audioUrl ?? url;

        // For the global list, show approved and pending separately? For now: include both so "anyone can listen"
        approvedAudioNext.push({ stemId: s.id, stemType: s.stem_type, columnIndex: s.column_index, url });

        // For per-cell playback, keep the newest stem with audio (pending or approved)
        if (!latestUrlMap.has(k)) {
          latestUrlMap.set(k, url);
          latestStemIdMap.set(k, s.id);
        }
      }

      // Track submissions (for icon row)
      const uid = String(s.created_by ?? "");
      if (uid) userIds.add(uid);
      const list = submissionsMap.get(k) ?? [];
      list.push({ userId: uid, stemId: s.id, audioUrl, locked });
      submissionsMap.set(k, list);

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
    setCellSubmissions(submissionsMap);

    // Fetch profile labels/avatars for contributor icons
    if (userIds.size > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id,username,display_name,avatar_path")
        .in("user_id", Array.from(userIds));
      const map = new Map<string, { label: string; avatarUrl: string | null }>();
      for (const p of (profs as any[]) ?? []) {
        const label = String(p.username || p.display_name || p.user_id);
        const avatarPath = p.avatar_path ? String(p.avatar_path) : null;
        const avatarUrl =
          avatarPath && (avatarPath.startsWith("http://") || avatarPath.startsWith("https://"))
            ? avatarPath
            : avatarPath
              ? supabase.storage.from("avatars").getPublicUrl(avatarPath).data.publicUrl ?? null
              : null;
        map.set(String(p.user_id), { label, avatarUrl });
      }
      setProfileMap(map);
    }
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
        .select("title,column_count,owner_user_id,cover_image_path,bpm")
        .eq("id", projectId)
        .single();
      setTitle(data?.title ?? "Project");
      if (typeof data?.column_count === "number" && data.column_count > 0) {
        setColumnCount(data.column_count);
      }
      if (typeof data?.bpm === "number" && data.bpm > 0) setBpm(data.bpm);
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

      // Load per-column durations
      const { data: cols } = await supabase
        .from("project_columns")
        .select("column_index,duration_sec")
        .eq("project_id", projectId);
      const map = new Map<number, number>();
      for (const c of (cols as any[]) ?? []) {
        map.set(Number(c.column_index), Number(c.duration_sec));
      }
      setColumnDurations(map);
    })();
  }, [projectId, refreshStems, router, supabase]);

  async function addColumn() {
    const next = columnCount + 1;
    setColumnCount(next);
    await supabase.from("projects").update({ column_count: next }).eq("id", projectId);

    // Ensure duration row exists for the new column
    await supabase.from("project_columns").upsert(
      { project_id: projectId, column_index: next - 1, duration_sec: 8 },
      { onConflict: "project_id,column_index" },
    );
    setColumnDurations((prev) => {
      const m = new Map(prev);
      if (!m.has(next - 1)) m.set(next - 1, 8);
      return m;
    });
  }

  async function saveBpm(nextBpm: number) {
    setBpm(nextBpm);
    await supabase.from("projects").update({ bpm: nextBpm }).eq("id", projectId);
  }

  async function saveColumnDuration(columnIndex: number, seconds: number) {
    setColumnDurations((prev) => {
      const m = new Map(prev);
      m.set(columnIndex, seconds);
      return m;
    });
    await supabase.from("project_columns").upsert(
      { project_id: projectId, column_index: columnIndex, duration_sec: seconds },
      { onConflict: "project_id,column_index" },
    );
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
              <Typography fontWeight={900}>Project timing</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                BPM controls the click/count-in. Column duration auto-stops stem recordings.
              </Typography>
              <Stack direction={{ xs: "column", md: "row" }} spacing={3} sx={{ mt: 2 }}>
                <Box sx={{ minWidth: 260 }}>
                  <Typography variant="body2" color="text.secondary">
                    BPM: {bpm}
                  </Typography>
                  <Slider
                    min={60}
                    max={200}
                    step={1}
                    value={bpm}
                    onChange={(_, v) => setBpm(Number(v))}
                    onChangeCommitted={(_, v) => void saveBpm(Number(v))}
                  />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Duration per column (seconds)
                  </Typography>
                  <Stack direction="row" spacing={2} sx={{ overflowX: "auto", pb: 1 }}>
                    {Array.from({ length: columnCount }).map((_, i) => (
                      <Box key={i} sx={{ minWidth: 180 }}>
                        <Typography fontWeight={800} variant="body2">
                          Column {i + 1}
                        </Typography>
                        <Slider
                          min={2}
                          max={60}
                          step={1}
                          value={columnDurations.get(i) ?? 8}
                          onChange={(_, v) => {
                            const sec = Number(v);
                            setColumnDurations((prev) => {
                              const m = new Map(prev);
                              m.set(i, sec);
                              return m;
                            });
                          }}
                          onChangeCommitted={(_, v) => void saveColumnDuration(i, Number(v))}
                        />
                        <Typography variant="caption" color="text.secondary">
                          {columnDurations.get(i) ?? 8}s
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              </Stack>
            </Paper>
          ) : null}
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
            submissionsFor={(stemType, columnIndex) => {
              const k = `${stemType}:${columnIndex}`;
              const subs = cellSubmissions.get(k) ?? [];
              // Show newest first, but make locked bubble stand out (keep its locked flag)
              return subs
                .filter((s) => Boolean(s.audioUrl))
                .slice(0, 12)
                .map((s) => {
                  const p = profileMap.get(s.userId);
                  return {
                    userId: s.userId,
                    stemId: s.stemId,
                    avatarUrl: p?.avatarUrl ?? null,
                    label: p?.label ?? s.userId.slice(0, 6),
                    locked: s.locked,
                  };
                });
            }}
            isOwner={isOwner}
            onPlayStem={async (stemId) => {
              const found = Array.from(cellSubmissions.values())
                .flat()
                .find((s) => s.stemId === stemId);
              const url = found?.audioUrl;
              if (!url) return;
              await playApprovedStem(stemId, url);
            }}
            onLockStem={async (stemId) => {
              if (!isOwner) return;
              // Lock exactly this stem in its cell (unique index enforces 1 per cell)
              const { data: row } = await supabase
                .from("stems")
                .select("id,project_id,stem_type,column_index")
                .eq("id", stemId)
                .maybeSingle();
              const r = row as any;
              if (!r) return;
              // Unlock others in same cell, then lock this one
              await supabase
                .from("stems")
                .update({ locked: false })
                .eq("project_id", r.project_id)
                .eq("stem_type", r.stem_type)
                .eq("column_index", r.column_index);
              const { error } = await supabase.from("stems").update({ locked: true }).eq("id", stemId);
              if (error) alert(error.message);
              await refreshStems();
            }}
            onPlayToggle={async (stemType, columnIndex) => {
              const k = `${stemType}:${columnIndex}`;
              // Default play should use locked if available; otherwise use latest.
              const locked = (cellSubmissions.get(k) ?? []).find((s) => s.locked && s.audioUrl)?.audioUrl ?? null;
              const url = locked ?? cellLatestAudioUrl.get(k);
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
                  await stopAndSubmitStemRecording(stemType, columnIndex);
                  return;
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

              // 3-click count-in at project BPM
              try {
                const synth = new Tone.MembraneSynth({ volume: -6 }).toDestination();
                const now = Tone.now() + 0.05;
                const beatSec = 60 / Math.max(1, bpm);
                for (let i = 0; i < 3; i += 1) {
                  synth.triggerAttackRelease(i === 0 ? "C5" : "C4", "16n", now + i * beatSec, 0.9);
                }
                countInTimerRef.current = window.setTimeout(async () => {
                  countInTimerRef.current = null;
                  try {
                    const rec = getMasterRecorder();
                    await rec.start();
                    setStemRecPhase("recording");

                    // Auto-stop at per-column duration
                    const durationSec = columnDurations.get(columnIndex) ?? 8;
                    stemAutoStopRef.current = window.setTimeout(() => {
                      void stopAndSubmitStemRecording(stemType, columnIndex);
                    }, durationSec * 1000);
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

                    const durationSec = columnDurations.get(columnIndex) ?? 8;
                    stemAutoStopRef.current = window.setTimeout(() => {
                      void stopAndSubmitStemRecording(stemType, columnIndex);
                    }, durationSec * 1000);
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
            <Typography fontWeight={900}>Submit a stem</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Upload an audio file as a new version for this stem box. The owner can lock a favorite version as default.
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

                      alert("Submitted!");
                      await refreshStems();
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

          <Typography color="text.secondary" variant="body2">
            Tip: click an avatar in a stem box to play that user’s submission. The owner can lock a favorite as the default play.
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
}


