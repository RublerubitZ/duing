# 공지 상세(`/notices/[id]`) 재설계 — 설계 명세

> 작성일 2026-06-13 · 대상: 두잉 공지 상세 페이지 재디자인 + 이를 뒷받침하는 데이터/어드민 보강

## 1. 목표 & 배경

현재 공지 상세 페이지(`apps/web/app/notices/[noticeId]/page.tsx`)는 760px 단일 컬럼에
뒤로가기·카테고리·커버(16:9)·제목·날짜·요약·마크다운·링크 버튼만 있는 단출한 형태다.
이를 **DESIGN.md(크림 종이 + 딥그린 잉크 에디토리얼) 기반의 2컬럼 잡지형**으로 재설계한다.

레퍼런스로 제시된 "Concept A" 목업은 시각적으로 풍부하지만 조회수·좋아요·작성자명·첨부파일·
관련 공지·이전/다음 글·구조화된 행사정보 등 **실데이터에 없는 요소**에 의존한다. 본 설계는
가짜 데이터를 만들지 않는 선에서 잡지형 비주얼을 살리되, 사이드바의 핵심인 "한눈에 보기" 카드를
채우기 위해 **공지에 구조화된 행사정보 필드와 다중 본문 이미지**를 신규로 추가한다.

## 2. 범위 — 빌드 단위 3개 (1단위 = 1브랜치 = 1PR)

| # | 단위 | 한 줄 요약 | 의존 |
|---|------|-----------|------|
| **A** | 백엔드 — 공지 보강 | `Notice`에 행사정보 + 다중 본문 이미지 필드 추가, 상세 응답 확장 | — |
| **B** | 어드민 FE — 입력 폼 | `NoticeForm`에 행사 정보 섹션 + 다중 이미지 업로더 | A 머지 후 |
| **C** | 공지 상세 FE — 재설계 | **본 요청** — 2컬럼 잡지형 + 3:4 포스터 + 사이드바 | A 머지 후 |

C가 본 요청이며 A·B는 인에이블러다. (행사정보를 포기하면 A·B를 빼고 C만 진행 가능 — 그 경우 사이드바는
행사 카드 대신 "공지 정보" 메타 카드만 노출. 이번엔 **A·B·C 모두 진행**으로 확정.)

### Out of Scope (이번 제외)
조회수 집계 · 좋아요/북마크 · 첨부파일(PDF 등) · 이전/다음 글 네비게이션 ·
카카오/인스타 공유(링크 복사만 제공) · 캘린더 연동(`.ics` 포함 추후) ·
본문 이미지의 마크다운 인라인 정밀 위치 지정(이번엔 별도 '사진' 섹션으로 일괄 노출) ·
리더 클럽공지 작성 폼(`LeaderClubNoticeController` 경로) 변경.

---

## 3. 단위 A — 백엔드 공지 보강

### 3.1 데이터 모델 결정

**접근: `Notice` 단일 테이블에 nullable 컬럼 평면 추가** (별도 1:1 테이블이나 JSON 컬럼 대신 —
4~5개 행사 필드 + 1개 이미지 배열에는 이게 가장 단순하고 검증 가능).

- 행사 필드는 전부 nullable → 행사성이 아닌 공지(GENERAL 등)는 그대로 동작.
- 다섯 행사 필드가 모두 null이면 응답의 `eventInfo`는 `null` (프론트는 한 줄로 분기).
- 본문 이미지는 기존 `tags`(`text[]`) 패턴을 그대로 따른 `body_image_urls text[]` (순서 보존, 기본 빈배열).
- 대표 이미지는 기존 `coverImageUrl`(NOT NULL) 유지 — 상세에서 3:4로 **표시만** 변경.
- `NoticeCardResponse`(목록·관련 공지용)는 **변경 없음**.

### 3.2 Flyway 마이그레이션

신규 파일 `backend/src/main/resources/db/migration/V52__add_notice_event_and_images.sql`
(현재 최신은 V51 — 기존 파일 수정 금지, 신규만):

