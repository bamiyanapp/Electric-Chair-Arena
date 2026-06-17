export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold">ハンコマスター検定</h1>
      <p className="mt-4 text-xl text-gray-600">
        誠意ある捺印こそが、社会人の基本です。
      </p>
      <button className="mt-8 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
        検定を開始する
      </button>
    </main>
  );
}
