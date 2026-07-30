'use strict';

const { GAME_RULES, getNumToSet } = require('./rules.js');

/**
 * Fictitious Play によるナッシュ均衡計算モジュール
 *
 * 各ターンにおいて、設置者（親）と選択者（子）の混合戦略を
 * 反復解法で近似し、ゲームの値を算出する。
 */

// 感電時のペナルティ(状態非依存のヒューリスティックで用いる。終盤の
// 厳密先読み(solveEndgameValue)を使う局面では、代わりに実際の継続価値の
// 差分を椅子ごとに用いるためここでは使用しない)。
// あと1回の感電で敗北する局面では、期待得点をどれだけ犠牲にしてでも
// 安全な選択を優先させるため、通常のスコア価値を確実に上回るペナルティを返す。
const SHOCK_ELIMINATION_PENALTY = 1000;
// 敗北に直結しない感電のリスクコスト係数。自己対戦ベンチマーク(benchmark.js)で
// 較正した値: 現スコアをそのまま(係数1.0で)コストに加えると、選択者が
// 必要以上に安全策へ偏り勝率が悪化することを確認したため小さめの係数(0.05)を掛け、
// 感電回数自体には固定コスト(1回あたり3)を加える。既に1回以上感電している場合の
// 追加リスクをわずかに織り込む一方、通常時(現スコアが高いだけの場面)の判断を
// 大きく歪めないための較正。
const SHOCK_SCORE_COST_FACTOR = 0.05;
const SHOCK_COUNT_COST_PER_SHOCK = 3;

// 残り椅子がこの数以下になったら、状態非依存の実効値ヒューリスティックではなく
// 厳密な先読み(solveEndgameValue)へ切り替える。自己対戦ベンチマークで較正した値:
// 大きくしすぎる(例: 5)と、先読みが「相手も均衡戦略で打つ」と仮定して深く
// 読みすぎることが、その仮定が成り立たない性格AI(ai-junior等)相手にかえって
// 裏目に出ることを確認したため、実際の終盤(3脚以下)に限定する。この前提
// (相手も均衡戦略で打つと仮定する)自体の精度向上は、対戦相手の傾向を観測して
// 反映する仕組み(issue #167)の実装後に再検討する。
const ENDGAME_LOOKAHEAD_MAX_CHAIRS = 3;
// 先読みの各局面で行うfictitiousPlayの反復回数。局面数が多くなるため、
// 通常の意思決定(1000回)より少なくして応答時間を抑える。
const ENDGAME_ITERATIONS = 200;
// 先読みにおける勝敗確定を表す値(スコア差ベースの値を確実に上回る大きさ)。
const ENDGAME_WIN_VALUE = 1000;

// 相手の観測傾向(issue #167)を搾取側へ反映する信頼度が1(常に搾取側を採用)に
// 達するまでに必要な観測件数。自己対戦ベンチマークで較正した値: 小さすぎると
// 少数の観測(偶然の一致を含む)にも過剰反応し、大きすぎると観測が蓄積しても
// 均衡プレイからほとんど動かず搾取の効果が実質無くなる。
const OPPONENT_MODEL_CONFIDENCE_SATURATION_COUNT = 5;

/**
 * Fictitious Play を実行し、混合戦略とゲームの値を返す
 *
 * @param {number[]} remainingChairs - 残っている椅子の番号配列
 * @param {number} numToSet - 設置者が電流を仕掛ける椅子の数
 * @param {number} [iterations=1000] - 反復回数
 * @param {(chair: number) => number} [valueFn] - 椅子番号cに安全に着地した場合の
 *   選択者(chooser)から見た価値を返す関数。省略時は椅子番号そのものを価値とみなす
 *   (従来の挙動)。対局状態(勝利に必要な残り得点など)を考慮した実効価値に
 *   差し替えるために使う。
 * @param {(chair: number) => number} [trapCostFn] - 椅子番号cで感電した場合に、
 *   安全時と比べて選択者(chooser)が追加で失う価値を返す関数。省略時は0
 *   (感電は単に利得0とみなす、従来の挙動)。感電によるスコアリセット・
 *   感電進行のリスクを価値に反映するために使う。
 * @returns {{ setProb: Object, chooseProb: Object, gameValue: number }}
 */
