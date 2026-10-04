import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

const KEY = "visitors:total";

// The Vercel Marketplace integration prefixes its variables with the database
// name ("iaci_"), so Redis.fromEnv() would not find them.
function getRedis() {
  const url = process.env.iaci_KV_REST_API_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.iaci_KV_REST_API_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

const noStore = { headers: { "Cache-Control": "no-store" } };

// Read the current total.
export async function GET() {
  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  try {
    const count = (await redis.get<number>(KEY)) ?? 0;
    return NextResponse.json({ count }, noStore);
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}

// Count one new visitor and return the new total.
export async function POST() {
  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  try {
    const count = await redis.incr(KEY);
    return NextResponse.json({ count }, noStore);
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
