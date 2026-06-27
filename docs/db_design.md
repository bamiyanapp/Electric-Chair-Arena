# データベース設計（インメモリ実装 + DynamoDB書き込み）

現状の実装（`backend/handler.js`）は、読み取り（一覧・詳細取得）はLambdaプロセス内のインメモリ配列（`playersDb`, `matchesDb`）を参照する。一方、試合終了時（`startMatch` / `saveMatch`）にはスコアボードを `Matches` DynamoDBテーブル（`backend/serverless.yml` の `MatchesTable` リソース、`backend/dynamoClient.js`）へも書き込む。DynamoDBへの書き込みに失敗した場合もAPIレスポンスは通常通り返す（ベストエフォートの記録であり、書き込み失敗が対戦結果のレスポンスをブロックしない）。以下は現在のデータ構造を記述したものであり、DynamoDBのスキーマとしても利用される。

## 1. データ構造

### 1.1 Players (AI Models)
対戦相手となるAIモデルの定義と基本戦績を管理する。

- **PK**: `playerId` (String) - AIモデルの一識別子 (例: `ai-okano`, `ai-nash`)
- **Attributes**:
  - `name` (String): AIモデル名 (例: "岡野陽一風AI")
  - `type` (String): モデルのタイプ (`personality`, `random`, `rule_based`, `nash`)
  - `rating` (Number): 現在のELOレーティング (初期値1500、対戦結果に応じて変動)
  - `winCount` (Number): 人間プレイヤーに対する勝利数
  - `matchCount` (Number): 対戦数

学習用パラメーター（重みテーブル）は実装されていない。AIの行動選択は `backend/handler.js` 内のヒューリスティック分岐ロジック、または `backend/nash.js` のナッシュ均衡計算によって都度決定され、対戦を重ねてもパラメーターは更新されない。「成長」に相当するのは `rating` のELO更新のみ。

### 1.2 Matches
人間とAIモデル、または人間同士の各対戦結果と詳細なターンログを保持する。

- **PK**: `matchId` (String) - 対戦の一識別子
- **Attributes**:
  - `player1Id` (String): プレイヤー1のID（人間の場合は `"human"`）
  - `player2Id` (String): プレイヤー2のID（対戦相手AIの `playerId`、もしくは人間対人間の場合は `"human"`）
  - `scores` (Map): 最終得点 (`p1`, `p2`)
  - `shocks` (Map): 最終感電回数 (`p1`, `p2`)
  - `winner` (String): 勝利プレイヤーの名前、またはID
  - `ratingDiff` (Number): この試合で変動したAIモデルのレーティング差分
  - `logs` (List of Map): ターンごとの詳細履歴
    - `turn` (Number): ターン数
    - `setter` (String): 電流設置者名
    - `chooser` (String): 椅子選択者名
    - `shockedChairs` (List of Number): 設置された椅子の番号
    - `chosenChair` (Number): 選択された椅子の番号
    - `isShocked` (Boolean): 感電したかどうか
    - `scoreGained` (Number): 獲得したスコア
    - `remainingChairs` (List of Number): そのターン時点の残り椅子のリスト
  - `createdAt` (String): ISO8601形式の対戦日時

## 2. アクセスパターン

1. **AIモデル一覧の取得**: `playersDb` の全件参照（`getPlayers`）
2. **レーティング順ランキングの取得**: `playersDb` をレーティング降順にソート（`getLeaderboard`）
3. **対戦結果の保存**: `matchesDb` への追加（`saveMatch`）、保存時に `winner` 側AIの `rating` / `matchCount` を更新
4. **対戦履歴の取得**: `matchesDb` の全件・単件参照（`getMatches`, `getMatchResult`）

データはLambdaプロセスのメモリ上にのみ存在し、永続化されない（再デプロイやコールドスタートで初期データにリセットされる）。
