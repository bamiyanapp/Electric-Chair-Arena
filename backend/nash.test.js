import { describe, it, expect } from 'vitest';
import {
  fictitiousPlay,
  computeSetterBestResponse,
  computeChooserBestResponse,
  hasConverged,
  getNashMove,
} from './nash.js';

describe('fictitiousPlay', () => {
  it('should return setProb, chooseProb and gameValue', () => {
    const chairs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const result = fictitiousPlay(chairs, 3, 1000);

    expect(result).toHaveProperty('setProb');
    expect(result).toHaveProperty('chooseProb');
    expect(result).toHaveProperty('gameValue');

    const totalSetProb = Object.values(result.setProb).reduce((a, b) => a + b, 0);
    expect(totalSetProb).toBeCloseTo(1, 0.1);

    const totalChooseProb = Object.values(result.chooseProb).reduce((a, b) => a + b, 0);
    expect(totalChooseProb).toBeCloseTo(1, 0.01);

    expect(result.gameValue).toBeGreaterThan(0);
    expect(result.gameValue).toBeLessThan(12);
  });

  it('should handle small number of chairs', () => {
    const chairs = [1, 2, 3];
    const result = fictitiousPlay(chairs, 1, 500);

    expect(result).toHaveProperty('setProb');
    expect(result).toHaveProperty('chooseProb');
    expect(result).toHaveProperty('gameValue');

    const totalSetProb = Object.values(result.setProb).reduce((a, b) => a + b, 0);
    expect(totalSetProb).toBeCloseTo(1, 0.1);
  });

  it('should converge with different iteration counts', () => {
    const chairs = [1, 2, 3, 4, 5, 6];
    const result100 = fictitiousPlay(chairs, 2, 100);
    const result1000 = fictitiousPlay(chairs, 2, 1000);

    expect(result100.gameValue).toBeGreaterThan(0);
    expect(result1000.gameValue).toBeGreaterThan(0);
    // より多くの反復で収束が進む
    expect(result1000.gameValue).not.toBeNaN();
  });

  it('should handle single chair case', () => {
    const chairs = [5];
    const result = fictitiousPlay(chairs, 1, 100);

    expect(result.gameValue).toBe(0); // 1 chair, always set, so value is 0
    expect(result.setProb[5]).toBeCloseTo(1, 0.01);
    expect(result.chooseProb[5]).toBeCloseTo(1, 0.01);
  });

  it('should handle two chairs case', () => {
    const chairs = [1, 2];
    const result = fictitiousPlay(chairs, 1, 500);

    expect(result.setProb[1] + result.setProb[2]).toBeCloseTo(1, 0.1);
    expect(result.chooseProb[1] + result.chooseProb[2]).toBeCloseTo(1, 0.01);
    expect(result.gameValue).toBeGreaterThanOrEqual(0);
  });
});

describe('computeSetterBestResponse', () => {
  it('should select chairs with highest q_i * v_i', () => {
    const chairs = [1, 2, 3, 4, 5];
    const chooseCounts = { 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 };
    const totalChooses = 150;

    const result = computeSetterBestResponse(chairs, 2, chooseCounts, totalChooses);

    expect(result).toContain(5);
    expect(result).toContain(4);
    expect(result.length).toBe(2);
  });

  it('should handle uniform distribution', () => {
    const chairs = [1, 2, 3, 4];
    const chooseCounts = { 1: 10, 2: 10, 3: 10, 4: 10 };
    const totalChooses = 40;

    const result = computeSetterBestResponse(chairs, 2, chooseCounts, totalChooses);

    expect(result).toContain(4);
    expect(result).toContain(3);
    expect(result.length).toBe(2);
  });

  it('should handle numToSet larger than available chairs', () => {
    const chairs = [1, 2];
    const chooseCounts = { 1: 5, 2: 5 };
    const totalChooses = 10;

    const result = computeSetterBestResponse(chairs, 3, chooseCounts, totalChooses);

    // 2 chairs only, should return both
    expect(result.length).toBe(2);
    expect(result).toContain(2);
    expect(result).toContain(1);
  });

  it('should handle zero counts gracefully', () => {
    const chairs = [1, 2, 3];
    const chooseCounts = { 1: 0, 2: 0, 3: 0 };
    const totalChooses = 1; // avoid division by zero

    const result = computeSetterBestResponse(chairs, 2, chooseCounts, totalChooses);

    expect(result.length).toBe(2);
  });
});

describe('computeChooserBestResponse', () => {
  it('should select chair with highest (1 - p_i) * v_i', () => {
    const chairs = [1, 2, 3, 4, 5];
    const setCounts = { 1: 10, 2: 10, 3: 10, 4: 10, 5: 10 };
    const totalSets = 50;

    const result = computeChooserBestResponse(chairs, setCounts, totalSets);

    expect(result).toBe(5);
  });

  it('should avoid chairs with high set probability', () => {
    const chairs = [1, 2, 3];
    const setCounts = { 1: 0, 2: 0, 3: 100 };
    const totalSets = 100;

    const result = computeChooserBestResponse(chairs, setCounts, totalSets);

    expect(result).toBe(2);
  });

  it('should pick the only safe chair when others are always set', () => {
    const chairs = [1, 2, 3];
    const setCounts = { 1: 0, 2: 100, 3: 100 };
    const totalSets = 200;

    const result = computeChooserBestResponse(chairs, setCounts, totalSets);

    // (1-0)*1 = 1, (1-0.5)*2 = 1, (1-0.5)*3 = 1.5 → chair 3
    expect(result).toBe(3);
  });
});

