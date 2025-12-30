"use client";

import * as React from "react";
import Link from "next/link";
import {
  Avatar,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import LogoutIcon from "@mui/icons-material/Logout";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ensureProfile } from "@/lib/profiles/ensureProfile";

type ProfileRow = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_path: string | null;
};

function getAvatarUrl(supabase: ReturnType<typeof createSupabaseBrowserClient>, path: string | null) {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl ?? null;
}

export function ProfileMenu() {
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), []);
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  const [label, setLabel] = React.useState<string>("Profile");
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) return;

      await ensureProfile(supabase, user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id,username,display_name,avatar_path")
        .eq("user_id", user.id)
        .maybeSingle();

      const p = profile as ProfileRow | null;
      const name = p?.username || p?.display_name || user.email || "Profile";
      setLabel(name);
      setAvatarUrl(getAvatarUrl(supabase, p?.avatar_path ?? null));
    })();
  }, [supabase]);

  return (
    <>
      <Tooltip title={label}>
        <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} aria-label="Profile">
          <Avatar src={avatarUrl ?? undefined} sx={{ width: 32, height: 32 }}>
            <PersonIcon fontSize="small" />
          </Avatar>
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchorEl} open={open} onClose={() => setAnchorEl(null)}>
        <MenuItem disabled>
          <Typography variant="body2" fontWeight={800}>
            {label}
          </Typography>
        </MenuItem>
        <MenuItem component={Link} href="/profile" onClick={() => setAnchorEl(null)}>
          <ListItemIcon>
            <PersonIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Edit profile" />
        </MenuItem>
        <MenuItem
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = "/login";
          }}
        >
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Sign out" />
        </MenuItem>
      </Menu>
    </>
  );
}


