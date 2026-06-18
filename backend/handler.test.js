import { describe, it, expect } from 'vitest';
import { judgeHanko, getStage, updateProgress } from './handler.js';

describe('Backend Handler Tests', () => {
  it('should test judgeHanko handler', async () => {
    const event = { key: 'value' };
    const response = await judgeHanko(event);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.message).toBe('judgeHanko endpoint');
    expect(body.input).toEqual(event);
  });

  it('should test getStage handler', async () => {
    const event = { key: 'value2' };
    const response = await getStage(event);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.message).toBe('getStage endpoint');
    expect(body.input).toEqual(event);
  });

  it('should test updateProgress handler', async () => {
    const event = { key: 'value3' };
    const response = await updateProgress(event);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.message).toBe('updateProgress endpoint');
    expect(body.input).toEqual(event);
  });
});
