#!/usr/bin/env node
/**
 * Classify IPADIC readings with Antigravity's Gemini CLI and save only the
 * positive categories. This is an offline build step: the game never calls AI.
 *
 * Example: node scripts/classify-ipadic-with-agy.mjs --limit 200
 */
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpus = JSON.parse(readFileSync(path.join(root, "lib/game/data/ipadic-nouns.json"), "utf8"));
const outputPath = path.join(root, "lib/game/data/ipadic-categories.json");
const progressPath = path.join(root, "lib/game/data/ipadic-classification-progress.json");
const existing = JSON.parse(readFileSync(outputPath, "utf8"));
const processed = new Set([...JSON.parse(readFileSync(progressPath, "utf8")), ...Object.keys(existing)]);
const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, value] = argument.replace(/^--/, "").split("=");
  return [key, value ?? "true"];
}));
const limit = Number(args.get("limit") ?? Number.MAX_SAFE_INTEGER);
const batchSize = Number(args.get("batch-size") ?? 250);
const parallel = Number(args.get("parallel") ?? 8);
const model = args.get("model") ?? "gemini-3.6-flash-low";
const valid = new Set(["animal", "food", "plant", "tool", "place"]);
const candidates = [...new Map(corpus.map(([surface, reading]) => [reading, surface])).entries()]
  .filter(([reading]) => !processed.has(reading))
  .slice(0, limit);

function parseModelJson(output) {
  const json = output.match(/```json\s*([\s\S]*?)\s*```/)?.[1] ?? output.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("Gemini のJSON出力が見つかりません。");
  return JSON.parse(json);
}

const runAgy = promisify(execFile);
async function classify(batch) {
  const prompt = [
    "あなたは日本語しりとり辞書の保守用分類器です。",
    "各語を animal, food, plant, tool, place の0個以上に分類してください。",
    "人名・会社名・曖昧語・専門語は必ず [] にします。地名だけを place にします。",
    "出力はJSONオブジェクトだけ。キーは読み、値は許可カテゴリだけの配列です。説明・Markdownは禁止です。",
    "入力（[読み, 表記]）:", JSON.stringify(batch)
  ].join("\n");
  const { stdout } = await runAgy("agy", ["--model", model, "--print", prompt], { cwd: root, encoding: "utf8", timeout: 300_000, maxBuffer: 5_000_000 });
  return { batch, result: parseModelJson(stdout) };
}

const batches = Array.from({ length: Math.ceil(candidates.length / batchSize) }, (_, index) => candidates.slice(index * batchSize, (index + 1) * batchSize));
let completed = 0;
for (let index = 0; index < batches.length; index += parallel) {
  const settled = await Promise.allSettled(batches.slice(index, index + parallel).map(classify));
  for (const item of settled) {
    if (item.status === "rejected") { console.error(`バッチ失敗: ${item.reason instanceof Error ? item.reason.message : item.reason}`); continue; }
    const { batch, result } = item.value;
    for (const [reading] of batch) {
      const categories = result[reading];
      if (!Array.isArray(categories)) continue;
      const clean = [...new Set(categories.filter((category) => valid.has(category)))];
      if (clean.length) existing[reading] = clean;
      processed.add(reading);
    }
    completed += batch.length;
  }
  writeFileSync(outputPath, `${JSON.stringify(existing, null, 2)}\n`);
  writeFileSync(progressPath, `${JSON.stringify([...processed])}\n`);
  console.log(`分類済み: ${completed}/${candidates.length}（累計 ${processed.size} 語、カテゴリ付与 ${Object.keys(existing).length} 語）`);
}

console.log(`保存先: ${path.relative(root, outputPath)}（カテゴリ付与 ${Object.keys(existing).length} 語）`);
