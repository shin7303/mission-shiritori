"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { DailyStats, GameMode, Mission, PublicSession, StageProgress } from "@/lib/game/types";
import { lastKana } from "@/lib/game/normalize";

type Notice = { kind: "error" | "success" | "hint"; message: string } | null;
type Stage = { number: number; title: string; missions: Mission[] };
function formatTime(seconds: number) { return `00:${String(Math.max(0, seconds)).padStart(2, "0")}`; }

export default function Home() {
  const [session, setSession] = useState<PublicSession | null>(null);
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; ranked: boolean; stats?: DailyStats; stageProgress?: StageProgress } | null>(null);
  const [profile, setProfile] = useState<StageProgress>({ unlockedStage: 1, completedStageNumbers: [] });
  const [stages, setStages] = useState<Stage[]>([]);
  const [showStages, setShowStages] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const latest = session?.moves.at(-1)?.surface ?? session?.startWord;
  const neededKana = latest ? lastKana(latest) : "";
  const remaining = session?.remainingSeconds ?? 60;
  const completeCount = useMemo(() => session ? Object.values(session.progress).filter((item) => item.completed).length : 0, [session]);

  useEffect(() => { void fetch("/api/v1/profile").then((response) => response.json()).then((data) => { if (data.stageProgress) setProfile(data.stageProgress); if (data.stages) setStages(data.stages); }).catch(() => undefined); }, []);
  useEffect(() => {
    if (!session || session.status !== "playing") return;
    if (remaining <= 0) { void finish(); return; }
    const timer = window.setTimeout(() => setSession((current) => current ? { ...current, remainingSeconds: current.remainingSeconds - 1 } : current), 1000);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.status, remaining]);
  useEffect(() => {
    if (session?.status === "playing" && !submitting) inputRef.current?.focus();
  }, [session?.id, session?.moves.length, session?.status, submitting]);

  async function start(gameMode: GameMode = "daily", stageNumber?: number) {
    setNotice(null); setResult(null); setShowStages(false);
    const response = await fetch("/api/v1/game-sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gameMode, stageNumber }) });
    const data = await response.json();
    if (data.session) setSession(data.session); else setNotice({ kind: "error", message: data.error ?? "ゲームを開始できませんでした。" });
  }
  async function finish() {
    if (!session || session.status === "finished") return;
    const response = await fetch(`/api/v1/game-sessions/${session.id}/finish`, { method: "POST" });
    const data = await response.json();
    if (data.session) {
      setSession(data.session); setResult({ score: data.session.score, ranked: data.session.isRanked, stats: data.stats, stageProgress: data.stageProgress });
      if (data.stageProgress) setProfile(data.stageProgress);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!session || !input.trim() || submitting) return;
    setSubmitting(true); setNotice(null);
    try {
      const response = await fetch(`/api/v1/game-sessions/${session.id}/moves`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ word: input, clientMoveId: crypto.randomUUID() }) });
      const data = await response.json();
      if (data.session) setSession(data.session);
      if (data.ok) {
        const completed = data.completedMissionIds?.length ?? 0;
        const combo = data.session?.combo ?? 0;
        setNotice({ kind: "success", message: completed ? `ミッション ${completed} 枚達成！ コンボ ${combo}` : `つながった！ ${combo >= 5 ? `コンボ x${combo >= 15 ? "1.3" : combo >= 10 ? "1.2" : "1.1"}` : ""}` });
        setInput("");
        if (data.ended) await finish();
      } else setNotice({ kind: "error", message: `${data.error}${data.penaltySeconds ? ` ${data.penaltySeconds}秒減点` : data.session ? "（シールドで防いだ）" : ""}` });
    } catch { setNotice({ kind: "error", message: "通信に失敗しました。もう一度お試しください。" }); }
    finally { setSubmitting(false); }
  }
  async function hint() {
    if (!session) return;
    const response = await fetch(`/api/v1/game-sessions/${session.id}/hint`, { method: "POST" }); const data = await response.json();
    if (data.hint) { setSession((current) => current ? { ...current, hintsAvailable: data.hint.remaining, hintUsed: true } : current); setNotice({ kind: "hint", message: `「${data.hint.kana}」から始まり、「ん」で終わらない単語は ${data.hint.count} 個あります。` }); }
  }
  async function undo() {
    if (!session) return;
    const response = await fetch(`/api/v1/game-sessions/${session.id}/undo`, { method: "POST" }); const data = await response.json();
    if (data.session) { setSession(data.session); setNotice({ kind: "hint", message: "直前の1手を取り消しました。スコアとミッション進捗を再計算しました。" }); }
  }

  if (!session) return <main className="landing">
    <nav><span className="brand">MISSION <i>しりとり</i></span><span className="daily-dot">V4 EXTENDED</span></nav>
    <section className="hero"><div className="hero-copy"><p className="eyebrow">TODAY&apos;S WORD ROUTE</p><h1>ことばを<br /><em>攻略</em>しよう。</h1><p className="lead">デイリー・スコアアタック・ステージ。<br />ミッションとコンボを重ねて、最高スコアへ。</p><button className="start-button" onClick={() => start()}>デイリーに挑戦 <span>→</span></button><div className="mode-actions"><button onClick={() => start("score_attack")}>⚡ スコアアタック</button><button onClick={() => setShowStages((value) => !value)}>◎ ステージ {profile.unlockedStage}/5</button></div><p className="small">ログイン不要 ・ 進捗はこの端末のCookieに保存</p>{notice && <div className={`notice ${notice.kind}`}>{notice.message}</div>}{showStages && <div className="stage-list">{stages.map((stage) => { const locked = stage.number > profile.unlockedStage; const done = profile.completedStageNumbers.includes(stage.number); return <button key={stage.number} disabled={locked} onClick={() => start("stage", stage.number)}><b>STAGE {stage.number}</b><span>{stage.title}</span><em>{done ? "CLEAR" : locked ? "LOCKED" : "PLAY →"}</em></button>; })}</div>}</div>
      <div className="mission-preview"><div className="sun" /><p className="eyebrow">V4 FEATURES</p><div className="card-stack"><article className="preview-card yellow"><b>01</b><strong>コンボ倍率</strong><span>5連続から最大 x1.3</span><em>v2 score</em></article><article className="preview-card red"><b>02</b><strong>新ミッション</strong><span>開始文字・速度・順序・制約</span><em>17 types</em></article><article className="preview-card blue"><b>03</b><strong>ゴースト対戦</strong><span>前回・ほかの挑戦と比較</span><em>async</em></article></div></div></section>
    <footer>ひらがな・カタカナで入力できます。辞書にある言葉だけが使えます。</footer>
  </main>;

  if (result) return <main className="result-screen"><div className="result-box"><p className="eyebrow">{session.gameMode === "daily" ? "DAILY RESULT" : session.gameMode === "stage" ? `STAGE ${session.stageNumber} RESULT` : "SCORE ATTACK RESULT"}</p><h1>おつかれさま！</h1><div className="score-big">{result.score.toLocaleString()}<small>pts</small></div><p>{session.moves.length}語つないで、ミッションを{completeCount}枚達成しました。最大 {session.maxCombo} コンボ。</p><div className="result-stats"><span><b>{session.mistakes}</b> ミス</span><span><b>{result.ranked ? "公式記録" : "練習"}</b></span>{result.stats && <span><b>{result.stats.rank}位</b> / {result.stats.participants}人</span>}</div>{result.stats && <p className="stats-detail">平均 {result.stats.averageScore} pts ・ 中央値 {result.stats.medianScore} pts ・ ミッション達成率 {result.stats.missionCompletionRate}%</p>}{session.ghost && <div className="ghost-result"><b>{session.ghost.label}</b><span>{session.ghost.score} pts / ミッション {session.ghost.missionCount}枚</span><small>{session.ghost.moves.join(" → ")}</small></div>}{session.gameMode === "stage" && result.stageProgress && <p className="stage-clear">{completeCount === session.missions.length ? `ステージクリア！ Stage ${result.stageProgress.unlockedStage} まで解放しました。` : "全ミッション達成で次のステージが解放されます。"}</p>}<button className="start-button" onClick={() => start(session.gameMode, session.stageNumber)}>もう一度あそぶ <span>→</span></button><button className="text-button" onClick={() => { setSession(null); setResult(null); }}>タイトルへ戻る</button></div></main>;

  return <main className="game-shell"><header className="game-header"><button className="logo-button" onClick={finish}>MISSION <i>しりとり</i></button><div className={`timer ${remaining <= 10 ? "danger" : ""}`}>{formatTime(remaining)}</div><div className="combo"><small>COMBO</small>x{session.combo}</div><div className="score"><small>SCORE {session.scoringVersion === 2 ? "v2" : ""}</small>{session.score.toLocaleString()}</div></header>
    <section className="game-main"><div className="play-column"><p className="eyebrow">{session.gameMode === "stage" ? `STAGE ${session.stageNumber}` : session.gameMode === "score_attack" ? "SCORE ATTACK" : "DAILY CHALLENGE"}</p><div className="word-flow"><span className="previous-word">{latest}</span><span className="arrow">→</span><span className="needed-kana">{neededKana}</span></div><form onSubmit={submit}><label htmlFor="word">「{neededKana}」から始まる言葉</label><div className="input-row"><input ref={inputRef} id="word" autoComplete="off" value={input} onChange={(event) => setInput(event.target.value)} placeholder="ひらがなで入力" disabled={submitting} /><button disabled={submitting}>{submitting ? "判定中" : "つなぐ"}</button></div></form>{notice && <div className={`notice ${notice.kind}`}>{notice.message}</div>}<div className="route"><p>YOUR ROUTE <span>{session.moves.length} WORDS / MAX {session.maxCombo} COMBO</span></p><div>{[session.startWord, ...session.moves.map((move) => move.surface)].map((word, index) => <span className="route-word" key={`${word}-${index}`}>{word}{index < session.moves.length && <i>→</i>}</span>)}</div></div>{session.ghost && <div className="ghost-live"><b>GHOST · {session.ghost.label}</b><span>{session.score - session.ghost.score >= 0 ? "+" : ""}{session.score - session.ghost.score} pts</span><small>相手 {session.ghost.score} pts / ミッション {session.ghost.missionCount}枚</small></div>}<div className="game-actions"><button className="hint-button" disabled={session.hintsAvailable < 1} onClick={hint}>◎ ヒント {session.hintsAvailable}回</button><button className="hint-button" disabled={session.undoUsed || session.moves.length === 0} onClick={undo}>↶ 1手取り消す</button><button className="end-button" onClick={finish}>ゲームを終了</button></div></div>
      <aside className="mission-panel"><div className="mission-title"><span>MISSION</span><b>{completeCount}/{session.missions.length} COMPLETE</b></div>{session.missions.map((mission, index) => { const progress = session.progress[mission.id]; return <article className={`mission-card c${index % 3} ${progress.completed ? "done" : ""}`} key={mission.id}><div className="mission-number">0{index + 1}</div><div><h2>{mission.name}</h2><p>{mission.description}</p><div className="progress"><i style={{ width: `${(progress.current / progress.target) * 100}%` }} /></div><small>{progress.current} / {progress.target}</small></div><strong>+{mission.baseScore}</strong></article>; })}<p className="rule-note">※ 「ん」で終わるとゲーム終了<br />※ 無効入力でコンボがリセット<br />※ 取り消しは1プレイ1回まで</p></aside></section>
  </main>;
}
