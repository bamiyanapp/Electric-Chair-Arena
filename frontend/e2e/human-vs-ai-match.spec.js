import { test, expect } from './fixtures.js';
import { captureScreenshot } from './screenshot.js';

// 対戦は椅子が残り1脚になるまで最大12ターン程度続く可能性があり、
// 1ターンごとに実時間の演出待ち（AIの着手・結果表示、各1.5秒）が入るため、
// デフォルトタイムアウトでは足りない。
test.describe.configure({ timeout: 120_000 });

test('ロビー→AIモデル選択→対戦→結果画面まで一連の流れを完走できる', async ({ page }, testInfo) => {
  await page.goto('/');

  await page.getByRole('button', { name: /人間対AI/ }).click();
  await expect(page.getByRole('heading', { name: '人間対AI モード' })).toBeVisible();

  await expect(page.getByText('対戦相手 (AI)')).toBeVisible();
  await expect(page.locator('select')).toBeVisible();
  await captureScreenshot(page, 'opponent-select', { caption: '対戦相手(AI)選択画面', testInfo });

  await page.getByRole('button', { name: '対戦開始' }).click();

  const resultHeading = page.getByRole('heading', { name: '対戦結果' });
  const nextTurnButton = page.getByRole('button', { name: /次のターンへ|最終結果を見る/ });

  // 1ターンごとに「利用可能な椅子をクリック→結果演出を待つ→次のターンへ」を
  // 繰り返し、結果画面に到達するまで進める。椅子は最大12脚のため安全に
  // 上限を設けたループにする。
  for (let turn = 0; turn < 15; turn += 1) {
    if (await resultHeading.isVisible().catch(() => false)) {
      break;
    }

    const availableChair = page.getByRole('button', { name: /^椅子\d+番$/ }).first();
    await availableChair.click();

    await nextTurnButton.waitFor({ state: 'visible', timeout: 10_000 });
    if (turn === 0) {
      await captureScreenshot(page, 'match-in-progress', { caption: '対戦中の椅子盤面', testInfo });
    }
    await nextTurnButton.click();
  }

  await expect(resultHeading).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('heading', { name: /WINNER|DRAW/ })).toBeVisible();
  await captureScreenshot(page, 'match-result', { caption: '対戦結果画面', testInfo });

  await page.getByRole('button', { name: 'ロビーへ戻る' }).first().click();
  await expect(page.getByRole('heading', { name: 'Electric Chair Arena' })).toBeVisible();
});
