import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

const KEY = "visitors:total";
// Visitors counted before this counter existed; added to the stored total.
const BASE_COUNT = 9000;

// The Vercel Marketplace integration prefixes its variables with the database
// name ("iaci_"), so Redis.fromEnv() would not find them.
function getRedis() {
  const url = process.env.iaci_KV_REST_API_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.iaci_KV_REST_API_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

// Without Redis credentials (e.g. a local `npm run dev`) show the base count so
// the footer can be previewed. Never applies to a production build.
const devPreview = process.env.NODE_ENV === "development";

const noStore = { headers: { "Cache-Control": "no-store" } };

// Read the current total.
export async function GET() {
  const redis = getRedis();
  if (!redis) {
    return devPreview
      ? NextResponse.json({ count: BASE_COUNT }, noStore)
      : NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  try {
    const count = (await redis.get<number>(KEY)) ?? 0;
    return NextResponse.json({ count: count + BASE_COUNT }, noStore);
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}

// Count one new visitor and return the new total.
export async function POST() {
  const redis = getRedis();
  if (!redis) {
    return devPreview
      ? NextResponse.json({ count: BASE_COUNT }, noStore)
      : NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  try {
    const count = await redis.incr(KEY);
    return NextResponse.json({ count: count + BASE_COUNT }, noStore);
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
