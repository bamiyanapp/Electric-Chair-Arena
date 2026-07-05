'use strict';

// AIプレイヤーの初期データ
const initialPlayers = [
  {
    playerId: 'ai-okano',
    name: '岡野陽一風AI',
    type: 'personality',
    rating: 1550,
    winCount: 42,
    matchCount: 80,
    updatedAt: new Date().toISOString(),
  },
  {
    playerId: 'ai-koyabu',
    name: '小籔千豊風AI',
    type: 'personality',
    rating: 1600,
    winCount: 55,
    matchCount: 90,
    updatedAt: new Date().toISOString(),
  },
  {
    playerId: 'ai-junior',
    name: '千原ジュニア風AI',
    type: 'personality',
    rating: 1620,
    winCount: 61,
    matchCount: 100,
    updatedAt: new Date().toISOString(),
  },
  {
    playerId: 'ai-random',
    name: 'ランダムAI',
    type: 'random',
    rating: 1400,
    winCount: 20,
    matchCount: 70,
    updatedAt: new Date().toISOString(),
  },
  {
    playerId: 'ai-rule-based',
    name: '期待値計算AI',
    type: 'rule_based',
    rating: 1520,
    winCount: 35,
    matchCount: 75,
    updatedAt: new Date().toISOString(),
  },
  {
    playerId: 'ai-nash',
    name: 'ナッシュ均衡AI',
    type: 'nash',
    rating: 1650,
    winCount: 70,
    matchCount: 95,
    updatedAt: new Date().toISOString(),
  },
];

