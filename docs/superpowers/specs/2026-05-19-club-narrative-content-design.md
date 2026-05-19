# 동아리 서술형 콘텐츠 3개 — tagline / highlights / majorProjects

작성일: 2026-05-19

## 1. 배경 / 목표

PR3 / Plan A·B·C 에서 디자인 원본의 학생 소개 탭 안의 서술형 콘텐츠 3개가 누락된 채로 남아 있다.

- "코드를 두잉" 같은 **한 줄 태그라인** (Hero h2)
- "이런 사람이 좋아할 거예요" **불릿 리스트**
- "2025년 주요 프로젝트" **텍스트 단락**

본 spec 은 이 3개 필드를 Club 도메인에 추가하고 운영자 입력 폼 → 학생 소개 탭 표시까지 한 번의 PR 로 마무리한다. 사용자 가시 기능 추가 가치가 가장 큰 후속 작업.

## 2. 모델

### 추가 필드 (3개, 모두 nullable / `highlights` 만 NOT NULL DEFAULT `[]`)

| 필드 | DB 타입 | 엔티티 타입 | 검증 |
|---|---|---|---|
| `tagline` | `VARCHAR(60)` | `String` | `@Size(max=60)` |
| `highlights` | `JSONB NOT NULL DEFAULT '[]'` | `List<String>` | List ≤ 10, 각 1~100자 |
| `majorProjects` | `TEXT` | `String` | — (자유 서술) |

### `highlights` JSONB 매핑

기존 `Club.faqs` 패턴 그대로:

```java
@JdbcTypeCode(SqlTypes.JSON)
@Column(name = "highlights", columnDefinition = "jsonb", nullable = false)
private List<String> highlights = new ArrayList<>();

public List<String> getHighlights() {
    return Collections.unmodifiableList(highlights);
}
```

### Flyway `V23__alter_club_add_narrative_content.sql`

```sql
ALTER TABLE club ADD COLUMN IF NOT EXISTS tagline VARCHAR(60);
ALTER TABLE club ADD COLUMN IF NOT EXISTS highlights JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE club ADD COLUMN IF NOT EXISTS major_projects TEXT;
```

## 3. 백엔드 변경

### `Club` 엔티티

- 새 필드 3개 + `getHighlights()` 헬퍼
- `update(...)` 시그니처에 3개 인자 추가 → **19-arg**. (후속 `UpdateClubPayload` record 도입은 별도 spec)
- null-skip 패턴 유지

### `UpdateClubCommand` (record)

기존 18개 record 컴포넌트 끝에 3개 추가:

```java
String tagline,
List<String> highlights,
String majorProjects
```

### `UpdateClubRequest` (record)

검증 어노테이션 포함:

```java
@Size(max = 60, message = "한 줄 태그라인은 60자 이하여야 합니다.")
String tagline,

@Size(max = 10, message = "강조 항목은 최대 10개까지 가능합니다.")
List<@Size(min = 1, max = 100, message = "각 강조 항목은 1~100자여야 합니다.") String> highlights,

String majorProjects
```

`toCommand(...)` 매핑에 3개 인자 추가.

### `ClubDetailQuery` / `ClubDetailResponse`

record 끝에 3개 필드 + `of(...)` / `from(...)` 매핑에 3개 인자 추가.

### `GeneralClubService.update`

기존 `club.update(...)` 호출에 3개 인자 추가만. 다른 로직 무변경.

### 기존 호출처 보정

`UpdateClubCommand(...)` / `club.update(...)` 18-arg 호출이 19-arg 로 변하므로 다음 파일의 호출처를 모두 `null` 3개 추가로 보정:

- `backend/src/test/java/com/duing/domain/club/entity/ClubUpdateTest.java`
- `backend/src/test/java/com/duing/domain/club/service/ClubUpdateServiceTest.java`
- `backend/src/test/java/com/duing/domain/club/service/ClubMetadataUpdateTest.java`
- (grep 으로 추가 발견 시 동일 보정)

### 신규 테스트 `ClubNarrativeUpdateTest`

- 3개 필드 update 후 read round-trip
- highlights 빈 리스트, 1개, 10개 (경계값) 케이스
- highlights 11개 → Zod 검증은 프론트, 백엔드 검증은 Bean Validation `@Size(max=10)` 에 의존 (별도 단위 테스트 없이 schema/필드 검증 신뢰)

## 4. 프론트엔드 변경

### 타입 (`packages/types/src/club.ts`)

`ClubDetail` 끝에 3개 필드:

```ts
tagline: string | null;
highlights: string[];
majorProjects: string | null;
```

`UpdateClubPayload` 끝에 3개 optional:

```ts
tagline?: string | null;
highlights?: string[];
majorProjects?: string | null;
```

### Zod 스키마 (`packages/schemas/src/index.ts`)

`updateClubSchema` 에 3개 필드:

```ts
tagline: z.string().max(60, '한 줄 태그라인은 60자 이하여야 합니다.').nullable().optional(),
highlights: z
  .array(z.string().min(1, '강조 항목은 비어 있을 수 없습니다.').max(100, '각 강조 항목은 100자 이하여야 합니다.'))
  .max(10, '강조 항목은 최대 10개까지 가능합니다.')
  .optional(),
majorProjects: z.string().nullable().optional(),
```

### 관리자 폼

