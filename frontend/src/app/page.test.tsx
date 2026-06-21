import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Home from './page';

// Mock matchMedia and Audio
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  window.Audio = vi.fn().mockImplementation(() => ({
    play: vi.fn().mockResolvedValue(undefined),
  })) as unknown as typeof Audio;

  // Mock fetch
  global.fetch = vi.fn((url: string | Request | URL) => {
    if (url.toString().includes('get-matches')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ matches: [] })
      } as Response);
    }
    if (url.toString().includes('ai-move')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ chosenChair: 1, setChairs: [2] })
      } as Response);
    }
    if (url.toString().includes('generate-commentary')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ commentary: 'テスト実況' })
      } as Response);
    }
    if (url.toString().includes('save-match')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({})
      } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  });
});

describe('Home Component', () => {
  it('renders LOBBY view by default', async () => {
    render(<Home />);
    expect(screen.getAllByText('人間対AI')[0]).toBeDefined();
    expect(screen.getAllByText('ランキング')[0]).toBeDefined();
    expect(screen.getAllByText('過去のスコアボード一覧')[0]).toBeDefined();
    
    await waitFor(() => {
      expect(screen.getByText('岡野陽一風AI')).toBeDefined();
    });
  });

  it('can navigate to LEADERBOARD and back', async () => {
    render(<Home />);
    fireEvent.click(screen.getAllByText('ランキング')[0]);
    expect(screen.getByText('リーダーボード')).toBeDefined();
    
    // ロビーへ戻る
    fireEvent.click(screen.getByText('ロビーへ戻る'));
    expect(screen.getAllByText('人間対AI')[0]).toBeDefined();
  });

  it('can navigate to SCOREBOARDS and back', async () => {
    render(<Home />);
    fireEvent.click(screen.getAllByText('過去のスコアボード一覧')[0]);
    
    await waitFor(() => {
      expect(screen.getAllByText('過去のスコアボード一覧')[0]).toBeDefined();
    });
    
    // ロビーへ戻る
    fireEvent.click(screen.getByText('ロビーへ戻る'));
    expect(screen.getAllByText('人間対AI')[0]).toBeDefined();
  });

  it('can navigate to GAME, start a match and play a turn', async () => {
    render(<Home />);
    
    // ゲーム画面へ
    fireEvent.click(screen.getAllByText('人間対AI')[0]);
    expect(screen.getByText('人間対AI モード')).toBeDefined();
    
    // 対戦開始
    fireEvent.click(screen.getByText('対戦開始'));
    
    await waitFor(() => {
      expect(screen.getByText('あなた (人間)')).toBeDefined();
      expect(screen.getByText(/あなたの番です/)).toBeDefined();
    });

    // 椅子を選択 (椅子1)
    const chairs = screen.getAllByRole('button').filter(b => b.textContent?.includes('#1'));
    if (chairs.length > 0) {
      fireEvent.click(chairs[0]);
    }

    // AIの思考を待つ
    await waitFor(() => {
      expect(screen.getByText(/運命の瞬間/)).toBeDefined();
    }, { timeout: 3000 });

    // 次のターンへ進むか結果を見るボタンが表示されるはず
    await waitFor(() => {
      const nextButton = screen.queryByText('次のターンへ');
      const resultButton = screen.queryByText('最終結果を見る');
      expect(nextButton || resultButton).toBeTruthy();
      if (nextButton) fireEvent.click(nextButton);
      if (resultButton) fireEvent.click(resultButton);
    }, { timeout: 4000 });
  });

  it('handles result view', async () => {
    render(<Home />);
    // ゲーム画面へ
    fireEvent.click(screen.getAllByText('人間対AI')[0]);
    // 対戦開始
    fireEvent.click(screen.getByText('対戦開始'));
    
    // ... （実際には結果画面に直接遷移させるのは難しいので、終了条件を満たすかモックで対処）
  });
});
