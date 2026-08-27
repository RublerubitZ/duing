'use client';

import { useEffect, useRef } from 'react';
import type { ClubMember, MemberFeeStatus } from '@duing/types';
import { GRADE_DISPLAY_NAME } from '@duing/types';
import { formatDateKst } from '@duing/hooks';
import { cn } from '@/app/_lib/cn';
import { clubMemberRoleLabel } from '@/app/_lib/clubMemberRoleLabel';

type Props = {
  members: ClubMember[];
  useGeneration: boolean;
  selectedIds: ReadonlySet<number>;
  onToggleSelect: (memberId: number) => void;
  onToggleAll: () => void;
  onOpenDetail: (member: ClubMember) => void;
  // 빈 상태 문구에 검색어를 반영하기 위한 현재 검색어(옵셔널 — 미전달 시 일반 문구).
  query?: string;
  // 선택(체크박스) 컬럼 노출 여부. 판정은 memberPermissions 의 bulkSelectable — 실행 가능한 일괄
  // 작업이 없는 뷰어에겐 호출부가 false 를 넘겨 숨긴다. 기본 true(비파괴).
  selectable?: boolean;
};

const FEE_STATUS: Record<MemberFeeStatus, { label: string; className: string }> = {
  PAID: { label: '납부', className: 'bg-sage-mist text-ink' },
  UNPAID: { label: '미납', className: 'bg-[#fce2d9] text-[#9a3f23]' },
  NONE: { label: '—', className: '' },
};

function FeeBadge({ status }: { status: MemberFeeStatus }) {
  const { label, className } = FEE_STATUS[status];
  if (status === 'NONE') return <span className="text-charcoal-3">—</span>;
  // shrink-0/nowrap 은 모바일 카드용 — 좁은 폭에서 배지가 눌려 '납/부' 로 접히는 것을 막는다.
  // 데스크탑 표에서는 셀 안 인라인 요소라 아무 영향이 없다.
  return (
    <span
      className={cn(
        'shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
        className,
      )}
    >
      {label}
    </span>
  );
}

function generationLabel(member: ClubMember): string {
  return member.generation === null ? '—' : `${member.generation}기`;
}

function InitialAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sage-mist text-xs font-semibold text-ink"
    >
      {name.slice(0, 1)}
    </span>
  );
}

