import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

function getCacheDir(): string {
  return (
    process.env.LOGO_CACHE_DIR ?? path.join(process.cwd(), "data", "logos")
  );
}

function sanitizeAsset(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ asset: string }> },
) {
  const { asset } = await params;
  const safe = sanitizeAsset(asset);
  if (!safe) return new Response(null, { status: 400 });

  const cacheDir = getCacheDir();
  const cachePath = path.join(cacheDir, `crypto_${safe}.png`);

  try {
    const cached = await fs.readFile(cachePath);
    return new Response(cached, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": `public, max-age=${THIRTY_DAYS}, immutable`,
      },
    });
  } catch {}

  const token = process.env.LOGO_DEV_PUBLISHABLE_KEY;
  if (!token) {
    // Fallback: redirect to spothq open-source crypto icons (no API key needed)
    const fallback = `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${safe}.png`;
    return Response.redirect(fallback, 302);
  }

  const qs = new URLSearchParams({ token, format: "png", size: "128" });
  const upstreamUrl = `https://img.logo.dev/crypto/${encodeURIComponent(safe)}?${qs.toString()}`;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl);
  } catch {
    return new Response(null, { status: 502 });
  }

  if (!upstream.ok) {
    const fallback = `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${safe}.png`;
    return Response.redirect(fallback, 302);
  }

  const buffer = Buffer.from(await upstream.arrayBuffer());
  const contentType = upstream.headers.get("content-type") ?? "image/png";

  try {
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(cachePath, buffer);
  } catch {}

  return new Response(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": `public, max-age=${THIRTY_DAYS}, immutable`,
    },
  });
}
