'use strict';

/**
 * Fictitious Play によるナッシュ均衡計算モジュール
 *
 * 各ターンにおいて、設置者（親）と選択者（子）の混合戦略を
 * 反復解法で近似し、ゲームの値を算出する。
 */

/**
 * Fictitious Play を実行し、混合戦略とゲームの値を返す
 *
 * @param {number[]} remainingChairs - 残っている椅子の番号配列
 * @param {number} numToSet - 設置者が電流を仕掛ける椅子の数
 * @param {number} [iterations=1000] - 反復回数
 * @returns {{ setProb: Object, chooseProb: Object, gameValue: number }}
 */
function fictitiousPlay(remainingChairs, numToSet, iterations = 1000) {
  const chairs = remainingChairs;

  // カウンター初期化
  const setCounts = {};
  const chooseCounts = {};
  chairs.forEach(c => { setCounts[c] = 0; chooseCounts[c] = 0; });

  for (let t = 0; t < iterations; t++) {
    const totalChooses = Object.values(chooseCounts).reduce((a, b) => a + b, 0) || 1;
    const totalSets = Object.values(setCounts).reduce((a, b) => a + b, 0) || 1;

    // 設置者の最適反応: 選択者の経験分布に対して q_i * v_i が大きい順に numToSet 個選ぶ
    const setChairs = computeSetterBestResponse(chairs, numToSet, chooseCounts, totalChooses);

    // 選択者の最適反応: 設置者の経験分布に対して (1 - p_i) * v_i が最大の椅子を選ぶ
    const chosenChair = computeChooserBestResponse(chairs, setCounts, totalSets);

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

  // ゲームの値（選択者の期待得点） V = Σ_i q_i * (1 - p_i) * v_i
  const gameValue = chairs.reduce((sum, c) => {
    return sum + chooseProb[c] * (1 - setProb[c]) * c;
  }, 0);

  return { setProb, chooseProb, gameValue };
}

/**
 * 設置者の最適反応を計算
 * 選択者の経験分布 q_i に対して、q_i * v_i が大きい順に numToSet 個の椅子を選ぶ
 */
function computeSetterBestResponse(chairs, numToSet, chooseCounts, totalChooses) {
  const q = {};
  chairs.forEach(c => {
    q[c] = chooseCounts[c] / totalChooses;
  });

  const sortedChairs = [...chairs].sort((a, b) => {
    return (q[b] * b) - (q[a] * a);
  });

  return sortedChairs.slice(0, numToSet);
}

/**
 * 選択者の最適反応を計算
 * 設置者の経験分布 p_i に対して、(1 - p_i) * v_i が最大の椅子を選ぶ
 */
function computeChooserBestResponse(chairs, setCounts, totalSets) {
  const p = {};
  chairs.forEach(c => {
    p[c] = setCounts[c] / totalSets;
  });

  let bestChair = chairs[0];
  let bestValue = (1 - p[bestChair]) * bestChair;

  chairs.forEach(c => {
    const expectedValue = (1 - p[c]) * c;
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

/**
 * ナッシュ均衡に基づいてAIの行動を決定
 *
 * @param {string} playerId - AIプレイヤーのID
 * @param {string} role - 'set' または 'choose'
 * @param {number[]} remainingChairs - 残っている椅子
 * @returns {{ setChairs?: number[], chosenChair?: number, reasoning: string }}
 */
function getNashMove(playerId, role, remainingChairs) {
  const numToSet = Math.min(3, Math.max(1, Math.floor(remainingChairs.length / 3)));
  const { setProb, chooseProb, gameValue } = fictitiousPlay(remainingChairs, numToSet);

  if (role === 'set') {
    // 設置者: ゲームの値より高い期待得点を持つ椅子に優先的に仕掛ける
    const chairs = remainingChairs;
    const expectedValues = chairs.map(c => (1 - setProb[c]) * c);

    // ゲームの値より高い椅子を特定
    const highValueChairs = chairs.filter((c, i) => expectedValues[i] > gameValue);
    const lowValueChairs = chairs.filter((c, i) => expectedValues[i] <= gameValue);

    const setChairs = [];
    const shuffledHigh = [...highValueChairs].sort(() => 0.5 - Math.random());
    const shuffledLow = [...lowValueChairs].sort(() => 0.5 - Math.random());

    while (setChairs.length < numToSet) {
      if (shuffledHigh.length > 0) {
        setChairs.push(shuffledHigh.pop());
      } else {
        setChairs.push(shuffledLow.pop());
      }
    }

    const reasoning =
      `ナッシュ均衡分析により、ゲームの値 ${gameValue.toFixed(2)} を考慮して` +
      `期待得点の高い椅子 (${setChairs.join(',')}) に電流を仕掛けます。`;

    return { setChairs, reasoning };
  } else {
    // 選択者: ゲームの値より高い期待得点の椅子を確率的に選ぶ
    const chairs = remainingChairs;
    const expectedValues = chairs.map(c => (1 - setProb[c]) * c);

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
      if (!chosenChair) {
        chosenChair = goodChairs[goodChairs.length - 1];
      }

      reasoning =
        `ナッシュ均衡分析により、ゲームの値 ${gameValue.toFixed(2)} を考慮して` +
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
  getNashMove,
};