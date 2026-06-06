'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { useClubListQuery, useFavoriteIdsQuery, useFavoriteToggleMutation } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';
import type { ClubDayOfWeek } from '@duing/types';

import { Sparkle, SparkleFull } from '../../_components/Sparkle';
import { COLLEGE_OPTIONS, collegeDisplayName } from '../../_lib/college';
import { toRoute } from '../../_lib/route';
import { ClubCard } from '../_components/ClubCard';
import { summaryToClub } from '../_lib/clubAdapter';
import { DIVISIONS, type Division } from '../_lib/clubs';
import { dayLabel, ORDER as DAY_ORDER } from '../_lib/activeDaysLabel';
import {
  CATEGORY_OPTIONS,
  DEFAULT_EXPLORE_PARAMS,
  RECRUITMENT_LABEL,
  categoryLabel,
  parseExploreParams,
  serializeExploreParams,
  toApiParams,
  type DivisionFilter,
  type ExploreParams,
  type RecruitmentFilter,
  type Scope,
  type SortKey,
} from '../_lib/exploreParams';

const PAGE_SIZE = 20;

const Icon = {
  search: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
  chev: (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  arrowLeft: (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  ),
  arrowRight: (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ),
  check: (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
};

export function ClubExplorePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useMemo<ExploreParams>(
    () => parseExploreParams(new URLSearchParams(searchParams?.toString() ?? '')),
    [searchParams],
  );

  /** 검색 인풋은 입력 중 URL 을 흔들지 않도록 별도 로컬 상태로 둔다 */
  const [keywordDraft, setKeywordDraft] = useState(params.keyword);

  const updateParams = useCallback(
    (patch: Partial<ExploreParams>) => {
      const next: ExploreParams = { ...DEFAULT_EXPLORE_PARAMS, ...params, ...patch };
      const query = serializeExploreParams(next);
      router.replace(toRoute(`/clubs${query ? `?${query}` : ''}`), { scroll: false });
    },
    [params, router],
  );

  const clubListQuery = useClubListQuery(toApiParams(params, PAGE_SIZE));
  const favoriteIdsQuery = useFavoriteIdsQuery();
  const favoriteToggle = useFavoriteToggleMutation();
  const authStatus = useAuthStore((state) => state.status);

  const likedIds = useMemo(() => new Set(favoriteIdsQuery.data ?? []), [favoriteIdsQuery.data]);

  const visibleClubs = useMemo(
    () => (clubListQuery.data?.content ?? []).map(summaryToClub),
    [clubListQuery.data],
  );

  const totalElements = clubListQuery.data?.totalElements ?? 0;
  const totalPages = clubListQuery.data?.totalPages ?? 0;

  const handleToggleLike = (clubId: number) => {
    if (authStatus !== 'authenticated') {
      const next = encodeURIComponent('/clubs');
      router.push(toRoute(`/login?next=${next}`));
      return;
    }
    favoriteToggle.mutate({ clubId, isFavorited: likedIds.has(clubId) });
  };

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    updateParams({ keyword: keywordDraft.trim(), page: 1 });
  };

  const handleScopeChange = (scope: Scope) => {
    updateParams({ scope, division: '전체', college: null, page: 1 });
  };

  const handleDivisionChange = (division: DivisionFilter) => {
    updateParams({ division, page: 1 });
  };

  const handleRecruitmentSelect = (value: RecruitmentFilter) => {
    updateParams({
      recruitment: params.recruitment === value ? 'all' : value,
      page: 1,
    });
  };

  const handleResetFilters = () => {
    setKeywordDraft('');
    updateParams({ ...DEFAULT_EXPLORE_PARAMS });
  };

  const handleToggleActiveDay = (day: ClubDayOfWeek) => {
    const current = params.activeDays;
    const next = current.includes(day)
      ? current.filter((value) => value !== day)
      : [...current, day];
    updateParams({ activeDays: next, page: 1 });
  };

  return (
    <div>
      <section className="border-b border-line bg-cream px-10 pt-11 pb-7">
        <div className="max-w-layout mx-auto">
          <div className="flex items-end justify-between mb-7">
            <div>
              <div className="text-[13px] font-semibold text-ink tracking-wide08 mb-2.5">
                EXPLORE · 동아리 탐색
              </div>
              <h1 className="text-[48px] mb-3">
                {totalElements > 0 ? `${totalElements}개 동아리를 둘러보세요` : '동아리를 둘러보세요'}
                <SparkleFull
                  size={28}
                  color="#9DB6A0"
                  className="inline-block ml-2.5 align-middle"
                />
              </h1>
              <p className="text-[15px] text-charcoal-2">
                관심사·요일·인원 규모로 필터링할 수 있어요.
              </p>
            </div>

            <form
              onSubmit={handleSearchSubmit}
              className="flex items-center gap-2 p-1 w-[360px] bg-paper rounded-[14px] border border-line"
            >
              <div className="flex-1 flex items-center gap-2.5 px-3.5 py-2.5">
                <Icon.search className="text-charcoal-3 w-[18px] h-[18px]" />
                <input
                  value={keywordDraft}
                  onChange={(event) => setKeywordDraft(event.target.value)}
                  placeholder="동아리 이름·소개 검색"
                  className="flex-1 border-none outline-none text-sm bg-transparent"
                  style={{ fontFamily: 'inherit' }}
                />
              </div>
              <button type="submit" className="btn btn-primary btn-sm">검색</button>
            </form>
          </div>

          <div className="flex gap-1.5 mb-4">
            {(
              [
                { key: '전체', hint: '모든 동아리' },
                { key: '중앙', hint: '학생자치회 5개 분과' },
                { key: '학과', hint: '학과 · 단과대 산하' },
              ] as const
            ).map((segment) => {
              const on = segment.key === params.scope;
              return (
                <button
                  key={segment.key}
                  type="button"
                  onClick={() => handleScopeChange(segment.key)}
                  className={`inline-flex items-center gap-2.5 px-[18px] py-2.5 rounded-[12px] text-sm font-bold border-[1.5px] ${on ? 'bg-ink text-white border-ink' : 'bg-paper text-charcoal-2 border-line'}`}
                >
                  {segment.key === '전체' ? '전체' : segment.key === '중앙' ? '중앙동아리' : '학과동아리'}
                  {on && (
                    <span className="text-[11px] text-sage font-medium tracking-wide04">
                      · {segment.hint}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {params.scope === '중앙' ? (
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-[11.5px] font-bold text-charcoal-3 tracking-wide08 mr-1">분과</span>
              {(['전체', ...DIVISIONS] as DivisionFilter[]).map((option) => {
                const on = option === params.division;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => handleDivisionChange(option)}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13.5px] font-semibold border ${on ? 'bg-sage-mist text-ink-deep border-ink-deep' : 'bg-paper text-charcoal-2 border-line'}`}
                  >
                    {option}{option !== '전체' && '분과'}
                    {on && <Sparkle size={11} color="#143025" />}
                  </button>
                );
              })}
            </div>
          ) : params.scope === '학과' ? (
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-[11.5px] font-bold text-charcoal-3 tracking-wide08 mr-1">단과대학</span>
              {COLLEGE_OPTIONS.map((option) => {
                const on = option.code === params.college;
                return (
                  <button
                    key={option.code}
                    type="button"
                    onClick={() =>
                      updateParams({ college: on ? null : option.code, page: 1 })
                    }
                    className={`px-4 py-2 rounded-full text-[13.5px] font-semibold border ${on ? 'bg-sage-mist text-ink-deep border-ink-deep' : 'bg-paper text-charcoal-2 border-line'}`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>

      <section className="px-10 pt-8 pb-20">
        <div className="max-w-layout mx-auto grid grid-cols-[256px_1fr] gap-8">
          <aside>
            <div className="sticky top-6 bg-paper rounded-[18px] border border-line px-[22px] py-5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-base font-body text-ink-deep">필터</h3>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-xs font-semibold text-charcoal-3 hover:text-ink"
                >
                  초기화
                </button>
              </div>

              <FilterGroup title="카테고리">
                {CATEGORY_OPTIONS.map((option) => (
                  <FilterRow
                    key={option.value}
                    label={option.label}
                    checked={params.category === option.value}
                    onChange={() =>
                      updateParams({
                        category: params.category === option.value ? null : option.value,
                        page: 1,
                      })
                    }
                  />
                ))}
              </FilterGroup>

              <FilterGroup title="모집 상태">
                {(['available', 'upcoming', 'closed'] as const).map((value) => (
                  <FilterRow
                    key={value}
                    label={RECRUITMENT_LABEL[value]}
                    checked={params.recruitment === value}
                    onChange={() => handleRecruitmentSelect(value)}
                  />
                ))}
              </FilterGroup>

              <FilterGroup title="활동 요일">
                <div className="flex gap-1 flex-wrap">
                  {DAY_ORDER.map((day) => {
                    const on = params.activeDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => handleToggleActiveDay(day)}
                        className={`w-[30px] h-[30px] rounded-full text-[13px] font-semibold border ${on ? 'bg-ink text-white border-ink' : 'bg-paper text-charcoal-2 border-line'}`}
                      >
                        {dayLabel(day)}
                      </button>
                    );
                  })}
                </div>
              </FilterGroup>

              <FilterGroup title={params.scope === '중앙' ? '분과' : '단과대학'} last>
                {params.scope === '중앙'
                  ? DIVISIONS.map((d) => (
                      <FilterRow
                        key={d}
                        label={`${d}분과`}
                        checked={params.division === d}
                        onChange={() =>
                          handleDivisionChange(params.division === d ? '전체' : (d as Division))
                        }
                      />
                    ))
                  : COLLEGE_OPTIONS.map((option) => (
                      <FilterRow
                        key={option.code}
                        label={option.label}
                        checked={params.college === option.code}
                        onChange={() =>
                          updateParams({
                            college: params.college === option.code ? null : option.code,
                            page: 1,
                          })
                        }
                      />
                    ))}
              </FilterGroup>
            </div>
          </aside>

          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="text-sm text-charcoal-2">
                <span className="font-bold text-ink">{visibleClubs.length}개</span>{' '}
                <span className="text-charcoal-3">
                  · 현재 페이지 (전체 {totalElements}개)
                </span>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={params.sort}
                  onChange={(event) =>
                    updateParams({ sort: event.target.value as SortKey, page: 1 })
                  }
                  className="px-3.5 py-2 bg-paper rounded-[10px] border border-line text-[13.5px] font-semibold text-charcoal-2"
                >
                  <option value="RECENT">최근 등록순</option>
                  <option value="DEADLINE_SOON">마감 임박순</option>
                  <option value="ALPHABETICAL">가나다순</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 mb-6 flex-wrap min-h-[28px]">
              {(params.scope !== '전체' ||
                params.division !== '전체' ||
                params.keyword !== '' ||
                params.recruitment !== 'all' ||
                params.college !== null ||
                params.category !== null ||
                (params.activeDays.length > 0 && params.activeDays.length < DAY_ORDER.length)) && (
                <span className="text-[13px] text-charcoal-3 pt-1.5">필터:</span>
              )}
              {params.scope !== '전체' && (
                <ActiveFilterChip
                  label={params.scope === '중앙' ? '중앙동아리' : '학과동아리'}
                  variant="primary"
                  onRemove={() => handleScopeChange('전체')}
                />
              )}
              {params.scope === '중앙' && params.division !== '전체' && (
                <ActiveFilterChip
                  label={`${params.division}분과`}
                  variant="primary"
                  onRemove={() => handleDivisionChange('전체')}
                />
              )}
              {params.college && (
                <ActiveFilterChip
                  label={collegeDisplayName(params.college)}
                  variant="primary"
                  onRemove={() => updateParams({ college: null, page: 1 })}
                />
              )}
              {params.category && (
                <ActiveFilterChip
                  label={categoryLabel(params.category)}
                  variant="primary"
                  onRemove={() => updateParams({ category: null, page: 1 })}
                />
              )}
              {params.keyword && (
                <ActiveFilterChip
                  label={`"${params.keyword}"`}
                  variant="primary"
                  onRemove={() => {
                    setKeywordDraft('');
                    updateParams({ keyword: '', page: 1 });
                  }}
                />
              )}
              {params.activeDays.length > 0 && params.activeDays.length < DAY_ORDER.length && (
                <ActiveFilterChip
                  label={`요일: ${[...params.activeDays].sort((left, right) => DAY_ORDER.indexOf(left) - DAY_ORDER.indexOf(right)).map(dayLabel).join('·')}`}
                  variant="soft"
                  onRemove={() => updateParams({ activeDays: [], page: 1 })}
                />
              )}
              {params.recruitment !== 'all' && (
                <ActiveFilterChip
                  label={RECRUITMENT_LABEL[params.recruitment]}
                  variant="soft"
                  onRemove={() => updateParams({ recruitment: 'all', page: 1 })}
                />
              )}
            </div>

            {clubListQuery.isLoading && (
              <p className="text-sm text-charcoal-2">불러오는 중…</p>
            )}
            {clubListQuery.error && (
              <p className="text-sm text-coral">
                {clubListQuery.error instanceof Error
                  ? clubListQuery.error.message
                  : '오류가 발생했습니다.'}
              </p>
            )}
            {clubListQuery.data && visibleClubs.length === 0 && (
              <p className="text-sm text-charcoal-2">조건에 맞는 동아리가 없어요.</p>
            )}

            {visibleClubs.length > 0 && (
              <div className="grid grid-cols-4 gap-[18px]">
                {visibleClubs.map((club) => (
                  <ClubCard
                    key={club.id}
                    club={club}
                    liked={likedIds.has(club.id)}
                    isLikeBusy={
                      favoriteToggle.isPending && favoriteToggle.variables?.clubId === club.id
                    }
                    onLikeToggle={handleToggleLike}
                  />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <Pagination
                page={params.page}
                totalPages={totalPages}
                onPage={(page) => updateParams({ page })}
              />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

type FilterGroupProps = {
  title: string;
  last?: boolean;
  children: React.ReactNode;
};

function FilterGroup({ title, last, children }: FilterGroupProps) {
  return (
    <div className={`pt-[18px] ${last ? '' : 'pb-[18px] border-b border-line'}`}>
      <div className="text-[12.5px] font-bold text-charcoal-2 tracking-wide04 mb-3">{title}</div>
      {children}
    </div>
  );
}

type FilterRowProps = {
  label: string;
  checked: boolean;
  onChange?: () => void;
  disabled?: boolean;
};

function FilterRow({ label, checked, onChange, disabled = false }: FilterRowProps) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled || !onChange}
      className="flex w-full items-center gap-2.5 py-[5px] text-[13.5px] text-charcoal cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        className={`w-4 h-4 rounded-[5px] grid place-items-center shrink-0 border-[1.5px] ${checked ? 'bg-ink border-ink' : 'bg-transparent border-line'}`}
      >
        {checked && <Icon.check className="w-[11px] h-[11px] text-white" />}
      </span>
      <span className={`flex-1 text-left ${checked ? 'font-semibold' : 'font-medium'}`}>
        {label}
      </span>
    </button>
  );
}

type ActiveFilterChipProps = {
  label: string;
  variant: 'primary' | 'soft';
  onRemove: () => void;
};

function ActiveFilterChip({ label, variant, onRemove }: ActiveFilterChipProps) {
  const chipClass =
    variant === 'primary' ? 'bg-ink text-white' : 'bg-sage-mist text-ink-deep';
  const closeClass =
    variant === 'primary' ? 'bg-white/[0.18]' : 'bg-ink-deep/10';
  return (
    <span
      className={`inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full text-[13px] font-semibold ${chipClass}`}
    >
      {label}
      <button
        type="button"
        aria-label={`${label} 필터 제거`}
        onClick={onRemove}
        className={`w-[18px] h-[18px] rounded-full border-none grid place-items-center text-xs ${closeClass}`}
      >
        ×
      </button>
    </span>
  );
}

type PaginationProps = {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
};

function Pagination({ page, totalPages, onPage }: PaginationProps) {
  const pages = buildPageList(page, totalPages);
  return (
    <div className="flex justify-center items-center gap-1 mt-12">
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        className="btn btn-ghost btn-sm disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icon.arrowLeft />
      </button>
      {pages.map((entry, index) =>
        entry === 'ellipsis' ? (
          <span key={`e-${index}`} className="w-9 h-9 grid place-items-center text-charcoal-3">
            …
          </span>
        ) : (
          <button
            key={entry}
            type="button"
            onClick={() => onPage(entry)}
            className={`w-9 h-9 rounded-[10px] text-[13.5px] font-semibold ${entry === page ? 'bg-ink text-white' : 'bg-transparent text-charcoal-2 hover:bg-graysoft'}`}
          >
            {entry}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages}
        className="btn btn-ghost btn-sm disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icon.arrowRight />
      </button>
    </div>
  );
}

function buildPageList(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const pages: Array<number | 'ellipsis'> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push('ellipsis');
  for (let i = start; i <= end; i += 1) pages.push(i);
  if (end < total - 1) pages.push('ellipsis');
  pages.push(total);
  return pages;
}
