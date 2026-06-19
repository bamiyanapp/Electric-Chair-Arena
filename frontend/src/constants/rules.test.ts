import { describe, it, expect } from 'vitest';
import { GAME_RULES } from './rules';

describe('Frontend Game Rules Constants Tests', () => {
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
