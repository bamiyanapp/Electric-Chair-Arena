import { test, expect } from './fixtures.js';
import { captureScreenshot } from './screenshot.js';

test.describe('ロビー画面', () => {
  test('タイトルとモード選択ボタンが表示される', async ({ page }, testInfo) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Electric Chair Arena' })).toBeVisible();
    await expect(page.getByRole('button', { name: /人間対AI/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /人対人 \(ローカル\)/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ランキング' })).toBeVisible();
    await expect(page.getByRole('button', { name: '過去のスコアボード一覧' })).toBeVisible();

    await captureScreenshot(page, 'lobby', { caption: 'ロビー画面', testInfo });
  });

  test('ルール説明モーダルの開閉ができる', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /ルール説明/ }).click();
    await expect(page.getByText(GAME_RULE_TEXT)).toBeVisible();

    await page.getByRole('button', { name: '閉じる' }).first().click();
    await expect(page.getByText(GAME_RULE_TEXT)).toHaveCount(0);
  });
});

const GAME_RULE_TEXT = /脚の椅子が円形に並んでいます/;
