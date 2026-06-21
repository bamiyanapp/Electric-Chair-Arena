'use strict';

const { GAME_RULES } = require('./rules.js');
const { GoogleGenAI } = require('@google/genai');

// AIプレイヤーの初期データ
const initialPlayers = [
  {
    playerId: 'ai-okano',
    name: '岡野陽一風AI',
    type: 'personality',
    rating: 1550,
    winCount: 42,
    matchCount: 80,
    updatedAt: new Date().toISOString(),
  },
  {
    playerId: 'ai-koyabu',
    name: '小籔千豊風AI',
    type: 'personality',
    rating: 1600,
    winCount: 55,
    matchCount: 90,
    updatedAt: new Date().toISOString(),
  },
  {
    playerId: 'ai-junior',
    name: '千原ジュニア風AI',
    type: 'personality',
    rating: 1620,
    winCount: 61,
    matchCount: 100,
    updatedAt: new Date().toISOString(),
  },
  {
    playerId: 'ai-random',
    name: 'ランダムAI',
    type: 'random',
    rating: 1400,
    winCount: 20,
    matchCount: 70,
    updatedAt: new Date().toISOString(),
  },
  {
    playerId: 'ai-rule-based',
    name: '期待値計算AI',
    type: 'rule_based',
    rating: 1520,
    winCount: 35,
    matchCount: 75,
    updatedAt: new Date().toISOString(),
  },
];

// インメモリデータベース
let playersDb = [...initialPlayers];
let matchesDb = [];

module.exports.getPlayers = async (event) => {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify({
      players: playersDb,
    }),
  };
};

module.exports.getLeaderboard = async (event) => {
  const sortedPlayers = [...playersDb].sort((a, b) => b.rating - a.rating);
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify({
      leaderboard: sortedPlayers,
    }),
  };
};

module.exports.getAiMove = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { aiPlayerId, role, remainingChairs, opponentShocks } = body;

    if (!aiPlayerId || !role || !remainingChairs) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Credentials': true },
        body: JSON.stringify({ error: 'Missing parameters' }),
      };
    }

    const move = getAiMove(aiPlayerId, role, remainingChairs, opponentShocks || 0);

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Credentials': true },
      body: JSON.stringify(move),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Credentials': true },
      body: JSON.stringify({ error: error.message }),
    };
  }
};

module.exports.getMatches = async (event) => {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify({
      matches: matchesDb,
    }),
  };
};

module.exports.getMatchResult = async (event) => {
  const params = event.queryStringParameters || {};
  const { matchId } = params;

  if (!matchId) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      },
      body: JSON.stringify({ error: 'matchId is required' }),
    };
  }

  const match = matchesDb.find(m => m.matchId === matchId);

  if (!match) {
    return {
      statusCode: 404,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      },
      body: JSON.stringify({ error: 'Match not found' }),
    };
  }

  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify({
      match,
    }),
  };
};

