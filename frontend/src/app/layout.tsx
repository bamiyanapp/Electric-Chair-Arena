import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Electric Chair Arena",
  description: "AIプレイヤー対戦シミュレーター",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
