import Link from "next/link";
import Image from "next/image";
import { Box, Button, Container, Stack, Typography } from "@mui/material";

export default function Home() {
  return (
    <Box sx={{ py: 8 }}>
      <Container maxWidth="md">
        <Stack spacing={4}>
          <Box>
            <Image
              src="/musick-logo.svg"
              alt="Musick.Studio"
              width={260}
              height={52}
              priority
              style={{ height: 44, width: "auto" }}
            />
          </Box>
          <Stack spacing={1}>
            <Typography variant="h3" fontWeight={800}>
              Music-Land
            </Typography>
            <Typography variant="h6" color="text.secondary">
              Plug in MIDI or an audio interface, add effects, organize stems, and record your ideas.
            </Typography>
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Link href="/projects" legacyBehavior>
              <Button component="a" variant="contained" size="large">
                Open Projects
              </Button>
            </Link>
            <Link href="/login" legacyBehavior>
              <Button component="a" variant="outlined" size="large">
                Login with Google
              </Button>
            </Link>
          </Stack>

          <Typography color="text.secondary">
            Deployed on Vercel. Auth/DB/Storage via Supabase. Audio powered by Web Audio + AudioWorklet; MIDI via
            WebMIDI where available.
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
}
