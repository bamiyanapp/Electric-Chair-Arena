import { test, expect } from './fixtures.js';
import { captureScreenshot } from './screenshot.js';

// モバイル幅での崩れを、人間が実機確認しなくてもJob Summary/PRコメントの
// スクリーンショットで確認できるようにする（このプロジェクトの開発環境は
// スマートフォンのみで運用されているため）。mobile-chromiumプロジェクト
// （Pixel 7相当のビューポート）でのみ実行する。
test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || !isMobile, 'mobile-chromiumプロジェクトでのみ実行');

test('モバイル幅でロビー・対戦相手選択・椅子盤面が崩れず表示される', async ({ page }, testInfo) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Electric Chair Arena' })).toBeVisible();
  await captureScreenshot(page, 'mobile-lobby', { caption: 'ロビー画面(モバイル幅)', testInfo });

  await page.getByRole('button', { name: /人間対AI/ }).click();
  await expect(page.getByText('対戦相手 (AI)')).toBeVisible();
  await captureScreenshot(page, 'mobile-opponent-select', { caption: '対戦相手(AI)選択画面(モバイル幅)', testInfo });

  await page.getByRole('button', { name: '対戦開始' }).click();
  await expect(page.getByRole('button', { name: /^椅子\d+番$/ }).first()).toBeVisible();
  await captureScreenshot(page, 'mobile-chair-board', { caption: '椅子盤面(モバイル幅)', testInfo });
});
