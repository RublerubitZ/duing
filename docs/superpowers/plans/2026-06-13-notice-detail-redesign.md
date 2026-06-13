# 단위 C — 공지 상세(`/notices/[id]`) 잡지형 재설계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. 체크박스(`- [ ]`) 단위 진행.

**Goal:** 공지 상세 페이지를 DESIGN.md 기반 2컬럼 잡지형으로 재설계 — 3:4 포스터 히어로 + 리드, 자연비율 본문 이미지 '사진' 섹션, sticky 사이드바("한눈에 보기" 다크 카드 / 폴백 공지정보 카드 · 공유 · 관련 공지).

**Architecture:** `app/notices/[noticeId]/page.tsx` 가 쿼리·상태·조립을 담당하고, 표현은 `app/notices/_components/*` 작은 컴포넌트로 분리. 행사정보·본문이미지 타입은 단위 B(이 브랜치의 베이스)에서 이미 정의됨. 관련 공지는 기존 `useNoticeListQuery` 재사용(추가 백엔드 0). 런타임은 단위 A 배포 후 완전 동작(미배포 시 `eventInfo`/`bodyImageUrls` 가 없어도 옵셔널 체이닝/기본값으로 안전).

**Tech Stack:** Next.js 15 App Router(client page) / React 19 / TanStack Query / Tailwind `.duing` 토큰 / lucide-react 아이콘 / react-markdown.

**스펙:** `docs/superpowers/specs/2026-06-13-notice-detail-redesign-design.md` §5.

**검증:** `pnpm --filter @duing/web typecheck`, `pnpm --filter @duing/web lint`, `pnpm --filter @duing/web test -- --run <경로>`.

> **TDD 메모:** 페이지는 비주얼 조립이 핵심이라, 컴포넌트를 typecheck/lint 게이트로 쌓아 올린 뒤(각 커밋 green) 마지막에 페이지 통합 테스트(vitest)를 재작성한다.

---

## 파일 구조

| 파일 | 책임 | 작업 |
|------|------|------|
| `app/notices/_lib/eventFormat.ts` | 행사 기간 포맷·D-day·게시일 포맷 | Create |
| `app/notices/_lib/categoryTagStyles.ts` | 카테고리 색 토큰 맵(목록·상세 공유) | Create |
| `app/notices/_pages/NoticePage.tsx` | 로컬 `CATEGORY_TAG_STYLES` → 공유 lib import | Modify |
| `app/notices/_components/NaturalImage.tsx` | intrinsic 비율 `<img>` + onError 폴백 | Create |
| `app/notices/_components/NoticeMarkdown.tsx` | 잡지 리듬 재스타일 | Modify |
| `app/notices/_components/NoticeShareCard.tsx` | 링크 복사 사이드 카드 | Create |
| `app/notices/_components/NoticeArticleHeader.tsx` | 브레드크럼·뒤로·상태 pill·H1·바이라인 | Create |
| `app/notices/_components/NoticePosterHero.tsx` | 3:4 포스터 + 리드(summary) | Create |
| `app/notices/_components/NoticeBodyImages.tsx` | '사진' 자연비율 스택 | Create |
| `app/notices/_components/NoticeEventCard.tsx` | 다크 "한눈에 보기" 행사 카드 | Create |
| `app/notices/_components/NoticeMetaCard.tsx` | 폴백 공지정보 카드 | Create |
| `app/notices/_components/RelatedNotices.tsx` | 관련 공지(같은 카테고리 최신) | Create |
| `app/notices/[noticeId]/page.tsx` | 쿼리·상태·레이아웃 조립(재작성) | Rewrite |
| `test/notices/notice-detail-page.test.tsx` | 재설계 페이지 통합 테스트(재작성) | Rewrite |

기존 `NoticeDetailHeader.tsx` 는 새 `NoticeArticleHeader` 로 대체되어 미사용 → 삭제. `ExpiredBanner`·`ImageWithFallback`·`Sparkle`/`SparkleFull` 재사용.

---

## Task 0: 브랜치
이미 `feat/notice-detail-redesign`(베이스: `feat/admin-notice-event-images-form`)에서 작업 중이라고 가정.

---

## Task 1: 보조 lib (eventFormat · categoryTagStyles) + NoticePage 공유

**Files:** `app/notices/_lib/eventFormat.ts`(C), `app/notices/_lib/categoryTagStyles.ts`(C), `app/notices/_pages/NoticePage.tsx`(M)

