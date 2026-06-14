'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAdminPromotionRequestDetailQuery, useProcessPromotionRequestMutation } from '@duing/hooks';
import type { ProcessPromotionRequestPayload } from '@duing/types';
import { cn } from '../../../_lib/cn';
import { safeExternalHref } from '../../../_lib/route';
import { ImageWithFallback } from '../../../_components/ImageWithFallback';
import { AdminPromotionRequestProcessDialog } from '../_components/AdminPromotionRequestProcessDialog';
import {
  PROMOTION_REQUEST_STATUS_LABEL,
  PROMOTION_REQUEST_STATUS_BADGE_CLASS,
} from '../_lib/promotionRequestLabels';

type Props = {
  requestId: number;
};

export function AdminPromotionRequestDetailPage({ requestId }: Props) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const detailQuery = useAdminPromotionRequestDetailQuery(requestId);
  const processMutation = useProcessPromotionRequestMutation();

  const request = detailQuery.data;

  const handleProcessConfirm = (payload: ProcessPromotionRequestPayload) => {
    setMutationError(null);
    processMutation.mutate(
      { requestId, payload },
      {
        onSuccess: () => {
          setIsDialogOpen(false);
        },
        onError: (error) => {
          setMutationError(
            error instanceof Error ? error.message : '처리에 실패했습니다.',
          );
        },
      },
    );
  };

  if (detailQuery.isLoading) {
    return (
      <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
        <p className="py-12 text-center text-charcoal-3 text-[13px]">불러오는 중…</p>
      </main>
    );
  }

  if (detailQuery.isError || !request) {
    return (
      <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
        <p className="py-12 text-center text-coral text-[13px]">
          홍보 요청 정보를 불러오지 못했습니다.
        </p>
      </main>
    );
  }

  // 제안 URL 은 운영진이 직접 입력 → javascript:/data: 등 비-http 스킴은 클릭 가능한
  // 링크로 만들지 않는다. (값 자체는 텍스트로 노출해 관리자가 검토·반려할 수 있게 둔다.)
  const safeSuggestedLink = safeExternalHref(request.suggestedLinkUrl);
  const safeSuggestedBanner = safeExternalHref(request.suggestedBannerImageUrl);

  return (
    <main className="max-w-layout mx-auto px-4 sm:px-6 md:px-10 py-10">
      <header className="mb-6 flex items-center gap-3">
        <Link
          href="/admin/promotion-requests"
          className="text-[13px] text-charcoal-2 hover:text-ink"
        >
          ← 목록으로
        </Link>
        <h1 className="text-[22px] font-bold text-ink">홍보 요청 상세</h1>
      </header>

      <div className="rounded-xl border border-line bg-paper p-6 space-y-5">
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-charcoal-2">요청 #{request.id}</span>
          <span
            className={cn(
              'inline-block px-2.5 py-1 rounded-full text-[12px] font-semibold',
              PROMOTION_REQUEST_STATUS_BADGE_CLASS[request.status],
            )}
          >
            {PROMOTION_REQUEST_STATUS_LABEL[request.status]}
          </span>
        </div>

        {/* 기본 정보 */}
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-[13.5px]">
          <Row label="동아리">
            {request.club.name}
            <span className="ml-1 text-charcoal-3 text-[12px]">(ID: {request.club.id})</span>
          </Row>
          <Row label="요청자">
            {request.requester.name}
            <span className="ml-1 text-charcoal-3 text-[12px]">(ID: {request.requester.id})</span>
          </Row>
          <Row label="신청 일시">
            {new Date(request.createdAt).toLocaleString('ko-KR')}
          </Row>
        </dl>

        {/* 제목 */}
        <div>
          <dt className="text-[12px] font-semibold text-charcoal-2 mb-1">제목</dt>
          <dd className="text-[13.5px] text-ink">{request.title}</dd>
        </div>

        {/* 설명 */}
        <div>
          <dt className="text-[12px] font-semibold text-charcoal-2 mb-1">설명</dt>
          <dd className="text-[13.5px] text-ink whitespace-pre-wrap bg-graysoft rounded-lg px-4 py-3">
            {request.description || '(내용 없음)'}
          </dd>
        </div>

        {/* 제안 배너 이미지 */}
        {request.suggestedBannerImageUrl && (
          <div>
            <dt className="text-[12px] font-semibold text-charcoal-2 mb-2">제안 배너 이미지</dt>
            <dd>
              <ImageWithFallback
                src={request.suggestedBannerImageUrl}
                alt="제안 배너 이미지"
                objectFit="contain"
                className="h-[240px] w-full rounded-lg border border-line"
                errorMessage="제안 배너 이미지를 불러올 수 없습니다"
              />
              {safeSuggestedBanner && (
                <a
                  href={safeSuggestedBanner}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-[12px] text-charcoal-2 hover:text-ink hover:underline"
                >
                  원본 보기
                </a>
              )}
            </dd>
          </div>
        )}

        {/* 제안 링크 URL */}
        {request.suggestedLinkUrl && (
          <div>
            <dt className="text-[12px] font-semibold text-charcoal-2 mb-1">제안 링크 URL</dt>
            <dd>
              {safeSuggestedLink ? (
                <a
                  href={safeSuggestedLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13.5px] text-blue-600 hover:underline break-all"
                >
                  {request.suggestedLinkUrl}
                </a>
              ) : (
                <span className="text-[13.5px] text-charcoal break-all">{request.suggestedLinkUrl}</span>
              )}
            </dd>
          </div>
        )}

        {/* 처리 이력 */}
        {(request.handledBy || request.actionNote) && (
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-[13.5px] border-t border-line pt-5">
            {request.handledBy && (
              <Row label="처리자">
                {request.handledBy.name}
                <span className="ml-1 text-charcoal-3 text-[12px]">
                  (ID: {request.handledBy.id})
                </span>
              </Row>
            )}
            {request.handledAt && (
              <Row label="처리 일시">
                {new Date(request.handledAt).toLocaleString('ko-KR')}
              </Row>
            )}
            {request.actionNote && (
              <div className="sm:col-span-2">
                <dt className="text-[12px] font-semibold text-charcoal-2 mb-1">처리 메모</dt>
                <dd className="text-[13.5px] text-ink whitespace-pre-wrap bg-graysoft rounded-lg px-4 py-3">
                  {request.actionNote}
                </dd>
              </div>
            )}
          </dl>
        )}

        {request.status === 'PENDING' && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setIsDialogOpen(true)}
              className="px-4 py-2 rounded-full bg-ink text-paper text-[13.5px] font-semibold"
            >
              처리
            </button>
          </div>
        )}
      </div>

      {isDialogOpen && (
        <AdminPromotionRequestProcessDialog
          request={request}
          isPending={processMutation.isPending}
          errorMessage={mutationError}
          onConfirm={handleProcessConfirm}
          onCancel={() => {
            setIsDialogOpen(false);
            setMutationError(null);
          }}
        />
      )}
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] font-semibold text-charcoal-2">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}
