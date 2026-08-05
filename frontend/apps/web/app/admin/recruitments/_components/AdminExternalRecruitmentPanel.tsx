'use client';

import type { AdminRecruitmentDetail } from '@duing/types';

import { safeExternalHref } from '@/app/_lib/route';
import { externalFormPlatformLabel } from '@/app/manage/clubs/[clubId]/recruitments/_lib/externalFormPlatform';
import { ConsoleCard } from '../../_components/ConsoleCard';
import { JOIN_LINK_STATUS_LABEL } from '../_lib/recruitmentLabels';

type Props = {
  recruitment: AdminRecruitmentDetail;
};

/**
 * 외부 폼 모집 안내. 지원서는 두잉 밖에 있으므로 지원자 목록 자리를 비워두는 대신, 이 모집에서
 * 두잉이 실제로 쥐고 있는 것(가입 링크 → 가입 요청 → 승인)을 보여준다.
 *
 * <p>네 칸은 전부 서버가 계산해 내려준 값을 그대로 적는다 — 화면에서 더하고 빼면 서버 정의(활성 링크
 * 기준 누적 등)와 어긋난 숫자가 운영 판단에 쓰인다.
 */
export function AdminExternalRecruitmentPanel({ recruitment }: Props) {
  const joinLink = recruitment.joinLink;
  const formHref = safeExternalHref(recruitment.externalFormUrl);
  const platformLabel = externalFormPlatformLabel(recruitment.externalFormUrl) ?? '외부 폼';

  return (
    <ConsoleCard className="mt-5 p-6">
      <h2 className="text-[15.5px] font-bold text-ink-deep">외부 폼 모집</h2>
      <p className="mt-2 text-[13.5px] leading-relaxed text-charcoal-2">
        외부 모집은 두잉에서 지원서를 관리하지 않습니다. 회원 등록은 가입 링크 → 가입 요청 → 운영진
        승인 절차로 진행됩니다.
      </p>

      {formHref && (
        <a
          href={formHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex max-w-full items-center gap-1.5 text-[13px] text-charcoal-2 hover:text-ink hover:underline"
        >
          <span className="shrink-0 font-semibold">{platformLabel}</span>
          <span className="truncate">{recruitment.externalFormUrl}</span>
          <span aria-hidden>↗</span>
        </a>
      )}

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="가입 링크 상태" value={joinLink ? JOIN_LINK_STATUS_LABEL[joinLink.linkStatus] : '링크 없음'} />
        <Stat label="가입 요청" value={joinLink ? `${joinLink.totalRequestCount}건` : '—'} />
        <Stat label="승인 대기" value={joinLink ? `${joinLink.pendingCount}건` : '—'} />
        <Stat label="회원 등록" value={joinLink ? `${joinLink.enrolledCount}명` : '—'} />
      </dl>
    </ConsoleCard>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-graysoft/40 px-3.5 py-3">
      <dt className="text-[12px] font-semibold text-charcoal-3">{label}</dt>
      <dd className="mt-1 text-[15px] font-bold text-ink-deep">{value}</dd>
    </div>
  );
}
