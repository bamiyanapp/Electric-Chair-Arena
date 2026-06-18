/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Home, { judgeHankoAngle } from './page';
import React from 'react';

// window オブジェクトのモック
const mockPushState = vi.fn();
const mockLocation = {
  pathname: '/test',
  search: '',
};

global.window = {
  location: mockLocation,
  history: {
    pushState: mockPushState,
  },
} as any;

// グローバルな状態管理（テストごとに初期化）
let stateValues: any[] = [];
let stateSetters: any[] = [];
let useStateCallCount = 0;
let registeredEffects: (() => void)[] = [];

// useState & useEffect のカスタムモック
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useState: (initialValue: any) => {
      const index = useStateCallCount;
      useStateCallCount++;

      // 初期値の格納
      if (stateValues[index] === undefined) {
        stateValues[index] = initialValue;
      }

      const setter = (newValue: any) => {
        if (typeof newValue === 'function') {
          stateValues[index] = newValue(stateValues[index]);
        } else {
          stateValues[index] = newValue;
        }
        stateSetters[index](newValue);
      };

      return [stateValues[index], setter];
    },
    useEffect: (callback: () => void) => {
      registeredEffects.push(callback);
    },
  };
});

// ReactElementツリーを再帰的に走査して、指定した条件に合う要素を探すヘルパー
function findType(element: any, type: string): any {
  if (!element) return undefined;
  if (element.type === type) return element;
  if (element.props && element.props.children) {
    if (Array.isArray(element.props.children)) {
      for (const child of element.props.children) {
        const found = findType(child, type);
        if (found) return found;
      }
    } else {
      return findType(element.props.children, type);
    }
  }
  return undefined;
}

// 要素内のすべてのテキストを取得するヘルパー
function getElementText(element: any): string {
  if (!element) return '';
  if (typeof element === 'string') return element;
  if (typeof element === 'number') return String(element);
  if (Array.isArray(element)) return element.map(getElementText).join('');
  if (element.props && element.props.children) {
    return getElementText(element.props.children);
  }
  return '';
}

// テキスト内容から要素を探すヘルパー
function findByText(element: any, text: string): any {
  if (!element) return undefined;
  if (typeof element === 'string' || typeof element === 'number') return undefined;

  const elementText = getElementText(element);
  if (elementText.includes(text)) {
    // まずは子要素にマッチするReact要素があるか探す
    if (element.props && element.props.children) {
      if (Array.isArray(element.props.children)) {
        for (const child of element.props.children) {
          const found = findByText(child, text);
          if (found) return found;
        }
      } else {
        const found = findByText(element.props.children, text);
        if (found) return found;
      }
    }
    // 子要素にマッチするReact要素がなければ、自分自身を返す
    return element;
  }
  return undefined;
}

