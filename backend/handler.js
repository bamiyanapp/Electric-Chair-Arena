'use strict';

const { GAME_RULES, getNumToSet } = require('./rules.js');
const { GoogleGenAI } = require('@google/genai');
const { getNashMove } = require('./nash.js');
const { PutCommand, GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, MATCHES_TABLE, PLAYERS_TABLE } = require('./dynamoClient.js');
const { initialPlayers, initialMatches } = require('./seedData.js');

// 試合終了後のスコアボードをDynamoDBへ記録する。書き込み失敗時もゲーム結果のレスポンスは返す。
async function recordMatchToDynamo(match) {
  try {
    await docClient.send(new PutCommand({ TableName: MATCHES_TABLE, Item: match }));
  } catch (error) {
    console.error('Failed to record match to DynamoDB:', error);
  }
}

// プレイヤーのレーティング等をDynamoDBへ保存する。書き込み失敗時もゲーム結果のレスポンスは返す。
async function savePlayer(player) {
  try {
    await docClient.send(new PutCommand({ TableName: PLAYERS_TABLE, Item: player }));
  } catch (error) {
    console.error(`Failed to save player ${player.playerId} to DynamoDB:`, error);
  }
}

// DynamoDBからプレイヤー一覧を取得する。未登録/取得失敗時は初期データにフォールバックする。
async function loadPlayers() {
  try {
    const result = await docClient.send(new ScanCommand({ TableName: PLAYERS_TABLE }));
    if (result.Items && result.Items.length > 0) {
      return result.Items;
    }
  } catch (error) {
    console.error('Failed to load players from DynamoDB:', error);
  }
  // initialPlayersの要素を直接返すと、呼び出し元がプレイヤーオブジェクトを
  // 直接ミューテートする(レーティング更新など)際にシードデータの共有シングルトンを
  // 汚染し、無関係な別リクエストの結果に混入してしまう。必ずコピーを返す。
  return initialPlayers.map(p => ({ ...p }));
}

// DynamoDBから単一プレイヤーを取得する。未登録/取得失敗時は初期データにフォールバックする。
async function getPlayerById(playerId) {
  try {
    const result = await docClient.send(new GetCommand({ TableName: PLAYERS_TABLE, Key: { playerId } }));
    if (result.Item) {
      return result.Item;
    }
  } catch (error) {
    console.error(`Failed to get player ${playerId} from DynamoDB:`, error);
  }
  const fallback = initialPlayers.find(p => p.playerId === playerId);
  return fallback ? { ...fallback } : null;
}

// DynamoDBから試合履歴一覧を取得する（作成日時の降順）。未登録/取得失敗時は初期データにフォールバックする。
async function loadMatches() {
  try {
    const result = await docClient.send(new ScanCommand({ TableName: MATCHES_TABLE }));
    if (result.Items && result.Items.length > 0) {
      return [...result.Items].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
  } catch (error) {
    console.error('Failed to load matches from DynamoDB:', error);
  }
  return [...initialMatches].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(m => ({ ...m }));
}

// DynamoDBから単一の試合結果を取得する。未登録/取得失敗時は初期データにフォールバックする。
async function getMatchById(matchId) {
  try {
    const result = await docClient.send(new GetCommand({ TableName: MATCHES_TABLE, Key: { matchId } }));
    if (result.Item) {
      return result.Item;
    }
  } catch (error) {
    console.error(`Failed to get match ${matchId} from DynamoDB:`, error);
  }
  const fallback = initialMatches.find(m => m.matchId === matchId);
  return fallback ? { ...fallback } : null;
}

module.exports.getPlayers = async () => {
  const players = await loadPlayers();
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      players,
    }),
  };
};

module.exports.getLeaderboard = async () => {
  const players = await loadPlayers();
  const sortedPlayers = [...players].sort((a, b) => b.rating - a.rating);
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
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
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Missing parameters' }),
      };
    }

    const isValidChairNumber = (c) => Number.isInteger(c) && c >= 1 && c <= GAME_RULES.TOTAL_CHAIRS;
    const isValidRemainingChairs = Array.isArray(remainingChairs) &&
      remainingChairs.length > 0 &&
      remainingChairs.every(isValidChairNumber);

    if (!isValidRemainingChairs || (role !== 'set' && role !== 'choose')) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'remainingChairs must be a non-empty array of valid chair numbers, and role must be "set" or "choose"' }),
      };
    }

    const move = computeAiMove(aiPlayerId, role, remainingChairs, opponentShocks || 0);

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(move),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message }),
    };
  }
};

