'use client';

import React, { useState } from 'react';

import { useEffect } from 'react';

export default function Home() {
  const [isStarted, setIsStarted] = useState(false);
  const [angle, setAngle] = useState(0); // 角度（度数法：-180 〜 180）
  const [judged, setJudged] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  const [isPassed, setIsPassed] = useState(false);

  // URLパラメータと状態の同期用関数
  const updateUrl = (started: boolean, currentAngle: number, currentJudged: boolean) => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams();
    if (started) {
      params.set('started', 'true');
      if (currentAngle !== 0) {
        params.set('angle', currentAngle.toString());
      }
      if (currentJudged) {
        params.set('judged', 'true');
      }
    }
    const newSearch = params.toString();
    const newUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}`;
    window.history.pushState(null, '', newUrl);
  };

  // マウント時にURLパラメータから状態を復元
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    
    const startedParam = params.get('started') === 'true';
    const angleParam = Number(params.get('angle') || 0);
    const judgedParam = params.get('judged') === 'true';
    
    if (startedParam) {
      setIsStarted(true);
    }
    if (angleParam !== 0) {
      setAngle(angleParam);
    }
    if (judgedParam) {
      setJudged(true);
      const result = judgeHankoAngle(angleParam);
      setIsPassed(result.isPassed);
      setResultMessage(result.message);
    }
  }, []);

  const handleStart = () => {
    setIsStarted(true);
    setAngle(0);
    setJudged(false);
    setResultMessage('');
    setIsPassed(false);
    updateUrl(true, 0, false);
  };

  const handleJudge = () => {
    setJudged(true);
    const result = judgeHankoAngle(angle);
    setIsPassed(result.isPassed);
    setResultMessage(result.message);
    updateUrl(isStarted, angle, true);
  };

  const handleReset = () => {
    setAngle(0);
    setJudged(false);
    setResultMessage('');
    setIsPassed(false);
    updateUrl(isStarted, 0, false);
  };

  const handleBackToTop = () => {
    setIsStarted(false);
    updateUrl(false, 0, false);
  };

  if (isStarted) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-24 bg-gray-50">
        <div className="w-full max-w-2xl bg-white rounded-xl shadow-md p-6 border border-gray-200">
          <div className="flex justify-between items-center border-b pb-4 mb-6">
            <div>
              <span className="bg-red-100 text-red-800 text-xs font-semibold px-2.5 py-0.5 rounded">
                ステージ 1
              </span>
              <h2 className="text-2xl font-bold text-gray-800 mt-1">
                課長承認：はじめてのお辞儀ハンコ
              </h2>
            </div>
            <button
              onClick={handleBackToTop}
              className="text-gray-500 hover:text-gray-700 text-sm font-medium"
            >
              戻る
            </button>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-amber-900 mb-1">
              ミッション
            </h3>
            <p className="text-sm text-amber-800">
              稟議書（パソコン購入申請）に捺印しなさい。
              ただし、日本企業の伝統マナーに基づき、
              <strong>上司（課長）に向かってお辞儀をするように、左に少し傾けて（お辞儀ハンコ）</strong>
              捺印すること。
            </p>
          </div>

          {/* 稟議書風のプレビュー領域 */}
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 bg-white mb-6 relative overflow-hidden min-h-[250px] flex flex-col justify-between">
            <div className="text-center">
              <h3 className="text-xl font-bold border-b-2 border-double border-gray-800 pb-2 inline-block text-gray-800">
                パソコン購入稟議書
              </h3>
            </div>

            <div className="my-6 text-sm text-gray-700 space-y-2">
              <p>
                <strong>件名：</strong> 開発用ハイスペックPCの新規調達
              </p>
              <p>
                <strong>理由：</strong> 現行のPCスペック不足により、ビルドおよびデバッグに著しい支障が出ているため。
              </p>
            </div>

            {/* 捺印欄 */}
            <div className="flex justify-end mt-4">
              <div className="flex border border-gray-800 text-center">
                <div className="w-20 border-r border-gray-800">
                  <div className="bg-gray-100 text-xs py-1 border-b border-gray-800 text-gray-800">
                    部長
                  </div>
                  <div className="h-16 flex items-center justify-center text-gray-300 text-xs select-none">
                    （未承認）
                  </div>
                </div>
                <div className="w-20 border-r border-gray-800 bg-red-50/10 relative">
                  <div className="bg-gray-100 text-xs py-1 border-b border-gray-800 text-gray-800">
                    課長
                  </div>
                  <div className="h-16 flex items-center justify-center">
                    {/* 捺印される印影 */}
                    <div
                      style={{
                        transform: `rotate(${angle}deg)`,
                        transition: judged ? 'transform 0.5s ease' : 'none',
                      }}
                      className={`w-12 h-12 rounded-full border-2 border-red-500 flex items-center justify-center text-red-500 font-bold select-none ${
                        judged ? 'opacity-100' : 'opacity-40 animate-pulse'
                      }`}
                    >
                      <span className="text-sm tracking-widest leading-none block transform scale-90">
                        鈴木
                      </span>
                    </div>
                  </div>
                </div>
                <div className="w-20">
                  <div className="bg-gray-100 text-xs py-1 border-b border-gray-800 text-gray-800">
                    起案者
                  </div>
                  <div className="h-16 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full border-2 border-red-400 flex items-center justify-center text-red-400 font-semibold text-xs select-none">
                      鈴木
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 判定結果の表示 */}
          {judged && (
            <div
              className={`p-4 rounded-lg mb-6 border ${
                isPassed
                  ? 'bg-green-50 border-green-200 text-green-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              <h4 className="font-bold mb-1">
                {isPassed ? '🎉 合格！' : '❌ 差し戻し！'}
              </h4>
              <p className="text-sm leading-relaxed">{resultMessage}</p>
            </div>
          )}

          {/* コントロールパネル */}
          {!judged ? (
            <div className="space-y-4">
              <div>
                <label className="flex justify-between text-sm font-medium text-gray-700 mb-1">
                  <span>お辞儀角度の調整: {angle}度</span>
                  <span className="text-xs text-gray-500">
                    ※左へ傾けるほどマイナス
                  </span>
                </label>
                <input
                  type="range"
                  min="-90"
                  max="90"
                  value={angle}
                  onChange={(e) => {
                    const newAngle = Number(e.target.value);
                    setAngle(newAngle);
                    updateUrl(isStarted, newAngle, judged);
                  }}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-red-600"
                />
                <div className="flex justify-between text-xs text-gray-600 px-1 mt-1">
                  <span>← 左に深くお辞儀 (-90度)</span>
                  <span>真っ直ぐ (0度)</span>
                  <span>右にのけぞる (+90度) →</span>
                </div>
              </div>

              <button
                onClick={handleJudge}
                className="w-full py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors shadow-sm"
              >
                これで捺印を申請する
              </button>
            </div>
          ) : (
            <div className="flex gap-4">
              <button
                onClick={handleReset}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg transition-colors border border-gray-300"
              >
                もう一度調整する
              </button>
              {isPassed && (
                <button
                  onClick={handleBackToTop}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors shadow-sm"
                >
                  メイン画面へ戻る
                </button>
              )}
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-24 bg-gradient-to-b from-red-50 to-white">
      <div className="text-center max-w-xl">
        <div className="inline-block bg-red-100 border border-red-200 rounded-full p-2 mb-6 shadow-sm">
          <span className="text-3xl">💮</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900">
          ハンコマスター検定
        </h1>
        <p className="mt-4 text-lg md:text-xl text-gray-600 leading-relaxed">
          誠意ある捺印こそが、社会人の基本です。
          あなたの「捺印マナー力」を今こそ証明しましょう。
        </p>
        <button
          onClick={handleStart}
          className="mt-10 px-8 py-4 bg-red-600 text-white text-lg font-bold rounded-xl hover:bg-red-700 hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg hover:shadow-red-200"
        >
          検定を開始する
        </button>
      </div>
    </main>
  );
}

