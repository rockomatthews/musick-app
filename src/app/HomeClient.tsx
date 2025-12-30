"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  AppBar,
  Box,
  Button,
  Container,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import { createSupabaseBrowserClient, getSupabasePublicConfig } from "@/lib/supabase/client";
import { ProjectCarousel, type ProjectCardModel } from "@/components/ProjectCarousel";

function getCoverUrl(supabase: ReturnType<typeof createSupabaseBrowserClient>, coverPath: string | null) {
  if (!coverPath) return null;
  if (coverPath.startsWith("http://") || coverPath.startsWith("https://")) return coverPath;
  // assumes Storage bucket `project-images`
  return supabase.storage.from("project-images").getPublicUrl(coverPath).data.publicUrl ?? null;
}

export default function HomeClient() {
  const supabaseConfigured = React.useMemo(() => getSupabasePublicConfig().isConfigured, []);
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), []);

  const [openTutorial, setOpenTutorial] = React.useState(false);
  const [popular, setPopular] = React.useState<ProjectCardModel[]>([]);
  const [recent, setRecent] = React.useState<ProjectCardModel[]>([]);

  React.useEffect(() => {
    const seen = localStorage.getItem("musick_tutorial_seen");
    if (!seen) {
      setOpenTutorial(true);
      localStorage.setItem("musick_tutorial_seen", "1");
    }
  }, []);

  React.useEffect(() => {
    if (!supabaseConfigured) return;
    (async () => {
      // Popular = most approved stems, then newest.
      const { data: stemsAgg } = await supabase
        .from("stems")
        .select("project_id,created_by,status")
        .eq("status", "approved");

      const counts = new Map<string, { approved: number; contributors: Set<string> }>();
      const allUserIds = new Set<string>();
      for (const row of (stemsAgg as any[]) ?? []) {
        const pid = String(row.project_id);
        const uid = String(row.created_by);
        const cur = counts.get(pid) ?? { approved: 0, contributors: new Set<string>() };
        cur.approved += 1;
        if (uid) cur.contributors.add(uid);
        if (uid) allUserIds.add(uid);
        counts.set(pid, cur);
      }

      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id,username,display_name")
        .in("user_id", Array.from(allUserIds));
      const profileName = new Map<string, string>();
      for (const p of (profs as any[]) ?? []) {
        const name = p.username || p.display_name || p.user_id;
        profileName.set(String(p.user_id), String(name));
      }

      const { data: projects } = await supabase
        .from("projects")
        .select("id,title,created_at,cover_image_path")
        .order("created_at", { ascending: false });

      const models: ProjectCardModel[] = ((projects as any[]) ?? []).map((p) => {
        const stats = counts.get(p.id) ?? { approved: 0, contributors: new Set<string>() };
        const names = Array.from(stats.contributors)
          .map((id) => profileName.get(id) || id)
          .slice(0, 3);
        return {
          id: p.id,
          title: p.title,
          created_at: p.created_at,
          cover_image_url: getCoverUrl(supabase, p.cover_image_path ?? null),
          approved_stems: stats.approved,
          contributors: stats.contributors.size,
          contributor_names: names,
        };
      });

      const popularSorted = [...models].sort((a, b) => {
        if (b.approved_stems !== a.approved_stems) return b.approved_stems - a.approved_stems;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      const recentSorted = [...models].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      setPopular(popularSorted.slice(0, 20));
      setRecent(recentSorted.slice(0, 20));
    })();
  }, [supabase, supabaseConfigured]);

  const tutorialUrl =
    process.env.NEXT_PUBLIC_TUTORIAL_VIDEO_URL || "https://www.youtube.com/embed/dQw4w9WgXcQ";

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <AppBar position="sticky" color="transparent" elevation={0}>
        <Toolbar>
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ flexGrow: 1 }}>
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
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<PlayCircleOutlineIcon />}
              onClick={() => setOpenTutorial(true)}
            >
              Tutorial
            </Button>
            <Link href="/projects" legacyBehavior>
              <Button component="a" variant="contained">
                Projects
              </Button>
            </Link>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={4}>
          <Stack spacing={1}>
            <Typography variant="h4" fontWeight={900}>
              Explore & play projects
            </Typography>
            <Typography color="text.secondary">
              Browse what the community is building. Add stems, audition ideas, and record.
            </Typography>
          </Stack>

          <ProjectCarousel title="Popular" projects={popular} />
          <ProjectCarousel title="Recently created" projects={recent} />
        </Stack>
      </Container>

      <Dialog open={openTutorial} onClose={() => setOpenTutorial(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Getting started
          <IconButton onClick={() => setOpenTutorial(false)} sx={{ position: "absolute", right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ position: "relative", paddingTop: "56.25%" }}>
            <iframe
              src={tutorialUrl}
              title="Tutorial"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                border: 0,
                borderRadius: 8,
              }}
            />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Set <code>NEXT_PUBLIC_TUTORIAL_VIDEO_URL</code> to your preferred embed URL.
          </Typography>
        </DialogContent>
      </Dialog>
    </Box>
  );
}


