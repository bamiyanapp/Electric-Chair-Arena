'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { GAME_RULES } from '@/constants/rules';

const DEFAULT_API_URL = 'http://localhost:3000/dev';
let hasWarnedMissingApiUrl = false;

// バックエンド未接続時、選択したAIとは無関係な完全ランダムへフォールバックしたことを
// プレイヤーに明示するためのバナー文言。
const OFFLINE_FALLBACK_MESSAGE = 'オフラインモード: バックエンドに接続できないため、ランダムAIと対戦しています。';

// ルール説明モーダル・ゲーム内サマリーで使う説明文。数値はGAME_RULESから
// 都度埋め込むため、rules.tsの値と乖離しない。
const RULE_DESCRIPTIONS = [
  `${GAME_RULES.TOTAL_CHAIRS}脚の椅子が円形に並んでいます。交互に「電流を仕掛ける」側と「座る椅子を選ぶ」側を担当します。`,
  `安全な椅子を選んだ場合、その椅子番号の点数を獲得します。先に${GAME_RULES.WINNING_SCORE}点を取ったプレイヤーの勝利です。`,
  `電流が仕掛けられた椅子を選んでしまうと感電し、スコアが0にリセットされます。${GAME_RULES.MAX_SHOCKS}回感電すると敗北です。`,
  `残り椅子が${GAME_RULES.MIN_CHAIRS_TO_END}脚になった時点で試合終了。得点が高い方が勝ち、同点なら感電回数が少ない方が勝ち、それも同じなら引き分けです。`,
];

// 効果音のミュート設定を保存するキーと、既定の再生音量。
const MUTE_STORAGE_KEY = 'electric_chair_muted';
const DEFAULT_SOUND_VOLUME = 0.5;

// 対戦相手選択・プレイヤー一覧でAIの性格・戦略を一言で伝えるための説明文。
const AI_DESCRIPTIONS: Record<string, string> = {
  'ai-okano': 'ギャンブラータイプ。高得点を狙って大胆に椅子を仕掛けてくる。',
  'ai-koyabu': '安全志向タイプ。リスクの低い椅子を堅実に選ぶ。',
  'ai-junior': '心理戦タイプ。相手の裏を読んで逆を突いてくる。',
  'ai-random': '完全ランダムに椅子を選ぶ、無戦略のAI。',
  'ai-rule-based': '期待値計算に基づき合理的にプレイするAI。',
  'ai-nash': 'ナッシュ均衡に基づく理論上の最適プレイを行うAI。',
};

// NEXT_PUBLIC_API_URLが未設定の場合、開発用のlocalhostへ静かにフォールバック
// すると本番ビルドでAPI呼び出しが全て失敗する事故に気づきにくいため、
// 未設定時は一度だけ警告を出す。
function getApiUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl && !hasWarnedMissingApiUrl) {
    hasWarnedMissingApiUrl = true;
    console.warn(`NEXT_PUBLIC_API_URL is not set. Falling back to ${DEFAULT_API_URL}, which will not work in production.`);
  }
  return apiUrl || DEFAULT_API_URL;
}

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
  reasoning?: string;
};

type MatchResult = {
  matchId: string;
  mode: 'human' | 'pvp';
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
  scores?: { p1: number; p2: number };
  shocks?: { p1: number; p2: number };
  // 新規保存分にのみ付与される明示的なモード。matchIdの文字列prefixに
  // 頼らずモードを判定するための型付きフィールド。無い場合(旧データ)は
  // 呼び出し側でmatchIdからの推測にフォールバックする。
  mode?: 'human' | 'pvp';
};

function isValidGameLog(value: unknown): value is GameLog {
  if (!value || typeof value !== 'object') return false;
  const log = value as Record<string, unknown>;
  return (
    typeof log.turn === 'number' &&
    typeof log.isHumanSetter === 'boolean' &&
    typeof log.chosenChair === 'number' &&
    typeof log.isShocked === 'boolean' &&
    Array.isArray(log.remainingChairs)
  );
}

// localStorageの内容は手動編集や旧スキーマとの混在で壊れている可能性があるため、
// BaseballScoreboardへ渡す前に構造を検証し、壊れた要素は読み捨てる。
function isValidMatchRecord(value: unknown): value is MatchRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.matchId === 'string' &&
    typeof record.player1Id === 'string' &&
    typeof record.player2Id === 'string' &&
    typeof record.winnerId === 'string' &&
    typeof record.ratingDiff === 'number' &&
    typeof record.createdAt === 'string' &&
    Array.isArray(record.logs) &&
    record.logs.every(isValidGameLog) &&
    (record.mode === undefined || record.mode === 'human' || record.mode === 'pvp')
  );
}

function parseStoredMatches(raw: string): MatchRecord[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isValidMatchRecord);
}

// 進行中の試合をリロードをまたいで復元できるよう、sessionStorageに保存する際のキー。
const ACTIVE_MATCH_STORAGE_KEY = 'electric_chair_active_match';

// sessionStorageの内容は手動編集や旧スキーマとの混在で壊れている可能性があるため、
// 復帰処理に使う前に構造を検証する。
function isValidPlayer(value: unknown): value is Player {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return typeof p.playerId === 'string' && typeof p.name === 'string';
}

function isValidMatchResult(value: unknown): value is MatchResult {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.matchId === 'string' &&
    (m.mode === 'human' || m.mode === 'pvp') &&
    isValidPlayer(m.player1) && isValidPlayer(m.player2) &&
    typeof m.winner === 'string' &&
    !!m.scores && typeof (m.scores as Record<string, unknown>).p1 === 'number' &&
    !!m.shocks && typeof (m.shocks as Record<string, unknown>).p1 === 'number' &&
    Array.isArray(m.logs) && m.logs.every(isValidGameLog)
  );
}

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