// 過去の試合履歴の初期データ
const initialMatches = [
  {
    matchId: 'match-1718970000000',
    player1Id: 'ai-okano',
    player2Id: 'ai-junior',
    winnerId: 'ai-junior',
    ratingDiff: 16,
    scores: { p1: 15, p2: 40 },
    shocks: { p1: 1, p2: 0 },
    logs: [
      {
        turn: 1,
        setter: '岡野陽一風AI',
        chooser: '千原ジュニア風AI',
        shockedChairs: [10, 11, 12],
        chosenChair: 6,
        isShocked: false,
        scoreGained: 6,
        scores: { p1: 0, p2: 6 },
        shocks: { p1: 0, p2: 0 },
        remainingChairs: [1,2,3,4,5,7,8,9,10,11,12],
        reasoning: '「ここは勝負どころ。あいつは絶対高得点（10〜12）を欲しがって座りにくるはず。そこに罠を張るのが勝負師ってものよ！」\n「相手は俺が高得点を狙うと思ってるやろうし、安全に低いとこ座るのも見透かされてる。ここはあえてド真ん中、一番心理的に狙いにくい位置がド本命や。」'
      },
      {
        turn: 2,
        setter: '千原ジュニア風AI',
        chooser: '岡野陽一風AI',
        shockedChairs: [1, 5, 8],
        chosenChair: 12,
        isShocked: false,
        scoreGained: 12,
        scores: { p1: 12, p2: 6 },
        shocks: { p1: 0, p2: 0 },
        remainingChairs: [1,2,3,4,5,7,8,9,10,11],
        reasoning: '「ええか、相手はさっき俺が低い数字を狙ったのを見てるわけやん？やから今度は絶対に高い数字に逃げよる。ここを読めるかどうかがこのゲームのすべてやな。」\n「ここで小さい数字座ってチマチマ点稼いでも男がすたりますわ！12点座って一気に40点に近づいたる！」'
      },
      {
        turn: 3,
        setter: '岡野陽一風AI',
        chooser: '千原ジュニア風AI',
        shockedChairs: [9, 10, 11],
        chosenChair: 7,
        isShocked: false,
        scoreGained: 7,
        scores: { p1: 12, p2: 13 },
        shocks: { p1: 0, p2: 0 },
        remainingChairs: [1,2,3,4,5,8,9,10,11],
        reasoning: '「ギャンブラーの直感。ランダムに見えて一番えぐい位置に仕掛けてやったわ。」\n「あえてド真ん中、一番心理的に狙いにくい位置がド本命や。」'
      },
      {
        turn: 4,
        setter: '千原ジュニア風AI',
        chooser: '岡野陽一風AI',
        shockedChairs: [11],
        chosenChair: 11,
        isShocked: true,
        scoreGained: 0,
        scores: { p1: 0, p2: 13 },
        shocks: { p1: 1, p2: 0 },
        remainingChairs: [1,2,3,4,5,8,9,10],
        reasoning: '「ええか、相手は絶対に高い数字に逃げよる。ここを読めるかどうかがこのゲームのすべてやな。」\n「俺の右手が座れと叫んでる！」'
      },
      {
        turn: 5,
        setter: '岡野陽一風AI',
        chooser: '千原ジュニア風AI',
        shockedChairs: [8, 9, 10],
        chosenChair: 10,
        isShocked: true,
        scoreGained: 0,
        scores: { p1: 0, p2: 0 },
        shocks: { p1: 1, p2: 1 },
        remainingChairs: [1,2,3,4,5,8,9],
        reasoning: '「ここは勝負どころ。あいつは絶対高得点（10〜12）を欲しがって座りにくるはず。そこに罠を張るのが勝負師ってものよ！」\n「あえてド真ん中、一番心理的に狙いにくい位置がド本命や。」'
      },
      {
        turn: 6,
        setter: '千原ジュニア風AI',
        chooser: '岡野陽一風AI',
        shockedChairs: [1, 2, 3],
        chosenChair: 9,
        isShocked: false,
        scoreGained: 9,
        scores: { p1: 9, p2: 0 },
        shocks: { p1: 1, p2: 1 },
        remainingChairs: [1,2,3,4,5,8],
        reasoning: '「相手は俺が高得点を狙うと思ってるやろうし、安全に低いとこ座るのも見透かされてる。ここを読めるかどうかがこのゲームのすべてやな。」\n「デカい当たり（高得点）に全ツッパ！」'
      },
      {
        turn: 7,
        setter: '岡野陽一風AI',
        chooser: '千原ジュニア風AI',
        shockedChairs: [1, 2],
        chosenChair: 8,
        isShocked: false,
        scoreGained: 8,
        scores: { p1: 9, p2: 8 },
        shocks: { p1: 1, p2: 1 },
        remainingChairs: [1,2,3,4,5],
        reasoning: '「ギャンブラーの直感。ランダムに見えて一番えぐい位置に仕掛けてやったわ。」\n「一番心理的に狙いにくい位置がド本命や。」'
      },
      {
        turn: 8,
        setter: '千原ジュニア風AI',
        chooser: '岡野陽一風AI',
        shockedChairs: [4, 5],
        chosenChair: 5,
        isShocked: true,
        scoreGained: 0,
        scores: { p1: 0, p2: 8 },
        shocks: { p1: 2, p2: 1 },
        remainingChairs: [1,2,3,4],
        reasoning: '「ええか、ここを読めるかどうかがこのゲームのすべてやな。」\n「俺の右手が座れと叫んでる！」'
      },
      {
        turn: 9,
        setter: '岡野陽一風AI',
        chooser: '千原ジュニア風AI',
        shockedChairs: [1],
        chosenChair: 4,
        isShocked: false,
        scoreGained: 4,
        scores: { p1: 0, p2: 12 },
        shocks: { p1: 2, p2: 1 },
        remainingChairs: [1,2,3],
        reasoning: '「ギャンブラーの直感。ランダムに見えて一番えぐい位置に仕掛けてやったわ。」\n「一番心理的に狙いにくい位置がド本命や。」'
      },
      {
        turn: 10,
        setter: '千原ジュニア風AI',
        chooser: '岡野陽一風AI',
        shockedChairs: [3],
        chosenChair: 3,
        isShocked: true,
        scoreGained: 0,
        scores: { p1: 0, p2: 12 },
        shocks: { p1: 3, p2: 1 },
        remainingChairs: [1,2],
        reasoning: '「ええか、ここを読めるかどうかがこのゲームのすべてやな。」\n「俺の右手が座れと叫んでる！」'
      }
    ],
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  }
];

module.exports.initialPlayers = initialPlayers;
module.exports.initialMatches = initialMatches;