function fictitiousPlay(remainingChairs, numToSet, iterations = 1000, valueFn = (c) => c, trapCostFn = () => 0) {
  const chairs = remainingChairs;

  // カウンター初期化
  const setCounts = {};
  const chooseCounts = {};
  chairs.forEach(c => { setCounts[c] = 0; chooseCounts[c] = 0; });

  for (let t = 0; t < iterations; t++) {
    const totalChooses = Object.values(chooseCounts).reduce((a, b) => a + b, 0) || 1;
    const totalSets = Object.values(setCounts).reduce((a, b) => a + b, 0) || 1;

    // 設置者の最適反応: 選択者の経験分布に対して q_i * (v_i + 感電コスト_i) が大きい順に numToSet 個選ぶ
    const setChairs = computeSetterBestResponse(chairs, numToSet, chooseCounts, totalChooses, valueFn, trapCostFn);

    // 選択者の最適反応: 設置者の経験分布に対して (1 - p_i) * v_i - p_i * 感電コスト_i が最大の椅子を選ぶ
    const chosenChair = computeChooserBestResponse(chairs, setCounts, totalSets, valueFn, trapCostFn);

    // カウンター更新
    setChairs.forEach(c => { setCounts[c] += 1; });
    chooseCounts[chosenChair] += 1;
  }

  // 混合戦略の計算
  const totalSets = Object.values(setCounts).reduce((a, b) => a + b, 0);
  const totalChooses = Object.values(chooseCounts).reduce((a, b) => a + b, 0);

  const setProb = {};
  const chooseProb = {};
  chairs.forEach(c => {
    setProb[c] = setCounts[c] / totalSets;
    chooseProb[c] = chooseCounts[c] / totalChooses;
  });

  // ゲームの値（選択者の期待値） V = Σ_i q_i * [(1 - p_i) * v_i - p_i * 感電コスト_i]
  const gameValue = chairs.reduce((sum, c) => {
    return sum + chooseProb[c] * ((1 - setProb[c]) * valueFn(c) - setProb[c] * trapCostFn(c));
  }, 0);

  return { setProb, chooseProb, gameValue };
}

/**
 * 設置者の最適反応を計算
 * 選択者の経験分布 q_i に対して、q_i * (v_i + 感電コスト_i) が大きい順に numToSet 個の椅子を選ぶ。
 * 感電コストを含めることで、価値を与えないこと(denial)だけでなく、相手を感電させる
 * こと自体の価値(スコアリセット・感電進行)も仕掛け先の選定に反映される。
 */
function computeSetterBestResponse(chairs, numToSet, chooseCounts, totalChooses, valueFn = (c) => c, trapCostFn = () => 0) {
  const q = {};
  chairs.forEach(c => {
    q[c] = chooseCounts[c] / totalChooses;
  });

  const sortedChairs = [...chairs].sort((a, b) => {
    return (q[b] * (valueFn(b) + trapCostFn(b))) - (q[a] * (valueFn(a) + trapCostFn(a)));
  });

  return sortedChairs.slice(0, numToSet);
}

/**
 * 選択者の最適反応を計算
 * 設置者の経験分布 p_i に対して、(1 - p_i) * v_i - p_i * 感電コスト_i が最大の椅子を選ぶ
 */
function computeChooserBestResponse(chairs, setCounts, totalSets, valueFn = (c) => c, trapCostFn = () => 0) {
  const p = {};
  chairs.forEach(c => {
    p[c] = setCounts[c] / totalSets;
  });

  let bestChair = chairs[0];
  let bestValue = (1 - p[bestChair]) * valueFn(bestChair) - p[bestChair] * trapCostFn(bestChair);

  chairs.forEach(c => {
    const expectedValue = (1 - p[c]) * valueFn(c) - p[c] * trapCostFn(c);
    if (expectedValue > bestValue) {
      bestValue = expectedValue;
      bestChair = c;
    }
  });

  return bestChair;
}

/**
 * 混合戦略の収束判定
 */
function hasConverged(oldProb, newProb, threshold = 0.001) {
  for (const c of Object.keys(newProb)) {
    const diff = Math.abs((newProb[c] || 0) - (oldProb[c] || 0));
    if (diff > threshold) {
      return false;
    }
  }
  return true;
}