export function judgeHankoAngle(angle: number): { isPassed: boolean; message: string } {
  // マナー判定：お辞儀ハンコは、左（反時計回り）に少し傾けるのが正解とされる。
  // 反時計回り（左に傾く）をマイナスの角度とする。
  // 理想的なお辞儀角度は -35度 〜 -10度 とする。
  if (angle >= -35 && angle <= -10) {
    return {
      isPassed: true,
      message: '【合格】 課長「うむ、鈴木くん。この左に少し傾いた絶妙なお辞儀角度…実に見事な誠意だ！上司への敬意が痛いほど伝わってくる。これぞ一流の社会人の捺印だな！」',
    };
  } else if (angle === 0) {
    return {
      isPassed: false,
      message: '【差し戻し】 課長「なんだねこの直立不動なハンコは！上司に対してペコペコとお辞儀をする気持ちがこれっぽっちも感じられん！態度が硬すぎる、やり直し！」',
    };
  } else if (angle > 0) {
    return {
      isPassed: false,
      message: '【差し戻し】 課長「バカ者！ハンコが右にのけぞっているではないか！上司を見下して威嚇しているのか！？あまりに無礼千万、すぐに押し直したまえ！」',
    };
  } else {
    return {
      isPassed: false,
      message: '【差し戻し】 課長「鈴木くん、いくら何でも傾けすぎだ。これではお辞儀というより、もはや地面にひれ伏して土下座しているか、転んでいるように見えるぞ。ほどほどにしたまえ。」',
    };
  }
}
