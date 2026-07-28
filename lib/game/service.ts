import { createHmac, randomUUID } from "crypto";
import { findWord, wordsStartingWith } from "./dictionary";
import { initialProgress, missionPool, rebuildProgress } from "./missions";
import type { DailyStats, GameMode, GameSession, Mission, MoveResponse, PublicSession, StageProgress } from "./types";

const DAILY_SECONDS = 60;
const SCORE_ATTACK_SECONDS = 60;
const SCORING_VERSION = 2;
const globalStore = globalThis as typeof globalThis & { missionShiritoriSessions?: Map<string, GameSession> };
const sessions = globalStore.missionShiritoriSessions ?? new Map<string, GameSession>();
globalStore.missionShiritoriSessions = sessions;
const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

export type CompactSession = {
  id: string; guestId: string; dailyDate: string; gameMode: GameMode; stageNumber?: number; startedAt: number; expiresAt: number;
  baseGameSeconds: number; penaltySeconds: number; hintsUsedCount: number; shieldUses: number; status: GameSession["status"];
  start: string; moves: [string, number, number, number][]; score: number; mistakes: number; combo: number; maxCombo: number;
  scoringVersion: number; missionIds: string[]; progress: GameSession["progress"]; completedMissionIds: string[];
  isRanked: boolean; hintUsed: boolean; hintsAvailable: number; mistakeShields: number; nextWordMultiplier: number; undoUsed: boolean;
};

const stageSets = [
  { number: 1, title: "はじめの一歩", start: "りす", missions: ["words_5"], seconds: 75 },
  { number: 2, title: "長いことば", start: "すいか", missions: ["words_5", "long_2"], seconds: 75 },
  { number: 3, title: "カテゴリの連鎖", start: "りす", missions: ["animal_2", "food_2", "words_5"], seconds: 80 },
  { number: 4, title: "ミッション攻略", start: "すいか", missions: ["starts_5", "rapid_3", "words_5"], seconds: 80 },
  { number: 5, title: "最終テスト", start: "りす", missions: ["animal_food", "no_hint_5", "words_10"], seconds: 90 }
] as const;

function tokyoDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function byIds(ids: readonly string[]): Mission[] { return ids.map((id) => missionPool.find((mission) => mission.id === id)!).filter(Boolean); }

function selectDailyMissions(date: string) {
  const secret = process.env.DAILY_SEED_SECRET ?? "local-development-secret";
  const hex = createHmac("sha256", secret).update(`${date}:daily:v2`).digest("hex");
  const variants = [
    ["words_5", "animal_2", "end_ru"], ["words_5", "food_2", "long_2"],
    ["words_5", "voiced_2", "rapid_3"], ["starts_5", "animal_food", "no_hint_5"]
  ];
  return byIds(variants[parseInt(hex.slice(0, 2), 16) % variants.length]);
}

function randomMissions() {
  const variants = [["words_5", "long_2", "voiced_2"], ["animal_2", "food_2", "rapid_3"], ["starts_5", "animal_food", "no_hint_5"], ["words_10", "ra_2", "short_long"]];
  return byIds(variants[Math.floor(Math.random() * variants.length)]);
}

function selectGhost(mode: GameMode, guestId: string) {
  const finished = [...sessions.values()].filter((session) => session.status === "finished" && session.gameMode === mode);
  const candidate = finished.find((session) => session.guestId === guestId) ?? finished[Math.floor(Math.random() * finished.length)];
  if (!candidate) return undefined;
  return { id: candidate.id, score: candidate.score, missionCount: candidate.completedMissionIds.length, moves: candidate.moves.map((move) => move.word.surface), label: candidate.guestId === guestId ? "前回のあなた" : "ゴースト" };
}

function multiplierFor(combo: number) { return combo >= 15 ? 1.3 : combo >= 10 ? 1.2 : combo >= 5 ? 1.1 : 1; }

function applyReward(session: GameSession, mission: Mission) {
  const reward = mission.reward;
  if (!reward) return 0;
  if (reward.type === "score") return reward.amount;
  if (reward.type === "time_extension") { session.expiresAt += reward.seconds * 1000; return 0; }
  if (reward.type === "next_word_multiplier") { session.nextWordMultiplier = Math.max(session.nextWordMultiplier, reward.multiplier); return 0; }
  if (reward.type === "mistake_shield") { session.mistakeShields += reward.count; return 0; }
  session.hintsAvailable += reward.count;
  return 0;
}

