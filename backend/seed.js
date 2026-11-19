'use strict';

const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, MATCHES_TABLE, PLAYERS_TABLE } = require('./dynamoClient.js');
const { initialPlayers, initialMatches } = require('./seedData.js');

// 既に存在するアイテムは上書きしない（ConditionExpressionでプレイヤーの育成済みレーティング等を保護する）。
// 戻り値: 投入または既存のためスキップならtrue、想定外のエラーで失敗したらfalse。
async function seedItem(tableName, item, keyName) {
  try {
    await docClient.send(new PutCommand({
      TableName: tableName,
      Item: item,
      ConditionExpression: `attribute_not_exists(${keyName})`,
    }));
    console.log(`  + seeded ${tableName}/${item[keyName]}`);
    return true;
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      console.log(`  = ${tableName}/${item[keyName]} already exists, skipping`);
      return true;
    }
    console.error(`  ! failed to seed ${tableName}/${item[keyName]}:`, error.message);
    return false;
  }
}

async function seed() {
  console.log('🌱 Seeding DynamoDB tables...');

  let failed = 0;
  for (const player of initialPlayers) {
    if (!(await seedItem(PLAYERS_TABLE, player, 'playerId'))) failed += 1;
  }

  for (const match of initialMatches) {
    if (!(await seedItem(MATCHES_TABLE, match, 'matchId'))) failed += 1;
  }

  // 失敗を握りつぶすとCDが成功扱いになり、シード未投入に気づけない（#518）
  if (failed > 0) {
    throw new Error(`Seeding failed for ${failed} item(s).`);
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
