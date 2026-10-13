'use client';

import Link from 'next/link';

import { daysUntilKst, formatDateTimeKst } from '@duing/hooks/datetime';
import type { AdminRecruitmentListItem, AdminRecruitmentSummary } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { recruitmentPeriodLabel } from '@/app/_lib/recruitmentDisplay';
import { toRoute } from '@/app/_lib/route';
import { EmptyState } from '../../_components/EmptyState';
import {
  applicationModeLabel,
  needsOperatorAttention,
  recruitmentConsoleChip,
} from '../_lib/recruitmentLabels';

/**
 * 미처리 지원서가 이 일수 이상 묵으면 강조한다. KST 달력 일수라, 제출 시각 기준(지금 − 168시간)으로 세는
 * 사이드바 뱃지·운영진 리마인더와는 경계에서 하루 미만 어긋날 수 있다(스펙이 허용).
 */
const PENDING_ATTENTION_DAYS = 7;
/** 운영진 마지막 접속이 이 일수를 넘으면 강조한다. */
const OPERATOR_INACTIVE_DAYS = 30;
const ATTENTION_TEXT_CLASS = 'font-semibold text-coral-deep';

type Props = {
  items: AdminRecruitmentListItem[];
  onOpenDetail: (recruitment: AdminRecruitmentListItem) => void;
};

