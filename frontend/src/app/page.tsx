'use client';

import React, { useState, useEffect } from 'react';
import { GAME_RULES } from '@/constants/rules';

type Player = {
  playerId: string;
  name: string;
  type: string;
  rating: number;
  winCount: number;
  matchCount: number;
};

type MatchResult = {
  matchId: string;
  player1: Player;
  player2: Player;
  winner: string;
  ratingDiff: number;
  scores: { p1: number; p2: number };
  shocks: { p1: number; p2: number };
  logs: any[];
};

export default function Home() {
  const [currentView, setCurrentView] = useState<'LOBBY' | 'SIMULATOR' | 'RESULT' | 'GAME' | 'LEADERBOARD'>('LOBBY');
  
  const [players, setPlayers] = useState<Player[]>([]);
  const [leaderboard, setLeaderboard] = useState<Player[]>([]);
  
  const [player1Id, setPlayer1Id] = useState<string>('');
  const [player2Id, setPlayer2Id] = useState<string>('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);

  // 初回データロード（モック）
  useEffect(() => {
    // 実際にはバックエンドの /get-players や /get-leaderboard を叩く
    const mockPlayers: Player[] = [
      { playerId: 'ai-okano', name: '岡野陽一風AI', type: 'personality', rating: 1550, winCount: 42, matchCount: 80 },
      { playerId: 'ai-koyabu', name: '小籔千豊風AI', type: 'personality', rating: 1600, winCount: 55, matchCount: 90 },
      { playerId: 'ai-junior', name: '千原ジュニア風AI', type: 'personality', rating: 1620, winCount: 61, matchCount: 100 },
      { playerId: 'ai-random', name: 'ランダムAI', type: 'random', rating: 1400, winCount: 20, matchCount: 70 },
      { playerId: 'ai-rule-based', name: '期待値計算AI', type: 'rule_based', rating: 1520, winCount: 35, matchCount: 75 },
    ];
    setPlayers(mockPlayers);
    setLeaderboard([...mockPlayers].sort((a, b) => b.rating - a.rating));
    
    if (mockPlayers.length >= 2) {
      setPlayer1Id(mockPlayers[0].playerId);
      setPlayer2Id(mockPlayers[1].playerId);
    }
  }, []);

  const handleSimulate = async () => {
    setLoading(true);
    setError('');
    try {
      const p1 = players.find(p => p.playerId === player1Id);
      const p2 = players.find(p => p.playerId === player2Id);
      
      if (!p1 || !p2) throw new Error('Player not found');

      // 本来はバックエンドの /start-match エンドポイントを叩くが、モックで代替
      const mockResult: MatchResult = {
        matchId: `match-${Date.now()}`,
        player1: p1,
        player2: p2,
        winner: p2.playerId,
        ratingDiff: 15,
        scores: { p1: 20, p2: 40 },
        shocks: { p1: 1, p2: 0 },
        logs: []
      };

      setMatchResult(mockResult);
      setCurrentView('RESULT');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-8 bg-gray-50 text-gray-900 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="text-center space-y-2 cursor-pointer" onClick={() => setCurrentView('LOBBY')}>
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Electric Chair Arena</h1>
          <p className="text-gray-600">AIプレイヤー対戦シミュレーター</p>
        </header>

        {currentView === 'LOBBY' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button onClick={() => setCurrentView('SIMULATOR')} className="p-6 bg-blue-600 text-white rounded-xl shadow hover:bg-blue-700 transition">
                <h3 className="text-xl font-bold mb-2">マッチシミュレーター</h3>
                <p className="text-sm opacity-90">AI同士の対戦をシミュレーションします</p>
              </button>
              <button onClick={() => setCurrentView('GAME')} className="p-6 bg-green-600 text-white rounded-xl shadow hover:bg-green-700 transition">
                <h3 className="text-xl font-bold mb-2">人間対AI</h3>
                <p className="text-sm opacity-90">あなたがAIと対戦します</p>
              </button>
              <button onClick={() => setCurrentView('LEADERBOARD')} className="p-6 bg-purple-600 text-white rounded-xl shadow hover:bg-purple-700 transition">
                <h3 className="text-xl font-bold mb-2">ランキング</h3>
                <p className="text-sm opacity-90">AIプレイヤーのレーティングランキング</p>
              </button>
            </div>
            
            <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h2 className="text-2xl font-semibold mb-4">登録プレイヤー一覧</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {players.map(p => (
                  <div key={p.playerId} className="p-4 border rounded-lg bg-gray-50">
                    <div className="font-bold">{p.name}</div>
                    <div className="text-sm text-gray-600">Type: {p.type}</div>
                    <div className="text-sm text-gray-600">Rate: {p.rating}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {currentView === 'SIMULATOR' && (
          <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold">マッチシミュレーター</h2>
              <button onClick={() => setCurrentView('LOBBY')} className="text-gray-500 hover:underline">ロビーへ戻る</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Player 1 (先攻)</label>
                <select
                  value={player1Id}
                  onChange={(e) => setPlayer1Id(e.target.value)}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                >
                  {players.map(p => (
                    <option key={p.playerId} value={p.playerId}>{p.name} (Rate: {p.rating})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Player 2 (後攻)</label>
                <select
                  value={player2Id}
                  onChange={(e) => setPlayer2Id(e.target.value)}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                >
                  {players.map(p => (
                    <option key={p.playerId} value={p.playerId}>{p.name} (Rate: {p.rating})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-8 flex justify-center">
              <button
                onClick={handleSimulate}
                disabled={loading}
                className="px-8 py-3 bg-blue-600 text-white font-bold rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {loading ? '対戦実行中...' : '対戦開始'}
              </button>
            </div>
            {error && <p className="mt-4 text-red-600 text-center">{error}</p>}
          </section>
        )}

        {currentView === 'RESULT' && matchResult && (
          <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold">対戦結果</h2>
              <button onClick={() => setCurrentView('LOBBY')} className="text-blue-600 hover:underline font-medium">ロビーへ戻る</button>
            </div>
            
            <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl mb-6 border border-blue-100 text-center">
              <h3 className="text-3xl font-black text-indigo-900 mb-2">WINNER</h3>
              <p className="text-2xl font-bold text-blue-700">{players.find(p => p.playerId === matchResult.winner)?.name}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-center mb-8">
              <div className="p-4 border rounded-lg bg-gray-50">
                <div className="font-bold text-lg mb-2">{matchResult.player1.name}</div>
                <div className="text-2xl font-bold text-gray-800">{matchResult.scores.p1} pt</div>
                <div className="text-sm text-gray-500 mt-1">Shocks: {matchResult.shocks.p1}</div>
              </div>
              <div className="p-4 border rounded-lg bg-gray-50">
                <div className="font-bold text-lg mb-2">{matchResult.player2.name}</div>
                <div className="text-2xl font-bold text-gray-800">{matchResult.scores.p2} pt</div>
                <div className="text-sm text-gray-500 mt-1">Shocks: {matchResult.shocks.p2}</div>
              </div>
            </div>
          </section>
        )}

        {currentView === 'LEADERBOARD' && (
          <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold">リーダーボード</h2>
              <button onClick={() => setCurrentView('LOBBY')} className="text-gray-500 hover:underline">ロビーへ戻る</button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-gray-700">
                    <th className="p-3 border-b font-medium">Rank</th>
                    <th className="p-3 border-b font-medium">Player</th>
                    <th className="p-3 border-b font-medium">Type</th>
                    <th className="p-3 border-b font-medium">Rating</th>
                    <th className="p-3 border-b font-medium">Win / Match</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((p, index) => (
                    <tr key={p.playerId} className="hover:bg-gray-50">
                      <td className="p-3 border-b">{index + 1}</td>
                      <td className="p-3 border-b font-bold">{p.name}</td>
                      <td className="p-3 border-b text-gray-600">{p.type}</td>
                      <td className="p-3 border-b font-bold text-blue-600">{p.rating}</td>
                      <td className="p-3 border-b text-gray-600">{p.winCount} / {p.matchCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {currentView === 'GAME' && (
          <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 text-center py-12">
            <h2 className="text-2xl font-semibold mb-4">人間対AI モード</h2>
            <p className="text-gray-600 mb-6">現在開発中です。アップデートをお待ちください。</p>
            <button onClick={() => setCurrentView('LOBBY')} className="px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-md transition">ロビーへ戻る</button>
          </section>
        )}

      </div>
    </main>
  );
}
