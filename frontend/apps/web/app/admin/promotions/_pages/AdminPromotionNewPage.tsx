'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreatePromotionMutation } from '@duing/hooks';
import { AdminPromotionForm } from '../_components/AdminPromotionForm';
import { toRoute } from '../../../_lib/route';

function extractErrorMessage(error: unknown): string | null {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message;
    return typeof message === 'string' ? message : null;
  }
  return null;
}

export function AdminPromotionNewPage() {
  const router = useRouter();
  const createMutation = useCreatePromotionMutation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  return (
    <main className="max-w-[760px] mx-auto px-6 py-10">
      <header className="mb-6">
        <h1 className="text-[20px] font-bold text-ink">배너 등록</h1>
      </header>
      <AdminPromotionForm
        mode="create"
        isSubmitting={createMutation.isPending}
        errorMessage={errorMessage}
        onSubmit={(payload) =>
          new Promise<void>((resolve, reject) => {
            setErrorMessage(null);
            createMutation.mutate(payload, {
              onSuccess: () => {
                router.push(toRoute('/admin/promotions'));
                resolve();
              },
              onError: (error) => {
                setErrorMessage(extractErrorMessage(error) ?? '등록에 실패했습니다.');
                reject(error);
              },
            });
          })
        }
      />
    </main>
  );
}
