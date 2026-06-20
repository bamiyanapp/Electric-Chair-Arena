'use strict';

const { GAME_RULES } = require('./rules.js');

// 簡易的なメモリ上でのデータ保持（サーバーレス起動中のみ保持されるが、ローカル開発やテストには十分）
const players = [
  { id: 'ai-random', name: 'ランダムAI', description: '完全にランダムに椅子を選び、電流をセットする。', rating: 1450, winCount: 12, lossCount: 15 },
  { id: 'ai-cautious', name: '慎重派AI', description: '低得点の安全な椅子を狙い、電流を散らす。', rating: 1500, winCount: 18, lossCount: 17 },
  { id: 'ai-aggressive', name: 'アグレッシブAI', description: '常に高得点の椅子を狙い、相手に高いプレッシャーをかける。', rating: 1520, winCount: 22, lossCount: 20 },
  { id: 'ai-smart', name: 'カウンティングAI', description: '確率と期待値を計算し、最適な椅子を判定する。', rating: 1580, winCount: 30, lossCount: 18 },
];

const matches = [];

module.exports.getPlayers = async (event) => {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify({
      players: players.sort((a, b) => b.rating - a.rating),
    }),
  };
};

module.exports.getMatches = async (event) => {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify({
      matches,
    }),
  };
};

// ゲーム終了判定ヘルパー
function isGameOver(scores, shocks, remainingChairs) {
  if (scores.p1 >= GAME_RULES.WINNING_SCORE || scores.p2 >= GAME_RULES.WINNING_SCORE) {
    return true;
  }
  if (shocks.p1 >= GAME_RULES.MAX_SHOCKS || shocks.p2 >= GAME_RULES.MAX_SHOCKS) {
    return true;
  }
  if (remainingChairs.length <= GAME_RULES.MIN_CHAIRS_TO_END) {
    return true;
  }
  return false;
}

// AIの意思決定（電流設置 / 椅子選択）
function makeAiDecision(aiId, role, remainingChairs, oppositeShocks) {
  if (role === 'set') {
    // 電流を仕掛ける椅子（最大3個、または残りの数に応じて決める）
    const numToSet = Math.min(3, Math.max(1, Math.floor(remainingChairs.length / 3)));
    const shuffled = [...remainingChairs].sort(() => 0.5 - Math.random());
    
    if (aiId === 'ai-aggressive') {
      // 高得点の椅子を優先して仕掛ける
      const sortedByPoints = [...remainingChairs].sort((a, b) => b - a);
      return sortedByPoints.slice(0, numToSet);
    } else if (aiId === 'ai-cautious') {
      // 相手が選びそうな低得点の椅子、あるいはランダム
      const sortedByPoints = [...remainingChairs].sort((a, b) => a - b);
      return sortedByPoints.slice(0, numToSet);
    } else {
      // デフォルト（ランダム）
      return shuffled.slice(0, numToSet);
    }
  } else {
    // 椅子を選ぶ
    if (aiId === 'ai-aggressive') {
      // 残っている椅子の中から最も得点が高いもの（12に近いもの）を選ぶ
      return Math.max(...remainingChairs);
    } else if (aiId === 'ai-cautious') {
      // 残っている椅子の中から得点が低いものを選ぶ
      return Math.min(...remainingChairs);
    } else if (aiId === 'ai-smart') {
      // カウンティング：相手の感電状況や残り椅子から期待値を考える。
      // シンプルな期待値：高すぎず、低すぎない中間、またはランダムで確率を考慮
      // ここでは残っている椅子のうち中央値に近いものを選択
      const sorted = [...remainingChairs].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    } else {
      // デフォルト（ランダム）
      const randomIndex = Math.floor(Math.random() * remainingChairs.length);
      return remainingChairs[randomIndex];
    }
  }
}

