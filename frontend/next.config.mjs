/* global process */

const isGithubActions = process.env.GITHUB_ACTIONS === 'true';
const repoName = (isGithubActions && process.env.GITHUB_REPOSITORY) ? process.env.GITHUB_REPOSITORY.split('/')[1] : '';

/** @type {import('next').NextConfig} */
const basePath = isGithubActions ? `/${repoName}` : '';
const nextConfig = {
  // TypeScript 7系はNext.jsが従来型チェックに使っていたコンパイラAPIを
  // 提供しない(tsgoベースのCLIに置き換わっている)ため、useTypeScriptCliを
  // 有効化してNext.js側の型チェックをTypeScript 7のCLI経由で行う。
  // 無効のままだと`next build`が「TypeScript未インストール」という
  // 誤解を招くメッセージで失敗する。
  experimental: { useTypeScriptCli: true },
  output: 'export',
  basePath: basePath,
  assetPrefix: isGithubActions ? `${basePath}/` : '',
  // GitHub Pagesのような静的ホスティングは "/path" へのリクエストに対して
  // "path/index.html" を返す(ディレクトリindex解決)。output: 'export'は
  // これに合わせて各ルートを "path/index.html"(および対応するRSCペイロード
  // "path/index.txt")として書き出すため、trailingSlash: trueにして
  // クライアントルーターが生成する内部URL(searchParamsのみの変更を含む)も
  // 同じ "path/" 形式に統一する必要がある。falseのままだとルート("/")の
  // クエリのみのnavigationで組み立てられるURLがbasePath直下の
  // "basePath.txt" (拡張子付きの兄弟ファイル)を期待してしまい、実際には
  // 存在しない("basePath/index.txt"が実体)ため404になり、Next.jsがRSC
  // ナビゲーションをフルページリロードにフォールバックしてしまっていた。
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
