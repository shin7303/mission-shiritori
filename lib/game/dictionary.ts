import { firstKana, lastKana, normalizeWord } from "./normalize";
import type { Category, Word } from "./types";
import ipadicNouns from "./data/ipadic-nouns.json";
import ipadicCategories from "./data/ipadic-categories.json";

type Seed = [string, Category[]];
const coreSeed: Seed[] = [
  ["りす", ["animal"]], ["すずめ", ["animal"]], ["すいか", ["food"]], ["すみれ", ["plant"]],
  ["めだか", ["animal"]], ["めろん", ["food"]], ["かさ", ["tool"]], ["かえる", ["animal"]], ["かぼちゃ", ["food"]],
  ["さる", ["animal"]], ["さくら", ["plant"]], ["るーぺ", ["tool"]], ["るす", ["place"]], ["ぺん", ["tool"]],
  ["らっぱ", ["tool"]], ["ぱん", ["food"]], ["まくら", ["tool"]], ["らいおん", ["animal"]],
  ["たぬき", ["animal"]], ["きつね", ["animal"]], ["ねこ", ["animal"]], ["こあら", ["animal"]],
  ["らくだ", ["animal"]], ["だるま", ["tool"]], ["まめ", ["food"]], ["えんぴつ", ["tool"]],
  ["つくし", ["plant"]], ["しまうま", ["animal"]], ["まつ", ["plant"]], ["つばき", ["plant"]],
  ["きく", ["plant"]], ["くるま", ["tool"]], ["まど", ["tool"]], ["どーなつ", ["food"]],
  ["とまと", ["food"]], ["とら", ["animal"]], ["はさみ", ["tool"]], ["みかん", ["food"]],
  ["にんじん", ["food"]], ["んま" as string, []]
];

// 地名は一般名詞と同じく、しりとりで自然に使われるため辞書へ収録する。
// 表記は入力規則に合わせた読み（ひらがな）で保持し、カタカナ入力も normalizeWord が受け付ける。
const countryReadings = [
  "あいすらんど", "あいるらんど", "あふがにすたん", "あめりか", "あめりかがっしゅうこく", "あらぶしゅちょうこくれんぽう", "あるじぇりあ", "あるぜんちん", "あるばにあ", "あんごら", "あんどら", "あんてぃぐあばーぶーだ",
  "いえめん", "いぎりす", "いすらえる", "いずらえる", "いたりあ", "いらく", "いらん", "いんど", "いんどねしあ", "うがんだ", "うくらいな", "うずべきすたん", "うるぐあい", "えくあどる", "えじぷと", "えすとにあ", "えすわてぃに", "えちおぴあ", "えりとりあ", "えるさるばどる", "おーすとらりあ", "おーすとりあ", "おまーん", "おらんだ",
  "かーぼべるで", "かたーる", "かなだ", "かめるーん", "かんぼじあ", "がーな", "がいあな", "がぼん", "がんびあ", "きたまけどにあ", "きぷろす", "きゅーば", "きりばす", "きるぎす", "ぎにあ", "ぎにあびさう", "ぎりしゃ", "くうぇーと", "くっくしょとう", "くろあちあ", "ぐあてまら", "ぐれなだ", "ぐるじあ", "けにあ", "こーとじぼわーる", "こすたりか", "こもろ", "ころんびあ", "こんごきょうわこく", "こんごみんしゅきょうわこく", "こそぼ",
  "さいぷらす", "さうじあらびあ", "さもあ", "さんまりの", "さんとめぷりんしぺ", "ざんびあ", "しえられおね", "しんがぽーる", "じぶち", "じょーじあ", "じゃまいか", "じんばぶえ", "すいす", "すーだん", "すうぇーでん", "すぺいん", "すりなむ", "すりらんか", "すろばきあ", "すろべにあ", "せーしぇる", "せねがる", "せるびあ", "せんときっつねーびす", "せんとるしあ", "せんとびんせんとおよびぐれなでぃーんしょとう", "そまりあ", "そろもんしょとう",
  "たい", "たじきすたん", "たんざにあ", "ちぇこ", "ちゃど", "ちゅうごく", "ちゅにじあ", "ちょうせん", "ちょうせんみんしゅしゅぎじんみんきょうわこく", "ちり", "でんまーく", "とーご", "どいつ", "どみにか", "どみにかきょうわこく", "とるこ", "とるくめにすたん", "とんが", "とりにだーどとばご",
  "ないじぇりあ", "ないじゃー", "ないる", "なみびあ", "にからぐあ", "にほん", "にゅーじーらんど", "ねぱーる", "のるうぇー",
  "はいてぃ", "ぱきすたん", "ぱなま", "ばぬあつ", "ばはます", "ばちかん", "ばーれーん", "ばるばどす", "はんがりー", "ばんぐらでしゅ", "ぱぷあにゅーぎにあ", "ぱらお", "ぱらぐあい", "ひがしてぃもーる", "ふぃじー", "ふぃりぴん", "ふぃんらんど", "ぶーたん", "ぶるがりあ", "ぶるきなふぁそ", "ぶるねい", "ぶるんじ", "ふらんす", "ぶらじる", "べなん", "べねずえら", "べらるーし", "べるぎー", "べりーず", "ぺるー", "ぽーらんど", "ぼすにあへるつぇごびな", "ぼつわな", "ぼりびあ", "ぽるとがる", "ほんじゅらす",
  "まーしゃるしょとう", "まらうい", "まり", "まるた", "まれーしあ", "みくろねしあ", "みくろねしあれんぽう", "みなみあふりか", "みなみすーだん", "みゃんまー", "めきしこ", "もーりしゃす", "もーりたにあ", "もざんびーく", "もなこ", "もるじぶ", "もるどば", "もるでぃぶ", "もんごる", "もんてねぐろ", "もろっこ",
  "よるだん", "らおす", "らとびあ", "りひてんしゅたいん", "りびあ", "りべりあ", "りとあにあ", "るーまにあ", "るくせんぶるく", "るわんだ", "れそと", "ればのん", "ろしあ", "わりすふつな"
];

