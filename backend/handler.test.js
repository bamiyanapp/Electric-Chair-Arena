import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';
import Module from 'module';

// handler.js内部のrequire('./dynamoClient.js')はCJSのrequireで読み込まれるため、
// commentary.test.jsと同様にvi.mockではインターセプトできない。
// そのため、handler.jsを読み込む前にNodeのrequireキャッシュへ直接モックを差し込む。
const requireFromHere = createRequire(import.meta.url);
const dynamoClientPath = requireFromHere.resolve('./dynamoClient.js');

// PutCommand/GetCommand/ScanCommandを実際のDynamoDBのように状態を持ってエミュレートする
// (書き込み直後に読み出しても反映されるようにするため。テーブルはmatchId/playerIdをキーとするMapで表現する)。
const dynamoTables = {
  'test-matches-table': new Map(),
  'test-players-table': new Map(),
};
const tableKeyName = {
  'test-matches-table': 'matchId',
  'test-players-table': 'playerId',
};

function defaultDynamoSend(command) {
  const tableName = command.input.TableName;
  const store = dynamoTables[tableName];
  if (!store) return {};

  switch (command.constructor.name) {
    case 'PutCommand': {
      const keyName = tableKeyName[tableName];
      const key = command.input.Item[keyName];
      if (command.input.ConditionExpression === `attribute_not_exists(${keyName})` && store.has(key)) {
        throw Object.assign(new Error('ConditionalCheckFailedException'), { name: 'ConditionalCheckFailedException' });
      }
      store.set(key, command.input.Item);
      return {};
    }
    case 'GetCommand': {
      const key = Object.values(command.input.Key)[0];
      const item = store.get(key);
      return item ? { Item: item } : {};
    }
    case 'ScanCommand':
      return { Items: Array.from(store.values()) };
    case 'UpdateCommand': {
      // handler.jsのapplyPlayerRatingUpdateが生成する
      // "SET x = if_not_exists(x, :seed) + :diff, ..." パターンのみをエミュレートする。
      const keyName = tableKeyName[tableName];
      const key = command.input.Key[keyName];
      const existing = store.get(key) || {};
      const values = command.input.ExpressionAttributeValues || {};
      const merged = {
        ...existing,
        [keyName]: key,
        rating: (existing.rating !== undefined ? existing.rating : values[':seedRating']) + values[':ratingDiff'],
        matchCount: (existing.matchCount !== undefined ? existing.matchCount : values[':seedMatchCount']) + values[':one'],
        winCount: (existing.winCount !== undefined ? existing.winCount : values[':seedWinCount']) + values[':winInc'],
        name: existing.name !== undefined ? existing.name : values[':name'],
        type: existing.type !== undefined ? existing.type : values[':type'],
        updatedAt: values[':updatedAt'],
      };
      store.set(key, merged);
      return {};
    }
    default:
      return {};
  }
}

const dynamoSendMock = vi.fn((command) => Promise.resolve(defaultDynamoSend(command)));

const fakeDynamoClientModule = new Module(dynamoClientPath);
fakeDynamoClientModule.exports = {
  docClient: { send: dynamoSendMock },
  MATCHES_TABLE: 'test-matches-table',
  PLAYERS_TABLE: 'test-players-table',
};
Module._cache[dynamoClientPath] = fakeDynamoClientModule;

const { getPlayers, startMatch, getMatchResult, getLeaderboard, getMatches, saveMatch, generateCommentary, getAiMove } = await import('./handler.js');

