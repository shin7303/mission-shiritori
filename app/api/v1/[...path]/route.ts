import { NextRequest, NextResponse } from "next/server";
import { getActiveSession, getGuestId, getStageProgress, saveActiveSession, saveStageProgress } from "@/lib/game/http";
import { addMove, compactSession, completeStage, createSession, dailyStats, finishSession, getHint, ranking, replay, restoreSession, stageInfo, storedSession, toPublic, undoMove } from "@/lib/game/service";
import type { CompactSession } from "@/lib/game/service";
import type { GameMode } from "@/lib/game/types";

type Context = { params: Promise<{ path: string[] }> };
const modes = new Set<GameMode>(["daily", "score_attack", "stage"]);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isGameMode = (value: unknown): value is GameMode => typeof value === "string" && modes.has(value as GameMode);

export async function POST(request: NextRequest, { params }: Context) {
  const path = (await params).path;
  const guestId = await getGuestId();
  const activeSession = await getActiveSession<CompactSession>();
  if (activeSession) restoreSession(activeSession, guestId);
  const persist = async (id: string) => {
    const current = storedSession(id, guestId);
    if (current) await saveActiveSession(compactSession(current));
  };
  if (path.length === 1 && path[0] === "game-sessions") {
    const parsed = await request.json().catch(() => ({}));
    const body = isRecord(parsed) ? parsed : {};
    const gameMode: GameMode = isGameMode(body.gameMode) ? body.gameMode : "daily";
    const stageNumber = typeof body.stageNumber === "number" && Number.isInteger(body.stageNumber) ? body.stageNumber : undefined;
    const session = createSession(guestId, gameMode, stageNumber, await getStageProgress());
    if (session === "locked") return NextResponse.json({ error: "このステージはまだ解放されていません。" }, { status: 403 });
    await persist(session.id);
    return NextResponse.json({ session }, { status: 201 });
  }
  const [resource, id, action] = path;
  if (resource !== "game-sessions" || !id) return NextResponse.json({ error: "エンドポイントが見つかりません。" }, { status: 404 });
  if (action === "moves") {
    const parsed = await request.json().catch(() => ({}));
    const body = isRecord(parsed) ? parsed : {};
    if (typeof body.word !== "string" || typeof body.clientMoveId !== "string" || body.word.length > 64 || body.clientMoveId.length === 0 || body.clientMoveId.length > 128) {
      return NextResponse.json({ error: "word と clientMoveId は必須です。" }, { status: 400 });
    }
    const result = addMove(id, guestId, body.word, body.clientMoveId);
    if (!result) return NextResponse.json({ error: "セッションが見つかりません。ページを更新して最初からやり直してください。" }, { status: 404 });
    await persist(id);
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  }
  if (action === "undo") {
    const session = undoMove(id, guestId);
    if (!session) return NextResponse.json({ error: "取り消せる手がありません。" }, { status: 422 });
    await persist(id);
    return NextResponse.json({ session });
  }
  if (action === "finish") {
    const session = finishSession(id, guestId);
    if (!session) return NextResponse.json({ error: "セッションが見つかりません。" }, { status: 404 });
    const stageProgress = completeStage(session, await getStageProgress());
    await saveStageProgress(stageProgress);
    await persist(id);
    return NextResponse.json({ session: toPublic(session), stats: dailyStats(session), stageProgress });
  }
  if (action === "hint") {
    const hint = getHint(id, guestId);
    if (!hint) return NextResponse.json({ error: "ヒントは利用できません。" }, { status: 422 });
    await persist(id);
    return NextResponse.json({ hint });
  }
  return NextResponse.json({ error: "エンドポイントが見つかりません。" }, { status: 404 });
}

export async function GET(request: NextRequest, { params }: Context) {
  const path = (await params).path;
  if (path.length === 1 && path[0] === "profile") return NextResponse.json({ stageProgress: await getStageProgress(), stages: stageInfo() });
  if (path.length === 2 && path[0] === "rankings" && path[1] === "daily") {
    const mode = request.nextUrl.searchParams.get("mode");
    return NextResponse.json({ rankings: ranking(mode === "score_attack" ? "score_attack" : "daily", request.nextUrl.searchParams.get("date") ?? undefined) }, { headers: { "Cache-Control": "public, s-maxage=30" } });
  }
  if (path.length === 3 && path[0] === "game-sessions" && path[2] === "replay") {
    const data = replay(path[1]);
    return data ? NextResponse.json({ replay: data }) : NextResponse.json({ error: "公開できるリプレイがありません。" }, { status: 404 });
  }
  return NextResponse.json({ error: "エンドポイントが見つかりません。" }, { status: 404 });
}
