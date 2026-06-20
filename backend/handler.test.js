import { describe, it, expect } from 'vitest';
import { getPlayers, getMatches, simulateMatch } from './handler.js';

describe('Backend Handler Tests', () => {
  it('should get players list sorted by rating', async () => {
    const response = await getPlayers({});
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.players).toBeInstanceOf(Array);
    expect(body.players.length).toBeGreaterThan(0);
    
    // rating の降順になっていること
    const ratings = body.players.map(p => p.rating);
    const sortedRatings = [...ratings].sort((a, b) => b - a);
    expect(ratings).toEqual(sortedRatings);
  });

  it('should get empty matches initially', async () => {
    const response = await getMatches({});
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.matches).toBeInstanceOf(Array);
  });

  it('should simulate a match successfully', async () => {
    const event = {
      body: JSON.stringify({
        player1Id: 'ai-random',
        player2Id: 'ai-smart',
      }),
    };
    const response = await simulateMatch(event);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    
    expect(body.id).toBeDefined();
    expect(body.player1.id).toBe('ai-random');
    expect(body.player2.id).toBe('ai-smart');
    expect(body.winner).toBeDefined();
    expect(body.log).toBeInstanceOf(Array);
    expect(body.log.length).toBeGreaterThan(0);
    
    // マッチ履歴が更新されていることを確認
    const matchesResponse = await getMatches({});
    const matchesBody = JSON.parse(matchesResponse.body);
    expect(matchesBody.matches.length).toBe(1);
    expect(matchesBody.matches[0].id).toBe(body.id);
  });
});
