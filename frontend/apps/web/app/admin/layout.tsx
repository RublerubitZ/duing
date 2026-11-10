import type { Metadata } from 'next';
import { AdminRoleGuard } from './_components/AdminRoleGuard';
import { AdminSidebar } from './_components/AdminSidebar';
import { AdminMobileBar } from './_components/AdminMobileBar';

export const metadata: Metadata = { title: '총동연 콘솔 | 두잉' };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="duing bg-cream min-h-dvh">
      {/* 콘솔은 사이트 상단바를 얹지 않는다(운영진 콘솔과 같다) — 서비스로 돌아가기·알림·로그아웃은 사이드바와 모바일 상단바·드로어가 맡는다. */}
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
