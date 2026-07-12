'use client';

import { useState } from 'react';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { useAdminFederationFaqCreateMutation } from '@duing/hooks';
import { FaqForm, EMPTY_FAQ_FORM } from '../_components/FaqForm';
import { extractErrorMessage } from '@/app/_lib/extractErrorMessage';

export function AdminFaqNewPage() {
  const router = useGuardedRouter();
  const createMutation = useAdminFederationFaqCreateMutation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  return (
    <main className="max-w-[760px] mx-auto px-6 py-10">
      <header className="mb-6">
        <h1 className="text-[20px] font-bold text-ink">새 FAQ 작성</h1>
      </header>
      <FaqForm
        initialState={EMPTY_FAQ_FORM}
        submitLabel="등록하기"
        isSubmitting={createMutation.isPending}
        errorMessage={errorMessage}
        onSubmit={(state) => {
          setErrorMessage(null);
          createMutation.mutate(state, {
            onSuccess: () => router.push('/admin/faqs'),
            onError: (error) => {
              setErrorMessage(extractErrorMessage(error) ?? '등록에 실패했습니다.');
            },
          });
        }}
      />
    </main>
  );
}