function updateProgress(session: GameSession, beforeCompleted: string[], now = Date.now()) {
  const next = rebuildProgress(session.missions, session.moves, session.startedAt, session.hintsUsedCount > 0, session.mistakes, session.status === "finished");
  // These missions are completed by an event at a particular move rather than by
  // the current move list alone. Preserve an already-observed event while later
  // moves rebuild the rest of the progress from history.
  for (const mission of session.missions) {
    if ((mission.type === "simultaneous_completion" || mission.type === "last_seconds_completion") && beforeCompleted.includes(mission.id)) {
      next[mission.id] = { current: mission.params.target ?? 1, target: mission.params.target ?? 1, completed: true };
    }
  }
  const justCompleted = session.missions.filter((mission) => next[mission.id].completed && !beforeCompleted.includes(mission.id));
  const doubleMission = session.missions.find((mission) => mission.type === "simultaneous_completion");
  if (doubleMission && justCompleted.filter((mission) => mission.id !== doubleMission.id).length >= 2 && !beforeCompleted.includes(doubleMission.id)) {
    next[doubleMission.id] = { current: 1, target: 1, completed: true };
    justCompleted.push(doubleMission);
  }
  const lateMission = session.missions.find((mission) => mission.type === "last_seconds_completion");
  if (lateMission && Math.ceil((session.expiresAt - now) / 1000) <= (lateMission.params.maxSeconds ?? 5) && justCompleted.some((mission) => mission.id !== lateMission.id) && !beforeCompleted.includes(lateMission.id)) {
    next[lateMission.id] = { current: 1, target: 1, completed: true };
    justCompleted.push(lateMission);
  }
  session.progress = next;
  session.completedMissionIds = session.missions.filter((mission) => next[mission.id].completed).map((mission) => mission.id);
  return justCompleted;
}

export function toPublic(session: GameSession, now = Date.now()): PublicSession {
  return {
    id: session.id, status: session.status, gameMode: session.gameMode, stageNumber: session.stageNumber, score: session.score,
    remainingSeconds: Math.max(0, Math.ceil((session.expiresAt - now) / 1000)), startWord: session.startWord.surface,
    moves: session.moves.map(({ word, score, combo }) => ({ surface: word.surface, reading: word.reading, score, combo })),
    missions: session.missions, progress: session.progress, mistakes: session.mistakes, isRanked: session.isRanked,
    hintUsed: session.hintsUsedCount > 0, hintsAvailable: session.hintsAvailable, combo: session.combo, maxCombo: session.maxCombo,
    undoUsed: session.undoUsed, scoringVersion: session.scoringVersion, ghost: session.ghost
  };
}

export function compactSession(session: GameSession): CompactSession {
  return {
    id: session.id, guestId: session.guestId, dailyDate: session.dailyDate, gameMode: session.gameMode, stageNumber: session.stageNumber,
    startedAt: session.startedAt, expiresAt: session.expiresAt, baseGameSeconds: session.baseGameSeconds, penaltySeconds: session.penaltySeconds,
    hintsUsedCount: session.hintsUsedCount, shieldUses: session.shieldUses, status: session.status, start: session.startWord.normalized,
    moves: session.moves.map((move) => [move.word.normalized, move.score, move.at, move.combo]), score: session.score, mistakes: session.mistakes,
    combo: session.combo, maxCombo: session.maxCombo, scoringVersion: session.scoringVersion, missionIds: session.missions.map((mission) => mission.id),
    progress: session.progress, completedMissionIds: session.completedMissionIds, isRanked: session.isRanked, hintUsed: session.hintUsed, hintsAvailable: session.hintsAvailable,
    mistakeShields: session.mistakeShields, nextWordMultiplier: session.nextWordMultiplier, undoUsed: session.undoUsed
  };
}

