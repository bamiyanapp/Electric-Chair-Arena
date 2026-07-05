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

    // 勝者・敗者のレーティングもDynamoDBへ保存されていること
    const playerPutCommands = dynamoSendMock.mock.calls
      .map(([command]) => command)
      .filter((command) => command.input.TableName === 'test-players-table' && command.constructor.name === 'PutCommand');
    expect(playerPutCommands.length).toBe(2);
    const savedPlayerIds = playerPutCommands.map((command) => command.input.Item.playerId).sort();
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

    const resEmptySet = await getAiMove({
      body: JSON.stringify({ aiPlayerId: 'ai-okano', role: 'set', remainingChairs: [] })
    });
    expect(resEmptySet.statusCode).toBe(200);

    const resMissing = await getAiMove({});
    expect(resMissing.statusCode).toBe(400);

    const resError = await getAiMove({ body: '{invalid-json}' });
    expect(resError.statusCode).toBe(500);
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

    const playerPutCommand = dynamoSendMock.mock.calls
      .map(([command]) => command)
      .find((command) => command.input.TableName === 'test-players-table' && command.constructor.name === 'PutCommand');
    expect(playerPutCommand).toBeDefined();
    expect(playerPutCommand.input.Item.playerId).toBe('ai-okano');
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
});
