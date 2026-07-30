'use strict';

const { GAME_RULES } = require('./rules.js');
const { computeAiMove } = require('./handler.js');

/**
 * 自己対戦ベンチマーク(issue #166)
 *
 * startMatch内部の自己対戦シミュレーションは対局状態(スコア・感電回数)を
 * AIへ渡さない(computeAiMoveを常にmatchState省略で呼ぶ)ため、対局状態を
 * 考慮した意思決定(issue #161・#166)の強さを検証できない。本モジュールは
 * 実際の/ai-moveエンドポイントと同様、各ターンの実スコア・感電回数を
 * 両プレイヤーの視点でmatchStateとして渡しながら1試合をシミュレートする。
 *
 * 今後のAI変更全般の強さ回帰検証基盤として、他のAI変更でも再利用する想定。
 */

/**
 * player1Id と player2Id の1試合をシミュレートする。
 * @param {string} player1Id
 * @param {string} player2Id
 * @returns {{ winnerId: string | 'draw', scores: {p1:number, p2:number}, shocks: {p1:number, p2:number}, turns: number }}
 */
function simulateMatch(player1Id, player2Id) {
  let remainingChairs = Array.from({ length: GAME_RULES.TOTAL_CHAIRS }, (_, i) => i + 1);
  const scores = { p1: 0, p2: 0 };
  const shocks = { p1: 0, p2: 0 };
  let turn = 1;

  const isOver = () => {
    if (scores.p1 >= GAME_RULES.WINNING_SCORE || scores.p2 >= GAME_RULES.WINNING_SCORE) return true;
    if (shocks.p1 >= GAME_RULES.MAX_SHOCKS || shocks.p2 >= GAME_RULES.MAX_SHOCKS) return true;
    if (remainingChairs.length <= GAME_RULES.MIN_CHAIRS_TO_END) return true;
    return false;
  };

  while (!isOver()) {
    const isP1Setter = turn % 2 !== 0;
    const setterId = isP1Setter ? player1Id : player2Id;
    const chooserId = isP1Setter ? player2Id : player1Id;
    const setterScore = isP1Setter ? scores.p1 : scores.p2;
    const chooserScore = isP1Setter ? scores.p2 : scores.p1;
    const setterShocks = isP1Setter ? shocks.p1 : shocks.p2;
    const chooserShocks = isP1Setter ? shocks.p2 : shocks.p1;

    const { setChairs } = computeAiMove(setterId, 'set', remainingChairs, {
      selfScore: setterScore, opponentScore: chooserScore, selfShocks: setterShocks, opponentShocks: chooserShocks,
    });
    const { chosenChair } = computeAiMove(chooserId, 'choose', remainingChairs, {
      selfScore: chooserScore, opponentScore: setterScore, selfShocks: chooserShocks, opponentShocks: setterShocks,
    });

    const isShocked = setChairs.includes(chosenChair);
    if (isShocked) {
      if (isP1Setter) {
        shocks.p2 += 1;
        scores.p2 = 0;
      } else {
        shocks.p1 += 1;
        scores.p1 = 0;
      }
    } else if (isP1Setter) {
      scores.p2 += chosenChair;
    } else {
      scores.p1 += chosenChair;
    }

    remainingChairs = remainingChairs.filter(c => c !== chosenChair);
    turn++;
  }

  let winnerId;
  if (shocks.p1 >= GAME_RULES.MAX_SHOCKS || scores.p2 >= GAME_RULES.WINNING_SCORE) {
    winnerId = player2Id;
  } else if (shocks.p2 >= GAME_RULES.MAX_SHOCKS || scores.p1 >= GAME_RULES.WINNING_SCORE) {
    winnerId = player1Id;
  } else if (scores.p1 !== scores.p2) {
    winnerId = scores.p1 > scores.p2 ? player1Id : player2Id;
  } else if (shocks.p1 !== shocks.p2) {
    winnerId = shocks.p1 < shocks.p2 ? player1Id : player2Id;
  } else {
    winnerId = 'draw';
  }

  return { winnerId, scores, shocks, turns: turn - 1 };
}

/**
 * player1Id と player2Id で games試合を行い、勝率等を集計する。
 * 先手/後手の有利不利を打ち消すため、対戦回数を半分ずつ入れ替えて実行する。
 * @param {string} player1Id
 * @param {string} player2Id
 * @param {number} games
 * @returns {{ player1WinRate: number, player2WinRate: number, drawRate: number, games: number }}
 */
function runBenchmark(player1Id, player2Id, games) {
  let player1Wins = 0;
  let player2Wins = 0;
  let draws = 0;

  for (let i = 0; i < games; i++) {
    // 半分は先手/後手を入れ替えて実行する(交互ではなく前半/後半で分けることで、
    // 実行順に依存する偏りが無いことを明確にする)
    const swap = i >= Math.floor(games / 2);
    const { winnerId } = swap ? simulateMatch(player2Id, player1Id) : simulateMatch(player1Id, player2Id);

    if (winnerId === 'draw') {
      draws++;
    } else if (winnerId === player1Id) {
      player1Wins++;
    } else {
      player2Wins++;
    }
  }

  return {
    games,
    player1WinRate: player1Wins / games,
    player2WinRate: player2Wins / games,
    drawRate: draws / games,
  };
}

// `node backend/benchmark.js` で直接実行した場合、ai-nashと他の各AIとの
// 対戦成績を出力する(今後のAI強さ回帰確認に使う簡易レポート)。
if (require.main === module) {
  const opponents = ['ai-random', 'ai-okano', 'ai-koyabu', 'ai-junior', 'ai-rule-based'];
  const games = 300;
  for (const opponent of opponents) {
    const result = runBenchmark('ai-nash', opponent, games);
    console.log(
      `ai-nash vs ${opponent} (${games}試合): ` +
      `ai-nash勝率=${(result.player1WinRate * 100).toFixed(1)}% ` +
      `${opponent}勝率=${(result.player2WinRate * 100).toFixed(1)}% ` +
      `引き分け率=${(result.drawRate * 100).toFixed(1)}%`
    );
  }
}

module.exports = {
  simulateMatch,
  runBenchmark,
};
