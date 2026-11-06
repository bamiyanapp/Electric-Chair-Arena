import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

function Thrower(): never {
  throw new Error('テスト用の例外');
}

describe('ErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    consoleErrorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <p>正常な画面</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('正常な画面')).toBeDefined();
  });

  it('renders the fallback UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    expect(screen.getByText('エラーが発生しました')).toBeDefined();
  });

  it('reports the error to reportUrl when provided', () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ErrorBoundary reportUrl="https://example.com/report-client-error">
        <Thrower />
      </ErrorBoundary>,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.com/report-client-error');
    const body = JSON.parse(init.body as string);
    expect(body.message).toBe('テスト用の例外');
    expect(body.url).toBe(window.location.href);
  });

  it('swallows the error when the report request fails', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('network error')));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ErrorBoundary reportUrl="https://example.com/report-client-error">
        <Thrower />
      </ErrorBoundary>,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await fetchMock.mock.results[0].value.catch(() => {});
  });

  it('does not call fetch when reportUrl is not provided', () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reloads the page when the reload button is clicked', () => {
    const reloadMock = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload: reloadMock });

    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }));

    expect(reloadMock).toHaveBeenCalledTimes(1);
  });
});
