'use client';

import { useState } from 'react';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { useAdminGlobalEventCreateMutation } from '@duing/hooks';
import { AdminGlobalEventForm } from '../_components/AdminGlobalEventForm';
import { extractErrorMessage } from '@/app/_lib/extractErrorMessage';
import { EMPTY_GLOBAL_EVENT_FORM, toCreatePayload } from '../_lib/parseGlobalEventFormState';
import { toRoute } from '../../../_lib/route';

export function AdminGlobalEventNewPage() {
  const router = useGuardedRouter();
  const createMutation = useAdminGlobalEventCreateMutation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  return (
    <main className="max-w-[760px] mx-auto px-6 py-10">
      <header className="mb-6">
        <h1 className="text-[20px] font-bold text-ink">새 글로벌 이벤트</h1>
        <p className="mt-1 text-[13px] text-charcoal-3">
          캘린더 모든 사용자에게 노출됩니다 (비로그인 포함).
        </p>
      </header>
      <AdminGlobalEventForm
        mode="create"
        initialState={EMPTY_GLOBAL_EVENT_FORM}
        submitLabel="등록하기"
        isSubmitting={createMutation.isPending}
        errorMessage={errorMessage}
        onSubmit={(state) => {
          setErrorMessage(null);
          createMutation.mutate(toCreatePayload(state), {
            onSuccess: () => router.push(toRoute('/admin/global-events')),
            onError: (error) => {
              const message = extractErrorMessage(error);
              setErrorMessage(message ?? '등록에 실패했습니다.');
            },
          });
        }}
      />
    </main>
  );
}