- [ ] **Step 1: `eventFormat.ts` 작성**

`frontend/apps/web/app/notices/_lib/eventFormat.ts`:
```ts
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function parts(iso: string): { date: string; time: string } {
  const value = new Date(iso);
  const date = `${value.getMonth() + 1}.${value.getDate()}(${WEEKDAYS[value.getDay()]})`;
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return { date, time: `${hours}:${minutes}` };
}

export function formatEventRange(startAt: string, endAt: string | null): string {
  const start = parts(startAt);
  if (!endAt) return `${start.date} ${start.time}`;
  const end = parts(endAt);
  if (start.date === end.date) return `${start.date} ${start.time}–${end.time}`;
  return `${start.date} ~ ${end.date} · ${start.time}–${end.time}`;
}

export function formatDdayLabel(expiresAt: string): string {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  const days = Math.ceil(diffMs / 86_400_000);
  if (days < 0) return '마감';
  if (days === 0) return 'D-DAY';
  return `D-${days}`;
}

export function formatPublishedDate(iso: string): string {
  const value = new Date(iso);
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}.${month}.${day}`;
}
```

- [ ] **Step 2: `categoryTagStyles.ts` 작성**

`frontend/apps/web/app/notices/_lib/categoryTagStyles.ts`:
```ts
import type { NoticeCategory } from '@duing/types';

export type CategoryTagStyle = { bg: string; fg: string };

export const CATEGORY_TAG_STYLES: Record<NoticeCategory, CategoryTagStyle> = {
  FESTIVAL: { bg: '#FCE2D9', fg: '#9A3F23' },
  FAIR: { bg: 'var(--sage-mist)', fg: 'var(--ink-deep)' },
  FUNDING: { bg: '#DDE8F1', fg: '#2F557A' },
  CONTEST: { bg: '#FBEFD7', fg: '#8E6620' },
  GENERAL: { bg: 'var(--gray-soft)', fg: 'var(--charcoal-2)' },
};
```

- [ ] **Step 3: `NoticePage.tsx` 가 공유 lib 사용**

`NoticePage.tsx` 에서 로컬 `type TagStyle` 와 `const CATEGORY_TAG_STYLES = {...}` 정의 블록을 삭제하고, 상단 import 에 추가:
```ts
import { CATEGORY_TAG_STYLES } from '../_lib/categoryTagStyles';
```
(파일 내 `CATEGORY_TAG_STYLES[...]` 사용처는 그대로 둔다. `TagStyle` 타입을 다른 곳에서 안 쓰면 함께 제거.)

- [ ] **Step 4: typecheck + lint + 기존 목록 테스트**

Run: `cd frontend && pnpm --filter @duing/web typecheck && pnpm --filter @duing/web lint && pnpm --filter @duing/web test -- --run test/notices/notices-page.test.tsx`
Expected: 통과.

- [ ] **Step 5: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/notices/_lib/eventFormat.ts frontend/apps/web/app/notices/_lib/categoryTagStyles.ts frontend/apps/web/app/notices/_pages/NoticePage.tsx
git commit -m "feat(web): 공지 행사 포맷·카테고리 색 토큰 lib 추출"
```

---

## Task 2: 리프 컴포넌트 (NaturalImage · NoticeShareCard) + 마크다운 재스타일

**Files:** `NaturalImage.tsx`(C), `NoticeShareCard.tsx`(C), `NoticeMarkdown.tsx`(M) — 모두 `app/notices/_components/`

- [ ] **Step 1: `NaturalImage.tsx`**
```tsx
'use client';

import { useState } from 'react';

type Props = {
  src: string;
  alt: string;
  className?: string;
};

export function NaturalImage({ src, alt, className }: Props) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <div
        role="img"
        aria-label="이미지를 불러올 수 없습니다"
        className={`grid place-items-center bg-graysoft text-charcoal-3 text-[13px] py-12 rounded-lg ${className ?? ''}`}
      >
        이미지를 불러올 수 없습니다
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL, 자연 비율 유지를 위해 intrinsic <img> 사용
    <img
      src={src}
      alt={alt}
      onError={() => setErrored(true)}
      className={`w-full h-auto rounded-lg ${className ?? ''}`}
    />
  );
}
```