export function restoreSession(snapshot: CompactSession, guestId: string): boolean {
  if (!snapshot || snapshot.guestId !== guestId || !snapshot.id || !Array.isArray(snapshot.moves) || !Array.isArray(snapshot.missionIds)) return false;
  const existing = sessions.get(snapshot.id);
  // A signed cookie can still be an older, valid snapshot. The in-memory session
  // is authoritative while this server is alive, so never roll it back.
  if (existing) return existing.guestId === guestId;
  const startWord = findWord(snapshot.start);
  const missions = byIds(snapshot.missionIds);
  const moves = snapshot.moves.map(([input, score, at, combo]) => {
    const word = findWord(input);
    return word && Number.isFinite(score) && Number.isFinite(at) && Number.isFinite(combo) ? { word, score, at, combo } : null;
  });
  if (!startWord || missions.length !== snapshot.missionIds.length || moves.some((move) => !move)) return false;
  const session: GameSession = {
    id: snapshot.id, guestId, dailyDate: snapshot.dailyDate, gameMode: snapshot.gameMode, stageNumber: snapshot.stageNumber,
    startedAt: snapshot.startedAt, expiresAt: snapshot.expiresAt, baseGameSeconds: snapshot.baseGameSeconds, penaltySeconds: snapshot.penaltySeconds,
    hintsUsedCount: snapshot.hintsUsedCount, shieldUses: snapshot.shieldUses, status: snapshot.status, startWord, moves: moves as GameSession["moves"],
    score: snapshot.score, mistakes: snapshot.mistakes, combo: snapshot.combo, maxCombo: snapshot.maxCombo, scoringVersion: snapshot.scoringVersion,
    missions, progress: snapshot.progress, completedMissionIds: snapshot.completedMissionIds, isRanked: snapshot.isRanked,
    hintUsed: snapshot.hintUsed, hintsAvailable: snapshot.hintsAvailable, mistakeShields: snapshot.mistakeShields,
    nextWordMultiplier: snapshot.nextWordMultiplier, undoUsed: snapshot.undoUsed, processedMoveIds: Object.create(null)
  };
  sessions.set(session.id, session);
  return true;
}

export function storedSession(id: string, guestId: string) {
  const session = sessions.get(id);
  return session?.guestId === guestId ? session : null;
}

export function createSession(guestId: string, gameMode: GameMode = "daily", stageNumber?: number, stageProgress: StageProgress = { unlockedStage: 1, completedStageNumbers: [] }): PublicSession | "locked" {
  const now = Date.now();
  const date = tokyoDate();
  const stage = gameMode === "stage" ? stageSets.find((item) => item.number === (stageNumber ?? 1)) ?? stageSets[0] : undefined;
  if (stage && stage.number > stageProgress.unlockedStage) return "locked";
  const missions = stage ? byIds(stage.missions) : gameMode === "score_attack" ? randomMissions() : selectDailyMissions(date);
  const seconds = stage?.seconds ?? (gameMode === "score_attack" ? SCORE_ATTACK_SECONDS : DAILY_SECONDS);
  const startWord = findWord(stage?.start ?? (gameMode === "score_attack" ? ["りす", "すいか", "ごりら", "らっぱ"][Math.floor(Math.random() * 4)] : "りす"))!;
  const session: GameSession = {
    id: randomUUID(), guestId, dailyDate: date, gameMode, stageNumber: stage?.number, startedAt: now, expiresAt: now + seconds * 1000,
    baseGameSeconds: seconds, penaltySeconds: 0, hintsUsedCount: 0, shieldUses: 0, status: "playing", startWord, moves: [],
    score: 0, mistakes: 0, combo: 0, maxCombo: 0, scoringVersion: SCORING_VERSION, missions, progress: initialProgress(missions), completedMissionIds: [],
    isRanked: gameMode === "score_attack" || (gameMode === "daily" && ![...sessions.values()].some((value) => value.guestId === guestId && value.dailyDate === date && value.gameMode === gameMode && value.status === "finished" && value.isRanked)),
    hintUsed: false, hintsAvailable: 1, mistakeShields: 0, nextWordMultiplier: 1, undoUsed: false, ghost: selectGhost(gameMode, guestId), processedMoveIds: Object.create(null)
  };
  sessions.set(session.id, session);
  return toPublic(session, now);
}