```sql
ALTER TABLE notice
    ADD COLUMN event_start_at  TIMESTAMP    NULL,
    ADD COLUMN event_end_at    TIMESTAMP    NULL,
    ADD COLUMN location        VARCHAR(200) NULL,
    ADD COLUMN host            VARCHAR(200) NULL,
    ADD COLUMN audience        VARCHAR(200) NULL,
    ADD COLUMN body_image_urls TEXT[]       NOT NULL DEFAULT '{}';
```

### 3.3 엔티티 `Notice`

신규 필드 추가:

```java
@Column(name = "event_start_at") private LocalDateTime eventStartAt;
@Column(name = "event_end_at")   private LocalDateTime eventEndAt;
@Column(length = 200)            private String location;
@Column(length = 200)            private String host;
@Column(length = 200)            private String audience;

@Column(name = "body_image_urls", columnDefinition = "_text", nullable = false)
private String[] bodyImageUrls = new String[0];

public List<String> getBodyImageUrls() {
    return bodyImageUrls == null ? Collections.emptyList()
            : Collections.unmodifiableList(Arrays.asList(bodyImageUrls));
}
```

- `@Builder` 생성자 / `create(...)` 시그니처 / `UpdatePayload` / `update(...)` 에 위 필드 반영.
- `bodyImageUrls`는 `tags`처럼 null 방어 + `.clone()` 후 저장.
- 행사 기간 검증 헬퍼 추가 — `eventStartAt`·`eventEndAt` 둘 다 있으면 `eventEndAt >= eventStartAt`,
  위반 시 `NoticeException.InvalidNoticeScopeException` 계열의 신규/기존 예외로 차단
  (`InvalidNoticeEventException` 신규 권장). `create()`·`update()` 양쪽에서 호출.

### 3.4 호출부 — `GeneralNoticeService` (2곳)

`Notice.create(...)` 시그니처 확장에 따라 두 호출부 모두 수정:

- `create(CreateNoticeCommand)` (L48): command의 행사 필드 + `bodyImageUrls` 전달.
- `createForClub(CreateClubNoticeCommand)` (L138): 클럽 공지엔 행사정보·본문 이미지 없음 →
  `null, null, null, null, null` + `List.of()` 전달 (기존 패턴과 동일하게 명시적).
- `update(UpdateNoticeCommand)` (L82): `UpdatePayload`에 행사 필드 + `bodyImageUrls` + `clearEvent` 반영.

### 3.5 요청/명령 DTO

`CreateNoticeRequest` / `CreateNoticeCommand` / `UpdateNoticeRequest` / `UpdateNoticeCommand`에 추가:

```java
// 공통 추가 필드
LocalDateTime eventStartAt,
LocalDateTime eventEndAt,
@Size(max = 200) String location,
@Size(max = 200) String host,
@Size(max = 200) String audience,
@Size(max = 20) List<@Size(max = 500) String> bodyImageUrls
// UpdateNoticeRequest 에만: Boolean clearEvent (행사정보 전체 비우기)
```

- `bodyImageUrls`는 Create에선 null이면 `List.of()`, Update에선 null이면 변경 안 함(기존 유지),
  빈 배열이면 전부 제거.
- `clearEvent == true`면 다섯 행사 필드 모두 null로 초기화 (`clearExpiresAt` 패턴과 동일).

### 3.6 응답 DTO `NoticeDetailResponse`

```java
public record NoticeDetailResponse(
        // ... 기존 필드 ...
        List<String> bodyImageUrls,
        EventInfo eventInfo            // 다섯 행사 필드가 모두 null이면 null
) {
    public record EventInfo(
            LocalDateTime startAt, LocalDateTime endAt,
            String location, String host, String audience
    ) {
        static EventInfo from(Notice notice) {
            if (notice.getEventStartAt() == null && notice.getEventEndAt() == null
                    && notice.getLocation() == null && notice.getHost() == null
                    && notice.getAudience() == null) {
                return null;
            }
            return new EventInfo(notice.getEventStartAt(), notice.getEventEndAt(),
                    notice.getLocation(), notice.getHost(), notice.getAudience());
        }
    }
}
```

