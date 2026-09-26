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
  console.error('[%s] %s failed:', requestId, logContext, error);
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
    console.error('Failed to update player %s rating in DynamoDB:', player.playerId, error);
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
    console.error('Failed to get player %s from DynamoDB:', playerId, error);
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
    console.error('Failed to get match %s from DynamoDB:', matchId, error);
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

// opponentHistory.setterActions/chooserActionsの各要素
// { chosenChair: number, availableChairs: number[] } の形式を検証する
// (issue #167)。availableChairsはchosenChairを実際に選んだ時点での選択肢
// (残り椅子)であり、chosenChairを含む有効な椅子番号の配列でなければならない。
function isValidOpponentAction(action, isValidChairNumber) {
  if (!action || typeof action !== 'object') return false;
  const { chosenChair, availableChairs } = action;
  return (
    isValidChairNumber(chosenChair) &&
    Array.isArray(availableChairs) &&
    availableChairs.length > 0 &&
    availableChairs.every(isValidChairNumber) &&
    availableChairs.includes(chosenChair)
  );
}

// opponentHistory自体は任意項目。省略時はcomputeAiMove側で観測無し(0件)として
// 扱われ、従来通りの均衡プレイにフォールバックする。指定された場合のみ、
// setterActions/chooserActions(いずれも任意)の形式を検証する。1試合の
// ターン数はGAME_RULES.TOTAL_CHAIRSを超えないため、それぞれの配列長も
// 同じ上限で制限する。
function isValidOpponentHistory(opponentHistory, isValidChairNumber) {
  if (opponentHistory === undefined) return true;
  if (!opponentHistory || typeof opponentHistory !== 'object' || Array.isArray(opponentHistory)) return false;
  const { setterActions, chooserActions } = opponentHistory;
  const isValidActionList = (actions) =>
    actions === undefined || (
      Array.isArray(actions) &&
      actions.length <= GAME_RULES.TOTAL_CHAIRS &&
      actions.every((a) => isValidOpponentAction(a, isValidChairNumber))
    );
  return isValidActionList(setterActions) && isValidActionList(chooserActions);
}

module.exports.getAiMove = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { aiPlayerId, role, remainingChairs, selfScore, opponentScore, selfShocks, opponentShocks, opponentHistory } = body;

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

    // 対局状態(スコア・感電回数)は任意項目。省略した呼び出し元に対しては
    // 従来通り状態非依存のロジックにフォールバックする(computeAiMove側の
    // デフォルト値による)ため、ここでは指定された場合のみ形式を検証する。
    const isValidOptionalNonNegativeInt = (v) => v === undefined || (Number.isInteger(v) && v >= 0);
    if (![selfScore, opponentScore, selfShocks, opponentShocks].every(isValidOptionalNonNegativeInt)) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'selfScore/opponentScore/selfShocks/opponentShocks must be non-negative integers if provided' }),
      };
    }

    if (!isValidOpponentHistory(opponentHistory, isValidChairNumber)) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'opponentHistory must contain setterActions/chooserActions arrays of { chosenChair, availableChairs } if provided' }),
      };
    }

    const move = computeAiMove(aiPlayerId, role, remainingChairs, { selfScore, opponentScore, selfShocks, opponentShocks, opponentHistory });

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

// 岡野AIが座る側で、高得点椅子を狙うセオリーを無視して完全ランダムに
// 全ツッパする「一発狙いの博打」を選ぶ確率。
const OKANO_CHOOSE_WILDCARD_PROB = 0.15;

// 重み関数に従って要素から確率的に1つを選ぶ。weightFnは各要素に対して
// 0以上の重みを返す必要がある。合計が0以下の場合は一様ランダムに
// フォールバックする。
function weightedRandomChoice(items, weightFn) {
  const weights = items.map(weightFn);
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) {
    return items[Math.floor(Math.random() * items.length)];
  }
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// 重み関数に従って、重複無しでcount個を確率的に選ぶ。
function weightedSampleWithoutReplacement(items, weightFn, count) {
  const pool = [...items];
  const result = [];
  while (result.length < count && pool.length > 0) {
    const pick = weightedRandomChoice(pool, weightFn);
    result.push(pick);
    pool.splice(pool.indexOf(pick), 1);
  }
  return result;
}

