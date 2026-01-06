export type SfxProviderId = "freesound" | "elevenlabs" | "hooksounds" | "local";

// Licensing notes:
// - Freesound is a community catalog with mixed Creative Commons licenses. For MVP we will
//   filter to permissive CC licenses (e.g., CC0/CC-BY) and store attribution metadata.
// - HookSounds Connect is a paid catalog API and generally requires a contract; integrate later.
// - ElevenLabs generates new audio from prompts; licensing depends on your ElevenLabs plan/terms.
export type SfxLicense =
  | "CC0"
  | "CC-BY"
  | "CC-BY-SA"
  | "CC-BY-NC"
  | "CC-BY-NC-SA"
  | "CC-BY-ND"
  | "CC-BY-NC-ND"
  | "CUSTOM";

export type SfxSearchResult = {
  provider: SfxProviderId;
  providerItemId: string;
  title: string;
  durationSec: number | null;
  tags: string[];
  previewUrl: string | null;
  license: SfxLicense | null;
  attribution: string | null;
  author: string | null;
  sourceUrl: string | null;
};

export type SfxImportRequest = {
  provider: Exclude<SfxProviderId, "local" | "hooksounds">; // MVP providers
  providerItemId: string;
  title: string;
  durationSec: number | null;
  tags: string[];
  previewUrl: string; // remote url we will fetch server-side
  license: SfxLicense | null;
  attribution: string | null;
  sourceUrl: string | null;
  projectId?: string;
};

export type SfxImportResponse = {
  soundEffectId: string;
  storagePath: string;
  publicUrl: string;
};