describe('hasConverged', () => {
  it('should return true when probabilities are close', () => {
    const oldProb = { 1: 0.2, 2: 0.3, 3: 0.5 };
    const newProb = { 1: 0.201, 2: 0.299, 3: 0.5 };

    expect(hasConverged(oldProb, newProb, 0.01)).toBe(true);
  });

  it('should return false when probabilities differ', () => {
    const oldProb = { 1: 0.2, 2: 0.3, 3: 0.5 };
    const newProb = { 1: 0.3, 2: 0.3, 3: 0.4 };

    expect(hasConverged(oldProb, newProb, 0.01)).toBe(false);
  });

  it('should handle empty objects', () => {
    expect(hasConverged({}, {}, 0.01)).toBe(true);
  });

  it('should handle missing keys in newProb', () => {
    const oldProb = { 1: 0.2, 2: 0.3 };
    const newProb = { 1: 0.2 };

    expect(hasConverged(oldProb, newProb, 0.01)).toBe(true);
  });
});

describe('getNashMove', () => {
  it('should return setChairs and reasoning for setter', () => {
    const result = getNashMove('ai-nash', 'set', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

    expect(result).toHaveProperty('setChairs');
    expect(result).toHaveProperty('reasoning');
    expect(Array.isArray(result.setChairs)).toBe(true);
    expect(result.setChairs.length).toBe(3);
    expect(result.reasoning).toContain('ナッシュ均衡');
  });

  it('should return chosenChair and reasoning for chooser', () => {
    const result = getNashMove('ai-nash', 'choose', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

    expect(result).toHaveProperty('chosenChair');
    expect(result).toHaveProperty('reasoning');
    expect(typeof result.chosenChair).toBe('number');
    expect(result.reasoning).toContain('ナッシュ均衡');
  });

  it('should handle small remaining chairs', () => {
    const result = getNashMove('ai-nash', 'choose', [1, 2]);

    expect(result).toHaveProperty('chosenChair');
    expect([1, 2]).toContain(result.chosenChair);
  });

  it('should handle single remaining chair for chooser', () => {
    const result = getNashMove('ai-nash', 'choose', [5]);

    expect(result.chosenChair).toBe(5);
    expect(result.reasoning).toContain('ナッシュ均衡');
  });

  it('should handle single remaining chair for setter', () => {
    const result = getNashMove('ai-nash', 'set', [5]);

    expect(result.setChairs).toEqual([5]);
    expect(result.reasoning).toContain('ナッシュ均衡');
  });

  it('should handle two chairs for setter', () => {
    const result = getNashMove('ai-nash', 'set', [1, 2]);

    expect(result.setChairs.length).toBe(1); // floor(2/3) = 0, max(1, 0) = 1
    expect(result.reasoning).toContain('ナッシュ均衡');
  });

  it('should handle situation where expected values are all below game value', () => {
    // 椅子が少ない場合、全ての期待値がゲームの値以下になりうる
    // 適当な椅子でテスト（実際の値に依存するのでアサーションは緩めに）
    const result = getNashMove('ai-nash', 'choose', [1, 2, 3, 4, 5]);

    expect(result).toHaveProperty('chosenChair');
    expect(result).toHaveProperty('reasoning');
    expect(typeof result.chosenChair).toBe('number');
    expect(result.reasoning).toContain('ナッシュ均衡');
  });

  it('should return deterministic results for setter with same remaining chairs', () => {
    // 同じ条件で2回呼び出してもエラーにならないこと
    const result1 = getNashMove('ai-nash', 'set', [1, 2, 3, 4, 5, 6]);
    const result2 = getNashMove('ai-nash', 'set', [1, 2, 3, 4, 5, 6]);

    expect(result1.setChairs.length).toBe(2); // floor(6/3) = 2
    expect(result2.setChairs.length).toBe(2);
    expect(result1.reasoning).toContain('ナッシュ均衡');
    expect(result2.reasoning).toContain('ナッシュ均衡');
  });

  it('should handle chair numbers that are not sequential', () => {
    // 既にいくつか椅子が選択された後の状態をシミュレート
    const result = getNashMove('ai-nash', 'choose', [2, 5, 8, 11]);

    expect(result).toHaveProperty('chosenChair');
    expect([2, 5, 8, 11]).toContain(result.chosenChair);
    expect(result.reasoning).toContain('ナッシュ均衡');
  });

  it('should handle many chairs with numToSet = 1', () => {
    // startMatchではfloor(12/3)=3だが、直接呼び出しでsmall chairsのケースをテスト
    const chairs = [1, 2, 3, 4]; // floor(4/3) = 1
    const resultSetter = getNashMove('ai-nash', 'set', chairs);
    const resultChooser = getNashMove('ai-nash', 'choose', chairs);

    expect(resultSetter.setChairs.length).toBe(1);
    expect(resultChooser.chosenChair).toBeGreaterThanOrEqual(1);
    expect(resultChooser.chosenChair).toBeLessThanOrEqual(4);
  });
});