// 各キャラクターAIの設置(set)戦略。shuffledは呼び出し元(computeAiMove)で
// 1回だけ計算されたシャッフル済み残り椅子で、Math.random()の呼び出し順序を
// 変えないよう各戦略関数へそのまま渡す(既存テストが実際の乱数呼び出し列に
// 依存しているため、この計算タイミングは崩せない)。
function computeOkanoSetMove(remainingChairs, numToSet, shuffled) {
  // 岡野：あえて大きな数字（10,11,12）に仕掛けるか、裏をかいて1に仕掛けるギャンブル戦略
  const highChairs = remainingChairs.filter(c => c >= 9);
  if (highChairs.length > 0 && Math.random() > 0.4) {
    return {
      setChairs: [...highChairs].sort(() => 0.5 - Math.random()).slice(0, numToSet),
      reasoning: `「ここは勝負どころ。あいつは絶対高得点（10〜12）を欲しがって座りにくるはず。そこに罠を張るのが勝負師ってものよ！」`,
    };
  }
  return { setChairs: shuffled.slice(0, numToSet), reasoning: `「ギャンブラーの直感。ランダムに見えて一番えぐい位置に仕掛けてやったわ。」` };
}

function computeKoyabuSetMove(remainingChairs, numToSet, shuffled) {
  // 小籔：理詰め。中間点数の椅子を好む
  const midChairs = remainingChairs.filter(c => c >= 4 && c <= 8);
  if (midChairs.length > 0) {
    return {
      setChairs: [...midChairs].sort(() => 0.5 - Math.random()).slice(0, numToSet),
      reasoning: `「まあ普通に考えて、大勝負に出る勇気もない、かといって1点とかで刻むのも嫌な奴は、中間の4〜8辺りに逃げるんですわ。そこを突くのがセオリー。」`,
    };
  }
  return { setChairs: shuffled.slice(0, numToSet), reasoning: `「残った選択肢から考えて、ここが最も論理的な罠の位置ですわ。」` };
}

function computeJuniorSetMove(remainingChairs, numToSet) {
  // ジュニア：座る側と同じく、両極端を避けた中央値寄りの重みで
  // 仕掛ける位置を選ぶ(以前はai-randomと全く同じ実装だった)
  const sortedAsc = [...remainingChairs].sort((a, b) => a - b);
  const median = sortedAsc[Math.floor(sortedAsc.length / 2)];
  const setChairs = weightedSampleWithoutReplacement(remainingChairs, c => 1 / (1 + (c - median) ** 2), numToSet);
  return { setChairs, reasoning: `「ええか、両極端に逃げる奴はすぐ底が知れる。読み合いの本質はド真ん中付近に潜んどるんや。」` };
}

function computeRuleBasedSetMove(remainingChairs, numToSet, opponentScore, opponentShocks) {
  // 期待値計算：相手があと1回の感電で敗北する場合は、得点効率を無視して
  // 選ばれやすさが均等な椅子から仕留めにいく(相手の設置傾向と同様、
  // 相手がどの椅子を選ぶかも不明なため、一様に確率的な狙い撃ちとなる)。
  // それ以外の場面では、罠の位置は相手の設置傾向が不明なため、確実に
  // 狙われる最高得点椅子に固定するのではなく、相手の勝利に必要な
  // 残り得点を超える価値は無いとみなした実効価値に比例した確率で仕掛ける。
  const isKillMode = opponentShocks >= GAME_RULES.MAX_SHOCKS - 1;
  if (isKillMode) {
    return {
      setChairs: weightedSampleWithoutReplacement(remainingChairs, () => 1, numToSet),
      reasoning: `「(計算機AI) 相手はあと1回の感電で敗北します。得点効率よりも仕留めることを優先し、確率的に狙い撃ちます。」`,
    };
  }
  const effectiveMax = Math.max(0, GAME_RULES.WINNING_SCORE - opponentScore);
  return {
    setChairs: weightedSampleWithoutReplacement(remainingChairs, c => Math.min(c, effectiveMax), numToSet),
    reasoning: `「(計算機AI) 相手の勝利に必要な残り得点(${effectiveMax}点)を踏まえた実効価値に比例した確率分布に基づき電流を仕掛けます。」`,
  };
}

