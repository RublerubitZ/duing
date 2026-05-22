'use client';

import { AdminRecertificationRoundCreateForm } from '../_components/AdminRecertificationRoundCreateForm';

export function AdminRecertificationRoundNewPage() {
  return (
    <main className="max-w-[760px] mx-auto px-6 py-10">
      <header className="mb-6">
        <h1 className="text-[20px] font-bold text-ink">재인증 라운드 개설</h1>
        <p className="mt-1 text-[13.5px] text-charcoal-2">
          새로운 재인증 라운드를 개설합니다.
        </p>
      </header>
      <AdminRecertificationRoundCreateForm />
    </main>
  );
}
