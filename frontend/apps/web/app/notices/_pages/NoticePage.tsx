'use client';

import { useState } from 'react';
import type { SVGProps } from 'react';
import Link from 'next/link';
import type { NoticeCategory, NoticeSource } from '@duing/types';
import { formatDateKst, parseKstInstant, useNoticeListQuery } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';
import { ArrowRight } from '@/components/duing/Icon';
import { ListRowsSkeleton } from '@/components/loading/Skeleton';
import { InfoTabs } from '../../_components/InfoTabs';
import { ImageWithFallback } from '../../_components/ImageWithFallback';
import { SparkleFull } from '../../_components/Sparkle';
import { toRoute } from '../../_lib/route';
import { NOTICE_CATEGORY_LABEL, NOTICE_CATEGORY_OPTIONS } from '../_lib/categoryLabels';
import { CATEGORY_TAG_STYLES } from '../_lib/categoryTagStyles';

/* ---------- Local icon set (inline-style 페이지 전용) ---------- */
type IconProps = SVGProps<SVGSVGElement>;

const Icon = {
  search: (p: IconProps) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
  ),
  chev: (p: IconProps) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  list: (p: IconProps) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  ),
  grid: (p: IconProps) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1.6" /><rect x="14" y="3" width="7" height="7" rx="1.6" />
      <rect x="3" y="14" width="7" height="7" rx="1.6" /><rect x="14" y="14" width="7" height="7" rx="1.6" />
    </svg>
  ),
  arrowLeft: (p: IconProps) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M19 12H5M11 5l-7 7 7 7" />
    </svg>
  ),
  arrowRight: (p: IconProps) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  ),
};

/* ---------- 미니 컴포넌트 ---------- */
function NTagPill({ category }: { category: NoticeCategory }) {
  const s = CATEGORY_TAG_STYLES[category];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: '3px 9px', borderRadius: 6,
      background: s.bg, color: s.fg,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
      minWidth: 36,
    }}>{NOTICE_CATEGORY_LABEL[category]}</span>
  );
}

function NewBadge() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: '2px 7px', borderRadius: 5,
      background: '#E14A3A', color: '#fff',
      fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em',
      marginLeft: 8, transform: 'translateY(-1px)',
    }}>NEW</span>
  );
}

/* 사이드바 카테고리 아이콘 */
type SideIconProps = SVGProps<SVGSVGElement>;

const SideIcon = {
  list: (p: SideIconProps) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="3.5" y="4" width="17" height="3.5" rx="1" />
      <rect x="3.5" y="10.5" width="17" height="3.5" rx="1" />
      <rect x="3.5" y="17" width="17" height="3.5" rx="1" />
    </svg>
  ),
  bell: (p: SideIconProps) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  people: (p: SideIconProps) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c0-3 3-5 6.5-5s6.5 2 6.5 5" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M16 15.5c3 0 5.5 1.6 5.5 4.5" />
    </svg>
  ),
  spark: (p: SideIconProps) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </svg>
  ),
  gift: (p: SideIconProps) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="3" y="9" width="18" height="12" rx="1.5" />
      <path d="M3 13h18M12 9v12" />
      <path d="M7.5 9c-2 0-2.5-3.5 0-3.5 2 0 4.5 3.5 4.5 3.5s2.5-3.5 4.5-3.5c2.5 0 2 3.5 0 3.5" />
    </svg>
  ),
  faq: (p: SideIconProps) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.3 9.3a2.7 2.7 0 0 1 5.2 1c0 1.6-2.5 2.2-2.5 3.7" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" />
    </svg>
  ),
};

type SideItemProps = {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
};

function SideItem({ icon, label, count, active = false, onClick }: SideItemProps) {
  return (
    <a
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '11px 14px', borderRadius: 10,
        background: active ? 'var(--sage-tint)' : 'transparent',
        color: active ? 'var(--ink-deep)' : 'var(--charcoal-2)',
        fontSize: 14, fontWeight: active ? 700 : 500,
        cursor: 'pointer',
        transition: 'background .15s',
      }}
    >
      <span style={{
        color: active ? 'var(--ink)' : 'var(--charcoal-3)',
        display: 'grid', placeItems: 'center', width: 18, height: 18,
      }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {count !== undefined && (
        <span style={{
          fontSize: 12, fontFamily: 'var(--font-mono)',
          color: active ? 'var(--ink)' : 'var(--charcoal-3)',
          fontWeight: active ? 700 : 500,
        }}>{count}</span>
      )}
    </a>
  );
}