// 各キャラクターAIの選択(choose)戦略。
function computeOkanoChooseMove(remainingChairs) {
  // 岡野：基本は高得点椅子ほど選ばれやすい重みで狙うが、性格に見合った
  // 博打として一定確率でセオリーを無視した全ランダム選択を混ぜる
  // (以前は高得点椅子があれば必ずその最大値を選ぶ完全決定的な実装で、
  // 数ターンで座る位置を読み切られてしまっていた)
  if (Math.random() < OKANO_CHOOSE_WILDCARD_PROB) {
    const chosenChair = remainingChairs[Math.floor(Math.random() * remainingChairs.length)];
    return { chosenChair, reasoning: `「たまにはセオリー無視や！ここは直感一本、椅子${chosenChair}に全部賭ける！」` };
  }
  const chosenChair = weightedRandomChoice(remainingChairs, c => c * c);
  return { chosenChair, reasoning: `「ここで小さい数字座ってチマチマ点稼いでも男がすたりますわ！椅子${chosenChair}で一気に40点に近づいたる！」` };
}

function computeKoyabuChooseMove(remainingChairs) {
  // 小籔：低得点椅子ほど選ばれやすい重みで、安全志向を保ちつつ
  // 完全には決定的にしない
  const maxChair = Math.max(...remainingChairs);
  const chosenChair = weightedRandomChoice(remainingChairs, c => (maxChair - c + 1) ** 2);
  return { chosenChair, reasoning: `「高得点は魅力やけど、そこに電流仕掛けられて感電してライフ削られるのは一番あきません。低得点で安全そうな椅子${chosenChair}から丁寧にいきまっせ。」` };
}

function computeJuniorChooseMove(remainingChairs) {
  // ジュニア：両極端を避け、中央値付近ほど選ばれやすい重みで選ぶ
  const sortedAsc = [...remainingChairs].sort((a, b) => a - b);
  const median = sortedAsc[Math.floor(sortedAsc.length / 2)];
  const chosenChair = weightedRandomChoice(remainingChairs, c => 1 / (1 + (c - median) ** 2));
  return { chosenChair, reasoning: `「相手は俺が高得点を狙うと思ってるやろうし、安全に低いとこ座るのも見透かされてる。ここはあえてド真ん中付近、椅子${chosenChair}が一番心理的に狙われにくい位置や。」` };
}

function computeRuleBasedChooseMove(remainingChairs, selfScore) {
  // 期待値計算：罠の位置は相手の設置傾向が不明なため残り椅子に
  // 一様分布すると仮定すると、生存確率はどの椅子を選んでも同じに
  // なり、期待値は得点に比例する。よって常に最高得点椅子を選ぶ
  // のではなく、自分の勝利に必要な残り得点を超える価値は無いと
  // みなした実効価値に比例した確率で選ぶ(必要以上に高得点の椅子を
  // 無理に狙いにいかない)
  const effectiveMax = Math.max(0, GAME_RULES.WINNING_SCORE - selfScore);
  const chosenChair = weightedRandomChoice(remainingChairs, c => Math.min(c, effectiveMax));
  return { chosenChair, reasoning: `「(計算機AI) 勝利に必要な残り得点(${effectiveMax}点)を踏まえた実効価値に比例した確率でシート${chosenChair}を選択。」` };
}

// 親（設置）：残りの椅子の1/3程度に電流をセットする。
function computeSetMove(playerId, remainingChairs, opponentScore, opponentShocks) {
  const numToSet = getNumToSet(remainingChairs.length);
  const shuffled = [...remainingChairs].sort(() => 0.5 - Math.random());

  let move;
  if (playerId === 'ai-okano') {
    move = computeOkanoSetMove(remainingChairs, numToSet, shuffled);
  } else if (playerId === 'ai-koyabu') {
    move = computeKoyabuSetMove(remainingChairs, numToSet, shuffled);
  } else if (playerId === 'ai-junior') {
    move = computeJuniorSetMove(remainingChairs, numToSet);
  } else if (playerId === 'ai-rule-based') {
    move = computeRuleBasedSetMove(remainingChairs, numToSet, opponentScore, opponentShocks);
  } else {
    // ランダム
    move = { setChairs: shuffled.slice(0, numToSet), reasoning: `「ランダムに電流を配置。完全な確率論でのアプローチです。」` };
  }

  // 整合性を保つため、万が一空っぽなら補完
  if (move.setChairs.length === 0) {
    move.setChairs = shuffled.slice(0, numToSet);
  }
  return move;
}