function end(session: GameSession) {
  if (session.status === "finished") return;
  const before = [...session.completedMissionIds];
  session.status = "finished";
  if (session.gameMode === "daily" && session.isRanked) {
    session.isRanked = ![...sessions.values()].some((other) =>
      other.id !== session.id && other.guestId === session.guestId && other.dailyDate === session.dailyDate &&
      other.gameMode === "daily" && other.status === "finished" && other.isRanked
    );
  }
  const justCompleted = updateProgress(session, before);
  session.score += justCompleted.reduce((total, mission) => total + mission.baseScore + applyReward(session, mission), 0);
  if (session.completedMissionIds.length === session.missions.length) session.score += 500;
  if (session.mistakes === 0) session.score += 300;
}

function invalid(session: GameSession, message: string, moveId: string): MoveResponse {
  session.mistakes += 1;
  session.combo = 0;
  let penaltySeconds = 0;
  if (session.mistakeShields > 0) { session.mistakeShields -= 1; session.shieldUses += 1; }
  else { penaltySeconds = 2; session.penaltySeconds += penaltySeconds; session.expiresAt -= penaltySeconds * 1000; }
  if (session.expiresAt <= Date.now()) end(session);
  const response: MoveResponse = { ok: false, error: message, penaltySeconds, ended: session.status === "finished", session: toPublic(session) };
  session.processedMoveIds[moveId] = response;
  return response;
}

function rejected(session: GameSession, message: string, moveId: string): MoveResponse {
  const response: MoveResponse = { ok: false, error: message, ended: session.status === "finished", session: toPublic(session) };
  session.processedMoveIds[moveId] = response;
  return response;
}

export function addMove(id: string, guestId: string, input: string, moveId: string): MoveResponse | null {
  const session = sessions.get(id);
  if (!session || session.guestId !== guestId) return null;
  if (hasOwn(session.processedMoveIds, moveId)) return session.processedMoveIds[moveId];
  if (session.status !== "playing") return rejected(session, "このゲームは終了しています。", moveId);
  if (Date.now() > session.expiresAt) { end(session); return rejected(session, "時間切れです。", moveId); }
  const word = findWord(input);
  if (!word) return invalid(session, "辞書にない単語です。", moveId);
  const previous = session.moves.at(-1)?.word ?? session.startWord;
  if (word.firstKana !== previous.lastKana) return invalid(session, `「${previous.lastKana}」から始まる言葉を入力してください。`, moveId);
  if (session.moves.some((move) => move.word.normalized === word.normalized) || word.normalized === session.startWord.normalized) return invalid(session, "その単語はすでに使われています。", moveId);

  const before = [...session.completedMissionIds];
  session.combo += 1;
  session.maxCombo = Math.max(session.maxCombo, session.combo);
  const base = 100 + (word.characterCount >= 5 ? 20 : 0);
  const score = Math.round(base * multiplierFor(session.combo) * session.nextWordMultiplier);
  session.nextWordMultiplier = 1;
  session.score += score;
  session.moves.push({ word, score, at: Date.now(), combo: session.combo });
  const justCompleted = updateProgress(session, before);
  const missionScore = justCompleted.reduce((total, mission) => total + mission.baseScore + applyReward(session, mission), 0);
  session.score += missionScore;
  const simultaneousBonus = justCompleted.filter((mission) => mission.type !== "simultaneous_completion").length >= 2 ? 100 : 0;
  session.score += simultaneousBonus;
  const ended = word.lastKana === "ん";
  if (ended) end(session);
  const response: MoveResponse = { ok: true, addedWord: word.surface, ended, completedMissionIds: justCompleted.map((mission) => mission.id), simultaneousBonus, session: toPublic(session) };
  session.processedMoveIds[moveId] = response;
  return response;
}

