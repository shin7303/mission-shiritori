const smallKana: Record<string, string> = { "ぁ": "あ", "ぃ": "い", "ぅ": "う", "ぇ": "え", "ぉ": "お", "ゃ": "や", "ゅ": "ゆ", "ょ": "よ", "っ": "つ", "ゎ": "わ" };

export function normalizeWord(input: string): string | null {
  const normalized = input.normalize("NFKC").trim().replace(/[\u30A1-\u30F6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
  return /^[ぁ-ゖー]+$/.test(normalized) ? normalized : null;
}

export function lastKana(reading: string): string {
  const chars = [...reading];
  const last = chars.at(-1) ?? "";
  return smallKana[last] ?? last;
}

export function firstKana(reading: string): string { return reading[0] ?? ""; }
