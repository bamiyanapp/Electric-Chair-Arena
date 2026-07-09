import { describe, it, expect } from 'vitest';
import { GAME_RULES, getNumToSet } from './rules.js';

describe('Game Rules Constants Tests', () => {
  it('should have correct total chairs config', () => {
    expect(GAME_RULES.TOTAL_CHAIRS).toBe(12);
  });

  it('should have correct winning score config', () => {
    expect(GAME_RULES.WINNING_SCORE).toBe(40);
  });

  it('should have correct max shocks config', () => {
    expect(GAME_RULES.MAX_SHOCKS).toBe(3);
  });

  it('should have correct min chairs to end config', () => {
    expect(GAME_RULES.MIN_CHAIRS_TO_END).toBe(1);
  });

  // 人間/PVPの親は常に1脚しか設置できない(frontend/src/app/page.tsxのhumanSetChairs/
  // pvpSetChairは常に単一の椅子)。AI側だけがMAX_CHAIRS_TO_SETにより複数脚設置できる
  // 非対称は構造的に人間側が不利になるゲームバランス上のバグのため、
  // MAX/MIN_CHAIRS_TO_SETは常に1で揃える。
  it('keeps MAX_CHAIRS_TO_SET equal to MIN_CHAIRS_TO_SET so the AI setter is symmetric with the human/PVP setter (always 1 chair)', () => {
    expect(GAME_RULES.MAX_CHAIRS_TO_SET).toBe(1);
    expect(GAME_RULES.MIN_CHAIRS_TO_SET).toBe(1);
  });
});

describe('getNumToSet', () => {
  it('clamps to the minimum (1) when remaining chairs are few', () => {
    expect(getNumToSet(1)).toBe(1);
    expect(getNumToSet(2)).toBe(1);
  });

  it('always returns 1, matching the human/PVP setter (MAX_CHAIRS_TO_SET=1)', () => {
    expect(getNumToSet(6)).toBe(1);
    expect(getNumToSet(9)).toBe(1);
  });

  it('clamps to the maximum (1) when remaining chairs are many', () => {
    expect(getNumToSet(12)).toBe(1);
    expect(getNumToSet(100)).toBe(1);
  });
});