// AIの行動と思考
function getAiMove(playerId, role, remainingChairs, opponentShocks) {
  if (role === 'set') {
    // 親（設置）：残りの椅子の1/3程度に電流をセット
    const numToSet = Math.min(3, Math.max(1, Math.floor(remainingChairs.length / 3)));
    const shuffled = [...remainingChairs].sort(() => 0.5 - Math.random());
    
    let setChairs = [];
    let reasoning = '';

    if (playerId === 'ai-okano') {
      // 岡野：あえて大きな数字（10,11,12）に仕掛けるか、裏をかいて1に仕掛けるギャンブル戦略
      const highChairs = remainingChairs.filter(c => c >= 9);
      if (highChairs.length > 0 && Math.random() > 0.4) {
        setChairs = [...highChairs].sort(() => 0.5 - Math.random()).slice(0, numToSet);
        reasoning = `「ここは勝負どころ。あいつは絶対高得点（10〜12）を欲しがって座りにくるはず。そこに罠を張るのが勝負師ってものよ！」`;
      } else {
        setChairs = shuffled.slice(0, numToSet);
        reasoning = `「ギャンブラーの直感。ランダムに見えて一番えぐい位置に仕掛けてやったわ。」`;
      }
    } else if (playerId === 'ai-koyabu') {
      // 小籔：理詰め。中間点数の椅子を好む
      const midChairs = remainingChairs.filter(c => c >= 4 && c <= 8);
      if (midChairs.length > 0) {
        setChairs = [...midChairs].sort(() => 0.5 - Math.random()).slice(0, numToSet);
        reasoning = `「まあ普通に考えて、大勝負に出る勇気もない、かといって1点とかで刻むのも嫌な奴は、中間の4〜8辺りに逃げるんですわ。そこを突くのがセオリー。」`;
      } else {
        setChairs = shuffled.slice(0, numToSet);
        reasoning = `「残った選択肢から考えて、ここが最も論理的な罠の位置ですわ。」`;
      }
    } else if (playerId === 'ai-junior') {
      // ジュニア：相手を翻弄する心理戦
      setChairs = shuffled.slice(0, numToSet);
      reasoning = `「ええか、相手はさっき俺が低い数字を狙ったのを見てるわけやん？やから今度は絶対に高い数字に逃げよる。ここを読めるかどうかがこのゲームのすべてやな。」`;
    } else if (playerId === 'ai-rule-based') {
      // 期待値計算：期待値が最も高い椅子、または確率的に相手が座りそうな椅子に配置
      const sortedByPoints = [...remainingChairs].sort((a, b) => b - a);
      setChairs = sortedByPoints.slice(0, numToSet);
      reasoning = `「(計算機AI) 得点効率の高い順から電流を仕掛けることで、相手の期待利得を最大効率で低減させます。」`;
    } else {
      // ランダム
      setChairs = shuffled.slice(0, numToSet);
      reasoning = `「ランダムに電流を配置。完全な確率論でのアプローチです。」`;
    }

    // 整合性を保つため、万が一空っぽなら補完
    if (setChairs.length === 0) {
      setChairs = shuffled.slice(0, numToSet);
    }
    return { setChairs, reasoning };
  } else {
    // 子（選択）：椅子に座る
    let chosenChair = remainingChairs[0];
    let reasoning = '';

    if (playerId === 'ai-okano') {
      // 岡野：デカい当たり（高得点）に全ツッパ
      const highChairs = remainingChairs.filter(c => c >= 8);
      if (highChairs.length > 0) {
        chosenChair = Math.max(...highChairs);
        reasoning = `「ここで小さい数字座ってチマチマ点稼いでも男がすたりますわ！12点座って一気に40点に近づいたる！」`;
      } else {
        chosenChair = remainingChairs[Math.floor(Math.random() * remainingChairs.length)];
        reasoning = `「もう残りのどれでも一緒や！俺の右手が座れと叫んでる！」`;
      }
    } else if (playerId === 'ai-koyabu') {
      // 小籔：安全第一、感電リスクを嫌う
      const lowChairs = remainingChairs.filter(c => c <= 6);
      if (lowChairs.length > 0) {
        chosenChair = Math.min(...lowChairs);
        reasoning = `「高得点は魅力やけど、そこに電流仕掛けられて感電してライフ削られるのは一番あきません。低得点で安全な椅子から丁寧にいきまっせ。」`;
      } else {
        chosenChair = Math.min(...remainingChairs);
        reasoning = `「最も罠が仕掛けられにくい、一番値の低い椅子を選択するのが最善手です。」`;
      }
    } else if (playerId === 'ai-junior') {
      // ジュニア：ブラフの裏をかく
      const sorted = [...remainingChairs].sort((a, b) => b - a);
      chosenChair = sorted[Math.floor(sorted.length / 2)] || remainingChairs[0];
      reasoning = `「相手は俺が高得点を狙うと思ってるやろうし、安全に低いとこ座るのも見透かされてる。ここはあえてド真ん中、一番心理的に狙いにくい位置がド本命や。」`;
    } else if (playerId === 'ai-rule-based') {
      // 最も期待値の高い選択肢
      const sorted = [...remainingChairs].sort((a, b) => b - a);
      chosenChair = sorted[Math.floor(sorted.length / 2)] || remainingChairs[0];
      reasoning = `「期待値と安全性を加味した最適解となる中間位のシート ${chosenChair} を選択。」`;
    } else {
      chosenChair = remainingChairs[Math.floor(Math.random() * remainingChairs.length)];
      reasoning = `「ランダムに椅子 ${chosenChair} を選択します。」`;
    }

    return { chosenChair, reasoning };
  }
}

