'use strict';

const GAME_RULES = Object.freeze({
  TOTAL_CHAIRS: 12, // 1〜12まで時計の形に並んでいる
  WINNING_SCORE: 40, // 40点先取
  MAX_SHOCKS: 3, // 3回電気を喰らうと負け
  MIN_CHAIRS_TO_END: 1, // 最後に椅子が1つになったらゲーム終了
  MAX_CHAIRS_TO_SET: 1, // 親が1ターンに仕掛けられる電流の最大数
  MIN_CHAIRS_TO_SET: 1, // 親が1ターンに仕掛ける電流の最小数
});

// 親が1ターンに仕掛ける電流の数。人間/PVPの親は常に1脚しか設置できないため、
// AI側もMIN/MAX_CHAIRS_TO_SETを常に1に揃え、両者で対称なルールにしている。
function getNumToSet(remainingChairsCount) {
  return Math.min(
    GAME_RULES.MAX_CHAIRS_TO_SET,
    Math.max(GAME_RULES.MIN_CHAIRS_TO_SET, Math.floor(remainingChairsCount / 3))
  );
}

module.exports = {
  GAME_RULES,
  getNumToSet,
};
