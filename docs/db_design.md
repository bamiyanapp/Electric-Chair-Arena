# データベース設計 (DynamoDB / SQLite)

## 1. テーブル設計

### 1.1 Players (AI Models) テーブル
対戦相手となるAIモデルの定義、基本戦績、および学習用パラメーターを管理する。

- **PK**: `playerId` (String) - AIモデルの一識別子
- **Attributes**:
  - `name` (String): AIモデル名 (例: "カウンティングAI")
  - `type` (String): モデルのタイプ (`random`, `cautious`, `aggressive`, `smart`, `learning`)
  - `description` (String): AIの特徴や戦術の説明
  - `rating` (Number): 現在のELOレーティング (初期値1500、学習と戦績に応じて変動)
  - `winCount` (Number): 人間プレイヤーに対する勝利数
  - `lossCount` (Number): 人間プレイヤーに対する敗北数
  - `weights` (Map / List): 学習用パラメーター
    - 各椅子(1〜12)の設置確率の重み付け
    - 各椅子(1〜12)の選択確率の重み付け
  - `updatedAt` (String): ISO8601形式の更新日時

### 1.2 Matches テーブル
人間とAIモデルの各対戦結果および詳細な行動・学習ログを保持する。

- **PK**: `matchId` (String) - 対戦の一識別子 (UUID)
- **Attributes**:
  - `player1Id` (String): プレイヤー1のID（人間、もしくは先攻プレイヤー。例: "human"）
  - `player2Id` (String): プレイヤー2のID（対戦相手AIの `playerId`）
  - `scores` (Map): 最終得点
    - `p1` (Number): プレイヤー1の得点
    - `p2` (Number): プレイヤー2の得点
  - `shocks` (Map): 最終感電回数
    - `p1` (Number): プレイヤー1の感電回数
    - `p2` (Number): プレイヤー2の感電回数
  - `winner` (String): 勝利プレイヤーの名前、またはID
  - `ratingDiff` (Number): この試合で変動したAIモデルのレーティング差分
  - `logs` (List of Map): ターンごとの詳細履歴（AIの学習元データ）
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
1. **AIモデル一覧の取得**: `Scan` (またはレーティング順インデックスによる `Query`)
2. **特定のAIモデル詳細/重みの取得**: `GetItem` from `Players` where `playerId` = ?
3. **対戦結果の保存**: `PutItem` into `Matches`
4. **AIモデルの学習・レーティング更新**: `UpdateItem` in `Players` (レーティング、勝敗数、`weights` の変更)