module.exports.startMatch = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { player1Id, player2Id } = body;

    if (!player1Id || !player2Id) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': true,
        },
        body: JSON.stringify({ error: 'player1Id and player2Id are required' }),
      };
    }

    const p1 = playersDb.find(p => p.playerId === player1Id);
    const p2 = playersDb.find(p => p.playerId === player2Id);

    if (!p1 || !p2) {
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': true,
        },
        body: JSON.stringify({ error: 'One or both players not found' }),
      };
    }

    // ゲーム状態初期化
    let remainingChairs = Array.from({ length: GAME_RULES.TOTAL_CHAIRS }, (_, i) => i + 1);
    const scores = { p1: 0, p2: 0 };
    const shocks = { p1: 0, p2: 0 };
    const logs = [];
    let turn = 1;

    // ゲーム終了判定ヘルパー
    const isOver = () => {
      if (scores.p1 >= GAME_RULES.WINNING_SCORE || scores.p2 >= GAME_RULES.WINNING_SCORE) return true;
      if (shocks.p1 >= GAME_RULES.MAX_SHOCKS || shocks.p2 >= GAME_RULES.MAX_SHOCKS) return true;
      if (remainingChairs.length <= GAME_RULES.MIN_CHAIRS_TO_END) return true;
      return false;
    };

    while (!isOver()) {
      const isP1Setter = turn % 2 !== 0;
      const setter = isP1Setter ? p1 : p2;
      const chooser = isP1Setter ? p2 : p1;

      // 親が電流を仕掛ける
      const { setChairs, reasoning: setReasoning } = getAiMove(setter.playerId, 'set', remainingChairs, isP1Setter ? shocks.p2 : shocks.p1);
      // 子が椅子を選択する
      const { chosenChair, reasoning: chooseReasoning } = getAiMove(chooser.playerId, 'choose', remainingChairs, isP1Setter ? shocks.p2 : shocks.p1);

      const isShocked = setChairs.includes(chosenChair);
      let scoreGained = 0;

      if (isShocked) {
        if (isP1Setter) {
          shocks.p2 += 1;
          scores.p2 = 0;
        } else {
          shocks.p1 += 1;
          scores.p1 = 0;
        }
      } else {
        scoreGained = chosenChair;
        if (isP1Setter) {
          scores.p2 += scoreGained;
        } else {
          scores.p1 += scoreGained;
        }
      }

      // 椅子を削除
      remainingChairs = remainingChairs.filter(c => c !== chosenChair);

      logs.push({
        turn,
        setter: setter.name,
        chooser: chooser.name,
        shockedChairs: setChairs,
        chosenChair,
        isShocked,
        scoreGained,
        scores: { ...scores },
        shocks: { ...shocks },
        remainingChairs: [...remainingChairs],
        reasoning: `${setReasoning}\n${chooseReasoning}`,
      });

      turn++;
    }

    // 勝者判定
    let winnerId = '';
    if (shocks.p1 >= GAME_RULES.MAX_SHOCKS || scores.p2 >= GAME_RULES.WINNING_SCORE) {
      winnerId = p2.playerId;
    } else if (shocks.p2 >= GAME_RULES.MAX_SHOCKS || scores.p1 >= GAME_RULES.WINNING_SCORE) {
      winnerId = p1.playerId;
    } else {
      // 椅子残り1つ
      if (scores.p1 !== scores.p2) {
        winnerId = scores.p1 > scores.p2 ? p1.playerId : p2.playerId;
      } else {
        winnerId = shocks.p1 < shocks.p2 ? p1.playerId : p2.playerId;
      }
    }

    const loserId = winnerId === p1.playerId ? p2.playerId : p1.playerId;
    const winner = playersDb.find(p => p.playerId === winnerId);
    const loser = playersDb.find(p => p.playerId === loserId);

    // ELOレーティング更新
    const kFactor = 32;
    const expectedWinner = 1 / (1 + Math.pow(10, (loser.rating - winner.rating) / 400));
    const ratingDiff = Math.round(kFactor * (1 - expectedWinner));

    winner.rating += ratingDiff;
    loser.rating -= ratingDiff;

    winner.winCount += 1;
    winner.matchCount += 1;
    loser.matchCount += 1;

    winner.updatedAt = new Date().toISOString();
    loser.updatedAt = new Date().toISOString();

    const matchId = `match-${Date.now()}`;
    const newMatch = {
      matchId,
      player1Id,
      player2Id,
      winnerId,
      ratingDiff,
      logs,
      createdAt: new Date().toISOString(),
    };

    matchesDb.unshift(newMatch);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      },
      body: JSON.stringify({
        matchId,
        player1: p1,
        player2: p2,
        winner: winner.name,
        ratingDiff,
        scores,
        shocks,
        logs,
      }),
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

