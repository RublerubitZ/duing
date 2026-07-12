'use client';

import { useEffect, useState } from 'react';
import type { FederationInquiryAttachment } from '@duing/types';
import { useFederationInquiryAttachmentQuery } from '@duing/hooks';

import { cn } from '@/app/_lib/cn';

type AttachmentImageProps = {
  inquiryId: number;
  attachment: FederationInquiryAttachment;
  className?: string;
};

// 총동연 1:1 문의 첨부 뷰어 — 학생·admin 양쪽에서 공용으로 쓴다(다운로드 엔드포인트가 동일하고
// 권한 분기만 서버에서 처리). 비밀성 계약: 서버는 storageKey·공개 URL 을 응답에 절대 싣지 않으므로
// 여기서도 인증 프록시(useFederationInquiryAttachmentQuery)로 받은 Blob 을 objectURL 로 변환해서만 렌더한다.
export function AttachmentImage({ inquiryId, attachment, className }: AttachmentImageProps) {
  const attachmentQuery = useFederationInquiryAttachmentQuery(inquiryId, attachment.id);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    const blob = attachmentQuery.data;
    if (!blob) {
      setObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachmentQuery.data]);

  if (attachmentQuery.isLoading) {
    return <div className={cn('aspect-square animate-pulse rounded-lg bg-graysoft', className)} aria-hidden />;
  }

  if (attachmentQuery.isError || !objectUrl) {
    return (
      <div
        role="img"
        aria-label={attachment.fileName}
        className={cn(
          'grid aspect-square place-items-center rounded-lg border border-line bg-graysoft px-2 text-center text-[11px] text-charcoal-3',
          className,
        )}
      >
        {attachment.fileName}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => window.open(objectUrl, '_blank', 'noopener,noreferrer')}
      className={cn(
        'aspect-square overflow-hidden rounded-lg border border-line bg-graysoft',
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 인증 프록시로 받은 blob objectURL(비밀성 계약: 공개 URL 미사용). */}
      <img
        src={objectUrl}
        alt={attachment.fileName}
        draggable={false}
        className="h-full w-full object-cover"
      />
    </button>
  );
}
