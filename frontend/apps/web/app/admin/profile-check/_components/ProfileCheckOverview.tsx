import type { AdminProfileCheck } from '@duing/types';

import { formatSemesterLabel } from '@/app/_lib/semesterLabel';

/**
 * 노출 상태·대상 학기·확인 현황. 통계는 서버의 기준 학기(켤 때 기록된 학기, 없으면 오늘의 학기) 값이다.
 * 기록된 학기가 오늘의 학기와 다르면 지난 학기에 켜 둔 팝업이 학기가 바뀌어 멈춘 상태다 — 그 학기의 최종치를 그대로 보여 준다.
 */
export function ProfileCheckOverview({ profileCheck }: { profileCheck: AdminProfileCheck }) {
  const semesterLabel = formatSemesterLabel(profileCheck.semesterYear, profileCheck.semesterTerm);
  const currentSemesterLabel = formatSemesterLabel(
    profileCheck.currentSemesterYear,
    profileCheck.currentSemesterTerm,
  );
  const lapsed =
    profileCheck.semesterYear !== profileCheck.currentSemesterYear ||
    profileCheck.semesterTerm !== profileCheck.currentSemesterTerm;
  // 내림 — 반올림하면 999/1000 이 100% 로 보여 남은 사람이 없는 것처럼 읽힌다. 대상이 0명이면 비율을 보이지 않는다.
  // 정수끼리 먼저 곱한다 — (29 / 100) * 100 은 부동소수 오차로 28.999… 이 돼 내림하면 28% 가 된다.
  const confirmedPercent =
    profileCheck.targetCount > 0
      ? Math.floor((profileCheck.confirmedCount * 100) / profileCheck.targetCount)
      : null;

  return (
    <section>
      <p className="flex flex-wrap items-center gap-2 text-[13.5px] text-charcoal-2">
        {profileCheck.enabled ? (
          <span className="pill pill-solid">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-sage" />
            노출 중
          </span>
        ) : (
          <span className="pill pill-outline">꺼짐</span>
        )}
        <span>{semesterLabel}</span>
      </p>
      {lapsed && (
        <p className="mt-2 text-[13px] text-charcoal-2">
          {`${semesterLabel} 팝업은 기간이 끝났어요. 다시 켜면 ${currentSemesterLabel}로 시작돼요.`}
        </p>
      )}
      {/* 320 폭에서도 세 칸이 한 줄에 들어가게 패딩·숫자 크기를 줄인다(전례 AdminUserKpis 의 타일 어휘). */}
      <ul aria-label="확인 현황" className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        <KpiTile label="대상" value={profileCheck.targetCount} />
        <KpiTile
          label="확인 완료"
          value={profileCheck.confirmedCount}
          sub={confirmedPercent === null ? undefined : `${confirmedPercent}%`}
        />
        <KpiTile label="미확인" value={profileCheck.unconfirmedCount} />
      </ul>
      <p className="mt-2 text-[12.5px] text-charcoal-2">학기 중 가입·프로필 저장도 확인 완료로 셉니다.</p>
    </section>
  );
}

function KpiTile({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <li className="rounded-[14px] border border-line bg-paper px-3 py-3">
      <p className="text-xs font-semibold text-charcoal-3">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-ink sm:text-[22px]">
        {value.toLocaleString('ko-KR')}
        <span className="ml-0.5 text-xs font-semibold text-charcoal-2">명</span>
      </p>
      {sub && <p className="mt-0.5 text-[11.5px] text-charcoal-2">{sub}</p>}
    </li>
  );
}
