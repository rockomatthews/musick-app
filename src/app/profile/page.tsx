"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Container,
  Paper,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ensureProfile } from "@/lib/profiles/ensureProfile";

type ProfileRow = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_path: string | null;
};

function getAvatarUrl(supabase: ReturnType<typeof createSupabaseBrowserClient>, path: string | null) {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl ?? null;
}

export default function ProfilePage() {
  const router = useRouter();
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), []);

  const [userId, setUserId] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState<string | null>(null);
  const [username, setUsername] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [bio, setBio] = React.useState("");
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) {
        router.push("/login");
        return;
      }
      setUserId(user.id);
      setEmail(user.email ?? null);

      await ensureProfile(supabase, user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id,username,display_name,bio,avatar_path")
        .eq("user_id", user.id)
        .maybeSingle();

      const p = profile as ProfileRow | null;
      setUsername(p?.username ?? "");
      setDisplayName(p?.display_name ?? "");
      setBio(p?.bio ?? "");
      setAvatarUrl(getAvatarUrl(supabase, p?.avatar_path ?? null));
    })();
  }, [router, supabase]);

  async function save() {
    if (!userId) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          username: username.trim() || null,
          display_name: displayName.trim() || null,
          bio: bio.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      if (error) throw error;
      alert("Saved!");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }

  async function uploadAvatar(file: File) {
    if (!userId) return;
    const allowed = new Set(["image/jpeg", "image/png", "image/gif"]);
    if (!allowed.has(file.type)) {
      throw new Error("Avatar must be a JPG, PNG, or GIF.");
    }
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `avatars/${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });
    if (error) throw error;
    const { error: upErr } = await supabase.from("profiles").update({ avatar_path: path }).eq("user_id", userId);
    if (upErr) throw upErr;
    setAvatarUrl(getAvatarUrl(supabase, path));
  }

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
          <Link href="/projects" style={{ textDecoration: "none" }}>
            <Button variant="outlined">Projects</Button>
          </Link>
        </Toolbar>
      </AppBar>

      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Stack spacing={2}>
          <Typography variant="h5" fontWeight={900}>
            Profile
          </Typography>

          <Paper variant="outlined" sx={{ p: 3 }}>
            <Stack spacing={2}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Avatar src={avatarUrl ?? undefined} sx={{ width: 64, height: 64 }} />
                <Button variant="outlined" component="label">
                  Upload avatar
                  <input
                    hidden
                    type="file"
                    accept="image/jpeg,image/png,image/gif"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      try {
                        await uploadAvatar(file);
                      } catch (err) {
                        alert(err instanceof Error ? err.message : "Upload failed");
                      }
                    }}
                  />
                </Button>
              </Stack>

              <TextField label="Email" value={email ?? ""} disabled fullWidth />
              <TextField
                label="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                helperText="This is your Musick.Studio handle (unique)."
                fullWidth
              />
              <TextField
                label="Display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                fullWidth
              />
              <TextField
                label="Bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                multiline
                minRows={3}
                fullWidth
              />

              <Button variant="contained" onClick={save} disabled={isSaving || !userId}>
                Save
              </Button>

              <Typography variant="caption" color="text.secondary">
                Avatar uploads expect a Supabase Storage bucket named <code>avatars</code>.
              </Typography>
            </Stack>
          </Paper>
        </Stack>
      </Container>
    </Box>
  );
}


