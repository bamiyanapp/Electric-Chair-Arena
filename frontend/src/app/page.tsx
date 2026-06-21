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

type GameLog = {
  turn: number;
  isHumanSetter: boolean;
  chosenChair: number;
  isShocked: boolean;
  remainingChairs: number[];
};

type MatchResult = {
  matchId: string;
  player1: Player;
  player2: Player;
  winner: string;
  ratingDiff: number;
  scores: { p1: number; p2: number };
  shocks: { p1: number; p2: number };
  logs: GameLog[];
};

function BaseballScoreboard({ match }: { match: MatchResult }) {
  const maxInnings = 9;
  const innings = Array.from({ length: maxInnings }, (_, i) => i + 1);

  const getScoreForTurn = (turnNum: number) => {
    const log = match.logs.find((l) => l.turn === turnNum);
    if (!log) return '-';
    if (log.isShocked) return '⚡';
    return String(log.chosenChair);
  };

  return (
    <div className="w-full overflow-x-auto my-6 bg-slate-950 text-white rounded-lg p-4 shadow-lg border-4 border-slate-800 font-mono">
      <div className="text-center text-yellow-400 font-bold mb-3 tracking-wider text-xs sm:text-sm">★ ELECTRIC ARENA SCOREBOARD ★</div>
      <table className="w-full text-center border-collapse text-xs sm:text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-slate-400">
            <th className="text-left p-2 font-bold w-24">TEAM</th>
            {innings.map(i => (
              <th key={i} className="p-2 w-8 font-bold">{i}</th>
            ))}
            <th className="p-2 w-10 font-bold text-yellow-400">R</th>
            <th className="p-2 w-10 font-bold text-red-500">S</th>
          </tr>
        </thead>
        <tbody>
          {/* AI（先攻・表）：奇数ターン */}
          <tr className="border-b border-slate-900">
            <td className="text-left p-2 font-bold text-blue-400 truncate max-w-[96px]">{match.player2.name}</td>
            {innings.map(i => {
              const turnNum = (i - 1) * 2 + 1;
              return (
                <td key={i} className="p-2 font-bold text-blue-300" style={{ minWidth: '1.5rem' }}>{getScoreForTurn(turnNum)}</td>
              );
            })}
            <td className="p-2 font-black text-base sm:text-lg text-yellow-400">{match.scores.p2}</td>
            <td className="p-2 font-black text-base sm:text-lg text-red-500">{match.shocks.p2}</td>
          </tr>
          {/* 人間（後攻・裏）：偶数ターン */}
          <tr>
            <td className="text-left p-2 font-bold text-green-400 truncate max-w-[96px]">あなた (人間)</td>
            {innings.map(i => {
              const turnNum = (i - 1) * 2 + 2;
              return (
                <td key={i} className="p-2 font-bold text-green-300" style={{ minWidth: '1.5rem' }}>{getScoreForTurn(turnNum)}</td>
              );
            })}
            <td className="p-2 font-black text-base sm:text-lg text-yellow-400">{match.scores.p1}</td>
            <td className="p-2 font-black text-base sm:text-lg text-red-500">{match.shocks.p1}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function Home() {
  const [currentView, setCurrentView] = useState<'LOBBY' | 'SIMULATOR' | 'RESULT' | 'GAME' | 'LEADERBOARD'>('LOBBY');
  
  const [players, setPlayers] = useState<Player[]>([]);
  const [leaderboard, setLeaderboard] = useState<Player[]>([]);
  
  const [player1Id, setPlayer1Id] = useState<string>('');
  const [player2Id, setPlayer2Id] = useState<string>('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);

  // TODO: バックエンドAPIに置き換える
  const getAiMoveMock = async (aiPlayerId: string, role: string, remainingChairs: number[], opponentShocks: number) => {
    try {
      // APIエンドポイントのURL。開発環境と本番環境で切り替える必要があるかも
      // 現状はバックエンドと結合していないためモックのままにするか、直接実装する
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/dev';
      
      const res = await fetch(`${apiUrl}/ai-move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ aiPlayerId, role, remainingChairs, opponentShocks })
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('API call failed, fallback to mock', e);
    }

    // APIが呼べない場合はモック実装
    return {
      setChairs: [remainingChairs[Math.floor(Math.random() * remainingChairs.length)]],
      chosenChair: remainingChairs[Math.floor(Math.random() * remainingChairs.length)]
    };
  };

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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
          <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold">人間対AI モード</h2>
              <button onClick={() => setCurrentView('LOBBY')} className="text-gray-500 hover:underline">ロビーへ戻る</button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">対戦相手 (AI)</label>
                <select
                  value={player2Id}
                  onChange={(e) => setPlayer2Id(e.target.value)}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:border-green-500 focus:ring-green-500 p-2 border"
                >
                  {players.map(p => (
                    <option key={p.playerId} value={p.playerId}>{p.name} (Rate: {p.rating})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-8 flex justify-center">
              <button
                onClick={() => {
                  setLoading(true);
                  setMatchResult({
                    matchId: `match-human-${Date.now()}`,
                    player1: { playerId: 'human', name: 'あなた (人間)', type: 'human', rating: 1500, winCount: 0, matchCount: 0 },
                    player2: players.find(p => p.playerId === player2Id)!,
                    winner: '',
                    ratingDiff: 0,
                    scores: { p1: 0, p2: 0 },
                    shocks: { p1: 0, p2: 0 },
                    logs: []
                  });
                  setLoading(false);
                }}
                disabled={loading}
                className="px-8 py-3 bg-green-600 text-white font-bold rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {loading ? '対戦準備中...' : '対戦開始'}
              </button>
            </div>
            
            {matchResult && matchResult.matchId.startsWith('match-human-') && (
              <div className="mt-8 border-t pt-8">
                <div className="grid grid-cols-2 gap-4 text-center mb-8">
                  <div className="p-4 border rounded-lg bg-green-50">
                    <div className="font-bold text-lg mb-2">あなた (人間)</div>
                    <div className="text-2xl font-bold text-gray-800">{matchResult.scores.p1} pt</div>
                    <div className="text-sm text-gray-500 mt-1">Shocks: {matchResult.shocks.p1} / {GAME_RULES.MAX_SHOCKS}</div>
                  </div>
                  <div className="p-4 border rounded-lg bg-gray-50">
                    <div className="font-bold text-lg mb-2">{matchResult.player2.name}</div>
                    <div className="text-2xl font-bold text-gray-800">{matchResult.scores.p2} pt</div>
                    <div className="text-sm text-gray-500 mt-1">Shocks: {matchResult.shocks.p2} / {GAME_RULES.MAX_SHOCKS}</div>
                  </div>
                </div>

                {matchResult.winner ? (
                  <div className="text-center p-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl mb-6 border border-green-100">
                    <h3 className="text-3xl font-black text-emerald-900 mb-2">WINNER</h3>
                    <p className="text-2xl font-bold text-green-700">
                      {matchResult.winner === 'human' ? 'あなた (人間)' : matchResult.player2.name}
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="mb-4">
                      <span className="text-sm bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-bold mr-2">
                        第 {Math.ceil((matchResult.logs.length + 1) / 2)} イニング / ターン {matchResult.logs.length + 1}
                      </span>
                    </div>
                    <p className="text-lg mb-4 font-bold text-gray-800 bg-white p-3 rounded-lg shadow-sm inline-block border border-green-100">
                      {(() => {
                        const turn = matchResult.logs.length + 1;
                        return turn % 2 !== 0 
                          ? 'あなたの番です: 電流を仕掛ける椅子を選んでください (AIが座る椅子を選びます)' 
                          : 'あなたの番です: 安全だと思う椅子を選んで座ってください (AIが電流を仕掛けました)';
                      })()}
                    </p>
                    <div className="relative w-80 h-80 mx-auto bg-gray-50 rounded-full border border-gray-200 shadow-inner flex items-center justify-center my-6">
                      {/* 中央のインジケーター（時計の針の基部） */}
                      <div className="w-4 h-4 bg-gray-300 rounded-full z-10 shadow-sm"></div>
                      
                      {(() => {
                        const currentRemainingChairs = matchResult.logs.length > 0 
                          ? matchResult.logs[matchResult.logs.length - 1].remainingChairs 
                          : Array.from({ length: GAME_RULES.TOTAL_CHAIRS }, (_, i) => i + 1);

                        return Array.from({ length: GAME_RULES.TOTAL_CHAIRS }, (_, i) => i + 1).map(chair => {
                          const isAvailable = currentRemainingChairs.includes(chair);
                          const radius = 38; // 円の半径割合 (%)
                          const angle = (chair * 30 - 90) * (Math.PI / 180);
                          const left = 50 + radius * Math.cos(angle);
                          const top = 50 + radius * Math.sin(angle);
                          
                          return (
                            <button
                              key={chair}
                              disabled={!isAvailable || loading}
                              style={{
                                position: 'absolute',
                                left: `${left}%`,
                                top: `${top}%`,
                                transform: 'translate(-50%, -50%)',
                              }}
                              className={`w-14 h-14 rounded-full font-bold text-lg flex items-center justify-center transition-all ${
                                isAvailable
                                  ? 'bg-blue-100 hover:bg-blue-200 hover:scale-110 border-2 border-blue-400 text-blue-800 shadow-md active:scale-95'
                                  : 'bg-gray-100 border border-gray-300 text-gray-400 cursor-not-allowed opacity-40'
                              }`}
                              onClick={async () => {
                                if (loading) return;
                                setLoading(true);
                                try {
                                  const turn = matchResult.logs.length + 1;
                                  const isHumanSetter = turn % 2 !== 0;
                                  const newScores = { ...matchResult.scores };
                                  const newShocks = { ...matchResult.shocks };
                                  let nextRemainingChairs = [...currentRemainingChairs];
                                  
                                  let aiChosenChair = 0;
                                  let isShocked = false;

                                  if (isHumanSetter) {
                                    // Human sets, AI chooses
                                    const aiRes = await getAiMoveMock(matchResult.player2.playerId, 'choose', nextRemainingChairs, newShocks.p1);
                                    aiChosenChair = aiRes.chosenChair;
                                    const humanSetChairs = [chair]; // Human sets 1 chair
                                    
                                    isShocked = humanSetChairs.includes(aiChosenChair);
                                    if (isShocked) {
                                      newShocks.p2 += 1;
                                      newScores.p2 = 0;
                                      alert(`AIは椅子 ${aiChosenChair} を選び、感電しました！`);
                                    } else {
                                      newScores.p2 += aiChosenChair;
                                      alert(`AIは椅子 ${aiChosenChair} を選びました。(+${aiChosenChair}点)`);
                                    }
                                    nextRemainingChairs = nextRemainingChairs.filter(c => c !== aiChosenChair);
                                  } else {
                                    // AI sets, Human chooses
                                    const aiRes = await getAiMoveMock(matchResult.player2.playerId, 'set', nextRemainingChairs, newShocks.p1);
                                    const aiSetChairs = aiRes.setChairs;
                                    const humanChosenChair = chair;
                                    
                                    isShocked = aiSetChairs.includes(humanChosenChair);
                                    if (isShocked) {
                                      newShocks.p1 += 1;
                                      newScores.p1 = 0;
                                      alert(`ビリビリ！あなたが選んだ椅子 ${humanChosenChair} には電流が仕掛けられていました！`);
                                    } else {
                                      newScores.p1 += humanChosenChair;
                                      alert(`セーフ！椅子 ${humanChosenChair} に座りました。(+${humanChosenChair}点)`);
                                    }
                                    nextRemainingChairs = nextRemainingChairs.filter(c => c !== humanChosenChair);
                                  }
                                  
                                  // Check winner
                                  let winner = '';
                                  if (newShocks.p1 >= GAME_RULES.MAX_SHOCKS || newScores.p2 >= GAME_RULES.WINNING_SCORE) {
                                    winner = matchResult.player2.playerId;
                                  } else if (newShocks.p2 >= GAME_RULES.MAX_SHOCKS || newScores.p1 >= GAME_RULES.WINNING_SCORE) {
                                    winner = 'human';
                                  } else if (nextRemainingChairs.length <= GAME_RULES.MIN_CHAIRS_TO_END) {
                                    if (newScores.p1 !== newScores.p2) {
                                      winner = newScores.p1 > newScores.p2 ? 'human' : matchResult.player2.playerId;
                                    } else {
                                      winner = newShocks.p1 < newShocks.p2 ? 'human' : matchResult.player2.playerId;
                                    }
                                  }
                                  
                                  setMatchResult(prev => {
                                    if (!prev) return prev;
                                    const newLog: GameLog = {
                                      turn,
                                      isHumanSetter,
                                      chosenChair: isHumanSetter ? aiChosenChair : chair,
                                      isShocked,
                                      remainingChairs: nextRemainingChairs
                                    };
                                    return {
                                      ...prev,
                                      winner,
                                      scores: newScores,
                                      shocks: newShocks,
                                      logs: [...prev.logs, newLog]
                                    };
                                  });

                                } catch (e) {
                                  console.error(e);
                                  alert('エラーが発生しました');
                                } finally {
                                  setLoading(false);
                                }
                              }}
                            >
                              {chair}
                            </button>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}

                <div className="mt-6 border-t pt-6">
                  <h3 className="text-lg font-bold mb-3 text-gray-800">リアルタイム・スコアボード</h3>
                  <BaseballScoreboard match={matchResult} />
                </div>
              </div>
            )}
          </section>
        )}

      </div>
    </main>
  );
}
