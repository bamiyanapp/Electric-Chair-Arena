import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';

const requireFromHere = createRequire(import.meta.url);
const modulePath = requireFromHere.resolve('./dynamoClient.js');

describe('dynamoClient', () => {
  afterEach(() => {
    delete requireFromHere.cache[modulePath];
    delete process.env.IS_OFFLINE;
    delete process.env.MATCHES_TABLE;
    delete process.env.PLAYERS_TABLE;
  });

  it('builds a working client with default table names when IS_OFFLINE is not set', () => {
    delete process.env.IS_OFFLINE;
    const { docClient, MATCHES_TABLE, PLAYERS_TABLE } = requireFromHere(modulePath);

    expect(docClient).toBeDefined();
    expect(MATCHES_TABLE).toBe('electric-chair-arena-backend-matches-dev');
    expect(PLAYERS_TABLE).toBe('electric-chair-arena-backend-players-dev');
  });

  it('builds a working client pointed at the local DynamoDB endpoint when IS_OFFLINE=true', async () => {
    process.env.IS_OFFLINE = 'true';
    delete requireFromHere.cache[modulePath];
    const { docClient } = requireFromHere(modulePath);

    expect(docClient).toBeDefined();
    const region = await docClient.config.region();
    const endpoint = await docClient.config.endpoint();
    expect(region).toBe('localhost');
    expect(endpoint.hostname).toBe('localhost');
    expect(endpoint.port).toBe(8000);
  });

  it('honors MATCHES_TABLE/PLAYERS_TABLE environment overrides', () => {
    process.env.MATCHES_TABLE = 'custom-matches-table';
    process.env.PLAYERS_TABLE = 'custom-players-table';
    delete requireFromHere.cache[modulePath];
    const { MATCHES_TABLE, PLAYERS_TABLE } = requireFromHere(modulePath);

    expect(MATCHES_TABLE).toBe('custom-matches-table');
    expect(PLAYERS_TABLE).toBe('custom-players-table');
  });
});
