'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import {
  useAdminGlobalEventDetailQuery,
  useAdminGlobalEventUpdateMutation,
} from '@duing/hooks';
import { AdminGlobalEventForm } from '../_components/AdminGlobalEventForm';
import { extractErrorMessage } from '@/app/_lib/extractErrorMessage';
import { fromDetail, toUpdatePayload } from '../_lib/parseGlobalEventFormState';
import { toRoute } from '../../../_lib/route';

export function AdminGlobalEventEditPage() {
  const router = useGuardedRouter();
  const params = useParams<{ eventId: string }>();
  const eventId = params.eventId ? Number(params.eventId) : null;

  const detailQuery = useAdminGlobalEventDetailQuery(eventId);
  const updateMutation = useAdminGlobalEventUpdateMutation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (detailQuery.isLoading) {
    return (
      <main className="max-w-[760px] mx-auto px-6 py-10">
        <p className="text-charcoal-3 text-[13px]">불러오는 중…</p>
      </main>
    );
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <main className="max-w-[760px] mx-auto px-6 py-10">
        <p className="text-coral text-[13px]">이벤트를 불러오지 못했습니다.</p>
      </main>
    );
  }

  return (
    <main className="max-w-[760px] mx-auto px-6 py-10">
      <header className="mb-6">
        <h1 className="text-[20px] font-bold text-ink">글로벌 이벤트 수정</h1>
      </header>
      <AdminGlobalEventForm
        mode="edit"
        initialState={fromDetail(detailQuery.data)}
        submitLabel="저장하기"
        isSubmitting={updateMutation.isPending}
        errorMessage={errorMessage}
        onSubmit={(state) => {
          if (eventId === null) return;
          setErrorMessage(null);
          updateMutation.mutate(
            {
              eventId,
              // initialCoverImageUrl 은 반드시 '' 로 normalize 해 전달 (Invariant 2 of toUpdatePayload).
              // detailQuery.data.coverImageUrl 은 string | null 이라 ?? '' 없이 전달하면
              // 매 저장마다 잘못된 변경 감지가 일어남.
              payload: toUpdatePayload(state, detailQuery.data.coverImageUrl ?? ''),
            },
            {
              onSuccess: () => router.push(toRoute('/admin/global-events')),
              onError: (error) => {
                const message = extractErrorMessage(error);
                setErrorMessage(message ?? '저장에 실패했습니다.');
              },
            },
          );
        }}
      />
    </main>
  );
}
