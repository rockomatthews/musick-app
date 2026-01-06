import { NextResponse } from "next/server";
import type { SfxSearchResult } from "@/lib/sfx/providers";
import { requireUserFromAuthorizationHeader } from "@/lib/supabase/server";

export async function GET(req: Request) {
  try {
    await requireUserFromAuthorizationHeader(req);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.FREESOUND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing FREESOUND_API_KEY" }, { status: 501 });
  }

  const url = new URL(req.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const page = Math.max(1, Math.min(10, Number(url.searchParams.get("page") ?? "1")));
  const license = (url.searchParams.get("license") ?? "CC0,CC-BY").trim();

  if (!query) {
    return NextResponse.json({ error: "Missing q" }, { status: 400 });
  }

  // Freesound API v2 search endpoint.
  // We request preview urls + license + username for attribution.
  const endpoint = new URL("https://freesound.org/apiv2/search/text/");
  endpoint.searchParams.set("query", query);
  endpoint.searchParams.set("page", String(page));
  endpoint.searchParams.set("page_size", "20");
  endpoint.searchParams.set("fields", "id,name,username,license,duration,tags,previews,url");

  // License filter syntax supports values like "Creative Commons 0" etc.
  // We implement a lightweight mapper for common CC short codes.
  const licenseMap: Record<string, string> = {
    "CC0": '"Creative Commons 0"',
    "CC-BY": '"Attribution"',
    "CC-BY-SA": '"Attribution ShareAlike"',
    "CC-BY-NC": '"Attribution Noncommercial"',
    "CC-BY-NC-SA": '"Attribution Noncommercial ShareAlike"',
    "CC-BY-ND": '"Attribution NoDerivatives"',
    "CC-BY-NC-ND": '"Attribution Noncommercial NoDerivatives"',
  };
  const parts = license
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => licenseMap[p] ?? null)
    .filter(Boolean) as string[];
  if (parts.length > 0) {
    endpoint.searchParams.set("filter", `license:(${parts.join(" OR ")})`);
  }

  const r = await fetch(endpoint.toString(), {
    headers: { Authorization: `Token ${apiKey}` },
    cache: "no-store",
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    return NextResponse.json({ error: `Freesound error (${r.status})`, details: txt }, { status: 502 });
  }

  const data = (await r.json()) as any;
  const results: SfxSearchResult[] =
    (data?.results ?? []).map((x: any) => {
      const previewUrl = x?.previews?.["preview-hq-mp3"] ?? x?.previews?.["preview-lq-mp3"] ?? null;
      const licenseUrl = String(x?.license ?? "");
      const licenseShort =
        licenseUrl.includes("creativecommons.org/publicdomain/zero")
          ? "CC0"
          : licenseUrl.includes("creativecommons.org/licenses/by/") && !licenseUrl.includes("/nc") && !licenseUrl.includes("/sa") && !licenseUrl.includes("/nd")
            ? "CC-BY"
            : licenseUrl.includes("/by-nc-sa/")
              ? "CC-BY-NC-SA"
              : licenseUrl.includes("/by-nc-nd/")
                ? "CC-BY-NC-ND"
                : licenseUrl.includes("/by-nc/")
                  ? "CC-BY-NC"
                  : licenseUrl.includes("/by-sa/")
                    ? "CC-BY-SA"
                    : licenseUrl.includes("/by-nd/")
                      ? "CC-BY-ND"
                      : (licenseUrl ? "CUSTOM" : null);

      const author = x?.username ? String(x.username) : null;
      const title = x?.name ? String(x.name) : `Sound ${String(x?.id ?? "")}`;
      const sourceUrl = x?.url ? String(x.url) : null;
      const attribution = author ? `${title} by ${author} (${licenseShort ?? "license"})` : null;

      return {
        provider: "freesound",
        providerItemId: String(x?.id ?? ""),
        title,
        durationSec: typeof x?.duration === "number" ? x.duration : null,
        tags: Array.isArray(x?.tags) ? x.tags.map(String) : [],
        previewUrl,
        license: licenseShort as any,
        attribution,
        author,
        sourceUrl,
      } satisfies SfxSearchResult;
    }) ?? [];

  return NextResponse.json({ results });
}