module.exports.getMatches = async () => {
  const matches = await loadMatches();
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      matches,
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
      },
      body: JSON.stringify({ error: 'matchId is required' }),
    };
  }

  const match = await getMatchById(matchId);

  if (!match) {
    return {
      statusCode: 404,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Match not found' }),
    };
  }

  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      match,
    }),
  };
};

// AIの行動と思考
function computeAiMove(playerId, role, remainingChairs) {
  // ナッシュ均衡AIは共通ロジックを使用
  if (playerId === 'ai-nash') {
    return getNashMove(playerId, role, remainingChairs);
  }

  if (role === 'set') {
    // 親（設置）：残りの椅子の1/3程度に電流をセット
    const numToSet = getNumToSet(remainingChairs.length);
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
        },
        body: JSON.stringify({ error: 'player1Id and player2Id are required' }),
      };
    }

    const [p1, p2] = await Promise.all([getPlayerById(player1Id), getPlayerById(player2Id)]);

    if (!p1 || !p2) {
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
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
      const { setChairs, reasoning: setReasoning } = computeAiMove(setter.playerId, 'set', remainingChairs);
      // 子が椅子を選択する
      const { chosenChair, reasoning: chooseReasoning } = computeAiMove(chooser.playerId, 'choose', remainingChairs);

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
        if (shocks.p1 !== shocks.p2) {
          winnerId = shocks.p1 < shocks.p2 ? p1.playerId : p2.playerId;
        } else {
          winnerId = 'draw';
        }
      }
    }

    let winner = null;
    let ratingDiff = 0;
    const kFactor = 32;

    if (winnerId !== 'draw') {
      winner = winnerId === p1.playerId ? p1 : p2;
      const loser = winnerId === p1.playerId ? p2 : p1;

      // ELOレーティング更新
      const expectedWinner = 1 / (1 + Math.pow(10, (loser.rating - winner.rating) / 400));
      ratingDiff = Math.round(kFactor * (1 - expectedWinner));

      winner.rating += ratingDiff;
      loser.rating -= ratingDiff;

      winner.winCount += 1;
      winner.matchCount += 1;
      loser.matchCount += 1;

      winner.updatedAt = new Date().toISOString();
      loser.updatedAt = new Date().toISOString();

      await Promise.all([savePlayer(winner), savePlayer(loser)]);
    } else {
      // 引き分け
      const expectedP1 = 1 / (1 + Math.pow(10, (p2.rating - p1.rating) / 400));
      const p1Diff = Math.round(kFactor * (0.5 - expectedP1));

      p1.rating += p1Diff;
      p2.rating -= p1Diff;

      p1.matchCount += 1;
      p2.matchCount += 1;

      p1.updatedAt = new Date().toISOString();
      p2.updatedAt = new Date().toISOString();

      await Promise.all([savePlayer(p1), savePlayer(p2)]);
    }

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

    await recordMatchToDynamo(newMatch);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        matchId,
        player1: p1,
        player2: p2,
        winner: winnerId === 'draw' ? 'draw' : winner.name,
        ratingDiff: Math.abs(ratingDiff),
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
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};

