'use client';

import { HomeNav } from '@/app/_components/HomeNav';
import { MyFeeList } from '../_components/MyFeeList';

export default function MyFeesPage() {
  // PC 에는 이 페이지들만 상단바가 없었다. 레이아웃이 아니라 페이지에서 감싼다 —
  // MyPage 의 100dvh 래퍼와 충돌하기 때문(SettingsPage 패턴).
  return (
    <div className="duing min-h-dvh bg-cream">
      <HomeNav slimOnMobile />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-bold text-ink">내 회비</h1>
        <p className="mb-6 text-sm text-charcoal-3">
          가입한 동아리에서 청구된 회비 내역을 확인할 수 있습니다.
        </p>
        <MyFeeList />
      </main>
    </div>
  );
}
