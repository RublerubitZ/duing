import { HomeNav } from '../_components/HomeNav';
import { AdminRoleGuard } from './_components/AdminRoleGuard';
import { AdminSidebar } from './_components/AdminSidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="duing bg-cream min-h-dvh">
      <HomeNav />
      <AdminRoleGuard>
        <div className="flex">
          <AdminSidebar />
          <div className="flex-1 min-w-0">{children}</div>
        </div>
      </AdminRoleGuard>
    </div>
  );
}