`from(notice, targetClubIds, exposeAdminFields)`에 `bodyImageUrls`·`eventInfo` 매핑 추가.
행사정보·본문 이미지는 **관리자 전용이 아니므로 모든 뷰어에 노출**(visibility 게이트는 기존대로 공지 자체 접근에만 적용).

### 3.7 백엔드 테스트
- `eventInfo` 직렬화: 다섯 필드 모두 null → 응답 `eventInfo == null`, 하나라도 있으면 객체로 노출.
- `body_image_urls` 왕복: 생성 시 N개 저장 → 상세 응답에 순서대로.
- 행사 기간 검증: `eventEndAt < eventStartAt` 생성/수정 요청은 예외.
- `update`의 `clearEvent` → 다섯 필드 null화.
- 클럽 공지 생성 경로가 새 시그니처에서도 정상 동작(행사·이미지 없음).

---

## 4. 단위 B — 어드민 입력 폼

### 4.1 타입 (`packages/types/src/notice.ts`)

```ts
export type NoticeEventInfo = {
  startAt: string;            // ISO
  endAt: string | null;
  location: string | null;
  host: string | null;
  audience: string | null;
};

// NoticeDetail 에 추가
eventInfo: NoticeEventInfo | null;
bodyImageUrls: string[];

// CreateNoticePayload 에 추가
eventStartAt: string | null;
eventEndAt: string | null;
location: string | null;
host: string | null;
audience: string | null;
bodyImageUrls: string[];

// UpdateNoticePayload 에 추가 (모두 optional)
//   eventStartAt?, eventEndAt?, location?, host?, audience?, bodyImageUrls?, clearEvent?
```

`FilePurpose`(`packages/types/src/club.ts`)에 `'NOTICE_BODY'` 추가, 백엔드 `FilePurpose` enum에
`NOTICE_BODY("notice/body")` 추가.

### 4.2 폼 상태 (`parseNoticeFormState.ts`)
`NoticeFormState`·`EMPTY_NOTICE_FORM`·`toCreatePayload`·`toUpdatePayload`(있다면) 및
상세→폼 변환부에 행사 필드 + `bodyImageUrls` 반영. 행사 datetime은 `datetime-local` 문자열로 보관.

### 4.3 `NoticeForm.tsx`
- "대표 이미지" 필드 라벨/설명을 **3:4 포스터 권장**으로 갱신(검증은 강제하지 않음).
- 신규 "행사 정보 (선택)" 섹션: `datetime-local`(시작/종료) + text(`location`/`host`/`audience`).
  하나라도 입력 시 페이로드에 포함, 전부 비우면 Create는 null, Edit는 `clearEvent: true`.
- 신규 "본문 이미지 (선택)" 섹션: **다중 업로더** `NoticeBodyImagesUploader`
  (`useFileUploadMutation({file, purpose:'NOTICE_BODY'})` + `validateImageFile`/`IMAGE_UPLOAD_POLICY` 재사용,
  `PhotoUploader` 로직 모델로). 업로드 결과 URL을 `bodyImageUrls[]`에 append, 썸네일 목록 + 제거 + 순서 이동(↑↓).

### 4.4 어드민 테스트
- 행사 섹션·다중 업로더 렌더 및 입력 → 페이로드 매핑.
- 상세(`eventInfo`/`bodyImageUrls`) → 폼 초기 상태 복원.

---

## 5. 단위 C — 공지 상세 재설계 (본 요청)

### 5.1 구현 방침
- **DESIGN.md Tailwind 토큰 + 기존 `_components`/`.btn`·`.pill` 재사용**으로 구현(라우트의
  `_components`가 이미 Tailwind 기반, 반응형 무료). 페이지 루트는 `className="duing min-h-screen bg-cream"`.
