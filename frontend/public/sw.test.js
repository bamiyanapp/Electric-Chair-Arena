/* global Response */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// sw.jsはブラウザのService Worker専用グローバル(self/caches/fetch)を前提に
// トップレベルでaddEventListenerを呼ぶプレーンスクリプトのため、importする前に
// これらのグローバルをテスト用にスタブし、登録されたfetchハンドラを直接呼び出して検証する。
describe('sw.js fetch handler', () => {
  let fetchHandler;
  let cachePutMock;
  let cacheMatchMock;
  let fetchMock;

  beforeEach(async () => {
    vi.resetModules();

    cachePutMock = vi.fn().mockResolvedValue(undefined);
    cacheMatchMock = vi.fn().mockResolvedValue(new Response('cached'));
    const cacheMock = { put: cachePutMock, addAll: vi.fn().mockResolvedValue(undefined) };

    fetchMock = vi.fn();

    const listeners = {};
    vi.stubGlobal('self', {
      location: { origin: 'https://example.com' },
      addEventListener: vi.fn((type, handler) => {
        listeners[type] = handler;
      }),
    });
    vi.stubGlobal('caches', {
      open: vi.fn().mockResolvedValue(cacheMock),
      match: cacheMatchMock,
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('console', { warn: vi.fn(), log: vi.fn(), error: vi.fn() });

    await import('./sw.js');
    fetchHandler = listeners['fetch'];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeEvent(request) {
    return {
      request,
      respondWith: vi.fn(),
    };
  }

  it('does not intercept non-GET requests (POST等はcache.putがサポート外のため素通しする)', () => {
    const request = { method: 'POST', url: 'https://example.com/save-match' };
    const event = makeEvent(request);

    fetchHandler(event);

    expect(event.respondWith).not.toHaveBeenCalled();
  });

  it('does not intercept cross-origin GET requests (APIレスポンスをキャッシュ対象にしない)', () => {
    const request = { method: 'GET', url: 'https://api.example.com/get-matches' };
    const event = makeEvent(request);

    fetchHandler(event);

    expect(event.respondWith).not.toHaveBeenCalled();
  });

  it('intercepts same-origin GET requests and caches the response without throwing', async () => {
    const request = { method: 'GET', url: 'https://example.com/globals.css' };
    const event = makeEvent(request);
    const response = { clone: () => 'cloned-response' };
    fetchMock.mockResolvedValue(response);

    fetchHandler(event);

    expect(event.respondWith).toHaveBeenCalledTimes(1);
    await event.respondWith.mock.calls[0][0];
    await Promise.resolve();
    await Promise.resolve();

    expect(cachePutMock).toHaveBeenCalledWith(request, 'cloned-response');
  });

  it('falls back to cache when the network request fails', async () => {
    const request = { method: 'GET', url: 'https://example.com/globals.css' };
    const event = makeEvent(request);
    fetchMock.mockRejectedValue(new Error('offline'));

    fetchHandler(event);

    const result = await event.respondWith.mock.calls[0][0];
    expect(cacheMatchMock).toHaveBeenCalledWith(request);
    expect(result).toBeInstanceOf(Response);
  });

  it('does not throw when cache.put fails for a same-origin GET request', async () => {
    const request = { method: 'GET', url: 'https://example.com/globals.css' };
    const event = makeEvent(request);
    const response = { clone: () => 'cloned-response' };
    fetchMock.mockResolvedValue(response);
    cachePutMock.mockRejectedValue(new Error('cache put failed'));

    fetchHandler(event);

    await expect(event.respondWith.mock.calls[0][0]).resolves.toBe(response);
    await Promise.resolve();
    await Promise.resolve();
  });
});
