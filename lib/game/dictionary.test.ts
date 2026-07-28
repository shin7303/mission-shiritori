import { describe, expect, it } from "vitest";
import { findWord, words } from "./dictionary";
import ipadicNouns from "./data/ipadic-nouns.json";
import classificationProgress from "./data/ipadic-classification-progress.json";

describe("dictionary", () => {
  it("accepts country names in katakana and assigns the place category", () => {
    expect(findWord("フランス")?.categories).toContain("place");
    expect(findWord("アメリカ")?.categories).toContain("place");
    expect(findWord("ニュージーランド")?.categories).toContain("place");
    expect(findWord("にほん")?.categories).toContain("place");
  });

  it("includes a broad set of places and everyday words", () => {
    expect(words.filter((word) => word.categories.includes("place")).length).toBeGreaterThan(200);
    expect(findWord("けしごむ")?.categories).toContain("tool");
    expect(findWord("りんご")?.categories).toContain("food");
  });

  it("includes more than one hundred thousand corpus-derived common nouns", () => {
    expect(words.length).toBeGreaterThan(100_000);
    expect(findWord("がっこう")?.surface).toBe("がっこう");
    expect(findWord("コンピューター")?.surface).toBe("こんぴゅーたー");
  });

  it("uses offline Gemini classifications for corpus words", () => {
    expect(findWord("アーモンド")?.categories).toEqual(expect.arrayContaining(["food", "plant"]));
    expect(findWord("アイガモ")?.categories).toContain("animal");
  });

  it("includes curated niche vocabulary with mission categories", () => {
    expect(findWord("カピバラ")?.categories).toEqual(["animal"]);
    expect(findWord("タプナード")?.categories).toEqual(["food"]);
    expect(findWord("ケガキバリ")?.categories).toEqual(["tool"]);
    expect(findWord("ネモフィラ")?.categories).toEqual(["plant"]);
    expect(findWord("ウユニ")?.categories).toEqual(["place"]);
  });

  it("has processed classification for every IPADIC reading", () => {
    const processed = new Set(classificationProgress);
    expect(ipadicNouns.every(([, reading]) => processed.has(reading))).toBe(true);
  });
});
