'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  useAdminNoticeDetailQuery,
  useAdminNoticeUpdateMutation,
} from '@duing/hooks';
import { NoticeForm } from '../_components/NoticeForm';
import {
  EMPTY_NOTICE_FORM,
  toUpdatePayload,
  type NoticeFormState,
} from '../_lib/parseNoticeFormState';
import { extractErrorMessage } from '@/app/_lib/extractErrorMessage';

export function AdminNoticeEditPage() {
  const params = useParams<{ noticeId: string }>();
  const noticeId = params.noticeId ? Number(params.noticeId) : null;
  const router = useRouter();
  const detailQuery = useAdminNoticeDetailQuery(noticeId);
  const updateMutation = useAdminNoticeUpdateMutation();
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
        <p className="text-coral text-[13px]">공지를 불러오지 못했습니다.</p>
      </main>
    );
  }

  const notice = detailQuery.data;
  const initialState: NoticeFormState = {
    ...EMPTY_NOTICE_FORM,
    title: notice.title,
    summary: notice.summary,
    content: notice.content,
    coverImageUrl: notice.coverImageUrl,
    linkUrl: notice.linkUrl ?? '',
    category: notice.category,
    tags: notice.tags,
    visibility: notice.visibility ?? 'PUBLIC',
    clubScopeRole: notice.clubScopeRole,
    targetClubIds: notice.targetClubIds ?? [],
    pinned: notice.pinned,
    expiresAt: notice.expiresAt,
    notifyOnPublish: notice.notifyOnPublish,
    eventStartAt: notice.eventInfo?.startAt ? notice.eventInfo.startAt.slice(0, 16) : '',
    eventEndAt: notice.eventInfo?.endAt ? notice.eventInfo.endAt.slice(0, 16) : '',
    location: notice.eventInfo?.location ?? '',
    host: notice.eventInfo?.host ?? '',
    audience: notice.eventInfo?.audience ?? '',
    contentFormat: notice.contentFormat,
  };

  return (
    <main className="max-w-[760px] mx-auto px-6 py-10">
      <header className="mb-6">
        <h1 className="text-[20px] font-bold text-ink">공지 수정</h1>
      </header>
      <NoticeForm
        initialState={initialState}
        submitLabel="수정 저장"
        isSubmitting={updateMutation.isPending}
        errorMessage={errorMessage}
        onSubmit={(state) => {
          if (noticeId === null) return;
          setErrorMessage(null);
          const payload = toUpdatePayload(state);
          updateMutation.mutate({ noticeId, payload }, {
            onSuccess: () => router.push('/admin/notices'),
            onError: (error) => {
              setErrorMessage(extractErrorMessage(error) ?? '수정에 실패했습니다.');
            },
          });
        }}
      />
    </main>
  );
}