- 컨테이너 `max-w-[1120px] mx-auto px-10`. 본문 2컬럼 `lg:grid-cols-[minmax(0,1fr)_320px] gap-12`,
  `lg` 미만은 단일 컬럼(사이드바가 본문 아래로 스택).

### 5.2 레이아웃

```
[ ExploreNav active="공지" ]
공지 · 소식  ›  {카테고리}                         [ 목록으로 ]   ← 브레드크럼 / 뒤로
┌ Article header (풀폭) ──────────────────────────────────────┐
│ [카테고리] [📌 상단고정] [D-7 / 마감]   ← pill (카테고리색·상태)
│ {title}  ✦                              ← H1 GmarketSans ink-deep
│ (DU·ING) 두잉 공지 · {카테고리 채널}  │  {게시일}            ← 파생 채널 바이라인
└──────────────────────────────── hairline ───────────────────┘
┌ 본문 article (1fr) ─────────────────────┐  ┌ aside sticky 320 ─┐
│ ┌ 3:4 포스터 ┐  리드 = summary (17px)    │  │ ███ 한눈에 보기 ██ │ ← eventInfo
│ │  ~300px   │                          │  │  일시·장소·주최·대상│   없으면 공지정보
│ └───────────┘                          │  ├────────────────────┤
│ ## 마크다운 본문 (잡지 리듬)             │  │ 공유 — 링크 복사    │
│ ── 사진 ── (body_image_urls, 자연 비율)  │  ├────────────────────┤
│ [원문 보기] ← linkUrl                    │  │ 관련 공지           │
│ ── 공유 · 목록으로 ──                    │  │ · A · B · C        │
└─────────────────────────────────────────┘  └────────────────────┘
```

### 5.3 컴포넌트 (`apps/web/app/notices/_components/`)

| 컴포넌트 | 역할 |
|----------|------|
| `NoticeArticleHeader` (신규) | 브레드크럼 + 목록으로 + 상태 pill(카테고리색은 `NoticePage`의 `CATEGORY_TAG_STYLES` 공유, pinned, D-day/마감) + H1 + 파생 채널 바이라인. 기존 `NoticeDetailHeader`는 이 페이지 전용이므로 **대체**(미사용 시 제거) |
| `NoticePosterHero` (신규) | 3:4 커버(`ImageWithFallback` `aspect-[3/4] object-cover`) + 리드(`summary`). 데스크톱은 본문 컬럼 내부 2분할(포스터 ~300px + 리드), 모바일은 스택 |
| `NaturalImage` (신규) | 본문 이미지 전용 — intrinsic `<img className="w-full h-auto rounded-lg">` + `onError` 폴백. (`ImageWithFallback`은 fill·crop 전용이라 자연 비율 불가) |
| `NoticeBodyImages` (신규) | `bodyImageUrls`를 '사진' 헤딩 아래 세로 스택으로 `NaturalImage` 렌더. 비면 `return null` |
| `NoticeEventCard` (신규) | 사이드바 다크(ink) "한눈에 보기" 카드 — `eventInfo`의 일시(기간)·장소·주최·대상. `linkUrl` 있으면 하단 "자세히 보기" CTA |
| `NoticeMetaCard` (신규) | `eventInfo` 없을 때 폴백 — 카테고리·게시일·마감 D-day·태그·원문 링크 |
| `NoticeShareCard` (신규) | "링크 복사"(`navigator.clipboard`) + 복사 피드백. 카카오/인스타 없음 |
| `RelatedNotices` (신규) | 사이드바 "관련 공지" — `useNoticeListQuery({category, page:0, size:6})`, 본인 id 제외 후 3개 |
| `NoticeMarkdown` (수정) | 잡지 리듬으로 재스타일(본문 15.5~16px / line-height 1.85, h2에 sage 좌측 액센트, `[&_img]` 자연 비율). react-markdown 유지 |

기타 재사용: `ExpiredBanner`, `ImageWithFallback`, `Sparkle`/`SparkleFull`, `Icon`, `toRoute`.

