'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Copy } from 'lucide-react';

import { useSubmissionBatchDetailQuery } from '@duing/hooks';

import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { ConsoleCard } from '../../../../../_components/ConsoleCard';
import { CopyField } from '../../../_components/CopyField';
import { ClubRosterAccordion } from '../../../_components/ClubRosterAccordion';
import { HWP_FIELDS, groupByFacility, toFormBlock, toTabLine } from '../../../_lib/hwpFields';
import { useTranscribeProgress } from '../../../_lib/useTranscribeProgress';

/**
 * HWP 전사 콕핏(항목 1·5) — 총동연 담당자가 승인된 예약을 학교 「시설물 사용 신청서」에 그대로 옮겨 쓰는 화면.
 * 관리 테이블이 아니라 "가장 빠르게 옮겨 쓰는" 업무 화면이라, 한 건만 크게 세로 1열(양식 순서)로 보여주고
 * 필드별 클릭 복사·한 줄/전체 양식 복사·시설별 연속 작성·진행률을 제공한다.
 */
export function TranscribeCockpitPage({ batchId }: { batchId: number }) {
  const detailQuery = useSubmissionBatchDetailQuery(batchId);
  const bookings = useMemo(() => detailQuery.data?.bookings ?? [], [detailQuery.data]);
  const groups = useMemo(() => groupByFacility(bookings), [bookings]);
  const { written, markWritten, toggleWritten } = useTranscribeProgress(batchId);

  const [facIdx, setFacIdx] = useState(0);
  const [cursor, setCursor] = useState(0);

  const group = groups[facIdx];
  const record = group?.items[cursor];
  const totalDone = bookings.filter((booking) => written.has(booking.bookingId)).length;

  // 현재 건을 작성 완료로 표시하고, 같은 시설의 다음 미작성 건으로 자동 이동한다(없으면 그대로 둔다).
  const completeCurrent = () => {
    if (!group || !record) return;
    markWritten(record.bookingId);
    const nextIdx = group.items.findIndex((item, index) => index > cursor && !written.has(item.bookingId));
    if (nextIdx !== -1) setCursor(nextIdx);
  };

  // Enter = 작성완료·다음. 단, 포커스가 상호작용 요소(버튼·링크·입력)에 있으면 그 요소의 기본 동작
  // (엔터=클릭)을 살린다 — 이 화면은 대부분 버튼이라, 무조건 preventDefault 하면 포커스된 버튼
  // (이전/복사 등)의 엔터 활성화가 죽는다. 포커스가 없거나 비상호작용 요소일 때만 단축키가 발동한다.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('button, a, input, textarea, select, [contenteditable="true"], [role="button"]')
      ) {
        return;
      }
      if (!record || written.has(record.bookingId)) return;
      event.preventDefault();
      completeCurrent();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const backHref = toRoute('/admin/facility-bookings?tab=ready');

  return (
    <main className="max-w-layout mx-auto space-y-4 px-4 py-8 sm:px-6 md:px-10">
      <div className="flex items-center gap-2">
        <Link href={backHref} className="btn btn-ghost btn-sm">
          <ArrowLeft size={15} />
          제출 대기로
        </Link>
        <h1 className="font-display text-xl text-ink-deep">제출 정보 보기</h1>
      </div>

      <div className="rounded-md border border-line bg-sage-tint px-4 py-2.5 text-[13px] text-charcoal-2">
        <strong className="text-ink-deep">학교 「시설물 사용 신청서」에 그대로 옮겨 쓰는 화면이에요.</strong>{' '}
        필드는 양식 순서(위→아래)와 같아요. 값을 누르면 복사되고, 작성 진행은 이 브라우저 탭에서만 임시 저장돼요.
      </div>

      {detailQuery.isLoading && <LoadingGate label="제출 목록 불러오는 중" />}

      {detailQuery.isError && (
        <div role="alert" className="rounded-md border border-line bg-paper px-4 py-8 text-sm text-charcoal-2">
          <p>제출 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
          <button type="button" className="btn btn-ghost mt-2" onClick={() => void detailQuery.refetch()}>
            다시 시도
          </button>
        </div>
      )}

      {detailQuery.isSuccess && bookings.length === 0 && (
        <div className="rounded-md border border-line bg-paper px-4 py-8 text-center text-sm text-charcoal-3">
          이 제출 목록에는 옮겨 쓸 예약이 없어요.
        </div>
      )}

      {detailQuery.isSuccess && group && record && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          {/* 좌: 현재 건 — HWP 양식 순서 세로 1열 */}
          <ConsoleCard>
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] font-bold text-charcoal-3">
                  {group.facilityName} · {cursor + 1} / {group.items.length}건
                </p>
                <p className="mt-0.5 flex items-center gap-2 text-[17px] font-extrabold text-ink-deep">
                  <span className="truncate">{record.clubName ?? '—'}</span>
                  {written.has(record.bookingId) ? (
                    <span className="shrink-0 rounded-full bg-sage-mist px-2 py-0.5 text-[11px] font-bold text-ink">
                      작성 완료
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-graysoft px-2 py-0.5 text-[11px] font-bold text-charcoal-3">
                      작성 대기
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(toTabLine(record)).catch(() => undefined)}
                className="btn btn-ghost btn-sm"
                title="양식 순서대로 탭 구분 복사"
              >
                <Copy size={14} />한 줄 복사
              </button>
            </div>

            <div className="flex flex-col gap-2 p-5">
              {HWP_FIELDS.map((field) => (
                <CopyField
                  key={field.key}
                  label={field.label}
                  value={field.get(record)}
                  big={field.key === 'club' || field.key === 'purpose'}
                />
              ))}
              {/* 전체 양식 복사 — 신청서 한 건을 라벨: 값 여러 줄로 통째 복사 */}
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(toFormBlock(record)).catch(() => undefined)}
                className="btn btn-secondary btn-sm mt-1 self-start"
              >
                <Copy size={14} />전체 양식 복사
              </button>

              {/* 동아리원 명단(항목 5) — 기본 접힘, 학교 문서에 명단 붙여넣기용 */}
              <div className="mt-2">
                <ClubRosterAccordion clubId={record.clubId} clubName={record.clubName ?? '동아리'} />
              </div>
            </div>

            <div className="flex items-center gap-2.5 border-t border-line px-5 py-3.5">
              <button
                type="button"
                onClick={() => setCursor((c) => Math.max(0, c - 1))}
                disabled={cursor === 0}
                className="btn btn-ghost btn-sm disabled:opacity-40"
              >
                <ArrowLeft size={14} />이전
              </button>
              <p className="flex-1 text-center text-[12px] text-charcoal-3">
                전체 <span className="font-mono font-bold text-ink-deep">{totalDone}/{bookings.length}</span>건 작성 완료
              </p>
              {written.has(record.bookingId) ? (
                <button
                  type="button"
                  onClick={() => setCursor((c) => Math.min(group.items.length - 1, c + 1))}
                  disabled={cursor >= group.items.length - 1}
                  className="btn btn-secondary btn-sm disabled:opacity-40"
                >
                  다음 건<ArrowRight size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={completeCurrent}
                  className="btn btn-primary btn-sm bg-ink-deep hover:bg-ink"
                >
                  <Check size={15} strokeWidth={3} />작성완료 · 다음
                </button>
              )}
            </div>
          </ConsoleCard>

          {/* 우: 시설 선택 + 현재 시설 건 리스트 + 진행률 */}
          <ConsoleCard>
            <div className="border-b border-line p-3">
              <p className="mb-2 px-1 text-[11.5px] font-bold tracking-wide04 text-charcoal-3">시설 선택</p>
              <div className="flex flex-col gap-1">
                {groups.map((grp, index) => {
                  const doneInGroup = grp.items.filter((item) => written.has(item.bookingId)).length;
                  const allDone = doneInGroup === grp.items.length;
                  const active = index === facIdx;
                  return (
                    <button
                      key={grp.facilityId}
                      type="button"
                      onClick={() => {
                        setFacIdx(index);
                        setCursor(0);
                      }}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink',
                        active ? 'bg-sage-mist' : 'hover:bg-sage-tint',
                      )}
                    >
                      <span
                        className={cn(
                          'grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full font-mono text-[10px] font-extrabold',
                          allDone ? 'bg-ink text-paper' : 'bg-graysoft text-charcoal-3',
                        )}
                      >
                        {allDone ? <Check size={11} strokeWidth={3.5} /> : grp.items.length}
                      </span>
                      <span
                        className={cn(
                          'flex-1 truncate text-[13.5px]',
                          active ? 'font-bold text-ink-deep' : 'font-semibold text-charcoal-2',
                        )}
                      >
                        {grp.facilityName}
                      </span>
                      <span className="font-mono text-[11px] text-charcoal-3">
                        {doneInGroup}/{grp.items.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-2.5">
              <div className="flex items-center justify-between px-1.5 pb-2">
                <span className="text-[12.5px] font-bold text-ink-deep">{group.facilityName}</span>
                <span className="text-[11px] text-charcoal-3">
                  {group.items.filter((item) => written.has(item.bookingId)).length}/{group.items.length}건 작성
                </span>
              </div>
              <div className="mx-1.5 mb-2.5 h-[5px] overflow-hidden rounded-full bg-graysoft">
                <div
                  className="h-full bg-ink motion-safe:transition-[width]"
                  style={{
                    width: `${(group.items.filter((item) => written.has(item.bookingId)).length / group.items.length) * 100}%`,
                  }}
                />
              </div>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item, index) => {
                  const done = written.has(item.bookingId);
                  const active = index === cursor;
                  return (
                    <li key={item.bookingId} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setCursor(index)}
                        className={cn(
                          'flex flex-1 items-center gap-2 rounded-md px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink',
                          active ? 'border border-sage-soft bg-sage-tint' : 'border border-transparent',
                        )}
                      >
                        <span
                          className={cn(
                            'flex-1 truncate text-[12.5px]',
                            done
                              ? 'font-semibold text-charcoal-3 line-through'
                              : active
                                ? 'font-bold text-ink-deep'
                                : 'font-semibold text-ink-deep',
                          )}
                        >
                          {item.clubName ?? '—'}
                        </span>
                        <span className="font-mono text-[10.5px] text-charcoal-3">{item.startTime}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleWritten(item.bookingId)}
                        aria-label={done ? `${item.clubName ?? '건'} 작성 완료 해제` : `${item.clubName ?? '건'} 작성 완료`}
                        className={cn(
                          'grid h-[26px] w-[26px] shrink-0 place-items-center rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-ink',
                          done ? 'border-ink bg-ink text-paper' : 'border-line text-transparent hover:border-sage',
                        )}
                      >
                        <Check size={13} strokeWidth={3.5} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </ConsoleCard>
        </div>
      )}
    </main>
  );
}
