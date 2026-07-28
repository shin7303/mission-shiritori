export type Category = "animal" | "food" | "plant" | "tool" | "place";
export type GameMode = "daily" | "score_attack" | "stage";
export type MissionType =
  | "word_count" | "character_count" | "category_count" | "ending_kana"
  | "voiced_start_count" | "row_start_count" | "unique_start_count"
  | "rapid_words" | "average_response" | "category_sequence" | "length_sequence"
  | "no_hint_words" | "flawless_finish" | "simultaneous_completion" | "last_seconds_completion";
export type Reward =
  | { type: "score"; amount: number }
  | { type: "time_extension"; seconds: number }
  | { type: "next_word_multiplier"; multiplier: number }
  | { type: "mistake_shield"; count: number }
  | { type: "hint_restore"; count: number };

export type Word = {
  id: string; surface: string; reading: string; normalized: string;
  firstKana: string; lastKana: string; characterCount: number;
  partOfSpeech: "noun"; categories: Category[]; dictionaryVersion: number;
};

export type Mission = {
  id: string; name: string; description: string; baseScore: number; type: MissionType;
  params: {
    target?: number; category?: Category; kana?: string; minLength?: number;
    row?: string; maxSeconds?: number; firstCategory?: Category; secondCategory?: Category;
  };
  reward?: Reward;
  tags: string[];
};

export type MissionProgress = { current: number; target: number; completed: boolean };
export type GameMove = { word: Word; score: number; at: number; combo: number };
export type GameStatus = "playing" | "finished";
export type Ghost = { id: string; score: number; missionCount: number; moves: string[]; label: string };
export type StageProgress = { unlockedStage: number; completedStageNumbers: number[] };

export type GameSession = {
  id: string; guestId: string; dailyDate: string; gameMode: GameMode; stageNumber?: number;
  startedAt: number; expiresAt: number; status: GameStatus; startWord: Word; moves: GameMove[];
  score: number; mistakes: number; combo: number; maxCombo: number; scoringVersion: number;
  baseGameSeconds: number; penaltySeconds: number; hintsUsedCount: number; shieldUses: number;
  missions: Mission[]; progress: Record<string, MissionProgress>; completedMissionIds: string[];
  isRanked: boolean; hintUsed: boolean; hintsAvailable: number; mistakeShields: number;
  nextWordMultiplier: number; undoUsed: boolean; ghost?: Ghost; processedMoveIds: Record<string, MoveResponse>;
};

export type DailyStats = {
  rank: number; participants: number; percentile: number; averageScore: number; medianScore: number;
  missionCompletionRate: number; longestChain: number; previousDayDifference?: number;
};

export type MoveResponse = {
  ok: boolean; error?: string; session: PublicSession; addedWord?: string;
  ended?: boolean; penaltySeconds?: number; completedMissionIds?: string[]; simultaneousBonus?: number;
};

export type PublicSession = {
  id: string; status: GameStatus; gameMode: GameMode; stageNumber?: number; score: number;
  remainingSeconds: number; startWord: string; moves: { surface: string; reading: string; score: number; combo: number }[];
  missions: Mission[]; progress: Record<string, MissionProgress>; mistakes: number; isRanked: boolean;
  hintUsed: boolean; hintsAvailable: number; combo: number; maxCombo: number; undoUsed: boolean;
  scoringVersion: number; ghost?: Ghost;
};
