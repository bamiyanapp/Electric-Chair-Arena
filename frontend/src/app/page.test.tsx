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
    MIN_CHAIRS_TO_END: 0,
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

  it('renders Home wrapper component', () => {
    render(<Home />);
    expect(screen.getAllByText('人間対AI')[0]).toBeDefined();
  });
  
  it('covers error handling in fetch functions', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    
    render(<HomeContent />);
    const btn = screen.getByRole('button', { name: /過去のスコアボード一覧/ });
    fireEvent.click(btn);
    
    await waitFor(() => {
      expect(screen.getAllByText('過去の対戦記録がありません。').length).toBeGreaterThan(0);
    });
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
});