// 感電した場合に失う価値(状態非依存のヒューリスティック)。
// あと1回の感電で敗北する場合は、期待得点を犠牲にしてでも安全な選択を
// 優先させるため、通常のスコア価値を大きく上回るペナルティを返す。
function computeShockCost(score, shocks) {
  if (shocks >= GAME_RULES.MAX_SHOCKS - 1) {
    return SHOCK_ELIMINATION_PENALTY;
  }
  return score * SHOCK_SCORE_COST_FACTOR + shocks * SHOCK_COUNT_COST_PER_SHOCK;
}

/**
 * 椅子chosenChairが、その時点の選択肢availableChairs内でどの程度「高い方」
 * だったかを0(最低)〜1(最高)の相対順位として返す。
 * 残り椅子は対局が進むごとに変化する(＝椅子の絶対番号だけでは終盤と序盤の
 * 「高い椅子を好む」を同じ尺度で比較できない)ため、観測した過去の行動を
 * 現在の残り椅子へ射影する際の共通の尺度として使う。
 */
function computeRelativeRank(chosenChair, availableChairs) {
  const sorted = [...availableChairs].sort((a, b) => a - b);
  const index = sorted.indexOf(chosenChair);
  if (index < 0 || sorted.length <= 1) return 0.5;
  return index / (sorted.length - 1);
}

/**
 * 0(最低)〜1(最高)の相対順位rankを、現在の残り椅子currentChairsの中で
 * 対応する位置の椅子番号へ射影する。
 */
function projectRankToChair(rank, currentChairs) {
  const sorted = [...currentChairs].sort((a, b) => a - b);
  if (sorted.length <= 1) return sorted[0];
  const index = Math.round(rank * (sorted.length - 1));
  return sorted[Math.min(sorted.length - 1, Math.max(0, index))];
}

/**
 * 観測した相手の過去の行動履歴(actions)を、現在の残り椅子currentChairsへ
 * 射影した「相手がその椅子をどれだけ好む傾向にあるか」を表すカウント
 * (椅子番号→カウント、多いほど相手に好まれている)へ変換する。
 * 用途は候補椅子どうしの相対的な優先順位付けのみであり、他の値(期待値等)と
 * 直接比較・加算するものではないため、絶対的なスケールに意味は無い
 * (issue #167)。
 *
 * @param {{ chosenChair: number, availableChairs: number[] }[]} actions
 * @param {number[]} currentChairs
 * @returns {Object} 椅子番号→カウント
 */
function buildOpponentPreferenceCounts(actions, currentChairs) {
  const counts = {};
  currentChairs.forEach(c => { counts[c] = 0; });
  actions.forEach(({ chosenChair, availableChairs }) => {
    const rank = computeRelativeRank(chosenChair, availableChairs);
    const projectedChair = projectRankToChair(rank, currentChairs);
    counts[projectedChair] = (counts[projectedChair] || 0) + 1;
  });
  return counts;
}

/**
 * 現在の局面(このターンの選択者(chooser)視点)における、各椅子の
 * 「安全に着地した場合」と「感電した場合」の継続価値を、
 * solveEndgameValueへの再帰呼び出しにより計算する。
 * 戻り値はいずれも「このターンのchooser」から見た価値
 * (chooserがselfでない場合はゼロサムとして符号を反転させたもの)。
 *
 * このゲームは1ターンにつき椅子は1脚だけ選ばれて場から除かれ、
 * 選ばれなかった罠は次ターンに持ち越されない(設置者は毎ターン新たに
 * 罠を選び直す)ため、椅子cの安全時継続価値はどの椅子が罠だったかに
 * 依存しない。
 */
function computeChairContinuationValues(remainingChairs, chooserScore, chooserShocks, setterScore, setterShocks, chooserIsSelf, memo) {
  const safeValues = {};
  const shockedValues = {};

  remainingChairs.forEach(c => {
    const nextRemaining = remainingChairs.filter(x => x !== c);

    // 安全に着地: chooserの得点がc増え、役割は次ターンで反転する
    // (今回のchooserが次回はsetterになる)
    const safeSelfValue = solveEndgameValue(
      nextRemaining, setterScore, setterShocks, chooserScore + c, chooserShocks, !chooserIsSelf, memo
    );
    // 感電: chooserの得点は0にリセットされ感電数が1増える
    const shockedSelfValue = solveEndgameValue(
      nextRemaining, setterScore, setterShocks, 0, chooserShocks + 1, !chooserIsSelf, memo
    );

    // solveEndgameValueは常に「self」視点の値を返すため、このターンの
    // chooserがselfでない場合はゼロサムとして符号を反転する
    safeValues[c] = chooserIsSelf ? safeSelfValue : -safeSelfValue;
    shockedValues[c] = chooserIsSelf ? shockedSelfValue : -shockedSelfValue;
  });

  return { safeValues, shockedValues };
}

