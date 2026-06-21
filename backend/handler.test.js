import { describe, it, expect } from 'vitest';
import { getPlayers, startMatch, getMatchResult, getLeaderboard, getMatches } from './handler.js';

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