describe('Home Component Integration', () => {
  beforeEach(() => {
    useStateCallCount = 0;
    stateValues = [];
    stateSetters = [
      vi.fn(), // isStarted
      vi.fn(), // angle
      vi.fn(), // judged
      vi.fn(), // resultMessage
      vi.fn(), // isPassed
    ];
    registeredEffects = [];
    mockLocation.search = '';
    mockPushState.mockClear();
  });

  it('should render initial state and check transitions', () => {
    // 1. 初期レンダリング
    useStateCallCount = 0;
    const result = Home() as React.ReactElement;
    expect(result.type).toBe('main');

    // 「検定を開始する」ボタンがあることを確認
    const startButton = findByText(result, '検定を開始する');
    expect(startButton).toBeDefined();

    // 2. handleStartの実行
    startButton.props.onClick();
    expect(stateSetters[0]).toHaveBeenCalledWith(true); // setIsStarted(true)
    expect(stateSetters[1]).toHaveBeenCalledWith(0);    // setAngle(0)
    expect(stateSetters[2]).toHaveBeenCalledWith(false); // setJudged(false)
  });

  it('should restore state from URL params in useEffect', () => {
    // URLパラメータがある状態をシミュレート
    mockLocation.search = '?started=true&angle=-20&judged=true';
    useStateCallCount = 0;
    Home();

    // 登録されたuseEffectをすべて実行する
    registeredEffects.forEach((effect) => effect());

    expect(stateSetters[0]).toHaveBeenCalledWith(true); // setIsStarted(true)
    expect(stateSetters[1]).toHaveBeenCalledWith(-20);  // setAngle(-20)
    expect(stateSetters[2]).toHaveBeenCalledWith(true);  // setJudged(true)
  });

  it('should render game state when isStarted is true', () => {
    // isStarted=true, angle=-20, judged=false の状態をセット
    stateValues = [true, -20, false, '', false];

    useStateCallCount = 0;
    const result = Home() as React.ReactElement;

    // ミッションの説明などがあることを確認
    const mission = findByText(result, '稟議書（パソコン購入申請）に捺印しなさい。');
    expect(mission).toBeDefined();

    // スライダーの変更テスト
    const input = findType(result, 'input');
    expect(input).toBeDefined();
    input.props.onChange({ target: { value: '-25' } });
    expect(stateSetters[1]).toHaveBeenCalledWith(-25); // setAngle(-25)

    // 「これで捺印を申請する」ボタンのテスト
    const judgeButton = findByText(result, 'これで捺印を申請する');
    expect(judgeButton).toBeDefined();
    judgeButton.props.onClick();
    expect(stateSetters[2]).toHaveBeenCalledWith(true); // setJudged(true)
  });

  it('should render result state when judged is true', () => {
    // isStarted=true, angle=-20, judged=true, resultMessage='🎉 合格！', isPassed=true の状態をセット
    stateValues = [true, -20, true, '【合格】...', true];

    useStateCallCount = 0;
    const result = Home() as React.ReactElement;

    // 合格表示
    const passedText = findByText(result, '🎉 合格！');
    expect(passedText).toBeDefined();

    // 「もう一度調整する」ボタンのテスト
    const resetButton = findByText(result, 'もう一度調整する');
    expect(resetButton).toBeDefined();
    resetButton.props.onClick();
    expect(stateSetters[1]).toHaveBeenCalledWith(0); // setAngle(0)
    expect(stateSetters[2]).toHaveBeenCalledWith(false); // setJudged(false)

    // 「メイン画面へ戻る」ボタンのテスト
    const backButton = findByText(result, 'メイン画面へ戻る');
    expect(backButton).toBeDefined();
    backButton.props.onClick();
    expect(stateSetters[0]).toHaveBeenCalledWith(false); // setIsStarted(false)
  });

  it('should render result state when judged is true and isPassed is false', () => {
    // isStarted=true, angle=0, judged=true, resultMessage='【差し戻し】...', isPassed=false の状態をセット
    stateValues = [true, 0, true, '【差し戻し】...', false];

    useStateCallCount = 0;
    const result = Home() as React.ReactElement;

    // 差し戻し表示
    const failedText = findByText(result, '❌ 差し戻し！');
    expect(failedText).toBeDefined();
  });

  it('should trigger updateUrl in handleBackToTop on the page header', () => {
    stateValues = [true, -20, false, '', false];
    useStateCallCount = 0;
    const result = Home() as React.ReactElement;

    const backButton = findByText(result, '戻る');
    expect(backButton).toBeDefined();
    backButton.props.onClick();
    expect(stateSetters[0]).toHaveBeenCalledWith(false);
  });
});

describe('judgeHankoAngle', () => {
  it('should return isPassed true and pass message for ideal angle (e.g. -20)', () => {
    const result = judgeHankoAngle(-20);
    expect(result.isPassed).toBe(true);
    expect(result.message).toContain('合格');
  });

  it('should return isPassed false and straight message for 0 angle', () => {
    const result = judgeHankoAngle(0);
    expect(result.isPassed).toBe(false);
    expect(result.message).toContain('直立不動');
  });

  it('should return isPassed false and backward message for positive angle (e.g. 10)', () => {
    const result = judgeHankoAngle(10);
    expect(result.isPassed).toBe(false);
    expect(result.message).toContain('のけぞっている');
  });

  it('should return isPassed false and over-angled message for deep negative angle (e.g. -50)', () => {
    const result = judgeHankoAngle(-50);
    expect(result.isPassed).toBe(false);
    expect(result.message).toContain('傾けすぎ');
  });
});