// 카테고리 필터(SideItem, onClick 상태변경)와 달리 실제 페이지 이동이므로 next/link 사용.
function SideLinkItem({ icon, label, href }: { icon: React.ReactNode; label: string; href: `/${string}` }) {
  return (
    <Link
      href={toRoute(href)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '11px 14px', borderRadius: 10,
        color: 'var(--charcoal-2)',
        fontSize: 14, fontWeight: 500,
        textDecoration: 'none',
      }}
    >
      <span style={{
        color: 'var(--charcoal-3)',
        display: 'grid', placeItems: 'center', width: 18, height: 18,
      }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
    </Link>
  );
}

/* ---------- 헬퍼 ---------- */
const isNewItem = (createdAt: string): boolean =>
  parseKstInstant(createdAt).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000;

const formatDate = (isoString: string): string => formatDateKst(isoString);

/* ---------- 페이지 ---------- */
const PAGE_SIZE = 20;

type SidebarItem = {
  icon: React.ReactNode;
  label: string;
  value: NoticeCategory | 'ALL';
};

export function NoticePage() {
  const isAuthenticated = useAuthStore((state) => state.status === 'authenticated');
  // 출처 세그먼트 — 학교 공지(관리자) / 내 동아리(가입 동아리 작성). 로그인 사용자만 '내 동아리' 선택 가능.
  const [source, setSource] = useState<NoticeSource>('SCHOOL');
  const [category, setCategory] = useState<NoticeCategory | 'ALL'>('ALL');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);

  // 비로그인이면 항상 학교 공지 — 내 동아리 세그먼트가 숨겨지고, 로그아웃 직후의 stale CLUB 상태도 흡수한다.
  const activeSource: NoticeSource = isAuthenticated ? source : 'SCHOOL';

  // 내 동아리 공지는 카테고리 체계가 없어 카테고리 필터를 적용하지 않는다.
  const listQuery = useNoticeListQuery({
    source: activeSource,
    category: activeSource === 'SCHOOL' && category !== 'ALL' ? category : undefined,
    keyword: keyword || undefined,
    page,
    size: PAGE_SIZE,
  });

  const items = listQuery.data?.content ?? [];
  const totalElements = listQuery.data?.totalElements ?? 0;
  const totalPages = listQuery.data?.totalPages ?? 0;
  const pinnedItems = items.filter((n) => n.pinned);
  const restItems = items.filter((n) => !n.pinned);

  const handleCategoryChange = (next: NoticeCategory | 'ALL') => {
    setCategory(next);
    setPage(0);
  };

  const handleSourceChange = (next: NoticeSource) => {
    setSource(next);
    setPage(0);
  };

  const isClubSource = activeSource === 'CLUB';

  const handleSearch = () => {
    setKeyword(keywordInput);
    setPage(0);
  };

  const sidebarItems: SidebarItem[] = [
    { icon: <SideIcon.list />,   label: '전체',    value: 'ALL' },
    { icon: <SideIcon.bell />,   label: '축제',    value: 'FESTIVAL' },
    { icon: <SideIcon.people />, label: '박람회',  value: 'FAIR' },
    { icon: <SideIcon.spark />,  label: '지원사업', value: 'FUNDING' },
    { icon: <SideIcon.gift />,   label: '공모전',  value: 'CONTEST' },
    { icon: <SideIcon.faq />,    label: '일반',    value: 'GENERAL' },
  ];

  return (
    // 크림 캔버스(duing min-h-lvh bg-cream)와 ExploreNav 는 notices/layout.tsx 가 렌더한다 — 로딩 경계 밖에서 유지되도록.
    // 최상위는 fragment 가 아닌 정적 div — 첫 요소가 sticky(InfoTabs)면 라우터 자동 스크롤 기준에서 제외된다.
    <div>
      <InfoTabs />

      <div
        className="mx-auto grid grid-cols-1 items-start gap-7 px-4 pb-20 pt-page-top md:grid-cols-[220px_1fr] md:gap-10 md:px-10"
        style={{ maxWidth: 1280 }}
      >
        {/* ===== Left sidebar (데스크탑 전용 — 모바일은 태그 칩이 카테고리 필터 제공) ===== */}
        <aside className="hidden md:block" style={{
          background: 'var(--paper)',
          border: '1px solid var(--gray-line)',
          borderRadius: 18,
          padding: '20px 14px',
          position: 'sticky', top: 24,
        }}>
          <div style={{
            padding: '4px 12px 14px',
            fontSize: 14, fontWeight: 700, color: 'var(--ink-deep)',
            letterSpacing: '-0.01em',
            marginBottom: 10,
          }}>
            {isClubSource ? '내 동아리' : '캠퍼스 소식'}
          </div>
          {isClubSource ? (
            <p style={{ padding: '4px 14px', fontSize: 13, lineHeight: 1.6, color: 'var(--charcoal-3)' }}>
              가입한 동아리가 올린 공지입니다. 각 공지에 어느 동아리 소식인지 표시됩니다.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {sidebarItems.map((item) => (
                <SideItem
                  key={item.value}
                  icon={item.icon}
                  label={item.label}
                  count={category === item.value ? totalElements : undefined}
                  active={category === item.value}
                  onClick={() => handleCategoryChange(item.value)}
                />
              ))}
            </div>
          )}

          {/* 총동연 FAQ 진입점 — 공지 카테고리와 별개 섹션(여백으로 구분), 세그먼트와 무관하게 항상 노출 */}
          <div style={{ marginTop: 14, paddingTop: 14 }}>
            <SideLinkItem icon={<ArrowRight />} label="자주 묻는 질문" href="/faq" />
          </div>
        </aside>

        {/* ===== Main column ===== */}
        <main>
          {/* 출처 세그먼트 — 학교 공지 / 내 동아리 (로그인 시) */}
          <div style={{
            display: 'inline-flex', gap: 4, marginBottom: 18,
            padding: 4, borderRadius: 12,
            background: 'var(--paper)', border: '1px solid var(--gray-line)',
          }}>
            {([
              { value: 'SCHOOL' as const, label: '학교 공지' },
              ...(isAuthenticated ? [{ value: 'CLUB' as const, label: '내 동아리' }] : []),
            ]).map((seg) => {
              const segActive = activeSource === seg.value;
              return (
                <button
                  key={seg.value}
                  type="button"
                  aria-pressed={segActive}
                  onClick={() => handleSourceChange(seg.value)}
                  style={{
                    padding: '8px 18px', borderRadius: 9, border: 'none',
                    background: segActive ? 'var(--ink)' : 'transparent',
                    color: segActive ? '#fff' : 'var(--charcoal-2)',
                    fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
                    cursor: 'pointer', transition: 'background .15s',
                  }}
                >
                  {seg.label}
                </button>
              );
            })}
          </div>

          {/* Hero */}
          <div className="mb-[22px] flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
            <div>
              <div style={{
                fontSize: 11.5, fontWeight: 700, color: 'var(--ink)',
                letterSpacing: '0.14em', marginBottom: 10,
              }}>NOTICE</div>
              <h1 style={{ fontSize: 36, marginBottom: 10, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                캠퍼스 소식
                <SparkleFull size={22} color="var(--sage)" />
              </h1>
              <p style={{ fontSize: 14, color: 'var(--charcoal-2)', lineHeight: 1.55 }}>
                두잉과 대구대 동아리에서 전하는 공지·모집·행사·혜택 소식입니다.
              </p>
              {/* 데스크톱은 좌측 사이드바에 동일 진입점이 있어 모바일에서만 노출.
                  display 는 인라인 style 에 두면 md:hidden(클래스)을 덮어쓰므로 클래스로만 제어한다. */}
              <Link
                href={toRoute('/faq')}
                className="inline-flex md:hidden"
                style={{
                  alignItems: 'center', gap: 4,
                  marginTop: 10, fontSize: 12.5, fontWeight: 700,
                  color: 'var(--ink-deep)', textDecoration: 'none',
                }}
              >
                총동연 자주 묻는 질문 <Icon.arrowRight style={{ width: 12, height: 12 }} />
              </Link>
            </div>

            {/* Search */}
            <div className="flex w-full items-center gap-2 md:mt-1 md:w-auto md:shrink-0">
              <div className="w-full md:w-[280px]" style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--paper)',
                border: '1px solid var(--gray-line)',
                borderRadius: 10,
                padding: '0 4px 0 14px',
                height: 40,
              }}>
                <input
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                  placeholder="제목 또는 내용을 검색하세요"
                  style={{
                    flex: 1, border: 'none', outline: 'none',
                    fontSize: 13, background: 'transparent', fontFamily: 'inherit',
                    color: 'var(--charcoal)',
                  }}
                />
                <button
                  type="button"
                  onClick={handleSearch}
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: 'var(--ink)', color: '#fff', border: 'none',
                    display: 'grid', placeItems: 'center', cursor: 'pointer',
                  }}
                >
                  <Icon.search style={{ width: 16, height: 16 }} />
                </button>
              </div>
            </div>
          </div>

          {/* Tag pills — 카테고리는 학교 공지에만 적용된다(내 동아리 공지는 카테고리 체계 없음) */}
          {!isClubSource && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
              {NOTICE_CATEGORY_OPTIONS.map((opt) => {
                const isActive = opt.value === category;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleCategoryChange(opt.value)}
                    style={{
                      padding: '7px 14px', borderRadius: 999,
                      border: `1px solid ${isActive ? 'var(--ink)' : 'var(--gray-line)'}`,
                      background: isActive ? 'var(--ink)' : 'var(--paper)',
                      color: isActive ? '#fff' : 'var(--charcoal-2)',
                      fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Loading / Error */}
          {listQuery.isLoading && (
            <ListRowsSkeleton
              rows={5}
              rowClassName="h-[72px] rounded-2xl"
              className="py-6"
              label="공지 목록 불러오는 중"
            />
          )}
          {listQuery.isError && (
            <p style={{ padding: '48px 0', textAlign: 'center', color: '#E14A3A', fontSize: 13 }}>
              공지를 불러오지 못했습니다.
            </p>
          )}

          {listQuery.isSuccess && (
            // keepPreviousData 전환 중(탭·필터 변경)에는 이전 목록을 딤 처리해
            // "지금 보이는 게 갱신 전 데이터"라는 신호를 준다. opacity 만 전이라 비용 없음.
            <div
              aria-busy={listQuery.isPlaceholderData}
              className={listQuery.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}
            >
              {/* Pinned cards */}
              {pinnedItems.length > 0 && (
                <>
                  <div className="mb-2.5 grid grid-cols-1 gap-3.5 md:grid-cols-2">
                    {pinnedItems.slice(0, 2).map((n, i) => {
                      const isDark = i === 0;
                      return (
                        <Link
                          key={n.id}
                          href={toRoute(`/notices/${n.id}`)}
                          style={{
                            background: isDark ? 'var(--ink)' : 'var(--paper)',
                            color: isDark ? '#fff' : 'var(--charcoal)',
                            border: isDark ? 'none' : '1px solid var(--gray-line)',
                            borderRadius: 16, padding: '20px 22px',
                            position: 'relative', overflow: 'hidden',
                            cursor: 'pointer', minHeight: 188,
                            display: 'flex', flexDirection: 'row', gap: 18,
                            textDecoration: 'none',
                          }}
                        >
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                          {/* Top row: tag + date + NEW */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                            {isDark ? (
                              <span style={{
                                padding: '3px 9px', borderRadius: 6,
                                background: 'rgba(157,182,160,0.18)',
                                color: 'var(--sage)',
                                fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
                              }}>{NOTICE_CATEGORY_LABEL[n.category]}</span>
                            ) : (
                              <NTagPill category={n.category} />
                            )}
                            {n.owningClubId != null && (
                              <span style={{
                                padding: '3px 9px', borderRadius: 6,
                                display: 'inline-block', maxWidth: 200, verticalAlign: 'middle',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                background: isDark ? 'rgba(157,182,160,0.18)' : 'var(--sage-mist)',
                                color: isDark ? 'var(--sage)' : 'var(--ink)',
                                fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
                              }}>🏛 {n.clubName ?? '동아리 공지'}</span>
                            )}
                            <span style={{
                              fontSize: 12, fontFamily: 'var(--font-mono)',
                              color: isDark ? 'rgba(255,255,255,0.5)' : 'var(--charcoal-3)',
                            }}>{formatDate(n.createdAt)}</span>
                            {isNewItem(n.createdAt) && (
                              <span style={{ marginLeft: 'auto' }}>
                                <NewBadge />
                              </span>
                            )}
                          </div>

                          {/* Title */}
                          <h3 style={{
                            fontSize: 19, fontFamily: 'var(--font-body)', fontWeight: 700,
                            color: isDark ? '#fff' : 'var(--ink-deep)',
                            lineHeight: 1.35, marginBottom: 10, letterSpacing: '-0.015em',
                          }}>{n.title}</h3>

                          {/* Body (summary) */}
                          <p style={{
                            fontSize: 12.5, lineHeight: 1.65,
                            color: isDark ? 'rgba(255,255,255,0.62)' : 'var(--charcoal-2)',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            marginBottom: 14,
                          }}>{n.summary}</p>

                          {/* Footer: cta */}
                          <div style={{
                            marginTop: 'auto', paddingTop: 10,
                            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                            fontSize: 12, color: isDark ? 'rgba(255,255,255,0.55)' : 'var(--charcoal-3)',
                          }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              fontWeight: 700,
                              color: isDark ? '#fff' : 'var(--ink-deep)',
                            }}>
                              자세히 보기 <Icon.arrowRight style={{ width: 13, height: 13 }} />
                            </span>
                          </div>
                          </div>
                          {/* Cover thumbnail */}
                          <div style={{
                            flex: '0 0 140px', alignSelf: 'stretch',
                            borderRadius: 12, overflow: 'hidden',
                            background: isDark ? 'rgba(255,255,255,0.06)' : 'var(--gray-soft)',
                          }}>
                            <ImageWithFallback
                              src={n.coverImageUrl}
                              alt=""
                              className="w-full h-full !bg-transparent"
                              emptyMessage="이미지 없음"
                            />
                          </div>
                        </Link>
                      );
                    })}
                  </div>

                  <div style={{ padding: '10px 0 24px' }} />
                </>
              )}

              {/* List header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 14,
              }}>
                <h2 style={{
                  fontSize: 15, fontFamily: 'var(--font-body)', fontWeight: 700,
                  color: 'var(--ink-deep)',
                }}>
                  {isClubSource ? '내 동아리 공지' : '전체 공지'} · {totalElements}
                </h2>
              </div>

              {/* Table — 통짜 paper 시트는 데스크탑 전용. 모바일은 크림 위 행 리스트로 둔다:
                  짧은 진입 뷰포트에서 흰 라운드 시트의 상단 엣지가 하단 탭바 바로 위에 정지하면
                  반투명 탭바와 병합돼 "두 겹 탭바"처럼 보인다(실기기 스크린샷으로 확인된 착시).
                  크림 위 텍스트 행은 어느 높이에 걸쳐도 다른 탭 진입 화면과 같은 구도로 읽힌다. */}
              <div className="md:overflow-hidden md:rounded-[14px] md:border md:border-line md:bg-paper">
                {/* Header row (데스크탑 전용 — 모바일은 카드형 행) */}
                <div className="hidden md:grid" style={{
                  gridTemplateColumns: '56px 56px 72px 1fr 110px',
                  padding: '12px 22px', gap: 14, alignItems: 'center',
                  background: '#FAF8F2',
                  borderBottom: '1px solid var(--gray-line)',
                  fontSize: 11.5, fontWeight: 700, color: 'var(--charcoal-3)',
                  letterSpacing: '0.04em',
                }}>
                  <span>NO.</span>
                  <span />
                  <span>분류</span>
                  <span>제목</span>
                  <span style={{ textAlign: 'center' }}>등록일</span>
                </div>

                {restItems.map((n, i) => (
                  <Link
                    key={n.id}
                    href={toRoute(`/notices/${n.id}`)}
                    className="notice-row"
                    style={{
                      // 패딩은 .notice-row(globals.css)가 소유 — 모바일(시트 없음)은 좌우 0, md+ 는 시트 내부 22px.
                      borderBottom: i < restItems.length - 1 ? '1px solid var(--gray-line)' : 'none',
                      fontSize: 13.5, cursor: 'pointer',
                      color: 'var(--charcoal)', textDecoration: 'none',
                    }}
                  >
                    <span className="nr-no" style={{
                      fontSize: 12, color: 'var(--charcoal-3)',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {String(n.id).padStart(4, '0')}
                    </span>
                    <div className="nr-img" style={{
                      width: 40, height: 40, borderRadius: 8,
                      overflow: 'hidden',
                    }}>
                      <ImageWithFallback
                        src={n.coverImageUrl}
                        alt=""
                        className="w-full h-full !bg-transparent"
                        emptyMessage="이미지 없음"
                      />
                    </div>
                    <span className="nr-cat"><NTagPill category={n.category} /></span>
                    <span className="nr-title" style={{
                      fontSize: 13.5, fontWeight: 500, color: 'var(--charcoal)',
                      display: 'inline-flex', alignItems: 'center',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {n.owningClubId != null && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          padding: '1px 7px', borderRadius: 999, flexShrink: 0, marginRight: 7,
                          maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          background: 'var(--sage-mist)', color: 'var(--ink)',
                          fontSize: 11, fontWeight: 700,
                        }}>🏛 {n.clubName ?? '동아리 공지'}</span>
                      )}
                      {n.title}
                      {isNewItem(n.createdAt) && <NewBadge />}
                    </span>
                    <span className="nr-date" style={{
                      fontSize: 12, color: 'var(--charcoal-3)',
                      fontFamily: 'var(--font-mono)',
                    }}>{formatDate(n.createdAt)}</span>
                  </Link>
                ))}

                {restItems.length === 0 && (
                  <p style={{ padding: '32px 22px', textAlign: 'center', color: 'var(--charcoal-3)', fontSize: 13 }}>
                    {keyword
                      ? '검색 결과가 없습니다.'
                      : isClubSource ? '가입한 동아리의 공지가 없습니다' : '아직 공지가 없습니다'}
                  </p>
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{
                  display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4,
                  marginTop: 36,
                }}>
                  <button
                    type="button"
                    onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                    disabled={page === 0}
                    style={{
                      width: 32, height: 32, borderRadius: 8, border: 'none',
                      background: 'transparent', color: 'var(--charcoal-3)',
                      display: 'grid', placeItems: 'center',
                      cursor: page === 0 ? 'default' : 'pointer',
                      opacity: page === 0 ? 0.4 : 1,
                    }}
                  >
                    <Icon.arrowLeft style={{ width: 15, height: 15 }} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPage(i)}
                      style={{
                        width: 32, height: 32, borderRadius: 8, border: 'none',
                        background: i === page ? 'var(--ink)' : 'transparent',
                        color: i === page ? '#fff' : 'var(--charcoal-2)',
                        fontSize: 13, fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >{i + 1}</button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPage((prev) => Math.min(totalPages - 1, prev + 1))}
                    disabled={page === totalPages - 1}
                    style={{
                      width: 32, height: 32, borderRadius: 8, border: 'none',
                      background: 'transparent', color: 'var(--charcoal-3)',
                      display: 'grid', placeItems: 'center',
                      cursor: page === totalPages - 1 ? 'default' : 'pointer',
                      opacity: page === totalPages - 1 ? 0.4 : 1,
                    }}
                  >
                    <Icon.arrowRight style={{ width: 15, height: 15 }} />
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