export function undoMove(id: string, guestId: string): PublicSession | null {
  const session = sessions.get(id);
  if (!session || session.guestId !== guestId || session.undoUsed || session.moves.length === 0) return null;
  session.undoUsed = true;
  session.moves.pop();
  session.status = "playing";
  session.score = 0; session.combo = 0; session.maxCombo = 0; session.completedMissionIds = [];
  session.progress = initialProgress(session.missions); session.expiresAt = session.startedAt + session.baseGameSeconds * 1000 - session.penaltySeconds * 1000;
  session.hintsAvailable = 1 - session.hintsUsedCount; session.mistakeShields = -session.shieldUses; session.nextWordMultiplier = 1;
  const original = [...session.moves]; session.moves = [];
  for (const move of original) {
    const before = [...session.completedMissionIds];
    session.combo += 1; session.maxCombo = Math.max(session.maxCombo, session.combo);
    const score = Math.round((100 + (move.word.characterCount >= 5 ? 20 : 0)) * multiplierFor(session.combo) * session.nextWordMultiplier);
    session.nextWordMultiplier = 1; session.score += score; session.moves.push({ ...move, score, combo: session.combo });
    const completed = updateProgress(session, before, move.at);
    session.score += completed.reduce((total, mission) => total + mission.baseScore + applyReward(session, mission), 0);
    if (completed.filter((mission) => mission.type !== "simultaneous_completion").length >= 2) session.score += 100;
  }
  session.mistakeShields = Math.max(0, session.mistakeShields);
  session.hintsAvailable = Math.max(0, session.hintsAvailable);
  return toPublic(session);
}

export function finishSession(id: string, guestId: string): GameSession | null {
  const session = sessions.get(id);
  if (!session || session.guestId !== guestId) return null;
  end(session);
  return session;
}

export function getHint(id: string, guestId: string): { count: number; kana: string; remaining: number } | null {
  const session = sessions.get(id);
  if (!session || session.guestId !== guestId || session.hintsAvailable < 1 || session.status !== "playing") return null;
  session.hintsAvailable -= 1; session.hintsUsedCount += 1; session.hintUsed = true;
  const previous = session.moves.at(-1)?.word ?? session.startWord;
  return { kana: previous.lastKana, count: wordsStartingWith(previous.lastKana), remaining: session.hintsAvailable };
}

export function stageInfo() { return stageSets.map(({ number, title, missions }) => ({ number, title, missions: byIds(missions) })); }
export function completeStage(session: GameSession, progress: StageProgress): StageProgress {
  if (session.gameMode !== "stage" || session.status !== "finished" || session.completedMissionIds.length !== session.missions.length || !session.stageNumber) return progress;
  const completedStageNumbers = [...new Set([...progress.completedStageNumbers, session.stageNumber])].sort((a, b) => a - b);
  return { completedStageNumbers, unlockedStage: Math.min(stageSets.length, Math.max(progress.unlockedStage, session.stageNumber + 1)) };
}

export function ranking(mode: GameMode = "daily", date = tokyoDate()) {
  return [...sessions.values()].filter((session) => session.gameMode === mode && session.dailyDate === date && session.status === "finished" && session.isRanked && session.scoringVersion === SCORING_VERSION)
    .sort((a, b) => b.score - a.score || a.startedAt - b.startedAt).slice(0, 20)
    .map((session, index) => ({ rank: index + 1, score: session.score, moves: session.moves.length, label: `ゲスト ${session.guestId.slice(0, 4)}`, id: session.id }));
}

export function dailyStats(session: GameSession): DailyStats | undefined {
  if (session.gameMode !== "daily" || !session.isRanked) return undefined;
  const completed = [...sessions.values()].filter((item) => item.gameMode === "daily" && item.dailyDate === session.dailyDate && item.status === "finished" && item.isRanked && item.scoringVersion === SCORING_VERSION).sort((a, b) => b.score - a.score);
  if (!completed.length) return undefined;
  const scores = completed.map((item) => item.score); const rank = scores.findIndex((score) => score === session.score) + 1;
  const averageScore = Math.round(scores.reduce((total, score) => total + score, 0) / scores.length);
  const medianScore = scores[Math.floor(scores.length / 2)];
  return { rank, participants: scores.length, percentile: Math.round(((scores.length - rank) / Math.max(1, scores.length - 1)) * 100), averageScore, medianScore, missionCompletionRate: Math.round((completed.reduce((total, item) => total + item.completedMissionIds.length / item.missions.length, 0) / completed.length) * 100), longestChain: Math.max(...completed.map((item) => item.moves.length)) };
}

export function replay(id: string) {
  const session = sessions.get(id);
  if (!session || session.status !== "finished" || !session.isRanked) return null;
  return { id: session.id, gameMode: session.gameMode, startWord: session.startWord.surface, score: session.score, moves: session.moves.map((move) => ({ word: move.word.surface, score: move.score, combo: move.combo, at: move.at })), completedMissionIds: session.completedMissionIds };
}
