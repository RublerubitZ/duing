'use client';

// 동아리 상세 페이지의 멤버 전용 "공지" 탭 — 최근 공지 미리보기(읽기 전용) + 전체 보기 링크.
// 작성/수정/삭제 관리는 /clubs/{clubId}/member/notices 가 담당한다.

import Link from 'next/link';

import { useClubNoticeListQuery } from '@duing/hooks';

import { toRoute } from '@/app/_lib/route';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';

const PREVIEW_COUNT = 4;

type Props = { clubId: number };

function formatDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

export function ClubDetailNotices({ clubId }: Props) {
  const { data, isLoading } = useClubNoticeListQuery(clubId, 0);
  const notices = (data?.content ?? []).slice(0, PREVIEW_COUNT);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-bold text-ink-deep">공지</h3>
        <Link
          href={toRoute(`/clubs/${clubId}/member/notices`)}
          className="text-[13px] font-semibold text-charcoal-2 hover:text-ink"
        >
          전체 보기 →
        </Link>
      </div>

      {isLoading ? (
        <ListRowsSkeleton
          rows={3}
          rowClassName="h-[64px] rounded-xl"
          className="space-y-2"
          label="공지 불러오는 중"
        />
      ) : notices.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-8 text-center text-sm text-charcoal-3">
          등록된 공지가 없어요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notices.map((notice) => (
            <li key={notice.id}>
              <Link
                href={toRoute(`/clubs/${clubId}/member/notices/${notice.id}`)}
                className="block rounded-xl border border-line bg-paper px-4 py-3 transition hover:border-ink"
              >
                <div className="flex items-center gap-2">
                  {notice.pinned && (
                    <span className="shrink-0 rounded-full bg-warm/20 px-2 py-0.5 text-[11px] font-semibold text-warm">
                      고정
                    </span>
                  )}
                  <span className="line-clamp-1 font-semibold text-ink-deep">{notice.title}</span>
                </div>
                <div className="mt-1 text-[12px] text-charcoal-3">{formatDate(notice.createdAt)}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
