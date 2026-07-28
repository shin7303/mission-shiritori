import { describe, expect, it, vi } from "vitest";
import { initialProgress, missionPool } from "./missions";
import { addMove, compactSession, createSession, finishSession, restoreSession, storedSession, undoMove } from "./service";
import type { CompactSession } from "./service";

describe("v4 game service", () => {
  it("adds a combo and recalculates the route when the one undo is used", () => {
    const created = createSession("00000000-0000-4000-8000-000000000001");
    expect(created).not.toBe("locked");
    if (created === "locked") return;
    expect(addMove(created.id, "00000000-0000-4000-8000-000000000001", "すいか", "first")?.ok).toBe(true);
    expect(addMove(created.id, "00000000-0000-4000-8000-000000000001", "かめ", "second")?.session.combo).toBe(2);
    const undone = undoMove(created.id, "00000000-0000-4000-8000-000000000001");
    expect(undone?.moves.map((move) => move.surface)).toEqual(["すいか"]);
    expect(undone?.undoUsed).toBe(true);
    expect(undone?.combo).toBe(1);
  });

  it("does not mutate a finished session when a new move is submitted", () => {
    const guestId = "00000000-0000-4000-8000-000000000002";
    const created = createSession(guestId);
    expect(created).not.toBe("locked");
    if (created === "locked") return;
    finishSession(created.id, guestId);

    const result = addMove(created.id, guestId, "すいか", "after-finish");
    expect(result?.ok).toBe(false);
    expect(result?.session.status).toBe("finished");
    expect(result?.session.mistakes).toBe(0);
    expect(result?.penaltySeconds).toBeUndefined();
  });

  it("ends an expired game without treating the timeout request as a mistake", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T00:00:00.000Z"));
    const guestId = "00000000-0000-4000-8000-000000000003";
    const created = createSession(guestId);
    expect(created).not.toBe("locked");
    if (created === "locked") return;
    vi.advanceTimersByTime(60_001);

    const result = addMove(created.id, guestId, "すいか", "after-timeout");
    expect(result?.ok).toBe(false);
    expect(result?.error).toBe("時間切れです。");
    expect(result?.session.status).toBe("finished");
    expect(result?.session.mistakes).toBe(0);
    expect(result?.penaltySeconds).toBeUndefined();
    vi.useRealTimers();
  });

  it("keeps event-driven mission progress after the game ends", () => {
    const guestId = "00000000-0000-4000-8000-000000000004";
    const missions = missionPool.filter((mission) => ["words_5", "no_hint_5", "double_card"].includes(mission.id));
    const snapshot: CompactSession = {
      id: "00000000-0000-4000-8000-000000000104", guestId, dailyDate: "2026-07-28", gameMode: "daily",
      startedAt: Date.now(), expiresAt: Date.now() + 60_000, baseGameSeconds: 60, penaltySeconds: 0, hintsUsedCount: 0, shieldUses: 0,
      status: "playing", start: "りす", moves: [], score: 0, mistakes: 0, combo: 0, maxCombo: 0, scoringVersion: 2,
      missionIds: missions.map((mission) => mission.id), progress: initialProgress(missions), completedMissionIds: [], isRanked: false,
      hintUsed: false, hintsAvailable: 1, mistakeShields: 0, nextWordMultiplier: 1, undoUsed: false
    };
    expect(restoreSession(snapshot, guestId)).toBe(true);
    for (const [index, word] of ["すいか", "かさ", "さる", "るーぺ", "ぺん"].entries()) {
      expect(addMove(snapshot.id, guestId, word, `event-${index}`)?.ok).toBe(true);
    }
    const ended = addMove(snapshot.id, guestId, "すいか", "after-event");
    expect(ended?.session.progress.double_card.completed).toBe(true);
  });

  it("accepts normal idempotency keys that overlap Object.prototype", () => {
    const guestId = "00000000-0000-4000-8000-000000000005";
    const created = createSession(guestId);
    expect(created).not.toBe("locked");
    if (created === "locked") return;
    expect(addMove(created.id, guestId, "すいか", "toString")?.ok).toBe(true);
  });

  it("does not roll an existing session back to an older signed snapshot", () => {
    const guestId = "00000000-0000-4000-8000-000000000007";
    const created = createSession(guestId);
    expect(created).not.toBe("locked");
    if (created === "locked") return;
    const snapshot = compactSession(storedSession(created.id, guestId)!);
    expect(addMove(created.id, guestId, "すいか", "newer-move")?.ok).toBe(true);

    expect(restoreSession(snapshot, guestId)).toBe(true);
    expect(storedSession(created.id, guestId)?.moves.map((move) => move.word.surface)).toEqual(["すいか"]);
  });

  it("ranks only the first completed daily session for a guest", () => {
    const guestId = "00000000-0000-4000-8000-000000000006";
    const first = createSession(guestId);
    const second = createSession(guestId);
    expect(first).not.toBe("locked");
    expect(second).not.toBe("locked");
    if (first === "locked" || second === "locked") return;

    expect(finishSession(first.id, guestId)?.isRanked).toBe(true);
    expect(finishSession(second.id, guestId)?.isRanked).toBe(false);
  });
});
