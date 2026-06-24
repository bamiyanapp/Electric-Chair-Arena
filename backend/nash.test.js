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

    // 確率の合計は1に近いこと（確率分布）
    const totalSetProb = Object.values(result.setProb).reduce((a, b) => a + b, 0);
    expect(totalSetProb).toBeCloseTo(1, 0.1);

    const totalChooseProb = Object.values(result.chooseProb).reduce((a, b) => a + b, 0);
    expect(totalChooseProb).toBeCloseTo(1, 0.01);

    // ゲームの値が正の範囲内
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
  });
});

describe('computeSetterBestResponse', () => {
  it('should select chairs with highest q_i * v_i', () => {
    const chairs = [1, 2, 3, 4, 5];
    const chooseCounts = { 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 };
    const totalChooses = 150;

    const result = computeSetterBestResponse(chairs, 2, chooseCounts, totalChooses);

    // q_i * v_i の値: 1:0.07, 2:0.27, 3:0.60, 4:1.07, 5:1.67
    // 上位2つは 5 と 4
    expect(result).toContain(5);
    expect(result).toContain(4);
    expect(result.length).toBe(2);
  });

  it('should handle uniform distribution', () => {
    const chairs = [1, 2, 3, 4];
    const chooseCounts = { 1: 10, 2: 10, 3: 10, 4: 10 };
    const totalChooses = 40;

    const result = computeSetterBestResponse(chairs, 2, chooseCounts, totalChooses);

    // q_i * v_i: 1:0.25, 2:0.50, 3:0.75, 4:1.00
    expect(result).toContain(4);
    expect(result).toContain(3);
    expect(result.length).toBe(2);
  });
});

describe('computeChooserBestResponse', () => {
  it('should select chair with highest (1 - p_i) * v_i', () => {
    const chairs = [1, 2, 3, 4, 5];
    const setCounts = { 1: 10, 2: 10, 3: 10, 4: 10, 5: 10 };
    const totalSets = 50;

    const result = computeChooserBestResponse(chairs, setCounts, totalSets);

    // p_i = 0.2 for all, (1 - p_i) * v_i: 1:0.8, 2:1.6, 3:2.4, 4:3.2, 5:4.0
    expect(result).toBe(5);
  });

  it('should avoid chairs with high set probability', () => {
    const chairs = [1, 2, 3];
    const setCounts = { 1: 0, 2: 0, 3: 100 };
    const totalSets = 100;

    const result = computeChooserBestResponse(chairs, setCounts, totalSets);

    // p_3 = 1.0, (1 - p_3) * 3 = 0 → 3は避けられる
    // p_1 = 0, (1 - p_1) * 1 = 1
    // p_2 = 0, (1 - p_2) * 2 = 2
    expect(result).toBe(2);
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
});

describe('getNashMove', () => {
  it('should return setChairs and reasoning for setter', () => {
    const result = getNashMove('ai-nash', 'set', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

    expect(result).toHaveProperty('setChairs');
    expect(result).toHaveProperty('reasoning');
    expect(Array.isArray(result.setChairs)).toBe(true);
    expect(result.setChairs.length).toBe(3); // 12 chairs → numToSet = 3
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

  it('should handle single remaining chair', () => {
    const result = getNashMove('ai-nash', 'choose', [5]);

    expect(result.chosenChair).toBe(5);
  });
});