// 子（選択）：椅子に座る。
function computeChooseMove(playerId, remainingChairs, selfScore) {
  if (playerId === 'ai-okano') {
    return computeOkanoChooseMove(remainingChairs);
  } else if (playerId === 'ai-koyabu') {
    return computeKoyabuChooseMove(remainingChairs);
  } else if (playerId === 'ai-junior') {
    return computeJuniorChooseMove(remainingChairs);
  } else if (playerId === 'ai-rule-based') {
    return computeRuleBasedChooseMove(remainingChairs, selfScore);
  }
  const chosenChair = remainingChairs[Math.floor(Math.random() * remainingChairs.length)];
  return { chosenChair, reasoning: `「ランダムに椅子 ${chosenChair} を選択します。」` };
}

// AIの行動と思考。matchState(スコア・感電回数)は任意で、省略時(undefined)は
// 各AIとも従来通り状態非依存のロジックにフォールバックする。matchState.opponentHistory
// (相手の設置/選択履歴。issue #167)は現状ai-nash(getNashMove)のみが利用し、
// 他のキャラクターAIは無視する。
function computeAiMove(playerId, role, remainingChairs, matchState = {}) {
  const { selfScore = 0, opponentScore = 0, opponentShocks = 0 } = matchState;

  // ナッシュ均衡AIは共通ロジックを使用
  if (playerId === 'ai-nash') {
    return getNashMove(playerId, role, remainingChairs, matchState);
  }

  if (role === 'set') {
    return computeSetMove(playerId, remainingChairs, opponentScore, opponentShocks);
  }
  return computeChooseMove(playerId, remainingChairs, selfScore);
}

// 自己対戦ベンチマーク(benchmark.js)から対局状態を考慮した手を直接
// 計算するために公開する(issue #166)。
module.exports.computeAiMove = computeAiMove;

// startMatchの自己対戦シミュレーションにおける1ターン分の処理。scores・shocks・
// logsは呼び出し元と共有するオブジェクト/配列をそのままミューテートし、
// フィルタ後の残り椅子(次ターンのremainingChairs)を返す。
function playStartMatchTurn(turn, p1, p2, remainingChairs, scores, shocks, logs) {
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
  const nextRemainingChairs = remainingChairs.filter(c => c !== chosenChair);

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
    remainingChairs: [...nextRemainingChairs],
    reasoning: `${setReasoning}\n${chooseReasoning}`,
  });

  return nextRemainingChairs;
}

// 最終スコア・感電数から勝者のplayerId('draw'を含む)を判定する。
function resolveStartMatchWinner(p1, p2, scores, shocks) {
  if (shocks.p1 >= GAME_RULES.MAX_SHOCKS || scores.p2 >= GAME_RULES.WINNING_SCORE) {
    return p2.playerId;
  }
  if (shocks.p2 >= GAME_RULES.MAX_SHOCKS || scores.p1 >= GAME_RULES.WINNING_SCORE) {
    return p1.playerId;
  }
  // 椅子残り1つ
  if (scores.p1 !== scores.p2) {
    return scores.p1 > scores.p2 ? p1.playerId : p2.playerId;
  }
  if (shocks.p1 !== shocks.p2) {
    return shocks.p1 < shocks.p2 ? p1.playerId : p2.playerId;
  }
  return 'draw';
}

// 勝者判定結果に応じてELOレーティングを更新し、DBへ反映する。
// 戻り値のwinnerは引き分け時はnull、ratingDiffは常にwinner側の符号付き変動量。
async function applyStartMatchRatingUpdates(winnerId, p1, p2) {
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

  return { winner, ratingDiff };
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
      remainingChairs = playStartMatchTurn(turn, p1, p2, remainingChairs, scores, shocks, logs);
      turn++;
    }

    const winnerId = resolveStartMatchWinner(p1, p2, scores, shocks);
    const { winner, ratingDiff } = await applyStartMatchRatingUpdates(winnerId, p1, p2);

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

function validateSaveMatchRequiredFields(matchId, player1Id, player2Id, winnerId) {
  if (!matchId || !player1Id || !player2Id || !winnerId) {
    return 'Missing parameters';
  }
  return undefined;
}

function validateSaveMatchWinnerId(player1Id, player2Id, winnerId) {
  if (winnerId !== player1Id && winnerId !== player2Id && winnerId !== 'draw') {
    return 'winnerId must be player1Id, player2Id, or "draw"';
  }
  return undefined;
}

