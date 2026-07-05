import { Suspense } from 'react';
import type { Metadata } from 'next';

import { FaqPage } from './_pages/FaqPage';

export const metadata: Metadata = {
  title: '자주 묻는 질문 | 두잉',
  description: '총동아리연합회에 자주 묻는 질문과 답변을 확인하세요.',
  alternates: { canonical: '/faq' },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <FaqPage />
    </Suspense>
  );
}
