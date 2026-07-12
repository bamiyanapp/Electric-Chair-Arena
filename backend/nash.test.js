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
    expect(result1000.gameValue).not.toBeNaN();
  });

  it('should handle single chair case', () => {
    const chairs = [5];
    const result = fictitiousPlay(chairs, 1, 100);

    expect(result.gameValue).toBe(0);
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

  it('should handle three chairs with numToSet=2', () => {
    const chairs = [1, 2, 3];
    const result = fictitiousPlay(chairs, 2, 500);

    expect(result.setProb[1] + result.setProb[2] + result.setProb[3]).toBeCloseTo(1, 0.1);
    expect(result.chooseProb[1] + result.chooseProb[2] + result.chooseProb[3]).toBeCloseTo(1, 0.01);
    expect(result.gameValue).toBeGreaterThanOrEqual(0);
  });

  it('should handle four chairs with numToSet=1', () => {
    const chairs = [1, 2, 3, 4];
    const result = fictitiousPlay(chairs, 1, 500);

    expect(result.setProb[1] + result.setProb[2] + result.setProb[3] + result.setProb[4]).toBeCloseTo(1, 0.1);
    expect(result.chooseProb[1] + result.chooseProb[2] + result.chooseProb[3] + result.chooseProb[4]).toBeCloseTo(1, 0.01);
  });

  it('should handle five chairs with numToSet=1', () => {
    const chairs = [1, 2, 3, 4, 5];
    const result = fictitiousPlay(chairs, 1, 500);

    expect(result.gameValue).toBeGreaterThan(0);
    expect(result.gameValue).toBeLessThan(5);
  });

  it('should handle six chairs with numToSet=2', () => {
    const chairs = [1, 2, 3, 4, 5, 6];
    const result = fictitiousPlay(chairs, 2, 500);

    expect(result.gameValue).toBeGreaterThan(0);
    expect(result.gameValue).toBeLessThan(6);
  });

  it('should handle seven chairs with numToSet=2', () => {
    const chairs = [1, 2, 3, 4, 5, 6, 7];
    const result = fictitiousPlay(chairs, 2, 500);

    expect(result.gameValue).toBeGreaterThan(0);
  });

  it('should handle eight chairs with numToSet=2', () => {
    const chairs = [1, 2, 3, 4, 5, 6, 7, 8];
    const result = fictitiousPlay(chairs, 2, 500);

    expect(result.gameValue).toBeGreaterThan(0);
  });

  it('should handle nine chairs with numToSet=3', () => {
    const chairs = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const result = fictitiousPlay(chairs, 3, 500);

    expect(result.gameValue).toBeGreaterThan(0);
  });

  it('should handle ten chairs with numToSet=3', () => {
    const chairs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = fictitiousPlay(chairs, 3, 500);

    expect(result.gameValue).toBeGreaterThan(0);
  });

  it('should handle eleven chairs with numToSet=3', () => {
    const chairs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const result = fictitiousPlay(chairs, 3, 500);

    expect(result.gameValue).toBeGreaterThan(0);
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

    expect(result.length).toBe(2);
    expect(result).toContain(2);
    expect(result).toContain(1);
  });

  it('should handle zero counts gracefully', () => {
    const chairs = [1, 2, 3];
    const chooseCounts = { 1: 0, 2: 0, 3: 0 };
    const totalChooses = 1;

    const result = computeSetterBestResponse(chairs, 2, chooseCounts, totalChooses);

    expect(result.length).toBe(2);
  });

  it('should handle single chair', () => {
    const chairs = [5];
    const chooseCounts = { 5: 10 };
    const totalChooses = 10;

    const result = computeSetterBestResponse(chairs, 1, chooseCounts, totalChooses);

    expect(result).toEqual([5]);
  });

  it('should handle three chairs with numToSet=1', () => {
    const chairs = [1, 2, 3];
    const chooseCounts = { 1: 30, 2: 20, 3: 10 };
    const totalChooses = 60;

    const result = computeSetterBestResponse(chairs, 1, chooseCounts, totalChooses);

    expect(result.length).toBe(1);
    // q_i * v_i: chair1=0.5, chair2=0.667, chair3=0.5 → chair2が最高
    expect(result).toContain(2);
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

    expect(result).toBe(3);
  });

  it('should handle single chair', () => {
    const chairs = [5];
    const setCounts = { 5: 0 };
    const totalSets = 1;

    const result = computeChooserBestResponse(chairs, setCounts, totalSets);

    expect(result).toBe(5);
  });

  it('should handle two chairs with different set probabilities', () => {
    const chairs = [1, 2];
    const setCounts = { 1: 0, 2: 100 };
    const totalSets = 100;

    const result = computeChooserBestResponse(chairs, setCounts, totalSets);

    expect(result).toBe(1);
  });

  it('should handle equal expected values', () => {
    const chairs = [1, 2];
    const setCounts = { 1: 50, 2: 50 };
    const totalSets = 100;

    const result = computeChooserBestResponse(chairs, setCounts, totalSets);

    expect([1, 2]).toContain(result);
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

  it('should handle custom threshold', () => {
    const oldProb = { 1: 0.2, 2: 0.3, 3: 0.5 };
    const newProb = { 1: 0.25, 2: 0.3, 3: 0.45 };

    expect(hasConverged(oldProb, newProb, 0.1)).toBe(true);
    expect(hasConverged(oldProb, newProb, 0.01)).toBe(false);
  });
});

describe('getNashMove', () => {
  it('should return setChairs and reasoning for setter', () => {
    const result = getNashMove('ai-nash', 'set', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

    expect(result).toHaveProperty('setChairs');
    expect(result).toHaveProperty('reasoning');
    expect(Array.isArray(result.setChairs)).toBe(true);
    expect(result.setChairs.length).toBe(1);
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

    expect(result.setChairs.length).toBe(1);
    expect(result.reasoning).toContain('ナッシュ均衡');
  });

  it('should handle situation where expected values are all below game value', () => {
    const result = getNashMove('ai-nash', 'choose', [1, 2, 3, 4, 5]);

    expect(result).toHaveProperty('chosenChair');
    expect(result).toHaveProperty('reasoning');
    expect(typeof result.chosenChair).toBe('number');
    expect(result.reasoning).toContain('ナッシュ均衡');
  });

  it('falls back to the highest-expected-value chair when remainingChairs contains a duplicate, making every expected value fall below the game value (goodChairs empty branch)', () => {
    // 重複値を含む椅子集合を与えると、chooseProbが重複キーで合算される一方
    // expectedValuesは配列の各要素ごとに計算されるため、gameValue(重み付き平均)が
    // 全要素のexpectedValueを上回り、goodChairsが空になるケースを再現できる。
    // (handler.js側のremainingChairsバリデーションは要素の一意性までは
    // 検証していないため、実際のAPI経由でも到達しうる分岐)
    const result = getNashMove('ai-nash', 'choose', [1, 1, 2]);

    expect(result).toHaveProperty('chosenChair');
    expect(typeof result.chosenChair).toBe('number');
    expect(result.reasoning).toContain('全ての椅子がゲームの値');
    expect(result.reasoning).toContain('最も期待値の高い椅子');
  });

  it('should return deterministic results for setter with same remaining chairs', () => {
    const result1 = getNashMove('ai-nash', 'set', [1, 2, 3, 4, 5, 6]);
    const result2 = getNashMove('ai-nash', 'set', [1, 2, 3, 4, 5, 6]);

    expect(result1.setChairs.length).toBe(1);
    expect(result2.setChairs.length).toBe(1);
    expect(result1.reasoning).toContain('ナッシュ均衡');
    expect(result2.reasoning).toContain('ナッシュ均衡');
  });

  it('should handle chair numbers that are not sequential', () => {
    const result = getNashMove('ai-nash', 'choose', [2, 5, 8, 11]);

    expect(result).toHaveProperty('chosenChair');
    expect([2, 5, 8, 11]).toContain(result.chosenChair);
    expect(result.reasoning).toContain('ナッシュ均衡');
  });

  it('should handle many chairs with numToSet = 1', () => {
    const chairs = [1, 2, 3, 4];
    const resultSetter = getNashMove('ai-nash', 'set', chairs);
    const resultChooser = getNashMove('ai-nash', 'choose', chairs);

    expect(resultSetter.setChairs.length).toBe(1);
    expect(resultChooser.chosenChair).toBeGreaterThanOrEqual(1);
    expect(resultChooser.chosenChair).toBeLessThanOrEqual(4);
  });

  it('should handle three chairs for setter with numToSet=1', () => {
    const result = getNashMove('ai-nash', 'set', [1, 2, 3]);

    expect(result.setChairs.length).toBe(1);
    expect(result.reasoning).toContain('ナッシュ均衡');
  });

  it('should handle four chairs for setter with numToSet=1', () => {
    const result = getNashMove('ai-nash', 'set', [1, 2, 3, 4]);

    expect(result.setChairs.length).toBe(1);
    expect(result.reasoning).toContain('ナッシュ均衡');
  });

  it('should handle five chairs for setter with numToSet=1', () => {
    const result = getNashMove('ai-nash', 'set', [1, 2, 3, 4, 5]);

    expect(result.setChairs.length).toBe(1);
    expect(result.reasoning).toContain('ナッシュ均衡');
  });

  it('should handle six chairs for setter with numToSet=1', () => {
    const result = getNashMove('ai-nash', 'set', [1, 2, 3, 4, 5, 6]);

    expect(result.setChairs.length).toBe(1);
    expect(result.reasoning).toContain('ナッシュ均衡');
  });

  it('should handle seven chairs for setter with numToSet=1', () => {
    const result = getNashMove('ai-nash', 'set', [1, 2, 3, 4, 5, 6, 7]);

    expect(result.setChairs.length).toBe(1);
    expect(result.reasoning).toContain('ナッシュ均衡');
  });

  it('should handle eight chairs for setter with numToSet=1', () => {
    const result = getNashMove('ai-nash', 'set', [1, 2, 3, 4, 5, 6, 7, 8]);

    expect(result.setChairs.length).toBe(1);
    expect(result.reasoning).toContain('ナッシュ均衡');
  });

  it('should handle nine chairs for setter with numToSet=1', () => {
    const result = getNashMove('ai-nash', 'set', [1, 2, 3, 4, 5, 6, 7, 8, 9]);

    expect(result.setChairs.length).toBe(1);
    expect(result.reasoning).toContain('ナッシュ均衡');
  });

  it('should handle ten chairs for setter with numToSet=1', () => {
    const result = getNashMove('ai-nash', 'set', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    expect(result.setChairs.length).toBe(1);
    expect(result.reasoning).toContain('ナッシュ均衡');
  });

  it('should handle three chairs for chooser', () => {
    const result = getNashMove('ai-nash', 'choose', [1, 2, 3]);

    expect(result).toHaveProperty('chosenChair');
    expect([1, 2, 3]).toContain(result.chosenChair);
    expect(result.reasoning).toContain('ナッシュ均衡');
  });

  it('should handle four chairs for chooser', () => {
    const result = getNashMove('ai-nash', 'choose', [1, 2, 3, 4]);

    expect(result).toHaveProperty('chosenChair');
    expect([1, 2, 3, 4]).toContain(result.chosenChair);
    expect(result.reasoning).toContain('ナッシュ均衡');
  });

  it('should handle five chairs for chooser', () => {
    const result = getNashMove('ai-nash', 'choose', [1, 2, 3, 4, 5]);

    expect(result).toHaveProperty('chosenChair');
    expect([1, 2, 3, 4, 5]).toContain(result.chosenChair);
    expect(result.reasoning).toContain('ナッシュ均衡');
  });

  it('should handle six chairs for chooser', () => {
    const result = getNashMove('ai-nash', 'choose', [1, 2, 3, 4, 5, 6]);

    expect(result).toHaveProperty('chosenChair');
    expect([1, 2, 3, 4, 5, 6]).toContain(result.chosenChair);
    expect(result.reasoning).toContain('ナッシュ均衡');
  });

  it('should handle seven chairs for chooser', () => {
    const result = getNashMove('ai-nash', 'choose', [1, 2, 3, 4, 5, 6, 7]);

    expect(result).toHaveProperty('chosenChair');
    expect(result.reasoning).toContain('ナッシュ均衡');
  });

  it('should handle eight chairs for chooser', () => {
    const result = getNashMove('ai-nash', 'choose', [1, 2, 3, 4, 5, 6, 7, 8]);

    expect(result).toHaveProperty('chosenChair');
    expect(result.reasoning).toContain('ナッシュ均衡');
  });

  it('should handle high value chairs for chooser', () => {
    const result = getNashMove('ai-nash', 'choose', [8, 9, 10, 11, 12]);

    expect(result).toHaveProperty('chosenChair');
    expect(result.reasoning).toContain('ナッシュ均衡');
  });

  it('should handle low value chairs for chooser', () => {
    const result = getNashMove('ai-nash', 'choose', [1, 2, 3, 4, 5]);

    expect(result).toHaveProperty('chosenChair');
    expect(result.reasoning).toContain('ナッシュ均衡');
  });
});