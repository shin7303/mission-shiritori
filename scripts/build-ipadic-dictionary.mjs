import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const sourceDirectory = process.env.IPADIC_SOURCE_DIR;
if (!sourceDirectory) {
  throw new Error("IPADIC_SOURCE_DIR must point to a mecab-ipadic source directory.");
}

const outputPath = path.resolve("lib/game/data/ipadic-nouns.json");
const sourceFiles = ["Noun.csv", "Noun.verbal.csv", "Noun.adjv.csv", "Noun.place.csv"];
const allowedSubtypes = new Set(["一般", "サ変接続", "形容動詞語幹", "固有名詞"]);
const bannedSurfaces = new Set(["殺人", "自殺", "強姦", "強盗", "麻薬", "覚醒剤"]);

function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += character;
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields;
}

const entriesByReading = new Map();
for (const sourceFile of sourceFiles) {
  const csv = await readFile(path.join(sourceDirectory, sourceFile), "utf8");
  for (const line of csv.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (!line) continue;
    const fields = parseCsvLine(line);
    const [surface, , , , partOfSpeech, subtype, , , , , , reading] = fields;
    if (
      partOfSpeech !== "名詞" ||
      !allowedSubtypes.has(subtype) ||
      !surface ||
      bannedSurfaces.has(surface) ||
      !/^[ァ-ヶー]+$/.test(reading ?? "") ||
      [...reading].filter((character) => character !== "ー").length < 2 ||
      [...reading].length > 16
    ) continue;
    if (!entriesByReading.has(reading)) entriesByReading.set(reading, [surface, reading]);
  }
}

const entries = [...entriesByReading.values()].sort(([, left], [, right]) => left.localeCompare(right, "ja"));
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(entries)}\n`, "utf8");
console.log(`Wrote ${entries.length} IPADIC noun entries to ${outputPath}`);
