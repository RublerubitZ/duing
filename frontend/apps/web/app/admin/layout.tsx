import { HomeNav } from '../_components/HomeNav';
import { AdminRoleGuard } from './_components/AdminRoleGuard';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-cream min-h-screen">
      <HomeNav />
      <AdminRoleGuard>{children}</AdminRoleGuard>
    </div>
  );
}
