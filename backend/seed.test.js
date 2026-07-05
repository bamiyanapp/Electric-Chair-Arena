import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';
import Module from 'module';

// handler.test.jsと同様、dynamoClient.jsのCJS requireをNodeのモジュールキャッシュ経由でモックする。
const requireFromHere = createRequire(import.meta.url);
const dynamoClientPath = requireFromHere.resolve('./dynamoClient.js');

const dynamoSendMock = vi.fn().mockResolvedValue({});

const fakeDynamoClientModule = new Module(dynamoClientPath);
fakeDynamoClientModule.exports = {
  docClient: { send: dynamoSendMock },
  MATCHES_TABLE: 'test-matches-table',
  PLAYERS_TABLE: 'test-players-table',
};
Module._cache[dynamoClientPath] = fakeDynamoClientModule;

const { seed, seedItem } = await import('./seed.js');
const { initialPlayers, initialMatches } = await import('./seedData.js');

describe('seed script', () => {
  beforeEach(() => {
    dynamoSendMock.mockClear();
  });

  it('seeds every initial player and match with a conditional PutCommand', async () => {
    await seed();

    const playerCalls = dynamoSendMock.mock.calls
      .map(([command]) => command)
      .filter((command) => command.input.TableName === 'test-players-table');
    const matchCalls = dynamoSendMock.mock.calls
      .map(([command]) => command)
      .filter((command) => command.input.TableName === 'test-matches-table');

    expect(playerCalls).toHaveLength(initialPlayers.length);
    expect(matchCalls).toHaveLength(initialMatches.length);
    expect(playerCalls[0].input.ConditionExpression).toBe('attribute_not_exists(playerId)');
    expect(matchCalls[0].input.ConditionExpression).toBe('attribute_not_exists(matchId)');
  });

  it('skips an item that already exists without throwing', async () => {
    const conditionalError = Object.assign(new Error('exists'), { name: 'ConditionalCheckFailedException' });
    dynamoSendMock.mockRejectedValueOnce(conditionalError);

    await expect(seedItem('test-players-table', initialPlayers[0], 'playerId')).resolves.toBeUndefined();
  });

  it('logs (but does not throw) when a non-conditional error occurs', async () => {
    dynamoSendMock.mockRejectedValueOnce(new Error('DynamoDB unavailable'));

    await expect(seedItem('test-players-table', initialPlayers[0], 'playerId')).resolves.toBeUndefined();
  });
});
