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
  Dialog,
  DialogContent,
  DialogTitle,
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
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { StemGrid } from "@/components/stems/StemGrid";
import { getAudioEngine } from "@/audio/engine";
import { getMidiManager } from "@/midi/manager";
import * as Tone from "tone";
import { getMasterRecorder, NodeRecorder } from "@/audio/recorder";
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
  const [virtualMode, setVirtualMode] = React.useState<"synth" | "drums">("synth");
  const [fxDialogStemType, setFxDialogStemType] = React.useState<StemType | null>(null);

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
    Map<
      string,
      {
        userId: string;
        stemId: string;
        audioUrl: string | null;
        storagePath: string | null;
        locked: boolean;
        playCount: number;
        createdAt: string;
      }[]
    >
  >(new Map());
  const [cellSelectedStemId, setCellSelectedStemId] = React.useState<Map<string, string>>(new Map());
  const [profileMap, setProfileMap] = React.useState<Map<string, { label: string; avatarUrl: string | null }>>(
    new Map(),
  );
  const [trackSettings, setTrackSettings] = React.useState<
    Map<StemType, { inputMode: "audio" | "midi" | "virtual_synth" | "virtual_drums"; recordMode: "dry" | "wet"; fx: any }>
  >(new Map());
  const [transportMode, setTransportMode] = React.useState<"scene" | "arrangement">("scene");
  const [transportLoop, setTransportLoop] = React.useState(true);
  const [transportPlaying, setTransportPlaying] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState(0);
  const transportTimerRef = React.useRef<number | null>(null);
  const transportPlayersRef = React.useRef<Map<string, Tone.Player>>(new Map());

  const [stemRecTarget, setStemRecTarget] = React.useState<{ stemType: StemType; columnIndex: number } | null>(null);
  const [stemRecPhase, setStemRecPhase] = React.useState<"idle" | "countin" | "recording">("idle");
  const countInTimerRef = React.useRef<number | null>(null);
  const cellPlayerRef = React.useRef<Tone.Player | null>(null);
  const stemAutoStopRef = React.useRef<number | null>(null);
  const stemRecorderRef = React.useRef<NodeRecorder | null>(null);
  const [armedVirtualRecordTarget, setArmedVirtualRecordTarget] = React.useState<{ stemType: StemType; columnIndex: number } | null>(
    null,
  );
  const stemRecTargetRef = React.useRef<{ stemType: StemType; columnIndex: number } | null>(null);
  const stemRecPhaseRef = React.useRef<"idle" | "countin" | "recording">("idle");

  React.useEffect(() => {
    stemRecTargetRef.current = stemRecTarget;
  }, [stemRecTarget]);
  React.useEffect(() => {
    stemRecPhaseRef.current = stemRecPhase;
  }, [stemRecPhase]);

  // If user armed a virtual recording, start count-in only after the virtual instrument dialog is opened.
  React.useEffect(() => {
    if (!armedVirtualRecordTarget) return;
    if (!virtualOpen) return;
    if (stemRecPhase !== "idle") return;
    const { stemType, columnIndex } = armedVirtualRecordTarget;
    // Start the same recording flow as clicking the box, now that virtual is open.
    void (async () => {
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
            const trackCfg = trackSettings.get(stemType) ?? { recordMode: "dry" as const };
            const sourceTone =
              trackCfg.recordMode === "wet" ? engine.getTrackWetOutput(stemType) : engine.getTrackDryInput(stemType);
            const sourceAudio = (sourceTone as any)?.output as AudioNode | undefined;
            if (!sourceAudio) throw new Error("Failed to initialize recording source");
            const rec = new NodeRecorder();
            await rec.startFrom(sourceAudio);
            stemRecorderRef.current = rec;
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
          } finally {
            setArmedVirtualRecordTarget(null);
          }
        }, 3 * beatSec * 1000);
      } catch {
        // If click synth fails, still try to record after the delay
        countInTimerRef.current = window.setTimeout(async () => {
          countInTimerRef.current = null;
          try {
            const trackCfg = trackSettings.get(stemType) ?? { recordMode: "dry" as const };
            const sourceTone =
              trackCfg.recordMode === "wet" ? engine.getTrackWetOutput(stemType) : engine.getTrackDryInput(stemType);
            const sourceAudio = (sourceTone as any)?.output as AudioNode | undefined;
            if (!sourceAudio) throw new Error("Failed to initialize recording source");
            const rec = new NodeRecorder();
            await rec.startFrom(sourceAudio);
            stemRecorderRef.current = rec;
            setStemRecPhase("recording");

            const durationSec = columnDurations.get(columnIndex) ?? 8;
            stemAutoStopRef.current = window.setTimeout(() => {
              void stopAndSubmitStemRecording(stemType, columnIndex);
            }, durationSec * 1000);
          } catch (e) {
            setStemRecTarget(null);
            setStemRecPhase("idle");
            alert(e instanceof Error ? e.message : "Failed to start recording");
          } finally {
            setArmedVirtualRecordTarget(null);
          }
        }, 1500);
      }
    })();
  }, [
    armedVirtualRecordTarget,
    bpm,
    columnDurations,
    stemRecPhase,
    stopAndSubmitStemRecording,
    trackSettings,
    virtualOpen,
  ]);

  const refreshStems = React.useCallback(async () => {
    const { data: stems } = await supabase
      .from("stems")
      .select("id,stem_type,column_index,status,created_at,created_by,locked,play_count,stem_assets(kind,storage_path)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    const statusMap = new Map<string, StemBoxStatus>();
    const approvedIdMap = new Map<string, string>();
    const latestUrlMap = new Map<string, string>();
    const latestStemIdMap = new Map<string, string>();
    const pending: { id: string; stem_type: string; column_index: number; created_at: string; created_by: string }[] = [];
    const approvedAudioNext: { stemId: string; stemType: string; columnIndex: number; url: string }[] = [];
    const submissionsMap = new Map<
      string,
      {
        userId: string;
        stemId: string;
        audioUrl: string | null;
        storagePath: string | null;
        locked: boolean;
        playCount: number;
        createdAt: string;
      }[]
    >();
    const userIds = new Set<string>();

    // Iterate newest→oldest (we requested created_at desc), so first audio we see per cell becomes "latest"
    for (const s of (stems as any[]) ?? []) {
      const k = `${s.stem_type}:${s.column_index}`;
      const st: "pending" | "approved" | "rejected" = s.status;
      const locked = Boolean(s.locked);
      const playCount = Number(s.play_count ?? 0);
      const createdAt = String(s.created_at ?? "");

      // Choose best visible status per cell: approved > pending > empty
      const cur = statusMap.get(k);
      if (st === "approved") statusMap.set(k, "approved");
      else if (st === "pending" && cur !== "approved") statusMap.set(k, "pending");

      if (st === "approved") {
        approvedIdMap.set(k, s.id);
      }

      const assets = (s.stem_assets as any[]) ?? [];
      let audioUrl: string | null = null;
      let storagePath: string | null = null;
      for (const a of assets) {
        if (a.kind !== "audio") continue;
        const p = String(a.storage_path ?? "");
        if (!p) continue;
        storagePath = storagePath ?? p;
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
      list.push({ userId: uid, stemId: s.id, audioUrl, storagePath, locked, playCount, createdAt });
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

  const stopAndSubmitStemRecording = React.useCallback(
    async (stemType: StemType, columnIndex: number) => {
      // Ensure we’re still recording this exact target
      if (stemRecPhaseRef.current !== "recording") return;
      const t = stemRecTargetRef.current;
      if (!t || t.stemType !== stemType || t.columnIndex !== columnIndex) return;

      if (stemAutoStopRef.current) window.clearTimeout(stemAutoStopRef.current);
      stemAutoStopRef.current = null;

      try {
        const rec = stemRecorderRef.current;
        if (!rec) throw new Error("Stem recorder not initialized");
        const res = await rec.stop();
        stemRecorderRef.current = null;
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

          const trackCfg = trackSettings.get(stemType) ?? { inputMode: "audio", recordMode: "dry", fx: {} };
          const { error: assetErr } = await supabase.from("stem_assets").insert({
            stem_id: stem.id,
            kind: "audio",
            storage_path: storagePath,
            metadata_json: {
              source: "record",
              countIn: 3,
              bpm,
              durationSec: columnDurations.get(columnIndex) ?? 8,
              input_mode: trackCfg.inputMode,
              record_mode: trackCfg.recordMode,
              fx_snapshot: trackCfg.fx ?? {},
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
    [bpm, columnDurations, projectId, refreshStems, supabase, trackSettings, userId],
  );

  const stopTransport = React.useCallback(() => {
    if (transportTimerRef.current) window.clearTimeout(transportTimerRef.current);
    transportTimerRef.current = null;
    for (const p of transportPlayersRef.current.values()) {
      try {
        p.stop();
        p.dispose();
      } catch {
        // ignore
      }
    }
    transportPlayersRef.current.clear();
    setTransportPlaying(false);
  }, []);

  function getBestClip(stemType: StemType, columnIndex: number): { stemId: string; url: string } | null {
    const k = `${stemType}:${columnIndex}`;
    const subs = cellSubmissions.get(k) ?? [];
    const locked = subs.find((s) => s.locked && s.audioUrl) ?? null;
    const selectedStemId = cellSelectedStemId.get(k) ?? null;
    const selected = selectedStemId ? subs.find((s) => s.stemId === selectedStemId && s.audioUrl) : null;
    const best =
      locked ??
      selected ??
      subs
        .filter((s) => Boolean(s.audioUrl))
        .sort((a, b) => {
          if (b.playCount !== a.playCount) return b.playCount - a.playCount;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        })[0] ??
      null;
    if (!best?.audioUrl) return null;
    return { stemId: best.stemId, url: best.audioUrl };
  }

  const playSection = React.useCallback(
    async (sectionIndex: number) => {
      const engine = getAudioEngine();
      await engine.enable();

      // Stop any manual cell playback first
      try {
        cellPlayerRef.current?.stop();
        cellPlayerRef.current?.dispose();
      } catch {
        // ignore
      }
      cellPlayerRef.current = null;
      setPlayingCellKey(null);

      // Stop previous transport players (hard-cut)
      for (const p of transportPlayersRef.current.values()) {
        try {
          p.stop();
          p.dispose();
        } catch {
          // ignore
        }
      }
      transportPlayersRef.current.clear();

      const startAt = Tone.now() + 0.05;
      const stemTypes: StemType[] = ["vocals", "guitar_synth", "bass", "drums"];
      for (const st of stemTypes) {
        const clip = getBestClip(st, sectionIndex);
        if (!clip) continue;
        const player = new Tone.Player(clip.url);
        player.connect(engine.getTrackDryInput(st));
        await player.load(clip.url);
        player.start(startAt);
        transportPlayersRef.current.set(`${st}:${sectionIndex}`, player);
        try {
          await supabase.rpc("increment_stem_play_count", { stem_id: clip.stemId });
        } catch {
          // ignore
        }
      }
    },
    [cellSelectedStemId, cellSubmissions, supabase],
  );

  const startSceneSection = React.useCallback(
    async (sectionIndex: number) => {
      if (transportPlaying) stopTransport();
      setTransportMode("scene");
      setTransportLoop(true);
      setTransportPlaying(true);
      setActiveSection(sectionIndex);

      const playOneAndSchedule = async () => {
        await playSection(sectionIndex);
        const durationSec = columnDurations.get(sectionIndex) ?? 8;
        transportTimerRef.current = window.setTimeout(() => {
          void playOneAndSchedule();
        }, durationSec * 1000);
      };

      await playOneAndSchedule();
    },
    [columnDurations, playSection, stopTransport, transportPlaying],
  );

  const startTransport = React.useCallback(async () => {
    if (transportPlaying) return;
    setTransportPlaying(true);

    const playOneAndSchedule = async (sectionIndex: number) => {
      setActiveSection(sectionIndex);
      await playSection(sectionIndex);
      const durationSec = columnDurations.get(sectionIndex) ?? 8;
      transportTimerRef.current = window.setTimeout(() => {
        void (async () => {
          if (transportMode === "scene") {
            if (transportLoop) {
              await playOneAndSchedule(sectionIndex);
            } else {
              stopTransport();
            }
            return;
          }
          // arrangement
          const next = sectionIndex + 1;
          if (next >= columnCount) {
            stopTransport();
            return;
          }
          await playOneAndSchedule(next);
        })();
      }, durationSec * 1000);
    };

    const startSectionIndex = transportMode === "scene" ? activeSection : 0;
    await playOneAndSchedule(startSectionIndex);
  }, [
    activeSection,
    columnCount,
    columnDurations,
    playSection,
    stopTransport,
    transportLoop,
    transportMode,
    transportPlaying,
  ]);

  React.useEffect(() => {
    return () => {
      stopTransport();
    };
  }, [stopTransport]);

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

      // Load per-track settings (input + record mode + fx)
      const stemTypes: StemType[] = ["vocals", "guitar_synth", "bass", "drums"];
      const defaults = new Map<StemType, { inputMode: any; recordMode: any; fx: any }>([
        ["vocals", { inputMode: "audio", recordMode: "dry", fx: { gain: 1, delayWet: 0, reverbWet: 0 } }],
        ["guitar_synth", { inputMode: "midi", recordMode: "dry", fx: { gain: 1, delayWet: 0.1, reverbWet: 0.1 } }],
        ["bass", { inputMode: "midi", recordMode: "dry", fx: { gain: 1, delayWet: 0, reverbWet: 0.05 } }],
        ["drums", { inputMode: "virtual_drums", recordMode: "dry", fx: { gain: 1, delayWet: 0, reverbWet: 0.05 } }],
      ]);

      const { data: tracks } = await supabase
        .from("stem_tracks")
        .select("stem_type,input_mode,record_mode,fx_json")
        .eq("project_id", projectId);

      const mapTracks = new Map<StemType, { inputMode: any; recordMode: any; fx: any }>();
      for (const st of stemTypes) {
        mapTracks.set(st, defaults.get(st)!);
      }
      for (const t of (tracks as any[]) ?? []) {
        const st = String(t.stem_type) as StemType;
        if (!stemTypes.includes(st)) continue;
        mapTracks.set(st, {
          inputMode: t.input_mode ?? mapTracks.get(st)!.inputMode,
          recordMode: t.record_mode ?? mapTracks.get(st)!.recordMode,
          fx: (t.fx_json as any) ?? mapTracks.get(st)!.fx,
        });
      }
      setTrackSettings(mapTracks);
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

  async function upsertTrack(stemType: StemType, next: { inputMode: string; recordMode: string; fx: any }) {
    // Only the owner can update track settings (RLS). Non-owners will just update local UI.
    setTrackSettings((prev) => {
      const m = new Map(prev);
      m.set(stemType, next as any);
      return m;
    });
    if (!isOwner) return;
    await supabase.from("stem_tracks").upsert(
      {
        project_id: projectId,
        stem_type: stemType,
        input_mode: next.inputMode,
        record_mode: next.recordMode,
        fx_json: next.fx ?? {},
      },
      { onConflict: "project_id,stem_type" },
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
    // Route MIDI synth into the first track configured for MIDI (fallback: guitar/synth)
    const stemTypes: StemType[] = ["vocals", "guitar_synth", "bass", "drums"];
    const target =
      stemTypes.find((st) => trackSettings.get(st)?.inputMode === "midi") ??
      ("guitar_synth" as StemType);
    mgr.setOutput(engine.getTrackDryInput(target));
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

  React.useEffect(() => {
    if (!trackSettings || trackSettings.size === 0) return;
    const engine = getAudioEngine();
    void (async () => {
      await engine.enable();
      for (const [stemType, cfg] of trackSettings.entries()) {
        const fx = cfg.fx ?? {};
        engine.setTrackFx(stemType, {
          gain: typeof fx.gain === "number" ? fx.gain : 1,
          delayWet: typeof fx.delayWet === "number" ? fx.delayWet : 0,
          reverbWet: typeof fx.reverbWet === "number" ? fx.reverbWet : 0,
          eqLow: typeof fx.eqLow === "number" ? fx.eqLow : 0,
          eqMid: typeof fx.eqMid === "number" ? fx.eqMid : 0,
          eqHigh: typeof fx.eqHigh === "number" ? fx.eqHigh : 0,
          compThreshold: typeof fx.compThreshold === "number" ? fx.compThreshold : -18,
          compRatio: typeof fx.compRatio === "number" ? fx.compRatio : 3,
          distortion: typeof fx.distortion === "number" ? fx.distortion : 0,
          distortionWet: typeof fx.distortionWet === "number" ? fx.distortionWet : 0,
        });
      }

      // Monitoring routes live audio input into the first Audio track (fallback: vocals)
      const stemTypes: StemType[] = ["vocals", "guitar_synth", "bass", "drums"];
      const audioTarget =
        stemTypes.find((st) => trackSettings.get(st)?.inputMode === "audio") ??
        ("vocals" as StemType);
      engine.setMonitorTarget(engine.getTrackDryInput(audioTarget));

      // If MIDI is enabled, route it to the currently configured MIDI track
      if (midiEnabled) {
        const midiTarget =
          stemTypes.find((st) => trackSettings.get(st)?.inputMode === "midi") ??
          ("guitar_synth" as StemType);
        getMidiManager().setOutput(engine.getTrackDryInput(midiTarget));
      }
    })();
  }, [midiEnabled, trackSettings]);

  async function playStem(stemType: StemType, stemId: string, url: string) {
    const engine = getAudioEngine();
    await engine.enable();

    // Track popularity (safe via RPC)
    try {
      await supabase.rpc("increment_stem_play_count", { stem_id: stemId });
    } catch {
      // ignore
    }

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
    player.connect(engine.getTrackDryInput(stemType));
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
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel id="virtual-mode">Virtual mode</InputLabel>
                  <Select
                    labelId="virtual-mode"
                    label="Virtual mode"
                    value={virtualMode}
                    onChange={(e) => setVirtualMode(e.target.value as any)}
                  >
                    <MenuItem value="synth">Synth</MenuItem>
                    <MenuItem value="drums">Drum machine</MenuItem>
                  </Select>
                </FormControl>
                <Typography variant="body2" color="text.secondary">
                  Play with A/W/S/E/D… then record into a stem box.
                </Typography>
              </Stack>
            </Box>
          </Stack>

          <VirtualKeyboardDialog
            open={virtualOpen}
            mode={virtualMode}
            onModeChange={setVirtualMode}
            onClose={() => setVirtualOpen(false)}
            synthOutputStemType={
              (Array.from(trackSettings.entries()).find(([, v]) => v.inputMode === "virtual_synth")?.[0] as StemType) ??
              ("guitar_synth" as StemType)
            }
            drumsOutputStemType={
              (Array.from(trackSettings.entries()).find(([, v]) => v.inputMode === "virtual_drums")?.[0] as StemType) ??
              ("drums" as StemType)
            }
          />

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography fontWeight={900}>Tracks (inputs + FX)</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Each row chooses its input source and whether recordings are Dry or Wet (post-FX). Only the owner can change these.
            </Typography>
            <Stack spacing={1.25} sx={{ mt: 2 }}>
              {(["vocals", "guitar_synth", "bass", "drums"] as StemType[]).map((st) => {
                const cfg = trackSettings.get(st) ?? { inputMode: "audio", recordMode: "dry", fx: {} };
                return (
                  <Stack
                    key={st}
                    direction={{ xs: "column", md: "row" }}
                    spacing={2}
                    alignItems={{ md: "center" }}
                    sx={{ p: 1, borderRadius: 2, bgcolor: "rgba(255,255,255,0.03)" }}
                  >
                    <Typography fontWeight={900} sx={{ width: 160 }}>
                      {st === "guitar_synth" ? "Guitar / Synth" : st.charAt(0).toUpperCase() + st.slice(1)}
                    </Typography>
                    <FormControl size="small" sx={{ minWidth: 220 }}>
                      <InputLabel id={`${st}-input`}>Input</InputLabel>
                      <Select
                        labelId={`${st}-input`}
                        label="Input"
                        value={cfg.inputMode}
                        onChange={(e) => void upsertTrack(st, { ...cfg, inputMode: String(e.target.value) })}
                        disabled={!isOwner}
                      >
                        <MenuItem value="audio">Audio interface</MenuItem>
                        <MenuItem value="midi">MIDI device</MenuItem>
                        <MenuItem value="virtual_synth">Virtual synth</MenuItem>
                        <MenuItem value="virtual_drums">Virtual drums</MenuItem>
                      </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                      <InputLabel id={`${st}-record`}>Record</InputLabel>
                      <Select
                        labelId={`${st}-record`}
                        label="Record"
                        value={cfg.recordMode}
                        onChange={(e) => void upsertTrack(st, { ...cfg, recordMode: String(e.target.value) })}
                        disabled={!isOwner}
                      >
                        <MenuItem value="dry">Dry</MenuItem>
                        <MenuItem value="wet">Wet</MenuItem>
                      </Select>
                    </FormControl>
                    <Button
                      variant="outlined"
                      onClick={() => setFxDialogStemType(st)}
                      disabled={!isOwner}
                      sx={{ minWidth: 120 }}
                    >
                      FX
                    </Button>
                  </Stack>
                );
              })}
            </Stack>
          </Paper>

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

          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Stack spacing={1.5}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
                <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 320 }}>
                <Typography fontWeight={900}>BPM</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 40 }}>
                  {bpm}
                </Typography>
                <Slider
                  min={60}
                  max={200}
                  step={1}
                  value={bpm}
                  onChange={(_, v) => setBpm(Number(v))}
                  onChangeCommitted={(_, v) => void saveBpm(Number(v))}
                  sx={{ flex: 1 }}
                />
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                  Count-in uses BPM. Each column is the next phase of time (a section). Recording auto-stops at that section’s duration.
                </Typography>
              </Stack>

              <Divider />

              <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ flexWrap: "wrap" }}>
                  <FormControl size="small" sx={{ minWidth: 160 }}>
                    <InputLabel id="transport-mode">Mode</InputLabel>
                    <Select
                      labelId="transport-mode"
                      label="Mode"
                      value={transportMode}
                      onChange={(e) => {
                        stopTransport();
                        setTransportMode(e.target.value as any);
                      }}
                    >
                      <MenuItem value="scene">Scene (loop a section)</MenuItem>
                      <MenuItem value="arrangement">Arrangement (play all sections)</MenuItem>
                    </Select>
                  </FormControl>

                  {transportMode === "scene" ? (
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                      <InputLabel id="active-section">Section</InputLabel>
                      <Select
                        labelId="active-section"
                        label="Section"
                        value={String(activeSection)}
                        onChange={(e) => setActiveSection(Number(e.target.value))}
                        disabled={transportPlaying}
                      >
                        {Array.from({ length: columnCount }).map((_, i) => (
                          <MenuItem key={i} value={String(i)}>
                            Section {i + 1} • {columnDurations.get(i) ?? 8}s
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Starts at Section 1
                    </Typography>
                  )}

                  {transportMode === "scene" ? (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" color="text.secondary">
                        Loop
                      </Typography>
                      <Switch checked={transportLoop} onChange={(_, v) => setTransportLoop(v)} disabled={transportPlaying && transportMode !== "scene"} />
                    </Stack>
                  ) : null}
                </Stack>

                <Box sx={{ flex: 1 }} />

                {transportPlaying ? (
                  <Button variant="contained" color="error" startIcon={<StopIcon />} onClick={stopTransport}>
                    Stop
                  </Button>
                ) : (
                  <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={() => void startTransport()}>
                    Play
                  </Button>
                )}
              </Stack>
            </Stack>
          </Paper>

          <StemGrid
            columnCount={columnCount}
            onAddColumn={addColumn}
            onDeleteColumn={async () => {
              if (!isOwner) return;
              if (columnCount <= 1) return;
              const ok = confirm(`Delete Section ${columnCount}? This will delete all stems in that section.`);
              if (!ok) return;
              const removeIndex = columnCount - 1;
              // Stop transport if running
              stopTransport();

              // Delete stems in the column (assets cascade)
              await supabase.from("stems").delete().eq("project_id", projectId).eq("column_index", removeIndex);
              // Delete column duration row
              await supabase.from("project_columns").delete().eq("project_id", projectId).eq("column_index", removeIndex);
              // Update project column_count
              const next = columnCount - 1;
              await supabase.from("projects").update({ column_count: next }).eq("id", projectId);
              setColumnCount(next);
              setColumnDurations((prev) => {
                const m = new Map(prev);
                m.delete(removeIndex);
                return m;
              });
              await refreshStems();
            }}
            renderColumnHeader={(col) => (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ width: "100%" }}>
                <Button
                  size="small"
                  variant={transportPlaying && transportMode === "scene" && activeSection === col ? "contained" : "outlined"}
                  color={transportPlaying && transportMode === "scene" && activeSection === col ? "error" : "primary"}
                  startIcon={transportPlaying && transportMode === "scene" && activeSection === col ? <StopIcon /> : <PlayArrowIcon />}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Toggle per-column loop play (scene mode)
                    if (transportPlaying && transportMode === "scene" && activeSection === col) {
                      stopTransport();
                      return;
                    }
                    void startSceneSection(col);
                  }}
                  sx={{ minWidth: 92 }}
                >
                  {transportPlaying && transportMode === "scene" && activeSection === col ? "Stop" : "Play"}
                </Button>
                <Typography fontWeight={900} variant="body2" sx={{ flex: 1 }}>
                  Col {col + 1}
                </Typography>
                <Tooltip title={isOwner ? "Delete this section (only last section can be deleted)" : "Owner only"}>
                  <span>
                    <IconButton
                      size="small"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!isOwner) return;
                        if (col !== columnCount - 1) {
                          alert("For now, you can only delete the last section.");
                          return;
                        }
                        // reuse the delete-last behavior
                        await (async () => {
                          if (columnCount <= 1) return;
                          const ok = confirm(`Delete Section ${columnCount}? This will delete all stems in that section.`);
                          if (!ok) return;
                          const removeIndex = columnCount - 1;
                          stopTransport();
                          await supabase.from("stems").delete().eq("project_id", projectId).eq("column_index", removeIndex);
                          await supabase.from("project_columns").delete().eq("project_id", projectId).eq("column_index", removeIndex);
                          const next = columnCount - 1;
                          await supabase.from("projects").update({ column_count: next }).eq("id", projectId);
                          setColumnCount(next);
                          setColumnDurations((prev) => {
                            const m = new Map(prev);
                            m.delete(removeIndex);
                            return m;
                          });
                          await refreshStems();
                        })();
                      }}
                      disabled={!isOwner || col !== columnCount - 1 || columnCount <= 1}
                      aria-label="Delete section"
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                {isOwner ? (
                  <TextField
                    size="small"
                    type="number"
                    label="sec"
                    value={columnDurations.get(col) ?? 8}
                    inputProps={{ min: 2, max: 600, step: 1 }}
                    onChange={(e) => {
                      const v = Math.max(2, Number(e.target.value || 8));
                      setColumnDurations((prev) => {
                        const m = new Map(prev);
                        m.set(col, v);
                        return m;
                      });
                    }}
                    onBlur={() => void saveColumnDuration(col, columnDurations.get(col) ?? 8)}
                    sx={{ width: 110 }}
                  />
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    {columnDurations.get(col) ?? 8}s
                  </Typography>
                )}
              </Stack>
            )}
            currentUserId={userId}
            onDeleteStem={async (stemId) => {
              const ok = confirm("Delete your submission? This cannot be undone.");
              if (!ok) return;
              // Find storage path
              const found = Array.from(cellSubmissions.values())
                .flat()
                .find((s) => s.stemId === stemId);
              const storagePath = found?.storagePath ?? null;
              // Prevent deleting locked stems (UI already hides, but just in case)
              if (found?.locked) {
                alert("This submission is locked by the owner and cannot be deleted.");
                return;
              }
              try {
                if (storagePath && !(storagePath.startsWith("http://") || storagePath.startsWith("https://"))) {
                  await supabase.storage.from("stems").remove([storagePath]);
                }
              } catch {
                // ignore (still delete DB row)
              }
              const { error } = await supabase.from("stems").delete().eq("id", stemId);
              if (error) alert(error.message);
              await refreshStems();
            }}
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
              const selected = cellSelectedStemId.get(k) ?? null;
              const sorted = subs
                .filter((s) => Boolean(s.audioUrl))
                .sort((a, b) => {
                  if (a.locked !== b.locked) return a.locked ? -1 : 1;
                  if (b.playCount !== a.playCount) return b.playCount - a.playCount;
                  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                });
              return sorted.map((s) => {
                  const p = profileMap.get(s.userId);
                  return {
                    userId: s.userId,
                    stemId: s.stemId,
                    avatarUrl: p?.avatarUrl ?? null,
                    label: p?.label ?? s.userId.slice(0, 6),
                    locked: s.locked,
                    selected: selected === s.stemId,
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
              // derive stemType from the map key (stemType:columnIndex)
              let stemType: StemType = "vocals";
              for (const [k, list] of cellSubmissions.entries()) {
                if (list.some((s) => s.stemId === stemId)) {
                  stemType = k.split(":")[0] as StemType;
                  break;
                }
              }
              await playStem(stemType, stemId, url);
            }}
            onSelectStem={(stemType, columnIndex, stemId) => {
              const k = `${stemType}:${columnIndex}`;
              setCellSelectedStemId((prev) => {
                const m = new Map(prev);
                m.set(k, stemId);
                return m;
              });
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
              const subs = cellSubmissions.get(k) ?? [];
              const locked = subs.find((s) => s.locked && s.audioUrl) ?? null;
              const selectedStemId = cellSelectedStemId.get(k) ?? null;
              const selected = selectedStemId ? subs.find((s) => s.stemId === selectedStemId && s.audioUrl) : null;
              const best =
                locked ??
                selected ??
                subs
                  .filter((s) => Boolean(s.audioUrl))
                  .sort((a, b) => {
                    if (b.playCount !== a.playCount) return b.playCount - a.playCount;
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                  })[0] ??
                null;
              const url = best?.audioUrl ?? null;
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
              player.connect(engine.getTrackDryInput(stemType));
              await player.load(url);
              player.start();
              cellPlayerRef.current = player;
              setPlayingCellKey(k);

              // Popularity tracking on default play too
              if (best?.stemId) {
                try {
                  await supabase.rpc("increment_stem_play_count", { stem_id: best.stemId });
                } catch {
                  // ignore
                }
              }
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

              const trackCfg = trackSettings.get(stemType) ?? { inputMode: "audio", recordMode: "dry", fx: {} };
              const isVirtualTrack = trackCfg.inputMode === "virtual_synth" || trackCfg.inputMode === "virtual_drums";

              // Stop current box recording
              if (stemRecTarget && stemRecTarget.stemType === stemType && stemRecTarget.columnIndex === columnIndex) {
                if (stemRecPhase === "countin") {
                  if (countInTimerRef.current) window.clearTimeout(countInTimerRef.current);
                  countInTimerRef.current = null;
                  setStemRecTarget(null);
                  setStemRecPhase("idle");
                  setArmedVirtualRecordTarget(null);
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

              // Virtual tracks: arm first; actual recording starts when Virtual dialog is opened (after record is hit)
              if (isVirtualTrack && !virtualOpen) {
                setArmedVirtualRecordTarget({ stemType, columnIndex });
                // Set virtual mode to match track input
                setVirtualMode(trackCfg.inputMode === "virtual_drums" ? "drums" : "synth");
                setVirtualOpen(true);
                alert("Armed recording. Virtual instrument opened — recording will start after you open it.");
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
                    const trackCfg = trackSettings.get(stemType) ?? { recordMode: "dry" as const };
                    const sourceTone =
                      trackCfg.recordMode === "wet" ? engine.getTrackWetOutput(stemType) : engine.getTrackDryInput(stemType);
                    const sourceAudio = (sourceTone as any)?.output as AudioNode | undefined;
                    if (!sourceAudio) throw new Error("Failed to initialize recording source");
                    const rec = new NodeRecorder();
                    await rec.startFrom(sourceAudio);
                    stemRecorderRef.current = rec;
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
                    const trackCfg = trackSettings.get(stemType) ?? { recordMode: "dry" as const };
                    const sourceTone =
                      trackCfg.recordMode === "wet" ? engine.getTrackWetOutput(stemType) : engine.getTrackDryInput(stemType);
                    const sourceAudio = (sourceTone as any)?.output as AudioNode | undefined;
                    if (!sourceAudio) throw new Error("Failed to initialize recording source");
                    const rec = new NodeRecorder();
                    await rec.startFrom(sourceAudio);
                    stemRecorderRef.current = rec;
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

          {fxDialogStemType ? (() => {
            const st = fxDialogStemType;
            const cfg = trackSettings.get(st) ?? { inputMode: "audio", recordMode: "dry", fx: {} };
            const fx = cfg.fx ?? {};
            const setFx = (patch: any) => void upsertTrack(st, { ...cfg, fx: { ...fx, ...patch } });
            return (
              <Dialog open onClose={() => setFxDialogStemType(null)} maxWidth="sm" fullWidth>
                <DialogTitle>FX • {st}</DialogTitle>
                <DialogContent>
                  <Stack spacing={2} sx={{ mt: 1 }}>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Gain
                      </Typography>
                      <Slider
                        min={0}
                        max={2}
                        step={0.01}
                        value={typeof fx.gain === "number" ? fx.gain : 1}
                        onChange={(_, v) => setTrackSettings((prev) => {
                          const m = new Map(prev);
                          const cur = m.get(st) ?? cfg;
                          m.set(st, { ...cur, fx: { ...(cur.fx ?? {}), gain: Number(v) } } as any);
                          return m;
                        })}
                        onChangeCommitted={(_, v) => setFx({ gain: Number(v) })}
                      />
                    </Box>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Distortion
                      </Typography>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                        <Box sx={{ flex: 1, minWidth: 220 }}>
                          <Typography variant="caption" color="text.secondary">
                            Amount
                          </Typography>
                          <Slider
                            min={0}
                            max={1}
                            step={0.01}
                            value={typeof fx.distortion === "number" ? fx.distortion : 0}
                            onChangeCommitted={(_, v) => setFx({ distortion: Number(v) })}
                          />
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 220 }}>
                          <Typography variant="caption" color="text.secondary">
                            Wet
                          </Typography>
                          <Slider
                            min={0}
                            max={1}
                            step={0.01}
                            value={typeof fx.distortionWet === "number" ? fx.distortionWet : 0}
                            onChangeCommitted={(_, v) => setFx({ distortionWet: Number(v) })}
                          />
                        </Box>
                      </Stack>
                    </Box>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Compressor
                      </Typography>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                        <Box sx={{ flex: 1, minWidth: 220 }}>
                          <Typography variant="caption" color="text.secondary">
                            Threshold
                          </Typography>
                          <Slider
                            min={-60}
                            max={0}
                            step={1}
                            value={typeof fx.compThreshold === "number" ? fx.compThreshold : -18}
                            onChangeCommitted={(_, v) => setFx({ compThreshold: Number(v) })}
                          />
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 220 }}>
                          <Typography variant="caption" color="text.secondary">
                            Ratio
                          </Typography>
                          <Slider
                            min={1}
                            max={20}
                            step={0.5}
                            value={typeof fx.compRatio === "number" ? fx.compRatio : 3}
                            onChangeCommitted={(_, v) => setFx({ compRatio: Number(v) })}
                          />
                        </Box>
                      </Stack>
                    </Box>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Delay Wet
                      </Typography>
                      <Slider
                        min={0}
                        max={1}
                        step={0.01}
                        value={typeof fx.delayWet === "number" ? fx.delayWet : 0}
                        onChange={(_, v) => setTrackSettings((prev) => {
                          const m = new Map(prev);
                          const cur = m.get(st) ?? cfg;
                          m.set(st, { ...cur, fx: { ...(cur.fx ?? {}), delayWet: Number(v) } } as any);
                          return m;
                        })}
                        onChangeCommitted={(_, v) => setFx({ delayWet: Number(v) })}
                      />
                    </Box>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Reverb Wet
                      </Typography>
                      <Slider
                        min={0}
                        max={1}
                        step={0.01}
                        value={typeof fx.reverbWet === "number" ? fx.reverbWet : 0}
                        onChange={(_, v) => setTrackSettings((prev) => {
                          const m = new Map(prev);
                          const cur = m.get(st) ?? cfg;
                          m.set(st, { ...cur, fx: { ...(cur.fx ?? {}), reverbWet: Number(v) } } as any);
                          return m;
                        })}
                        onChangeCommitted={(_, v) => setFx({ reverbWet: Number(v) })}
                      />
                    </Box>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        EQ Low / Mid / High
                      </Typography>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                        <TextField
                          size="small"
                          type="number"
                          label="Low"
                          value={typeof fx.eqLow === "number" ? fx.eqLow : 0}
                          onChange={(e) => setFx({ eqLow: Number(e.target.value || 0) })}
                        />
                        <TextField
                          size="small"
                          type="number"
                          label="Mid"
                          value={typeof fx.eqMid === "number" ? fx.eqMid : 0}
                          onChange={(e) => setFx({ eqMid: Number(e.target.value || 0) })}
                        />
                        <TextField
                          size="small"
                          type="number"
                          label="High"
                          value={typeof fx.eqHigh === "number" ? fx.eqHigh : 0}
                          onChange={(e) => setFx({ eqHigh: Number(e.target.value || 0) })}
                        />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        Values are dB-ish; start small (e.g. -6 to +6).
                      </Typography>
                    </Box>
                  </Stack>
                </DialogContent>
              </Dialog>
            );
          })() : null}

          <Typography color="text.secondary" variant="body2">
            Tip: click an avatar in a stem box to play that user’s submission. The owner can lock a favorite as the default play.
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
}


