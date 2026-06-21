# 画面遷移とURL情報（ブックマーカブル対応）

本プロジェクトでは、ユーザーが特定の画面や状態に直接アクセス（ブックマーク）できるよう、画面遷移とURLを以下のように対応付けます。

## 画面一覧とURLマッピング

現在SPA的に状態管理されている各ビューを、URLのクエリパラメーター（またはパス）を用いて表現します。
変更を最小限に抑え既存の実装を生かすため、主に `?view=` クエリパラメーターを使用する方針とします。

| 画面名 (View) | 状態名 (`currentView`) | URL表現例 | 説明 |
| --- | --- | --- | --- |
| **ロビー画面** | `LOBBY` | `/` または `/?view=lobby` | アプリのトップ画面。各モードへの入り口およびAI一覧を表示。 |
| **シミュレーター画面** | `SIMULATOR` | `/?view=simulator` | AI同士の対戦をシミュレーションする画面。 |
| **人間対AI画面** | `GAME` | `/?view=game` | プレイヤー（人間）がAIと対戦する画面。 |
| **リーダーボード画面** | `LEADERBOARD` | `/?view=leaderboard` | AIのレーティングや勝率のランキングを表示する画面。 |
| **対戦結果画面** | `RESULT` | `/?view=result` | シミュレーターの対戦結果などを表示する画面。必要に応じて `&matchId=xxx` などを付与する拡張も可能。 |

## 実装方針 (Next.js App Router)

- `frontend/src/app/page.tsx` において、`next/navigation` の `useSearchParams`, `useRouter`, `usePathname` を利用してURLのクエリパラメーターを読み取り・更新します。
- `currentView` の初期状態をURLから決定し、ユーザーが画面を切り替えた際には `router.push` または `window.history.pushState` を用いてURLを更新します。
- これにより、ユーザーは特定の画面（例: リーダーボード）のURLをブックマークし、後から直接開くことが可能になります。
