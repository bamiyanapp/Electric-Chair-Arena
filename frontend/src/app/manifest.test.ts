import { describe, it, expect } from 'vitest';
import manifest from './manifest';

describe('PWA Manifest', () => {
  it('returns valid manifest configuration', () => {
    const config = manifest();
    expect(config.name).toBe('Electric Chair Arena');
    expect(config.short_name).toBe('EC Arena');
    expect(config.display).toBe('standalone');
    expect(config.icons).toBeDefined();
    expect(config.icons?.length).toBeGreaterThan(0);
  });
});