// 直近ログの残り椅子(無ければ全椅子)を返す。ChairBoardの表示と
// 各モードのターン処理の両方から参照されるため共通化する。
function getCurrentRemainingChairs(match: MatchResult): number[] {
  return match.logs.length > 0
    ? match.logs[match.logs.length - 1].remainingChairs
    : Array.from({ length: GAME_RULES.TOTAL_CHAIRS }, (_, i) => i + 1);
}

// 勝敗判定。p1/p2どちらの視点でも同一ロジックを使えるよう、
// 勝者として返すID文字列は呼び出し側から渡す(人間対AIモードは'human'/相手AIのID、
// PVPモードは'p1'/'p2')。
function resolveWinner(
  scores: { p1: number; p2: number },
  shocks: { p1: number; p2: number },
  remainingChairsCount: number,
  playerIds: { p1: string; p2: string }
): string {
  if (shocks.p1 >= GAME_RULES.MAX_SHOCKS || scores.p2 >= GAME_RULES.WINNING_SCORE) {
    return playerIds.p2;
  }
  if (shocks.p2 >= GAME_RULES.MAX_SHOCKS || scores.p1 >= GAME_RULES.WINNING_SCORE) {
    return playerIds.p1;
  }
  if (remainingChairsCount <= GAME_RULES.MIN_CHAIRS_TO_END) {
    if (scores.p1 !== scores.p2) {
      return scores.p1 > scores.p2 ? playerIds.p1 : playerIds.p2;
    }
    if (shocks.p1 !== shocks.p2) {
      return shocks.p1 < shocks.p2 ? playerIds.p1 : playerIds.p2;
    }
    return 'draw';
  }
  return '';
}

type ChairVisualStatus =
  | 'SHOCKING' | 'HIGHLIGHTED' | 'TRAP_SET' | 'AI_TRAP_REVEALED'
  | 'PAST_SHOCKED' | 'PAST_SAFE' | 'UNAVAILABLE' | 'AVAILABLE';

