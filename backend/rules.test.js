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
});

describe('getNumToSet', () => {
  it('clamps to the minimum (1) when remaining chairs are few', () => {
    expect(getNumToSet(1)).toBe(1);
    expect(getNumToSet(2)).toBe(1);
  });

  it('returns roughly a third of the remaining chairs', () => {
    expect(getNumToSet(6)).toBe(2);
    expect(getNumToSet(9)).toBe(3);
  });

  it('clamps to the maximum (3) when remaining chairs are many', () => {
    expect(getNumToSet(12)).toBe(3);
    expect(getNumToSet(100)).toBe(3);
  });
});