/**
 * 終盤(残り椅子がENDGAME_LOOKAHEAD_MAX_CHAIRS以下)の状態価値を、
 * 各局面でのfictitiousPlayによる均衡解を再帰的に積み上げることで厳密に近似する。
 *
 * @param {number[]} remainingChairs
 * @param {number} chooserScore - このターンの選択側(座る側)の現在スコア
 * @param {number} chooserShocks - このターンの選択側の感電回数
 * @param {number} setterScore - このターンの設置側(仕掛ける側)の現在スコア
 * @param {number} setterShocks - このターンの設置側の感電回数
 * @param {boolean} chooserIsSelf - このターンの選択側がself(手番を計算しているAI自身)かどうか
 * @param {Map<string, number>} memo - 状態のメモ化キャッシュ(この関数の外側で1回のgetNashMove呼び出しごとに新規作成する)
 * @returns {number} self視点の期待値(勝利=ENDGAME_WIN_VALUE相当、敗北=-ENDGAME_WIN_VALUE相当、
 *   それ以外はスコア差ベースのスカラー値)
 */
function solveEndgameValue(remainingChairs, chooserScore, chooserShocks, setterScore, setterShocks, chooserIsSelf, memo) {
  const selfScore = chooserIsSelf ? chooserScore : setterScore;
  const opponentScore = chooserIsSelf ? setterScore : chooserScore;
  const selfShocks = chooserIsSelf ? chooserShocks : setterShocks;
  const opponentShocks = chooserIsSelf ? setterShocks : chooserShocks;

  // 終了判定
  if (selfScore >= GAME_RULES.WINNING_SCORE) return ENDGAME_WIN_VALUE;
  if (opponentScore >= GAME_RULES.WINNING_SCORE) return -ENDGAME_WIN_VALUE;
  if (selfShocks >= GAME_RULES.MAX_SHOCKS) return -ENDGAME_WIN_VALUE;
  if (opponentShocks >= GAME_RULES.MAX_SHOCKS) return ENDGAME_WIN_VALUE;
  if (remainingChairs.length <= GAME_RULES.MIN_CHAIRS_TO_END) {
    // 椅子が尽きた場合、スコアで勝敗を判定(同点なら感電数が少ない方が有利、完全同点はdraw)
    if (selfScore !== opponentScore) return selfScore > opponentScore ? ENDGAME_WIN_VALUE : -ENDGAME_WIN_VALUE;
    if (selfShocks !== opponentShocks) return selfShocks < opponentShocks ? ENDGAME_WIN_VALUE : -ENDGAME_WIN_VALUE;
    return 0;
  }

  const key = `${[...remainingChairs].sort((a, b) => a - b).join(',')}|${chooserScore}|${chooserShocks}|${setterScore}|${setterShocks}|${chooserIsSelf}`;
  const cached = memo.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const { safeValues, shockedValues } = computeChairContinuationValues(
    remainingChairs, chooserScore, chooserShocks, setterScore, setterShocks, chooserIsSelf, memo
  );
  // このゲームは1ターンに仕掛けられる電流が常に1脚(getNumToSet参照)であるため、
  // 先読みも単一トラップを前提とする
  const numToSet = getNumToSet(remainingChairs.length);
  const valueFn = (c) => safeValues[c];
  const trapCostFn = (c) => safeValues[c] - shockedValues[c];

  const { gameValue } = fictitiousPlay(remainingChairs, numToSet, ENDGAME_ITERATIONS, valueFn, trapCostFn);

  // gameValueは「このターンのchooser」視点の値。selfがchooserでない場合は反転する
  const value = chooserIsSelf ? gameValue : -gameValue;
  memo.set(key, value);
  return value;
}

