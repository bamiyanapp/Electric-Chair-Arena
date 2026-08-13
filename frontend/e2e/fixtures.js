import { test as base, expect } from '@playwright/test';
import { addCoverageReport } from 'monocart-reporter';

// Chromium(CDP)のJS/CSSカバレッジを各テストで自動収集し、monocart-reporterへ
// 添付する。frontend-testジョブ（vitest）のcoverage/coverage-summary.jsonと
// 同じ形式でE2E側のカバレッジも出力するための仕組み（reusable-ci.ymlの
// frontend-e2e-testジョブが同じcheck-coverage-thresholdアクションで読む）。
export const test = base.extend({
  autoTestFixture: [
    async ({ page, browserName }, use, testInfo) => {
      const isChromium = browserName === 'chromium';
      if (isChromium) {
        await Promise.all([
          page.coverage.startJSCoverage({ resetOnNavigation: false }),
          page.coverage.startCSSCoverage({ resetOnNavigation: false }),
        ]);
      }

      await use();

      if (isChromium) {
        const [jsCoverage, cssCoverage] = await Promise.all([
          page.coverage.stopJSCoverage(),
          page.coverage.stopCSSCoverage(),
        ]);
        await addCoverageReport([...jsCoverage, ...cssCoverage], testInfo);
      }
    },
    { scope: 'test', auto: true },
  ],
});

export { expect };
