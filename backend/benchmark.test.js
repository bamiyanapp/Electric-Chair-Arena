import { describe, it, expect } from 'vitest';
import { runBenchmark } from './benchmark.js';

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
