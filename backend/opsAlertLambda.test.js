import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handler } from './opsAlertLambda.js';

function buildSnsEvent(alarm) {
  return {
    Records: [{ Sns: { Message: JSON.stringify(alarm) } }],
  };
}

describe('opsAlertLambda', () => {
  beforeEach(() => {
    process.env.OPS_ALERT_LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
    process.env.OPS_ALERT_LINE_USER_ID = 'test-user';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200 })),
    );
  });

  afterEach(() => {
    delete process.env.OPS_ALERT_LINE_CHANNEL_ACCESS_TOKEN;
    delete process.env.OPS_ALERT_LINE_USER_ID;
    vi.unstubAllGlobals();
  });

  it('builds the alert message from the CloudWatch Alarm SNS payload and sends it via LINE', async () => {
    await handler(
      buildSnsEvent({
        AlarmName: 'electric-chair-arena-backend-dev-getAiMove-errors',
        NewStateValue: 'ALARM',
        NewStateReason: 'Threshold Crossed: 1 datapoint was greater than the threshold',
      }),
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.line.me/v2/bot/message/push');
    expect(init.headers.authorization).toBe('Bearer test-token');
    const body = JSON.parse(init.body);
    expect(body.to).toBe('test-user');
    expect(body.messages[0].text).toContain('electric-chair-arena');
    expect(body.messages[0].text).toContain('electric-chair-arena-backend-dev-getAiMove-errors');
    expect(body.messages[0].text).toContain('ALARM');
  });

  it('processes multiple SNS records in a single invocation', async () => {
    const event = {
      Records: [
        { Sns: { Message: JSON.stringify({ AlarmName: 'alarm-1', NewStateValue: 'ALARM' }) } },
        { Sns: { Message: JSON.stringify({ AlarmName: 'alarm-2', NewStateValue: 'OK' }) } },
      ],
    };

    await handler(event);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does nothing when the event has no Records', async () => {
    await handler({});

    expect(fetch).not.toHaveBeenCalled();
  });
});
