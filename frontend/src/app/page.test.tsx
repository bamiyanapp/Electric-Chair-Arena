import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { Suspense } from 'react';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import Home, { HomeContent } from './page';
import * as navigation from 'next/navigation';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
  usePathname: vi.fn(),
}));

vi.mock('@/constants/rules', () => ({
  GAME_RULES: {
    TOTAL_CHAIRS: 5,
    WINNING_SCORE: 10,
    MAX_SHOCKS: 2,
    MIN_CHAIRS_TO_END: 1,
  }
}));

describe('Home Component', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPush: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockGet: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let originalSetTimeout: any;

  beforeEach(() => {
    // Mock localStorage
    const localStorageMock = (() => {
      let store: Record<string, string> = {};
      return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => {
          store[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete store[key];
        }),
        clear: vi.fn(() => {
          store = {};
        })
      };
    })();
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true
    });

    // Mock sessionStorage
    const sessionStorageMock = (() => {
      let store: Record<string, string> = {};
      return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => {
          store[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete store[key];
        }),
        clear: vi.fn(() => {
          store = {};
        })
      };
    })();
    Object.defineProperty(window, 'sessionStorage', {
      value: sessionStorageMock,
      writable: true
    });

    window.confirm = vi.fn().mockReturnValue(true);

    originalSetTimeout = global.setTimeout;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).setTimeout = (cb: any, ms?: number, ...args: any[]) => {
      if (ms === 1500) {
        cb(...args);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return {} as any;
      }
      return originalSetTimeout(cb, ms, ...args);
    };

    mockGet = vi.fn().mockReturnValue(null);
    mockPush = vi.fn().mockImplementation((url: string) => {
      if (url.includes('view=')) {
        const viewMatch = url.match(/view=([^&]+)/);
        if (viewMatch) {
          mockGet.mockReturnValue(viewMatch[1]);
        }
      } else {
        mockGet.mockReturnValue(null);
      }
    });
    
    vi.mocked(navigation.useRouter).mockReturnValue({
      push: mockPush,
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    });
    vi.mocked(navigation.useSearchParams).mockReturnValue({
      get: mockGet,
      getAll: vi.fn(),
      has: vi.fn(),
      forEach: vi.fn(),
      entries: vi.fn(),
      keys: vi.fn(),
      values: vi.fn(),
      toString: vi.fn().mockReturnValue(''),
      size: 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(navigation.usePathname).mockReturnValue('/');

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    window.Audio = vi.fn().mockImplementation(() => ({
      play: vi.fn().mockRejectedValue(new Error('play error')),
    })) as unknown as typeof Audio;

    global.fetch = vi.fn((url: string | Request | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('get-matches')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ 
            matches: [
              {
                matchId: 'test-match-1',
                player1Id: 'human',
                player2Id: 'ai-okano',
                winnerId: 'human',
                ratingDiff: 10,
                createdAt: new Date().toISOString(),
                logs: [
                  { turn: 1, isHumanSetter: true, chosenChair: 1, isShocked: false, remainingChairs: [2,3,4,5], scores: { p1: 0, p2: 1 }, shocks: { p1: 0, p2: 0 } },
                  { turn: 2, isHumanSetter: false, chosenChair: 2, isShocked: true, remainingChairs: [3,4,5], scores: { p1: 0, p2: 1 }, shocks: { p1: 1, p2: 0 } }
                ]
              }
            ] 
          })
        } as Response);
      }
      if (urlStr.includes('ai-move')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ chosenChair: 1, setChairs: [2] })
        } as Response);
      }
      if (urlStr.includes('generate-commentary')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ commentary: 'テスト実況' })
        } as Response);
      }
      if (urlStr.includes('save-match')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({})
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });
  });

  afterEach(() => {
    global.setTimeout = originalSetTimeout;
    vi.restoreAllMocks();
    cleanup();
  });

  it('renders LOBBY view by default', async () => {
    render(<HomeContent />);
    expect(screen.getAllByText('人間対AI')[0]).toBeDefined();
    expect(screen.getAllByText('人対人 (ローカル)')[0]).toBeDefined();
    expect(screen.getAllByText('ランキング')[0]).toBeDefined();
    expect(screen.getAllByText('過去のスコアボード一覧')[0]).toBeDefined();
    
    await waitFor(() => {
      expect(screen.getByText('岡野陽一風AI')).toBeDefined();
    });
  });

  it('can navigate to LEADERBOARD and back', async () => {
    render(<HomeContent />);
    const btn = screen.getByRole('button', { name: /ランキング/ });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getAllByText('リーダーボード').length).toBeGreaterThan(0);
    });

    const backBtn = screen.getAllByText('ロビーへ戻る')[0];
    fireEvent.click(backBtn);
  });

  it('loads players from /get-players on initial load instead of the hardcoded mock data', async () => {
    const defaultFetch = global.fetch;
    global.fetch = vi.fn((url: string | Request | URL, ...args) => {
      if (url.toString().includes('get-players')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            players: [
              { playerId: 'ai-from-backend-1', name: 'バックエンドAI1号', type: 'rule_based', rating: 1234, winCount: 1, matchCount: 2 },
              { playerId: 'ai-from-backend-2', name: 'バックエンドAI2号', type: 'random', rating: 1111, winCount: 0, matchCount: 1 },
            ],
          }),
        } as Response);
      }
      return defaultFetch(url, ...args);
    });

    render(<HomeContent />);

    await waitFor(() => {
      expect(screen.getByText('バックエンドAI1号')).toBeDefined();
    });
    expect(screen.queryByText('岡野陽一風AI')).toBeNull();
  });

  it('falls back to the mock player list when /get-players fails', async () => {
    const defaultFetch = global.fetch;
    global.fetch = vi.fn((url: string | Request | URL, ...args) => {
      if (url.toString().includes('get-players')) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
      }
      return defaultFetch(url, ...args);
    });

    render(<HomeContent />);

    await waitFor(() => {
      expect(screen.getByText('岡野陽一風AI')).toBeDefined();
    });
  });

  it('loads the leaderboard from /get-leaderboard when navigating to LEADERBOARD', async () => {
    const defaultFetch = global.fetch;
    global.fetch = vi.fn((url: string | Request | URL, ...args) => {
      if (url.toString().includes('get-leaderboard')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            leaderboard: [
              { playerId: 'ai-top', name: 'トップAI', type: 'nash', rating: 9999, winCount: 10, matchCount: 10 },
            ],
          }),
        } as Response);
      }
      return defaultFetch(url, ...args);
    });

    render(<HomeContent />);
    await waitFor(() => {
      expect(screen.getAllByText('岡野陽一風AI').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: /ランキング/ }));

    await waitFor(() => {
      expect(screen.getByText('トップAI')).toBeDefined();
    });
  });

  it('still syncs with external URL changes after navigating to the already-current view (e.g. clicking the header icon while on LOBBY)', async () => {
    const { rerender } = render(<HomeContent />);

    // すでにLOBBYにいる状態でヘッダー（アイコン部分）をクリックする
    const header = screen.getByText('Electric Chair Arena').closest('header');
    fireEvent.click(header!);

    // ブラウザの戻る/進む操作等によるURLの外部変化を模倣する
    mockGet.mockReturnValue('GAME');
    rerender(<HomeContent />);

    await waitFor(() => {
      expect(screen.getAllByText('対戦開始').length).toBeGreaterThan(0);
    });
  });

  it('does not bounce away from LOBBY while router.push reflects the URL change in two steps', async () => {
    // Next.jsのルーター内部の再描画タイミングによっては、router.push後の
    // URL反映が最終値に落ち着くまでの間にviewFromUrlが別の値を経由する
    // ことがある。setCurrentView呼び出し直後はpendingViewRefがtargetを
    // 保持し続け、viewFromUrlがそのtargetに実際に追いつくまでURL同期
    // effectが古い/中間の値でcurrentViewを巻き戻してはならない。
    vi.useFakeTimers();
    try {
      mockGet.mockReturnValue('LEADERBOARD');
      mockPush.mockImplementation((url: string) => {
        // 1段目: ルーター内部の遷移中の値（自分のpush対象ではない値）を経由する。
        setTimeout(() => mockGet.mockReturnValue('GAME'), 200);
        // 2段目: 最終的に正しい値（今回はLOBBY＝viewパラメータなし）に落ち着く。
        setTimeout(() => {
          if (url.includes('view=')) {
            const viewMatch = url.match(/view=([^&]+)/);
            if (viewMatch) {
              mockGet.mockReturnValue(viewMatch[1]);
            }
          } else {
            mockGet.mockReturnValue(null);
          }
        }, 400);
      });

      const { rerender } = render(<HomeContent />);
      expect(screen.getAllByText('リーダーボード').length).toBeGreaterThan(0);

      const backBtn = screen.getAllByText('ロビーへ戻る')[0];
      fireEvent.click(backBtn);
      expect(screen.getAllByText('人間対AI').length).toBeGreaterThan(0);

      // 中間値(GAME)が反映された(200ms)タイミングでもLOBBYに留まり続けること。
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250);
      });
      rerender(<HomeContent />);
      expect(screen.getAllByText('人間対AI').length).toBeGreaterThan(0);
      expect(screen.queryByText('リーダーボード')).toBeNull();

      // 最終的な値(LOBBY)が反映された(400ms)後も、もちろんLOBBYのまま。
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      rerender(<HomeContent />);
      expect(screen.getAllByText('人間対AI').length).toBeGreaterThan(0);
      expect(screen.queryByText('リーダーボード')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('releases the pending-navigation guard after a timeout so external URL changes (e.g. browser back) are not blocked forever if a push never reflects', async () => {
    // setCurrentView呼び出し後、対応するrouter.pushのURL反映が
    // （何らかの理由で）一切来ないまま外部要因でURLが別の値に変化した
    // 場合、pendingViewRefがそのtargetに永久に一致しないままになり、
    // 以後のURL同期effectがすべて機能しなくなってしまう。タイムアウトで
    // ガードを解除し、ブラウザの戻る/進む操作等が再び効くようにする。
    vi.useFakeTimers();
    try {
      // このテストではrouter.pushがURLに一切反映しない状況を模倣する。
      mockPush.mockImplementation(() => {});

      const { rerender } = render(<HomeContent />);

      const lbBtn = screen.getByRole('button', { name: /ランキング/ });
      fireEvent.click(lbBtn);
      expect(screen.getAllByText('リーダーボード').length).toBeGreaterThan(0);

      // 外部要因（ブラウザの戻る操作など）によるURL変化を模倣する。
      // pendingViewRefの対象(LEADERBOARD)とは異なる値になる。
      mockGet.mockReturnValue('SCOREBOARDS');

      // タイムアウト前は、まだガードが有効でこの変化を無視し続ける。
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      rerender(<HomeContent />);
      expect(screen.getAllByText('リーダーボード').length).toBeGreaterThan(0);

      // タイムアウト後はガードが解除され、外部URL変化が反映される。
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      rerender(<HomeContent />);
      expect(screen.getAllByText('過去のスコアボード一覧').length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not let a stale timeout from an earlier navigation release the guard for a later navigation to the same view', async () => {
    // 同じviewへ短時間に複数回ナビゲートした場合、最初の呼び出しの
    // タイムアウト(2秒後)が、後の呼び出しが設定したpendingViewRefを
    // 誤って解除してしまってはならない（tokenによる識別が必要）。
    vi.useFakeTimers();
    try {
      // router.pushがURLに一切反映しない状況を模倣する。
      mockPush.mockImplementation(() => {});

      const { rerender } = render(<HomeContent />);

      const lbBtn = () => screen.getByRole('button', { name: /ランキング/ });
      const backBtn = () => screen.getAllByText('ロビーへ戻る')[0];

      fireEvent.click(lbBtn()); // t=0: LOBBY -> LEADERBOARD (1st call's timeout fires at t=2000)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      fireEvent.click(backBtn()); // t=500: LEADERBOARD -> LOBBY
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      fireEvent.click(lbBtn()); // t=1000: LOBBY -> LEADERBOARD (2nd call's timeout fires at t=3000)
      expect(screen.getAllByText('リーダーボード').length).toBeGreaterThan(0);

      // 外部要因によるURL変化を模倣する。
      mockGet.mockReturnValue('GAME');

      // t=2000: 1回目の呼び出しのタイムアウトが発火するが、現在の
      // pendingViewRefは2回目の呼び出しのものなので解除されてはならない。
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      rerender(<HomeContent />);
      expect(screen.getAllByText('リーダーボード').length).toBeGreaterThan(0);

      // t=3000: 2回目の呼び出し自身のタイムアウトが発火し、ここでようやく
      // ガードが解除されて外部URL変化が反映される。
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      rerender(<HomeContent />);
      expect(screen.getAllByText('対戦開始').length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('can navigate to SCOREBOARDS', async () => {
    render(<HomeContent />);
    const btn = screen.getByRole('button', { name: /過去のスコアボード一覧/ });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getAllByText('過去のスコアボード一覧').length).toBeGreaterThan(0);
    });
  });

  it('can navigate to GAME, start a match and play a turn (human setting)', async () => {
    render(<HomeContent />);
    
    const gameBtn = screen.getByRole('button', { name: /人間対AI/ });
    fireEvent.click(gameBtn);
    
    await waitFor(() => {
      expect(screen.getAllByText('対戦開始').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText('対戦開始')[0]);

    await waitFor(() => {
      expect(screen.getAllByText('あなたの番です: 電流を仕掛ける椅子を選んでください (AIが座る椅子を選びます)', { exact: false }).length).toBeGreaterThan(0);
    });

    // 椅子クリック (Turn 1: Human is setter)
    const chairBtns = screen.getAllByRole('button').filter(b => b.textContent?.includes('#2'));
    fireEvent.click(chairBtns[0]); // 仕掛ける

    await waitFor(() => {
      expect(screen.getAllByText(/最終結果を見る|次のターンへ/)[0]).toBeDefined();
    });
  });

  it('ignores a stale turn resolution that completes while away from the game, instead of silently advancing the turn in the background', async () => {
    // 1500msのsleepを意図的に解決させず、後から手動で解決できるようにする
    let resolveStaleSleep: (() => void) | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).setTimeout = (cb: any, ms?: number, ...args: any[]) => {
      if (ms === 1500) {
        resolveStaleSleep = () => cb(...args);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return {} as any;
      }
      return originalSetTimeout(cb, ms, ...args);
    };

    render(<HomeContent />);

    // ターン1を開始し、1500msのsleep(AI思考中)で一時停止させる
    fireEvent.click(screen.getByRole('button', { name: /人間対AI/ }));
    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('対戦開始')[0]);
    await waitFor(() => {
      expect(screen.getAllByText(/電流を仕掛ける椅子を選んでください/)[0]).toBeDefined();
    });

    const chairBtns = screen.getAllByRole('button').filter(b => b.textContent?.includes('#2'));
    fireEvent.click(chairBtns[0]);

    await waitFor(() => {
      expect(resolveStaleSleep).not.toBeNull();
    });
    await waitFor(() => {
      expect(screen.getAllByText(/AIが座る椅子を選んでいます/)[0]).toBeDefined();
    });

    // ターン処理が一時停止している間にロビーへ戻る
    fireEvent.click(screen.getByRole('button', { name: 'ロビーへ戻る' }));
    await waitFor(() => {
      expect(screen.getAllByText('人間対AI')[0]).toBeDefined();
    });

    // ロビーにいる間に、古いターン処理(sleep)が今になって解決する。
    // ロビーへ戻った時点で試合は破棄されているため、これが例外を投げたり
    // ロビーの表示を書き換えたりしてはならない
    await act(async () => {
      resolveStaleSleep!();
      await Promise.resolve();
    });
    expect(screen.getAllByText('人間対AI')[0]).toBeDefined();

    // 「ロビーへ戻る」で確認ダイアログに応じた時点で試合は破棄されるため、
    // 再度「人間対AI」を選んでも離脱前の状態は残っておらず、対戦相手選択画面
    // (対戦開始ボタン)から始まる
    fireEvent.click(screen.getByRole('button', { name: /人間対AI/ }));
    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });
    expect(screen.queryByText(/AIが座る椅子を選んでいます/)).toBeNull();
    expect(screen.queryByText(/最終結果を見る|次のターンへ/)).toBeNull();
  });

  it('hides the commentary placeholder instead of leaving it stuck when the commentary fetch fails', async () => {
    const defaultFetch = global.fetch;
    global.fetch = vi.fn((url: string | Request | URL, ...args) => {
      if (url.toString().includes('generate-commentary')) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
      }
      return defaultFetch(url, ...args);
    });

    render(<HomeContent />);
    fireEvent.click(screen.getByRole('button', { name: /人間対AI/ }));

    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('対戦開始')[0]);

    await waitFor(() => {
      expect(screen.getAllByText(/電流を仕掛ける椅子を選んでください/)[0]).toBeDefined();
    });

    const chairBtns = screen.getAllByRole('button').filter(b => b.textContent?.includes('#2'));
    fireEvent.click(chairBtns[0]);

    // 失敗時にエラー文言を出し続けるのではなく、実況エリア自体を消して
    // 「🎙️ 実況AIが状況を分析中...」のプレースホルダーが残り続けないことを確認する
    await waitFor(() => {
      expect(screen.queryByText(/実況AIが状況を分析中/)).toBeNull();
    });
    expect(screen.queryByText('解説の取得に失敗しました。')).toBeNull();
  });

  it('shows an offline-mode banner when the AI move API is unreachable and falls back to a random opponent', async () => {
    global.fetch = vi.fn((url: string | Request | URL) => {
      if (url.toString().includes('ai-move')) {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    render(<HomeContent />);
    fireEvent.click(screen.getByRole('button', { name: /人間対AI/ }));
    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('対戦開始')[0]);
    await waitFor(() => {
      expect(screen.getAllByText(/電流を仕掛ける椅子を選んでください/)[0]).toBeDefined();
    });

    const chairBtns = screen.getAllByRole('button').filter(b => b.textContent?.includes('#2'));
    fireEvent.click(chairBtns[0]);

    await waitFor(() => {
      expect(screen.getAllByText(/オフラインモード/)[0]).toBeDefined();
    });
  });

  it('does not show the offline-mode banner when the AI move API responds normally', async () => {
    render(<HomeContent />);
    fireEvent.click(screen.getByRole('button', { name: /人間対AI/ }));
    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('対戦開始')[0]);
    await waitFor(() => {
      expect(screen.getAllByText(/電流を仕掛ける椅子を選んでください/)[0]).toBeDefined();
    });

    const chairBtns = screen.getAllByRole('button').filter(b => b.textContent?.includes('#2'));
    fireEvent.click(chairBtns[0]);

    await waitFor(() => {
      expect(screen.getAllByText('次のターンへ')[0]).toBeDefined();
    });
    expect(screen.queryByText(/オフラインモード/)).toBeNull();
  });

  it('does not let a stale commentary response overwrite a newer turn (out-of-order network race)', async () => {
    const commentaryResolvers: Array<(value: unknown) => void> = [];
    let aiMoveCount = 0;
    global.fetch = vi.fn((url: string | Request | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('generate-commentary')) {
        return new Promise((resolve) => { commentaryResolvers.push(resolve as (value: unknown) => void); }) as Promise<Response>;
      }
      if (urlStr.includes('ai-move')) {
        aiMoveCount++;
        if (aiMoveCount === 1) return Promise.resolve({ ok: true, json: () => Promise.resolve({ chosenChair: 1, setChairs: [] }) } as Response);
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ chosenChair: 0, setChairs: [3] }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    render(<HomeContent />);
    fireEvent.click(screen.getByRole('button', { name: /人間対AI/ }));
    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('対戦開始')[0]);

    // ターン1: 人間が#1に仕掛ける -> コメンタリー取得(#1)が発行される(まだ応答しない)
    await waitFor(() => {
      expect(screen.getAllByText(/電流を仕掛ける椅子を選んでください/)[0]).toBeDefined();
    });
    const chairBtns1 = screen.getAllByRole('button').filter(b => b.textContent?.includes('#1'));
    fireEvent.click(chairBtns1[0]);

    await waitFor(() => {
      expect(commentaryResolvers.length).toBe(1);
    });
    await waitFor(() => {
      expect(screen.getAllByText('次のターンへ')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('次のターンへ')[0]);

    // ターン2: AIが仕掛け、人間が#4を選ぶ -> コメンタリー取得(#2)が発行される
    await waitFor(() => {
      expect(screen.getAllByText(/安全だと思う椅子を選んで座ってください/)[0]).toBeDefined();
    });
    const chairBtns2 = screen.getAllByRole('button').filter(b => b.textContent?.includes('#4'));
    fireEvent.click(chairBtns2[0]);

    await waitFor(() => {
      expect(commentaryResolvers.length).toBe(2);
    });

    // ターン2の応答を先に返す
    await act(async () => {
      commentaryResolvers[1]({ ok: true, json: () => Promise.resolve({ commentary: 'ターン2の実況' }) });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getAllByText('ターン2の実況')[0]).toBeDefined();
    });

    // 遅延していたターン1の応答が後から返ってきても、ターン2の実況を上書きしてはならない
    await act(async () => {
      commentaryResolvers[0]({ ok: true, json: () => Promise.resolve({ commentary: 'ターン1の実況(古い)' }) });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByText('ターン1の実況(古い)')).toBeNull();
    expect(screen.getAllByText('ターン2の実況')[0]).toBeDefined();
  });

  it('shows an electric design (not the thinking-face emoji) on the chair while setting the trap', async () => {
    // このテストでは1.5秒のsleepを自動解決させず、AI_THINKING中（罠を設定した直後）の表示を検証する
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).setTimeout = (cb: any, ms?: number, ...args: any[]) => {
      if (ms === 1500) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return {} as any;
      }
      return originalSetTimeout(cb, ms, ...args);
    };

    render(<HomeContent />);
    fireEvent.click(screen.getByRole('button', { name: /人間対AI/ }));

    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('対戦開始')[0]);

    await waitFor(() => {
      expect(screen.getAllByText(/電流を仕掛ける椅子を選んでください/)[0]).toBeDefined();
    });

    const chairBtns = screen.getAllByRole('button').filter(b => b.textContent?.includes('#2'));
    fireEvent.click(chairBtns[0]);

    await waitFor(() => {
      expect(screen.getAllByText(/AIが座る椅子を選んでいます/)[0]).toBeDefined();
    });

    const trapSetBtn = screen.getAllByRole('button').find(b => b.textContent?.includes('#2'));
    expect(trapSetBtn?.textContent?.includes('⚡')).toBe(true);
    expect(trapSetBtn?.textContent?.includes('🤔')).toBe(false);
  });

  it('plays game until end and tests various conditions', async () => {
    let aiMoveCount = 0;
    global.fetch = vi.fn((url: string | Request | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('ai-move')) {
        aiMoveCount++;
        if (aiMoveCount === 1) return Promise.resolve({ ok: true, json: () => Promise.resolve({ chosenChair: 1, setChairs: [] }) } as Response);
        if (aiMoveCount === 2) return Promise.resolve({ ok: true, json: () => Promise.resolve({ chosenChair: 0, setChairs: [3] }) } as Response);
        if (aiMoveCount === 3) return Promise.resolve({ ok: true, json: () => Promise.resolve({ chosenChair: 2, setChairs: [] }) } as Response);
      }
      if (urlStr.includes('save-match')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    render(<HomeContent />);
    fireEvent.click(screen.getByRole('button', { name: /人間対AI/ }));
    
    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('対戦開始')[0]);

    // Turn 1: Human sets 1, AI chooses 1 -> AI shocked
    await waitFor(() => {
      expect(screen.getAllByText(/電流を仕掛ける椅子を選んでください/)[0]).toBeDefined();
    });
    
    const chairBtns1 = screen.getAllByRole('button').filter(b => b.textContent?.includes('#1'));
    fireEvent.click(chairBtns1[0]);

    await waitFor(() => {
      expect(screen.getAllByText('次のターンへ')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('次のターンへ')[0]);

    // Turn 2: AI sets 3, Human chooses 4 -> Human safe
    await waitFor(() => {
      expect(screen.getAllByText(/安全だと思う椅子を選んで座ってください/)[0]).toBeDefined();
    });

    const chairBtns2 = screen.getAllByRole('button').filter(b => b.textContent?.includes('#4'));
    fireEvent.click(chairBtns2[0]);

    await waitFor(() => {
      expect(screen.getAllByText('次のターンへ')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('次のターンへ')[0]);

    // Turn 3: Human sets 2, AI chooses 2 -> AI shocked (AI shocks = 2 -> GAME OVER)
    await waitFor(() => {
      expect(screen.getAllByText(/電流を仕掛ける椅子を選んでください/)[0]).toBeDefined();
    });

    const chairBtns3 = screen.getAllByRole('button').filter(b => b.textContent?.includes('#2'));
    fireEvent.click(chairBtns3[0]);

    await waitFor(() => {
      expect(screen.getAllByText('最終結果を見る')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('最終結果を見る')[0]);

    // 結果画面が表示されるか
    await waitFor(() => {
      expect(screen.getAllByText('WINNER')[0]).toBeDefined();
      expect(screen.getAllByText('あなた (人間)')[0]).toBeDefined();
    });
  });

  it('reveals all AI-set trap chairs on result even when the human chooses safely', async () => {
    global.fetch = vi.fn((url: string | Request | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('ai-move')) {
        // AIが2番・3番の複数の椅子に電流を仕掛ける
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ chosenChair: 0, setChairs: [2, 3] }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    render(<HomeContent />);
    fireEvent.click(screen.getByRole('button', { name: /人間対AI/ }));

    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('対戦開始')[0]);

    // Turn 1: AIが仕掛け、人間が選ぶ番 (turn番号が偶数の場合に相当するロジックだが、初回は人間が仕掛ける番のため
    // 一度仕掛けて次のターンでAIが仕掛ける番に進める)
    await waitFor(() => {
      expect(screen.getAllByText(/電流を仕掛ける椅子を選んでください/)[0]).toBeDefined();
    });
    const setupChairBtns = screen.getAllByRole('button').filter(b => b.textContent?.includes('#1'));
    fireEvent.click(setupChairBtns[0]);

    await waitFor(() => {
      expect(screen.getAllByText('次のターンへ')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('次のターンへ')[0]);

    // Turn 2: AIが2番・3番に電流を仕掛け、人間は安全な4番を選ぶ
    await waitFor(() => {
      expect(screen.getAllByText(/安全だと思う椅子を選んで座ってください/)[0]).toBeDefined();
    });
    const safeChairBtns = screen.getAllByRole('button').filter(b => b.textContent?.includes('#4'));
    fireEvent.click(safeChairBtns[0]);

    await waitFor(() => {
      expect(screen.getAllByText('次のターンへ')[0]).toBeDefined();
    });

    // 答え合わせ画面で、AIが仕掛けた2番・3番の椅子がどちらも⚡付きで明示されている
    const trapChairBtn2 = screen.getAllByRole('button').find(
      b => b.textContent?.includes('#2') && b.textContent?.includes('⚡')
    );
    const trapChairBtn3 = screen.getAllByRole('button').find(
      b => b.textContent?.includes('#3') && b.textContent?.includes('⚡')
    );
    expect(trapChairBtn2).toBeDefined();
    expect(trapChairBtn3).toBeDefined();

    fireEvent.click(screen.getAllByText('次のターンへ')[0]);

    // 次のターンに進むと、3番の椅子は通常表示に戻る (まだ選択可能なため)
    await waitFor(() => {
      const resetChairBtn = screen.getAllByRole('button').find(b => b.textContent?.includes('#3'));
      expect(resetChairBtn?.textContent?.includes('🪑')).toBe(true);
    });
  });

  it('reveals the trap chair in PVP mode when the chooser picks safely, mirroring the human-vs-AI reveal', async () => {
    render(<HomeContent />);
    fireEvent.click(screen.getByRole('button', { name: /人対人/ }));

    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('対戦開始')[0]);

    await waitFor(() => {
      expect(screen.getAllByText(/プレイヤー1が電流を仕掛ける番です。/)[0]).toBeDefined();
    });
    // P1が3番に仕掛ける
    fireEvent.click(screen.getAllByRole('button').filter(b => b.textContent?.includes('#3'))[0]);

    await waitFor(() => {
      expect(screen.getAllByText('準備完了 (画面を渡しました)')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('準備完了 (画面を渡しました)')[0]);

    await waitFor(() => {
      expect(screen.getAllByText('プレイヤー2の番です。座る椅子を選んでください。')[0]).toBeDefined();
    });
    // P2は安全な1番を選ぶ(3番の罠は踏まない)
    fireEvent.click(screen.getAllByRole('button').filter(b => b.textContent?.includes('#1'))[0]);

    await waitFor(() => {
      expect(screen.getAllByText('次のターンへ')[0]).toBeDefined();
    });

    // 答え合わせ画面で、P1が仕掛けた3番の椅子が⚡付きで明示されている
    const trapChairBtn = screen.getAllByRole('button').find(
      b => b.textContent?.includes('#3') && b.textContent?.includes('⚡')
    );
    expect(trapChairBtn).toBeDefined();

    fireEvent.click(screen.getAllByText('次のターンへ')[0]);

    // 次のターンに進むと、3番の椅子は通常表示に戻る (まだ選択可能なため)
    await waitFor(() => {
      const resetChairBtn = screen.getAllByRole('button').find(b => b.textContent?.includes('#3'));
      expect(resetChairBtn?.textContent?.includes('🪑')).toBe(true);
    });
  });

  it('reaches a genuine DRAW in GAME mode via chair exhaustion with tied scores and shocks', async () => {
    let aiMoveCount = 0;
    global.fetch = vi.fn((url: string | Request | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('ai-move')) {
        aiMoveCount++;
        // Turn1(choose): AIは5番を選び安全。Turn2(set): AIは1番に仕掛ける(人間は3番へ)。
        // Turn3(choose): AIは2番を選び安全。Turn4(set): AIは1番に仕掛ける(人間は4番へ)。
        // p2 = 5+2 = 7、p1 = 3+4 = 7 で得点・感電数ともに同点のまま椅子が尽きる。
        if (aiMoveCount === 1) return Promise.resolve({ ok: true, json: () => Promise.resolve({ chosenChair: 5, setChairs: [] }) } as Response);
        if (aiMoveCount === 2) return Promise.resolve({ ok: true, json: () => Promise.resolve({ chosenChair: 0, setChairs: [1] }) } as Response);
        if (aiMoveCount === 3) return Promise.resolve({ ok: true, json: () => Promise.resolve({ chosenChair: 2, setChairs: [] }) } as Response);
        if (aiMoveCount === 4) return Promise.resolve({ ok: true, json: () => Promise.resolve({ chosenChair: 0, setChairs: [1] }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    render(<HomeContent />);
    fireEvent.click(screen.getByRole('button', { name: /人間対AI/ }));
    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('対戦開始')[0]);

    // Turn1: 人間が1番に仕掛け、AIが5番を選ぶ(安全)
    await waitFor(() => {
      expect(screen.getAllByText(/電流を仕掛ける椅子を選んでください/)[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByRole('button').filter(b => b.textContent?.includes('#1'))[0]);
    await waitFor(() => {
      expect(screen.getAllByText('次のターンへ')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('次のターンへ')[0]);

    // Turn2: AIが仕掛け、人間は3番を選ぶ(安全)
    await waitFor(() => {
      expect(screen.getAllByText(/安全だと思う椅子を選んで座ってください/)[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByRole('button').filter(b => b.textContent?.includes('#3'))[0]);
    await waitFor(() => {
      expect(screen.getAllByText('次のターンへ')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('次のターンへ')[0]);

    // Turn3: 人間が1番に仕掛け、AIが2番を選ぶ(安全)
    await waitFor(() => {
      expect(screen.getAllByText(/電流を仕掛ける椅子を選んでください/)[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByRole('button').filter(b => b.textContent?.includes('#1'))[0]);
    await waitFor(() => {
      expect(screen.getAllByText('次のターンへ')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('次のターンへ')[0]);

    // Turn4: AIが仕掛け、人間は4番を選ぶ(安全) -> 残り椅子1つで試合終了、同点のためDRAW
    await waitFor(() => {
      expect(screen.getAllByText(/安全だと思う椅子を選んで座ってください/)[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByRole('button').filter(b => b.textContent?.includes('#4'))[0]);
    await waitFor(() => {
      expect(screen.getAllByText('最終結果を見る')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('最終結果を見る')[0]);

    await waitFor(() => {
      expect(screen.getAllByText('DRAW')[0]).toBeDefined();
      expect(screen.getAllByText('引き分け')[0]).toBeDefined();
    });
  });

  it('recovers to an operable IDLE state instead of crashing when the AI response is malformed', async () => {
    global.fetch = vi.fn((url: string | Request | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('ai-move')) {
        // setChairsが欠落した不正なレスポンス。AIが仕掛ける番でaiSetChairs.includes(...)が
        // 例外を投げ、handleGameChairClickのcatchブロックに到達することを確認する。
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ chosenChair: 0 }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    render(<HomeContent />);
    fireEvent.click(screen.getByRole('button', { name: /人間対AI/ }));
    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('対戦開始')[0]);

    // Turn1: 人間が仕掛ける番を1回消化し、Turn2でAIが仕掛ける番(不正レスポンス)に進める
    await waitFor(() => {
      expect(screen.getAllByText(/電流を仕掛ける椅子を選んでください/)[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByRole('button').filter(b => b.textContent?.includes('#1'))[0]);
    await waitFor(() => {
      expect(screen.getAllByText('次のターンへ')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('次のターンへ')[0]);

    // Turn2: AIが仕掛け、人間が選ぶと不正なレスポンスにより例外が発生する
    await waitFor(() => {
      expect(screen.getAllByText(/安全だと思う椅子を選んで座ってください/)[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByRole('button').filter(b => b.textContent?.includes('#3'))[0]);

    // クラッシュせず、gameStepがIDLEに戻ってターン開始プロンプトが再表示され、
    // プレイヤーが操作を継続できる状態に復帰していること(catchブロックのリカバリを検証)。
    await waitFor(() => {
      expect(screen.getAllByText(/電流を仕掛ける椅子を選んでください|安全だと思う椅子を選んで座ってください/)[0]).toBeDefined();
    });
    const nextChairBtn = screen.getAllByRole('button').filter(b => b.textContent?.includes('#'));
    expect(nextChairBtn.some(b => !b.hasAttribute('disabled'))).toBe(true);
  });

  it('renders Home wrapper component', () => {
    render(<Home />);
    expect(screen.getAllByText('人間対AI')[0]).toBeDefined();
  });

  it('covers error handling in fetch functions and local storage mock fallback', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    
    // local storage is empty, so mock data will be used
    render(<HomeContent />);
    const btn = screen.getByRole('button', { name: /過去のスコアボード一覧/ });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.queryByText('過去の対戦記録がありません。')).toBeNull();
      expect(screen.getAllByText(/match-1718970000000/).length).toBeGreaterThan(0);
    });
  });

  it('loads matches from local storage if API fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    
    const customMatches = [
      {
        matchId: 'match-custom-123',
        player1Id: 'ai-okano',
        player2Id: 'ai-random',
        winnerId: 'ai-random',
        ratingDiff: 10,
        createdAt: new Date().toISOString(),
        logs: []
      }
    ];
    window.localStorage.setItem('electric_chair_matches', JSON.stringify(customMatches));

    render(<HomeContent />);
    const btn = screen.getByRole('button', { name: /過去のスコアボード一覧/ });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getAllByText(/match-custom-123/).length).toBeGreaterThan(0);
    });
  });

  it('filters out a locally stored match record with an invalid mode value, but keeps a valid one', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const customMatches = [
      {
        matchId: 'match-with-bad-mode',
        player1Id: 'ai-okano',
        player2Id: 'ai-random',
        winnerId: 'ai-random',
        ratingDiff: 10,
        createdAt: new Date().toISOString(),
        logs: [],
        mode: 'not-a-real-mode'
      },
      {
        // matchIdのprefixだけを見ると'human'に見えるが、明示的なmode: 'pvp'を優先すべきレコード
        matchId: 'match-with-explicit-pvp-mode',
        player1Id: 'p1',
        player2Id: 'p2',
        winnerId: 'p1',
        ratingDiff: 0,
        createdAt: new Date().toISOString(),
        logs: [],
        mode: 'pvp'
      }
    ];
    window.localStorage.setItem('electric_chair_matches', JSON.stringify(customMatches));

    render(<HomeContent />);
    const btn = screen.getByRole('button', { name: /過去のスコアボード一覧/ });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getAllByText(/match-with-explicit-pvp-mode/).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/match-with-bad-mode/)).toBeNull();
  });

  it('covers fallback in getAiMoveMock', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    
    render(<HomeContent />);
    fireEvent.click(screen.getByRole('button', { name: /人間対AI/ }));

    // GAME画面の「ロビーへ戻る」をクリックしてカバーする
    fireEvent.click(screen.getAllByText('ロビーへ戻る')[0]);
    fireEvent.click(screen.getByRole('button', { name: /人間対AI/ }));

    // selectのonChangeをカバーする
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'ai-random' } });
    
    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('対戦開始')[0]);

    await waitFor(() => {
      expect(screen.getAllByText(/電流を仕掛ける椅子を選んでください/)[0]).toBeDefined();
    });
    
    const chairBtns1 = screen.getAllByRole('button').filter(b => b.textContent?.includes('#1'));
    fireEvent.click(chairBtns1[0]);

    await waitFor(() => {
      expect(screen.getAllByText(/次のターンへ|最終結果を見る/)[0]).toBeDefined();
    });
  });

  it('navigates via URL param', () => {
    mockGet.mockReturnValue('SCOREBOARDS');
    render(<HomeContent />);
    expect(screen.getAllByText('過去のスコアボード一覧').length).toBeGreaterThan(0);
  });

  it('handles RESULT view and DRAW/WINNER', () => {
    mockGet.mockReturnValue('RESULT');
    render(<HomeContent />);
  });

  it('can navigate to PVP_GAME, start a match and play a turn', async () => {
    render(<HomeContent />);
    const pvpBtn = screen.getByRole('button', { name: /人対人/ });
    fireEvent.click(pvpBtn);

    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });

    fireEvent.click(screen.getAllByText('対戦開始')[0]);

    await waitFor(() => {
      expect(screen.getAllByText('プレイヤー1が電流を仕掛ける番です。プレイヤー2は画面を見ないでください。')[0]).toBeDefined();
    });

    // P1 sets chair 1
    const chairBtns1 = screen.getAllByRole('button').filter(b => b.textContent?.includes('#1'));
    fireEvent.click(chairBtns1[0]);

    await waitFor(() => {
      expect(screen.getAllByText('準備完了 (画面を渡しました)')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('準備完了 (画面を渡しました)')[0]);

    await waitFor(() => {
      expect(screen.getAllByText('プレイヤー2の番です。座る椅子を選んでください。')[0]).toBeDefined();
    });

    // P2 chooses chair 2
    const chairBtns2 = screen.getAllByRole('button').filter(b => b.textContent?.includes('#2'));
    fireEvent.click(chairBtns2[0]);

    await waitFor(() => {
      expect(screen.getAllByText('次のターンへ')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('次のターンへ')[0]);

    await waitFor(() => {
      expect(screen.getAllByText('プレイヤー2が電流を仕掛ける番です。')[0]).toBeDefined();
    });

    // P2 sets chair 3
    const chairBtns3 = screen.getAllByRole('button').filter(b => b.textContent?.includes('#3'));
    fireEvent.click(chairBtns3[0]);

    await waitFor(() => {
      expect(screen.getAllByText('準備完了 (画面を渡しました)')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('準備完了 (画面を渡しました)')[0]);

    await waitFor(() => {
      expect(screen.getAllByText('プレイヤー1の番です。座る椅子を選んでください。')[0]).toBeDefined();
    });

    // P1 chooses chair 3 (Shocked)
    const chairBtns4 = screen.getAllByRole('button').filter(b => b.textContent?.includes('#3'));
    fireEvent.click(chairBtns4[0]);

    await waitFor(() => {
      expect(screen.getAllByText('次のターンへ')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('次のターンへ')[0]);

    await waitFor(() => {
      expect(screen.getAllByText('プレイヤー1が電流を仕掛ける番です。')[0]).toBeDefined();
    });
  });

  it('PVP game ends correctly when winning condition is met (3 shocks)', async () => {
    let callCount = 0;
    global.fetch = vi.fn((url: string | Request | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('ai-move')) {
        callCount++;
        // For PVP mode, return the last remaining chair to ensure shock
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ chosenChair: 5, setChairs: [5] })
        } as Response);
      }
      if (urlStr.includes('save-match')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    render(<HomeContent />);
    const pvpBtn = screen.getByRole('button', { name: /人対人/ });
    fireEvent.click(pvpBtn);

    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });

    fireEvent.click(screen.getAllByText('対戦開始')[0]);

    // Turn 1: P1 sets chair 3, P2 chooses chair 3 (Shocked) - P2 gets 1 shock
    await waitFor(() => {
      expect(screen.getAllByText(/プレイヤー1が電流を仕掛ける番です。/)[0]).toBeDefined();
    });

    const chairBtns1 = screen.getAllByRole('button').filter(b => b.textContent?.includes('#3'));
    fireEvent.click(chairBtns1[0]);

    await waitFor(() => {
      expect(screen.getAllByText('準備完了 (画面を渡しました)')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('準備完了 (画面を渡しました)')[0]);

    await waitFor(() => {
      expect(screen.getAllByText('プレイヤー2の番です。座る椅子を選んでください。')[0]).toBeDefined();
    });

    const chairBtns2 = screen.getAllByRole('button').filter(b => b.textContent?.includes('#3'));
    fireEvent.click(chairBtns2[0]);

    await waitFor(() => {
      expect(screen.getAllByText('次のターンへ')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('次のターンへ')[0]);

    // Turn 2: P2 sets chair 2, P1 chooses chair 2 (Shocked) - P1 gets 1 shock
    await waitFor(() => {
      expect(screen.getAllByText('プレイヤー2が電流を仕掛ける番です。')[0]).toBeDefined();
    });

    const chairBtns3 = screen.getAllByRole('button').filter(b => b.textContent?.includes('#2'));
    fireEvent.click(chairBtns3[0]);

    await waitFor(() => {
      expect(screen.getAllByText('準備完了 (画面を渡しました)')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('準備完了 (画面を渡しました)')[0]);

    await waitFor(() => {
      expect(screen.getAllByText('プレイヤー1の番です。座る椅子を選んでください。')[0]).toBeDefined();
    });

    const chairBtns4 = screen.getAllByRole('button').filter(b => b.textContent?.includes('#2'));
    fireEvent.click(chairBtns4[0]);

    await waitFor(() => {
      expect(screen.getAllByText('次のターンへ')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('次のターンへ')[0]);

    // Turn 3: P1 sets chair 5, P2 chooses chair 5 (Shocked) - P2 gets 2 shocks and loses (MAX_SHOCKS = 2)
    await waitFor(() => {
      expect(screen.getAllByText('プレイヤー1が電流を仕掛ける番です。')[0]).toBeDefined();
    });

    const chairBtns5 = screen.getAllByRole('button').filter(b => b.textContent?.includes('#5'));
    fireEvent.click(chairBtns5[0]);

    await waitFor(() => {
      expect(screen.getAllByText('準備完了 (画面を渡しました)')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('準備完了 (画面を渡しました)')[0]);

    await waitFor(() => {
      expect(screen.getAllByText('プレイヤー2の番です。座る椅子を選んでください。')[0]).toBeDefined();
    });

    const chairBtns6 = screen.getAllByRole('button').filter(b => b.textContent?.includes('#5'));
    fireEvent.click(chairBtns6[0]);

    // Game should end here (P2 has 2 shocks = MAX_SHOCKS)
    await waitFor(() => {
      expect(screen.getAllByText('最終結果を見る')[0]).toBeDefined();
    });

    // Click to see final result
    fireEvent.click(screen.getAllByText('最終結果を見る')[0]);

    // Should show WINNER screen in PVP_GAME view
    await waitFor(() => {
      expect(screen.getAllByText('WINNER')[0]).toBeDefined();
      expect(screen.getAllByText('プレイヤー1')[0]).toBeDefined();
    });
    
    // Verify we're still in PVP_GAME view (not RESULT view)
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('view=PVP_GAME'), { scroll: false });

    // 保存された試合記録に明示的なmodeが付与され、matchIdの文字列prefixに
    // 頼らずモードを復元できること
    const savedMatchesCall = (window.localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls
      .find(([key]) => key === 'electric_chair_matches');
    expect(savedMatchesCall).toBeDefined();
    expect(JSON.parse(savedMatchesCall![1])[0].mode).toBe('pvp');
  });

  it('reaches a genuine DRAW in PVP mode via chair exhaustion with tied scores and shocks', async () => {
    render(<HomeContent />);
    fireEvent.click(screen.getByRole('button', { name: /人対人/ }));

    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('対戦開始')[0]);

    await waitFor(() => {
      expect(screen.getAllByText('プレイヤー1が電流を仕掛ける番です。プレイヤー2は画面を見ないでください。')[0]).toBeDefined();
    });

    // Turn1(P1が仕掛け,P2が選ぶ): P1は1番に仕掛け、P2は5番を選ぶ(安全) -> p2 += 5
    fireEvent.click(screen.getAllByRole('button').filter(b => b.textContent?.includes('#1'))[0]);
    await waitFor(() => {
      expect(screen.getAllByText('準備完了 (画面を渡しました)')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('準備完了 (画面を渡しました)')[0]);
    await waitFor(() => {
      expect(screen.getAllByText('プレイヤー2の番です。座る椅子を選んでください。')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByRole('button').filter(b => b.textContent?.includes('#5'))[0]);
    await waitFor(() => {
      expect(screen.getAllByText('次のターンへ')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('次のターンへ')[0]);

    // Turn2(P2が仕掛け,P1が選ぶ): P2は1番に仕掛け、P1は3番を選ぶ(安全) -> p1 += 3
    await waitFor(() => {
      expect(screen.getAllByText('プレイヤー2が電流を仕掛ける番です。')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByRole('button').filter(b => b.textContent?.includes('#1'))[0]);
    await waitFor(() => {
      expect(screen.getAllByText('準備完了 (画面を渡しました)')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('準備完了 (画面を渡しました)')[0]);
    await waitFor(() => {
      expect(screen.getAllByText('プレイヤー1の番です。座る椅子を選んでください。')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByRole('button').filter(b => b.textContent?.includes('#3'))[0]);
    await waitFor(() => {
      expect(screen.getAllByText('次のターンへ')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('次のターンへ')[0]);

    // Turn3(P1が仕掛け,P2が選ぶ): P1は1番に仕掛け、P2は2番を選ぶ(安全) -> p2 += 2 (合計7)
    await waitFor(() => {
      expect(screen.getAllByText('プレイヤー1が電流を仕掛ける番です。')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByRole('button').filter(b => b.textContent?.includes('#1'))[0]);
    await waitFor(() => {
      expect(screen.getAllByText('準備完了 (画面を渡しました)')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('準備完了 (画面を渡しました)')[0]);
    await waitFor(() => {
      expect(screen.getAllByText('プレイヤー2の番です。座る椅子を選んでください。')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByRole('button').filter(b => b.textContent?.includes('#2'))[0]);
    await waitFor(() => {
      expect(screen.getAllByText('次のターンへ')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('次のターンへ')[0]);

    // Turn4(P2が仕掛け,P1が選ぶ): P2は1番に仕掛け、P1は4番を選ぶ(安全) -> p1 += 4 (合計7)
    // 残り椅子が1つになり試合終了、得点・感電数ともに同点のためDRAW
    await waitFor(() => {
      expect(screen.getAllByText('プレイヤー2が電流を仕掛ける番です。')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByRole('button').filter(b => b.textContent?.includes('#1'))[0]);
    await waitFor(() => {
      expect(screen.getAllByText('準備完了 (画面を渡しました)')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('準備完了 (画面を渡しました)')[0]);
    await waitFor(() => {
      expect(screen.getAllByText('プレイヤー1の番です。座る椅子を選んでください。')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByRole('button').filter(b => b.textContent?.includes('#4'))[0]);

    await waitFor(() => {
      expect(screen.getAllByText('最終結果を見る')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('最終結果を見る')[0]);

    await waitFor(() => {
      expect(screen.getAllByText('DRAW')[0]).toBeDefined();
      expect(screen.getAllByText('引き分け')[0]).toBeDefined();
    });
  });

  it('offers to resume a match found in session storage on mount, and restores it on confirmation', async () => {
    const savedMatch = {
      matchId: 'match-human-1',
      mode: 'human',
      player1: { playerId: 'human', name: 'あなた (人間)', type: 'human', rating: 1500, winCount: 0, matchCount: 0 },
      player2: { playerId: 'ai-okano', name: '岡野陽一風AI', type: 'personality', rating: 1550, winCount: 0, matchCount: 0 },
      winner: '',
      ratingDiff: 0,
      scores: { p1: 0, p2: 3 },
      shocks: { p1: 0, p2: 0 },
      logs: [
        { turn: 1, isHumanSetter: true, chosenChair: 2, isShocked: false, remainingChairs: [1, 3, 4, 5], scores: { p1: 0, p2: 3 }, shocks: { p1: 0, p2: 0 } }
      ]
    };
    window.sessionStorage.setItem('electric_chair_active_match', JSON.stringify(savedMatch));

    render(<HomeContent />);

    await waitFor(() => {
      expect(screen.getByText('前回の試合を再開しますか？')).toBeDefined();
    });

    // 復帰確認モーダルの表示中は、選択されるまでsessionStorageの保存内容を消してはならない
    // (消してしまうと、選択前にもう一度リロードされた際に復帰できなくなる)
    expect(window.sessionStorage.getItem('electric_chair_active_match')).not.toBeNull();

    fireEvent.click(screen.getByText('再開する'));

    // Turn2はAIが仕掛け側のため、人間が座る椅子を選ぶプロンプトへ復帰する
    await waitFor(() => {
      expect(screen.getAllByText(/安全だと思う椅子を選んで座ってください/)[0]).toBeDefined();
    });
    expect(screen.queryByText('前回の試合を再開しますか？')).toBeNull();
  });

  it('discards the resumable match found in session storage without restoring it', async () => {
    const savedMatch = {
      matchId: 'match-human-2',
      mode: 'human',
      player1: { playerId: 'human', name: 'あなた (人間)', type: 'human', rating: 1500, winCount: 0, matchCount: 0 },
      player2: { playerId: 'ai-okano', name: '岡野陽一風AI', type: 'personality', rating: 1550, winCount: 0, matchCount: 0 },
      winner: '',
      ratingDiff: 0,
      scores: { p1: 0, p2: 0 },
      shocks: { p1: 0, p2: 0 },
      logs: []
    };
    window.sessionStorage.setItem('electric_chair_active_match', JSON.stringify(savedMatch));

    render(<HomeContent />);

    await waitFor(() => {
      expect(screen.getByText('前回の試合を再開しますか？')).toBeDefined();
    });

    fireEvent.click(screen.getByText('破棄する'));

    await waitFor(() => {
      expect(screen.queryByText('前回の試合を再開しますか？')).toBeNull();
    });
    expect(window.sessionStorage.getItem('electric_chair_active_match')).toBeNull();
    expect(screen.getAllByText('人間対AI')[0]).toBeDefined();
  });

  it('disables the start button until the opponent list has loaded, and enables it once ready', async () => {
    render(<HomeContent />);
    fireEvent.click(screen.getByRole('button', { name: /人間対AI/ }));

    // 対戦相手一覧(players/player2Id)のfetchはuseEffect内の非同期処理のため、
    // ここではまだ解決していない。この時点でボタンが押せてしまうと、
    // startHumanMatchがplayers.find(...)でundefinedを返しクラッシュする。
    const startBtn = screen.getAllByText('対戦開始')[0];
    expect(startBtn.hasAttribute('disabled')).toBe(true);

    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0].hasAttribute('disabled')).toBe(false);
    });
  });

  it('keeps the player in the active match when leaving via "ロビーへ戻る" is cancelled', async () => {
    window.confirm = vi.fn().mockReturnValue(false);

    render(<HomeContent />);
    fireEvent.click(screen.getByRole('button', { name: /人間対AI/ }));
    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('対戦開始')[0]);
    await waitFor(() => {
      expect(screen.getAllByText(/電流を仕掛ける椅子を選んでください/)[0]).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'ロビーへ戻る' }));

    expect(window.confirm).toHaveBeenCalled();
    expect(screen.getAllByText(/電流を仕掛ける椅子を選んでください/)[0]).toBeDefined();
  });

  it('persists the in-progress match to session storage and clears it once the match ends', async () => {
    render(<HomeContent />);
    fireEvent.click(screen.getByRole('button', { name: /人間対AI/ }));
    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('対戦開始')[0]);

    await waitFor(() => {
      expect(window.sessionStorage.setItem).toHaveBeenCalledWith(
        'electric_chair_active_match',
        expect.stringContaining('"matchId"')
      );
    });
  });

  it('warns via the browser-native prompt before leaving the page while a match is active', async () => {
    render(<HomeContent />);
    fireEvent.click(screen.getByRole('button', { name: /人間対AI/ }));
    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('対戦開始')[0]);
    await waitFor(() => {
      expect(screen.getAllByText(/電流を仕掛ける椅子を選んでください/)[0]).toBeDefined();
    });

    const event = new Event('beforeunload', { cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('shows the AI reasoning bubble after a turn resolves when the API provides one', async () => {
    global.fetch = vi.fn((url: string | Request | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('ai-move')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ chosenChair: 1, setChairs: [2], reasoning: 'ここは絶対安全なはず。' })
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    render(<HomeContent />);
    fireEvent.click(screen.getByRole('button', { name: /人間対AI/ }));
    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('対戦開始')[0]);
    await waitFor(() => {
      expect(screen.getAllByText(/電流を仕掛ける椅子を選んでください/)[0]).toBeDefined();
    });

    const chairBtns = screen.getAllByRole('button').filter(b => b.textContent?.includes('#2'));
    fireEvent.click(chairBtns[0]);

    await waitFor(() => {
      expect(screen.getAllByText(/ここは絶対安全なはず。/)[0]).toBeDefined();
    });
  });

  it('does not show a reasoning bubble when the AI move API omits one (e.g. offline fallback)', async () => {
    render(<HomeContent />);
    fireEvent.click(screen.getByRole('button', { name: /人間対AI/ }));
    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('対戦開始')[0]);
    await waitFor(() => {
      expect(screen.getAllByText(/電流を仕掛ける椅子を選んでください/)[0]).toBeDefined();
    });

    const chairBtns = screen.getAllByRole('button').filter(b => b.textContent?.includes('#2'));
    fireEvent.click(chairBtns[0]);

    await waitFor(() => {
      expect(screen.getAllByText('次のターンへ')[0]).toBeDefined();
    });
    expect(screen.queryByText(/🗯️/)).toBeNull();
  });

  it('shows saved AI reasoning for each turn in the past scoreboards list', async () => {
    global.fetch = vi.fn((url: string | Request | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('get-matches')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            matches: [{
              matchId: 'match-human-reasoning-1',
              player1Id: 'human',
              player2Id: 'ai-okano',
              winnerId: 'human',
              ratingDiff: 10,
              createdAt: new Date().toISOString(),
              logs: [
                { turn: 1, isHumanSetter: true, chosenChair: 1, isShocked: false, remainingChairs: [2, 3, 4, 5], scores: { p1: 0, p2: 1 }, shocks: { p1: 0, p2: 0 }, reasoning: '安全な椅子を選びました。' }
              ]
            }]
          })
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    render(<HomeContent />);
    fireEvent.click(screen.getByRole('button', { name: /過去のスコアボード一覧/ }));

    await waitFor(() => {
      expect(screen.getByText(/安全な椅子を選びました。/)).toBeDefined();
    });
  });

  it('opens and closes the rules modal from the lobby', async () => {
    render(<HomeContent />);

    fireEvent.click(screen.getByRole('button', { name: '📖 ルール説明' }));
    await waitFor(() => {
      expect(screen.getByText('ルール説明')).toBeDefined();
    });
    expect(screen.getByText(/先に10点を取ったプレイヤーの勝利です/)).toBeDefined();

    fireEvent.click(screen.getAllByRole('button', { name: '閉じる' })[0]);
    await waitFor(() => {
      expect(screen.queryByText('ルール説明')).toBeNull();
    });
  });

  it('shows an AI description in the lobby player list and the opponent select', async () => {
    render(<HomeContent />);

    await waitFor(() => {
      expect(screen.getByText('岡野陽一風AI')).toBeDefined();
    });
    expect(screen.getAllByText(/ギャンブラータイプ/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /人間対AI/ }));
    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });
    expect(screen.getAllByText(/安全志向タイプ|心理戦タイプ|ギャンブラータイプ|完全ランダム|期待値計算|ナッシュ均衡/).length).toBeGreaterThan(0);
  });

  it('shows the winning-score/shock-limit summary and remaining points during a human-vs-AI match', async () => {
    render(<HomeContent />);
    fireEvent.click(screen.getByRole('button', { name: /人間対AI/ }));
    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('対戦開始')[0]);

    await waitFor(() => {
      expect(screen.getAllByText(/10点先取 \/ 感電2回で敗北/)[0]).toBeDefined();
      expect(screen.getAllByText(/あなた: あと10点/)[0]).toBeDefined();
    });
  });

  it('toggles the sound mute setting, persists it to local storage, and stops playing sounds while muted', async () => {
    render(<HomeContent />);

    const muteButton = screen.getByRole('button', { name: '効果音をオフにする' });
    fireEvent.click(muteButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '効果音をオンにする' })).toBeDefined();
    });
    expect(window.localStorage.setItem).toHaveBeenCalledWith('electric_chair_muted', 'true');

    const audioCallsBefore = (window.Audio as unknown as ReturnType<typeof vi.fn>).mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: /人間対AI/ }));
    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('対戦開始')[0]);
    await waitFor(() => {
      expect(screen.getAllByText(/電流を仕掛ける椅子を選んでください/)[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByRole('button').filter(b => b.textContent?.includes('#1'))[0]);

    // ミュート中は新たにAudioが生成・再生されない
    expect((window.Audio as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(audioCallsBefore);

    // 再度クリックするとミュートが解除され、設定もfalseで保存される
    fireEvent.click(screen.getByRole('button', { name: '効果音をオンにする' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '効果音をオフにする' })).toBeDefined();
    });
    expect(window.localStorage.setItem).toHaveBeenCalledWith('electric_chair_muted', 'false');
  });

  it('restores a previously saved mute setting from local storage on mount', async () => {
    window.localStorage.setItem('electric_chair_muted', 'true');

    render(<HomeContent />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '効果音をオンにする' })).toBeDefined();
    });
  });

  it('shows a rematch button, the embedded scoreboard, and the AI rating change on the RESULT screen, and the rematch button starts a fresh match with the same opponent', async () => {
    let aiMoveCount = 0;
    global.fetch = vi.fn((url: string | Request | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('ai-move')) {
        aiMoveCount++;
        // Turn1(choose): 人間が仕掛けた#1にAIが座って感電(1回目)
        if (aiMoveCount === 1) return Promise.resolve({ ok: true, json: () => Promise.resolve({ chosenChair: 1, setChairs: [] }) } as Response);
        // Turn2(set): AIは#5に仕掛け、人間は#3を選んで安全
        if (aiMoveCount === 2) return Promise.resolve({ ok: true, json: () => Promise.resolve({ chosenChair: 0, setChairs: [5] }) } as Response);
        // Turn3(choose): 人間が仕掛けた#2にAIが座って感電(2回目, MAX_SHOCKSに到達し人間の勝利)
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ chosenChair: 2, setChairs: [] }) } as Response);
      }
      if (urlStr.includes('save-match')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, match: { aiRatingDiff: -16 } })
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    render(<HomeContent />);
    fireEvent.click(screen.getByRole('button', { name: /人間対AI/ }));
    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('対戦開始')[0]);

    // Turn1: 人間が#1に仕掛け、AIが感電(1回目)
    await waitFor(() => {
      expect(screen.getAllByText(/電流を仕掛ける椅子を選んでください/)[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByRole('button').filter(b => b.textContent?.includes('#1'))[0]);
    await waitFor(() => {
      expect(screen.getAllByText('次のターンへ')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('次のターンへ')[0]);

    // Turn2: AIが#5に仕掛け、人間は#3を選んで安全
    await waitFor(() => {
      expect(screen.getAllByText(/安全だと思う椅子を選んで座ってください/)[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByRole('button').filter(b => b.textContent?.includes('#3'))[0]);
    await waitFor(() => {
      expect(screen.getAllByText('次のターンへ')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('次のターンへ')[0]);

    // Turn3: 人間が#2に仕掛け、AIが感電(2回目) -> 人間の勝利
    await waitFor(() => {
      expect(screen.getAllByText(/電流を仕掛ける椅子を選んでください/)[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByRole('button').filter(b => b.textContent?.includes('#2'))[0]);
    await waitFor(() => {
      expect(screen.getAllByText('最終結果を見る')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('最終結果を見る')[0]);

    await waitFor(() => {
      expect(screen.getAllByText('WINNER')[0]).toBeDefined();
    });

    // 埋め込みスコアボードが表示されている
    expect(screen.getByText('★ ELECTRIC ARENA SCOREBOARD ★')).toBeDefined();

    // save-matchのレスポンスから受け取ったAIのレーティング変動が表示されている
    // (デフォルトの対戦相手は小籔千豊風AI: rating 1600)
    await waitFor(() => {
      expect(screen.getAllByText(/小籔千豊風AI/).length).toBeGreaterThan(0);
      expect(screen.getByText(/1600 → 1584/)).toBeDefined();
      expect(screen.getByText(/\(-16\)/)).toBeDefined();
    });

    // 「同じ相手と再戦」を押すと、同じ相手(小籔千豊風AI)との新しい対戦がGAME画面で始まる
    fireEvent.click(screen.getByRole('button', { name: '同じ相手と再戦' }));
    await waitFor(() => {
      expect(screen.getAllByText(/電流を仕掛ける椅子を選んでください/)[0]).toBeDefined();
    });
    expect(screen.getAllByText(/小籔千豊風AI/).length).toBeGreaterThan(0);
  });

  it('shows the opponent-selection screen again after leaving a finished match to the lobby, instead of skipping straight back into the old result', async () => {
    let aiMoveCount = 0;
    global.fetch = vi.fn((url: string | Request | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('ai-move')) {
        aiMoveCount++;
        if (aiMoveCount === 1) return Promise.resolve({ ok: true, json: () => Promise.resolve({ chosenChair: 1, setChairs: [] }) } as Response);
        if (aiMoveCount === 2) return Promise.resolve({ ok: true, json: () => Promise.resolve({ chosenChair: 0, setChairs: [5] }) } as Response);
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ chosenChair: 2, setChairs: [] }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    render(<HomeContent />);
    fireEvent.click(screen.getByRole('button', { name: /人間対AI/ }));
    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('対戦開始')[0]);

    await waitFor(() => {
      expect(screen.getAllByText(/電流を仕掛ける椅子を選んでください/)[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByRole('button').filter(b => b.textContent?.includes('#1'))[0]);
    await waitFor(() => {
      expect(screen.getAllByText('次のターンへ')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('次のターンへ')[0]);

    await waitFor(() => {
      expect(screen.getAllByText(/安全だと思う椅子を選んで座ってください/)[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByRole('button').filter(b => b.textContent?.includes('#3'))[0]);
    await waitFor(() => {
      expect(screen.getAllByText('次のターンへ')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('次のターンへ')[0]);

    await waitFor(() => {
      expect(screen.getAllByText(/電流を仕掛ける椅子を選んでください/)[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByRole('button').filter(b => b.textContent?.includes('#2'))[0]);
    await waitFor(() => {
      expect(screen.getAllByText('最終結果を見る')[0]).toBeDefined();
    });
    fireEvent.click(screen.getAllByText('最終結果を見る')[0]);
    await waitFor(() => {
      expect(screen.getAllByText('WINNER')[0]).toBeDefined();
    });

    // 決着済みの試合結果画面から「ロビーへ戻る」で抜け、再度「人間対AI」を選ぶと、
    // 直前の(決着済みの)試合結果表示ではなく対戦相手選択画面(対戦開始ボタン)から
    // 始まらなければならない
    fireEvent.click(screen.getAllByRole('button', { name: 'ロビーへ戻る' })[0]);
    await waitFor(() => {
      expect(screen.getAllByText('人間対AI')[0]).toBeDefined();
    });
    fireEvent.click(screen.getByRole('button', { name: /人間対AI/ }));
    await waitFor(() => {
      expect(screen.getAllByText('対戦開始')[0]).toBeDefined();
    });
    expect(screen.queryByText('WINNER')).toBeNull();
  });
});