- [ ] **Step 2: `NoticeShareCard.tsx`**
```tsx
'use client';

import { useState } from 'react';
import { Link2 } from 'lucide-react';

export function NoticeShareCard() {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-lg border border-line bg-paper p-5">
      <div className="text-[12.5px] font-bold text-charcoal-3 mb-3">공유하기</div>
      <button
        type="button"
        onClick={copyLink}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-gray-soft text-charcoal-2 text-[13px] font-semibold hover:bg-sage-tint hover:text-ink transition"
      >
        <Link2 size={15} aria-hidden />
        {copied ? '링크 복사됨' : '링크 복사'}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: `NoticeMarkdown.tsx` 잡지 리듬 재스타일(전체 교체)**
```tsx
'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Props = {
  content: string;
};

export function NoticeMarkdown({ content }: Props) {
  return (
    <div className="text-[16px] leading-[1.85] text-charcoal whitespace-pre-wrap [&_p]:mb-4 [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-2 [&_h2]:text-[21px] [&_h2]:font-bold [&_h2]:text-ink-deep [&_h2]:mt-9 [&_h2]:mb-3 [&_h2]:pl-3 [&_h2]:border-l-[3px] [&_h2]:border-sage [&_h3]:text-[17px] [&_h3]:font-bold [&_h3]:text-ink-deep [&_h3]:mt-6 [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-4 [&_li]:mb-1.5 [&_img]:w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:my-5 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-4 [&_blockquote]:text-charcoal-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // eslint-disable-next-line @typescript-eslint/no-unused-vars -- react-markdown 의 node prop 은 DOM 으로 전파 금지
          a: ({ node: _node, ...rest }) => (
            <a {...rest} target="_blank" rel="noreferrer" />
          ),
        }}
      >{content}</ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 4: typecheck + lint**

Run: `cd frontend && pnpm --filter @duing/web typecheck && pnpm --filter @duing/web lint`
Expected: 통과.

- [ ] **Step 5: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/notices/_components/NaturalImage.tsx frontend/apps/web/app/notices/_components/NoticeShareCard.tsx frontend/apps/web/app/notices/_components/NoticeMarkdown.tsx
git commit -m "feat(web): 자연비율 이미지·공유 카드·잡지 리듬 마크다운"
```

---

## Task 3: 조립 컴포넌트 (헤더·포스터·본문이미지·행사/메타 카드·관련 공지)

**Files (모두 `app/notices/_components/`):** `NoticeArticleHeader.tsx`, `NoticePosterHero.tsx`, `NoticeBodyImages.tsx`, `NoticeEventCard.tsx`, `NoticeMetaCard.tsx`, `RelatedNotices.tsx` (전부 Create)

- [ ] **Step 1: `NoticeArticleHeader.tsx`**
```tsx
'use client';

import Link from 'next/link';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import type { NoticeCategory } from '@duing/types';
import { NOTICE_CATEGORY_LABEL } from '../_lib/categoryLabels';
import { CATEGORY_TAG_STYLES } from '../_lib/categoryTagStyles';
import { formatPublishedDate, formatDdayLabel } from '../_lib/eventFormat';
import { Sparkle } from '../../_components/Sparkle';

type Props = {
  category: NoticeCategory;
  title: string;
  pinned: boolean;
  expiresAt: string | null;
  createdAt: string;
};

