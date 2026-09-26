'use strict';

const { GAME_RULES, getNumToSet } = require('./rules.js');
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
 * @param {{ useOpponentHistory?: boolean }} [options] - useOpponentHistory(既定true)を
 *   falseにすると、opponentHistory(issue #167)を一切構築・送信せず、旧来の挙動で
 *   シミュレートする。#167導入前後の強さ比較(自己対戦ベンチマーク)専用のオプション。
 * @returns {{ winnerId: string | 'draw', scores: {p1:number, p2:number}, shocks: {p1:number, p2:number}, turns: number }}
 */
// isP1Setterに応じて、このターンのsetter/chooser視点の情報一式を解決する。
function resolveSimulateMatchTurnRoles(turn, player1Id, player2Id, scores, shocks, p1ObservedHistory, p2ObservedHistory) {
  const isP1Setter = turn % 2 !== 0;
  return {
    isP1Setter,
    setterId: isP1Setter ? player1Id : player2Id,
    chooserId: isP1Setter ? player2Id : player1Id,
    setterScore: isP1Setter ? scores.p1 : scores.p2,
    chooserScore: isP1Setter ? scores.p2 : scores.p1,
    setterShocks: isP1Setter ? shocks.p1 : shocks.p2,
    chooserShocks: isP1Setter ? shocks.p2 : shocks.p1,
    setterOwnHistory: isP1Setter ? p1ObservedHistory : p2ObservedHistory,
    chooserOwnHistory: isP1Setter ? p2ObservedHistory : p1ObservedHistory,
  };
}

// 設置者/選択者それぞれの手が確定した後の、観測履歴更新・感電判定・
// スコア更新を行う(scores・shocks・rolesの各historyをミューテートする)。
function applySimulateMatchTurnOutcome(roles, scores, shocks, setChairs, chosenChair, availableChairsBeforeTurn) {
  // 設置者は今回の選択者の行動を観測する。選択者は、感電した場合に限り
  // (罠の位置が明かされるため)今回の設置者の行動を観測する。
  roles.setterOwnHistory.chooserActions.push({ chosenChair, availableChairs: availableChairsBeforeTurn });

  const isShocked = setChairs.includes(chosenChair);
  if (isShocked) {
    roles.chooserOwnHistory.setterActions.push({ chosenChair, availableChairs: availableChairsBeforeTurn });
    if (roles.isP1Setter) {
      shocks.p2 += 1;
      scores.p2 = 0;
    } else {
      shocks.p1 += 1;
      scores.p1 = 0;
    }
  } else if (roles.isP1Setter) {
    scores.p2 += chosenChair;
  } else {
    scores.p1 += chosenChair;
  }
}

// simulateMatchの1ターン分の処理。scores・shocks・p1ObservedHistory・
// p2ObservedHistoryは呼び出し元と共有するオブジェクトをそのままミューテートし、
// フィルタ後の残り椅子(次ターンのremainingChairs)を返す。
function playSimulateMatchTurn(turn, player1Id, player2Id, remainingChairs, scores, shocks, p1ObservedHistory, p2ObservedHistory, useOpponentHistory) {
  const roles = resolveSimulateMatchTurnRoles(turn, player1Id, player2Id, scores, shocks, p1ObservedHistory, p2ObservedHistory);
  const availableChairsBeforeTurn = remainingChairs;

  const { setChairs } = computeAiMove(roles.setterId, 'set', remainingChairs, {
    selfScore: roles.setterScore, opponentScore: roles.chooserScore, selfShocks: roles.setterShocks, opponentShocks: roles.chooserShocks,
    ...(useOpponentHistory ? { opponentHistory: roles.setterOwnHistory } : {}),
  });
  const { chosenChair } = computeAiMove(roles.chooserId, 'choose', remainingChairs, {
    selfScore: roles.chooserScore, opponentScore: roles.setterScore, selfShocks: roles.chooserShocks, opponentShocks: roles.setterShocks,
    ...(useOpponentHistory ? { opponentHistory: roles.chooserOwnHistory } : {}),
  });

  applySimulateMatchTurnOutcome(roles, scores, shocks, setChairs, chosenChair, availableChairsBeforeTurn);

  return remainingChairs.filter(c => c !== chosenChair);
}

// 最終スコア・感電数からplayer1Id/player2Id/'draw'のいずれかを判定する。
function resolveSimulateMatchWinner(player1Id, player2Id, scores, shocks) {
  if (shocks.p1 >= GAME_RULES.MAX_SHOCKS || scores.p2 >= GAME_RULES.WINNING_SCORE) {
    return player2Id;
  }
  if (shocks.p2 >= GAME_RULES.MAX_SHOCKS || scores.p1 >= GAME_RULES.WINNING_SCORE) {
    return player1Id;
  }
  if (scores.p1 !== scores.p2) {
    return scores.p1 > scores.p2 ? player1Id : player2Id;
  }
  if (shocks.p1 !== shocks.p2) {
    return shocks.p1 < shocks.p2 ? player1Id : player2Id;
  }
  return 'draw';
}

function simulateMatch(player1Id, player2Id, options = {}) {
  const { useOpponentHistory = true } = options;
  let remainingChairs = Array.from({ length: GAME_RULES.TOTAL_CHAIRS }, (_, i) => i + 1);
  const scores = { p1: 0, p2: 0 };
  const shocks = { p1: 0, p2: 0 };
  let turn = 1;

  // 相手モデリング(issue #167)検証用: 各プレイヤー視点で「相手が設置者だった
  // ターンで実際に罠を張った椅子(感電で判明したもののみ)」「相手が選択者
  // だったターンで実際に選んだ椅子」を蓄積する。frontend側のopponentHistory
  // 構築ロジックと同じ考え方(罠は感電しない限り明かされない)を用いる。
  const p1ObservedHistory = { setterActions: [], chooserActions: [] };
  const p2ObservedHistory = { setterActions: [], chooserActions: [] };

  const isOver = () => {
    if (scores.p1 >= GAME_RULES.WINNING_SCORE || scores.p2 >= GAME_RULES.WINNING_SCORE) return true;
    if (shocks.p1 >= GAME_RULES.MAX_SHOCKS || shocks.p2 >= GAME_RULES.MAX_SHOCKS) return true;
    if (remainingChairs.length <= GAME_RULES.MIN_CHAIRS_TO_END) return true;
    return false;
  };

  while (!isOver()) {
    remainingChairs = playSimulateMatchTurn(
      turn, player1Id, player2Id, remainingChairs, scores, shocks,
      p1ObservedHistory, p2ObservedHistory, useOpponentHistory
    );
    turn++;
  }

  const winnerId = resolveSimulateMatchWinner(player1Id, player2Id, scores, shocks);

  return { winnerId, scores, shocks, turns: turn - 1 };
}

/**
 * 「常にその時点で選べる中で最も高い椅子番号を選ぶ/仕掛ける」という
 * 完全に固定された(ランダム性の無い)戦略の仮想対戦相手(issue #167検証専用)。
 * 実在のプレイヤーロースター(handler.js)には含まれない、極端に予測可能な
 * 相手であり、opponentHistoryによる相手モデリングが機能していれば
 * 高い勝率で搾取できるはずである、という狙い撃ちの検証に使う。
 */
function computeBiasedBotMove(role, remainingChairs) {
  if (role === 'set') {
    const numToSet = getNumToSet(remainingChairs.length);
    const setChairs = [...remainingChairs].sort((a, b) => b - a).slice(0, numToSet);
    return { setChairs };
  }
  return { chosenChair: Math.max(...remainingChairs) };
}

/**
 * ai-nashと上記の固定戦略ボットを1試合対戦させる(issue #167検証専用)。
 * simulateMatchとは別に用意しているのは、通常のcomputeAiMoveはplayerId
 * 文字列で実在のプレイヤーロースターへディスパッチするため、テスト専用の
 * 仮想対戦相手を割り込ませられないため。
 * @param {{ useOpponentHistory?: boolean }} [options]
 * @returns {{ winnerId: 'ai-nash' | 'biased-bot' | 'draw' }}
 */
// このターンのsetter/chooserの手を決定する(ai-nash視点で仕掛け側/選ぶ側の
// いずれかがcomputeAiMove、もう一方がcomputeBiasedBotMoveになる)。
function computeSimulateMatchVsBiasedBotMoves(isNashSetter, remainingChairs, nashScore, botScore, nashShocks, botShocks, nashObservedHistory, useOpponentHistory) {
  const setterMove = isNashSetter
    ? computeAiMove('ai-nash', 'set', remainingChairs, {
        selfScore: nashScore, opponentScore: botScore, selfShocks: nashShocks, opponentShocks: botShocks,
        ...(useOpponentHistory ? { opponentHistory: nashObservedHistory } : {}),
      })
    : computeBiasedBotMove('set', remainingChairs);
  const chooserMove = isNashSetter
    ? computeBiasedBotMove('choose', remainingChairs)
    : computeAiMove('ai-nash', 'choose', remainingChairs, {
        selfScore: nashScore, opponentScore: botScore, selfShocks: nashShocks, opponentShocks: botShocks,
        ...(useOpponentHistory ? { opponentHistory: nashObservedHistory } : {}),
      });

  return { setChairs: setterMove.setChairs, chosenChair: chooserMove.chosenChair };
}

// 設置者/選択者それぞれの手が確定した後の、観測履歴更新・感電判定・
// スコア更新を行う(scores・shocks・nashObservedHistoryをミューテートする)。
function applySimulateMatchVsBiasedBotTurnOutcome(isNashSetter, scores, shocks, nashObservedHistory, setChairs, chosenChair, availableChairsBeforeTurn) {
  // ai-nashが設置者だったターンでは、ai-nashは今回のボット(選択者)の
  // 行動を観測する。ai-nashが選択者だったターンでは、感電した場合に
  // 限り(罠の位置が明かされるため)今回のボット(設置者)の行動を観測する。
  if (isNashSetter) {
    nashObservedHistory.chooserActions.push({ chosenChair, availableChairs: availableChairsBeforeTurn });
  }

  const isShocked = setChairs.includes(chosenChair);
  if (isShocked) {
    if (!isNashSetter) {
      nashObservedHistory.setterActions.push({ chosenChair, availableChairs: availableChairsBeforeTurn });
    }
    if (isNashSetter) {
      shocks.bot += 1;
      scores.bot = 0;
    } else {
      shocks.nash += 1;
      scores.nash = 0;
    }
  } else if (isNashSetter) {
    scores.bot += chosenChair;
  } else {
    scores.nash += chosenChair;
  }
}

// simulateMatchVsBiasedBotの1ターン分の処理。scores・shocks・
// nashObservedHistoryは呼び出し元と共有するオブジェクトをそのままミューテートし、
// フィルタ後の残り椅子(次ターンのremainingChairs)を返す。
function playSimulateMatchVsBiasedBotTurn(turn, remainingChairs, scores, shocks, nashObservedHistory, useOpponentHistory) {
  const isNashSetter = turn % 2 !== 0;
  const availableChairsBeforeTurn = remainingChairs;

  const { setChairs, chosenChair } = computeSimulateMatchVsBiasedBotMoves(
    isNashSetter, remainingChairs, scores.nash, scores.bot, shocks.nash, shocks.bot, nashObservedHistory, useOpponentHistory
  );

  applySimulateMatchVsBiasedBotTurnOutcome(isNashSetter, scores, shocks, nashObservedHistory, setChairs, chosenChair, availableChairsBeforeTurn);

  return remainingChairs.filter(c => c !== chosenChair);
}

// 最終スコア・感電数から'ai-nash'/'biased-bot'/'draw'のいずれかを判定する。
function resolveSimulateMatchVsBiasedBotWinner(scores, shocks) {
  if (shocks.nash >= GAME_RULES.MAX_SHOCKS || scores.bot >= GAME_RULES.WINNING_SCORE) {
    return 'biased-bot';
  }
  if (shocks.bot >= GAME_RULES.MAX_SHOCKS || scores.nash >= GAME_RULES.WINNING_SCORE) {
    return 'ai-nash';
  }
  if (scores.nash !== scores.bot) {
    return scores.nash > scores.bot ? 'ai-nash' : 'biased-bot';
  }
  if (shocks.nash !== shocks.bot) {
    return shocks.nash < shocks.bot ? 'ai-nash' : 'biased-bot';
  }
  return 'draw';
}

function simulateMatchVsBiasedBot(options = {}) {
  const { useOpponentHistory = true } = options;
  let remainingChairs = Array.from({ length: GAME_RULES.TOTAL_CHAIRS }, (_, i) => i + 1);
  const scores = { nash: 0, bot: 0 };
  const shocks = { nash: 0, bot: 0 };
  let turn = 1;
  // ai-nash視点でのみ、相手(固定戦略ボット)の観測履歴を蓄積する
  // (ボット側は固定戦略のため、観測履歴を必要としない)。
  const nashObservedHistory = { setterActions: [], chooserActions: [] };

  const isOver = () => {
    if (scores.nash >= GAME_RULES.WINNING_SCORE || scores.bot >= GAME_RULES.WINNING_SCORE) return true;
    if (shocks.nash >= GAME_RULES.MAX_SHOCKS || shocks.bot >= GAME_RULES.MAX_SHOCKS) return true;
    if (remainingChairs.length <= GAME_RULES.MIN_CHAIRS_TO_END) return true;
    return false;
  };

  while (!isOver()) {
    remainingChairs = playSimulateMatchVsBiasedBotTurn(turn, remainingChairs, scores, shocks, nashObservedHistory, useOpponentHistory);
    turn++;
  }

  const winnerId = resolveSimulateMatchVsBiasedBotWinner(scores, shocks);

  return { winnerId };
}

/**
 * ai-nashと固定戦略ボットでgames試合を行い、ai-nashの勝率を集計する(issue #167検証専用)。
 * @param {number} games
 * @param {{ useOpponentHistory?: boolean }} [options]
 * @returns {{ nashWinRate: number, botWinRate: number, drawRate: number, games: number }}
 */
function runBenchmarkVsBiasedBot(games, options = {}) {
  let nashWins = 0;
  let botWins = 0;
  let draws = 0;

  for (let i = 0; i < games; i++) {
    const { winnerId } = simulateMatchVsBiasedBot(options);
    if (winnerId === 'draw') {
      draws++;
    } else if (winnerId === 'ai-nash') {
      nashWins++;
    } else {
      botWins++;
    }
  }

  return {
    games,
    nashWinRate: nashWins / games,
    botWinRate: botWins / games,
    drawRate: draws / games,
  };
}

/**
 * player1Id と player2Id で games試合を行い、勝率等を集計する。
 * 先手/後手の有利不利を打ち消すため、対戦回数を半分ずつ入れ替えて実行する。
 * @param {string} player1Id
 * @param {string} player2Id
 * @param {number} games
 * @param {{ useOpponentHistory?: boolean }} [options] - simulateMatchへそのまま渡す(issue #167)。
 * @returns {{ player1WinRate: number, player2WinRate: number, drawRate: number, games: number }}
 */
function runBenchmark(player1Id, player2Id, games, options = {}) {
  let player1Wins = 0;
  let player2Wins = 0;
  let draws = 0;

  for (let i = 0; i < games; i++) {
    // 半分は先手/後手を入れ替えて実行する(交互ではなく前半/後半で分けることで、
    // 実行順に依存する偏りが無いことを明確にする)
    const swap = i >= Math.floor(games / 2);
    // 先手/後手の入れ替えのため意図的にplayer1Id/player2Idを逆順で渡す
    const { winnerId } = swap
      // eslint-disable-next-line sonarjs/arguments-order
      ? simulateMatch(player2Id, player1Id, options)
      : simulateMatch(player1Id, player2Id, options);

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
// CLIとして直接実行された場合のみ通るパスであり、benchmark.test.jsは
// モジュールとしてrunBenchmarkをimportするだけなので通常のテストでは
// 到達しない(カバレッジ計測から除外する)。
/* v8 ignore start */
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

  // issue #167: 相手モデリング(opponentHistory)の効果を、固定戦略ボット相手の
  // 勝率の変化(有効時 vs 無効時)として報告する
  const withHistory = runBenchmarkVsBiasedBot(games, { useOpponentHistory: true });
  const withoutHistory = runBenchmarkVsBiasedBot(games, { useOpponentHistory: false });
  console.log(
    `ai-nash vs 固定戦略ボット (${games}試合): ` +
    `相手モデリング有効=${(withHistory.nashWinRate * 100).toFixed(1)}% ` +
    `相手モデリング無効=${(withoutHistory.nashWinRate * 100).toFixed(1)}%`
  );
}
/* v8 ignore stop */

module.exports = {
  simulateMatch,
  runBenchmark,
  simulateMatchVsBiasedBot,
  runBenchmarkVsBiasedBot,
};