function getChairClassAndContent(status: ChairVisualStatus, chair: number) {
  switch (status) {
    case 'SHOCKING':
      return {
        chairClass: 'bg-red-600 border-2 border-red-900 text-white scale-125 shadow-lg shadow-red-500/50 z-20',
        chairContent: (
          <span className="relative flex h-full w-full items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping motion-reduce:animate-none rounded-full bg-red-400 opacity-75"></span>
            <span className="relative text-2xl">⚡💥</span>
          </span>
        )
      };
    case 'HIGHLIGHTED':
      return {
        chairClass: 'bg-yellow-400 border-2 border-yellow-600 text-yellow-950 scale-110 animate-pulse motion-reduce:animate-none shadow-md z-10',
        chairContent: (
          <span className="flex flex-col items-center justify-center leading-none">
            <span className="text-lg animate-bounce motion-reduce:animate-none">🤔</span>
            <span className="text-[10px] font-bold">#{chair}</span>
          </span>
        )
      };
    case 'TRAP_SET':
      return {
        chairClass: 'bg-yellow-400 border-2 border-yellow-600 text-yellow-950 scale-110 shadow-lg shadow-yellow-400/60 z-10',
        chairContent: (
          <span className="relative flex flex-col items-center justify-center leading-none">
            <span className="absolute inline-flex h-10 w-10 animate-ping motion-reduce:animate-none rounded-full bg-yellow-300 opacity-60"></span>
            <span className="relative text-lg animate-pulse motion-reduce:animate-none">⚡</span>
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
}

// 人間対AIモード・PVPモード共通の円形椅子盤面。ゲーム進行ロジック(誰の番か、
// 勝敗判定など)は呼び出し側が保持し、このコンポーネントは見た目の状態計算と
// 配置のみを担当する。GAME_RULES.TOTAL_CHAIRSはテストでモックされるため、
// 各テストの椅子数設定に追従する。
function ChairBoard({
  remainingChairs,
  logs,
  shockedChair,
  highlightedChair,
  getExtraStatus,
  isDisabled,
  onChairClick,
  overlay,
}: {
  remainingChairs: number[];
  logs: GameLog[];
  shockedChair: number | null;
  highlightedChair: number | null;
  getExtraStatus?: (chair: number) => ChairVisualStatus | null;
  isDisabled: (chair: number, isAvailable: boolean) => boolean;
  onChairClick: (chair: number) => void;
  overlay?: React.ReactNode;
}) {
  return (
    <div className="relative w-80 h-80 mx-auto bg-gray-50 rounded-full border border-gray-200 shadow-inner flex items-center justify-center my-6 overflow-hidden">
      <div className="w-4 h-4 bg-gray-300 rounded-full z-10 shadow-sm"></div>

      {Array.from({ length: GAME_RULES.TOTAL_CHAIRS }, (_, i) => i + 1).map(chair => {
        const isAvailable = remainingChairs.includes(chair);
        const radius = 38;
        const angle = (chair * 30 - 90) * (Math.PI / 180);
        const left = 50 + radius * Math.cos(angle);
        const top = 50 + radius * Math.sin(angle);

        const chairStatus: ChairVisualStatus = (() => {
          if (shockedChair === chair) return 'SHOCKING';
          const extra = getExtraStatus?.(chair);
          if (extra) return extra;
          if (highlightedChair === chair) return 'HIGHLIGHTED';
          if (!isAvailable) {
            const log = logs.find(l => l.chosenChair === chair);
            if (log) {
              return log.isShocked ? 'PAST_SHOCKED' : 'PAST_SAFE';
            }
            return 'UNAVAILABLE';
          }
          return 'AVAILABLE';
        })();

        const { chairClass, chairContent } = getChairClassAndContent(chairStatus, chair);

        return (
          <button
            key={chair}
            disabled={isDisabled(chair, isAvailable)}
            aria-label={`椅子${chair}番${isAvailable ? '' : '（選択済み）'}`}
            style={{
              position: 'absolute',
              left: `${left}%`,
              top: `${top}%`,
              transform: 'translate(-50%, -50%)',
            }}
            className={`w-14 h-14 rounded-full font-bold flex items-center justify-center transition-all duration-300 ${chairClass}`}
            onClick={() => onChairClick(chair)}
          >
            {chairContent}
          </button>
        );
      })}

      {overlay}
    </div>
  );
}

type ViewName = 'LOBBY' | 'RESULT' | 'GAME' | 'PVP_GAME' | 'LEADERBOARD' | 'SCOREBOARDS';

// currentView(React state)とURLの`view`クエリパラメータを双方向に同期させる。
// router.pushによるURL反映は非同期(次のレンダーで反映)なため、setCurrentView
// 直後はURL側がまだ古い値のままになる。この間にURL同期effectが古い値で
// currentViewを巻き戻してしまうのを、pendingViewRefで一時的にガードする。
// matchTokenRefは進行中の試合から離脱(ロビーへ戻る)したことを非同期のターン
// 処理に伝えるためのトークンで、対戦画面側のガード判定にも使うため公開する。
function useSyncedView(): {
  currentView: ViewName;
  setCurrentView: (view: ViewName) => void;
  matchTokenRef: React.MutableRefObject<number>;
} {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const viewFromUrl = searchParams.get('view') as ViewName | null;
  const [currentView, setCurrentViewState] = useState<ViewName>(viewFromUrl || 'LOBBY');
  // pendingViewRefはviewFromUrl（URL側）が実際にこの値に追いつくまで
  // 保持し続ける。currentViewはsetCurrentView呼び出し時点で即座に更新
  // されるため、currentViewとの一致で判定すると常に即座にクリアされて
  // しまい、URL反映の遅延中はガードとして機能しない。
  const pendingViewRef = React.useRef<ViewName | null>(null);
  // setCurrentView呼び出しごとに発行するトークン。同じviewへ短時間に
  // 複数回ナビゲートした場合、古い呼び出しのタイムアウトが新しい呼び出しの
  // pendingViewRefを誤って解除してしまわないようにするための識別子。
  const pendingTokenRef = React.useRef(0);
  // ロビーへ戻るたびに増やすトークン。進行中のターン処理(sleep等で一時停止中の
  // 非同期処理)がこのトークンを起動時点の値と比較し、不一致ならstate更新を
  // 中断する。これにより、離脱後に開始した別の試合の状態を古いターン処理が
  // 上書きしてしまうのを防ぐ。
  const matchTokenRef = React.useRef(0);
  // pendingViewRefをタイムアウトで解除した際、URL同期effectを再実行させる
  // ためのトリガー。ref変更はReactの再レンダリングを引き起こさないため、
  // この状態変化がない場合タイムアウトでの解除がeffectに反映されない。
  const [pendingGuardTick, setPendingGuardTick] = useState(0);

  useEffect(() => {
    // viewパラメータが無いURLはLOBBYを表す（setCurrentViewのLOBBY分岐を参照）。
    const effectiveUrlView = viewFromUrl || 'LOBBY';
    if (pendingViewRef.current !== null) {
      if (effectiveUrlView === pendingViewRef.current) {
        pendingViewRef.current = null;
      } else {
        return;
      }
    }
    if (effectiveUrlView !== currentView) {
      setCurrentViewState(effectiveUrlView);
    }
  }, [viewFromUrl, currentView, pendingGuardTick]);

  const setCurrentView = (view: ViewName) => {
    if (view === 'LOBBY') {
      // 進行中の試合から離脱するため、以降このトークンを起動時点の値と
      // 比較する進行中の非同期ターン処理はすべて無効化される。
      matchTokenRef.current += 1;
    }
    // viewがcurrentViewと同値の場合、setCurrentViewStateはReactにより
    // 再レンダリングがバイパスされるためeffectが再実行されず、
    // pendingViewRefをセットすると永久に解除されなくなる。
    if (view !== currentView) {
      pendingViewRef.current = view;
      // ブラウザの戻る/進む操作等でURLがこのview以外の値に変化した場合、
      // pendingViewRefはviewFromUrlと一致するまで永久に残り続けてしまい、
      // それ以降のURL同期effectがすべて機能しなくなる。router.pushによる
      // URL反映は通常一瞬で完了するため、十分待ってもまだ自分が設定した
      // 値のままであればガードを解除し、URL同期effectを再実行させる。
      // tokenで「この呼び出し自身が設定したpendingViewRefか」を判定する
      // ことで、短時間に同じviewへ再度ナビゲートした場合に古いタイムアウトが
      // 新しい呼び出しのガードを誤って解除してしまうのを防ぐ。
      const token = (pendingTokenRef.current += 1);
      setTimeout(() => {
        if (pendingTokenRef.current === token && pendingViewRef.current === view) {
          pendingViewRef.current = null;
          setPendingGuardTick((t) => t + 1);
        }
      }, 2000);
    }
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

  return { currentView, setCurrentView, matchTokenRef };
}

export function HomeContent() {
  const { currentView, setCurrentView, matchTokenRef } = useSyncedView();

  const [players, setPlayers] = useState<Player[]>([]);
  const [leaderboard, setLeaderboard] = useState<Player[]>([]);
  const [matchesList, setMatchesList] = useState<MatchRecord[]>([]);
  
  const [player2Id, setPlayer2Id] = useState<string>('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  // リロード等で失われた進行中の試合をsessionStorageから復元できる場合に保持する
  const [resumableMatch, setResumableMatch] = useState<MatchResult | null>(null);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // マウント時に一度だけ、保存済みのミュート設定を復元する
  useEffect(() => {
    try {
      setIsMuted(localStorage.getItem(MUTE_STORAGE_KEY) === 'true');
    } catch (e) {
      console.warn('Failed to read mute setting from local storage', e);
    }
  }, []);

  const handleToggleMute = () => {
    setIsMuted(prev => {
      const next = !prev;
      try {
        localStorage.setItem(MUTE_STORAGE_KEY, String(next));
      } catch (e) {
        console.warn('Failed to persist mute setting to local storage', e);
      }
      return next;
    });
  };

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
  // 直近の人間対AI戦で確定したAI側のレーティング変動(結果画面表示用)。
  // 対戦開始時にリセットし、save-matchのレスポンスが返り次第セットする。
  const [aiRatingChange, setAiRatingChange] = useState<{ before: number; diff: number } | null>(null);

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // 同じ効果音を毎回`new Audio()`し直すと再生のたびに要素を生成・破棄することになるため、
  // srcごとにHTMLAudioElementを使い回す。連続再生時に頭出しできるようcurrentTimeをリセットする。
  const audioPoolRef = React.useRef<Map<string, HTMLAudioElement>>(new Map());

  const playSound = (src: string) => {
    if (isMuted) return;
    if (typeof window !== 'undefined' && typeof Audio !== 'undefined') {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
      const url = `${basePath}${src}`;
      let audio = audioPoolRef.current.get(url);
      if (!audio) {
        audio = new Audio(url);
        audio.volume = DEFAULT_SOUND_VOLUME;
        audioPoolRef.current.set(url, audio);
      }
      audio.currentTime = 0;
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

  // fetchCommentaryの呼び出しごとに発行するトークン。応答が返ってきた時点で
  // 最新の呼び出しでなければ(=次のターンが既に始まっていれば)、古い応答で
  // commentaryを上書きしない。
  const commentaryRequestIdRef = React.useRef(0);

  // TODO: バックエンドAPIに置き換える
  const fetchCommentary = async (state: GameStateInfo, action: ActionInfo) => {
    const requestId = (commentaryRequestIdRef.current += 1);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/generate-commentary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameState: state, action })
      });
      if (!res.ok) {
        throw new Error(`commentary fetch failed: ${res.status}`);
      }
      const data = await res.json();
      if (requestId !== commentaryRequestIdRef.current) return;
      if (data.commentary) {
        setCommentary(data.commentary);
      } else {
        setCommentary('');
      }
    } catch (e) {
      console.warn('Failed to fetch commentary', e);
      // AI手番の取得失敗時と同様、劣化モードであることをエラー文言で主張し続けるのではなく
      // 実況エリア自体を消して静かに縮退させる(表示の有無で失敗を示す)。
      if (requestId === commentaryRequestIdRef.current) {
        setCommentary('');
      }
    }
  };

  // バックエンドに到達できない場合は無戦略の完全ランダムにフォールバックする。
  // 選択したAIとは無関係な相手と対戦していることを呼び出し元がUIに示せるよう、
  // isFallbackで区別できるようにする。
  const getAiMoveMock = async (aiPlayerId: string, role: string, remainingChairs: number[]) => {
    try {
      // APIエンドポイントのURL。開発環境と本番環境で切り替える必要があるかも
      // 現状はバックエンドと結合していないためモックのままにするか、直接実装する
      const apiUrl = getApiUrl();

      const res = await fetch(`${apiUrl}/ai-move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ aiPlayerId, role, remainingChairs })
      });
      if (res.ok) {
        return { ...(await res.json()), isFallback: false };
      }
    } catch (e) {
      console.warn('API call failed, fallback to mock', e);
    }

    // APIが呼べない場合はモック実装
    return {
      setChairs: [remainingChairs[Math.floor(Math.random() * remainingChairs.length)]],
      chosenChair: remainingChairs[Math.floor(Math.random() * remainingChairs.length)],
      isFallback: true
    };
  };

  const fetchMatches = async () => {
    try {
      const apiUrl = getApiUrl();
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
        setMatchesList(parseStoredMatches(localMatches));
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
      scores: matchData.scores,
      shocks: matchData.shocks,
      mode: matchData.mode,
    };

    // 常にLocalStorageにも保存する
    try {
      const localMatches = localStorage.getItem('electric_chair_matches');
      const parsedMatches = localMatches ? parseStoredMatches(localMatches) : [];
      parsedMatches.unshift(matchRecord);
      localStorage.setItem('electric_chair_matches', JSON.stringify(parsedMatches));
    } catch (e) {
      console.warn('Failed to save match to local storage', e);
    }

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/save-match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(matchRecord)
      });
      if (!res.ok) {
        console.warn(`Failed to save match result to API: ${res.status}`);
        return;
      }
      // 対AI戦の場合、確定したAI側のレーティング変動を結果画面に反映する
      if (matchData.mode === 'human') {
        const data = await res.json();
        const aiRatingDiff = data?.match?.aiRatingDiff;
        if (typeof aiRatingDiff === 'number') {
          setAiRatingChange({ before: matchData.player2.rating, diff: aiRatingDiff });
        }
      }
    } catch (e) {
      console.warn('Failed to save match result to API', e);
    }
  };

  // 人間対AI戦を開始する。「対戦開始」ボタンと、結果画面の「同じ相手と再戦」の
  // 両方から呼ばれる共通処理。
  const startHumanMatch = (opponentId: string) => {
    const opponent = players.find(p => p.playerId === opponentId);
    if (!opponent) {
      // プレイヤー一覧の取得が完了する前に対戦開始が押された場合等、
      // opponentIdがまだ有効なプレイヤーを指していないケースのガード。
      // ここで弾かないとmatchResult.player2がundefinedのまま保存され、
      // 描画時にクラッシュしてしまう。
      setError('対戦相手の情報を読み込み中です。少し待ってから再度お試しください。');
      return;
    }
    setLoading(true);
    setMatchResult({
      matchId: `match-human-${crypto.randomUUID()}`,
      mode: 'human',
      player1: { playerId: 'human', name: 'あなた (人間)', type: 'human', rating: 1500, winCount: 0, matchCount: 0 },
      player2: opponent,
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
    setError('');
    setAiRatingChange(null);
    setLoading(false);
    setCurrentView('GAME');
  };

  // プレイヤー一覧のモック（バックエンド未到達時のフォールバック用）
  const getMockPlayers = (): Player[] => [
    { playerId: 'ai-okano', name: '岡野陽一風AI', type: 'personality', rating: 1550, winCount: 42, matchCount: 80 },
    { playerId: 'ai-koyabu', name: '小籔千豊風AI', type: 'personality', rating: 1600, winCount: 55, matchCount: 90 },
    { playerId: 'ai-junior', name: '千原ジュニア風AI', type: 'personality', rating: 1620, winCount: 61, matchCount: 100 },
    { playerId: 'ai-random', name: 'ランダムAI', type: 'random', rating: 1400, winCount: 20, matchCount: 70 },
    { playerId: 'ai-rule-based', name: '期待値計算AI', type: 'rule_based', rating: 1520, winCount: 35, matchCount: 75 },
    { playerId: 'ai-nash', name: 'ナッシュ均衡AI', type: 'nash', rating: 1650, winCount: 70, matchCount: 95 },
  ];

  const applyFetchedPlayers = (fetchedPlayers: Player[]) => {
    setPlayers(fetchedPlayers);
    if (fetchedPlayers.length >= 2) {
      setPlayer2Id(prev => prev || fetchedPlayers[1].playerId);
    }
    return fetchedPlayers;
  };

  const fetchPlayers = async () => {
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/get-players`);
      if (res.ok) {
        const data = await res.json();
        const fetchedPlayers: Player[] = data.players || [];
        if (fetchedPlayers.length > 0) {
          return applyFetchedPlayers(fetchedPlayers);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch players, falling back to mock data', e);
    }

    return applyFetchedPlayers(getMockPlayers());
  };

  const fetchLeaderboard = async () => {
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/get-leaderboard`);
      if (res.ok) {
        const data = await res.json();
        const fetchedLeaderboard: Player[] = data.leaderboard || [];
        if (fetchedLeaderboard.length > 0) {
          setLeaderboard(fetchedLeaderboard);
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to fetch leaderboard, falling back to mock data', e);
    }

    setLeaderboard([...players].sort((a, b) => b.rating - a.rating));
  };

  // 初回データロード
  useEffect(() => {
    fetchPlayers().then(loadedPlayers => {
      setLeaderboard([...loadedPlayers].sort((a, b) => b.rating - a.rating));
    });
  }, []);

  const isGameActive = (currentView === 'GAME' && matchResult && matchResult.mode === 'human') ||
                       (currentView === 'PVP_GAME' && matchResult && matchResult.mode === 'pvp');

  // 復帰確認待ち(resumableMatchの提示中〜ユーザーが選択するまで)の間、直後にマウントする
  // 保存用effectがsessionStorageを上書き/削除してしまわないようにするガード。
  // 同一コミット内ではstateの更新がまだ他のeffectのクロージャに反映されないため、
  // stateではなくrefで同期的に共有する。
  const pendingResumeRef = React.useRef(false);

  // マウント時に一度だけ、前回リロード等で失われた進行中の試合が無いか確認する
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(ACTIVE_MATCH_STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isValidMatchResult(parsed) && !parsed.winner) {
          pendingResumeRef.current = true;
          setResumableMatch(parsed);
        } else {
          sessionStorage.removeItem(ACTIVE_MATCH_STORAGE_KEY);
        }
      }
    } catch (e) {
      console.warn('Failed to restore active match from session storage', e);
    }
  }, []);

  // 試合が進行中の間だけsessionStorageへ保存し、決着後や試合開始前はクリアする
  useEffect(() => {
    if (pendingResumeRef.current) return;
    try {
      if (matchResult && !matchResult.winner) {
        sessionStorage.setItem(ACTIVE_MATCH_STORAGE_KEY, JSON.stringify(matchResult));
      } else {
        sessionStorage.removeItem(ACTIVE_MATCH_STORAGE_KEY);
      }
    } catch (e) {
      console.warn('Failed to persist active match to session storage', e);
    }
  }, [matchResult]);

  // 対戦画面を表示中はタブを閉じる/リロードする操作にブラウザ標準の離脱警告を出す
  useEffect(() => {
    if (!isGameActive) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isGameActive]);

  // 進行中の試合を持ったままロビーへ戻ろうとした場合のみ確認ダイアログを出す
  const handleLeaveActiveMatch = () => {
    const hasUnfinishedMatch = isGameActive && !!matchResult && !matchResult.winner;
    if (hasUnfinishedMatch && !window.confirm('進行中の試合は失われます。ロビーへ戻りますか？')) {
      return;
    }
    // matchResultを残したままロビーへ戻ると、再度同じモードへ入った際に
    // isGameActiveが真のままになり、対戦相手選択画面をスキップして
    // 直前の(決着済みの)試合結果表示にジャンプしてしまう。
    setMatchResult(null);
    setCurrentView('LOBBY');
  };

  const handleResumeMatch = () => {
    if (!resumableMatch) return;
    pendingResumeRef.current = false;
    setMatchResult(resumableMatch);
    setCurrentView(resumableMatch.mode === 'pvp' ? 'PVP_GAME' : 'GAME');
    if (resumableMatch.mode === 'pvp') {
      const turn = resumableMatch.logs.length + 1;
      const isP1Setter = turn % 2 !== 0;
      setPvpStage('LOBBY_START');
      setPvpStatusMessage(`${isP1Setter ? 'プレイヤー1' : 'プレイヤー2'}が電流を仕掛ける番です。`);
    } else {
      setGameStep('IDLE');
      setStatusMessage('');
    }
    setHighlightedChair(null);
    setShockedChair(null);
    setTempNextState(null);
    setCommentary('');
    setResumableMatch(null);
  };

  const handleDiscardResumableMatch = () => {
    pendingResumeRef.current = false;
    try {
      sessionStorage.removeItem(ACTIVE_MATCH_STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear active match from session storage', e);
    }
    setResumableMatch(null);
  };

  const handlePvpChairClick = async (chair: number) => {
    if (!matchResult || loading) return;
    const token = matchTokenRef.current;
    const currentRemainingChairs = getCurrentRemainingChairs(matchResult);
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
        if (matchTokenRef.current !== token) return;

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

        const winner = resolveWinner(newScores, newShocks, nextRemainingChairs.length, { p1: 'p1', p2: 'p2' });

        setTempNextState({
          winner,
          newScores,
          newShocks,
          newLog: {
            turn,
            isHumanSetter: isP1Setter,
            chosenChair: chosen,
            isShocked,
            remainingChairs: nextRemainingChairs,
            scores: newScores,
            shocks: newShocks
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
  };

  const handleGameChairClick = async (chair: number) => {
    if (!matchResult || loading || gameStep !== 'IDLE') return;
    const token = matchTokenRef.current;
    const currentRemainingChairs = getCurrentRemainingChairs(matchResult);
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
      let aiReasoning: string | undefined;

      if (isHumanSetter) {
        // 【人間が仕掛け、AIが選ぶ】
        setHighlightedChair(chair);
        setGameStep('AI_THINKING');
        setStatusMessage(`あなたは ${chair}番の椅子に電流を仕掛けました。AIが座る椅子を選んでいます...`);
        await sleep(1500);
        if (matchTokenRef.current !== token) return;

        const aiRes = await getAiMoveMock(matchResult.player2.playerId, 'choose', nextRemainingChairs);
        if (matchTokenRef.current !== token) return;
        setError(aiRes.isFallback ? OFFLINE_FALLBACK_MESSAGE : '');
        playSound('/fix.mp3');
        aiChosenChair = aiRes.chosenChair;
        aiReasoning = aiRes.reasoning;
        const humanSetChairs = [chair];

        isShocked = humanSetChairs.includes(aiChosenChair);

        setGameStep('REVEALING');
        setHighlightedChair(aiChosenChair);
        setStatusMessage(`AIは ${aiChosenChair}番の椅子を選択しました！ 運命の瞬間...`);
        await sleep(1500);
        if (matchTokenRef.current !== token) return;

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
        if (matchTokenRef.current !== token) return;

        const aiRes = await getAiMoveMock(matchResult.player2.playerId, 'set', nextRemainingChairs);
        if (matchTokenRef.current !== token) return;
        setError(aiRes.isFallback ? OFFLINE_FALLBACK_MESSAGE : '');
        playSound('/fix.mp3');
        const aiSetChairs = aiRes.setChairs;
        const humanChosenChair = chair;
        aiReasoning = aiRes.reasoning;

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

      const winner = resolveWinner(newScores, newShocks, nextRemainingChairs.length, { p1: 'human', p2: matchResult.player2.playerId });

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
          remainingChairs: nextRemainingChairs,
          scores: newScores,
          shocks: newShocks,
          reasoning: aiReasoning
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
  };

  return (
    <main className="min-h-screen p-4 sm:p-8 bg-gray-50 text-gray-900 font-sans">
      {resumableMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full text-center space-y-4">
            <h3 className="text-lg font-bold text-gray-900">前回の試合を再開しますか？</h3>
            <p className="text-sm text-gray-600">リロード等により中断された対戦が見つかりました。</p>
            <div className="flex gap-3 justify-center">
              <button onClick={handleResumeMatch} className="px-4 py-2 bg-green-600 text-white font-bold rounded-md hover:bg-green-700">再開する</button>
              <button onClick={handleDiscardResumableMatch} className="px-4 py-2 bg-gray-200 text-gray-700 font-bold rounded-md hover:bg-gray-300">破棄する</button>
            </div>
          </div>
        </div>
      )}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowRulesModal(false)}>
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">ルール説明</h3>
              <button onClick={() => setShowRulesModal(false)} aria-label="閉じる" className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <ul className="space-y-3 text-sm text-gray-700 text-left list-disc list-inside">
              {RULE_DESCRIPTIONS.map((text, i) => (
                <li key={i}>{text}</li>
              ))}
            </ul>
            <button onClick={() => setShowRulesModal(false)} className="w-full px-4 py-2 bg-blue-600 text-white font-bold rounded-md hover:bg-blue-700">閉じる</button>
          </div>
        </div>
      )}
      <button
        onClick={handleToggleMute}
        aria-label={isMuted ? '効果音をオンにする' : '効果音をオフにする'}
        aria-pressed={isMuted}
        className="fixed top-2 right-2 z-40 w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-md border border-gray-200 text-xl hover:bg-gray-50"
      >
        {isMuted ? '🔇' : '🔊'}
      </button>
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-8">
        {/* 対戦中・対戦結果が表示されている間（対戦開始後）はヘッダーをカットする */}
        {!isGameActive && (
          <header className="text-center space-y-1 sm:space-y-2 cursor-pointer py-2 sm:py-4" onClick={handleLeaveActiveMatch}>
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
            <div className="text-center">
              <button onClick={() => setShowRulesModal(true)} className="text-sm text-blue-600 hover:underline font-medium">📖 ルール説明</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button onClick={() => setCurrentView('GAME')} className="p-6 bg-green-600 text-white rounded-xl shadow hover:bg-green-700 transition">
                <h3 className="text-xl font-bold mb-2">人間対AI</h3>
                <p className="text-sm opacity-90">あなたがAIと対戦します</p>
              </button>
              <button onClick={() => setCurrentView('PVP_GAME')} className="p-6 bg-orange-600 text-white rounded-xl shadow hover:bg-orange-700 transition">
                <h3 className="text-xl font-bold mb-2">人対人 (ローカル)</h3>
                <p className="text-sm opacity-90">1台のデバイスで交互に操作して2人対戦を行います</p>
              </button>
              <button onClick={() => { fetchLeaderboard(); setCurrentView('LEADERBOARD'); }} className="p-6 bg-purple-600 text-white rounded-xl shadow hover:bg-purple-700 transition">
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
                    {AI_DESCRIPTIONS[p.playerId] && (
                      <div className="text-xs text-gray-500 mt-1">{AI_DESCRIPTIONS[p.playerId]}</div>
                    )}
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
              <button onClick={handleLeaveActiveMatch} className="text-blue-600 hover:underline font-medium">ロビーへ戻る</button>
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

            {matchResult.mode === 'human' && aiRatingChange && (
              <div className="text-center mb-8 text-sm text-gray-600">
                {matchResult.player2.name}のレーティング: {aiRatingChange.before} → {aiRatingChange.before + aiRatingChange.diff}
                {' '}({aiRatingChange.diff >= 0 ? '+' : ''}{aiRatingChange.diff})
              </div>
            )}

            <BaseballScoreboard match={matchResult} />

            <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
              {matchResult.mode === 'human' && (
                <button
                  onClick={() => startHumanMatch(matchResult.player2.playerId)}
                  className="px-6 py-3 bg-green-600 text-white font-bold rounded-md hover:bg-green-700 transition-colors shadow-sm"
                >
                  同じ相手と再戦
                </button>
              )}
              <button
                onClick={handleLeaveActiveMatch}
                className="px-6 py-3 bg-gray-200 text-gray-700 font-bold rounded-md hover:bg-gray-300 transition-colors"
              >
                ロビーへ戻る
              </button>
            </div>
          </section>
        )}

        {currentView === 'LEADERBOARD' && (
          <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold">リーダーボード</h2>
              <button onClick={handleLeaveActiveMatch} className="text-gray-500 hover:underline">ロビーへ戻る</button>
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
              <button onClick={handleLeaveActiveMatch} className="text-gray-500 hover:underline">ロビーへ戻る</button>
            </div>
            
            {matchesList.length === 0 ? (
              <p className="text-center text-gray-500 py-8">過去の対戦記録がありません。</p>
            ) : (
              <div className="space-y-8">
                {matchesList.map(m => {
                  // BaseballScoreboardコンポーネントのPropsに合わせるため、一部データをモックで補完
                  // mode未保存の旧データのみ、matchIdの文字列prefixから推測する
                  const mockMatchResult: MatchResult = {
                    matchId: m.matchId,
                    mode: m.mode ?? (m.matchId.startsWith('match-pvp-') ? 'pvp' : 'human'),
                    player1: players.find(p => p.playerId === m.player1Id) || { playerId: m.player1Id, name: m.player1Id, type: '', rating: 0, winCount: 0, matchCount: 0 },
                    player2: players.find(p => p.playerId === m.player2Id) || { playerId: m.player2Id, name: m.player2Id, type: '', rating: 0, winCount: 0, matchCount: 0 },
                    winner: m.winnerId,
                    ratingDiff: m.ratingDiff,
                    scores: m.logs && m.logs.length > 0 ? (m.logs[m.logs.length - 1].scores || { p1: 0, p2: 0 }) : { p1: 0, p2: 0 },
                    shocks: m.logs && m.logs.length > 0 ? (m.logs[m.logs.length - 1].shocks || { p1: 0, p2: 0 }) : { p1: 0, p2: 0 },
                    logs: m.logs || []
                  };

                  const reasoningLogs = mockMatchResult.logs.filter(l => l.reasoning);

                  return (
                    <div key={m.matchId} className="border rounded-lg p-4 bg-gray-50 shadow-sm">
                      <div className="text-sm text-gray-500 mb-2">Match ID: {m.matchId} | Date: {new Date(m.createdAt).toLocaleString()}</div>
                      <BaseballScoreboard match={mockMatchResult} />
                      {reasoningLogs.length > 0 && (
                        <div className="mt-3 space-y-1 text-xs text-gray-600 text-left">
                          {reasoningLogs.map(l => (
                            <p key={l.turn}><span className="font-bold">Turn {l.turn}:</span> {l.reasoning}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {currentView === 'PVP_GAME' && (
          <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            {(!matchResult || matchResult.mode !== 'pvp') && (
              <>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-semibold">人対人 (ローカル対戦) モード</h2>
                  <button onClick={handleLeaveActiveMatch} className="text-gray-500 hover:underline">ロビーへ戻る</button>
                </div>
                
                <div className="text-center mt-8">
                  <button
                    onClick={() => {
                      setLoading(true);
                      setMatchResult({
                        matchId: `match-pvp-${crypto.randomUUID()}`,
                        mode: 'pvp',
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

            {matchResult && matchResult.mode === 'pvp' && (
              <div className="">
                <div className="mb-6">
                  <BaseballScoreboard match={matchResult} />
                </div>

                {matchResult.winner && (pvpStage === 'SHOW_RESULT' || pvpStage === 'LOBBY_START') ? (
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
                      <span className="text-xs text-gray-500">
                        {GAME_RULES.WINNING_SCORE}点先取 / 感電{GAME_RULES.MAX_SHOCKS}回で敗北
                        (P1あと{Math.max(0, GAME_RULES.WINNING_SCORE - matchResult.scores.p1)}点 / P2あと{Math.max(0, GAME_RULES.WINNING_SCORE - matchResult.scores.p2)}点)
                      </span>
                    </div>

                    <ChairBoard
                      remainingChairs={getCurrentRemainingChairs(matchResult)}
                      logs={matchResult.logs}
                      shockedChair={shockedChair}
                      highlightedChair={highlightedChair}
                      getExtraStatus={(chair) => {
                        if (pvpStage === 'SHOW_RESULT' && pvpSetChair === chair) return 'AI_TRAP_REVEALED';
                        return null;
                      }}
                      isDisabled={(_chair, isAvailable) => !isAvailable || loading || (pvpStage !== 'LOBBY_START' && pvpStage !== 'CHOOSING_CHAIR')}
                      onChairClick={handlePvpChairClick}
                      overlay={
                        <>
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
                                    setCurrentView('PVP_GAME');
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
                        </>
                      }
                    />

                    <div className="min-h-[70px] flex items-center justify-center mb-4 mt-6">
                      <p aria-live="polite" className={`text-lg font-bold text-gray-800 bg-white p-3 rounded-lg shadow-sm border border-orange-100 transition-all ${
                        pvpStage !== 'LOBBY_START' && pvpStage !== 'CHOOSING_CHAIR' ? 'scale-105 border-yellow-400 bg-yellow-50 animate-pulse motion-reduce:animate-none' : ''
                      }`}>
                        {pvpStatusMessage}
                      </p>
                    </div>

                  </div>
                )}

                <div className="mt-8 text-center border-t pt-4">
                  <button onClick={handleLeaveActiveMatch} className="text-gray-500 hover:underline">
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
                  <button onClick={handleLeaveActiveMatch} className="text-gray-500 hover:underline">ロビーへ戻る</button>
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
                    {AI_DESCRIPTIONS[player2Id] && (
                      <p className="text-xs text-gray-500 mt-2">{AI_DESCRIPTIONS[player2Id]}</p>
                    )}
                  </div>
                </div>
              </>
            )}

            {!isGameActive && (
              <div className="mt-8 flex justify-center">
                <button
                  onClick={() => startHumanMatch(player2Id)}
                  disabled={loading || !players.some(p => p.playerId === player2Id)}
                  className="px-8 py-3 bg-green-600 text-white font-bold rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {loading ? '対戦準備中...' : '対戦開始'}
                </button>
              </div>
            )}

            {matchResult && matchResult.mode === 'human' && (
              <div className={!isGameActive ? "mt-8 border-t pt-8" : ""}>
                {error && (
                  <div role="status" aria-live="polite" className="mb-4 text-center text-sm font-bold text-amber-900 bg-amber-100 border border-amber-300 rounded-lg py-2 px-3">
                    ⚠️ {error}
                  </div>
                )}
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
                      <span className="text-xs text-gray-500">
                        {GAME_RULES.WINNING_SCORE}点先取 / 感電{GAME_RULES.MAX_SHOCKS}回で敗北
                        (あなた: あと{Math.max(0, GAME_RULES.WINNING_SCORE - matchResult.scores.p1)}点)
                      </span>
                    </div>

                    <ChairBoard
                      remainingChairs={getCurrentRemainingChairs(matchResult)}
                      logs={matchResult.logs}
                      shockedChair={shockedChair}
                      highlightedChair={highlightedChair}
                      getExtraStatus={(chair) => {
                        if (gameStep === 'SHOW_RESULT' && tempNextState?.aiSetChairs?.includes(chair)) return 'AI_TRAP_REVEALED';
                        if (gameStep === 'AI_THINKING' && highlightedChair === chair) return 'TRAP_SET';
                        return null;
                      }}
                      isDisabled={(_chair, isAvailable) => !isAvailable || gameStep !== 'IDLE' || loading}
                      onChairClick={handleGameChairClick}
                      overlay={
                        gameStep === 'SHOW_RESULT' && tempNextState && (
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
                        )
                      }
                    />

                    {/* ゲームステータスメッセージ */}
                    <div className="min-h-[70px] flex items-center justify-center mb-4 mt-6">
                      <p aria-live="polite" className={`text-lg font-bold text-gray-800 bg-white p-3 rounded-lg shadow-sm border border-green-100 transition-all ${
                        gameStep !== 'IDLE' ? 'scale-105 border-yellow-400 bg-yellow-50 animate-pulse motion-reduce:animate-none' : ''
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

                    {/* AIの心の声(reasoning)。仕掛け側の分もこの時点では既に本人の選択が
                        確定した後のため、事前に見せてしまうネタバレにはならない。 */}
                    {gameStep === 'SHOW_RESULT' && tempNextState?.newLog.reasoning && (
                      <div aria-live="polite" className="max-w-2xl mx-auto mb-4 bg-white border-2 border-purple-200 text-gray-800 p-4 rounded-xl shadow-sm text-sm sm:text-base animate-fade-in text-left">
                        <span className="font-bold text-purple-700">🗯️ {matchResult.player2.name}: </span>
                        {tempNextState.newLog.reasoning}
                      </div>
                    )}

                    {/* 実況エリア */}
                    {commentary && (
                      <div aria-live="polite" className="max-w-2xl mx-auto mb-4 bg-slate-900 border-2 border-slate-700 text-green-400 p-4 rounded-xl shadow-lg font-mono text-sm sm:text-base animate-fade-in text-left">
                        {commentary}
                      </div>
                    )}
                  </div>
                )}

                {/* 戻るリンクを最下部に移動 */}
                <div className="mt-8 text-center border-t pt-4">
                  <button onClick={handleLeaveActiveMatch} className="text-gray-500 hover:underline">
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
