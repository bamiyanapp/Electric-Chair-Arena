'use strict';

const GAME_RULES = Object.freeze({
  TOTAL_CHAIRS: 12, // 1〜12まで時計の形に並んでいる
  WINNING_SCORE: 40, // 40点先取
  MAX_SHOCKS: 3, // 3回電気を喰らうと負け
  MIN_CHAIRS_TO_END: 1, // 最後に椅子が1つになったらゲーム終了
});

module.exports = {
  GAME_RULES,
};
