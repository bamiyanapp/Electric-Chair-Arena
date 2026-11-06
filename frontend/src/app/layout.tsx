import type { Metadata } from "next";
import "./globals.css";
import ErrorBoundary from "../components/ErrorBoundary";

// NEXT_PUBLIC_API_URLはビルド時にサーバー・クライアント双方へ同じ値が埋め込まれるため、
// サーバーコンポーネント側で読んでも問題ない。page.tsxのgetApiUrl()と異なり、未設定時に
// 警告は出さない（エラー報告はアプリ本体の機能に影響しないベストエフォートのため）
const clientErrorReportUrl = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/report-client-error`
  : undefined;

export const metadata: Metadata = {
  title: "Electric Chair Arena",
  description: "AIプレイヤー対戦シミュレーター",
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon2.png', type: 'image/png' }
    ],
    apple: '/icon2.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        {/* キャッシュ戦略はService Worker(public/sw.js)側に一本化している。
            SWはネットワークを優先し、オフライン時のみキャッシュへフォールバック
            するため、常に最新を取得する意図は既に満たされている。
            なお、http-equiv="Cache-Control"等のmetaタグはモダンブラウザ/CDNでは
            ほぼ無視され実効性が無いため、ここでは付与しない。 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  const basePath = '${process.env.NEXT_PUBLIC_BASE_PATH || ''}';
                  navigator.serviceWorker.register(basePath + '/sw.js').then(function(registration) {
                    console.log('ServiceWorker registration successful with scope: ', registration.scope);
                  }, function(err) {
                    console.log('ServiceWorker registration failed: ', err);
                  });
                });
              }
            `,
          }}
        />
      </head>
      <body className="antialiased">
        <ErrorBoundary reportUrl={clientErrorReportUrl}>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
