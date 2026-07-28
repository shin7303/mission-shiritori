import { describe, expect, it } from "vitest";
import { lastKana, normalizeWord } from "./normalize";

describe("normalizeWord", () => {
  it("normalizes katakana and whitespace", () => expect(normalizeWord("  ゴリラ ")).toBe("ごりら"));
  it("rejects spaces and symbols", () => expect(normalizeWord("ご りら")).toBeNull());
  it("normalizes a small final kana", () => expect(lastKana("きゃ")).toBe("や"));
});
