'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminNoticeCreateMutation } from '@duing/hooks';
import { NoticeForm } from '../_components/NoticeForm';
import { EMPTY_NOTICE_FORM, toCreatePayload } from '../_lib/parseNoticeFormState';

function extractErrorMessage(error: unknown): string | null {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message;
    return typeof message === 'string' ? message : null;
  }
  return null;
}

export function AdminNoticeNewPage() {
  const router = useRouter();
  const createMutation = useAdminNoticeCreateMutation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  return (
    <main className="max-w-[760px] mx-auto px-6 py-10">
      <header className="mb-6">
        <h1 className="text-[20px] font-bold text-ink">새 공지 작성</h1>
      </header>
      <NoticeForm
        initialState={EMPTY_NOTICE_FORM}
        submitLabel="발행하기"
        isSubmitting={createMutation.isPending}
        errorMessage={errorMessage}
        onSubmit={(state) => {
          setErrorMessage(null);
          createMutation.mutate(toCreatePayload(state), {
            onSuccess: (id) => router.push(`/admin/notices/${id}/edit`),
            onError: (error) => {
              const message = extractErrorMessage(error);
              setErrorMessage(message ?? '발행에 실패했습니다.');
            },
          });
        }}
      />
    </main>
  );
}