const japanPlaceReadings = [
  "ほっかいどう", "あおもり", "いわて", "みやぎ", "あきた", "やまがた", "ふくしま", "いばらき", "とちぎ", "ぐんま", "さいたま", "ちば", "とうきょう", "かながわ", "にいがた", "とやま", "いしかわ", "ふくい", "やまなし", "ながの", "ぎふ", "しずおか", "あいち", "みえ", "しが", "きょうと", "おおさか", "ひょうご", "なら", "わかやま", "とっとり", "しまね", "おかやま", "ひろしま", "やまぐち", "とくしま", "かがわ", "えひめ", "こうち", "ふくおか", "さが", "ながさき", "くまもと", "おおいた", "みやざき", "かごしま", "おきなわ",
  "さっぽろ", "せんだい", "よこはま", "なごや", "しんじゅく", "しぶや", "きんかくじ", "ふじさん"
];

const everydaySeed: Seed[] = [
  ["あさ", []], ["あめ", []], ["あおぞら", []], ["いえ", []], ["いけ", ["place"]], ["いし", []], ["いす", ["tool"]], ["うみ", ["place"]], ["うた", []], ["えき", ["place"]], ["おと", []],
  ["かぎ", ["tool"]], ["かみ", []], ["かわ", ["place"]], ["きって", []], ["くも", []], ["くつ", ["tool"]], ["けしごむ", ["tool"]], ["こえ", []], ["こおり", []],
  ["さかな", ["animal"]], ["しんぶん", []], ["すな", []], ["せかい", []], ["そら", []], ["たまご", ["food"]], ["ちず", ["tool"]], ["つき", []], ["てがみ", []], ["とけい", ["tool"]],
  ["なつ", []], ["にじ", []], ["ぬの", []], ["ねずみ", ["animal"]], ["のり", ["food"]], ["はな", ["plant"]], ["ひこうき", ["tool"]], ["ふね", ["tool"]], ["へや", ["place"]], ["ほし", []],
  ["みち", ["place"]], ["むし", ["animal"]], ["めがね", ["tool"]], ["もり", ["place"]], ["やま", ["place"]], ["ゆき", []], ["よる", []], ["らじお", ["tool"]], ["りんご", ["food"]], ["るり", []], ["れきし", []], ["ろうそく", ["tool"]], ["わに", ["animal"]]
];

