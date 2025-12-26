"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AppBar,
  Box,
  Button,
  Container,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import AddIcon from "@mui/icons-material/Add";
import { createSupabaseBrowserClient, getSupabasePublicConfig } from "@/lib/supabase/client";

type ProjectRow = {
  id: string;
  title: string;
  owner_user_id: string;
  is_public: boolean;
  column_count: number;
  created_at: string;
};

export default function ProjectsPage() {
  const router = useRouter();
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), []);
  const supabaseConfigured = React.useMemo(() => getSupabasePublicConfig().isConfigured, []);

  const [sessionEmail, setSessionEmail] = React.useState<string | null>(null);
  const [projects, setProjects] = React.useState<ProjectRow[]>([]);
  const [title, setTitle] = React.useState("");
  const [isCreating, setIsCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      router.push("/login");
      return;
    }
    setSessionEmail(sessionData.session.user.email ?? null);

    const { data, error } = await supabase
      .from("projects")
      .select("id,title,owner_user_id,is_public,column_count,created_at")
      .order("created_at", { ascending: false });

    if (error) setError(error.message);
    setProjects((data as ProjectRow[]) ?? []);
  }, [router, supabase]);

  React.useEffect(() => {
    if (!supabaseConfigured) return;
    void load();
  }, [load, supabaseConfigured]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function createProject() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setIsCreating(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        router.push("/login");
        return;
      }

      const { data, error } = await supabase
        .from("projects")
        .insert({ title: trimmed, owner_user_id: user.id, column_count: 1 })
        .select("id")
        .single();

      if (error) throw error;

      setTitle("");
      router.push(`/projects/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create project");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <AppBar position="sticky" color="transparent" elevation={0}>
        <Toolbar>
          <Typography fontWeight={800} sx={{ flexGrow: 1 }}>
            <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>
              Music-Land
            </Link>
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary">
              {sessionEmail ?? ""}
            </Typography>
            <IconButton onClick={signOut} aria-label="Sign out">
              <LogoutIcon />
            </IconButton>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ py: 4 }}>
        <Stack spacing={3}>
          {!supabaseConfigured ? (
            <Paper sx={{ p: 3 }}>
              <Typography fontWeight={800}>Supabase not configured</Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (from the
                Supabase project you create in Vercel settings).
              </Typography>
            </Paper>
          ) : null}
          <Paper sx={{ p: 3 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                fullWidth
                label="New project name"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Button
                onClick={createProject}
                variant="contained"
                startIcon={<AddIcon />}
                disabled={isCreating || !supabaseConfigured}
              >
                Create
              </Button>
            </Stack>
            {error ? (
              <Typography color="error" variant="body2" sx={{ mt: 2 }}>
                {error}
              </Typography>
            ) : null}
          </Paper>

          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" fontWeight={800} sx={{ px: 1, pt: 1 }}>
              Projects
            </Typography>
            <List>
              {projects.map((p) => (
                <ListItem key={p.id} disablePadding>
                  <ListItemButton onClick={() => router.push(`/projects/${p.id}`)}>
                    <ListItemText
                      primary={p.title}
                      secondary={new Date(p.created_at).toLocaleString()}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
              {projects.length === 0 ? (
                <ListItem>
                  <ListItemText primary="No projects yet. Create one above." />
                </ListItem>
              ) : null}
            </List>
          </Paper>
        </Stack>
      </Container>
    </Box>
  );
}


