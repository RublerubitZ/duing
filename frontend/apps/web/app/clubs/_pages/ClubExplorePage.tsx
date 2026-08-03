'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';

import { ApiError } from '@duing/api';
import { useClubListQuery, useFavoriteIdsQuery, useFavoriteToggleMutation } from '@duing/hooks';
import { useBoundedAuthStatus } from '@/app/_lib/useBoundedAuthStatus';
import type { ClubDayOfWeek } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Sparkle, SparkleFull } from '../../_components/Sparkle';
import { COLLEGE_OPTIONS, collegeDisplayName } from '../../_lib/college';
import { toRoute } from '../../_lib/route';
import { ClubCard } from '../_components/ClubCard';
import { ClubListSkeletonItems } from '../_components/ClubExploreSkeleton';
import { ClubListItem } from '../_components/ClubListItem';
import { summaryToClub } from '../_lib/clubAdapter';
import { DIVISIONS, type Division } from '../_lib/clubs';
import { dayLabel, ORDER as DAY_ORDER } from '../_lib/activeDaysLabel';
import {
  CATEGORY_OPTIONS,
  DEFAULT_EXPLORE_PARAMS,
  RECRUITMENT_LABEL,
  categoryLabel,
  hasNonFavoriteFilters,
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
  sliders: (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="7" y1="12" x2="17" y2="12" />
      <line x1="10" y1="17" x2="14" y2="17" />
    </svg>
  ),
  heart: (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
};

export function ClubExplorePage() {
  const router = useGuardedRouter();
  const searchParams = useSearchParams();
  const params = useMemo<ExploreParams>(
    () => parseExploreParams(new URLSearchParams(searchParams?.toString() ?? '')),
    [searchParams],
  );

  /** 검색 인풋은 입력 중 URL 을 흔들지 않도록 별도 로컬 상태로 둔다 */
  const [keywordDraft, setKeywordDraft] = useState(params.keyword);
  /** 모바일 필터 바텀시트 — "동아리 N곳 보기"로 닫기 위해 제어 상태로 둔다 */
  const [filterOpen, setFilterOpen] = useState(false);

  const updateParams = useCallback(
    (patch: Partial<ExploreParams>) => {
      const next: ExploreParams = { ...DEFAULT_EXPLORE_PARAMS, ...params, ...patch };
      const query = serializeExploreParams(next);
      router.replace(toRoute(`/clubs${query ? `?${query}` : ''}`), { scroll: false });
    },
    [params, router],
  );

  // 확인이 끝나지 않는 장애에서 찜 필터 화면이 영영 스켈레톤에 갇히지 않도록 상한을 둔 status 를 쓴다
  // (그 화면의 로그인 유도가 유일한 복구 수단이다).
  const authStatus = useBoundedAuthStatus();
  /** 찜 필터 + 비인증(idle 포함) — 목록 쿼리를 보내지 않는다. 비로그인 401 은 전역 리프레시
      플로우를 깨우므로 요청 차단이 1차 방어다(스펙 §비로그인 처리). */
  const requiresLoginForFavorite = params.favorite && authStatus !== 'authenticated';
  /** 찜 목록은 인증 확정 후에만 조회된다 — 확인 중에는 모든 카드가 "찜 안 함" 으로 보여, 누르면
      해제 대신 추가가 나가고 이미 찜한 동아리는 409 로 조용히 실패한다. 방향을 모르는 동안은
      하트를 비활성으로 두어 잘못된 방향으로 나가지 않게 한다. */
  const isAuthPending = authStatus === 'idle';
  const clubListQuery = useClubListQuery(toApiParams(params, PAGE_SIZE), {
    enabled: !requiresLoginForFavorite,
  });
  const favoriteIdsQuery = useFavoriteIdsQuery();
  const favoriteToggle = useFavoriteToggleMutation();

  const likedIds = useMemo(() => new Set(favoriteIdsQuery.data ?? []), [favoriteIdsQuery.data]);

  const visibleClubs = useMemo(() => {
    const clubs = (clubListQuery.data?.content ?? []).map(summaryToClub);
    // 찜 필터 중엔 낙관적 ids 캐시와 교차해 찜 해제 카드를 재요청 없이 즉시 제거한다.
    // ids 미로딩(undefined) 동안은 교차하지 않는다 — 빈 Set 교차는 전체를 지워 화면이 번쩍인다.
    if (!params.favorite || favoriteIdsQuery.data === undefined) return clubs;
    return clubs.filter((clubItem) => likedIds.has(clubItem.id));
  }, [clubListQuery.data, params.favorite, favoriteIdsQuery.data, likedIds]);

  // 마지막 페이지에서 찜 해제 등으로 총 페이지가 줄면 범위 밖 page 를 마지막 유효 페이지로 보정한다.
  // placeholder(이전 필터의 stale totalPages)로는 보정하지 않는다. totalPages 0(결과 없음)은
  // 빈 상태 렌더에 맡긴다.
  useEffect(() => {
    if (!clubListQuery.data || clubListQuery.isPlaceholderData) return;
    const knownTotalPages = clubListQuery.data.totalPages;
    if (knownTotalPages > 0 && params.page > knownTotalPages) {
      updateParams({ page: knownTotalPages });
    }
  }, [clubListQuery.data, clubListQuery.isPlaceholderData, params.page, updateParams]);

  const totalElements = clubListQuery.data?.totalElements ?? 0;
  const totalPages = clubListQuery.data?.totalPages ?? 0;
  const recruitingCount = visibleClubs.filter((club) => {
    const status = club.activeRecruitment?.displayStatus;
    return status === 'OPEN' || status === 'ALWAYS_OPEN';
  }).length;
  const activeFilterCount =
    (params.favorite ? 1 : 0) +
    (params.recruitment !== 'all' ? 1 : 0) +
    (params.scope !== '전체' ? 1 : 0) +
    (params.division !== '전체' ? 1 : 0) +
    (params.college !== null ? 1 : 0) +
    params.activeDays.length;
  /** 데스크탑 활성 필터 칩 행 노출 여부 — 비면 행 자체를 안 그려 카드가 위에서 시작한다.
      activeFilterCount(모바일 배지)와 다른 이유: ① keyword·category 를 배지는 안 세지만
      칩으로는 그린다 ② 분과 칩은 중앙 스코프에서만 그려지므로 scope 조건이 겸한다(별도
      division 조건을 두면 수동 URL ?division=… 에서 칩 없는 "필터:" 고아 행이 생긴다)
      ③ 요일은 전체 선택 시 칩을 안 그린다 ④ 찜은 배지엔 세지만(모바일에선 바텀시트 안에만
      있어 배지가 유일한 상태 표시) 칩으로는 안 그린다 — 데스크탑은 찜 토글 칩이 상시
      노출되어 그 자체가 상태 표시다. */
  const hasActiveFilterChips =
    params.scope !== '전체' ||
    params.keyword !== '' ||
    params.recruitment !== 'all' ||
    params.college !== null ||
    params.category !== null ||
    (params.activeDays.length > 0 && params.activeDays.length < DAY_ORDER.length);

  const handleToggleLike = (clubId: number) => {
    // 현재 탐색 상태(필터·페이지·검색어)가 쿼리스트링에 있으므로 그대로 next 에 실어 복귀시킨다.
    const currentUrl = window.location.pathname + window.location.search;
    const loginPath = toRoute(`/login?next=${encodeURIComponent(currentUrl)}`);
    if (authStatus === 'unauthenticated') {
      router.push(loginPath);
      return;
    }
    // 세션 확인 중(idle)이면 미인증으로 단정하지 않고 요청한다 — 401 로 돌아왔을 때 로그인으로 보낸다.
    favoriteToggle.mutate(
      { clubId, isFavorited: likedIds.has(clubId) },
      {
        onError: (toggleError) => {
          if (toggleError instanceof ApiError && toggleError.status === 401) {
            router.push(loginPath);
            return;
          }
          console.error('찜 토글 실패:', toggleError);
        },
      },
    );
  };

  /** 로그인 후 찜 필터가 켜진 채 돌아오도록 next 에 favorite=true 를 얹는다. */
  const favoriteLoginHref = useMemo(() => {
    const query = serializeExploreParams({ ...params, favorite: true });
    return toRoute(`/login?next=${encodeURIComponent(`/clubs?${query}`)}`);
  }, [params]);

  const handleFavoriteFilterToggle = () => {
    // 확인 중(idle)에는 로그인으로 보내지 않고 필터만 켠다 — 렌더 쪽이 이미 idle 을 스켈레톤으로
    // 처리하므로, 확정된 뒤 목록(로그인)이나 로그인 안내(미인증)로 자연스럽게 이어진다.
    if (!params.favorite && authStatus === 'unauthenticated') {
      router.push(favoriteLoginHref);
      return;
    }
    updateParams({ favorite: !params.favorite, page: 1 });
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

  const handleSortChange = (value: string) => {
    if (value === 'RECENT' || value === 'DEADLINE_SOON' || value === 'ALPHABETICAL') {
      updateParams({ sort: value, page: 1 });
    }
  };

  return (
    <div>
      {/* ─── 데스크탑 (md+) — 기존 카드형 레이아웃(원본 유지) ─── */}
      <div className="hidden md:block">
      <section className="bg-cream px-4 sm:px-6 md:px-10 pt-page-top pb-7">
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
              className="flex items-center gap-2 p-1 w-[360px] bg-paper rounded-[14px] border border-line focus-within:border-ink"
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
                { key: '중앙', hint: '5개 분과' },
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

      <section className="px-4 sm:px-6 md:px-10 pt-6 pb-20">
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
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-charcoal-2">
                <span className="font-bold text-ink">{visibleClubs.length}개</span>{' '}
                <span className="text-charcoal-3">
                  · 현재 페이지 (전체 {totalElements}개)
                </span>
              </div>
              <div className="flex items-center gap-3">
                <FavoriteFilterChip on={params.favorite} onClick={handleFavoriteFilterToggle} />
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

            {/* 활성 필터가 없으면 행 자체를 렌더하지 않는다 — 빈 공간 예약(min-h) 대신
                카운트 행과 카드 그리드가 한 섹션처럼 붙어 카드가 첫 화면 위쪽에서 시작한다. */}
            {hasActiveFilterChips && (
              <div className="flex gap-2 mb-4 flex-wrap">
                <span className="text-[13px] text-charcoal-3 pt-1.5">필터:</span>
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
            )}

            {requiresLoginForFavorite ? (
              authStatus === 'idle' ? (
                <div role="status" aria-busy="true" aria-label="동아리 목록 불러오는 중" className="animate-pulse motion-reduce:animate-none">
                  <ClubListSkeletonItems variant="grid" />
                </div>
              ) : (
                <FavoriteLoginPrompt loginHref={favoriteLoginHref} />
              )
            ) : (
              <>
                {clubListQuery.isLoading && (
                  <div role="status" aria-busy="true" aria-label="동아리 목록 불러오는 중" className="animate-pulse motion-reduce:animate-none">
                    <ClubListSkeletonItems variant="grid" />
                  </div>
                )}
                {clubListQuery.error && (
                  <p className="text-sm text-coral">
                    {clubListQuery.error instanceof Error
                      ? clubListQuery.error.message
                      : '오류가 발생했습니다.'}
                  </p>
                )}
                {clubListQuery.data && visibleClubs.length === 0 && (
                  params.favorite && !hasNonFavoriteFilters(params) ? (
                    <FavoriteEmptyState onBrowse={() => updateParams({ favorite: false, page: 1 })} />
                  ) : (
                    <p className="text-sm text-charcoal-2">조건에 맞는 동아리가 없어요.</p>
                  )
                )}

                {visibleClubs.length > 0 && (
                  /* auto-fill+minmax — 카드 최소 210px 를 보장하고(1280 레이아웃 4열 유지) 컨테이너 폭에 따라 4→3→2→1열로
                     열 수만 줄인다(카드 축소 금지). 사이드바가 있어 뷰포트 브레이크포인트 대신
                     컨테이너 폭 기준이 정확하다. auto-fit 이 아닌 auto-fill: 결과가 적을 때도
                     카드가 트랙 폭 이상으로 늘어나지 않아 비율이 유지된다. */
                  <div
                    // keepPreviousData 전환 중(스코프·필터 변경)에는 이전 카드가 남으므로 딤으로 갱신 중 신호를 준다.
                    aria-busy={clubListQuery.isPlaceholderData}
                    className={cn(
                      'grid grid-cols-[repeat(auto-fill,minmax(min(210px,100%),1fr))] gap-[18px]',
                      clubListQuery.isPlaceholderData && 'opacity-60 transition-opacity',
                    )}
                  >
                    {visibleClubs.map((club) => (
                      <ClubCard
                        key={club.id}
                        club={club}
                        liked={likedIds.has(club.id)}
                        isLikeBusy={
                          isAuthPending ||
                          (favoriteToggle.isPending && favoriteToggle.variables?.clubId === club.id)
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
              </>
            )}
          </div>
        </div>
      </section>
      </div>

      {/* ─── 모바일 (<md) — 단일 컬럼 리스트 + 바텀시트 필터 ─── */}
      <div className="md:hidden">
        <section className="bg-cream px-4 pt-page-top pb-4">
          <div className="text-[11px] font-bold tracking-wide08 text-ink">EXPLORE</div>
          <h1 className="mt-1 text-[27px] tracking-tightx">동아리 탐색</h1>
        </section>

        {/* 검색은 목록을 훑는 내내 닿을 수 있어야 해 상단에 고정한다(홈의 검색 바와 동일한 래퍼).
            sticky 라 자기 자리를 차지하므로 아래 콘텐츠에 별도 패딩 보정이 필요 없고,
            스크롤포트 기준이라 노치와도 겹치지 않는다. 하단 헤어라인은 반투명 배경이
            페이지와 거의 같은 색이라 카드가 바 뒤로 지날 때의 유일한 경계다. */}
        <div className="sticky top-0 z-40 border-b border-line bg-cream/95 px-4 py-2.5 backdrop-blur">
          <form
            onSubmit={handleSearchSubmit}
            className="flex items-center gap-2.5 rounded-[14px] border border-line bg-paper px-4 py-3 shadow-1 focus-within:border-ink"
          >
            <Icon.search className="h-[18px] w-[18px] text-charcoal-3" />
            <input
              value={keywordDraft}
              onChange={(event) => setKeywordDraft(event.target.value)}
              placeholder="동아리 이름 · 관심사 검색"
              className="min-w-0 flex-1 border-none bg-transparent text-sm outline-none"
              style={{ fontFamily: 'inherit' }}
            />
          </form>
        </div>

        {/* overscroll-x-contain: 카테고리가 짧아 레일이 금세 스크롤 끝에 닿는데(390px 폭에서 20px 안팎,
            좁을수록 늘어남), 문서에 가로 스크롤이 없어 그 오버스크롤이 상위로 전파된다. iOS 에서는
            viewport rubber-band 나 edge-swipe 탐색 제스처로 이어질 수 있어 레일 안에서 끊는다.
            세로축은 auto 로 둔다 — 레일 위에서 시작한 세로 드래그는 페이지가 받아야 한다. */}
        <nav className="flex gap-5 overflow-x-auto overscroll-x-contain bg-cream px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[{ value: null, label: '전체' }, ...CATEGORY_OPTIONS].map((option) => {
            const on = params.category === option.value;
            return (
              <button
                key={option.label}
                type="button"
                onClick={() => updateParams({ category: option.value, page: 1 })}
                className={cn(
                  'shrink-0 whitespace-nowrap border-b-[2.5px] py-2.5 text-[14px] font-semibold transition-colors',
                  on ? 'border-ink text-ink' : 'border-transparent text-charcoal-3',
                )}
              >
                {option.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center justify-between px-4 pb-3 pt-4">
          <div className="text-[13.5px] text-charcoal-2">
            지금 <span className="font-bold text-ink">{recruitingCount}곳</span> 모집 중
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink bg-ink px-3 py-1.5 text-[12.5px] font-bold text-white"
            >
              <Icon.sliders className="h-[15px] w-[15px]" />
              필터
              {activeFilterCount > 0 && (
                <span className="grid h-4 min-w-4 place-items-center rounded-full bg-sage px-1 font-mono text-[10px] font-extrabold text-ink-deep">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <div className="relative inline-flex items-center">
              <select
                value={params.sort}
                onChange={(event) => handleSortChange(event.target.value)}
                className="appearance-none bg-transparent pr-4 text-[12.5px] font-semibold text-charcoal-2"
              >
                <option value="RECENT">최근순</option>
                <option value="DEADLINE_SOON">마감순</option>
                <option value="ALPHABETICAL">가나다순</option>
              </select>
              <Icon.chev className="pointer-events-none absolute right-0 h-[15px] w-[15px] text-charcoal-2" />
            </div>
          </div>
        </div>

        <div className="px-4 pb-8">
          {requiresLoginForFavorite ? (
            authStatus === 'idle' ? (
              <div role="status" aria-busy="true" aria-label="동아리 목록 불러오는 중" className="animate-pulse motion-reduce:animate-none">
                <ClubListSkeletonItems variant="list" />
              </div>
            ) : (
              <FavoriteLoginPrompt loginHref={favoriteLoginHref} />
            )
          ) : (
            <>
              {clubListQuery.isLoading && (
                <div role="status" aria-busy="true" aria-label="동아리 목록 불러오는 중" className="animate-pulse motion-reduce:animate-none">
                  <ClubListSkeletonItems variant="list" />
                </div>
              )}
              {clubListQuery.error && <p className="text-sm text-coral">오류가 발생했습니다.</p>}
              {clubListQuery.data && visibleClubs.length === 0 && (
                params.favorite && !hasNonFavoriteFilters(params) ? (
                  <FavoriteEmptyState onBrowse={() => updateParams({ favorite: false, page: 1 })} />
                ) : (
                  <p className="text-sm text-charcoal-2">조건에 맞는 동아리가 없어요.</p>
                )
              )}
              {visibleClubs.length > 0 && (
                <div
                  aria-busy={clubListQuery.isPlaceholderData}
                  className={cn(
                    'flex flex-col gap-3',
                    clubListQuery.isPlaceholderData && 'opacity-60 transition-opacity',
                  )}
                >
                  {visibleClubs.map((club, index) => (
                    <ClubListItem
                      key={club.id}
                      club={club}
                      recommended={index === 0 && params.page === 1}
                      liked={likedIds.has(club.id)}
                      isLikeBusy={
                        isAuthPending ||
                        (favoriteToggle.isPending && favoriteToggle.variables?.clubId === club.id)
                      }
                      onLikeToggle={handleToggleLike}
                    />
                  ))}
                </div>
              )}
              {totalPages > 1 && (
                <div className="mt-5">
                  <Pagination
                    page={params.page}
                    totalPages={totalPages}
                    onPage={(page) => updateParams({ page })}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 모바일 필터 바텀시트 */}
      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent
          side="bottom"
          hideClose
          aria-describedby={undefined}
          className="flex max-h-[88%] flex-col overflow-hidden rounded-t-[26px] bg-cream px-0 pb-0"
        >
          <SheetTitle className="sr-only">필터</SheetTitle>
          <div className="shrink-0 px-5 pb-3 pt-2.5">
            <div className="mx-auto mb-3.5 h-[4.5px] w-10 rounded-full bg-line" />
            <div className="flex items-center justify-between">
              <h2 className="text-[21px] tracking-tightx">필터</h2>
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-[13px] font-semibold text-charcoal-3 hover:text-ink"
              >
                초기화
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5">
            <MFilterGroup title="찜">
              <FavoriteFilterChip on={params.favorite} onClick={handleFavoriteFilterToggle} />
            </MFilterGroup>

            <MFilterGroup title="모집 상태">
              {(['available', 'upcoming', 'closed'] as const).map((value) => (
                <FilterChip
                  key={value}
                  label={RECRUITMENT_LABEL[value]}
                  on={params.recruitment === value}
                  onClick={() => handleRecruitmentSelect(value)}
                />
              ))}
            </MFilterGroup>

            <MFilterGroup title="소속">
              {(['전체', '중앙', '학과'] as const).map((segment) => (
                <FilterChip
                  key={segment}
                  label={segment === '전체' ? '전체' : segment === '중앙' ? '중앙동아리' : '과동아리'}
                  on={params.scope === segment}
                  onClick={() => handleScopeChange(segment)}
                />
              ))}
            </MFilterGroup>

            <MFilterGroup title={params.scope === '중앙' ? '분과' : '단과대학'}>
              {params.scope === '중앙'
                ? DIVISIONS.map((division) => (
                    <FilterChip
                      key={division}
                      label={`${division}분과`}
                      on={params.division === division}
                      onClick={() =>
                        handleDivisionChange(params.division === division ? '전체' : division)
                      }
                    />
                  ))
                : COLLEGE_OPTIONS.map((option) => (
                    <FilterChip
                      key={option.code}
                      label={option.label}
                      on={params.college === option.code}
                      onClick={() =>
                        updateParams({
                          college: params.college === option.code ? null : option.code,
                          page: 1,
                        })
                      }
                    />
                  ))}
            </MFilterGroup>

            <div className="py-[18px]">
              <div className="mb-3 text-[13px] font-bold text-ink-deep">활동 요일</div>
              <div className="flex gap-1.5">
                {DAY_ORDER.map((day) => {
                  const on = params.activeDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => handleToggleActiveDay(day)}
                      className={cn(
                        'grid aspect-square flex-1 place-items-center rounded-full border-[1.5px] text-[13px] font-bold',
                        on ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-charcoal-2',
                      )}
                    >
                      {dayLabel(day)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div
            data-bottom-bar
            className="flex shrink-0 gap-2.5 border-t border-line px-5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] pt-3.5"
          >
            <button
              type="button"
              onClick={handleResetFilters}
              className="btn btn-secondary rounded-[14px] px-5"
            >
              초기화
            </button>
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              className="btn btn-primary flex-1 justify-center rounded-[14px] py-3.5 text-[15px]"
            >
              동아리 {totalElements}곳 보기
              <Icon.arrowRight className="h-4 w-4" />
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// 모바일 바텀시트 — 칩 기반 필터 그룹/칩
function MFilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line py-[18px]">
      <div className="mb-3 text-[13px] font-bold text-ink-deep">{title}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function FavoriteFilterChip({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-semibold transition-colors',
        on ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-charcoal-2',
      )}
    >
      <Icon.heart className={cn('h-3.5 w-3.5', on && 'text-coral')} />
      찜한 동아리
    </button>
  );
}

function FavoriteLoginPrompt({ loginHref }: { loginHref: ReturnType<typeof toRoute> }) {
  return (
    <div className="py-24 text-center">
      <p className="text-[14px] font-semibold text-charcoal-2">찜한 동아리를 보려면 로그인해 주세요.</p>
      <Link href={loginHref} className="btn btn-primary btn-sm mt-4 inline-flex">
        로그인하기
      </Link>
    </div>
  );
}

function FavoriteEmptyState({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="py-24 text-center">
      <p className="text-[14px] font-semibold text-charcoal-2">아직 찜한 동아리가 없어요.</p>
      <p className="mt-1.5 text-[13px] text-charcoal-3">관심 있는 동아리를 찜하고 쉽게 다시 찾아보세요.</p>
      <button type="button" onClick={onBrowse} className="btn btn-secondary btn-sm mt-4">
        동아리 둘러보기
      </button>
    </div>
  );
}

function FilterChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-semibold transition-colors',
        on ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-charcoal-2',
      )}
    >
      {on && <Icon.check className="h-3 w-3" />}
      {label}
    </button>
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