// IPADIC にない専門・地域語も、しりとりで使う自然な名詞として収録する。
// 全件をゲームのミッションへ正しく反映できるよう、追加語には必ず分類を付ける。
const nicheSeed: Seed[] = [
  ["おひょう", ["animal"]], ["きんめだい", ["animal"]], ["めひかり", ["animal"]], ["おかぴ", ["animal"]], ["かぴばら", ["animal"]],
  ["きんしこう", ["animal"]], ["こもどおおとかげ", ["animal"]], ["さーばる", ["animal"]], ["しふぁか", ["animal"]], ["たーきん", ["animal"]],
  ["びくーにゃ", ["animal"]], ["ぶろぶふぃっしゅ", ["animal"]], ["まなてぃー", ["animal"]], ["あふりかおおまいまい", ["animal"]], ["はしびろこう", ["animal"]],
  ["みつおびあるまじろ", ["animal"]], ["わらびー", ["animal"]], ["はだかでばねずみ", ["animal"]], ["ふさおまきざる", ["animal"]], ["すなねこ", ["animal"]],

  ["おかひじき", ["food"]], ["つるむらさき", ["food"]], ["とんぶり", ["food"]], ["るっこら", ["food"]], ["あんちょび", ["food"]],
  ["くずきり", ["food"]], ["さばらん", ["food"]], ["しゅとれん", ["food"]], ["すこーん", ["food"]], ["たぷなーど", ["food"]],
  ["ふぉんでゅ", ["food"]], ["みんすぱい", ["food"]], ["りえっと", ["food"]], ["るばーぶ", ["food"]], ["ふむす", ["food"]],
  ["ぽれんた", ["food"]], ["きぬあ", ["food"]], ["けっぱー", ["food"]], ["もっつぁれら", ["food"]], ["ぱんちぇった", ["food"]],

  ["あなごかぎ", ["tool"]], ["うろこびき", ["tool"]], ["ぱいぷれんち", ["tool"]], ["ふいご", ["tool"]], ["ほぞきり", ["tool"]],
  ["まいなすどらいばー", ["tool"]], ["やすり", ["tool"]], ["けがきばり", ["tool"]], ["けびき", ["tool"]], ["たがね", ["tool"]],
  ["つかみばし", ["tool"]], ["ばいす", ["tool"]], ["ぷーらー", ["tool"]], ["めがねれんち", ["tool"]], ["もんきーれんち", ["tool"]],
  ["りべったー", ["tool"]], ["しゃこまん", ["tool"]],

  ["あいあんうっど", ["plant"]], ["あがべ", ["plant"]], ["あまらんさす", ["plant"]], ["きんぎょそう", ["plant"]], ["しもつけ", ["plant"]],
  ["ひめしゃら", ["plant"]], ["えぞりんどう", ["plant"]], ["ぎぼうし", ["plant"]], ["くりすますろーず", ["plant"]], ["げらにうむ", ["plant"]],
  ["すかびおさ", ["plant"]], ["たますだれ", ["plant"]], ["にげら", ["plant"]], ["ねもふぃら", ["plant"]], ["はなにら", ["plant"]],
  ["べるがもっと", ["plant"]], ["らなんきゅらす", ["plant"]], ["るぴなす", ["plant"]], ["れんげしょうま", ["plant"]],

  ["あたかま", ["place"]], ["あぞれす", ["place"]], ["うすりーすく", ["place"]], ["おいみゃこん", ["place"]], ["かっぱどきあ", ["place"]],
  ["くりるたい", ["place"]], ["ちちかか", ["place"]], ["てぃむがっど", ["place"]], ["わでぃらむ", ["place"]], ["あれきぱ", ["place"]],
  ["いぐあす", ["place"]], ["うゆに", ["place"]], ["おるどす", ["place"]], ["くろーんぼり", ["place"]], ["げるらっへ", ["place"]],
  ["すぴっつべるげん", ["place"]], ["せれんげてぃ", ["place"]]
];

const seed: Seed[] = [
  ...coreSeed,
  ...countryReadings.map((reading): Seed => [reading, ["place"]]),
  ...japanPlaceReadings.map((reading): Seed => [reading, ["place"]]),
  ...everydaySeed,
  ...nicheSeed
];

const curatedWords: Word[] = seed.filter(([reading]) => reading !== "んま").map(([reading, categories], index) => {
  const normalized = normalizeWord(reading)!;
  return { id: `word_${index + 1}`, surface: reading, reading, normalized, firstKana: firstKana(normalized), lastKana: lastKana(normalized), characterCount: [...normalized].filter((x) => x !== "ー").length, partOfSpeech: "noun", categories, dictionaryVersion: 1 };
});

const corpusWords: Word[] = ipadicNouns.map(([, reading], index) => {
  const normalized = normalizeWord(reading)!;
  const categories = (ipadicCategories[reading as keyof typeof ipadicCategories] ?? []) as Category[];
  return { id: `ipadic_${index + 1}`, surface: normalized, reading: normalized, normalized, firstKana: firstKana(normalized), lastKana: lastKana(normalized), characterCount: [...normalized].filter((x) => x !== "ー").length, partOfSpeech: "noun", categories, dictionaryVersion: 2 };
});

export const words = [...curatedWords, ...corpusWords];

const wordsByNormalized = new Map<string, Word>();
const validStartingWordCounts = new Map<string, number>();
for (const word of words) {
  // Curated entries are registered first so their mission categories are retained.
  if (!wordsByNormalized.has(word.normalized)) wordsByNormalized.set(word.normalized, word);
  if (word.lastKana !== "ん") {
    validStartingWordCounts.set(word.firstKana, (validStartingWordCounts.get(word.firstKana) ?? 0) + 1);
  }
}

export function findWord(input: string): Word | undefined {
  const normalized = normalizeWord(input);
  return normalized ? wordsByNormalized.get(normalized) : undefined;
}

export function wordsStartingWith(kana: string): number { return validStartingWordCounts.get(kana) ?? 0; }
