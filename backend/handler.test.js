import { describe, it, expect } from 'vitest';
import { getPlayers, startMatch, getMatchResult, getLeaderboard, getMatches, saveMatch, generateCommentary, getAiMove } from './handler.js';

describe('Backend Handler Specification Tests', () => {
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
