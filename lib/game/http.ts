import { cookies } from "next/headers";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import type { StageProgress } from "./types";

const GUEST_COOKIE = "mission_shiritori_guest";
const STAGE_COOKIE = "mission_shiritori_stages";
const SESSION_COOKIE = "mission_shiritori_session";
const year = 60 * 60 * 24 * 365;
const defaults: StageProgress = { unlockedStage: 1, completedStageNumbers: [] };

function signature(value: string) {
  const secret = process.env.COOKIE_SIGNING_SECRET;
  if (!secret && process.env.NODE_ENV === "production") throw new Error("COOKIE_SIGNING_SECRET must be set in production");
  return createHmac("sha256", secret ?? "local-development-cookie-secret").update(value).digest("base64url");
}
function encoded(progress: StageProgress) { const value = Buffer.from(JSON.stringify(progress)).toString("base64url"); return `${value}.${signature(value)}`; }

export async function getGuestId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(GUEST_COOKIE)?.value;
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  const guestId = randomUUID();
  store.set(GUEST_COOKIE, guestId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: year, path: "/" });
  return guestId;
}

export async function getStageProgress(): Promise<StageProgress> {
  const value = (await cookies()).get(STAGE_COOKIE)?.value;
  if (!value) return defaults;
  const [payload, received] = value.split(".");
  if (!payload || !received) return defaults;
  const expected = signature(payload);
  if (received.length !== expected.length || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) return defaults;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof parsed.unlockedStage !== "number" || !Array.isArray(parsed.completedStageNumbers)) return defaults;
    const completedStageNumbers = parsed.completedStageNumbers.filter((item: unknown): item is number => typeof item === "number" && Number.isInteger(item) && item >= 1 && item <= 5);
    return { unlockedStage: Math.max(1, Math.min(5, Math.floor(parsed.unlockedStage))), completedStageNumbers };
  } catch { return defaults; }
}

export async function saveStageProgress(progress: StageProgress) {
  const store = await cookies();
  store.set(STAGE_COOKIE, encoded(progress), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: year, path: "/" });
}

export async function getActiveSession<T>(): Promise<T | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;
  const [payload, received] = value.split(".");
  if (!payload || !received) return null;
  const expected = signature(payload);
  if (received.length !== expected.length || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) return null;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T; } catch { return null; }
}

export async function saveActiveSession(snapshot: unknown) {
  const value = Buffer.from(JSON.stringify(snapshot)).toString("base64url");
  if (value.length > 3_600) return;
  const store = await cookies();
  store.set(SESSION_COOKIE, `${value}.${signature(value)}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 15, path: "/" });
}