export function MemberTable({
  members,
  useGeneration,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onOpenDetail,
  query,
  selectable = true,
}: Props) {
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const allSelected = members.length > 0 && members.every((member) => selectedIds.has(member.memberId));
  const someSelected = members.some((member) => selectedIds.has(member.memberId));

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  if (members.length === 0) {
    const trimmedQuery = query?.trim();
    return (
      <div className="card px-6 py-12 text-center">
        <p className="text-sm font-medium text-charcoal-2">
          {trimmedQuery ? `'${trimmedQuery}' 조건에 맞는 회원이 없어요` : '조건에 맞는 회원이 없어요'}
        </p>
        <p className="mt-1 text-xs text-charcoal-3">검색어나 필터를 바꿔 보세요.</p>
      </div>
    );
  }

  return (
    <>
      {/* 데스크탑: 표. 태블릿(md~lg)은 사이드바 280px 이 빠져 본문이 ~416px 뿐이라 표를 넣으면
          한글이 한 글자씩 세로로 접힌다 — 그 구간은 아래 카드 리스트가 맡는다.
          min-w 는 상세 패널이 열려 표 컬럼이 좁아졌을 때의 최후 방어선(그 아래로는 카드가 가로 스크롤). */}
      <div className="card hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-cream text-left">
            <tr>
              {selectable && (
                <th className="w-10 px-4 py-3">
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    aria-label="전체 선택"
                    checked={allSelected}
                    onChange={onToggleAll}
                    className="h-4 w-4 cursor-pointer rounded border-line text-ink focus:ring-sage"
                  />
                </th>
              )}
              <th className="px-4 py-3 font-medium text-charcoal-2">회원</th>
              <th className="px-4 py-3 font-medium text-charcoal-2">역할</th>
              {useGeneration && <th className="px-4 py-3 font-medium text-charcoal-2">기수</th>}
              <th className="px-4 py-3 font-medium text-charcoal-2">회비</th>
              <th className="px-4 py-3 font-medium text-charcoal-2">가입일</th>
              <th className="px-4 py-3 text-right font-medium text-charcoal-2">상세</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {members.map((member) => {
              const isSelected = selectedIds.has(member.memberId);
              return (
                <tr
                  key={member.memberId}
                  onClick={() => onOpenDetail(member)}
                  className={cn('cursor-pointer hover:bg-cream/60', isSelected && 'bg-cream/60')}
                >
                  {selectable && (
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`${member.name} 선택`}
                        checked={isSelected}
                        onChange={() => onToggleSelect(member.memberId)}
                        className="h-4 w-4 cursor-pointer rounded border-line text-ink focus:ring-sage"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <InitialAvatar name={member.name} />
                      <div className="min-w-0">
                        <p className="font-medium text-ink-deep">{member.name}</p>
                        <p className="text-xs text-charcoal-3">
                          {member.major} · {GRADE_DISPLAY_NAME[member.grade]}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-charcoal-2">{clubMemberRoleLabel(member.role)}</td>
                  {useGeneration && (
                    <td className="px-4 py-3 text-charcoal-2">{generationLabel(member)}</td>
                  )}
                  <td className="px-4 py-3">
                    <FeeBadge status={member.feeStatus} />
                  </td>
                  <td className="px-4 py-3 tabular-nums text-xs text-charcoal-2">
                    {formatDateKst(member.joinedAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      aria-label={`${member.name} 상세`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenDetail(member);
                      }}
                      className="btn btn-ghost btn-sm"
                    >
                      상세
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 모바일·태블릿: 카드 리스트 */}
      <div className="space-y-2.5 lg:hidden">
        {members.map((member) => {
          const isSelected = selectedIds.has(member.memberId);
          return (
            <div
              key={member.memberId}
              onClick={() => onOpenDetail(member)}
              className={cn(
                'card cursor-pointer p-3.5',
                isSelected && 'border-sage bg-cream/60',
              )}
            >
              <div className="flex items-start gap-2.5">
                {selectable && (
                  // 터치 영역 확보(16px → 32px). 카드 전체가 상세를 여는 클릭 대상이라, 체크박스를
                  // 살짝 빗나간 탭이 상세 패널을 연다. 음수 마진으로 차지하는 자리는 그대로 둔다.
                  <label
                    className="-m-2 flex shrink-0 cursor-pointer p-2"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      aria-label={`${member.name} 선택`}
                      checked={isSelected}
                      onChange={() => onToggleSelect(member.memberId)}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line text-ink focus:ring-sage"
                    />
                  </label>
                )}
                <InitialAvatar name={member.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-ink-deep">{member.name}</span>
                    <span className="shrink-0 text-xs text-charcoal-3">
                      {clubMemberRoleLabel(member.role)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-charcoal-3">
                    {member.major} · {GRADE_DISPLAY_NAME[member.grade]}
                  </p>
                  {/* 좁은 폭(≤360px)에서는 한 줄에 다 못 들어간다 — 각 항목은 줄바꿈하지 않고(shrink-0)
                      행이 통째로 접히게 둔다. 안 그러면 '2기'·'납부'·'상세' 가 글자 단위로 세로로 쪼개진다. */}
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 pt-2 text-xs text-charcoal-2">
                    {useGeneration && <span className="shrink-0">{generationLabel(member)}</span>}
                    <FeeBadge status={member.feeStatus} />
                    {/* 가입일과 상세 버튼은 한 덩어리로 접힌다 — 따로 두면 줄이 갈릴 때 버튼만 왼쪽에 남는다. */}
                    <span className="ml-auto flex shrink-0 items-center gap-2">
                      <span className="tabular-nums text-charcoal-3">
                        {formatDateKst(member.joinedAt)}
                      </span>
                      {/* 카드 자체는 포인터 편의용 onClick 일 뿐이라, 키보드·스크린리더가 상세 패널에
                          도달할 유일한 통로로 데스크탑 표와 동일한 상세 버튼을 둔다. */}
                      <button
                        type="button"
                        aria-label={`${member.name} 상세`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenDetail(member);
                        }}
                        className="btn btn-ghost btn-sm -my-1"
                      >
                        상세
                      </button>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