export function NoticeArticleHeader({ category, title, pinned, expiresAt, createdAt }: Props) {
  const tag = CATEGORY_TAG_STYLES[category];
  const dday = expiresAt ? formatDdayLabel(expiresAt) : null;

  return (
    <header className="pt-7 pb-6 border-b border-line">
      <div className="flex items-center justify-between mb-5">
        <nav className="flex items-center gap-1.5 text-[13px] text-charcoal-3 whitespace-nowrap" aria-label="위치">
          <span>공지 · 소식</span>
          <ChevronRight size={14} aria-hidden />
          <span className="text-ink font-semibold">{NOTICE_CATEGORY_LABEL[category]}</span>
        </nav>
        <Link href="/notices" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-charcoal-2 hover:text-ink">
          <ArrowLeft size={15} aria-hidden /> 목록으로
        </Link>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <span
          className="px-2.5 py-1 rounded-md text-[12px] font-bold"
          style={{ background: tag.bg, color: tag.fg }}
        >
          {NOTICE_CATEGORY_LABEL[category]}
        </span>
        {pinned && (
          <span className="px-2.5 py-1 rounded-md bg-ink text-paper text-[11.5px] font-bold">상단 고정</span>
        )}
        {dday && (
          <span className={`px-2.5 py-1 rounded-md text-[11.5px] font-bold ${dday === '마감' ? 'bg-gray-soft text-charcoal-3' : 'bg-sage-mist text-ink'}`}>
            {dday}
          </span>
        )}
      </div>

      <h1 className="text-[34px] leading-[1.25] flex items-start gap-2">
        <span>{title}</span>
        <Sparkle size={18} color="var(--sage)" className="mt-2 shrink-0" />
      </h1>

      <div className="flex items-center gap-3 mt-4">
        <span className="grid place-items-center w-9 h-9 rounded-full bg-ink text-paper text-[11px] font-bold shrink-0 font-mono tracking-[0.08em]">DU</span>
        <div className="flex flex-col">
          <span className="text-[13.5px] font-bold text-ink-deep">두잉 공지</span>
          <span className="text-[12px] text-charcoal-3">{NOTICE_CATEGORY_LABEL[category]} 채널</span>
        </div>
        <span className="w-px h-7 bg-line mx-1" />
        <span className="font-mono text-[12.5px] text-charcoal-3">{formatPublishedDate(createdAt)}</span>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: `NoticePosterHero.tsx`**
```tsx
import { ImageWithFallback } from '../../_components/ImageWithFallback';

type Props = {
  coverImageUrl: string;
  title: string;
  summary: string;
};

export function NoticePosterHero({ coverImageUrl, title, summary }: Props) {
  return (
    <div className="grid md:grid-cols-[280px_1fr] gap-7 items-start mb-8">
      <ImageWithFallback
        src={coverImageUrl}
        alt={title}
        className="aspect-[3/4] rounded-lg overflow-hidden border border-line shadow-2"
        emptyMessage="이미지 없음"
      />
      {summary ? (
        <p className="text-[17.5px] leading-[1.8] font-medium text-charcoal">{summary}</p>
      ) : (
        <span />
      )}
    </div>
  );
}
```

- [ ] **Step 3: `NoticeBodyImages.tsx`**
```tsx
import { NaturalImage } from './NaturalImage';

type Props = {
  urls: string[];
};

export function NoticeBodyImages({ urls }: Props) {
  if (urls.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-[15px] font-bold text-ink-deep mb-3">사진</h2>
      <div className="flex flex-col gap-4">
        {urls.map((url, index) => (
          <NaturalImage key={`${url}-${index}`} src={url} alt={`본문 이미지 ${index + 1}`} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: `NoticeEventCard.tsx`**
```tsx
import { CalendarDays, MapPin, Users2, ExternalLink } from 'lucide-react';
import type { NoticeEventInfo } from '@duing/types';
import { formatEventRange } from '../_lib/eventFormat';
import { SparkleFull } from '../../_components/Sparkle';

type Props = {
  eventInfo: NoticeEventInfo;
  linkUrl: string | null;
};

export function NoticeEventCard({ eventInfo, linkUrl }: Props) {
  const rows: { icon: React.ReactNode; label: string; value: string }[] = [
    { icon: <CalendarDays size={16} aria-hidden />, label: '일시', value: formatEventRange(eventInfo.startAt, eventInfo.endAt) },
  ];
  if (eventInfo.location) rows.push({ icon: <MapPin size={16} aria-hidden />, label: '장소', value: eventInfo.location });
  if (eventInfo.host) rows.push({ icon: <Users2 size={16} aria-hidden />, label: '주최', value: eventInfo.host });
  if (eventInfo.audience) rows.push({ icon: <Users2 size={16} aria-hidden />, label: '대상', value: eventInfo.audience });

  return (
    <div className="relative overflow-hidden rounded-lg bg-ink text-paper p-6">
      <SparkleFull size={24} color="var(--sage)" className="absolute top-4 right-4 opacity-80" />
      <div className="text-[12px] font-bold tracking-[0.08em] text-sage mb-5">한눈에 보기</div>
      <dl className="flex flex-col gap-4">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start gap-3">
            <span className="grid place-items-center w-7 h-7 rounded-md bg-white/10 text-sage shrink-0">{row.icon}</span>
            <div className="flex flex-col">
              <dt className="text-[11.5px] font-semibold text-white/50">{row.label}</dt>
              <dd className="text-[14px] font-semibold">{row.value}</dd>
            </div>
          </div>
        ))}
      </dl>
      {linkUrl && (
        <a
          href={linkUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-6 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-sage text-ink-deep text-[13px] font-bold"
        >
          <ExternalLink size={15} aria-hidden /> 자세히 보기
        </a>
      )}
    </div>
  );
}
```

- [ ] **Step 5: `NoticeMetaCard.tsx`**
```tsx
import { ExternalLink } from 'lucide-react';
import type { NoticeCategory } from '@duing/types';
import { NOTICE_CATEGORY_LABEL } from '../_lib/categoryLabels';
import { formatPublishedDate, formatDdayLabel } from '../_lib/eventFormat';

