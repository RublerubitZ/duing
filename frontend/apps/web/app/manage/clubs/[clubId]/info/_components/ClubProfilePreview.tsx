import { Check } from 'lucide-react';
import type { ClubDayOfWeek, FeeCycle } from '@duing/types';
import { formatClubFee } from '@/app/_lib/clubFee';

export type ClubPreviewData = {
  name: string;
  logoUrl: string;
  coverUrl: string;
  cohortNumber: number | null;
  tagline: string;
  tags: string[];
  foundedYear: number | null;
  activityFrequency: number | null;
  activeDays: ClubDayOfWeek[];
  location: string;
  feeCycle: FeeCycle;
  membershipFeeAmount: number | null;
  feeNote: string;
  highlights: string[];
};

const DAY_SHORT: Record<ClubDayOfWeek, string> = {
  MONDAY: '월', TUESDAY: '화', WEDNESDAY: '수', THURSDAY: '목',
  FRIDAY: '금', SATURDAY: '토', SUNDAY: '일',
};

export function ClubProfilePreview({ preview }: { preview: ClubPreviewData }) {
  const feeText = formatClubFee(preview.feeCycle, preview.membershipFeeAmount);
  const activityText =
    preview.activityFrequency !== null
      ? `주 ${preview.activityFrequency}회${preview.activeDays.length > 0 ? ` (${preview.activeDays.map((day) => DAY_SHORT[day]).join('·')})` : ''}`
      : null;
  const metaItems: [string, string][] = [];
  if (preview.foundedYear !== null) metaItems.push(['창설', `${preview.foundedYear}년`]);
  if (activityText !== null) metaItems.push(['활동', activityText]);
  if (preview.location !== '') metaItems.push(['위치', preview.location]);
  // 대표 금액이 있으면 그대로, 없어도 안내문이 있으면 안내문으로 회비 셀 노출(한 줄 truncate) — 상세 페이지 노출 규칙과 동일 조건
  if (feeText !== null) metaItems.push(['회비', feeText]);
  else if (preview.feeNote !== '') metaItems.push(['회비', preview.feeNote]);

  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2 text-[12px] font-bold tracking-[0.05em] text-[#8a8f83]">
        <span className="h-[7px] w-[7px] rounded-full bg-[#4a6b3f]" />학생에게 보이는 프로필
      </div>
      <div className="overflow-hidden rounded-[22px] border border-[#d9d4c3] bg-white shadow-md">
        <div className="relative h-24 bg-gradient-to-br from-[#1F4A36] to-[#2E6149]">
          {preview.coverUrl !== '' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.coverUrl} alt="" draggable={false} className="h-full w-full object-cover" />
          )}
          {/* 로고 1/3만 커버에 걸침 — 히어로 프로필 규칙(편집 폼·학생 히어로와 통일). */}
          <div className="absolute -bottom-[38px] left-4 grid h-14 w-14 place-items-center overflow-hidden rounded-[16px] border-[3px] border-white bg-[#1f3a2e] tabular-nums text-[20px] font-bold text-white shadow-lg">
            {preview.logoUrl !== '' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.logoUrl} alt="로고" draggable={false} className="h-full w-full object-cover" />
            ) : (
              <span aria-hidden>{'{ }'}</span>
            )}
          </div>
        </div>
        <div className="px-4 pb-4 pt-14">
          <div className="flex items-center gap-2">
            <span className="text-[18px] font-extrabold text-[#2a2f27]">{preview.name}</span>
            {preview.cohortNumber !== null && (
              <span className="rounded-full bg-[#f0ede3] px-2 py-0.5 text-[10.5px] font-bold text-[#4a5247]">
                {preview.cohortNumber}기
              </span>
            )}
          </div>
          {preview.tagline !== '' && <p className="mt-1 text-[13px] text-[#4a5247]">{preview.tagline}</p>}
          {preview.tags.length > 0 && (
            <div className="mb-4 mt-3 flex flex-wrap gap-1.5">
              {preview.tags.map((tag) => (
                <span key={tag} className="text-[11px] font-bold text-[#3e5b34]">#{tag}</span>
              ))}
            </div>
          )}
          {metaItems.length > 0 && (
            <div className="mb-4 grid grid-cols-2 gap-2">
              {metaItems.map(([label, valueText]) => (
                <div key={label} className="rounded-[10px] bg-[#f7f5ee] px-2.5 py-2">
                  <div className="text-[10.5px] text-[#8a8f83]">{label}</div>
                  <div className="mt-0.5 truncate text-[12px] font-semibold text-[#2a2f27]">{valueText}</div>
                </div>
              ))}
            </div>
          )}
          {preview.highlights.length > 0 && (
            <>
              <div className="mb-2 text-[12px] font-bold text-[#2a2f27]">이런 사람이 좋아할 거예요</div>
              <ul className="mb-4 space-y-1.5">
                {preview.highlights.slice(0, 3).map((item, idx) => (
                  <li key={idx} className="flex gap-1.5 text-[12px] leading-snug text-[#4a5247]">
                    <Check aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4a6b3f]" />
                    {item}
                  </li>
                ))}
              </ul>
            </>
          )}
          <button type="button" disabled aria-hidden className="w-full cursor-default rounded-[10px] bg-[#1f3a2e] py-2.5 text-[13.5px] font-bold text-white">
            지원하기
          </button>
        </div>
      </div>
      <p className="mt-3 text-center text-[11.5px] leading-relaxed text-[#8a8f83]">
        변경 사항은 <strong>저장</strong> 후 동아리 상세 페이지에 반영돼요.
      </p>
    </div>
  );
}
