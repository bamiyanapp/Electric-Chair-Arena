# データベース設計 (DynamoDB)

## 1. テーブル設計

### 1.1 Users テーブル
ユーザーのゲーム進捗を管理する。

- **PK**: `userId` (String) - ユーザー識別子
- **Attributes**:
  - `currentStage` (Number): 現在挑戦中のステージID
  - `totalScore` (Number): 累計スコア（誠意スコアなど）
  - `updatedAt` (String): ISO8601形式の更新日時

### 1.2 Stages テーブル
各ステージの定義とマナー（ルール）を管理する。

- **PK**: `stageId` (Number) - ステージ番号
- **Attributes**:
  - `title` (String): ステージ名 (例: "課長承認")
  - `approver` (String): 承認者名
  - `rules` (Map): 判定基準 (角度、位置、濃さなどの許容範囲)
  - `messages` (List): 差し戻し時のランダムメッセージ集

### 1.3 Scores テーブル (将来)
ハイスコアランキング用のデータ。

- **PK**: `userId` (String)
- **SK**: `stageId` (Number)
- **Attributes**:
  - `clearTime` (Number): クリアまでにかかった時間（秒）
  - `hankoState` (Map): クリア時の捺印データ（座標、回転）

## 2. アクセスパターン
1. **ユーザー進捗取得**: `GetItem` from `Users` where `userId` = ?
2. **ステージ情報取得**: `GetItem` from `Stages` where `stageId` = ?
3. **進捗更新**: `UpdateItem` in `Users` (increment `currentStage`)
