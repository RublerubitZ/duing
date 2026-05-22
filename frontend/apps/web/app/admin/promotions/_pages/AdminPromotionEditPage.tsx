'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAdminPromotionListQuery, useUpdatePromotionMutation } from '@duing/hooks';
import { AdminPromotionForm } from '../_components/AdminPromotionForm';
import { toRoute } from '../../../_lib/route';

function extractErrorMessage(error: unknown): string | null {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message;
    return typeof message === 'string' ? message : null;
  }
  return null;
}

// 단건 GET API 가 없으므로 list(size=1000)에서 id 매칭으로 데이터를 조회한다.
// 배너 수가 일반적으로 많지 않으므로 실용적인 우회 전략이다.
export function AdminPromotionEditPage() {
  const params = useParams<{ promotionId: string }>();
  const promotionId = params.promotionId ? Number(params.promotionId) : null;
  const router = useRouter();
  const updateMutation = useUpdatePromotionMutation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const listQuery = useAdminPromotionListQuery({ size: 1000 });
  const promotion = listQuery.data?.content.find((item) => item.id === promotionId) ?? null;

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
        <p className="text-coral text-[13px]">배너 목록을 불러오지 못했습니다.</p>
      </main>
    );
  }

  if (!promotion) {
    return (
      <main className="max-w-[760px] mx-auto px-6 py-10">
        <p className="text-coral text-[13px]">배너를 찾을 수 없습니다.</p>
        <a href="/admin/promotions" className="mt-3 inline-block text-[13px] text-charcoal-2 underline">
          배너 목록으로
        </a>
      </main>
    );
  }

  return (
    <main className="max-w-[760px] mx-auto px-6 py-10">
      <header className="mb-6">
        <h1 className="text-[20px] font-bold text-ink">배너 수정</h1>
      </header>
      <AdminPromotionForm
        mode="edit"
        initialValues={promotion}
        isSubmitting={updateMutation.isPending}
        errorMessage={errorMessage}
        onSubmit={(payload) =>
          new Promise<void>((resolve, reject) => {
            if (promotionId === null) return reject(new Error('promotionId missing'));
            setErrorMessage(null);
            updateMutation.mutate({ promotionId, payload }, {
              onSuccess: () => {
                router.push(toRoute('/admin/promotions'));
                resolve();
              },
              onError: (error) => {
                setErrorMessage(extractErrorMessage(error) ?? '수정에 실패했습니다.');
                reject(error);
              },
            });
          })
        }
      />
    </main>
  );
}
