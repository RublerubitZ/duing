'use client';

import Link from 'next/link';
import { AdminClubCreateForm } from '../_components/AdminClubCreateForm';
import { toRoute } from '../../../../_lib/route';

export function AdminClubCreatePage() {
  return (
    <main className="max-w-2xl mx-auto px-10 py-10">
      <header className="mb-6">
        <Link
          href={toRoute('/admin/clubs')}
          className="text-charcoal-3 text-xs font-semibold hover:underline"
        >
          ← 동아리 목록
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-ink">새 동아리 등록</h1>
        <p className="text-charcoal-3 mt-1 text-sm">
          등록 직후 상태는 <span className="font-medium">승인 대기(PENDING_APPROVAL)</span>{' '}
          입니다. 선택한 동아리장이 회장 권한을 받고, 동아리 정보 보완 후 다시 승인 절차를 거쳐
          학생에게 노출됩니다.
        </p>
      </header>
      <AdminClubCreateForm />
    </main>
  );
}
