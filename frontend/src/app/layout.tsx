import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ハンコマスター検定",
  description: "日本の伝統的なマナー、ハンコ捺印の極意を学ぶ。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
