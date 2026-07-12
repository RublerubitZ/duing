'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAdminFederationFaqListQuery, useAdminFederationFaqUpdateMutation } from '@duing/hooks';
import { FaqForm, type FaqFormState } from '../_components/FaqForm';
import { extractErrorMessage } from '@/app/_lib/extractErrorMessage';
import { FAQ_FULL_LIST_SIZE } from '../_lib/faqListConstants';

// 상세 조회 API 가 없으므로(스펙 §6) admin 목록을 전체 창(FAQ_FULL_LIST_SIZE)으로 불러와 해당 id 행을
// 찾아 초기값을 시드한다. AdminFederationFaqSummary 는 answer 를 포함한 전체 필드라 부분 시드 문제
// (메모리: 수정 모달 시드 함정)가 없다.

export function AdminFaqEditPage() {
  const params = useParams<{ faqId: string }>();
  const faqId = params.faqId ? Number(params.faqId) : null;
  const router = useRouter();
  const listQuery = useAdminFederationFaqListQuery({ page: 0, size: FAQ_FULL_LIST_SIZE });
  const updateMutation = useAdminFederationFaqUpdateMutation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (listQuery.isLoading) {
    return (
      <main className="max-w-[760px] mx-auto px-6 py-10">
        <p className="text-charcoal-3 text-[13px]">불러오는 중…</p>
      </main>
    );
  }

  if (listQuery.isError) {
    return (
      <main className="max-w-[760px] mx-auto px-6 py-10">
        <p className="text-coral text-[13px]">FAQ를 불러오지 못했습니다.</p>
      </main>
    );
  }

  const faq = (listQuery.data?.content ?? []).find((item) => item.id === faqId);

  if (!faq) {
    return (
      <main className="max-w-[760px] mx-auto px-6 py-10">
        <p className="text-coral text-[13px]">FAQ를 찾을 수 없습니다.</p>
      </main>
    );
  }

  const initialState: FaqFormState = {
    categoryId: faq.categoryId,
    question: faq.question,
    answer: faq.answer,
    pinned: faq.pinned,
    published: faq.published,
  };

  return (
    <main className="max-w-[760px] mx-auto px-6 py-10">
      <header className="mb-6">
        <h1 className="text-[20px] font-bold text-ink">FAQ 수정</h1>
      </header>
      <FaqForm
        initialState={initialState}
        submitLabel="수정 저장"
        isSubmitting={updateMutation.isPending}
        errorMessage={errorMessage}
        onSubmit={(state) => {
          if (faqId === null) return;
          setErrorMessage(null);
          updateMutation.mutate({ faqId, payload: state }, {
            onSuccess: () => router.push('/admin/faqs'),
            onError: (error) => {
              setErrorMessage(extractErrorMessage(error) ?? '수정에 실패했습니다.');
            },
          });
        }}
      />
    </main>
  );
}
