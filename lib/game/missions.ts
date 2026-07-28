import type { GameMove, Mission, MissionProgress, Word } from "./types";

export const missionPool: Mission[] = [
  { id: "words_5", name: "しりとり入門", description: "単語を5回つなぐ", baseScore: 250, type: "word_count", params: { target: 5 }, tags: ["count"] },
  { id: "words_10", name: "つながる言葉", description: "単語を10回つなぐ", baseScore: 450, type: "word_count", params: { target: 10 }, reward: { type: "time_extension", seconds: 3 }, tags: ["count", "long"] },
  { id: "animal_2", name: "動物博士", description: "動物カテゴリの単語を2回使う", baseScore: 300, type: "category_count", params: { category: "animal", target: 2 }, reward: { type: "hint_restore", count: 1 }, tags: ["animal"] },
  { id: "food_2", name: "食いしんぼう", description: "食べ物カテゴリの単語を2回使う", baseScore: 300, type: "category_count", params: { category: "food", target: 2 }, reward: { type: "next_word_multiplier", multiplier: 1.5 }, tags: ["food"] },
  { id: "long_2", name: "ながい言葉", description: "5文字以上の単語を2回使う", baseScore: 350, type: "character_count", params: { minLength: 5, target: 2 }, reward: { type: "mistake_shield", count: 1 }, tags: ["length"] },
  { id: "end_ru", name: "るで着地", description: "「る」で終わる単語を使う", baseScore: 280, type: "ending_kana", params: { kana: "る", target: 1 }, tags: ["ending"] },
  { id: "voiced_2", name: "にごり名人", description: "濁音から始まる単語を2回使う", baseScore: 300, type: "voiced_start_count", params: { target: 2 }, tags: ["start"] },
  { id: "ra_2", name: "ら行ハンター", description: "ら行から始まる単語を2回使う", baseScore: 300, type: "row_start_count", params: { row: "ら", target: 2 }, tags: ["start", "row"] },
  { id: "starts_5", name: "文字めぐり", description: "異なる開始文字を5種類使う", baseScore: 340, type: "unique_start_count", params: { target: 5 }, tags: ["start", "unique"] },
  { id: "rapid_3", name: "スピード回答", description: "10秒以内に3語つなぐ", baseScore: 360, type: "rapid_words", params: { target: 3, maxSeconds: 10 }, tags: ["speed"] },
  { id: "average_5", name: "即答マスター", description: "平均5秒以内で5語答える", baseScore: 380, type: "average_response", params: { target: 5, maxSeconds: 5 }, tags: ["speed", "average"] },
  { id: "animal_food", name: "おなかすいた", description: "動物→食べ物の順で使う", baseScore: 330, type: "category_sequence", params: { firstCategory: "animal", secondCategory: "food", target: 1 }, tags: ["sequence"] },
  { id: "short_long", name: "ことばジャンプ", description: "短い単語→長い単語の順で使う", baseScore: 330, type: "length_sequence", params: { minLength: 5, target: 1 }, tags: ["sequence", "length"] },
  { id: "no_hint_5", name: "自力で突破", description: "ヒントを使わず5語つなぐ", baseScore: 360, type: "no_hint_words", params: { target: 5 }, tags: ["constraint"] },
  { id: "flawless", name: "ノーミス", description: "ミスをせずにゲームを終える", baseScore: 450, type: "flawless_finish", params: { target: 1 }, tags: ["constraint", "finish"] },
  { id: "double_card", name: "一石二鳥", description: "1手で2枚のミッションを達成", baseScore: 400, type: "simultaneous_completion", params: { target: 1 }, tags: ["advanced"] },
  { id: "last_spurt", name: "ラストスパート", description: "残り5秒以内にミッションを達成", baseScore: 420, type: "last_seconds_completion", params: { target: 1, maxSeconds: 5 }, tags: ["advanced", "speed"] }
];

export function initialProgress(missions: Mission[]): Record<string, MissionProgress> {
  return Object.fromEntries(missions.map((mission) => [mission.id, { current: 0, target: mission.params.target ?? 1, completed: false }]));
}

