"use client";

import * as React from "react";
import * as Tone from "tone";
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  LinearProgress,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import type { SfxImportRequest, SfxSearchResult } from "@/lib/sfx/providers";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

async function getAccessToken(): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not logged in");
  return token;
}

async function playPreviewUrl(url: string) {
  await Tone.start();
  const player = new Tone.Player(url).toDestination();
  await player.load(url);
  player.start();
  setTimeout(() => {
    try {
      player.stop();
      player.dispose();
    } catch {
      // ignore
    }
  }, 30_000);
}

export function SoundFxBrowserDialog(props: { open: boolean; onClose: () => void; projectId: string }) {
  const [tab, setTab] = React.useState<"search" | "generate" | "library">("search");
  const [q, setQ] = React.useState("");
  const [license, setLicense] = React.useState("CC0,CC-BY");
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<SfxSearchResult[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const [genText, setGenText] = React.useState("snare hit, short, dry");
  const [genLoading, setGenLoading] = React.useState(false);
  const [genImportedUrl, setGenImportedUrl] = React.useState<string | null>(null);
  const [library, setLibrary] = React.useState<
    { id: string; title: string; license: string | null; attribution: string | null; duration_sec: number | null; storage_path: string; storage_bucket: string }[]
  >([]);

  const onSearch = React.useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const token = await getAccessToken();
      const r = await fetch(`/api/sfx/freesound/search?q=${encodeURIComponent(q)}&license=${encodeURIComponent(license)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error ?? "Search failed");
      setResults((data?.results ?? []) as SfxSearchResult[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [license, q]);

  const onImport = React.useCallback(
    async (item: SfxSearchResult) => {
      if (!item.previewUrl) return;
      setError(null);
      setLoading(true);
      try {
        const token = await getAccessToken();
        const payload: SfxImportRequest = {
          provider: item.provider === "freesound" ? "freesound" : "elevenlabs",
          providerItemId: item.providerItemId,
          title: item.title,
          durationSec: item.durationSec,
          tags: item.tags ?? [],
          previewUrl: item.previewUrl,
          license: item.license ?? null,
          attribution: item.attribution ?? null,
          sourceUrl: item.sourceUrl ?? null,
          projectId: props.projectId,
        };
        const r = await fetch("/api/sfx/import", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error ?? "Import failed");
        await playPreviewUrl(String(data.publicUrl));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed");
      } finally {
        setLoading(false);
      }
    },
    [props.projectId],
  );

  const onGenerateAndImport = React.useCallback(async () => {
    setError(null);
    setGenLoading(true);
    try {
      const token = await getAccessToken();
      const r = await fetch("/api/sfx/elevenlabs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: genText, durationSeconds: 2, projectId: props.projectId }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.error ?? "Generate failed");
      }
      const data = (await r.json().catch(() => ({}))) as any;
      const url = String(data?.publicUrl ?? "");
      if (!url) throw new Error("Missing publicUrl");
      setGenImportedUrl(url);
      await playPreviewUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generate failed");
    } finally {
      setGenLoading(false);
    }
  }, [genText, props.projectId]);

  const refreshLibrary = React.useCallback(async () => {
    setError(null);
    try {
      const token = await getAccessToken();
      const r = await fetch(`/api/sfx/library?scope=mine`, { headers: { Authorization: `Bearer ${token}` } });
      const data = (await r.json().catch(() => ({}))) as any;
      if (!r.ok) throw new Error(data?.error ?? "Failed to load library");
      setLibrary((data?.results ?? []) as any[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load library");
    }
  }, []);

  React.useEffect(() => {
    if (!props.open) return;
    setError(null);
    void refreshLibrary();
  }, [props.open]);

  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="md">
      <DialogTitle>Sound FX</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} textColor="inherit">
            <Tab label="Search (Freesound)" value="search" />
            <Tab label="Generate (ElevenLabs)" value="generate" />
            <Tab label="Library" value="library" />
          </Tabs>
          <Divider />

          {loading || genLoading ? <LinearProgress /> : null}
          {error ? (
            <Typography color="error" variant="body2">
              {error}
            </Typography>
          ) : null}

          {tab === "search" ? (
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  label="Search SFX"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  fullWidth
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void onSearch();
                  }}
                />
                <Button variant="contained" onClick={() => void onSearch()} disabled={!q.trim()}>
                  Search
                </Button>
              </Stack>
              <TextField
                label="License filter (comma-separated)"
                value={license}
                onChange={(e) => setLicense(e.target.value)}
                helperText="MVP defaults to CC0 + CC-BY"
              />
              <Stack spacing={1}>
                {results.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Results will appear here.
                  </Typography>
                ) : null}
                {results.map((r) => (
                  <Box key={`${r.provider}:${r.providerItemId}`} sx={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 2, p: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                      <Box sx={{ minWidth: 0 }}>
                        <Typography fontWeight={800} noWrap title={r.title}>
                          {r.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {r.license ?? "license?"} • {r.durationSec ? `${Math.round(r.durationSec * 10) / 10}s` : "duration?"}
                          {r.author ? ` • ${r.author}` : ""}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={!r.previewUrl}
                          onClick={() => {
                            if (r.previewUrl) void playPreviewUrl(r.previewUrl);
                          }}
                        >
                          Preview
                        </Button>
                        <Button size="small" variant="contained" disabled={!r.previewUrl} onClick={() => void onImport(r)}>
                          Import
                        </Button>
                      </Stack>
                    </Stack>
                    {r.attribution ? (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                        {r.attribution}
                      </Typography>
                    ) : null}
                  </Box>
                ))}
              </Stack>
            </Stack>
          ) : null}

          {tab === "generate" ? (
            <Stack spacing={1.5}>
              <TextField
                label="Describe the sound"
                value={genText}
                onChange={(e) => setGenText(e.target.value)}
                fullWidth
                multiline
                minRows={2}
              />
              <Stack direction="row" spacing={1}>
                <Button variant="contained" onClick={() => void onGenerateAndImport()} disabled={!genText.trim()}>
                  Generate + Import
                </Button>
              </Stack>
              {genImportedUrl ? (
                <Typography variant="caption" color="text.secondary">
                  Saved to your library and attached to this project (if you own it).
                </Typography>
              ) : null}
            </Stack>
          ) : null}

          {tab === "library" ? (
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">
                  Your imported SFX (latest 50)
                </Typography>
                <Button size="small" variant="outlined" onClick={() => void refreshLibrary()}>
                  Refresh
                </Button>
              </Stack>
              {library.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No items yet.
                </Typography>
              ) : null}
              {library.map((s) => (
                <Box key={s.id} sx={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 2, p: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Box sx={{ minWidth: 0 }}>
                      <Typography fontWeight={800} noWrap title={s.title}>
                        {s.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {s.license ?? "license?"} • {s.duration_sec ? `${Math.round(s.duration_sec * 10) / 10}s` : "duration?"}
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={async () => {
                        const supabase = createSupabaseBrowserClient();
                        const { data } = supabase.storage.from(s.storage_bucket).getPublicUrl(s.storage_path);
                        const url = data.publicUrl;
                        await playPreviewUrl(url);
                      }}
                    >
                      Preview
                    </Button>
                  </Stack>
                  {s.attribution ? (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                      {s.attribution}
                    </Typography>
                  ) : null}
                </Box>
              ))}
            </Stack>
          ) : null}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}


