'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const isOffline = process.env.IS_OFFLINE === 'true';

const client = new DynamoDBClient(
  isOffline
    ? {
        region: 'localhost',
        endpoint: 'http://localhost:8000',
        credentials: { accessKeyId: 'DEFAULT_ACCESS_KEY', secretAccessKey: 'DEFAULT_SECRET' },
      }
    : {}
);

module.exports.docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});
module.exports.MATCHES_TABLE = process.env.MATCHES_TABLE || 'electric-chair-arena-backend-matches-dev';
module.exports.PLAYERS_TABLE = process.env.PLAYERS_TABLE || 'electric-chair-arena-backend-players-dev';
