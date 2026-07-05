'use strict';

const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, MATCHES_TABLE, PLAYERS_TABLE } = require('./dynamoClient.js');
const { initialPlayers, initialMatches } = require('./seedData.js');

// 既に存在するアイテムは上書きしない（ConditionExpressionでプレイヤーの育成済みレーティング等を保護する）。
async function seedItem(tableName, item, keyName) {
  try {
    await docClient.send(new PutCommand({
      TableName: tableName,
      Item: item,
      ConditionExpression: `attribute_not_exists(${keyName})`,
    }));
    console.log(`  + seeded ${tableName}/${item[keyName]}`);
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      console.log(`  = ${tableName}/${item[keyName]} already exists, skipping`);
    } else {
      console.error(`  ! failed to seed ${tableName}/${item[keyName]}:`, error.message);
    }
  }
}

async function seed() {
  console.log('🌱 Seeding DynamoDB tables...');

  for (const player of initialPlayers) {
    await seedItem(PLAYERS_TABLE, player, 'playerId');
  }

  for (const match of initialMatches) {
    await seedItem(MATCHES_TABLE, match, 'matchId');
  }

  console.log('🌱 Seeding completed.');
}

module.exports = { seed, seedItem };

if (require.main === module) {
  seed().catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  });
}