function validateSaveMatchScoreFields(scores, shocks) {
  const isNonNegativeInt = (value) => Number.isInteger(value) && value >= 0;
  const isValidScoreOrShockField = (value) =>
    value === undefined ||
    (typeof value === 'object' && value !== null &&
      isNonNegativeInt(value.p1) && isNonNegativeInt(value.p2));

  if (!isValidScoreOrShockField(scores) || !isValidScoreOrShockField(shocks)) {
    return 'scores and shocks must be objects with non-negative integer p1/p2 fields';
  }
  return undefined;
}

function validateSaveMatchMode(mode) {
  if (mode !== undefined && mode !== 'human' && mode !== 'pvp') {
    return 'mode must be "human" or "pvp"';
  }
  return undefined;
}

function validateSaveMatchLogs(logs) {
  if (logs === undefined) return undefined;
  if (!Array.isArray(logs)) {
    return 'logs must be an array';
  }

  const seenChairs = new Set();
  for (const log of logs) {
    const chosenChair = log && log.chosenChair;
    if (chosenChair === undefined) continue;

    const isValidChair = Number.isInteger(chosenChair) && chosenChair >= 1 && chosenChair <= GAME_RULES.TOTAL_CHAIRS;
    if (!isValidChair || seenChairs.has(chosenChair)) {
      return 'logs contain an invalid or duplicate chosenChair';
    }
    seenChairs.add(chosenChair);
  }
  return undefined;
}

// saveMatchのリクエストボディを検証し、問題があればクライアント向け
// エラーメッセージを返す。問題なければundefinedを返す。
function validateSaveMatchRequest(body) {
  const { matchId, player1Id, player2Id, winnerId, scores, shocks, logs, mode } = body;
  return (
    validateSaveMatchRequiredFields(matchId, player1Id, player2Id, winnerId) ||
    validateSaveMatchWinnerId(player1Id, player2Id, winnerId) ||
    validateSaveMatchScoreFields(scores, shocks) ||
    validateSaveMatchMode(mode) ||
    validateSaveMatchLogs(logs)
  );
}

// 人間対AI戦の場合のみAI側のレーティングを更新しDBへ反映する(PVP等、
// 両者が人間の疑似プレイヤーの場合は更新自体が発生せずratingDiff: 0を返す)。
// 戻り値のratingDiff/aiRatingDiffはいずれもAI視点の符号付き変動量。
async function applyAiRatingUpdateForSaveMatch(player1Id, player2Id, winnerId, p1, p2) {
  const isPlayer1Human = isHumanPseudoPlayerId(player1Id);
  const isPlayer2Human = isHumanPseudoPlayerId(player2Id);
  if (isPlayer1Human === isPlayer2Human) {
    return { ratingDiff: 0, aiRatingDiff: null };
  }

  const aiPlayer = isPlayer1Human ? p2 : p1;
  const isAiWinner = winnerId === aiPlayer.playerId;
  const isDraw = winnerId === 'draw';
  const humanRating = 1500;

  let actualAi;
  if (isAiWinner) {
    actualAi = 1;
  } else if (isDraw) {
    actualAi = 0.5;
  } else {
    actualAi = 0;
  }
  const ratingDiff = computeEloDiff(aiPlayer.rating, humanRating, actualAi);

  await applyPlayerRatingUpdate(aiPlayer, ratingDiff, isAiWinner);

  aiPlayer.rating += ratingDiff;
  aiPlayer.matchCount += 1;
  if (isAiWinner) aiPlayer.winCount += 1;
  aiPlayer.updatedAt = new Date().toISOString();

  return { ratingDiff, aiRatingDiff: ratingDiff };
}

module.exports.saveMatch = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { matchId, player1Id, player2Id, winnerId, scores, shocks, logs, mode } = body;

    const validationError = validateSaveMatchRequest(body);
    if (validationError) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: validationError }),
      };
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

    const { ratingDiff, aiRatingDiff } = await applyAiRatingUpdateForSaveMatch(player1Id, player2Id, winnerId, p1, p2);

    const newMatch = {
      matchId,
      player1Id,
      player2Id,
      winnerId,
      ratingDiff: Math.abs(ratingDiff),
      aiRatingDiff,
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
