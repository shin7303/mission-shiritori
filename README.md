# ミッションしりとり

60秒で言葉をつなぎ、ミッションを攻略するしりとりゲームです。ログインなしで遊べます。

公開デモ: [mission-shiritori.vercel.app](https://mission-shiritori.vercel.app)

Next.js / TypeScript で実装した、ミッション制のしりとりゲームです。日本語正規化、サーバー側のルール判定、日替わりチャレンジ、リプレイ、テストを一つの小規模アプリとしてまとめています。

## 起動

```bash
npm install
npm run dev
```

`http://localhost:3000` を開きます。テストと本番ビルドはそれぞれ `npm test`、`npm run build` です。

## 本番環境の設定

`.env.example` を参考に、ホスティング先の環境変数へ次を設定します。値は十分に長いランダム文字列を使い、リポジトリへコミットしません。

- `COOKIE_SIGNING_SECRET` — ゲストCookieの署名に必須。本番で未設定の場合は起動時にエラーになります。
- `DAILY_SEED_SECRET` — 日替わりミッションの選択を安定させるための秘密値。

Vercelで公開する場合は、Production環境に両方を登録してからデプロイします。

## v4で追加した機能

- デイリー、何度でも挑戦できるスコアアタック、5段階のステージモード
- 連続成功で最大 x1.3 になるコンボ倍率（`scoring_version: 2`）
- 開始文字・速度・順序・制約を含む17種のデータ駆動ミッション
- 1プレイ1回の取り消し。スコア・コンボ・ミッション進捗を手番ログから再計算
- 時間延長、次手倍率、ミス無効、ヒント回復のミッション報酬
- 前回または別プレイとのゴースト比較、公開ランキングのリプレイAPI
- デイリー結果の順位、平均・中央値、ミッション達成率、最長連鎖
- ログインの代わりに、署名付き・HttpOnly CookieへゲストIDとステージ解放進捗を保存

## 実装したMVP

- カタカナ→ひらがな・NFKC・小書き文字を扱う日本語正規化
- 国名・都道府県・主要地名に加え、IPADIC から抽出した10万語超の一般名詞コーパスによる辞書照合
- 接続、重複、「ん」終了、時間切れのサーバー判定
- 文字数・カテゴリ・末尾文字・単語数の4種のデータ駆動ミッション
- ミッション達成・同時達成・終了ボーナスのサーバー側スコア計算
- HMACシードによる日替わりで共通のミッション選択（Asia/Tokyo）
- 再送で二重加点しない `clientMoveId`、ヒント、結果表示、ランキングAPI

## API

- `POST /api/v1/game-sessions`
- `POST /api/v1/game-sessions/:id/moves`
- `POST /api/v1/game-sessions/:id/finish`
- `POST /api/v1/game-sessions/:id/hint`
- `POST /api/v1/game-sessions/:id/undo`
- `GET /api/v1/game-sessions/:id/replay`
- `GET /api/v1/rankings/daily`
- `GET /api/v1/profile`

## 設計メモ

ゲームルールは `lib/game` に分離し、Route HandlerとUIはその呼び出しだけを担当します。アカウント認証は実装せず、ゲストIDとステージ進捗だけを署名付き・HttpOnly Cookieに保存します。Cookieが削除・失効した端末ではステージ進捗もリセットされます。

公開デモでは、ゲーム中セッション・ゴースト・ランキングを単一のAPI関数内のメモリに保持します。そのため、サーバーの再起動やスケールアウト時にはプレイ履歴・ランキングが消去されます。

公開運用では `words`、`missions`、`game_sessions`、`game_moves`、`daily_challenges` をNeon PostgreSQLに移し、セッション作成・着手・終了をトランザクションにします。辞書を1万〜3万語へ入れ替えても、正規化・ミッション・スコアのドメインロジックは変更しません。MVPの構成は、Next.js Route HandlersとPostgreSQLを一体で運用し、実測上必要になるまでRedisや別APIサーバーを増やさない方針です。

`DAILY_SEED_SECRET` を環境変数に設定すると、本番用のデイリーシードに切り替わります。

## 開発・公開上の注意

- CIではテスト、Lint、本番ビルドを実行します。
- 本リポジトリにはライセンスを付与していません。コードの再利用・再配布は許可されません。
- IPADIC由来の辞書データには別途条件があります。詳細は `THIRD_PARTY_NOTICES.md` を参照してください。

## 辞書データ

日常語は IPADIC の原データから、一般名詞・サ変接続名詞・形容動詞語幹・地名だけを自動抽出しています。読みを持つ品詞付きコーパスを採用することで、生成AIによる不自然な語や読み誤りを避けています。生成手順は `scripts/build-ipadic-dictionary.mjs`、ライセンス表記は `THIRD_PARTY_NOTICES.md` にあります。

カテゴリは、既存の人手登録に加え、Gemini 3.6 Flash によるオフライン分類結果を `lib/game/data/ipadic-categories.json` へ保存します。ゲーム実行時にAI APIは呼びません。追加分類は `node scripts/classify-ipadic-with-agy.mjs --limit=200` で小分けに実行でき、曖昧語は未分類のまま残す方針です。
