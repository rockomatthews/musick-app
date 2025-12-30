"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Box, CircularProgress, Container, Paper, Stack, Typography } from "@mui/material";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        // This will consume the URL hash (if present) due to detectSessionInUrl: true.
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!data.session) {
          setError("No session found. Please try logging in again.");
          return;
        }
        router.replace("/projects");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Login callback failed");
      }
    })();
  }, [router]);

  return (
    <Box sx={{ py: 10 }}>
      <Container maxWidth="sm">
        <Paper sx={{ p: 4 }}>
          <Stack spacing={2} alignItems="center">
            <CircularProgress />
            <Typography fontWeight={800}>Signing you in…</Typography>
            {error ? (
              <Typography color="error" variant="body2" sx={{ textAlign: "center" }}>
                {error}
              </Typography>
            ) : (
              <Typography color="text.secondary" variant="body2" sx={{ textAlign: "center" }}>
                Finishing authentication and redirecting to your projects.
              </Typography>
            )}
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}