type Props = {
  category: NoticeCategory;
  createdAt: string;
  expiresAt: string | null;
  tags: string[];
  linkUrl: string | null;
};

export function NoticeMetaCard({ category, createdAt, expiresAt, tags, linkUrl }: Props) {
  const rows: { label: string; value: string }[] = [
    { label: '분류', value: NOTICE_CATEGORY_LABEL[category] },
    { label: '게시일', value: formatPublishedDate(createdAt) },
  ];
  if (expiresAt) rows.push({ label: '마감', value: `${formatPublishedDate(expiresAt)} · ${formatDdayLabel(expiresAt)}` });

  return (
    <div className="rounded-lg border border-line bg-paper p-5">
      <div className="text-[12.5px] font-bold text-charcoal-3 mb-4">공지 정보</div>
      <dl className="flex flex-col gap-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <dt className="text-[12px] font-semibold text-charcoal-3">{row.label}</dt>
            <dd className="text-[13.5px] font-semibold text-ink-deep">{row.value}</dd>
          </div>
        ))}
      </dl>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-dashed border-line">
          {tags.map((tag) => (
            <span key={tag} className="px-2 py-1 rounded-full bg-sage-mist text-ink text-[11.5px] font-semibold">#{tag}</span>
          ))}
        </div>
      )}
      {linkUrl && (
        <a
          href={linkUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-ink text-paper text-[13px] font-semibold"
        >
          <ExternalLink size={15} aria-hidden /> 원문 보기
        </a>
      )}
    </div>
  );
}
```

- [ ] **Step 6: `RelatedNotices.tsx`**
```tsx
'use client';

import Link from 'next/link';
import type { NoticeCategory } from '@duing/types';
import { useNoticeListQuery } from '@duing/hooks';
import { NOTICE_CATEGORY_LABEL } from '../_lib/categoryLabels';
import { formatPublishedDate } from '../_lib/eventFormat';
import { toRoute } from '../../_lib/route';

type Props = {
  category: NoticeCategory;
  currentId: number;
};