### 5.4 보조 로직 (`apps/web/app/notices/_lib/eventFormat.ts`, 신규)
- `formatEventRange(startAt, endAt?)` → `"9.25(목) ~ 9.27(토) · 10:00–18:00"` (종료 없으면 단일 일시).
- `ddayLabel(expiresAt)` → `D-7` / `오늘 마감` / 과거면 `마감`.

### 5.5 데이터 흐름 (`page.tsx`)
- `detail = useNoticeDetailQuery(noticeId)` → `NoticeDetail`(+`eventInfo`, `bodyImageUrls`).
- `related = useNoticeListQuery({ category: notice.category, page:0, size:6 }, enabled = !!notice)`
  → `content`에서 `id !== noticeId` 필터 후 `slice(0,3)`. 결과 0개면 관련 공지 카드 `return null`.
- 서버 상태는 전부 TanStack Query (CLAUDE.md 규칙 — `useEffect` 패칭 금지).

### 5.6 상태 / 빈값 처리
- **403 → `router.replace('/notices')`** (현행 유지). 로딩/에러는 현행 동작 유지하되 스타일만 듀잉화(간단 스켈레톤/문구).
- `eventInfo == null` → `NoticeMetaCard`로 대체.
- `bodyImageUrls` 빈 배열 → '사진' 섹션 미렌더.
- `summary` 빈 문자열 → 리드 생략. `tags` 빈 → 생략. `linkUrl == null` → CTA 생략.
- `coverImageUrl` 로드 실패 → `ImageWithFallback` 폴백(3:4 박스 유지).
- `expiresAt` 과거 → `ExpiredBanner` + 마감 pill(현행 유지).

### 5.7 DESIGN.md 준수 체크
듀잉 스코프 래퍼 · ink/sage/cream 토큰 · `.pill`/`.btn` · 잉크 틴트 섀도(`shadow-1~3`) ·
헤딩 GmarketSans 자동 · 날짜/인덱스 mono · **sage는 장식 전용** · 네오브루탈리즘 금지(1px `border-line`) ·
다크 띠는 사이드바 ink 카드 1회 · 라이트 고정 · CTA 권유형 금지(명사형).

### 5.8 프론트 테스트 (`test/notices/notice-detail-page.test.tsx` 갱신)
기존 모킹 패턴 유지(`ExploreNav`/`NoticeMarkdown`/`@duing/hooks`/`next/navigation` mock). 추가:
- `useNoticeListQuery` mock(관련 공지) — 본인 제외·3개 노출.
- `eventInfo` 있을 때 "한눈에 보기" 카드, 없을 때 "공지 정보" 카드.
- `bodyImageUrls` 렌더(자연 비율 img alt).
- `linkUrl` CTA, `expiresAt` 과거 시 마감 배너, 403 리다이렉트(현행 유지).

---

## 6. 브랜치 / PR 계획
- **A** `feat/notice-event-images-api` — 단위 A, develop 분기 → develop PR.
- **B** `feat/admin-notice-event-images-form` — 단위 B, A 머지 후.
- **C** `feat/notice-detail-redesign` — 단위 C, A 머지 후.
- 커밋: Conventional Commits(`feat(backend): …` / `feat(web): …`). PR 본문: 🚀 작업 내용 / 🤔 고민 / 💬 리뷰 중점 — 파일명 나열 금지, 자연스러운 문장.

## 7. 리스크 / 메모
- `Notice.create` 시그니처 확장이 클럽 공지 경로까지 영향 → 두 호출부 동시 수정 필수(컴파일로 강제됨).
- 본문 이미지는 비율 미저장 → 로드 전 CLS 가능(현 코드도 plain `<img>` — 동일 수준 허용). 추후 width/height 저장으로 개선 여지.
- 관련 공지는 별도 엔드포인트 없이 기존 list 재사용 → viewer scope·페이지네이션이 이미 처리됨(추가 백엔드 0).
