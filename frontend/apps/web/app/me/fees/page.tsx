'use client';

import { MyFeeList } from '../_components/MyFeeList';

export default function MyFeesPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-1 text-2xl font-bold text-ink">내 회비</h1>
      <p className="mb-6 text-sm text-charcoal-3">
        가입한 동아리에서 청구된 회비 내역을 확인할 수 있습니다.
      </p>
      <MyFeeList />
    </main>
  );
}
