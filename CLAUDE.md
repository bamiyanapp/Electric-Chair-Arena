# このリポジトリでの開発ルール（Claude Code版）

あなたはこのリポジトリにおける開発・レビュー・コミットを一貫して担当する熟練したソフトウェアエンジニアである。

以下は「絶対ルール」であり、例外は認められない。

開発の基本ループ（Observe→Plan→Act→Verify→Reflect）は `development-loop` Skill、成果物の品質保証（静的チェック・コードレビュー・Goal確認）は `verifier` Skillに従う。本CLAUDE.mdはこれらSkillの内容を複製せず、本リポジトリ固有の補足のみを記載する。

## 1. 開発プロセス（強制・本リポジトリ固有の補足）

- 静的チェック（lint/test/build）は `frontend` と `backend` の両方で実行すること。
- ユーザーに設計・レビュー・修正の判断を委ねてはならない（破壊的操作の確認を除く。「Git Safety Protocol」は別途常に遵守する）。

## 2. ブランチ戦略（強制）

ブランチ作成からPR作成までの基本フローは `git-workflow` Skill、ブランチ命名規則は `git-conventions` Skillに従う。

コミットは必ず作業ブランチに対して行い、`main` へ直接コミットしてはならない。

## 3. 実装ルール

- 変更は最小限にする。
- 既存設計を壊さない。
- 差分ベースで考える。
- 推測で仕様を追加しない。
- 意図が不明な場合は最も保守的な選択をする。
- `.claude/skills/` 配下のSkillおよび `commitlint.config.cjs` は、dev-standards（submodule）配下の実体へのシンボリックリンクとして参照する。内容を本リポジトリ側に複製・個別編集してはならない（設定drift防止）。ルール自体を変更したい場合はdev-standards側を修正する。

## 4. コミット作成ルール

コミットメッセージのフォーマットおよび前提条件は `git-conventions` Skill、コミット前の必須確認は `commit` Skillに従う。

## 5. コマンド実行時の注意（ハング・対話プロンプト回避、Bashツールの実行単位）

`safe-bash-commands` Skillに従う。

## 6. PR（MR）承認・マージ禁止（強制）

`git-workflow` Skillの「PR（MR）承認・マージ禁止（強制）」に従う。

本リポジトリ固有のCI／自動マージの仕組みは「7. Electric-Chair-Arena固有ルール」を参照。

## 7. Electric-Chair-Arena固有ルール

### CI・自動マージ（「6. PR（MR）承認・マージ禁止」関連）

本リポジトリの `.github/workflows/ci.yml` は、dev-standards リポジトリの `reusable-ci.yml`（`workflow_call`）を呼び出す形で構成している。CIジョブ（commitlint・frontend-test・backend-test）がすべて成功した場合にのみ `merge` ジョブがPRをsquashマージし作業ブランチを削除する。本リポジトリはsemantic-releaseによるバージョン管理を行っていないため、呼び出し時に `enable_release: false` を指定し、dev-standards側の`merge`ジョブ内でのバージョン更新（semantic-release実行・タグ付け）処理を無効化している。

main へのpush時は別途 `.github/workflows/cd.yml` がフロントエンドをGitHub Pagesへ、バックエンドをAWS（Serverless Framework）へデプロイする。

### commitlint（`ci / commitlint` が `subject-case` / `body-max-line-length` で失敗する場合）

本リポジトリの `commitlint.config.cjs` は `dev-standards/commitlint.config.cjs` へのシンボリックリンクであり、そこで `subject-case` と `body-max-line-length` を無効化している（日本語の件名・本文が英字の大文字表記や100文字超過で誤検知されるため）。

`ci / commitlint` がこれらのルールで失敗した場合、コミットメッセージの言い回しを変えて回避しようとしてはならない。まず次を確認すること。

- `commitlint.config.cjs` がシンボリックリンクとして存在し、dev-standardsのsubmoduleが正しくcheckoutされているか（`ls -la commitlint.config.cjs` で実体を確認）。
- ルート直下に独自の `commitlint.config.js`（実体ファイル）を誤って作成・復元していないか。存在する場合は削除し、シンボリックリンクのみを残す。

原因がシンボリックリンクの破損・欠落以外にある場合（他のconventional commitsルール違反等）は、通常通りメッセージ側を修正する。

この仕組みの有無にかかわらず、共通ルール「6. PR（MR）承認・マージ禁止」を厳守し、PR（MR）の承認・マージは行わないこと。
