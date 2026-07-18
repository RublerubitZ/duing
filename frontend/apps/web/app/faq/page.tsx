import { Suspense } from 'react';
import type { Metadata } from 'next';

import { RouteLoading } from '@/app/_components/RouteLoading';
import { FaqPage } from './_pages/FaqPage';

export const metadata: Metadata = {
  title: '자주 묻는 질문 | 두잉',
  description: '총동아리연합회에 자주 묻는 질문과 답변을 확인하세요.',
  alternates: { canonical: '/faq' },
};

export default function Page() {
  return (
    // useSearchParams 경계 — fallback null 이면 프리렌더 HTML·하이드레이션 전 화면이 통째로 백지가 된다.
    <Suspense fallback={<RouteLoading />}>
      <FaqPage />
    </Suspense>
  );
}
