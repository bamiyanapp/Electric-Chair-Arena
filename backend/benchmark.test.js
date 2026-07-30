import { describe, it, expect } from 'vitest';
import { runBenchmark, runBenchmarkVsBiasedBot } from './benchmark.js';

// issue #166: 感電コストを利得に組み込んだ後のai-nashが、以前より弱くなって
// いないこと(理想的には強くなっていること)を自己対戦で検証する。
// 今後のAI変更全般の強さ回帰検証基盤としても使うため、閾値は「これを
// 下回ったら明確な強さのリグレッション」というラチェット方式の下限値とする
// (実測平均勝率57%前後に対し、サンプリング揺らぎの余裕を持たせて設定)。
//
// 各対戦は数百試合を回すとCIが長くなりすぎるため150試合とし、統計的な
// 揺らぎを吸収できる範囲でできるだけ緩い閾値にしている。
describe('ai-nash self-play benchmark (issue #166)', () => {
  const GAMES_PER_MATCHUP = 150;

  it('beats ai-random clearly (sanity check that state-aware decisions are not worse than a uniform random policy)', () => {
    const result = runBenchmark('ai-nash', 'ai-random', GAMES_PER_MATCHUP);
    expect(result.player1WinRate).toBeGreaterThan(0.5);
  }, 30000);

  it('maintains a reasonable win rate across a range of character AI opponents (regression baseline for future AI changes)', () => {
    const opponents = ['ai-random', 'ai-okano', 'ai-koyabu', 'ai-junior', 'ai-rule-based'];
    const winRates = opponents.map(opponent => runBenchmark('ai-nash', opponent, GAMES_PER_MATCHUP).player1WinRate);
    const averageWinRate = winRates.reduce((a, b) => a + b, 0) / winRates.length;

    // 個々の対戦相手ごとの相性(得意・不得意)はあり得るため、平均勝率のみを
    // 回帰検知の指標とする
    expect(averageWinRate).toBeGreaterThan(0.5);
  }, 60000);
});

// issue #167: 対戦中に観測した相手の行動傾向をAIの意思決定に反映する(相手モデリング)。
// 「常にその時点で選べる中で最も高い椅子番号を選ぶ/仕掛ける」という完全に
// 固定された戦略の仮想対戦相手(computeBiasedBotMove)に対し、opponentHistory
// による相手モデリングが有効な場合と無効な場合とで、ai-nashの勝率が実際に
// 向上することを検証する。
describe('ai-nash exploits a biased fixed-strategy opponent via opponentHistory (issue #167)', () => {
  const GAMES_PER_CONDITION = 150;

  it('wins more often against the biased bot when opponentHistory is used than when it is not', () => {
    const withHistory = runBenchmarkVsBiasedBot(GAMES_PER_CONDITION, { useOpponentHistory: true });
    const withoutHistory = runBenchmarkVsBiasedBot(GAMES_PER_CONDITION, { useOpponentHistory: false });

    // 実測(150試合×3回)ではwithHistory-withoutHistoryの差は0.20〜0.31で
    // 安定していたため、サンプリング揺らぎの余裕を持たせた閾値0.1を採用する
    expect(withHistory.nashWinRate).toBeGreaterThan(withoutHistory.nashWinRate + 0.1);
  }, 15000);
});
