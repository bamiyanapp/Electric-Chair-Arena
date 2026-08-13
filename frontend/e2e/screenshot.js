/* global process */

import fs from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join(process.cwd(), 'e2e-screenshots');

// reusable-ci.ymlのfrontend-e2e-testジョブが読む規約に合わせ、PNGと
// 付随するcaption/spec/titleのテキストファイルを書き出す
// （Job Summary/PRコメントへスクリーンショットを画像として直接埋め込むため。
// スマートフォンのGitHubアプリからも閲覧できるようにする対応）。
export async function captureScreenshot(page, name, { caption, testInfo } = {}) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`) });
  if (caption) {
    fs.writeFileSync(path.join(SCREENSHOT_DIR, `${name}.caption.txt`), caption);
  }
  if (testInfo) {
    fs.writeFileSync(path.join(SCREENSHOT_DIR, `${name}.spec.txt`), path.basename(testInfo.file));
    fs.writeFileSync(path.join(SCREENSHOT_DIR, `${name}.title.txt`), testInfo.title);
  }
}