export function AdminRecruitmentsTable({ items, onOpenDetail }: Props) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon="🔎"
        title="조회 결과가 없습니다"
        body={'검색어를 줄이거나 상태·방식 필터를 바꿔보세요.\n동아리명과 모집 제목으로 찾을 수 있어요.'}
      />
    );
  }

  // 일수는 이 시각 기준 KST 날짜 차이다(오늘 = 0) — 클라이언트 로컬 날짜로 세면 다른 시간대에서 하루씩 어긋난다.
  // 행마다 시계를 다시 읽지 않게 한 번만 잡아 같은 표 안에서 기준일이 갈리지 않게 한다.
  const now = new Date();

  return (
    <div className="overflow-x-auto">
      {/* 열 폭은 13px 가장 긴 내용 + 좌우 패딩 24 에 맞춘다 — 1366 폭 노트북에서도 가로 스크롤이 생기지 않게. */}
      <table className="w-full min-w-[992px] text-[13px]">
        <colgroup>
          <col className="w-[128px]" />
          <col />
          <col className="w-[80px]" />
          <col className="w-[92px]" />
          <col className="w-[72px]" />
          <col className="w-[112px]" />
          <col className="w-[88px]" />
          <col className="w-[180px]" />
          <col className="w-[124px]" />
        </colgroup>
        <thead className="bg-graysoft text-charcoal-2">
          <tr>
            <Th>동아리</Th>
            <Th>모집 제목</Th>
            <Th>방식</Th>
            <Th>상태</Th>
            <Th align="right">지원자</Th>
            <Th>미처리</Th>
            <Th>운영진 접속</Th>
            <Th>기간</Th>
            <Th>마지막 수정</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((recruitment) => (
            <tr
              key={recruitment.recruitmentId}
              onClick={() => onOpenDetail(recruitment)}
              className="cursor-pointer border-t border-line hover:bg-graysoft/50"
            >
              <Td>
                <span className="block truncate text-[13.5px] font-semibold text-charcoal">
                  {recruitment.clubName}
                </span>
              </Td>
              <Td>
                <div className="flex min-w-0 items-center gap-2">
                  {/* 행 전체가 클릭 대상이지만 키보드·새 탭으로도 들어갈 수 있어야 해서 제목은 링크로 둔다.
                      링크 자체가 이동을 처리하므로 행 핸들러까지 타지 않게 전파를 끊는다. */}
                  <Link
                    href={toRoute(`/admin/recruitments/${recruitment.recruitmentId}`)}
                    onClick={(event) => event.stopPropagation()}
                    className="truncate text-charcoal hover:underline"
                  >
                    {recruitment.title}
                  </Link>
                  {needsOperatorAttention(recruitment) && (
                    <span className="pill-warm shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold">
                      운영 개입 필요
                    </span>
                  )}
                </div>
              </Td>
              {/* 목록 응답에는 외부 폼 URL 이 없다 — 플랫폼명은 상세에서만 붙는다. */}
              <Td>{applicationModeLabel(recruitment.applicationMode, null)}</Td>
              <Td>
                <StatusChip recruitment={recruitment} />
              </Td>
              {/* 외부 폼 모집은 두잉에 지원 데이터가 없다 — 0 으로 적으면 "아무도 안 냈다"로 읽힌다. */}
              <Td align="right">
                {recruitment.applicantCount === null ? '—' : `${recruitment.applicantCount}명`}
              </Td>
              <Td>
                <PendingApplicationsCell
                  pendingApplicationCount={recruitment.pendingApplicationCount}
                  oldestPendingSubmittedAt={recruitment.oldestPendingSubmittedAt}
                  now={now}
                />
              </Td>
              <Td>
                <OperatorsLastActiveCell lastActiveAt={recruitment.operatorsLastActiveAt} now={now} />
              </Td>
              <Td>
                <span className="whitespace-nowrap text-charcoal-2">
                  {recruitmentPeriodLabel(recruitment.startDate, recruitment.endDate)}
                </span>
              </Td>
              <Td>
                <span className="whitespace-nowrap text-charcoal-3">
                  {formatDateTimeKst(recruitment.updatedAt)}
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/*
 * 아래 두 셀의 값이 선택 필드인 건 배포 전환기 구 응답(세 필드 없음)을 null 처럼 그리는 fail-open 이다.
 * 백엔드가 배포된 뒤에는 도달할 수 없는 분기이므로 다음 정리 때 지워도 된다.
 */

/** `N건 · X일째` — 외부 폼은 지원자 수처럼 해당 없음(—), 처리할 것이 없으면 `0건`. */
const PendingApplicationsCell = ({
  pendingApplicationCount,
  oldestPendingSubmittedAt,
  now,
}: {
  pendingApplicationCount?: number | null;
  oldestPendingSubmittedAt?: string | null;
  now: Date;
}) => {
  if (pendingApplicationCount === undefined || pendingApplicationCount === null) return <>—</>;
  if (pendingApplicationCount === 0 || !oldestPendingSubmittedAt) {
    return <span className="whitespace-nowrap">{pendingApplicationCount}건</span>;
  }
  const waitingDays = -daysUntilKst(oldestPendingSubmittedAt, now);
  return (
    <span className={cn('whitespace-nowrap', waitingDays >= PENDING_ATTENTION_DAYS && ATTENTION_TEXT_CLASS)}>
      {`${pendingApplicationCount}건 · ${waitingDays <= 0 ? '오늘' : `${waitingDays}일째`}`}
    </span>
  );
};

/** `N일 전`·`오늘` — 기록이 없으면 가장 오래 방치된 경우라 함께 강조한다. */
const OperatorsLastActiveCell = ({
  lastActiveAt,
  now,
}: {
  lastActiveAt?: string | null;
  now: Date;
}) => {
  if (!lastActiveAt) {
    return <span className={cn('whitespace-nowrap', ATTENTION_TEXT_CLASS)}>기록 없음</span>;
  }
  const inactiveDays = -daysUntilKst(lastActiveAt, now);
  return (
    <span
      className={cn(
        'whitespace-nowrap',
        inactiveDays > OPERATOR_INACTIVE_DAYS ? ATTENTION_TEXT_CLASS : 'text-charcoal-2',
      )}
    >
      {inactiveDays <= 0 ? '오늘' : `${inactiveDays}일 전`}
    </span>
  );
};

/** 라벨과 색은 항상 같이 갈리므로 한 번만 계산한다 — 호출부가 같은 조건을 두 번 쓰지 않게. */
const StatusChip = ({ recruitment }: { recruitment: AdminRecruitmentSummary }) => {
  const { label, badgeClass } = recruitmentConsoleChip(recruitment);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${badgeClass}`}
    >
      {label}
    </span>
  );
};

const Th = ({ children, align }: { children: React.ReactNode; align?: 'right' }) => (
  <th className={`px-3 py-2 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
    {children}
  </th>
);
const Td = ({ children, align }: { children: React.ReactNode; align?: 'right' }) => (
  <td className={`px-3 py-2 align-middle ${align === 'right' ? 'text-right' : ''}`}>{children}</td>
);