/**
 * ナッシュ均衡に基づいてAIの行動を決定
 *
 * @param {string} playerId - AIプレイヤーのID
 * @param {string} role - 'set' または 'choose'
 * @param {number[]} remainingChairs - 残っている椅子
 * @param {{ selfScore?: number, opponentScore?: number, selfShocks?: number, opponentShocks?: number,
 *   opponentHistory?: { setterActions?: { chosenChair: number, availableChairs: number[] }[],
 *     chooserActions?: { chosenChair: number, availableChairs: number[] }[] } }} [matchState]
 *   対局状態。省略時(0扱い)は椅子番号そのものを価値とみなした状態非依存のロジックにフォールバックする。
 *   opponentHistoryは相手が過去に設置/選択した椅子の観測履歴(issue #167)。setterActionsは
 *   相手が設置者だったターンで実際に罠を張った椅子(感電で判明したもののみ)、chooserActionsは
 *   相手が選択者だったターンで実際に選んだ椅子。いずれも省略時は均衡プレイにフォールバックする。
 * @returns {{ setChairs?: number[], chosenChair?: number, reasoning: string }}
 */
function getNashMove(playerId, role, remainingChairs, matchState = {}) {
  const { selfScore = 0, opponentScore = 0, selfShocks = 0, opponentShocks = 0, opponentHistory = {} } = matchState;
  const { setterActions = [], chooserActions = [] } = opponentHistory;
  const numToSet = getNumToSet(remainingChairs.length);

  // 設置者視点で見た「相手(選択者)があと1回の感電で敗北するか」。
  // reasoning文言のみに使う(実際の仕掛け先の決定は、いずれの分岐でも
  // 感電コストが価値に統合された単一のvalueFn/trapCostFnによって行われる)。
  const isOpponentOneShockFromLosing = opponentShocks >= GAME_RULES.MAX_SHOCKS - 1;

  // 相手の観測傾向を反映する(issue #167)。自分が設置者(role === 'set')なら
  // 相手は選択者なのでchooserActionsを、自分が選択者なら相手は設置者なので
  // setterActionsを、それぞれ現在の残り椅子へ射影した「相手がその椅子を
  // どれだけ好む傾向にあるか」のカウントに変換する。
  //
  // 却下した設計: 当初はfictitiousPlayのカウンター初期値(擬似観測)として
  // 混ぜ込む方式を検討したが、fictitiousPlayは両者が毎回互いに最適反応する
  // 相互最適反応(mutual best response)であり、1000回の反復のうちに
  // シミュレートされた「相手」側もこちらの偏った初期値に対して合理的に
  // 適応してしまう(むしろ観測傾向と逆方向に動くことを自己対戦ベンチマークで
  // 確認した)。相手の実際の行動は(このシミュレーションと異なり)こちらの
  // 手を見て適応するものではない固定された観測事実であるため、相互最適反応の
  // 均衡計算そのものには混ぜず、後段の「候補椅子からどれを選ぶか」という
  // 優先順位付けにのみ用いる(常に0件時は完全に従来の挙動へフォールバックする)。
  const relevantOpponentActions = role === 'set' ? chooserActions : setterActions;
  const observedOpponentCount = relevantOpponentActions.length;
  const opponentPreference = observedOpponentCount > 0
    ? buildOpponentPreferenceCounts(relevantOpponentActions, remainingChairs)
    : {};
  // 観測数が少ないうちは均衡プレイに近く、観測が蓄積するほど観測傾向を
  // 踏まえた応答(搾取)へ確率的に寄せていく信頼度(0〜1)。1回でも観測が
  // あれば毎回必ず搾取側に倒す(＝完全に決定的になる)と、序盤の少数の
  // 観測(偶然の一致を含む)にも過剰反応してしまうため、観測数に応じて
  // 徐々に効果を強める(自己対戦ベンチマークで較正)。
  const opponentModelConfidence = Math.min(1, observedOpponentCount / OPPONENT_MODEL_CONFIDENCE_SATURATION_COUNT);
  const useOpponentModel = observedOpponentCount > 0 && Math.random() < opponentModelConfidence;

  let valueFn;
  let trapCostFn;
  let usedEndgameLookahead = false;

  if (remainingChairs.length <= ENDGAME_LOOKAHEAD_MAX_CHAIRS) {
    // 終盤: 実際の継続価値を再帰的に厳密計算する
    usedEndgameLookahead = true;
    const chooserIsSelf = role === 'choose';
    const chooserScore = chooserIsSelf ? selfScore : opponentScore;
    const chooserShocks = chooserIsSelf ? selfShocks : opponentShocks;
    const setterScore = chooserIsSelf ? opponentScore : selfScore;
    const setterShocks = chooserIsSelf ? opponentShocks : selfShocks;
    const memo = new Map();

    const { safeValues, shockedValues } = computeChairContinuationValues(
      remainingChairs, chooserScore, chooserShocks, setterScore, setterShocks, chooserIsSelf, memo
    );
    valueFn = (c) => safeValues[c];
    trapCostFn = (c) => safeValues[c] - shockedValues[c];
  } else if (role === 'set') {
    // 中盤以前の設置者: 相手の勝利に必要な残り得点を超える価値は無いものとみなした
    // 実効価値に、相手を感電させる価値(現スコア喪失+感電進行リスク)を加えて仕掛ける
    const effectiveMax = Math.max(0, GAME_RULES.WINNING_SCORE - opponentScore);
    const shockCost = computeShockCost(opponentScore, opponentShocks);
    valueFn = (c) => Math.min(c, effectiveMax);
    trapCostFn = () => shockCost;
  } else {
    // 中盤以前の選択者: 自分の勝利に必要な残り得点を超える価値は無いものとみなした
    // 実効価値をもとに、感電した場合に自分が失う価値(現スコア喪失+感電進行リスク)を
    // 差し引いた期待得点で椅子を選ぶ
    const effectiveMax = Math.max(0, GAME_RULES.WINNING_SCORE - selfScore);
    const shockCost = computeShockCost(selfScore, selfShocks);
    valueFn = (c) => Math.min(c, effectiveMax);
    trapCostFn = () => shockCost;
  }

  if (role === 'set') {
    const { setProb, gameValue } = fictitiousPlay(remainingChairs, numToSet, 1000, valueFn, trapCostFn);
    const chairs = remainingChairs;
    const expectedValues = chairs.map(c => (1 - setProb[c]) * valueFn(c) - setProb[c] * trapCostFn(c));

    // ゲームの値より高い椅子を特定
    const highValueChairs = chairs.filter((c, i) => expectedValues[i] > gameValue);
    const lowValueChairs = chairs.filter((c, i) => expectedValues[i] <= gameValue);

    // 均衡プレイ上は同格の候補(highValueChairs/lowValueChairsそれぞれの内部)から
    // 実際にどれを選ぶかは、観測傾向を採用する回(useOpponentModel)であれば
    // それを優先する(相手が好んで座る傾向にある椅子ほど有効な仕掛け先になる
    // ため)。それ以外は従来通りランダムに並べる。いずれの場合も、末尾から
    // popして選ぶため昇順(最も好まれる椅子が末尾)にソートする。
    // 事前にランダムシャッフルしてから安定ソートすることで、opponentPreferenceが
    // 同点(観測に偏りが無い場合など)の椅子どうしの順序もランダムになるようにする
    // (先にソートだけ行うと、V8のsortは安定ソートのため同点の要素は元の配列の
    // 並び順(常にchairsの昇順)のまま残ってしまい、偏りが無いはずの観測でも
    // 常に最大/最小の椅子番号が選ばれてしまう不具合があった)。
    const setChairs = [];
    const sortByOpponentPreference = (a, b) => (opponentPreference[a] || 0) - (opponentPreference[b] || 0);
    const shuffledHigh = useOpponentModel
      ? [...highValueChairs].sort(() => 0.5 - Math.random()).sort(sortByOpponentPreference)
      : [...highValueChairs].sort(() => 0.5 - Math.random());
    const shuffledLow = useOpponentModel
      ? [...lowValueChairs].sort(() => 0.5 - Math.random()).sort(sortByOpponentPreference)
      : [...lowValueChairs].sort(() => 0.5 - Math.random());

    while (setChairs.length < numToSet) {
      if (shuffledHigh.length > 0) {
        setChairs.push(shuffledHigh.pop());
      } else {
        setChairs.push(shuffledLow.pop());
      }
    }

    const reasoning = isOpponentOneShockFromLosing
      ? `相手はあと1回の感電で敗北します。得点効率よりも仕留めることを優先し、` +
        `選ばれやすい椅子 (${setChairs.join(',')}) に電流を仕掛けます。`
      : useOpponentModel
        ? `対戦相手の行動傾向(観測${observedOpponentCount}件)を考慮し、` +
          `選ばれやすい椅子 (${setChairs.join(',')}) に電流を仕掛けます。`
        : usedEndgameLookahead
          ? `ナッシュ均衡分析（終盤の先読み）により、最も期待値の高い椅子 (${setChairs.join(',')}) に電流を仕掛けます。`
          : `ナッシュ均衡分析により、ゲームの値 ${gameValue.toFixed(2)} を考慮して` +
            `期待得点の高い椅子 (${setChairs.join(',')}) に電流を仕掛けます。`;

    return { setChairs, reasoning };
  } else {
    const { setProb, chooseProb, gameValue } = fictitiousPlay(remainingChairs, numToSet, 1000, valueFn, trapCostFn);
    const chairs = remainingChairs;
    const expectedValues = chairs.map(c => (1 - setProb[c]) * valueFn(c) - setProb[c] * trapCostFn(c));

    // ゲームの値以上の椅子のみに絞り込む
    const goodChairs = chairs.filter((c, i) => expectedValues[i] >= gameValue);

    let chosenChair;
    let reasoning;

    if (goodChairs.length === 0) {
      // 全ての椅子がゲームの値以下 → 最も期待値の高い椅子を選ぶ
      chosenChair = chairs.reduce((best, c, i) =>
        expectedValues[i] > expectedValues[chairs.indexOf(best)] ? c : best
      , chairs[0]);

      reasoning =
        `ナッシュ均衡分析により、全ての椅子がゲームの値 ${gameValue.toFixed(2)} 以下でした。` +
        `最も期待値の高い椅子 ${chosenChair} を選択します。`;
    } else if (useOpponentModel) {
      // 観測傾向を採用する回であれば、goodChairsの中で最も相手(設置者)に
      // 好まれていない(＝罠を張られている可能性が低い)椅子を選ぶ(issue #167)。
      // 事前にランダムシャッフルしてから比較することで、opponentPreferenceが
      // 同点(観測に偏りが無い場合など)の椅子どうしの選択もランダムになるように
      // する(shuffledHigh/shuffledLowと同様の理由。reduceは最初に見つかった
      // 最小値を保持し続けるため、シャッフルしないと常にgoodChairsの先頭
      // (常にchairsの昇順の先頭)が選ばれてしまう)。
      const shuffledGoodChairs = [...goodChairs].sort(() => 0.5 - Math.random());
      chosenChair = shuffledGoodChairs.reduce((safest, c) =>
        (opponentPreference[c] || 0) < (opponentPreference[safest] || 0) ? c : safest
      , shuffledGoodChairs[0]);

      reasoning = `対戦相手の行動傾向(観測${observedOpponentCount}件)を考慮し、椅子 ${chosenChair} を選択しました。`;
    } else {
      // goodChairsから確率分布 chooseProb に従って選択
      const totalProb = goodChairs.reduce((sum, c) => sum + chooseProb[c], 0);
      let rand = Math.random() * totalProb;

      for (const c of goodChairs) {
        rand -= chooseProb[c];
        if (rand <= 0) {
          chosenChair = c;
          break;
        }
      }
      /* v8 ignore start */
      if (!chosenChair) {
        // rand(<totalProb)からgoodChairs全件のchooseProbを引き切れば必ず0以下になるため、
        // ここには理論上到達しない。Math.random()の実際の出力範囲(検証済み)では
        // 浮動小数点誤差によっても到達しなかったが、想定外の入力に備えた安全策として残す。
        chosenChair = goodChairs[goodChairs.length - 1];
      }
      /* v8 ignore stop */

      reasoning = usedEndgameLookahead
        ? `ナッシュ均衡分析（終盤の先読み）により、期待値の高い椅子から ${chosenChair} を選択しました。`
        : `ナッシュ均衡分析により、ゲームの値 ${gameValue.toFixed(2)} を考慮して` +
          `期待得点がゲームの値以上の椅子から ${chosenChair} を選択しました。`;
    }

    return { chosenChair, reasoning };
  }
}

module.exports = {
  fictitiousPlay,
  computeSetterBestResponse,
  computeChooserBestResponse,
  hasConverged,
  computeShockCost,
  computeRelativeRank,
  projectRankToChair,
  buildOpponentPreferenceCounts,
  solveEndgameValue,
  getNashMove,
};