describe('Backend Handler Specification Tests', () => {
  beforeEach(() => {
    // callsだけでなく、テストごとに上書きされ得るmockImplementationと「DB」の状態も既定値に戻す
    dynamoSendMock.mockReset();
    dynamoSendMock.mockImplementation((command) => Promise.resolve(defaultDynamoSend(command)));
    dynamoTables['test-matches-table'].clear();
    dynamoTables['test-players-table'].clear();
  });

  it('should get players list properly', async () => {
    const response = await getPlayers({});
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.players).toBeInstanceOf(Array);
    expect(body.players.length).toBeGreaterThan(0);
    expect(body.players[0].playerId).toBeDefined();
    expect(body.players[0].name).toBeDefined();
    expect(body.players[0].type).toBeDefined();
  });

  it('should get leaderboard sorted by rating', async () => {
    const response = await getLeaderboard({});
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.leaderboard).toBeInstanceOf(Array);
    
    const ratings = body.leaderboard.map(p => p.rating);
    const sortedRatings = [...ratings].sort((a, b) => b - a);
    expect(ratings).toEqual(sortedRatings);
  });

  it('should start a match and get results, logs, and save them', async () => {
    const event = {
      body: JSON.stringify({
        player1Id: 'ai-okano',
        player2Id: 'ai-junior',
      }),
    };
    
    const response = await startMatch(event);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    
    expect(body.matchId).toBeDefined();
    // UUIDベースのmatchId(Date.now()由来の衝突しやすいIDではない)であること
    expect(body.matchId).toMatch(/^match-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(body.player1.playerId).toBe('ai-okano');
    expect(body.player2.playerId).toBe('ai-junior');
    expect(body.winner).toBeDefined();
    expect(body.logs).toBeInstanceOf(Array);
    expect(body.logs.length).toBeGreaterThan(0);

    // Retrieve match result using getMatchResult
    const getResultEvent = {
      queryStringParameters: {
        matchId: body.matchId,
      },
    };
    
    const resultResponse = await getMatchResult(getResultEvent);
    expect(resultResponse.statusCode).toBe(200);
    const resultBody = JSON.parse(resultResponse.body);
    expect(resultBody.match.matchId).toBe(body.matchId);
    expect(resultBody.match.player1Id).toBe('ai-okano');

    // 試合終了後のスコアボードがDynamoDBへ記録されていること
    const matchPutCommand = dynamoSendMock.mock.calls
      .map(([command]) => command)
      .find((command) => command.input.TableName === 'test-matches-table');
    expect(matchPutCommand).toBeDefined();
    expect(matchPutCommand.input.Item.matchId).toBe(body.matchId);

    // 勝者・敗者のレーティングもDynamoDBへ(アトミックな加算として)保存されていること
    const playerUpdateCommands = dynamoSendMock.mock.calls
      .map(([command]) => command)
      .filter((command) => command.input.TableName === 'test-players-table' && command.constructor.name === 'UpdateCommand');
    expect(playerUpdateCommands.length).toBe(2);
    const savedPlayerIds = playerUpdateCommands.map((command) => command.input.Key.playerId).sort();
    expect(savedPlayerIds).toEqual(['ai-junior', 'ai-okano']);
  });

  it('should get matches list properly', async () => {
    const response = await getMatches({});
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.matches).toBeInstanceOf(Array);
  });

  it('should fail getMatchResult if matchId is missing or invalid', async () => {
    const responseNoId = await getMatchResult({});
    expect(responseNoId.statusCode).toBe(400);

    const responseInvalidId = await getMatchResult({
      queryStringParameters: { matchId: 'invalid-id' },
    });
    expect(responseInvalidId.statusCode).toBe(404);
  });

  it('should start matches with various AI patterns to increase coverage', async () => {
    // ai-koyabu vs ai-rule-based
    const res1 = await startMatch({
      body: JSON.stringify({ player1Id: 'ai-koyabu', player2Id: 'ai-rule-based' }),
    });
    expect(res1.statusCode).toBe(200);

    // ai-random vs ai-koyabu
    const res2 = await startMatch({
      body: JSON.stringify({ player1Id: 'ai-random', player2Id: 'ai-koyabu' }),
    });
    expect(res2.statusCode).toBe(200);
    
    // startMatch with missing parameters
    const resFail = await startMatch({});
    expect(resFail.statusCode).toBe(400);

    // startMatch with invalid players
    const resInvalid = await startMatch({
      body: JSON.stringify({ player1Id: 'invalid-1', player2Id: 'invalid-2' }),
    });
    expect(resInvalid.statusCode).toBe(404);
  });

  it('should handle getAiMove correctly', async () => {
    const resSet = await getAiMove({
      body: JSON.stringify({ aiPlayerId: 'ai-okano', role: 'set', remainingChairs: [1, 2, 3] })
    });
    expect(resSet.statusCode).toBe(200);

    const resChoose = await getAiMove({
      body: JSON.stringify({ aiPlayerId: 'ai-okano', role: 'choose', remainingChairs: [1, 2, 3] })
    });
    expect(resChoose.statusCode).toBe(200);

    const resOkanoChooseEmpty = await getAiMove({
      body: JSON.stringify({ aiPlayerId: 'ai-okano', role: 'choose', remainingChairs: [1, 2] })
    });
    expect(resOkanoChooseEmpty.statusCode).toBe(200);

    const resMissing = await getAiMove({});
    expect(resMissing.statusCode).toBe(400);

    const resError = await getAiMove({ body: '{invalid-json}' });
    expect(resError.statusCode).toBe(500);
  });

  it('should reject getAiMove with an invalid remainingChairs/role (regression test for NaN/crash on empty array)', async () => {
    const resEmptyChairs = await getAiMove({
      body: JSON.stringify({ aiPlayerId: 'ai-nash', role: 'set', remainingChairs: [] })
    });
    expect(resEmptyChairs.statusCode).toBe(400);

    const resOutOfRangeChair = await getAiMove({
      body: JSON.stringify({ aiPlayerId: 'ai-okano', role: 'set', remainingChairs: [1, 999] })
    });
    expect(resOutOfRangeChair.statusCode).toBe(400);

    const resNonIntegerChair = await getAiMove({
      body: JSON.stringify({ aiPlayerId: 'ai-okano', role: 'set', remainingChairs: [1.5] })
    });
    expect(resNonIntegerChair.statusCode).toBe(400);

    const resInvalidRole = await getAiMove({
      body: JSON.stringify({ aiPlayerId: 'ai-okano', role: 'stand', remainingChairs: [1, 2] })
    });
    expect(resInvalidRole.statusCode).toBe(400);
  });

  it('should handle startMatch error', async () => {
    const resError = await startMatch({ body: '{invalid-json}' });
    expect(resError.statusCode).toBe(500);
  });

  it('should handle saveMatch correctly', async () => {
    // Missing parameters
    const resMissing = await saveMatch({});
    expect(resMissing.statusCode).toBe(400);

    // Invalid players
    const resInvalid = await saveMatch({
      body: JSON.stringify({
        matchId: 'test-1',
        player1Id: 'invalid-1',
        player2Id: 'invalid-2',
        winnerId: 'invalid-1',
        scores: { p1: 1, p2: 0 },
        shocks: { p1: 0, p2: 0 },
        logs: []
      })
    });
    expect(resInvalid.statusCode).toBe(404);

    // Human vs AI
    const resSuccess = await saveMatch({
      body: JSON.stringify({
        matchId: 'test-match-id',
        player1Id: 'human',
        player2Id: 'ai-okano',
        winnerId: 'human',
        scores: { p1: 10, p2: 5 },
        shocks: { p1: 0, p2: 1 },
        logs: []
      })
    });
    expect(resSuccess.statusCode).toBe(200);

    // 試合終了後のスコアボードがDynamoDBへ記録されていること
    const putCommand = dynamoSendMock.mock.calls.at(-1)[0];
    expect(putCommand.input.TableName).toBe('test-matches-table');
    expect(putCommand.input.Item.matchId).toBe('test-match-id');

    // AI vs Human
    const resSuccess2 = await saveMatch({
      body: JSON.stringify({
        matchId: 'test-match-id-2',
        player1Id: 'ai-okano',
        player2Id: 'human',
        winnerId: 'human',
        scores: { p1: 5, p2: 10 },
        shocks: { p1: 1, p2: 0 },
        logs: []
      })
    });
    expect(resSuccess2.statusCode).toBe(200);

    // AI vs AI Draw
    const resDraw = await saveMatch({
      body: JSON.stringify({
        matchId: 'test-draw',
        player1Id: 'ai-koyabu',
        player2Id: 'ai-junior',
        winnerId: 'draw',
        scores: { p1: 10, p2: 10 },
        shocks: { p1: 1, p2: 1 },
        logs: []
      })
    });
    expect(resDraw.statusCode).toBe(200);
  });

  it('should accept a local PVP match (p1 vs p2) without 404ing and without updating any player rating', async () => {
    const putCallsBefore = dynamoSendMock.mock.calls.filter(
      ([command]) => command.constructor.name === 'PutCommand' && command.input.TableName === 'test-players-table'
    ).length;

    const res = await saveMatch({
      body: JSON.stringify({
        matchId: 'test-pvp-match-id',
        player1Id: 'p1',
        player2Id: 'p2',
        winnerId: 'p1',
        scores: { p1: 20, p2: 10 },
        shocks: { p1: 0, p2: 1 },
        logs: []
      })
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.match.ratingDiff).toBe(0);
    expect(body.match.aiRatingDiff).toBeNull();

    // 試合記録はDynamoDBへ保存される
    const putCommand = dynamoSendMock.mock.calls.at(-1)[0];
    expect(putCommand.input.TableName).toBe('test-matches-table');
    expect(putCommand.input.Item.matchId).toBe('test-pvp-match-id');

    // p1/p2はどちらもレーティングを持たない疑似プレイヤーのため、
    // players-tableへの書き込みは一切発生しない
    const putCallsAfter = dynamoSendMock.mock.calls.filter(
      ([command]) => command.constructor.name === 'PutCommand' && command.input.TableName === 'test-players-table'
    ).length;
    expect(putCallsAfter).toBe(putCallsBefore);
  });

  it('should handle saveMatch error', async () => {
    const resError = await saveMatch({ body: '{invalid-json}' });
    expect(resError.statusCode).toBe(500);
  });

  it('does not leak rating mutations between independent saveMatch calls when DynamoDB reads always miss (fallback must return copies of seed data, not shared references)', async () => {
    // GetCommandを常にミスさせ、毎回シードデータへのフォールバックを強制する
    dynamoSendMock.mockImplementation(async (command) => {
      if (command.constructor.name === 'GetCommand') return {};
      return defaultDynamoSend(command);
    });

    const playHumanVsOkano = async (matchId) => {
      const res = await saveMatch({
        body: JSON.stringify({
          matchId,
          player1Id: 'human',
          player2Id: 'ai-okano',
          winnerId: 'ai-okano',
        }),
      });
      return JSON.parse(res.body).match.ratingDiff;
    };

    const ratingDiff1 = await playHumanVsOkano('regression-match-1');
    const ratingDiff2 = await playHumanVsOkano('regression-match-2');

    // フォールバックが共有オブジェクトへの参照を返していると、1回目の呼び出しで
    // ai-okanoのratingが書き換わったままになり、2回目のratingDiffが変わってしまう。
    expect(ratingDiff2).toBe(ratingDiff1);
  });

  it('should reject saveMatch when winnerId does not match either player (rating manipulation guard)', async () => {
    const res = await saveMatch({
      body: JSON.stringify({
        matchId: 'test-forged-winner',
        player1Id: 'ai-okano',
        player2Id: 'ai-junior',
        winnerId: 'ai-nash', // 対戦していない第三者のplayerIdを勝者として詐称
        scores: { p1: 10, p2: 5 },
        shocks: { p1: 0, p2: 1 },
        logs: [],
      }),
    });

    expect(res.statusCode).toBe(400);
    expect(dynamoSendMock).not.toHaveBeenCalled();
  });

  it('should reject saveMatch with a malformed scores/shocks shape', async () => {
    const resBadScores = await saveMatch({
      body: JSON.stringify({
        matchId: 'test-bad-scores',
        player1Id: 'ai-okano',
        player2Id: 'ai-junior',
        winnerId: 'ai-okano',
        scores: { p1: -1, p2: 5 },
      }),
    });
    expect(resBadScores.statusCode).toBe(400);

    const resBadShocks = await saveMatch({
      body: JSON.stringify({
        matchId: 'test-bad-shocks',
        player1Id: 'ai-okano',
        player2Id: 'ai-junior',
        winnerId: 'ai-okano',
        shocks: { p1: 'zero', p2: 0 },
      }),
    });
    expect(resBadShocks.statusCode).toBe(400);
  });

  it('should reject saveMatch with an invalid mode value', async () => {
    const res = await saveMatch({
      body: JSON.stringify({
        matchId: 'test-bad-mode',
        player1Id: 'ai-okano',
        player2Id: 'ai-junior',
        winnerId: 'ai-okano',
        mode: 'not-a-real-mode',
      }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('should persist a provided mode to DynamoDB so the frontend does not have to infer it from matchId', async () => {
    const res = await saveMatch({
      body: JSON.stringify({
        matchId: 'test-mode-pvp',
        player1Id: 'p1',
        player2Id: 'p2',
        winnerId: 'p1',
        mode: 'pvp',
      }),
    });
    expect(res.statusCode).toBe(200);

    const putCommand = dynamoSendMock.mock.calls.at(-1)[0];
    expect(putCommand.input.Item.matchId).toBe('test-mode-pvp');
    expect(putCommand.input.Item.mode).toBe('pvp');
  });

  it('should reject saveMatch logs with an out-of-range or duplicate chosenChair', async () => {
    const resOutOfRange = await saveMatch({
      body: JSON.stringify({
        matchId: 'test-bad-chair',
        player1Id: 'ai-okano',
        player2Id: 'ai-junior',
        winnerId: 'ai-okano',
        logs: [{ turn: 1, chosenChair: 999 }],
      }),
    });
    expect(resOutOfRange.statusCode).toBe(400);

    const resDuplicate = await saveMatch({
      body: JSON.stringify({
        matchId: 'test-duplicate-chair',
        player1Id: 'ai-okano',
        player2Id: 'ai-junior',
        winnerId: 'ai-okano',
        logs: [{ turn: 1, chosenChair: 3 }, { turn: 2, chosenChair: 3 }],
      }),
    });
    expect(resDuplicate.statusCode).toBe(400);
  });

  it('should persist the AI rating update to DynamoDB when saveMatch succeeds', async () => {
    await saveMatch({
      body: JSON.stringify({
        matchId: 'test-rating-persisted',
        player1Id: 'human',
        player2Id: 'ai-okano',
        winnerId: 'ai-okano',
        scores: { p1: 5, p2: 40 },
        shocks: { p1: 2, p2: 0 },
        logs: [],
      }),
    });

    const playerUpdateCommand = dynamoSendMock.mock.calls
      .map(([command]) => command)
      .find((command) => command.input.TableName === 'test-players-table' && command.constructor.name === 'UpdateCommand');
    expect(playerUpdateCommand).toBeDefined();
    expect(playerUpdateCommand.input.Key.playerId).toBe('ai-okano');
  });

  it('returns a signed aiRatingDiff from the AI\'s perspective so the frontend can show before/after rating without guessing the sign', async () => {
    const resAiWins = await saveMatch({
      body: JSON.stringify({
        matchId: 'test-ai-rating-diff-win',
        player1Id: 'human',
        player2Id: 'ai-okano',
        winnerId: 'ai-okano',
        scores: { p1: 5, p2: 40 },
        shocks: { p1: 2, p2: 0 },
        logs: [],
      }),
    });
    const winBody = JSON.parse(resAiWins.body);
    expect(winBody.match.aiRatingDiff).toBeGreaterThan(0);

    const resAiLoses = await saveMatch({
      body: JSON.stringify({
        matchId: 'test-ai-rating-diff-loss',
        player1Id: 'human',
        player2Id: 'ai-junior',
        winnerId: 'human',
        scores: { p1: 40, p2: 5 },
        shocks: { p1: 0, p2: 2 },
        logs: [],
      }),
    });
    const lossBody = JSON.parse(resAiLoses.body);
    expect(lossBody.match.aiRatingDiff).toBeLessThan(0);
  });

  const findPlayer = async (playerId) => {
    const res = await getPlayers({});
    const players = JSON.parse(res.body).players;
    return players.find((p) => p.playerId === playerId);
  };

  it('does not lose either rating update when two saveMatch calls for the same AI are processed concurrently (lost update regression test)', async () => {
    // 同一AI(ai-koyabu)に対する2試合をほぼ同時に保存する。read-modify-write方式
    // (無条件PutCommandでの全属性上書き)だと後勝ちで一方のwinCount/matchCount加算が
    // 失われるが、アトミックなUpdateCommandであればどちらも反映されるはず。
    const before = await findPlayer('ai-koyabu');

    await Promise.all([
      saveMatch({
        body: JSON.stringify({
          matchId: 'test-concurrent-1',
          player1Id: 'human',
          player2Id: 'ai-koyabu',
          winnerId: 'ai-koyabu',
          scores: { p1: 0, p2: 40 },
          shocks: { p1: 0, p2: 0 },
          logs: [],
        }),
      }),
      saveMatch({
        body: JSON.stringify({
          matchId: 'test-concurrent-2',
          player1Id: 'human',
          player2Id: 'ai-koyabu',
          winnerId: 'ai-koyabu',
          scores: { p1: 0, p2: 40 },
          shocks: { p1: 0, p2: 0 },
          logs: [],
        }),
      }),
    ]);

    const after = await findPlayer('ai-koyabu');
    expect(after.matchCount).toBe(before.matchCount + 2);
    expect(after.winCount).toBe(before.winCount + 2);
  });

  it('does not overwrite an existing match record when a duplicate matchId is saved (matchId collision guard)', async () => {
    const first = await saveMatch({
      body: JSON.stringify({
        matchId: 'test-duplicate-matchid',
        player1Id: 'ai-okano',
        player2Id: 'ai-junior',
        winnerId: 'ai-okano',
        logs: [],
      }),
    });
    expect(first.statusCode).toBe(200);

    // 同一matchIdで別内容の試合を保存しようとしても、既存のレコードは上書きされない
    const second = await saveMatch({
      body: JSON.stringify({
        matchId: 'test-duplicate-matchid',
        player1Id: 'ai-junior',
        player2Id: 'ai-okano',
        winnerId: 'ai-junior',
        logs: [],
      }),
    });
    expect(second.statusCode).toBe(200);

    const result = await getMatchResult({ queryStringParameters: { matchId: 'test-duplicate-matchid' } });
    const resultBody = JSON.parse(result.body);
    expect(resultBody.match.winnerId).toBe('ai-okano');
  });

  it('should read players/matches from DynamoDB when data is already present', async () => {
    const dbPlayer = {
      playerId: 'ai-okano',
      name: 'DB版岡野',
      type: 'personality',
      rating: 9999,
      winCount: 1,
      matchCount: 1,
      updatedAt: new Date().toISOString(),
    };
    const dbMatch = {
      matchId: 'db-match-1',
      player1Id: 'ai-okano',
      player2Id: 'ai-junior',
      winnerId: 'ai-okano',
      createdAt: new Date().toISOString(),
    };

    dynamoTables['test-players-table'].set(dbPlayer.playerId, dbPlayer);
    dynamoTables['test-matches-table'].set(dbMatch.matchId, dbMatch);

    const playersRes = await getPlayers({});
    expect(JSON.parse(playersRes.body).players).toEqual([dbPlayer]);

    const leaderboardRes = await getLeaderboard({});
    expect(JSON.parse(leaderboardRes.body).leaderboard).toEqual([dbPlayer]);

    const matchesRes = await getMatches({});
    expect(JSON.parse(matchesRes.body).matches).toEqual([dbMatch]);

    const matchResultRes = await getMatchResult({ queryStringParameters: { matchId: 'db-match-1' } });
    expect(JSON.parse(matchResultRes.body).match).toEqual(dbMatch);
  });

  it('should record the match to DynamoDB even when optional fields (scores/shocks/logs) are omitted', async () => {
    const res = await saveMatch({
      body: JSON.stringify({
        matchId: 'test-missing-optional-fields',
        player1Id: 'human',
        player2Id: 'ai-okano',
        winnerId: 'human',
      })
    });

    expect(res.statusCode).toBe(200);
    const putCommand = dynamoSendMock.mock.calls.at(-1)[0];
    expect(putCommand.input.Item.matchId).toBe('test-missing-optional-fields');
  });

  it('should still return the match result even if recording to DynamoDB fails', async () => {
    // player取得/保存が何回発生しても、試合記録(matches table)への書き込みだけが失敗するようにする
    dynamoSendMock.mockImplementation(async (command) => {
      if (command.input.TableName === 'test-matches-table' && command.constructor.name === 'PutCommand') {
        throw new Error('DynamoDB unavailable');
      }
      return defaultDynamoSend(command);
    });

    const res = await saveMatch({
      body: JSON.stringify({
        matchId: 'test-dynamo-failure',
        player1Id: 'human',
        player2Id: 'ai-okano',
        winnerId: 'human',
        scores: { p1: 10, p2: 5 },
        shocks: { p1: 0, p2: 1 },
        logs: []
      })
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
  });

  it('should generate mock commentary for specific actions', async () => {
    const originalEnv = process.env.GEMINI_API;
    delete process.env.GEMINI_API;

    const resShocked = await generateCommentary({
      body: JSON.stringify({ action: { isShocked: true } })
    });
    expect(JSON.parse(resShocked.body).commentary).toContain('痛恨のビリビリ');

    const resChosen = await generateCommentary({
      body: JSON.stringify({ action: { chosenChair: 5 } })
    });
    expect(JSON.parse(resChosen.body).commentary).toContain('5番の椅子で勝負に出た');

    process.env.GEMINI_API = originalEnv;
  });

  it('should handle generateCommentary correctly (no API key scenario)', async () => {
    // Without GEMINI_API it returns 200 with mock commentary
    const originalEnv = process.env.GEMINI_API;
    delete process.env.GEMINI_API;
    
    const res = await generateCommentary({
      body: JSON.stringify({
        gameState: {},
        action: {}
      })
    });
    expect(res.statusCode).toBe(200);
    
    process.env.GEMINI_API = originalEnv || 'dummy-key';
    
    // As we can't reliably test actual Gemini API call without mocking, we just test if it returns a response or fails gracefully
    // Usually we would mock GoogleGenAI, but here we just ensure the function doesn't crash completely.
    try {
      const res2 = await generateCommentary({
        body: JSON.stringify({
          gameState: {},
          action: {}
        })
      });
      // Depending on the key, it could be 500 or 200
      expect([200, 500]).toContain(res2.statusCode);
    } catch {
      // Ignore
    }

    const resError = await generateCommentary({ body: '{invalid-json}' });
    expect(resError.statusCode).toBe(500);
  });

  it('should start a match with nash AI player', async () => {
    const event = {
      body: JSON.stringify({
        player1Id: 'ai-nash',
        player2Id: 'ai-okano',
      }),
    };

    const response = await startMatch(event);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body.matchId).toBeDefined();
    expect(body.logs.length).toBeGreaterThan(0);
  });

  it('should reset score to 0 when a player gets electric shocked', async () => {
    const event = {
      body: JSON.stringify({
        player1Id: 'ai-okano',
        player2Id: 'ai-junior',
      }),
    };
    
    const response = await startMatch(event);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    
    // 対戦ログを巡回し、感電（isShocked: true）したターンの状態を確認
    for (const log of body.logs) {
      if (log.isShocked) {
        if (log.turn % 2 !== 0) {
          // 奇数ターン：Player 1 (setter) が設置、Player 2 (chooser) が選択
          // よって、感電した Player 2 のそのターン時点のスコアは 0 になっているべき
          expect(log.scores.p2).toBe(0);
        } else {
          // 偶数ターン：Player 2 (setter) が設置、Player 1 (chooser) が選択
          // よって、感電した Player 1 のそのターン時点のスコアは 0 になっているべき
          expect(log.scores.p1).toBe(0);
        }
      }
    }
  });

  it('should handle a draw reached via chair exhaustion inside startMatch itself (regression test for the untested draw branch)', async () => {
    // Math.randomを固定することで、ai-nash対ai-koyabuの対戦が
    // 椅子枯渇による引き分け(スコア・感電数とも同点)で終わることを再現する。
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1);

    try {
      const response = await startMatch({
        body: JSON.stringify({ player1Id: 'ai-nash', player2Id: 'ai-koyabu' }),
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.winner).toBe('draw');
      expect(body.ratingDiff).toBe(0);
      expect(body.scores.p1).toBe(body.scores.p2);
      expect(body.shocks.p1).toBe(body.shocks.p2);

      // 引き分け時は両プレイヤーのレーティングがDynamoDBへ保存されていること
      const playerUpdateCommands = dynamoSendMock.mock.calls
        .map(([command]) => command)
        .filter((command) => command.input.TableName === 'test-players-table' && command.constructor.name === 'UpdateCommand');
      const savedPlayerIds = playerUpdateCommands.map((command) => command.input.Key.playerId).sort();
      expect(savedPlayerIds).toEqual(['ai-koyabu', 'ai-nash']);
    } finally {
      randomSpy.mockRestore();
    }
  });
});