const voiced = new Set(["が", "ぎ", "ぐ", "げ", "ご", "ざ", "じ", "ず", "ぜ", "ぞ", "だ", "ぢ", "づ", "で", "ど", "ば", "び", "ぶ", "べ", "ぼ", "ぱ", "ぴ", "ぷ", "ぺ", "ぽ"]);
const raRow = new Set(["ら", "り", "る", "れ", "ろ"]);

function matchesSingle(mission: Mission, word: Word): boolean {
  switch (mission.type) {
    case "word_count": return true;
    case "character_count": return word.characterCount >= (mission.params.minLength ?? Infinity);
    case "category_count": return word.categories.includes(mission.params.category!);
    case "ending_kana": return word.lastKana === mission.params.kana;
    case "voiced_start_count": return voiced.has(word.firstKana);
    case "row_start_count": return mission.params.row === "ら" && raRow.has(word.firstKana);
    default: return false;
  }
}

export function doesWordAdvance(mission: Mission, word: Word): boolean { return matchesSingle(mission, word); }

export function advanceMissions(missions: Mission[], progress: Record<string, MissionProgress>, word: Word): { progress: Record<string, MissionProgress>; completed: Mission[] } {
  const next = structuredClone(progress);
  const completed: Mission[] = [];
  for (const mission of missions) {
    const item = next[mission.id];
    if (!item.completed && matchesSingle(mission, word)) {
      item.current = Math.min(item.target, item.current + 1);
      item.completed = item.current >= item.target;
      if (item.completed) completed.push(mission);
    }
  }
  return { progress: next, completed };
}

export function rebuildProgress(missions: Mission[], moves: GameMove[], startedAt: number, hintUsed: boolean, mistakes: number, finished: boolean): Record<string, MissionProgress> {
  const progress = initialProgress(missions);
  for (const mission of missions) {
    const item = progress[mission.id];
    const words = moves.map((move) => move.word);
    let value = 0;
    switch (mission.type) {
      case "word_count": value = moves.length; break;
      case "character_count": value = words.filter((word) => word.characterCount >= (mission.params.minLength ?? Infinity)).length; break;
      case "category_count": value = words.filter((word) => word.categories.includes(mission.params.category!)).length; break;
      case "ending_kana": value = words.filter((word) => word.lastKana === mission.params.kana).length; break;
      case "voiced_start_count": value = words.filter((word) => voiced.has(word.firstKana)).length; break;
      case "row_start_count": value = words.filter((word) => mission.params.row === "ら" && raRow.has(word.firstKana)).length; break;
      case "unique_start_count": value = new Set(words.map((word) => word.firstKana)).size; break;
      case "rapid_words": value = moves.some((move, index) => index >= (mission.params.target ?? 3) - 1 && move.at - moves[index - (mission.params.target ?? 3) + 1].at <= (mission.params.maxSeconds ?? 10) * 1000) ? 1 : 0; break;
      case "average_response": {
        const count = mission.params.target ?? 5;
        const first = moves.slice(0, count);
        if (first.length >= count) value = (first.at(-1)!.at - startedAt) / count <= (mission.params.maxSeconds ?? 5) * 1000 ? 1 : 0;
        break;
      }
      case "category_sequence": value = words.some((word, index) => index > 0 && words[index - 1].categories.includes(mission.params.firstCategory!) && word.categories.includes(mission.params.secondCategory!)) ? 1 : 0; break;
      case "length_sequence": value = words.some((word, index) => index > 0 && words[index - 1].characterCount < (mission.params.minLength ?? 5) && word.characterCount >= (mission.params.minLength ?? 5)) ? 1 : 0; break;
      case "no_hint_words": value = hintUsed ? 0 : moves.length; break;
      case "flawless_finish": value = finished && mistakes === 0 ? 1 : 0; break;
      case "simultaneous_completion":
      case "last_seconds_completion": break;
    }
    item.current = Math.min(item.target, value);
    item.completed = item.current >= item.target;
  }
  // These two types depend on completion events, so the service updates them at the
  // moment it observes an event; they are intentionally retained by callers.
  return progress;
}
