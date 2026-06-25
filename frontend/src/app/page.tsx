'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
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
  scores?: { p1: number; p2: number };
  shocks?: { p1: number; p2: number };
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

type MatchRecord = {
  matchId: string;
  player1Id: string;
  player2Id: string;
  winnerId: string;
  ratingDiff: number;
  createdAt: string;
  logs: GameLog[];
};

function BaseballScoreboard({ match }: { match: MatchResult }) {
  const maxInnings = Math.max(1, Math.ceil((match.logs.length + 1) / 2));
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
          {/* プレイヤー2（先攻・表）：奇数ターン */}
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
          {/* プレイヤー1（後攻・裏）：偶数ターン */}
          <tr>
            <td className="text-left p-2 font-bold text-green-400 truncate max-w-[96px]">{match.player1.name}</td>
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

export function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const viewFromUrl = searchParams.get('view') as 'LOBBY' | 'RESULT' | 'GAME' | 'PVP_GAME' | 'LEADERBOARD' | 'SCOREBOARDS' | null;
  const [currentView, setCurrentViewState] = useState<'LOBBY' | 'RESULT' | 'GAME' | 'PVP_GAME' | 'LEADERBOARD' | 'SCOREBOARDS'>(viewFromUrl || 'LOBBY');

  useEffect(() => {
    if (viewFromUrl && viewFromUrl !== currentView) {
      setCurrentViewState(viewFromUrl);
    } else if (!viewFromUrl && currentView !== 'LOBBY') {
      setCurrentViewState('LOBBY');
    }
  }, [viewFromUrl, currentView]);

  const setCurrentView = (view: 'LOBBY' | 'RESULT' | 'GAME' | 'PVP_GAME' | 'LEADERBOARD' | 'SCOREBOARDS') => {
    setCurrentViewState(view);
    const params = new URLSearchParams(searchParams.toString());
    if (view === 'LOBBY') {
      params.delete('view');
    } else {
      params.set('view', view);
    }
    const newUrl = `${pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    router.push(newUrl, { scroll: false });
  };
  
  const [players, setPlayers] = useState<Player[]>([]);
  const [leaderboard, setLeaderboard] = useState<Player[]>([]);
  const [matchesList, setMatchesList] = useState<MatchRecord[]>([]);
  
  const [player2Id, setPlayer2Id] = useState<string>('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);

  // 人間対AIモードでの演出管理ステート
  const [gameStep, setGameStep] = useState<'IDLE' | 'AI_THINKING' | 'REVEALING' | 'SHOW_RESULT'>('IDLE');
  const [statusMessage, setStatusMessage] = useState<string>('');

  // PVPモード用のステート
  const [pvpStage, setPvpStage] = useState<'LOBBY_START' | 'SETTING_CHAIR' | 'CONFIRM_NEXT_PLAYER' | 'CHOOSING_CHAIR' | 'REVEALING' | 'SHOW_RESULT'>('LOBBY_START');
  const [pvpSetChair, setPvpSetChair] = useState<number | null>(null);
  const [pvpChosenChair, setPvpChosenChair] = useState<number | null>(null);
  const [pvpStatusMessage, setPvpStatusMessage] = useState<string>('');
  const [highlightedChair, setHighlightedChair] = useState<number | null>(null);
  const [shockedChair, setShockedChair] = useState<number | null>(null);
  const [tempNextState, setTempNextState] = useState<{
    winner: string;
    newScores: { p1: number; p2: number };
    newShocks: { p1: number; p2: number };
    newLog: GameLog;
    aiSetChairs?: number[];
  } | null>(null);
  
  const [commentary, setCommentary] = useState<string>('');

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const playSound = (src: string) => {
    if (typeof window !== 'undefined' && typeof Audio !== 'undefined') {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
      const audio = new Audio(`${basePath}${src}`);
      audio.play().catch(err => console.warn('Audio play failed:', err));
    }
  };

  type GameStateInfo = {
    scores: { p1: number; p2: number };
    shocks: { p1: number; p2: number };
    remainingChairs: number[];
    winner: string;
  };

  type ActionInfo = {
    isHumanSetter: boolean;
    chosenChair: number;
    isShocked: boolean;
  };

  // TODO: バックエンドAPIに置き換える
  const fetchCommentary = async (state: GameStateInfo, action: ActionInfo) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/dev';
      const res = await fetch(`${apiUrl}/generate-commentary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameState: state, action })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.commentary) {
          setCommentary(data.commentary);
        } else {
          setCommentary('');
        }
      }
    } catch (e) {
      console.warn('Failed to fetch commentary', e);
      setCommentary('解説の取得に失敗しました。');
    }
  };

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

  const fetchMatches = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/dev';
      const res = await fetch(`${apiUrl}/get-matches`);
      if (res.ok) {
        const data = await res.json();
        setMatchesList(data.matches || []);
        return;
      }
    } catch (e) {
      console.warn('API call failed, fallback to local storage', e);
    }
    
    // APIが呼べない場合はLocalStorageから取得
    try {
      const localMatches = localStorage.getItem('electric_chair_matches');
      if (localMatches) {
        setMatchesList(JSON.parse(localMatches));
      } else {
        // 初期モックデータ
        const mockMatches: MatchRecord[] = [
          {
            matchId: 'match-1718970000000',
            player1Id: 'ai-okano',
            player2Id: 'ai-junior',
            winnerId: 'ai-junior',
            ratingDiff: 16,
            createdAt: new Date().toISOString(),
            logs: [
              {
                turn: 1,
                isHumanSetter: false,
                chosenChair: 6,
                isShocked: false,
                remainingChairs: [1,2,3,4,5,7,8,9,10,11,12],
                scores: { p1: 0, p2: 6 },
                shocks: { p1: 0, p2: 0 }
              },
              {
                turn: 2,
                isHumanSetter: false,
                chosenChair: 10,
                isShocked: true,
                remainingChairs: [1,2,3,4,5,7,8,9,11,12],
                scores: { p1: 0, p2: 6 },
                shocks: { p1: 1, p2: 0 }
              }
            ]
          }
        ];
        setMatchesList(mockMatches);
        // モックデータをLocalStorageにも保存しておく
        localStorage.setItem('electric_chair_matches', JSON.stringify(mockMatches));
      }
    } catch (e) {
      console.warn('Failed to parse local matches', e);
      setMatchesList([]);
    }
  };

  const saveMatchToBackend = async (matchData: MatchResult) => {
    const matchRecord: MatchRecord = {
      matchId: matchData.matchId,
      player1Id: matchData.player1.playerId,
      player2Id: matchData.player2.playerId,
      winnerId: matchData.winner,
      ratingDiff: matchData.ratingDiff,
      createdAt: new Date().toISOString(),
      logs: matchData.logs,
    };

    // 常にLocalStorageにも保存する
    try {
      const localMatches = localStorage.getItem('electric_chair_matches');
      const parsedMatches = localMatches ? JSON.parse(localMatches) : [];
      parsedMatches.unshift(matchRecord);
      localStorage.setItem('electric_chair_matches', JSON.stringify(parsedMatches));
    } catch (e) {
      console.warn('Failed to save match to local storage', e);
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/dev';
      await fetch(`${apiUrl}/save-match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(matchRecord)
      });
    } catch (e) {
      console.warn('Failed to save match result to API', e);
    }
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
      { playerId: 'ai-nash', name: 'ナッシュ均衡AI', type: 'nash', rating: 1650, winCount: 70, matchCount: 95 },
    ];
    setPlayers(mockPlayers);
    setLeaderboard([...mockPlayers].sort((a, b) => b.rating - a.rating));
    
    if (mockPlayers.length >= 2) {
      setPlayer2Id(mockPlayers[1].playerId);
    }
  }, []);

  const isGameActive = (currentView === 'GAME' && matchResult && matchResult.matchId.startsWith('match-human-')) ||
                       (currentView === 'PVP_GAME' && matchResult && matchResult.matchId.startsWith('match-pvp-'));

  return (
    <main className="min-h-screen p-4 sm:p-8 bg-gray-50 text-gray-900 font-sans">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-8">
        {/* 対戦中・対戦結果が表示されている間（対戦開始後）はヘッダーをカットする */}
        {!isGameActive && (
          <header className="text-center space-y-1 sm:space-y-2 cursor-pointer py-2 sm:py-4" onClick={() => setCurrentView('LOBBY')}>
            <img 
              src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/icon.png`} 
              alt="Electric Chair Arena Icon" 
              className="h-16 sm:h-20 w-auto object-contain mx-auto mb-2 sm:mb-3 drop-shadow-md rounded-2xl" 
            />
            <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 tracking-tight">Electric Chair Arena</h1>
            <p className="text-xs sm:text-sm text-gray-600">AIプレイヤー対戦シミュレーター</p>
          </header>
        )}

        {currentView === 'LOBBY' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button onClick={() => setCurrentView('GAME')} className="p-6 bg-green-600 text-white rounded-xl shadow hover:bg-green-700 transition">
                <h3 className="text-xl font-bold mb-2">人間対AI</h3>
                <p className="text-sm opacity-90">あなたがAIと対戦します</p>
              </button>
              <button onClick={() => setCurrentView('PVP_GAME')} className="p-6 bg-orange-600 text-white rounded-xl shadow hover:bg-orange-700 transition">
                <h3 className="text-xl font-bold mb-2">人対人 (ローカル)</h3>
                <p className="text-sm opacity-90">1台のデバイスで交互に操作して2人対戦を行います</p>
              </button>
              <button onClick={() => setCurrentView('LEADERBOARD')} className="p-6 bg-purple-600 text-white rounded-xl shadow hover:bg-purple-700 transition">
                <h3 className="text-xl font-bold mb-2">ランキング</h3>
                <p className="text-sm opacity-90">AIプレイヤーのレーティングランキング</p>
              </button>
              <button onClick={() => { fetchMatches(); setCurrentView('SCOREBOARDS'); }} className="p-6 bg-blue-600 text-white rounded-xl shadow hover:bg-blue-700 transition">
                <h3 className="text-xl font-bold mb-2">過去のスコアボード一覧</h3>
                <p className="text-sm opacity-90">これまでの対戦履歴とスコアボードを確認します</p>
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

        {currentView === 'RESULT' && matchResult && (
          <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold">対戦結果</h2>
              <button onClick={() => setCurrentView('LOBBY')} className="text-blue-600 hover:underline font-medium">ロビーへ戻る</button>
            </div>
            
            <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl mb-6 border border-blue-100 text-center">
              <h3 className="text-3xl font-black text-indigo-900 mb-2">
                {matchResult.winner === 'draw' ? 'DRAW' : 'WINNER'}
              </h3>
              <p className="text-2xl font-bold text-blue-700">
                {matchResult.winner === 'draw' 
                  ? '引き分け' 
                  : matchResult.winner === 'human' 
                    ? 'あなた (人間)' 
                    : matchResult.winner === 'p1'
                      ? 'プレイヤー1'
                      : matchResult.winner === 'p2'
                        ? 'プレイヤー2'
                        : players.find(p => p.playerId === matchResult.winner)?.name}
              </p>
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

        {currentView === 'SCOREBOARDS' && (
          <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold">過去のスコアボード一覧</h2>
              <button onClick={() => setCurrentView('LOBBY')} className="text-gray-500 hover:underline">ロビーへ戻る</button>
            </div>
            
            {matchesList.length === 0 ? (
              <p className="text-center text-gray-500 py-8">過去の対戦記録がありません。</p>
            ) : (
              <div className="space-y-8">
                {matchesList.map(m => {
                  // BaseballScoreboardコンポーネントのPropsに合わせるため、一部データをモックで補完
                  const mockMatchResult: MatchResult = {
                    matchId: m.matchId,
                    player1: players.find(p => p.playerId === m.player1Id) || { playerId: m.player1Id, name: m.player1Id, type: '', rating: 0, winCount: 0, matchCount: 0 },
                    player2: players.find(p => p.playerId === m.player2Id) || { playerId: m.player2Id, name: m.player2Id, type: '', rating: 0, winCount: 0, matchCount: 0 },
                    winner: m.winnerId,
                    ratingDiff: m.ratingDiff,
                    scores: m.logs && m.logs.length > 0 ? (m.logs[m.logs.length - 1].scores || { p1: 0, p2: 0 }) : { p1: 0, p2: 0 },
                    shocks: m.logs && m.logs.length > 0 ? (m.logs[m.logs.length - 1].shocks || { p1: 0, p2: 0 }) : { p1: 0, p2: 0 },
                    logs: m.logs || []
                  };

                  return (
                    <div key={m.matchId} className="border rounded-lg p-4 bg-gray-50 shadow-sm">
                      <div className="text-sm text-gray-500 mb-2">Match ID: {m.matchId} | Date: {new Date(m.createdAt).toLocaleString()}</div>
                      <BaseballScoreboard match={mockMatchResult} />
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {currentView === 'PVP_GAME' && (
          <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            {(!matchResult || !matchResult.matchId.startsWith('match-pvp-')) && (
              <>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-semibold">人対人 (ローカル対戦) モード</h2>
                  <button onClick={() => setCurrentView('LOBBY')} className="text-gray-500 hover:underline">ロビーへ戻る</button>
                </div>
                
                <div className="text-center mt-8">
                  <button
                    onClick={() => {
                      setLoading(true);
                      setMatchResult({
                        matchId: `match-pvp-${Date.now()}`,
                        player1: { playerId: 'p1', name: 'プレイヤー1', type: 'human', rating: 1500, winCount: 0, matchCount: 0 },
                        player2: { playerId: 'p2', name: 'プレイヤー2', type: 'human', rating: 1500, winCount: 0, matchCount: 0 },
                        winner: '',
                        ratingDiff: 0,
                        scores: { p1: 0, p2: 0 },
                        shocks: { p1: 0, p2: 0 },
                        logs: []
                      });
                      setPvpStage('LOBBY_START');
                      setPvpStatusMessage('プレイヤー1が電流を仕掛ける番です。プレイヤー2は画面を見ないでください。');
                      setHighlightedChair(null);
                      setShockedChair(null);
                      setPvpSetChair(null);
                      setPvpChosenChair(null);
                      setTempNextState(null);
                      setCommentary('');
                      setLoading(false);
                    }}
                    disabled={loading}
                    className="px-8 py-3 bg-orange-600 text-white font-bold rounded-md hover:bg-orange-700 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {loading ? '対戦準備中...' : '対戦開始'}
                  </button>
                </div>
              </>
            )}

            {matchResult && matchResult.matchId.startsWith('match-pvp-') && (
              <div className="">
                <div className="mb-6">
                  <BaseballScoreboard match={matchResult} />
                </div>

                {matchResult.winner && pvpStage === 'SHOW_RESULT' ? (
                  <div className="text-center p-6 bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl mb-6 border border-orange-100">
                    <h3 className="text-3xl font-black text-amber-900 mb-2">
                      {matchResult.winner === 'draw' ? 'DRAW' : 'WINNER'}
                    </h3>
                    <p className="text-2xl font-bold text-orange-700">
                      {matchResult.winner === 'draw' 
                        ? '引き分け' 
                        : matchResult.winner === 'p1' 
                          ? 'プレイヤー1' 
                          : 'プレイヤー2'}
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="mb-4">
                      <span className="text-sm bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-bold mr-2">
                        第 {Math.ceil((matchResult.logs.length + 1) / 2)} イニング / ターン {matchResult.logs.length + 1}
                      </span>
                    </div>

                    <div className="relative w-80 h-80 mx-auto bg-gray-50 rounded-full border border-gray-200 shadow-inner flex items-center justify-center my-6 overflow-hidden">
                      <div className="w-4 h-4 bg-gray-300 rounded-full z-10 shadow-sm"></div>
                      
                      {(() => {
                        const currentRemainingChairs = matchResult.logs.length > 0 
                          ? matchResult.logs[matchResult.logs.length - 1].remainingChairs 
                          : Array.from({ length: GAME_RULES.TOTAL_CHAIRS }, (_, i) => i + 1);

                        return Array.from({ length: GAME_RULES.TOTAL_CHAIRS }, (_, i) => i + 1).map(chair => {
                          const isAvailable = currentRemainingChairs.includes(chair);
                          const radius = 38;
                          const angle = (chair * 30 - 90) * (Math.PI / 180);
                          const left = 50 + radius * Math.cos(angle);
                          const top = 50 + radius * Math.sin(angle);
                          
                          const chairStatus = (() => {
                            if (shockedChair === chair) return 'SHOCKING';
                            if (highlightedChair === chair) return 'HIGHLIGHTED';
                            if (!isAvailable) {
                              const log = matchResult.logs.find(l => l.chosenChair === chair);
                              if (log) {
                                return log.isShocked ? 'PAST_SHOCKED' : 'PAST_SAFE';
                              }
                              return 'UNAVAILABLE';
                            }
                            return 'AVAILABLE';
                          })();

                          const { chairClass, chairContent } = (() => {
                            switch (chairStatus) {
                              case 'SHOCKING':
                                return {
                                  chairClass: 'bg-red-600 border-2 border-red-900 text-white scale-125 shadow-lg shadow-red-500/50 z-20',
                                  chairContent: (
                                    <span className="relative flex h-full w-full items-center justify-center">
                                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                                      <span className="relative text-2xl">⚡💥</span>
                                    </span>
                                  )
                                };
                              case 'HIGHLIGHTED':
                                return {
                                  chairClass: 'bg-yellow-400 border-2 border-yellow-600 text-yellow-950 scale-110 animate-pulse shadow-md z-10',
                                  chairContent: (
                                    <span className="flex flex-col items-center justify-center leading-none">
                                      <span className="text-lg animate-bounce">🤔</span>
                                      <span className="text-[10px] font-bold">#{chair}</span>
                                    </span>
                                  )
                                };
                              case 'PAST_SHOCKED':
                                return {
                                  chairClass: 'bg-gradient-to-br from-red-500 to-red-700 border-2 border-red-950 text-white shadow-inner scale-95 opacity-90 cursor-not-allowed',
                                  chairContent: (
                                    <span className="flex flex-col items-center justify-center leading-none">
                                      <span className="text-lg drop-shadow">⚡</span>
                                      <span className="text-[9px] font-bold opacity-80">#{chair}</span>
                                    </span>
                                  )
                                };
                              case 'PAST_SAFE':
                                return {
                                  chairClass: 'bg-gradient-to-br from-emerald-400 to-emerald-600 border-2 border-emerald-800 text-white shadow-inner scale-95 opacity-90 cursor-not-allowed',
                                  chairContent: (
                                    <span className="flex flex-col items-center justify-center leading-none">
                                      <span className="text-base drop-shadow">✅</span>
                                      <span className="text-[9px] font-bold opacity-80">#{chair}</span>
                                    </span>
                                  )
                                };
                              case 'AVAILABLE':
                                return {
                                  chairClass: 'bg-blue-100 hover:bg-blue-200 hover:scale-110 border-2 border-blue-400 text-blue-800 shadow-md active:scale-95 cursor-pointer',
                                  chairContent: (
                                    <span className="flex flex-col items-center justify-center leading-none">
                                      <span className="text-lg">🪑</span>
                                      <span className="text-xs font-black">#{chair}</span>
                                    </span>
                                  )
                                };
                              default:
                                return {
                                  chairClass: 'bg-gray-100 border border-gray-300 text-gray-400 cursor-not-allowed opacity-40',
                                  chairContent: <span className="text-xs font-bold">{chair}</span>
                                };
                            }
                          })();

                          return (
                            <button
                              key={chair}
                              disabled={!isAvailable || loading || (pvpStage !== 'LOBBY_START' && pvpStage !== 'CHOOSING_CHAIR')}
                              style={{
                                position: 'absolute',
                                left: `${left}%`,
                                top: `${top}%`,
                                transform: 'translate(-50%, -50%)',
                              }}
                              className={`w-14 h-14 rounded-full font-bold flex items-center justify-center transition-all duration-300 ${chairClass}`}
                              onClick={async () => {
                                if (loading) return;
                                playSound('/fix.mp3');
                                setLoading(true);
                                try {
                                  const turn = matchResult.logs.length + 1;
                                  const isP1Setter = turn % 2 !== 0;

                                  if (pvpStage === 'LOBBY_START') {
                                    // プレイヤーが椅子に仕掛ける
                                    setPvpSetChair(chair);
                                    setPvpStage('CONFIRM_NEXT_PLAYER');
                                    setPvpStatusMessage(`${isP1Setter ? 'プレイヤー1' : 'プレイヤー2'}が椅子に仕掛けました。画面を${!isP1Setter ? 'プレイヤー1' : 'プレイヤー2'}に渡して、「準備完了」を押してください。`);
                                  } else if (pvpStage === 'CHOOSING_CHAIR') {
                                    // もう一人のプレイヤーが座る椅子を選ぶ
                                    const chosen = chair;
                                    const isShocked = pvpSetChair === chosen;
                                    
                                    setPvpChosenChair(chosen);
                                    setPvpStage('REVEALING');
                                    setHighlightedChair(chosen);
                                    setPvpStatusMessage(`${!isP1Setter ? 'プレイヤー1' : 'プレイヤー2'}が${chosen}番の椅子を選択しました！ 運命の瞬間...`);
                                    
                                    await sleep(1500);

                                    const newScores = { ...matchResult.scores };
                                    const newShocks = { ...matchResult.shocks };
                                    let nextRemainingChairs = [...currentRemainingChairs];

                                    if (isShocked) {
                                      setShockedChair(chosen);
                                      if (!isP1Setter) {
                                        newShocks.p1 += 1;
                                        newScores.p1 = 0;
                                      } else {
                                        newShocks.p2 += 1;
                                        newScores.p2 = 0;
                                      }
                                      playSound('/Electric_Shock.mp3');
                                      setPvpStatusMessage(`⚡ ビリビリ！ ${!isP1Setter ? 'プレイヤー1' : 'プレイヤー2'}は椅子 ${chosen} を選び、感電しました！`);
                                    } else {
                                      if (!isP1Setter) {
                                        newScores.p1 += chosen;
                                      } else {
                                        newScores.p2 += chosen;
                                      }
                                      playSound('/success.mp3');
                                      setPvpStatusMessage(`🎉 セーフ！ ${!isP1Setter ? 'プレイヤー1' : 'プレイヤー2'}は椅子 ${chosen} を選びました。(+${chosen}点)`);
                                    }
                                    nextRemainingChairs = nextRemainingChairs.filter(c => c !== chosen);

                                    let winner = '';
                                    if (newShocks.p1 >= GAME_RULES.MAX_SHOCKS || newScores.p2 >= GAME_RULES.WINNING_SCORE) {
                                      winner = 'p2';
                                    } else if (newShocks.p2 >= GAME_RULES.MAX_SHOCKS || newScores.p1 >= GAME_RULES.WINNING_SCORE) {
                                      winner = 'p1';
                                    } else if (nextRemainingChairs.length <= GAME_RULES.MIN_CHAIRS_TO_END) {
                                      if (newScores.p1 !== newScores.p2) {
                                        winner = newScores.p1 > newScores.p2 ? 'p1' : 'p2';
                                      } else {
                                        if (newShocks.p1 !== newShocks.p2) {
                                          winner = newShocks.p1 < newShocks.p2 ? 'p1' : 'p2';
                                        } else {
                                          winner = 'draw';
                                        }
                                      }
                                    }

                                    setTempNextState({
                                      winner,
                                      newScores,
                                      newShocks,
                                      newLog: {
                                        turn,
                                        isHumanSetter: isP1Setter,
                                        chosenChair: chosen,
                                        isShocked,
                                        remainingChairs: nextRemainingChairs
                                      }
                                    });
                                    setPvpStage('SHOW_RESULT');
                                    
                                    // ゲーム終了時は後続の処理をスキップ
                                    if (winner) {
                                      return;
                                    }
                                  }
                                } catch (e) {
                                  console.error(e);
                                  setPvpStatusMessage('エラーが発生しました');
                                  setPvpStage('LOBBY_START');
                                } finally {
                                  setLoading(false);
                                }
                              }}
                            >
                              {chairContent}
                            </button>
                          );
                        });
                      })()}

                          {pvpStage === 'CONFIRM_NEXT_PLAYER' && (
                            <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-full animate-fade-in">
                              <button
                                onClick={() => {
                                  setPvpStage('CHOOSING_CHAIR');
                                  const turn = matchResult.logs.length + 1;
                                  const isP1Setter = turn % 2 !== 0;
                                  setPvpStatusMessage(`${!isP1Setter ? 'プレイヤー1' : 'プレイヤー2'}の番です。座る椅子を選んでください。`);
                                }}
                                className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-black rounded-lg shadow-xl transition-all scale-110 hover:scale-125 active:scale-95"
                              >
                                準備完了 (画面を渡しました)
                              </button>
                            </div>
                          )}

                      {pvpStage === 'SHOW_RESULT' && tempNextState && (
                        <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/40 backdrop-blur-sm rounded-full animate-fade-in">
                          <button
                            onClick={() => {
                              const nextState = tempNextState;
                              const isGameOver = nextState.winner ? true : false;
                              setMatchResult(prev => {
                                if (!prev || !nextState) return prev;
                                const newResult = {
                                  ...prev,
                                  winner: nextState.winner,
                                  scores: nextState.newScores,
                                  shocks: nextState.newShocks,
                                  logs: [...prev.logs, nextState.newLog]
                                };
                                if (nextState.winner) {
                                  saveMatchToBackend(newResult);
                                }
                                return newResult;
                              });
                              // 各種ステートをリセット
                              setPvpStage('LOBBY_START');
                              setHighlightedChair(null);
                              setShockedChair(null);
                              setPvpSetChair(null);
                              setPvpChosenChair(null);
                              setTempNextState(null);
                              setCommentary('');
                              
                              if (isGameOver) {
                                setCurrentView('RESULT');
                              } else {
                                const nextTurn = matchResult.logs.length + 2;
                                const nextIsP1Setter = nextTurn % 2 !== 0;
                                setPvpStatusMessage(`${nextIsP1Setter ? 'プレイヤー1' : 'プレイヤー2'}が電流を仕掛ける番です。`);
                              }
                            }}
                            className="px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-black rounded-lg shadow-xl transition-all scale-110 hover:scale-125 active:scale-95"
                          >
                            {tempNextState.winner ? '最終結果を見る' : '次のターンへ'}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="min-h-[70px] flex items-center justify-center mb-4 mt-6">
                      <p className={`text-lg font-bold text-gray-800 bg-white p-3 rounded-lg shadow-sm border border-orange-100 transition-all ${
                        pvpStage !== 'LOBBY_START' && pvpStage !== 'CHOOSING_CHAIR' ? 'scale-105 border-yellow-400 bg-yellow-50 animate-pulse' : ''
                      }`}>
                        {pvpStatusMessage}
                      </p>
                    </div>

                  </div>
                )}

                <div className="mt-8 text-center border-t pt-4">
                  <button onClick={() => setCurrentView('LOBBY')} className="text-gray-500 hover:underline">
                    ロビーへ戻る
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {currentView === 'GAME' && (
          <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            {/* ゲームアクティブでないときだけ表示する要素 */}
            {!isGameActive && (
              <>
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
              </>
            )}

            {!isGameActive && (
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
                    setGameStep('IDLE');
                    setStatusMessage('');
                    setHighlightedChair(null);
                    setShockedChair(null);
                    setTempNextState(null);
                    setCommentary('');
                    setLoading(false);
                  }}
                  disabled={loading}
                  className="px-8 py-3 bg-green-600 text-white font-bold rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {loading ? '対戦準備中...' : '対戦開始'}
                </button>
              </div>
            )}

            {matchResult && matchResult.matchId.startsWith('match-human-') && (
              <div className={!isGameActive ? "mt-8 border-t pt-8" : ""}>
                <div className="mb-6">
                  <BaseballScoreboard match={matchResult} />
                </div>

                {matchResult.winner && gameStep === 'IDLE' ? (
                  <div className="text-center p-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl mb-6 border border-green-100">
                    <h3 className="text-3xl font-black text-emerald-900 mb-2">
                      {matchResult.winner === 'draw' ? 'DRAW' : 'WINNER'}
                    </h3>
                    <p className="text-2xl font-bold text-green-700">
                      {matchResult.winner === 'draw' 
                        ? '引き分け' 
                        : matchResult.winner === 'human' 
                          ? 'あなた (人間)' 
                          : matchResult.player2.name}
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="mb-4">
                      <span className="text-sm bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-bold mr-2">
                        第 {Math.ceil((matchResult.logs.length + 1) / 2)} イニング / ターン {matchResult.logs.length + 1}
                      </span>
                    </div>

                    <div className="relative w-80 h-80 mx-auto bg-gray-50 rounded-full border border-gray-200 shadow-inner flex items-center justify-center my-6 overflow-hidden">
                      {/* 中央のインジケーター */}
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
                          
                          // 椅子の詳細なグラフィカル状態判定
                          const chairStatus = (() => {
                            if (shockedChair === chair) return 'SHOCKING';
                            if (gameStep === 'SHOW_RESULT' && tempNextState?.aiSetChairs?.includes(chair)) return 'AI_TRAP_REVEALED';
                            if (gameStep === 'AI_THINKING' && highlightedChair === chair) return 'TRAP_SET';
                            if (highlightedChair === chair) return 'HIGHLIGHTED';
                            if (!isAvailable) {
                              const log = matchResult.logs.find(l => l.chosenChair === chair);
                              if (log) {
                                return log.isShocked ? 'PAST_SHOCKED' : 'PAST_SAFE';
                              }
                              return 'UNAVAILABLE';
                            }
                            return 'AVAILABLE';
                          })();

                          // 椅子のスタイリングとアニメーションクラスの設定
                          const { chairClass, chairContent } = (() => {
                            switch (chairStatus) {
                              case 'SHOCKING':
                                return {
                                  chairClass: 'bg-red-600 border-2 border-red-900 text-white scale-125 shadow-lg shadow-red-500/50 z-20',
                                  chairContent: (
                                    <span className="relative flex h-full w-full items-center justify-center">
                                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                                      <span className="relative text-2xl">⚡💥</span>
                                    </span>
                                  )
                                };
                              case 'HIGHLIGHTED':
                                return {
                                  chairClass: 'bg-yellow-400 border-2 border-yellow-600 text-yellow-950 scale-110 animate-pulse shadow-md z-10',
                                  chairContent: (
                                    <span className="flex flex-col items-center justify-center leading-none">
                                      <span className="text-lg animate-bounce">🤔</span>
                                      <span className="text-[10px] font-bold">#{chair}</span>
                                    </span>
                                  )
                                };
                              case 'TRAP_SET':
                                return {
                                  chairClass: 'bg-yellow-400 border-2 border-yellow-600 text-yellow-950 scale-110 shadow-lg shadow-yellow-400/60 z-10',
                                  chairContent: (
                                    <span className="relative flex flex-col items-center justify-center leading-none">
                                      <span className="absolute inline-flex h-10 w-10 animate-ping rounded-full bg-yellow-300 opacity-60"></span>
                                      <span className="relative text-lg animate-pulse">⚡</span>
                                      <span className="relative text-[10px] font-bold">#{chair}</span>
                                    </span>
                                  )
                                };
                              case 'AI_TRAP_REVEALED':
                                return {
                                  chairClass: 'bg-orange-500 border-2 border-orange-800 text-white scale-105 shadow-lg shadow-orange-500/50 z-20',
                                  chairContent: (
                                    <span className="flex flex-col items-center justify-center leading-none">
                                      <span className="text-lg">⚡</span>
                                      <span className="text-[9px] font-bold">#{chair}</span>
                                    </span>
                                  )
                                };
                              case 'PAST_SHOCKED':
                                return {
                                  chairClass: 'bg-gradient-to-br from-red-500 to-red-700 border-2 border-red-950 text-white shadow-inner scale-95 opacity-90 cursor-not-allowed',
                                  chairContent: (
                                    <span className="flex flex-col items-center justify-center leading-none">
                                      <span className="text-lg drop-shadow">⚡</span>
                                      <span className="text-[9px] font-bold opacity-80">#{chair}</span>
                                    </span>
                                  )
                                };
                              case 'PAST_SAFE':
                                return {
                                  chairClass: 'bg-gradient-to-br from-emerald-400 to-emerald-600 border-2 border-emerald-800 text-white shadow-inner scale-95 opacity-90 cursor-not-allowed',
                                  chairContent: (
                                    <span className="flex flex-col items-center justify-center leading-none">
                                      <span className="text-base drop-shadow">✅</span>
                                      <span className="text-[9px] font-bold opacity-80">#{chair}</span>
                                    </span>
                                  )
                                };
                              case 'AVAILABLE':
                                return {
                                  chairClass: 'bg-blue-100 hover:bg-blue-200 hover:scale-110 border-2 border-blue-400 text-blue-800 shadow-md active:scale-95 cursor-pointer',
                                  chairContent: (
                                    <span className="flex flex-col items-center justify-center leading-none">
                                      <span className="text-lg">🪑</span>
                                      <span className="text-xs font-black">#{chair}</span>
                                    </span>
                                  )
                                };
                              default:
                                return {
                                  chairClass: 'bg-gray-100 border border-gray-300 text-gray-400 cursor-not-allowed opacity-40',
                                  chairContent: <span className="text-xs font-bold">{chair}</span>
                                };
                            }
                          })();

                          return (
                            <button
                              key={chair}
                              disabled={!isAvailable || gameStep !== 'IDLE' || loading}
                              style={{
                                position: 'absolute',
                                left: `${left}%`,
                                top: `${top}%`,
                                transform: 'translate(-50%, -50%)',
                              }}
                              className={`w-14 h-14 rounded-full font-bold flex items-center justify-center transition-all duration-300 ${chairClass}`}
                              onClick={async () => {
                                if (loading || gameStep !== 'IDLE') return;
                                playSound('/fix.mp3');
                                setLoading(true);
                                try {
                                  const turn = matchResult.logs.length + 1;
                                  const isHumanSetter = turn % 2 !== 0;
                                  const newScores = { ...matchResult.scores };
                                  const newShocks = { ...matchResult.shocks };
                                  let nextRemainingChairs = [...currentRemainingChairs];
                                  
                                  let aiChosenChair = 0;
                                  let isShocked = false;
                                  let aiSetChairsForReveal: number[] | undefined;

                                  if (isHumanSetter) {
                                    // 【人間が仕掛け、AIが選ぶ】
                                    setHighlightedChair(chair);
                                    setGameStep('AI_THINKING');
                                    setStatusMessage(`あなたは ${chair}番の椅子に電流を仕掛けました。AIが座る椅子を選んでいます...`);
                                    await sleep(1500);

                                    const aiRes = await getAiMoveMock(matchResult.player2.playerId, 'choose', nextRemainingChairs, newShocks.p1);
                                    playSound('/fix.mp3');
                                    aiChosenChair = aiRes.chosenChair;
                                    const humanSetChairs = [chair];
                                    
                                    isShocked = humanSetChairs.includes(aiChosenChair);

                                    setGameStep('REVEALING');
                                    setHighlightedChair(aiChosenChair);
                                    setStatusMessage(`AIは ${aiChosenChair}番の椅子を選択しました！ 運命の瞬間...`);
                                    await sleep(1500);

                                    setGameStep('SHOW_RESULT');
                                    if (isShocked) {
                                      setShockedChair(aiChosenChair);
                                      newShocks.p2 += 1;
                                      newScores.p2 = 0;
                                      playSound('/Electric_Shock.mp3');
                                      setStatusMessage(`⚡ ビリビリ！ AIは椅子 ${aiChosenChair} を選び、感電しました！`);
                                    } else {
                                      newScores.p2 += aiChosenChair;
                                      playSound('/success.mp3');
                                      setStatusMessage(`🎉 セーフ！ AIは椅子 ${aiChosenChair} を選びました。(+${aiChosenChair}点)`);
                                    }
                                    nextRemainingChairs = nextRemainingChairs.filter(c => c !== aiChosenChair);
                                  } else {
                                    // 【AIが仕掛け、人間が選ぶ】
                                    setHighlightedChair(chair);
                                    setGameStep('REVEALING');
                                    setStatusMessage(`あなたは ${chair}番の椅子に座ろうとしています... 電流が流れているかチェック中...`);
                                    await sleep(1500);

                                    const aiRes = await getAiMoveMock(matchResult.player2.playerId, 'set', nextRemainingChairs, newShocks.p1);
                                    playSound('/fix.mp3');
                                    const aiSetChairs = aiRes.setChairs;
                                    const humanChosenChair = chair;
                                    
                                    isShocked = aiSetChairs.includes(humanChosenChair);
                                    aiSetChairsForReveal = aiSetChairs;

                                    setGameStep('SHOW_RESULT');
                                    if (isShocked) {
                                      setShockedChair(humanChosenChair);
                                      newShocks.p1 += 1;
                                      newScores.p1 = 0;
                                      playSound('/Electric_Shock.mp3');
                                      setStatusMessage(`⚡ ビリビリ！あなたが選んだ椅子 ${humanChosenChair} には電流が仕掛けられていました！`);
                                    } else {
                                      newScores.p1 += humanChosenChair;
                                      playSound('/success.mp3');
                                      setStatusMessage(`🎉 セーフ！椅子 ${humanChosenChair} に座りました。(+${humanChosenChair}点)`);
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
                                      if (newShocks.p1 !== newShocks.p2) {
                                        winner = newShocks.p1 < newShocks.p2 ? 'human' : matchResult.player2.playerId;
                                      } else {
                                        winner = 'draw';
                                      }
                                    }
                                  }

                                  // 実況の取得開始
                                  setCommentary('🎙️ 実況AIが状況を分析中...');
                                  fetchCommentary(
                                    {
                                      scores: newScores,
                                      shocks: newShocks,
                                      remainingChairs: nextRemainingChairs,
                                      winner
                                    },
                                    {
                                      isHumanSetter,
                                      chosenChair: isHumanSetter ? aiChosenChair : chair,
                                      isShocked
                                    }
                                  );

                                  // 次の状態を一時的に保存
                                  setTempNextState({
                                    winner,
                                    newScores,
                                    newShocks,
                                    newLog: {
                                      turn,
                                      isHumanSetter,
                                      chosenChair: isHumanSetter ? aiChosenChair : chair,
                                      isShocked,
                                      remainingChairs: nextRemainingChairs
                                    },
                                    aiSetChairs: aiSetChairsForReveal
                                  });

                                } catch (e) {
                                  console.error(e);
                                  setStatusMessage('エラーが発生しました');
                                  setGameStep('IDLE');
                                } finally {
                                  setLoading(false);
                                }
                              }}
                            >
                              {chairContent}
                            </button>
                          );
                        });
                      })()}

                      {/* 結果表示および進行ボタン（オーバーレイ） */}
                      {gameStep === 'SHOW_RESULT' && tempNextState && (
                        <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/15 backdrop-blur-[0.5px] rounded-full animate-fade-in">
                          <button
                            onClick={() => {
                              const nextState = tempNextState;
                              const isGameOver = nextState.winner ? true : false;
                              setMatchResult(prev => {
                                if (!prev || !nextState) return prev;
                                const newResult = {
                                  ...prev,
                                  winner: nextState.winner,
                                  scores: nextState.newScores,
                                  shocks: nextState.newShocks,
                                  logs: [...prev.logs, nextState.newLog]
                                };
                                if (nextState.winner) {
                                  saveMatchToBackend(newResult);
                                }
                                return newResult;
                              });
                              // 各種ステートをリセット
                              setGameStep('IDLE');
                              setHighlightedChair(null);
                              setShockedChair(null);
                              setTempNextState(null);
                              setCommentary('');
                              if (isGameOver) {
                                setCurrentView('RESULT');
                              }
                            }}
                            className="px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-black rounded-lg shadow-xl transition-all scale-110 hover:scale-125 active:scale-95"
                          >
                            {tempNextState.winner ? '最終結果を見る' : '次のターンへ'}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* ゲームステータスメッセージ */}
                    <div className="min-h-[70px] flex items-center justify-center mb-4 mt-6">
                      <p className={`text-lg font-bold text-gray-800 bg-white p-3 rounded-lg shadow-sm border border-green-100 transition-all ${
                        gameStep !== 'IDLE' ? 'scale-105 border-yellow-400 bg-yellow-50 animate-pulse' : ''
                      }`}>
                        {gameStep === 'IDLE' ? (
                          (() => {
                            const turn = matchResult.logs.length + 1;
                            return turn % 2 !== 0 
                              ? 'あなたの番です: 電流を仕掛ける椅子を選んでください (AIが座る椅子を選びます)' 
                              : 'あなたの番です: 安全だと思う椅子を選んで座ってください (AIが電流を仕掛けました)';
                          })()
                        ) : (
                          statusMessage
                        )}
                      </p>
                    </div>

                    {/* 実況エリア */}
                    {commentary && (
                      <div className="max-w-2xl mx-auto mb-4 bg-slate-900 border-2 border-slate-700 text-green-400 p-4 rounded-xl shadow-lg font-mono text-sm sm:text-base animate-fade-in text-left">
                        {commentary}
                      </div>
                    )}
                  </div>
                )}

                {/* 戻るリンクを最下部に移動 */}
                <div className="mt-8 text-center border-t pt-4">
                  <button onClick={() => setCurrentView('LOBBY')} className="text-gray-500 hover:underline">
                    ロビーへ戻る
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen p-8 flex justify-center items-center">Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}
