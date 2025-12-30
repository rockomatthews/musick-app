"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Box, Button, Container, Paper, Stack, Typography } from "@mui/material";
import GoogleIcon from "@mui/icons-material/Google";
import { createSupabaseBrowserClient, getSupabasePublicConfig } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function signInWithGoogle() {
    const cfg = getSupabasePublicConfig();
    if (!cfg.isConfigured) {
      setError("Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) setError(error.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      setIsLoading(false);
    }
  }

  React.useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.push("/projects");
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  return (
    <Box sx={{ py: 10 }}>
      <Container maxWidth="sm">
        <Paper sx={{ p: 4 }}>
          <Stack spacing={2}>
            <Image
              src="/musick-logo.svg"
              alt="Musick.Studio"
              width={220}
              height={44}
              priority
              style={{ height: 36, width: "auto" }}
            />
            <Typography variant="h4" fontWeight={800}>
              Login
            </Typography>
            <Typography color="text.secondary">
              Sign in to create projects and submit stems. (Project owners approve additions.)
            </Typography>

            <Button
              onClick={signInWithGoogle}
              variant="contained"
              size="large"
              startIcon={<GoogleIcon />}
              disabled={isLoading}
            >
              Continue with Google
            </Button>

            {error ? (
              <Typography color="error" variant="body2">
                {error}
              </Typography>
            ) : null}

            <Typography color="text.secondary" variant="caption">
              You’ll configure the Supabase project (created in Vercel settings) via environment variables.
            </Typography>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}


