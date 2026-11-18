import { AdminHomeDashboard } from './_components/home/AdminHomeDashboard';
import { AdminHomeHeadline } from './_components/home/AdminHomeHeadline';

// 영역별 이동은 사이드바(모바일은 드로어)가 맡는다 — 같은 목적지를 카드로 한 번 더 깔지 않는다.
export default function AdminIndexPage() {
  return (
    <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-ink">총동연 관리자</h1>
        <AdminHomeHeadline />
      </header>
      <AdminHomeDashboard />
    </main>
  );
}