module.exports.simulateMatch = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { player1Id = 'ai-random', player2Id = 'ai-smart' } = body;

    const p1 = players.find(p => p.id === player1Id) || players[0];
    const p2 = players.find(p => p.id === player2Id) || players[1];

    // 対戦シミュレーション開始
    let remainingChairs = Array.from({ length: GAME_RULES.TOTAL_CHAIRS }, (_, i) => i + 1);
    const scores = { p1: 0, p2: 0 };
    const shocks = { p1: 0, p2: 0 };
    const log = [];
    let turn = 1;

    // 奇数ターンはp1が「設置」でp2が「座る」、偶数ターンは逆
    while (!isGameOver(scores, shocks, remainingChairs)) {
      const isP1Setter = turn % 2 !== 0;
      const setter = isP1Setter ? p1 : p2;
      const chooser = isP1Setter ? p2 : p1;
      const setterId = isP1Setter ? player1Id : player2Id;
      const chooserId = isP1Setter ? player2Id : player1Id;

      // 親が電流をセットする
      const shockedChairs = makeAiDecision(setterId, 'set', remainingChairs, isP1Setter ? shocks.p2 : shocks.p1);
      // 子が椅子を選ぶ
      const chosenChair = makeAiDecision(chooserId, 'choose', remainingChairs, isP1Setter ? shocks.p2 : shocks.p1);

      // 判定
      const isShocked = shockedChairs.includes(chosenChair);
      let scoreGained = 0;

      if (isShocked) {
        if (isP1Setter) {
          shocks.p2 += 1;
        } else {
          shocks.p1 += 1;
        }
      } else {
        // セーフならその椅子の番号が得点になる
        scoreGained = chosenChair;
        if (isP1Setter) {
          scores.p2 += scoreGained;
        } else {
          scores.p1 += scoreGained;
        }
      }

      // 椅子を使用済みにする
      remainingChairs = remainingChairs.filter(c => c !== chosenChair);

      log.push({
        turn,
        setter: setter.name,
        chooser: chooser.name,
        shockedChairs,
        chosenChair,
        isShocked,
        scoreGained,
        scores: { ...scores },
        shocks: { ...shocks },
        remainingChairs: [...remainingChairs],
      });

      turn++;
    }

    // 勝敗決定
    let winnerId = null;
    let loserId = null;

    if (shocks.p1 >= GAME_RULES.MAX_SHOCKS || scores.p2 >= GAME_RULES.WINNING_SCORE) {
      winnerId = p2.id;
      loserId = p1.id;
    } else if (shocks.p2 >= GAME_RULES.MAX_SHOCKS || scores.p1 >= GAME_RULES.WINNING_SCORE) {
      winnerId = p1.id;
      loserId = p2.id;
    } else {
      // 最後に椅子が1つになった場合、スコアが多い方が勝ち
      if (scores.p1 !== scores.p2) {
        winnerId = scores.p1 > scores.p2 ? p1.id : p2.id;
        loserId = scores.p1 > scores.p2 ? p2.id : p1.id;
      } else {
        // 同点なら感電が少ない方
        if (shocks.p1 !== shocks.p2) {
          winnerId = shocks.p1 < shocks.p2 ? p1.id : p2.id;
          loserId = shocks.p1 < shocks.p2 ? p2.id : p1.id;
        } else {
          // それでも同じならp1の勝ちとする
          winnerId = p1.id;
          loserId = p2.id;
        }
      }
    }

    const winner = players.find(p => p.id === winnerId);
    const loser = players.find(p => p.id === loserId);

    // ELOレーティングの更新
    const kFactor = 32;
    const expectedWinner = 1 / (1 + Math.pow(10, (loser.rating - winner.rating) / 400));
    const ratingDiff = Math.round(kFactor * (1 - expectedWinner));

    winner.rating += ratingDiff;
    loser.rating -= ratingDiff;
    winner.winCount += 1;
    loser.lossCount += 1;

    const matchResult = {
      id: `match-${Date.now()}`,
      player1: p1,
      player2: p2,
      scores,
      shocks,
      winner: winner.name,
      ratingDiff,
      log,
      createdAt: new Date().toISOString(),
    };

    matches.unshift(matchResult);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      },
      body: JSON.stringify(matchResult),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
