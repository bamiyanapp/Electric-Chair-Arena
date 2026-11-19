import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';

// コードが使うDynamoDBコマンドに対応するIAM Actionが、serverless.ymlの
// 実行ロールに含まれることを検証する。単体テストはDynamoDBをモックするため、
// 権限不足(例: UpdateItemの欠落)は他のテストでは検知できない(#517)。
// dev-standardsに同種の機械検知が入った場合は、そちらへ置き換える。
const COMMAND_TO_ACTIONS = {
  GetCommand: ['dynamodb:GetItem'],
  PutCommand: ['dynamodb:PutItem'],
  UpdateCommand: ['dynamodb:UpdateItem'],
  ScanCommand: ['dynamodb:Scan'],
  QueryCommand: ['dynamodb:Query'],
  DeleteCommand: ['dynamodb:DeleteItem'],
  // トランザクションは内包する操作のActionが必要になる
  TransactWriteCommand: ['dynamodb:PutItem', 'dynamodb:UpdateItem'],
};

const sourceFiles = readdirSync(new URL('.', import.meta.url))
  .filter((f) => f.endsWith('.js'))
  .filter((f) => !f.endsWith('.test.js') && !['seed.js', 'benchmark.js', 'vitest.config.js'].includes(f));

function usedCommands() {
  const used = new Set();
  for (const file of sourceFiles) {
    const text = readFileSync(new URL(file, import.meta.url), 'utf-8');
    for (const m of text.matchAll(/new (\w+Command)\(/g)) used.add(m[1]);
  }
  return used;
}

const yml = readFileSync(new URL('./serverless.yml', import.meta.url), 'utf-8');

describe('serverless.yml IAM statements', () => {
  it('detects at least one DynamoDB command in the source (guards against a vacuous test)', () => {
    expect(usedCommands().size).toBeGreaterThan(0);
  });

  it('every DynamoDB command used by the backend has a mapping in this test', () => {
    for (const command of usedCommands()) {
      expect(Object.keys(COMMAND_TO_ACTIONS), `${command} の対応表が未定義`).toContain(command);
    }
  });

  it('grants the IAM action for every DynamoDB command used by the backend', () => {
    for (const command of usedCommands()) {
      for (const action of COMMAND_TO_ACTIONS[command] ?? []) {
        expect(yml, `${command} には ${action} が必要`).toContain(`- ${action}`);
      }
    }
  });
});
