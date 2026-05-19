import { redirect } from 'next/navigation';
import { toRoute } from '../_lib/route';

export default function AdminIndexPage() {
  redirect(toRoute('/admin/clubs'));
}