module.exports.generateCommentary = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { gameState, action } = body;
    
    const generateMockCommentary = () => {
      if (action && action.isShocked) {
        return '「おおっと！ここで痛恨のビリビリだあああ！」';
      } else if (action && action.chosenChair) {
        return `「${action.chosenChair}番の椅子で勝負に出た！見事セーフ！」`;
      }
      return '「熱い戦いが続いています！」';
    };

    if (!process.env.GEMINI_API) {
      console.warn('GEMINI_API is not configured, returning mock commentary.');
      return { 
        statusCode: 200, 
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ commentary: generateMockCommentary() }) 
      };
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API });

    const prompt = `あなたは「ビリビリ椅子取りゲーム」の実況解説者です。
現在のゲームの状況: ${JSON.stringify(gameState || {})}
直前のアクション: ${JSON.stringify(action || {})}
この状況を踏まえて、熱く短く（1〜2文程度で）実況解説をしてください。`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });
      const text = response.text;

      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ commentary: text || generateMockCommentary() }),
      };
    } catch (apiError) {
      console.error('Gemini API Error:', apiError);
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ commentary: generateMockCommentary() }),
      };
    }
  } catch (error) {
    console.error('Error generating commentary:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
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
        },
        body: JSON.stringify({ error: 'Missing parameters' }),
      };
    }

    if (winnerId !== player1Id && winnerId !== player2Id && winnerId !== 'draw') {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'winnerId must be player1Id, player2Id, or "draw"' }),
      };
    }

    const isNonNegativeInt = (value) => Number.isInteger(value) && value >= 0;
    const isValidScoreOrShockField = (value) =>
      value === undefined ||
      (typeof value === 'object' && value !== null &&
        isNonNegativeInt(value.p1) && isNonNegativeInt(value.p2));

    if (!isValidScoreOrShockField(scores) || !isValidScoreOrShockField(shocks)) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'scores and shocks must be objects with non-negative integer p1/p2 fields' }),
      };
    }

    if (logs !== undefined) {
      if (!Array.isArray(logs)) {
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'logs must be an array' }),
        };
      }

      const seenChairs = new Set();
      for (const log of logs) {
        const chosenChair = log && log.chosenChair;
        if (chosenChair === undefined) continue;

        const isValidChair = Number.isInteger(chosenChair) && chosenChair >= 1 && chosenChair <= GAME_RULES.TOTAL_CHAIRS;
        if (!isValidChair || seenChairs.has(chosenChair)) {
          return {
            statusCode: 400,
            headers: {
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'logs contain an invalid or duplicate chosenChair' }),
          };
        }
        seenChairs.add(chosenChair);
      }
    }

    const [p1, p2] = await Promise.all([
      player1Id === 'human'
        ? { playerId: 'human', name: 'あなた (人間)', rating: 1500, winCount: 0, matchCount: 0 }
        : getPlayerById(player1Id),
      player2Id === 'human'
        ? { playerId: 'human', name: 'あなた (人間)', rating: 1500, winCount: 0, matchCount: 0 }
        : getPlayerById(player2Id),
    ]);

    if (!p1 || !p2) {
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'One or both players not found' }),
      };
    }

    let ratingDiff = 0;
    
    // AIのレーティングを更新 (相手が人間の場合)
    if (player1Id === 'human' && player2Id !== 'human') {
      const aiPlayer = p2;
      const isAiWinner = winnerId === aiPlayer.playerId;
      const isDraw = winnerId === 'draw';
      const humanRating = 1500;
      
      const expectedAi = 1 / (1 + Math.pow(10, (humanRating - aiPlayer.rating) / 400));
      const kFactor = 32;
      const actualAi = isAiWinner ? 1 : isDraw ? 0.5 : 0;
      ratingDiff = Math.round(kFactor * (actualAi - expectedAi));
      
      aiPlayer.rating += ratingDiff;
      aiPlayer.matchCount += 1;
      if (isAiWinner) aiPlayer.winCount += 1;
      aiPlayer.updatedAt = new Date().toISOString();
      await savePlayer(aiPlayer);
    } else if (player2Id === 'human' && player1Id !== 'human') {
      const aiPlayer = p1;
      const isAiWinner = winnerId === aiPlayer.playerId;
      const isDraw = winnerId === 'draw';
      const humanRating = 1500;

      const expectedAi = 1 / (1 + Math.pow(10, (humanRating - aiPlayer.rating) / 400));
      const kFactor = 32;
      const actualAi = isAiWinner ? 1 : isDraw ? 0.5 : 0;
      ratingDiff = Math.round(kFactor * (actualAi - expectedAi));
      
      aiPlayer.rating += ratingDiff;
      aiPlayer.matchCount += 1;
      if (isAiWinner) aiPlayer.winCount += 1;
      aiPlayer.updatedAt = new Date().toISOString();
      await savePlayer(aiPlayer);
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

    await recordMatchToDynamo(newMatch);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ success: true, match: newMatch }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
