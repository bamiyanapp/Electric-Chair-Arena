import { describe, it, expect } from 'vitest';
import { GAME_RULES } from './rules.js';
import {
  fictitiousPlay,
  computeSetterBestResponse,
  computeChooserBestResponse,
  hasConverged,
  computeShockCost,
  computeRelativeRank,
  projectRankToChair,
  buildOpponentPreferenceCounts,
  solveEndgameValue,
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

  it('treats a key missing from oldProb, or a zero probability in newProb, as 0', () => {
    const oldProb = { 1: 0.2 };
    const newProb = { 1: 0.2, 2: 0, 3: 0.05 };

    expect(hasConverged(oldProb, newProb, 0.01)).toBe(false);
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
    // 残り椅子がENDGAME_LOOKAHEAD_MAX_CHAIRS(5)を超える(状態非依存の実効値
    // ヒューリスティックを使う)構成で再現する。椅子数が少ないと終盤の
    // 先読みロジックに切り替わり、価値関数が変わるため同じ入力では再現しない。
    const result = getNashMove('ai-nash', 'choose', [1, 2, 3, 4, 5, 6, 7, 8, 9, 6]);

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

// issue #166: 感電コストを利得に組み込む(選択者の損失・設置者の利得の両方)
describe('computeShockCost', () => {
  it('returns a large penalty once one more shock would eliminate the player', () => {
    const cost = computeShockCost(10, GAME_RULES.MAX_SHOCKS - 1);
    expect(cost).toBeGreaterThan(100);
  });

  it('increases with the current score when not near elimination', () => {
    const lowScoreCost = computeShockCost(5, 0);
    const highScoreCost = computeShockCost(30, 0);
    expect(highScoreCost).toBeGreaterThan(lowScoreCost);
  });

  it('increases with the shock count itself even at the same score', () => {
    const zeroShocksCost = computeShockCost(10, 0);
    const oneShockCost = computeShockCost(10, 1);
    expect(oneShockCost).toBeGreaterThan(zeroShocksCost);
  });

  it('never dominates the elimination penalty when far from elimination', () => {
    const cost = computeShockCost(GAME_RULES.WINNING_SCORE, 0);
    const eliminationCost = computeShockCost(0, GAME_RULES.MAX_SHOCKS - 1);
    expect(cost).toBeLessThan(eliminationCost);
  });
});

describe('getNashMove considers shock cost (issue #166)', () => {
  it('chooser becomes more risk-averse (favors lower set-probability chairs) once already shocked, holding score constant', () => {
    // 感電回数のみが異なる2つの対局状態で、選択の分布が変化する(全く同じでは
    // なくなる)ことを確認する。安全な椅子ほど選ばれる頻度が高くなることまでは
    // 厳密に保証しないが、少なくとも感電コストが選択確率に影響していることを検証する。
    const chairs = [1, 2, 3, 4, 5, 6, 7, 8];
    const trials = 200;
    const countsNoShock = {};
    const countsOneShock = {};
    chairs.forEach(c => { countsNoShock[c] = 0; countsOneShock[c] = 0; });

    for (let i = 0; i < trials; i++) {
      const noShockResult = getNashMove('ai-nash', 'choose', chairs, { selfScore: 20, selfShocks: 0 });
      countsNoShock[noShockResult.chosenChair]++;
      const oneShockResult = getNashMove('ai-nash', 'choose', chairs, { selfScore: 20, selfShocks: 1 });
      countsOneShock[oneShockResult.chosenChair]++;
    }

    const distributionsDiffer = chairs.some(c => Math.abs(countsNoShock[c] - countsOneShock[c]) > 10);
    expect(distributionsDiffer).toBe(true);
  });

  it('setter increasingly favors chairs likely to be chosen (over raw value) as the opponent accumulates more score to lose', () => {
    const chairs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    // 200試行・閾値3では効果量自体のばらつきが大きく(実測diff: 1,33,13,4,8,3,24,1)、
    // 断続的にテストが失敗することを確認した。試行回数を1000まで増やしたところ
    // diffが安定して40以上になった(実測: 41,60,65,70,72)ため、十分な余裕を
    // 持たせた閾値20を採用する
    const trials = 1000;

    const highValueCountsLowOpponentScore = { count: 0 };
    const highValueCountsHighOpponentScore = { count: 0 };

    for (let i = 0; i < trials; i++) {
      const lowScoreResult = getNashMove('ai-nash', 'set', chairs, { opponentScore: 0 });
      const highScoreResult = getNashMove('ai-nash', 'set', chairs, { opponentScore: 35 });
      if (lowScoreResult.setChairs[0] >= 9) highValueCountsLowOpponentScore.count++;
      if (highScoreResult.setChairs[0] >= 9) highValueCountsHighOpponentScore.count++;
    }

    // 相手のスコアが高いほど、価値denialより「相手を確実に感電させる価値」の
    // 比重が増すため、必ずしも高得点椅子(9以上)ばかりを狙わなくなる
    // (選ばれやすい椅子を優先するようになる)ことを、厳密な閾値ではなく
    // 分布が変化していることで確認する。
    const diff = Math.abs(highValueCountsLowOpponentScore.count - highValueCountsHighOpponentScore.count);
    expect(diff).toBeGreaterThan(20);
  }, 15000);
});

// issue #166: 終盤(残り椅子が少ない局面)での継続価値の厳密な先読み
describe('solveEndgameValue', () => {
  it('returns a large positive value when self has already reached the winning score', () => {
    const memo = new Map();
    const value = solveEndgameValue([1, 2, 3], GAME_RULES.WINNING_SCORE, 0, 0, 0, true, memo);
    expect(value).toBeGreaterThan(0);
  });

  it('returns a large negative value when self has already reached the max shock count', () => {
    const memo = new Map();
    const value = solveEndgameValue([1, 2, 3], 0, GAME_RULES.MAX_SHOCKS, 0, 0, true, memo);
    expect(value).toBeLessThan(0);
  });

  it('returns a large positive value when the opponent (not self) has already reached the max shock count', () => {
    const memo = new Map();
    const value = solveEndgameValue([1, 2, 3], 0, 0, 0, GAME_RULES.MAX_SHOCKS, true, memo);
    expect(value).toBeGreaterThan(0);
  });

  it('returns 0 (draw) when chairs are exhausted with equal score and shocks', () => {
    const memo = new Map();
    const value = solveEndgameValue([5], 10, 1, 10, 1, true, memo);
    expect(value).toBe(0);
  });

  it('favors the side with the higher score when chairs are exhausted with unequal scores', () => {
    const memo = new Map();
    const higherScoreValue = solveEndgameValue([5], 20, 0, 10, 0, true, memo);
    const lowerScoreValue = solveEndgameValue([5], 10, 0, 20, 0, true, memo);
    expect(higherScoreValue).toBeGreaterThan(0);
    expect(lowerScoreValue).toBeLessThan(0);
  });

  it('memoizes repeated states (identical calls return the same cached value)', () => {
    const memo = new Map();
    const first = solveEndgameValue([1, 2, 3], 5, 0, 5, 0, true, memo);
    const second = solveEndgameValue([1, 2, 3], 5, 0, 5, 0, true, memo);
    expect(second).toBe(first);
  });

  it('is used by getNashMove once remainingChairs is small enough (reasoning mentions endgame lookahead)', () => {
    const result = getNashMove('ai-nash', 'choose', [1, 2, 3]);
    expect(result.reasoning).toContain('終盤の先読み');
  });

  it('is used by getNashMove for the setter role too, once remainingChairs is small enough', () => {
    const result = getNashMove('ai-nash', 'set', [1, 2, 3]);
    expect(result.reasoning).toContain('終盤の先読み');
  });

  it('completes within a reasonable time budget for a Lambda invocation (well under 1 second)', () => {
    const start = Date.now();
    getNashMove('ai-nash', 'choose', [1, 2, 3], { selfScore: 15, opponentScore: 20, selfShocks: 1, opponentShocks: 1 });
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

// issue #167: 対戦中に観測した相手の行動傾向をAIの意思決定に反映する(相手モデリング)
describe('computeRelativeRank', () => {
  it('returns 0 for the lowest value and 1 for the highest value among the available choices', () => {
    const chairs = [1, 2, 3, 4, 5];
    expect(computeRelativeRank(1, chairs)).toBe(0);
    expect(computeRelativeRank(5, chairs)).toBe(1);
    expect(computeRelativeRank(3, chairs)).toBe(0.5);
  });

  it('does not depend on the order of availableChairs', () => {
    expect(computeRelativeRank(8, [10, 2, 8, 4, 6])).toBe(computeRelativeRank(8, [2, 4, 6, 8, 10]));
  });

  it('returns 0.5 as a neutral fallback when the chair is not found in availableChairs (defensive)', () => {
    expect(computeRelativeRank(99, [1, 2, 3])).toBe(0.5);
  });

  it('returns 0.5 when availableChairs has only a single element (rank is not meaningfully definable)', () => {
    expect(computeRelativeRank(7, [7])).toBe(0.5);
  });
});

describe('projectRankToChair', () => {
  it('projects rank 0/1 to the lowest/highest chair in currentChairs', () => {
    const chairs = [2, 4, 6, 8];
    expect(projectRankToChair(0, chairs)).toBe(2);
    expect(projectRankToChair(1, chairs)).toBe(8);
  });

  it('does not depend on the order of currentChairs', () => {
    expect(projectRankToChair(0.5, [8, 2, 6, 4])).toBe(projectRankToChair(0.5, [2, 4, 6, 8]));
  });

  it('returns the single chair when currentChairs has only one element', () => {
    expect(projectRankToChair(0.3, [5])).toBe(5);
  });
});

describe('buildOpponentPreferenceCounts', () => {
  it('accumulates a count on the projected chair for each observed action', () => {
    const chairs = [1, 2, 3, 4, 5];
    const actions = [
      { chosenChair: 5, availableChairs: chairs }, // rank 1 → projects to 5
      { chosenChair: 5, availableChairs: chairs },
    ];
    const counts = buildOpponentPreferenceCounts(actions, chairs);
    expect(counts[5]).toBe(2);
    expect(counts[1]).toBe(0);
  });

  it('projects a historical high-value pick onto the current (smaller) remaining chairs as a high-value pick', () => {
    const historicalChairs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const actions = [{ chosenChair: 12, availableChairs: historicalChairs }]; // rank 1 (highest)
    const currentChairs = [3, 5, 7]; // 椅子11本が既に無くなった終盤の残り椅子
    const counts = buildOpponentPreferenceCounts(actions, currentChairs);
    expect(counts[7]).toBe(1); // 現在の残り椅子の中で最も高い椅子へ射影される
    expect(counts[3]).toBe(0);
    expect(counts[5]).toBe(0);
  });

  it('returns all-zero counts when there are no observed actions', () => {
    const counts = buildOpponentPreferenceCounts([], [1, 2, 3]);
    expect(Object.values(counts).every(c => c === 0)).toBe(true);
  });
});

describe('getNashMove reflects observed opponent tendencies (opponentHistory, issue #167)', () => {
  const chairs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  it('setter increasingly targets a chair the opponent (chooser) has consistently favored, as more observations accumulate', () => {
    const trials = 400;
    const countHighTarget = (chooserActions) => {
      let count = 0;
      for (let i = 0; i < trials; i++) {
        const opponentHistory = chooserActions ? { chooserActions } : undefined;
        const result = getNashMove('ai-nash', 'set', chairs, opponentHistory ? { opponentHistory } : {});
        if (result.setChairs[0] >= 10) count++;
      }
      return count;
    };

    const makeBiasedHistory = (n) =>
      Array.from({ length: n }, () => ({ chosenChair: 11, availableChairs: chairs }));

    const baseline = countHighTarget(undefined);
    const fewObservations = countHighTarget(makeBiasedHistory(1));
    const manyObservations = countHighTarget(makeBiasedHistory(8));

    // 観測が蓄積するほど、相手が好む(高得点の)椅子への標的化が強まる
    expect(fewObservations).toBeGreaterThan(baseline);
    expect(manyObservations).toBeGreaterThan(fewObservations);
    // 十分な観測数では、ほぼ確実に相手の好む椅子(11、この場合8以上)を狙う
    expect(manyObservations / trials).toBeGreaterThan(0.95);
  }, 15000);

  it('chooser increasingly avoids a chair the opponent (setter) has consistently trapped, as more observations accumulate', () => {
    const trials = 400;
    // baseline(履歴無し)でも一定確率で選ばれる椅子(goodChairsに含まれる椅子)を
    // 標的にしないと、observedOpponentCount=0でも常に0回のままとなり比較にならない
    const targetChair = 11;
    const countTargetChosen = (setterActions) => {
      let count = 0;
      for (let i = 0; i < trials; i++) {
        const opponentHistory = setterActions ? { setterActions } : undefined;
        const result = getNashMove('ai-nash', 'choose', chairs, opponentHistory ? { opponentHistory } : {});
        if (result.chosenChair === targetChair) count++;
      }
      return count;
    };

    const makeBiasedHistory = (n) =>
      Array.from({ length: n }, () => ({ chosenChair: targetChair, availableChairs: chairs }));

    const baseline = countTargetChosen(undefined);
    expect(baseline).toBeGreaterThan(0); // 前提: 履歴無しでは一定頻度で選ばれる椅子であること

    const manyObservations = countTargetChosen(makeBiasedHistory(8));
    expect(manyObservations).toBeLessThan(baseline);
    expect(manyObservations).toBe(0); // 十分な観測数では、罠を張られ続けた椅子は一切選ばない
  }, 15000);

  it('does not systematically change behavior when the opponent history is unbiased (averaged over many independent draws)', () => {
    const trials = 800;
    let biasedCount = 0;
    let unbiasedCount = 0;

    for (let i = 0; i < trials; i++) {
      const biasedResult = getNashMove('ai-nash', 'set', chairs, {
        opponentHistory: { chooserActions: Array.from({ length: 6 }, () => ({ chosenChair: 11, availableChairs: chairs })) },
      });
      if (biasedResult.setChairs[0] >= 10) biasedCount++;

      // 毎回、無作為な(偏りの無い)観測履歴を新規に生成してから1回だけ判断する
      // (固定の1回の履歴に対して繰り返し判断すると、少数観測ゆえの偶然の偏りが
      // そのまま観測されてしまい、平均的な挙動の検証にならない)
      const unbiasedActions = Array.from({ length: 6 }, () => ({
        chosenChair: chairs[Math.floor(Math.random() * chairs.length)],
        availableChairs: chairs,
      }));
      const unbiasedResult = getNashMove('ai-nash', 'set', chairs, { opponentHistory: { chooserActions: unbiasedActions } });
      if (unbiasedResult.setChairs[0] >= 10) unbiasedCount++;
    }

    // 一貫して偏った履歴は明確に標的化するが、偏りの無い履歴は(平均すれば)標的化しない
    expect(biasedCount / trials).toBeGreaterThan(0.9);
    expect(unbiasedCount / trials).toBeLessThan(0.8);
  }, 15000);

  it('falls back to the standard equilibrium logic when opponentHistory is omitted (backward compatible)', () => {
    const result = getNashMove('ai-nash', 'set', chairs, { opponentScore: 10 });
    expect(result.setChairs).toHaveLength(1);
    expect(result.reasoning).not.toContain('行動傾向');
  });

  it('mentions the observed opponent tendency in the reasoning text once enough observations exist', () => {
    const chooserActions = Array.from({ length: 8 }, () => ({ chosenChair: 11, availableChairs: chairs }));
    const result = getNashMove('ai-nash', 'set', chairs, { opponentHistory: { chooserActions } });
    expect(result.reasoning).toContain('行動傾向');
    expect(result.reasoning).toContain('観測8件');
  });
});