import { describe, expect, it } from "vitest";
import { findWord } from "./dictionary";
import { advanceMissions, initialProgress, missionPool, rebuildProgress } from "./missions";
import type { GameMove } from "./types";

describe("mission engine", () => {
  it("completes category and ending missions independently", () => {
    const missions = missionPool.filter((mission) => ["animal_2", "end_ru"].includes(mission.id));
    let progress = initialProgress(missions);
    progress = advanceMissions(missions, progress, findWord("さる")!).progress;
    expect(progress.end_ru.completed).toBe(true);
    expect(progress.animal_2.current).toBe(1);
  });

  it("tracks unique starts and ordered category missions from the move history", () => {
    const missions = missionPool.filter((mission) => ["starts_5", "animal_food"].includes(mission.id));
    const at = 1_000;
    const moves = ["さる", "りんご", "ごりら", "らっぱ", "ぱせり"].map((input, index) => ({ word: findWord(input)!, score: 100, combo: index + 1, at: at + index * 500 })) as GameMove[];
    const progress = rebuildProgress(missions, moves, 0, false, 0, false);
    expect(progress.starts_5.completed).toBe(true);
    expect(progress.animal_food.completed).toBe(true);
  });
});
