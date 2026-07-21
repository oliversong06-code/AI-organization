import { OfficeScene } from "@/components/office/OfficeScene";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <header className="border-b bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-zinc-900">AI 회사 사무실</h1>
        <p className="text-sm text-zinc-500">
          Claude Code에 요청하면 부서·직원·업무가 이 사무실에 나타납니다.
        </p>
      </header>
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-6xl overflow-hidden rounded-xl border bg-white shadow-sm">
          <OfficeScene employees={[]} />
        </div>
      </main>
    </div>
  );
}