**`HighlightsRepeater.tsx` (신규)** — 기존 `FaqsRepeater` 패턴.
- 항목 추가/삭제/순서 변경(↑/↓)
- 각 행: `<input>` (max 100, char counter)
- 최대 10개 도달 시 "추가" 버튼 disabled
- props: `{ value: string[]; onChange: (next: string[]) => void; disabled?: boolean }`

**`ClubInfoForm.tsx` 변경** — 기존 "상세 정보" fieldset 다음에 새 fieldset "소개 콘텐츠":

- `<input>` tagline (max 60, char counter)
- `<HighlightsRepeater>` for highlights
- `<textarea rows={5}>` majorProjects

`buildPayload()` 에 diff 분기 3개 추가 (기존 패턴).
`fullData` (handleSubmit 안) 에 3개 필드 추가.

### 학생측 `ClubDetailAbout.tsx` 재작성

기존:
```tsx
type Props = { description: string | null };
```

→ 변경:
```tsx
type Props = {
  description: string | null;
  tagline: string | null;
  highlights: string[];
  majorProjects: string | null;
};

export function ClubDetailAbout({ description, tagline, highlights, majorProjects }: Props) {
  const hasAny = description || tagline || highlights.length > 0 || majorProjects;
  if (!hasAny) return null;

  return (
    <article className="max-w-[700px] text-[15.5px] leading-relaxed text-charcoal">
      {tagline && <h2 className="mb-4 text-[28px]">{tagline}</h2>}
      {description && <p className="mb-6 whitespace-pre-wrap">{description}</p>}

      {highlights.length > 0 && (
        <>
          <h3 className="mt-6 mb-3 font-bold text-ink-deep">이런 사람이 좋아할 거예요</h3>
          <ul className="mb-6 space-y-2">
            {highlights.map((item, idx) => (
              <li key={idx} className="flex gap-3">
                <span className="text-ink">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {majorProjects && (
        <>
          <h3 className="mt-6 mb-3 font-bold text-ink-deep">주요 프로젝트</h3>
          <p className="whitespace-pre-wrap">{majorProjects}</p>
        </>
      )}
    </article>
  );
}
```

### `ClubDetailTabs.tsx`

`hasIntro` 판정 확장:

```tsx
const hasIntro = club.description !== null
  || club.tagline !== null
  || club.highlights.length > 0
  || club.majorProjects !== null;
```

`<ClubDetailAbout>` 호출에 prop 3개 추가:

```tsx
<ClubDetailAbout
  description={club.description}
  tagline={club.tagline}
  highlights={club.highlights}
  majorProjects={club.majorProjects}
/>
```

### 단위 테스트

- `HighlightsRepeater`: 추가/삭제/순서 변경 동작
- `ClubDetailAbout`: 빈 데이터 케이스 (모두 비면 null, 일부만 있을 때 각 섹션 노출)

## 5. 구현 순서

단일 PR. 내부 commit 단위:

1. Flyway V23
2. Club 엔티티 3 필드 + `update()` 시그니처 확장 (19-arg)
3. `UpdateClubCommand` / `UpdateClubRequest` 3 필드 + 검증 + 기존 test 호출처 보정
4. `ClubDetailQuery` / `ClubDetailResponse` 3 필드 임베드
5. 백엔드 통합 테스트 `ClubNarrativeUpdateTest`
6. 프론트 타입 + Zod 스키마 확장
7. `HighlightsRepeater.tsx` 신규
8. `ClubInfoForm` 새 fieldset "소개 콘텐츠" 추가
9. `ClubDetailAbout` 4-prop 확장 + `ClubDetailTabs.hasIntro` 확장 + 호출처 보정
10. 프론트 단위 테스트 (HighlightsRepeater, ClubDetailAbout)

각 commit 자체 컴파일/테스트 클린.

## 6. 리스크 / 체크 포인트

- **`Club.update()` 19-arg** — 후속 `UpdateClubPayload` record spec 으로 정리 예정.
- **기존 통합 테스트 호출처 보정** — grep `UpdateClubCommand(`, `club.update(` 으로 모두 식별 후 `null` 3개 추가.
- **JSONB ordering** — JSON 배열 순서 자연 보존.
- **운영 영향** — backfill: `tagline=null`, `highlights=[]`, `majorProjects=null` 로 신규 컬럼 채워짐. 학생 UI 자동 숨김.
- **`hasIntro` 변경** — 기존 description 만 있던 케이스 그대로 유지 + 신규 필드 만 있어도 노출. UX 자연.

## 7. Out of Scope

- **`UpdateClubPayload` record 도입** — `Club.update()` 의 19-arg 정리. 별도 spec.
- **`majorProjects` markdown / rich text** — 단순 TEXT + `whitespace-pre-wrap`. 운영자가 줄바꿈으로 단락.
- **`highlights` icon 커스터마이즈** — 고정 체크 아이콘. 운영자 선택 옵션 없음.
- **`tagline` i18n / 다국어** — 단일 String, 한국어.
- **`majorProjects` 연도별 / 프로젝트별 구조화** — 단일 TEXT 로 결정. 후속 PR 에서 필요해지면 모델 변경.
- **소개 탭 외 다른 화면 (탐색 카드, 캘린더) 에서 tagline 활용** — 본 spec 은 소개 탭만.
- **운영 데이터 마이그레이션** — 신규 컬럼 자동 backfill. 운영자가 필요 시 직접 채움.