export function RelatedNotices({ category, currentId }: Props) {
  const listQuery = useNoticeListQuery({ category, page: 0, size: 6 });
  const items = (listQuery.data?.content ?? []).filter((item) => item.id !== currentId).slice(0, 3);

  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-line bg-paper p-5">
      <div className="text-[12.5px] font-bold text-charcoal-3 mb-1">관련 공지</div>
      <div className="flex flex-col">
        {items.map((item, index) => (
          <Link
            key={item.id}
            href={toRoute(`/notices/${item.id}`)}
            className={`py-3.5 ${index < items.length - 1 ? 'border-b border-line' : ''}`}
          >
            <span className="inline-block mb-1.5 px-2 py-0.5 rounded bg-sage-mist text-ink text-[10.5px] font-bold">
              {NOTICE_CATEGORY_LABEL[item.category]}
            </span>
            <div className="text-[13.5px] font-semibold text-charcoal leading-snug mb-1">{item.title}</div>
            <div className="font-mono text-[11.5px] text-charcoal-3">{formatPublishedDate(item.createdAt)}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: typecheck + lint**

Run: `cd frontend && pnpm --filter @duing/web typecheck && pnpm --filter @duing/web lint`
Expected: 통과(아직 페이지에서 미사용이라 컴포넌트는 export 만 — 정상).

- [ ] **Step 8: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/notices/_components/NoticeArticleHeader.tsx frontend/apps/web/app/notices/_components/NoticePosterHero.tsx frontend/apps/web/app/notices/_components/NoticeBodyImages.tsx frontend/apps/web/app/notices/_components/NoticeEventCard.tsx frontend/apps/web/app/notices/_components/NoticeMetaCard.tsx frontend/apps/web/app/notices/_components/RelatedNotices.tsx
git commit -m "feat(web): 공지 상세 헤더·포스터·행사/메타 카드·관련 공지 컴포넌트"
```

---

## Task 4: 페이지 재작성(조립) + NoticeDetailHeader 제거

**Files:** `app/notices/[noticeId]/page.tsx`(Rewrite), `app/notices/_components/NoticeDetailHeader.tsx`(Delete)

- [ ] **Step 1: `page.tsx` 전체 교체**
```tsx
'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { useNoticeDetailQuery } from '@duing/hooks';
import { ExploreNav } from '../../_components/ExploreNav';
import { NoticeArticleHeader } from '../_components/NoticeArticleHeader';
import { NoticePosterHero } from '../_components/NoticePosterHero';
import { NoticeMarkdown } from '../_components/NoticeMarkdown';
import { NoticeBodyImages } from '../_components/NoticeBodyImages';
import { NoticeEventCard } from '../_components/NoticeEventCard';
import { NoticeMetaCard } from '../_components/NoticeMetaCard';
import { NoticeShareCard } from '../_components/NoticeShareCard';
import { RelatedNotices } from '../_components/RelatedNotices';
import { ExpiredBanner } from '../_components/ExpiredBanner';

function getStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

export default function NoticeDetailPage() {
  const params = useParams<{ noticeId: string }>();
  const noticeId = params.noticeId ? Number(params.noticeId) : null;
  const router = useRouter();

  const detailQuery = useNoticeDetailQuery(noticeId);
  const notice = detailQuery.data;

  useEffect(() => {
    if (getStatus(detailQuery.error) === 403) {
      router.replace('/notices');
    }
  }, [detailQuery.error, router]);

  if (detailQuery.isLoading) {
    return (
      <div className="duing min-h-screen bg-cream">
        <ExploreNav active="공지" />
        <div className="max-w-[1120px] mx-auto px-10 py-16">
          <p className="text-charcoal-3 text-[13px]">불러오는 중…</p>
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !notice) {
    return (
      <div className="duing min-h-screen bg-cream">
        <ExploreNav active="공지" />
        <div className="max-w-[1120px] mx-auto px-10 py-16">
          <p className="text-coral text-[13px]">공지를 불러오지 못했습니다.</p>
        </div>
      </div>
    );
  }

  const expiredAndPast = notice.expiresAt !== null && new Date(notice.expiresAt) <= new Date();

  return (
    <div className="duing min-h-screen bg-cream">
      <ExploreNav active="공지" />
      <div className="max-w-[1120px] mx-auto px-10 pb-24">
        <NoticeArticleHeader
          category={notice.category}
          title={notice.title}
          pinned={notice.pinned}
          expiresAt={notice.expiresAt}
          createdAt={notice.createdAt}
        />

        {expiredAndPast && notice.expiresAt && (
          <div className="mt-6">
            <ExpiredBanner expiresAt={notice.expiresAt} />
          </div>
        )}

        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-12 pt-8 items-start">
          <article className="min-w-0">
            <NoticePosterHero
              coverImageUrl={notice.coverImageUrl}
              title={notice.title}
              summary={notice.summary}
            />
            <NoticeMarkdown content={notice.content} />
            <NoticeBodyImages urls={notice.bodyImageUrls ?? []} />
            {notice.linkUrl && (
              <a
                href={notice.linkUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-ink text-paper text-[13.5px] font-semibold"
              >
                <ExternalLink size={15} aria-hidden /> 원문 보기
              </a>
            )}
          </article>

          <aside className="lg:sticky lg:top-24 flex flex-col gap-4 min-w-0">
            {notice.eventInfo ? (
              <NoticeEventCard eventInfo={notice.eventInfo} linkUrl={notice.linkUrl} />
            ) : (
              <NoticeMetaCard
                category={notice.category}
                createdAt={notice.createdAt}
                expiresAt={notice.expiresAt}
                tags={notice.tags}
                linkUrl={notice.linkUrl}
              />
            )}
            <NoticeShareCard />
            <RelatedNotices category={notice.category} currentId={notice.id} />
          </aside>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 미사용 `NoticeDetailHeader.tsx` 삭제**
```bash
rm frontend/apps/web/app/notices/_components/NoticeDetailHeader.tsx
```
(다른 파일에서 import 가 없는지 확인: `grep -rn "NoticeDetailHeader" frontend/apps/web` → page.tsx 외 참조가 없어야 함. 있으면 보고.)

- [ ] **Step 3: typecheck + lint + build**

Run: `cd frontend && pnpm --filter @duing/web typecheck && pnpm --filter @duing/web lint`
Expected: 통과.

- [ ] **Step 4: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/notices/[noticeId]/page.tsx
git rm frontend/apps/web/app/notices/_components/NoticeDetailHeader.tsx
git commit -m "feat(web): 공지 상세 2컬럼 잡지형 페이지 조립"
```

---

## Task 5: 통합 테스트 재작성 + 전체 검증

**Files:** `test/notices/notice-detail-page.test.tsx`(Rewrite)

- [ ] **Step 1: 테스트 전체 교체**
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NoticeDetail } from '@duing/types';

vi.mock('../../app/_components/ExploreNav', () => ({
  ExploreNav: () => <nav aria-label="탐색 네비게이션" />,
}));

vi.mock('../../app/notices/_components/NoticeMarkdown', () => ({
  NoticeMarkdown: ({ content }: { content: string }) => <div>{content}</div>,
}));

const mockUseNoticeDetailQuery = vi.fn();
const mockUseNoticeListQuery = vi.fn();

vi.mock('@duing/hooks', () => ({
  useNoticeDetailQuery: (...args: unknown[]) => mockUseNoticeDetailQuery(...args),
  useNoticeListQuery: (...args: unknown[]) => mockUseNoticeListQuery(...args),
}));

const mockRouterReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ noticeId: '42' }),
  useRouter: () => ({ replace: mockRouterReplace, back: vi.fn(), push: vi.fn() }),
}));

import NoticeDetailPage from '../../app/notices/[noticeId]/page';

function makeDetail(overrides: Partial<NoticeDetail> = {}): NoticeDetail {
  return {
    id: 42,
    title: '공지 제목',
    summary: '공지 요약',
    content: '## 본문 내용\n\n상세 텍스트',
    coverImageUrl: 'https://example.com/cover.jpg',
    linkUrl: null,
    category: 'GENERAL',
    tags: [],
    visibility: null,
    clubScopeRole: null,
    targetClubIds: null,
    notifyOnPublish: false,
    pinned: false,
    expiresAt: null,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    bodyImageUrls: [],
    eventInfo: null,
    ...overrides,
  };
}

function detailSuccess(detail: NoticeDetail) {
  return { data: detail, isLoading: false, isSuccess: true, isError: false, error: null };
}

function listSuccess(content: unknown[] = []) {
  return { data: { content, totalPages: 1, totalElements: content.length }, isLoading: false, isSuccess: true, isError: false, error: null };
}

describe('NoticeDetailPage (재설계)', () => {
  it('제목과 리드(summary)가 렌더링된다', () => {
    mockUseNoticeDetailQuery.mockReturnValue(detailSuccess(makeDetail({ title: '봄 축제 공지', summary: '봄 축제 일정 안내' })));
    mockUseNoticeListQuery.mockReturnValue(listSuccess());

    render(<NoticeDetailPage />);

    expect(screen.getByRole('heading', { level: 1, name: /봄 축제 공지/ })).toBeInTheDocument();
    expect(screen.getByText('봄 축제 일정 안내')).toBeInTheDocument();
  });

  it('eventInfo 가 있으면 "한눈에 보기" 카드가, 없으면 "공지 정보" 카드가 보인다', () => {
    mockUseNoticeListQuery.mockReturnValue(listSuccess());

    mockUseNoticeDetailQuery.mockReturnValue(detailSuccess(makeDetail({
      eventInfo: { startAt: '2026-09-25T10:00:00', endAt: '2026-09-27T18:00:00', location: '중앙광장', host: '학생자치회', audience: '재학생' },
    })));
    const withEvent = render(<NoticeDetailPage />);
    expect(screen.getByText('한눈에 보기')).toBeInTheDocument();
    expect(screen.getByText('중앙광장')).toBeInTheDocument();
    withEvent.unmount();

    mockUseNoticeDetailQuery.mockReturnValue(detailSuccess(makeDetail({ eventInfo: null })));
    render(<NoticeDetailPage />);
    expect(screen.getByText('공지 정보')).toBeInTheDocument();
  });

  it('bodyImageUrls 가 있으면 "사진" 섹션과 이미지가 렌더링된다', () => {
    mockUseNoticeListQuery.mockReturnValue(listSuccess());
    mockUseNoticeDetailQuery.mockReturnValue(detailSuccess(makeDetail({
      bodyImageUrls: ['https://example.com/b1.png'],
    })));

    render(<NoticeDetailPage />);

    expect(screen.getByText('사진')).toBeInTheDocument();
    expect(screen.getByAltText('본문 이미지 1')).toBeInTheDocument();
  });

  it('linkUrl 이 있으면 "원문 보기" 링크가 노출된다', () => {
    mockUseNoticeListQuery.mockReturnValue(listSuccess());
    mockUseNoticeDetailQuery.mockReturnValue(detailSuccess(makeDetail({ linkUrl: 'https://example.com' })));

    render(<NoticeDetailPage />);

    const link = screen.getByRole('link', { name: /원문 보기/ });
    expect(link).toHaveAttribute('href', 'https://example.com');
  });

  it('관련 공지가 있으면 같은 카테고리 다른 공지가 노출된다', () => {
    mockUseNoticeDetailQuery.mockReturnValue(detailSuccess(makeDetail({ id: 42, category: 'FAIR' })));
    mockUseNoticeListQuery.mockReturnValue(listSuccess([
      { id: 42, title: '자기 자신', category: 'FAIR', createdAt: '2026-05-02T00:00:00Z', summary: '', coverImageUrl: '', linkUrl: null, tags: [], pinned: false, expiresAt: null },
      { id: 99, title: '다른 박람회 공지', category: 'FAIR', createdAt: '2026-05-03T00:00:00Z', summary: '', coverImageUrl: '', linkUrl: null, tags: [], pinned: false, expiresAt: null },
    ]));

    render(<NoticeDetailPage />);

    expect(screen.getByText('다른 박람회 공지')).toBeInTheDocument();
    expect(screen.queryByText('자기 자신')).not.toBeInTheDocument();
  });

  it('expiresAt 이 과거이면 "마감된 공지" 배너가 보인다', () => {
    mockUseNoticeListQuery.mockReturnValue(listSuccess());
    const pastDate = new Date(Date.now() - 86_400_000).toISOString();
    mockUseNoticeDetailQuery.mockReturnValue(detailSuccess(makeDetail({ expiresAt: pastDate })));

    render(<NoticeDetailPage />);

    expect(screen.getByText(/마감된 공지/)).toBeInTheDocument();
  });

  it('403 에러이면 router.replace("/notices") 가 호출된다', async () => {
    mockRouterReplace.mockReset();
    mockUseNoticeListQuery.mockReturnValue(listSuccess());
    mockUseNoticeDetailQuery.mockReturnValue({ data: undefined, isLoading: false, isSuccess: false, isError: true, error: { status: 403 } });

    render(<NoticeDetailPage />);

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/notices');
    });
  });
});
```

- [ ] **Step 2: 상세 테스트 실행**

Run: `cd frontend && pnpm --filter @duing/web test -- --run test/notices/notice-detail-page.test.tsx`
Expected: 7개 모두 통과. (`getByText('중앙광장')` 등 실패 시 렌더 출력 확인 후 쿼리 보정 — 프로덕션 코드는 보고 없이 수정 금지.)

- [ ] **Step 3: 프론트 전체 검증**

Run: `cd frontend && pnpm -r typecheck && pnpm --filter @duing/web lint && pnpm --filter @duing/web test -- --run`
Expected: 전부 통과(린트 사전경고는 무관).

- [ ] **Step 4: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/test/notices/notice-detail-page.test.tsx
git commit -m "test(web): 공지 상세 재설계 통합 테스트 재작성"
```

---

## 완료 정의 (DoD)
- `/notices/[id]` 가 2컬럼 잡지형(3:4 포스터 히어로 + 리드 · 잡지 마크다운 · 자연비율 본문 이미지 · sticky 사이드바)로 렌더.
- eventInfo 유무에 따라 "한눈에 보기" 다크 카드 / "공지 정보" 메타 카드 분기.
- 관련 공지(같은 카테고리 최신, 본인 제외 3개) · 공유(링크 복사) · 원문 링크 · 마감 배너 · 403 리다이렉트 동작.
- A 미배포 시에도 `bodyImageUrls ?? []` / `eventInfo` 옵셔널로 크래시 없음.
- `pnpm -r typecheck` / lint / web test 전부 green. 커밋 5개, **푸시·PR 미수행**.
```
