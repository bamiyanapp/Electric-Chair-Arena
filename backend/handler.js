'use strict';

const { randomUUID } = require('crypto');
const { GAME_RULES, getNumToSet } = require('./rules.js');
const { GoogleGenAI } = require('@google/genai');
const { getNashMove } = require('./nash.js');
const { PutCommand, GetCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, MATCHES_TABLE, PLAYERS_TABLE } = require('./dynamoClient.js');
const { initialPlayers, initialMatches } = require('./seedData.js');

const ELO_K_FACTOR = 32;

// レーティングを持たない疑似プレイヤーID。'human'は人間対AIモード、
// 'p1'/'p2'はローカルPVPモードの各プレイヤーを表す。
const HUMAN_PSEUDO_PLAYER_NAMES = {
  human: 'あなた (人間)',
  p1: 'プレイヤー1',
  p2: 'プレイヤー2',
};

function isHumanPseudoPlayerId(playerId) {
  return Object.prototype.hasOwnProperty.call(HUMAN_PSEUDO_PLAYER_NAMES, playerId);
}

function makeHumanPseudoPlayer(playerId) {
  return { playerId, name: HUMAN_PSEUDO_PLAYER_NAMES[playerId], rating: 1500, winCount: 0, matchCount: 0 };
}

// ELOレーティングの変動量を計算する。resultは対戦結果(1=勝ち, 0.5=分け, 0=負け)。
// 戻り値はplayerRating側の増減量(相手はこの値をマイナスした分だけ増減させる)。
function computeEloDiff(playerRating, opponentRating, result) {
  const expected = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  return Math.round(ELO_K_FACTOR * (result - expected));
}

