'use client';

import React, { useState, useEffect } from 'react';
import { GAME_RULES } from '../constants/rules';

type Player = {
  id: string;
  name: string;
  description: string;
  rating: number;
  winCount: number;
  lossCount: number;
};

type MatchResult = {
  id: string;
  player1: Player;
  player2: Player;
  scores: { p1: number; p2: number };
  shocks: { p1: number; p2: number };
  winner: string;
  ratingDiff: number;
  log: any[];
  createdAt: string;
};

export default function Home() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [player1Id, setPlayer1Id] = useState<string>('');
  const [player2Id, setPlayer2Id] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 実際にはバックエンドAPIから取得するが、今回はモックデータで代替
  useEffect(() => {
    // mock players for frontend only usage since backend might not be running
    const mockPlayers = [
      { id: 'ai-random', name: 'ランダムAI', description: '完全にランダムに椅子を選び、電流をセットする。', rating: 1450, winCount: 12, lossCount: 15 },
      { id: 'ai-cautious', name: '慎重派AI', description: '低得点の安全な椅子を狙い、電流を散らす。', rating: 1500, winCount: 18, lossCount: 17 },
      { id: 'ai-aggressive', name: 'アグレッシブAI', description: '常に高得点の椅子を狙い、相手に高いプレッシャーをかける。', rating: 1520, winCount: 22, lossCount: 20 },
      { id: 'ai-smart', name: 'カウンティングAI', description: '確率と期待値を計算し、最適な椅子を判定する。', rating: 1580, winCount: 30, lossCount: 18 },
    ];
    setPlayers(mockPlayers);
    setPlayer1Id(mockPlayers[0].id);
    setPlayer2Id(mockPlayers[1].id);
  }, []);

  const handleSimulate = async () => {
    setLoading(true);
    setError('');
    try {
      // 本来はバックエンドの /simulate エンドポイントを叩く
      // ここではフロントエンドのみで完結する簡易シミュレーションを実装
      const p1 = players.find(p => p.id === player1Id) || players[0];
      const p2 = players.find(p => p.id === player2Id) || players[1];

      // シミュレーション結果をモック生成
      const mockMatch: MatchResult = {
        id: `match-${Date.now()}`,
        player1: p1,
        player2: p2,
        scores: { p1: 20, p2: 40 },
        shocks: { p1: 1, p2: 2 },
        winner: p2.name,
        ratingDiff: 15,
        log: [],
        createdAt: new Date().toISOString(),
      };

      setMatches(prev => [mockMatch, ...prev]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-8 bg-gray-50 text-gray-900 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Electric Chair Arena</h1>
          <p className="text-gray-600">AIプレイヤー対戦シミュレーター</p>
        </header>

        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-2xl font-semibold mb-4">マッチメイキング</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Player 1 (先攻)</label>
              <select
                value={player1Id}
                onChange={(e) => setPlayer1Id(e.target.value)}
                className="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                {players.map(p => (
                  <option key={p.id} value={p.id}>{p.name} (Rate: {p.rating})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Player 2 (後攻)</label>
              <select
                value={player2Id}
                onChange={(e) => setPlayer2Id(e.target.value)}
                className="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                {players.map(p => (
                  <option key={p.id} value={p.id}>{p.name} (Rate: {p.rating})</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-6 flex justify-center">
            <button
              onClick={handleSimulate}
              disabled={loading}
              className="px-8 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'シミュレーション中...' : '対戦を開始する'}
            </button>
          </div>
          {error && <p className="mt-4 text-red-600 text-center">{error}</p>}
        </section>

        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-2xl font-semibold mb-4">最近の対戦結果</h2>
          {matches.length === 0 ? (
            <p className="text-gray-500 text-center py-8">まだ対戦履歴がありません。</p>
          ) : (
            <div className="space-y-4">
              {matches.map(match => (
                <div key={match.id} className="border border-gray-200 rounded-lg p-4 flex flex-col md:flex-row justify-between items-center gap-4">
                  <div className="flex-1 flex justify-between items-center w-full">
                    <div className="text-center flex-1">
                      <div className="font-medium text-lg">{match.player1.name}</div>
                      <div className="text-sm text-gray-500">
                        Score: {match.scores.p1} / Shocks: {match.shocks.p1}
                      </div>
                    </div>
                    <div className="px-4 font-bold text-gray-400">VS</div>
                    <div className="text-center flex-1">
                      <div className="font-medium text-lg">{match.player2.name}</div>
                      <div className="text-sm text-gray-500">
                        Score: {match.scores.p2} / Shocks: {match.shocks.p2}
                      </div>
                    </div>
                  </div>
                  <div className="bg-blue-50 text-blue-800 px-4 py-2 rounded-md whitespace-nowrap font-medium text-sm">
                    Winner: {match.winner}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-2xl font-semibold mb-4">ゲームルール</h2>
          <ul className="list-disc pl-5 space-y-2 text-gray-700">
            <li>イスの数: {GAME_RULES.TOTAL_CHAIRS}個 (1〜12が時計状に配置)</li>
            <li>勝利条件: 先に {GAME_RULES.WINNING_SCORE} 点先取したプレイヤーの勝利</li>
            <li>敗北条件: 合計で {GAME_RULES.MAX_SHOCKS} 回電気を喰らうと敗北</li>
            <li>終了条件: 最後に椅子が {GAME_RULES.MIN_CHAIRS_TO_END} つになった場合</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
