import { HomeNav } from '../_components/HomeNav';
import { AdminRoleGuard } from './_components/AdminRoleGuard';
import { AdminSidebar } from './_components/AdminSidebar';
import { AdminMobileBar } from './_components/AdminMobileBar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="duing bg-cream min-h-dvh">
      {/* 모바일에서는 섹션 내비를 AdminMobileBar 드로어가 제공하므로 글로벌 링크를 슬림화한다. */}
      <HomeNav slimOnMobile />
      <AdminRoleGuard>
        <div className="flex">
          <AdminSidebar />
          <div className="flex-1 min-w-0">
            <AdminMobileBar />
            {children}
          </div>
        </div>
      </AdminRoleGuard>
    </div>
  );
}