// エラー発生時の共通レスポンスを組み立てる。内部のエラーメッセージ/スタックは
// クライアントに返さず、相関用のrequestIdとともにサーバー側ログにのみ出力する。
function errorResponse(statusCode, clientMessage, logContext, error) {
  const requestId = `${logContext}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  console.error(`[${requestId}] ${logContext} failed:`, error);
  return {
    statusCode,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ error: clientMessage, requestId }),
  };
}

// 試合終了後のスコアボードをDynamoDBへ記録する。matchIdはUUIDのため衝突は
// 実質起こり得ないが、万一の衝突で既存の試合記録を上書きしないよう
// attribute_not_existsで条件付き書き込みにする。書き込み失敗時(衝突含む)も
// ゲーム結果のレスポンスは返す。
async function recordMatchToDynamo(match) {
  try {
    await docClient.send(new PutCommand({
      TableName: MATCHES_TABLE,
      Item: match,
      ConditionExpression: 'attribute_not_exists(matchId)',
    }));
  } catch (error) {
    console.error('Failed to record match to DynamoDB:', error);
  }
}

// プレイヤーのレーティング・勝敗数をDynamoDBへ加算更新する。read-modify-write
// (読み出し→ローカルで加算→無条件PutCommandで全属性上書き)だと、同一AIに対する
// 複数の試合結果がほぼ同時に保存された場合、後勝ちで一方の更新が失われる
// (lost update)。ADD/if_not_existsによる加算式のUpdateCommandに変更し、
// DynamoDB側でアトミックに反映されるようにする。項目がまだ存在しない
// (初回保存)場合はif_not_existsのフォールバック値としてplayer(=getPlayerById等
// が返すシード初期値)の値を使う。
async function applyPlayerRatingUpdate(player, ratingDiff, isWin) {
  try {
    await docClient.send(new UpdateCommand({
      TableName: PLAYERS_TABLE,
      Key: { playerId: player.playerId },
      UpdateExpression:
        'SET rating = if_not_exists(rating, :seedRating) + :ratingDiff, ' +
        'matchCount = if_not_exists(matchCount, :seedMatchCount) + :one, ' +
        'winCount = if_not_exists(winCount, :seedWinCount) + :winInc, ' +
        '#name = if_not_exists(#name, :name), ' +
        '#type = if_not_exists(#type, :type), ' +
        'updatedAt = :updatedAt',
      ExpressionAttributeNames: { '#name': 'name', '#type': 'type' },
      ExpressionAttributeValues: {
        ':seedRating': player.rating,
        ':ratingDiff': ratingDiff,
        ':seedMatchCount': player.matchCount,
        ':seedWinCount': player.winCount,
        ':one': 1,
        ':winInc': isWin ? 1 : 0,
        ':name': player.name,
        ':type': player.type,
        ':updatedAt': new Date().toISOString(),
      },
    }));
  } catch (error) {
    console.error(`Failed to update player ${player.playerId} rating in DynamoDB:`, error);
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
    const { aiPlayerId, role, remainingChairs } = body;

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

    const move = computeAiMove(aiPlayerId, role, remainingChairs);

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(move),
    };
  } catch (error) {
    return errorResponse(500, 'Failed to compute AI move', 'getAiMove', error);
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

    if (winnerId !== 'draw') {
      winner = winnerId === p1.playerId ? p1 : p2;
      const loser = winnerId === p1.playerId ? p2 : p1;

      // ELOレーティング更新
      ratingDiff = computeEloDiff(winner.rating, loser.rating, 1);

      // DBへはこの時点の(加算前の)スナップショットを渡し、アトミックな加算として
      // 反映する。ローカルの加算は下のレスポンス表示用のみに使う。
      await Promise.all([
        applyPlayerRatingUpdate(winner, ratingDiff, true),
        applyPlayerRatingUpdate(loser, -ratingDiff, false),
      ]);

      winner.rating += ratingDiff;
      loser.rating -= ratingDiff;

      winner.winCount += 1;
      winner.matchCount += 1;
      loser.matchCount += 1;

      winner.updatedAt = new Date().toISOString();
      loser.updatedAt = new Date().toISOString();
    } else {
      // 引き分け
      const p1Diff = computeEloDiff(p1.rating, p2.rating, 0.5);

      await Promise.all([
        applyPlayerRatingUpdate(p1, p1Diff, false),
        applyPlayerRatingUpdate(p2, -p1Diff, false),
      ]);

      p1.rating += p1Diff;
      p2.rating -= p1Diff;

      p1.matchCount += 1;
      p2.matchCount += 1;

      p1.updatedAt = new Date().toISOString();
      p2.updatedAt = new Date().toISOString();
    }

    const matchId = `match-${randomUUID()}`;
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
    return errorResponse(500, 'Failed to start match', 'startMatch', error);
  }
};

const COMMENTARY_MAX_BODY_LENGTH = 10 * 1024; // これを超えるリクエストボディは即座に拒否する
const COMMENTARY_TIMEOUT_MS = 5000; // Gemini APIの応答が遅い場合はモック解説にフォールバックする
const COMMENTARY_CACHE_MAX_SIZE = 200;
const commentaryCache = new Map();

// gameState/actionから想定するフィールドのみを安全な型で取り出す。
// 未検証の値をそのままプロンプトへ埋め込まない(プロンプトインジェクション対策)。
function sanitizeGameStateForCommentary(gameState) {
  if (!gameState || typeof gameState !== 'object') return {};
  const toScoreLike = (value) => ({
    p1: Number.isFinite(value?.p1) ? value.p1 : 0,
    p2: Number.isFinite(value?.p2) ? value.p2 : 0,
  });
  const remainingChairs = Array.isArray(gameState.remainingChairs)
    ? gameState.remainingChairs.filter((c) => Number.isInteger(c)).slice(0, GAME_RULES.TOTAL_CHAIRS)
    : [];
  return {
    scores: toScoreLike(gameState.scores),
    shocks: toScoreLike(gameState.shocks),
    remainingChairs,
    winner: typeof gameState.winner === 'string' ? gameState.winner.slice(0, 50) : '',
  };
}

function sanitizeActionForCommentary(action) {
  if (!action || typeof action !== 'object') return {};
  return {
    isHumanSetter: action.isHumanSetter === true,
    chosenChair: Number.isInteger(action.chosenChair) ? action.chosenChair : null,
    isShocked: action.isShocked === true,
  };
}

module.exports.generateCommentary = async (event) => {
  try {
    if (event.body && event.body.length > COMMENTARY_MAX_BODY_LENGTH) {
      return {
        statusCode: 413,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Request body too large' }),
      };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const gameState = sanitizeGameStateForCommentary(body.gameState);
    const action = sanitizeActionForCommentary(body.action);

    const generateMockCommentary = () => {
      if (action.isShocked) {
        return '「おおっと！ここで痛恨のビリビリだあああ！」';
      } else if (action.chosenChair) {
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

    const cacheKey = JSON.stringify({ gameState, action });
    const cached = commentaryCache.get(cacheKey);
    if (cached) {
      // LRU相当: 再利用したエントリを最新として挿入し直す
      commentaryCache.delete(cacheKey);
      commentaryCache.set(cacheKey, cached);
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ commentary: cached }),
      };
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API });

    const prompt = `あなたは「ビリビリ椅子取りゲーム」の実況解説者です。
現在のゲームの状況: ${JSON.stringify(gameState)}
直前のアクション: ${JSON.stringify(action)}
この状況を踏まえて、熱く短く（1〜2文程度で）実況解説をしてください。`;

    try {
      const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Gemini API timeout')), COMMENTARY_TIMEOUT_MS);
      });
      const response = await Promise.race([
        ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt }),
        timeout,
      ]);
      const text = response.text;
      const commentary = text || generateMockCommentary();

      if (text) {
        if (commentaryCache.size >= COMMENTARY_CACHE_MAX_SIZE) {
          commentaryCache.delete(commentaryCache.keys().next().value);
        }
        commentaryCache.set(cacheKey, commentary);
      }

      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ commentary }),
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
    return errorResponse(500, 'Failed to generate commentary', 'generateCommentary', error);
  }
};

module.exports.saveMatch = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { matchId, player1Id, player2Id, winnerId, scores, shocks, logs, mode } = body;

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

    if (mode !== undefined && mode !== 'human' && mode !== 'pvp') {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'mode must be "human" or "pvp"' }),
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
      isHumanPseudoPlayerId(player1Id) ? makeHumanPseudoPlayer(player1Id) : getPlayerById(player1Id),
      isHumanPseudoPlayerId(player2Id) ? makeHumanPseudoPlayer(player2Id) : getPlayerById(player2Id),
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

    // AIのレーティングを更新 (相手が人間/ローカルPVPの場合。疑似プレイヤー側は
    // レーティングを持たないため更新・保存しない。PVP同士(p1 vs p2)は
    // 両者とも疑似プレイヤーのため更新自体が発生しない)
    const isPlayer1Human = isHumanPseudoPlayerId(player1Id);
    const isPlayer2Human = isHumanPseudoPlayerId(player2Id);
    if (isPlayer1Human !== isPlayer2Human) {
      const aiPlayer = isPlayer1Human ? p2 : p1;
      const isAiWinner = winnerId === aiPlayer.playerId;
      const isDraw = winnerId === 'draw';
      const humanRating = 1500;

      const actualAi = isAiWinner ? 1 : isDraw ? 0.5 : 0;
      ratingDiff = computeEloDiff(aiPlayer.rating, humanRating, actualAi);

      await applyPlayerRatingUpdate(aiPlayer, ratingDiff, isAiWinner);

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
      mode,
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
    return errorResponse(500, 'Failed to save match', 'saveMatch', error);
  }
};
