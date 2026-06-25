import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import Module from 'module';

// このNode/Vitestの組み合わせでは、handler.js内部のrequire('@google/genai')を
// vi.mockでインターセプトできない(handler.js自身がCJSのrequireで読み込むため、
// テストファイル側のESM importとは別のモジュールインスタンスを参照してしまう)。
// そのため、handler.jsを読み込む前にNodeのrequireキャッシュへ
// 直接モックを差し込む。handler.js自体は1回だけ通常通り読み込むため、
// カバレッジ計測への影響もない。
const requireFromHere = createRequire(import.meta.url);
const genaiPath = requireFromHere.resolve('@google/genai');

let currentGenerateContent = async () => ({ text: '' });

class FakeGoogleGenAI {
  constructor() {
    this.models = { generateContent: (...args) => currentGenerateContent(...args) };
  }
}

const fakeModule = new Module(genaiPath);
fakeModule.exports = { GoogleGenAI: FakeGoogleGenAI };
Module._cache[genaiPath] = fakeModule;

const { generateCommentary } = await import('./handler.js');

beforeEach(() => {
  currentGenerateContent = async () => ({ text: '' });
});

describe('generateCommentary with a mocked Gemini client', () => {
  it('returns the Gemini response text when the API call succeeds', async () => {
    currentGenerateContent = async () => ({ text: '「すごい試合になっています！」' });

    const originalEnv = process.env.GEMINI_API;
    process.env.GEMINI_API = 'dummy-key';

    const res = await generateCommentary({
      body: JSON.stringify({ gameState: {}, action: { chosenChair: 3 } })
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).commentary).toBe('「すごい試合になっています！」');

    process.env.GEMINI_API = originalEnv;
  });

  it('falls back to mock commentary when Gemini returns no text (e.g. safety-filtered)', async () => {
    currentGenerateContent = async () => ({ text: '' });

    const originalEnv = process.env.GEMINI_API;
    process.env.GEMINI_API = 'dummy-key';

    const res = await generateCommentary({
      body: JSON.stringify({ gameState: {}, action: { isShocked: true } })
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).commentary).toContain('痛恨のビリビリ');

    process.env.GEMINI_API = originalEnv;
  });

  it('falls back to mock commentary when the Gemini call throws', async () => {
    currentGenerateContent = async () => { throw new Error('network error'); };

    const originalEnv = process.env.GEMINI_API;
    process.env.GEMINI_API = 'dummy-key';

    const res = await generateCommentary({
      body: JSON.stringify({ gameState: {}, action: {} })
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).commentary).toContain('熱い戦いが続いています');

    process.env.GEMINI_API = originalEnv;
  });
});