module.exports.generateCommentary = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { gameState, action } = body;
    
    if (!process.env.GEMINI_API) {
      return { 
        statusCode: 500, 
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Credentials': true },
        body: JSON.stringify({ error: "Gemini API key is not configured" }) 
      };
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API });

    const prompt = `あなたは「ビリビリ椅子取りゲーム」の実況解説者です。
現在のゲームの状況: ${JSON.stringify(gameState || {})}
直前のアクション: ${JSON.stringify(action || {})}
この状況を踏まえて、熱く短く（1〜2文程度で）実況解説をしてください。`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
    });

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      },
      body: JSON.stringify({ commentary: response.text }),
    };
  } catch (error) {
    console.error('Error generating commentary:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      },
      body: JSON.stringify({ error: 'Failed to generate commentary' }),
    };
  }
};

module.exports.saveMatch = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { matchId, player1Id, player2Id, winnerId, scores, shocks, logs } = body;

    if (!matchId || !player1Id || !player2Id || !winnerId) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': true,
        },
        body: JSON.stringify({ error: 'Missing parameters' }),
      };
    }

    const p1 = player1Id === 'human'
      ? { playerId: 'human', name: 'あなた (人間)', rating: 1500, winCount: 0, matchCount: 0 }
      : playersDb.find(p => p.playerId === player1Id);

    const p2 = player2Id === 'human'
      ? { playerId: 'human', name: 'あなた (人間)', rating: 1500, winCount: 0, matchCount: 0 }
      : playersDb.find(p => p.playerId === player2Id);

    if (!p1 || !p2) {
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': true,
        },
        body: JSON.stringify({ error: 'One or both players not found' }),
      };
    }

    let ratingDiff = 0;
    
    // AIのレーティングを更新 (相手が人間の場合)
    if (player1Id === 'human' && player2Id !== 'human') {
      const aiPlayer = p2;
      const isAiWinner = winnerId === aiPlayer.playerId;
      const humanRating = 1500;
      
      const expectedAi = 1 / (1 + Math.pow(10, (humanRating - aiPlayer.rating) / 400));
      const kFactor = 32;
      const actualAi = isAiWinner ? 1 : 0;
      ratingDiff = Math.round(kFactor * (actualAi - expectedAi));
      
      aiPlayer.rating += ratingDiff;
      aiPlayer.matchCount += 1;
      if (isAiWinner) aiPlayer.winCount += 1;
      aiPlayer.updatedAt = new Date().toISOString();
    } else if (player2Id === 'human' && player1Id !== 'human') {
      const aiPlayer = p1;
      const isAiWinner = winnerId === aiPlayer.playerId;
      const humanRating = 1500;
      
      const expectedAi = 1 / (1 + Math.pow(10, (humanRating - aiPlayer.rating) / 400));
      const kFactor = 32;
      const actualAi = isAiWinner ? 1 : 0;
      ratingDiff = Math.round(kFactor * (actualAi - expectedAi));
      
      aiPlayer.rating += ratingDiff;
      aiPlayer.matchCount += 1;
      if (isAiWinner) aiPlayer.winCount += 1;
      aiPlayer.updatedAt = new Date().toISOString();
    }

    const newMatch = {
      matchId,
      player1Id,
      player2Id,
      winnerId,
      ratingDiff: Math.abs(ratingDiff),
      scores,
      shocks,
      logs,
      createdAt: new Date().toISOString(),
    };

    matchesDb.unshift(newMatch);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      },
      body: JSON.stringify({ success: true, match: newMatch }),
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
