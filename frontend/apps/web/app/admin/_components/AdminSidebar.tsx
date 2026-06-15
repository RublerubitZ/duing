import { AdminNavContent } from './AdminNavContent';

/**
 * 어드민 영역 좌측 사이드바. md 이상 화면에서만 표시되고, 모바일에서는 AdminMobileBar 의
 * 햄버거 → 좌측 Sheet 드로어로 동일한 내비(AdminNavContent)에 접근한다.
 */
export function AdminSidebar() {
  return (
    <aside className="hidden md:block w-60 shrink-0 border-r border-charcoal-1 bg-white">
      <nav className="sticky top-0 max-h-screen overflow-y-auto py-6">
        <AdminNavContent />
      </nav>
    </aside>
  );
}
