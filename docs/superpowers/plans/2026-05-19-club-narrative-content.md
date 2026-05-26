# 동아리 서술형 콘텐츠 3개 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Club 에 tagline / highlights / majorProjects 3 필드를 추가해 학생 소개 탭의 디자인 원본 (한 줄 태그라인 / "이런 사람이 좋아할 거예요" 불릿 / "주요 프로젝트" 단락) 을 완성한다.

**Architecture:** (1) Flyway V23 컬럼 3 추가, (2) Club 엔티티 + `update()` 시그니처 (19-arg), (3) `UpdateClubCommand` / `UpdateClubRequest` / `ClubDetailQuery` / `ClubDetailResponse` 동시 확장, (4) 신규 `HighlightsRepeater.tsx` + `ClubInfoForm` 새 fieldset, (5) `ClubDetailAbout` 4-prop 확장 + `ClubDetailTabs.hasIntro` 4 항목 OR.

**Tech Stack:** Spring Boot 3.4, Java 21, Flyway, JPA (Hibernate 6), Next.js 15, React 19, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-19-club-narrative-content-design.md`

**Branch:** `feat/club-narrative-content`

---

## File Structure

**Create:**
- `backend/src/main/resources/db/migration/V23__alter_club_add_narrative_content.sql`
- `backend/src/test/java/com/duing/domain/club/service/ClubNarrativeUpdateTest.java`
- `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/HighlightsRepeater.tsx`
- `frontend/apps/web/test/manage/highlights-repeater.test.tsx`
- `frontend/apps/web/test/clubs/club-detail-about.test.tsx`

**Modify:**
- `backend/src/main/java/com/duing/domain/club/entity/Club.java`
- `backend/src/main/java/com/duing/domain/club/service/dto/command/UpdateClubCommand.java`
- `backend/src/main/java/com/duing/domain/club/controller/dto/request/UpdateClubRequest.java`
- `backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java`
- `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubDetailQuery.java`
- `backend/src/main/java/com/duing/domain/club/controller/dto/response/ClubDetailResponse.java`
- `backend/src/test/java/com/duing/domain/club/entity/ClubUpdateTest.java` (3 call sites)
- `backend/src/test/java/com/duing/domain/club/service/ClubUpdateServiceTest.java` (5 call sites)
- `backend/src/test/java/com/duing/domain/club/service/ClubMetadataUpdateTest.java` (1 call site)
- `frontend/packages/types/src/club.ts`
- `frontend/packages/schemas/src/index.ts`
- `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx`
- `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailAbout.tsx`
- `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailTabs.tsx`

---

## Task 1: Flyway V23 마이그레이션

**Files:**
- Create: `backend/src/main/resources/db/migration/V23__alter_club_add_narrative_content.sql`

- [ ] **Step 1: 파일 작성**

```sql
-- 동아리 소개 탭 서술형 콘텐츠 3종 (모두 nullable, highlights 만 빈 배열 기본).
ALTER TABLE club ADD COLUMN IF NOT EXISTS tagline VARCHAR(60);
ALTER TABLE club ADD COLUMN IF NOT EXISTS highlights JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE club ADD COLUMN IF NOT EXISTS major_projects TEXT;
```

EOF newline 포함.

- [ ] **Step 2: 컴파일**

Run from `backend/`: `./gradlew compileJava`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Commit**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/resources/db/migration/V23__alter_club_add_narrative_content.sql
git commit -m "feat(backend): club 서술형 콘텐츠 컬럼 3개 추가 (Flyway V23)"
```

---

## Task 2: Club 엔티티 필드 + `update()` 시그니처 확장

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/entity/Club.java`

### Step 1 — 필드 3개 추가

기존 `private String membershipFee;` 다음에 추가 (Plan A 의 7 메타 필드 마지막 자리):

```java
@Column(name = "tagline", length = 60)
private String tagline;

@JdbcTypeCode(SqlTypes.JSON)
@Column(name = "highlights", columnDefinition = "jsonb", nullable = false)
private List<String> highlights = new ArrayList<>();

@Column(name = "major_projects", columnDefinition = "TEXT")
private String majorProjects;
```

`@JdbcTypeCode`, `SqlTypes` 는 기존 `faqs` 필드와 동일하게 이미 import 되어 있음.

### Step 2 — `getHighlights()` 헬퍼

기존 `getFaqs()` 다음에 추가:

```java
public List<String> getHighlights() {
    return Collections.unmodifiableList(highlights);
}
```

### Step 3 — `update(...)` 시그니처 확장

기존 16-arg `update(...)` 메서드 (Plan A 후) 마지막 인자 `String membershipFee` 다음에 3개 추가:

```java
public void update(
        String name,
        ClubCategory category,
        String division,
        String description,
        String logoUrl,
        String coverUrl,
        List<String> tags,
        List<ClubSnsLink> snsLinks,
        List<ClubFaq> faqs,
        Integer foundedYear,
        Integer cohortNumber,
        String location,
        String contactEmail,
        Integer activityFrequency,
        Set<DayOfWeek> activeDays,
        String membershipFee,
        String tagline,
        List<String> highlights,
        String majorProjects
) {
    // ... 기존 body 그대로 유지 후 끝에 추가:
    if (tagline != null) this.tagline = tagline;
    if (highlights != null) this.highlights = new ArrayList<>(highlights);
    if (majorProjects != null) this.majorProjects = majorProjects;
}
```

> 위 본문에서 기존 16-arg 시점의 `if (...) this.X = X;` 16 라인은 그대로 유지. 마지막에 3 라인 추가.

### Step 4 — 컴파일 (호출처 깨질 수 있음)

Run from `backend/`: `./gradlew compileJava 2>&1 | tail -20`
Expected: `GeneralClubService.update(...)` 호출처에서 인자 부족 컴파일 에러 — Task 3 에서 함께 보정.

> **이 시점에 commit 하지 않는다**. 다음 task 와 묶어 한 commit 으로.

---

## Task 3: `UpdateClubCommand` / `UpdateClubRequest` 확장 + 서비스 호출처 + 기존 test 호출처

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/dto/command/UpdateClubCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/dto/request/UpdateClubRequest.java`
- Modify: `backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java`
- Modify: `backend/src/test/java/com/duing/domain/club/entity/ClubUpdateTest.java`
- Modify: `backend/src/test/java/com/duing/domain/club/service/ClubUpdateServiceTest.java`
- Modify: `backend/src/test/java/com/duing/domain/club/service/ClubMetadataUpdateTest.java`

### Step 1 — `UpdateClubCommand.java` 필드 추가

기존 18개 record 컴포넌트 끝에 3개 추가:

```java
String tagline,
List<String> highlights,
String majorProjects
```

### Step 2 — `UpdateClubRequest.java` 필드 + 검증 + `toCommand` 보강

`membershipFee` 필드 다음에 추가:

```java
@Size(max = 60, message = "한 줄 태그라인은 60자 이하여야 합니다.")
String tagline,

@Size(max = 10, message = "강조 항목은 최대 10개까지 가능합니다.")
List<@Size(min = 1, max = 100, message = "각 강조 항목은 1~100자여야 합니다.") String> highlights,

String majorProjects
```

`toCommand(clubId, requesterId)` 의 `new UpdateClubCommand(...)` 호출 끝에 3개 인자 추가:

```java
tagline, highlights, majorProjects
```

### Step 3 — `GeneralClubService.update()` 호출처 보정

기존 `club.update(...)` 호출의 16-arg 끝에 3개 인자 추가:

```java
club.update(
        newName,
        updateClubCommand.category(),
        updateClubCommand.division(),
        updateClubCommand.description(),
        updateClubCommand.logoUrl(),
        updateClubCommand.coverUrl(),
        updateClubCommand.tags(),
        updateClubCommand.snsLinks(),
        updateClubCommand.faqs(),
        updateClubCommand.foundedYear(),
        updateClubCommand.cohortNumber(),
        updateClubCommand.location(),
        updateClubCommand.contactEmail(),
        updateClubCommand.activityFrequency(),
        updateClubCommand.activeDays(),
        updateClubCommand.membershipFee(),
        updateClubCommand.tagline(),
        updateClubCommand.highlights(),
        updateClubCommand.majorProjects()
);
```

### Step 4 — 기존 test 호출처 보정 (총 9곳)

다음 호출처들의 마지막에 `null, null, null` 추가:

**File: `backend/src/test/java/com/duing/domain/club/entity/ClubUpdateTest.java`** (3 곳)

`club.update(...)` 16-arg 호출들 → 19-arg.

- Line 16~의 호출: 인자 18개 (16 기존 + 7 메타 = 16. 잠깐, Plan A 후 16-arg 였음. 즉 `null, null, null` 3개 추가하면 19-arg)
- Line 45~ 의 호출
- Line 57~ 의 호출

**File: `backend/src/test/java/com/duing/domain/club/service/ClubUpdateServiceTest.java`** (5 곳)

`new UpdateClubCommand(...)` 18-arg 호출들 → 21-arg (record 의 첫 2개 clubId/requesterId + 16 + 3 = 21).

각 호출에 `null, null, null` 추가.

**File: `backend/src/test/java/com/duing/domain/club/service/ClubMetadataUpdateTest.java`** (1 곳)

`new UpdateClubCommand(...)` 끝에 `null, null, null` 추가.

### Step 5 — 컴파일

Run from `backend/`: `./gradlew compileJava compileTestJava 2>&1 | tail -5`
Expected: BUILD SUCCESSFUL.

### Step 6 — Commit (Task 2 + 3 묶음)

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/club/entity/Club.java \
        backend/src/main/java/com/duing/domain/club/service/dto/command/UpdateClubCommand.java \
        backend/src/main/java/com/duing/domain/club/controller/dto/request/UpdateClubRequest.java \
        backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java \
        backend/src/test/java/com/duing/domain/club/entity/ClubUpdateTest.java \
        backend/src/test/java/com/duing/domain/club/service/ClubUpdateServiceTest.java \
        backend/src/test/java/com/duing/domain/club/service/ClubMetadataUpdateTest.java
git commit -m "feat(backend): Club에 서술형 콘텐츠 3필드 + update 시그니처 확장"
```

---

## Task 4: `ClubDetailQuery` / `ClubDetailResponse` 3 필드 임베드

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubDetailQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/dto/response/ClubDetailResponse.java`

### Step 1 — `ClubDetailQuery.java`

기존 마지막 record 컴포넌트 (`activeRecruitment`) 앞에 3개 추가 (메타 / 서술 / active 순서 보존):

```java
// ... 기존 ...
String membershipFee,
String tagline,
List<String> highlights,
String majorProjects,
StudentRecruitmentProjection activeRecruitment
```

`of(...)` 정적 팩토리의 생성자 호출에 3개 인자 추가 (membershipFee 다음, activeRecruitment 앞):

```java
club.getMembershipFee(),
club.getTagline(),
club.getHighlights(),
club.getMajorProjects(),
activeRecruitment
```

### Step 2 — `ClubDetailResponse.java`

record 컴포넌트 같은 위치에 3개 추가. `from(detailQuery)` 매핑도 동일하게 보강:

```java
detailQuery.membershipFee(),
detailQuery.tagline(),
detailQuery.highlights(),
detailQuery.majorProjects(),
detailQuery.activeRecruitment()
```

### Step 3 — 컴파일

Run from `backend/`: `./gradlew compileJava compileTestJava 2>&1 | tail -5`
Expected: BUILD SUCCESSFUL.

### Step 4 — Commit

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/club/service/dto/query/ClubDetailQuery.java \
        backend/src/main/java/com/duing/domain/club/controller/dto/response/ClubDetailResponse.java
git commit -m "feat(backend): ClubDetail 응답에 서술형 콘텐츠 3필드 노출"
```

---

## Task 5: 백엔드 통합 테스트 `ClubNarrativeUpdateTest`

**Files:**
- Create: `backend/src/test/java/com/duing/domain/club/service/ClubNarrativeUpdateTest.java`

### Step 1 — 테스트 작성

```java
package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.command.UpdateClubCommand;
import com.duing.domain.club.service.dto.query.ClubDetailQuery;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
@DirtiesContext
class ClubNarrativeUpdateTest {

    @Autowired ClubService clubService;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("tagline/highlights/majorProjects 를 업데이트하면 ClubDetail 응답에 그대로 반영된다")
    void updateAndReadNarrativeContent() throws Exception {
        User leader = saveUser("서술리더");
        Club club = saveActiveClub("서술동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        clubService.update(new UpdateClubCommand(
                club.getId(), leader.getId(),
                null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null,
                "코드를 두잉",
                List.of("개발 기초 다진 사람", "사이드 프로젝트 동료 필요한 사람"),
                "올해는 이번 학기 박람회 부스 안내 앱을 만들고 있어요."
        ));

        ClubDetailQuery detail = clubService.getById(club.getId());
        assertThat(detail.tagline()).isEqualTo("코드를 두잉");
        assertThat(detail.highlights())
                .containsExactly("개발 기초 다진 사람", "사이드 프로젝트 동료 필요한 사람");
        assertThat(detail.majorProjects())
                .isEqualTo("올해는 이번 학기 박람회 부스 안내 앱을 만들고 있어요.");
    }

    @Test
    @DisplayName("highlights 를 빈 리스트로 업데이트하면 응답에서도 빈 리스트가 반환된다")
    void updateEmptyHighlights() throws Exception {
        User leader = saveUser("빈리스트리더");
        Club club = saveActiveClub("빈리스트동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        clubService.update(new UpdateClubCommand(
                club.getId(), leader.getId(),
                null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null,
                null, List.of(), null
        ));

        ClubDetailQuery detail = clubService.getById(club.getId());
        assertThat(detail.highlights()).isEmpty();
    }

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "u" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()
        ));
    }

    private Club saveActiveClub(String name) throws Exception {
        Club club = Club.create(name + "-" + sequence.incrementAndGet(),
                com.duing.domain.club.entity.ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, com.duing.domain.club.entity.ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }
}
```

### Step 2 — 컴파일

Run from `backend/`: `./gradlew compileTestJava 2>&1 | tail -5`
Expected: BUILD SUCCESSFUL.

Docker 가용 시:
```bash
./gradlew test --tests "ClubNarrativeUpdateTest" 2>&1 | tail -10
```
Expected: 2 PASS.

### Step 3 — Commit

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/test/java/com/duing/domain/club/service/ClubNarrativeUpdateTest.java
git commit -m "test(backend): Club 서술형 콘텐츠 업데이트/조회 통합 테스트"
```

---

## Task 6: 프론트 타입 + Zod 스키마 확장

**Files:**
- Modify: `frontend/packages/types/src/club.ts`
- Modify: `frontend/packages/schemas/src/index.ts`

### Step 1 — `club.ts` 의 `ClubDetail` / `UpdateClubPayload` 확장

`ClubDetail` 의 `membershipFee` 다음, `activeRecruitment` 앞에 3 필드:

```ts
tagline: string | null;
highlights: string[];
majorProjects: string | null;
```

`UpdateClubPayload` 의 `membershipFee` 다음에 3 필드 (optional):

```ts
tagline?: string | null;
highlights?: string[];
majorProjects?: string | null;
```

### Step 2 — Zod `updateClubSchema` 확장

`membershipFee` 다음에 3 필드:

```ts
tagline: z.string().max(60, '한 줄 태그라인은 60자 이하여야 합니다.').nullable().optional(),
highlights: z
  .array(z.string().min(1, '강조 항목은 비어 있을 수 없습니다.').max(100, '각 강조 항목은 100자 이하여야 합니다.'))
  .max(10, '강조 항목은 최대 10개까지 가능합니다.')
  .optional(),
majorProjects: z.string().nullable().optional(),
```

### Step 3 — Verify

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -w typecheck 2>&1 | tail -10
```

`apps/web` 의 mock 에서 `ClubDetail` 리터럴이 새 필드 누락으로 에러날 수 있음 → Task 9 에서 보정.

### Step 4 — Commit

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/packages/types/src/club.ts frontend/packages/schemas/src/index.ts
git commit -m "feat(frontend): Club 서술형 콘텐츠 타입 + Zod 스키마 확장"
```

---

## Task 7: `HighlightsRepeater.tsx` 신규

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/HighlightsRepeater.tsx`

### Step 1 — 컴포넌트 작성 (FaqsRepeater 패턴)

```tsx
'use client';

type HighlightsRepeaterProps = {
  value: string[];
  onChange: (next: string[]) => void;
  readOnly?: boolean;
  maxItems?: number;
  maxLength?: number;
};

export function HighlightsRepeater({
  value, onChange, readOnly = false, maxItems = 10, maxLength = 100,
}: HighlightsRepeaterProps) {
  function update(idx: number, next: string) {
    onChange(value.map((item, i) => (i === idx ? next : item)));
  }

  function add() {
    if (value.length >= maxItems) return;
    onChange([...value, '']);
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      {value.map((item, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            type="text"
            value={item}
            onChange={(event) => update(idx, event.target.value)}
            placeholder="예: 사이드 프로젝트 동료가 필요한 사람"
            maxLength={maxLength}
            disabled={readOnly}
            className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          {!readOnly && (
            <button
              type="button"
              onClick={() => remove(idx)}
              className="text-sm text-slate-500 hover:text-rose-600"
            >
              삭제
            </button>
          )}
        </div>
      ))}
      {!readOnly && value.length < maxItems && (
        <button
          type="button"
          onClick={add}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          + 강조 항목 추가 ({value.length}/{maxItems})
        </button>
      )}
    </div>
  );
}
```

EOF newline 포함.

### Step 2 — 타입체크

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -w typecheck 2>&1 | tail -5
```

### Step 3 — Commit

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/manage/clubs/[clubId]/info/_components/HighlightsRepeater.tsx
git commit -m "feat(frontend): HighlightsRepeater 컴포넌트 추가"
```

---

## Task 8: `ClubInfoForm` 에 새 fieldset "소개 콘텐츠" 추가

**Files:**
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx`

### Step 1 — import 추가

상단 import 영역에 추가:

```tsx
import { HighlightsRepeater } from './HighlightsRepeater';
```

### Step 2 — state 추가

기존 `useState` 블록의 `membershipFee` state 다음에 추가:

```tsx
const [tagline, setTagline] = useState(detail.tagline ?? '');
const [highlights, setHighlights] = useState<string[]>(detail.highlights ?? []);
const [majorProjects, setMajorProjects] = useState(detail.majorProjects ?? '');
```

### Step 3 — `buildPayload()` 확장

`return payload;` 앞에 3 분기 추가:

```tsx
if (tagline !== (detail.tagline ?? '')) {
  payload.tagline = tagline || null;
}
if (JSON.stringify(highlights) !== JSON.stringify(detail.highlights)) {
  payload.highlights = highlights;
}
if (majorProjects !== (detail.majorProjects ?? '')) {
  payload.majorProjects = majorProjects || null;
}
```

### Step 4 — `fullData` 확장

handleSubmit 의 `fullData` 객체에 3 필드 추가:

```tsx
tagline: tagline || null,
highlights,
majorProjects: majorProjects || null,
```

### Step 5 — JSX 새 fieldset 추가

기존 "상세 정보" fieldset 다음, SNS/FAQ fieldset 앞에 새 fieldset 삽입:

```tsx
<fieldset disabled={readOnly} className="space-y-4 rounded-lg border border-slate-200 p-4">
  <legend className="px-2 text-sm font-medium text-slate-700">소개 콘텐츠</legend>

  <label className="block">
    <span className="block text-sm text-slate-600">한 줄 태그라인</span>
    <input
      type="text"
      value={tagline}
      maxLength={60}
      onChange={(event) => setTagline(event.target.value)}
      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      placeholder="예: 코드를 두잉"
    />
    <span className="mt-1 block text-xs text-slate-400">{tagline.length}/60</span>
  </label>

  <div>
    <span className="block text-sm text-slate-600">이런 사람이 좋아할 거예요</span>
    <p className="mb-2 text-xs text-slate-400">최대 10개, 각 100자 이하.</p>
    <HighlightsRepeater
      value={highlights}
      onChange={setHighlights}
      readOnly={readOnly}
    />
  </div>

  <label className="block">
    <span className="block text-sm text-slate-600">주요 프로젝트</span>
    <textarea
      value={majorProjects}
      onChange={(event) => setMajorProjects(event.target.value)}
      rows={5}
      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      placeholder="동아리에서 진행 중이거나 마친 프로젝트를 자유롭게 적어주세요."
    />
  </label>
</fieldset>
```

### Step 6 — 타입체크 + 빌드

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -w typecheck 2>&1 | tail -5
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm build 2>&1 | tail -5
```

### Step 7 — Commit

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx
git commit -m "feat(frontend): ClubInfoForm에 '소개 콘텐츠' fieldset 추가"
```

---

## Task 9: `ClubDetailAbout` 4-prop 확장 + `ClubDetailTabs.hasIntro` 확장 + mock 보정

**Files:**
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailAbout.tsx`
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailTabs.tsx`
- Modify: `frontend/apps/web/test/clubs/club-detail-tabs.test.tsx`

### Step 1 — `ClubDetailAbout.tsx` 전체 교체

```tsx
type Props = {
  description: string | null;
  tagline: string | null;
  highlights: string[];
  majorProjects: string | null;
};

export function ClubDetailAbout({ description, tagline, highlights, majorProjects }: Props) {
  const hasAny = description !== null
    || tagline !== null
    || highlights.length > 0
    || majorProjects !== null;
  if (!hasAny) return null;

  return (
    <article className="max-w-[700px] text-[15.5px] leading-relaxed text-charcoal">
      {tagline && <h2 className="mb-4 text-[28px] font-bold text-ink-deep">{tagline}</h2>}
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

### Step 2 — `ClubDetailTabs.tsx` 의 `hasIntro` 확장 + `<ClubDetailAbout>` 호출 보정

기존 `hasIntro`:

```tsx
const hasIntro = club.description !== null;
```

→ 변경:

```tsx
const hasIntro = club.description !== null
  || club.tagline !== null
  || club.highlights.length > 0
  || club.majorProjects !== null;
```

기존 `<ClubDetailAbout description={club.description} />` 를 다음으로 교체:

```tsx
<ClubDetailAbout
  description={club.description}
  tagline={club.tagline}
  highlights={club.highlights}
  majorProjects={club.majorProjects}
/>
```

### Step 3 — `club-detail-tabs.test.tsx` mock 보정

`baseClub` mock 에 새 필드 3개 추가 (`activeRecruitment` 앞):

```tsx
tagline: null,
highlights: [],
majorProjects: null,
```

### Step 4 — 타입체크 + 테스트 + 빌드

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -w typecheck 2>&1 | tail -5
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm test -- --run 2>&1 | tail -10
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm build 2>&1 | tail -5
```

### Step 5 — Commit

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailAbout.tsx \
        frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailTabs.tsx \
        frontend/apps/web/test/clubs/club-detail-tabs.test.tsx
git commit -m "feat(frontend): ClubDetailAbout 4-prop 확장 + 소개 탭 hasIntro 조건 확장"
```

---

## Task 10: 프론트 단위 테스트 (HighlightsRepeater + ClubDetailAbout)

**Files:**
- Create: `frontend/apps/web/test/manage/highlights-repeater.test.tsx`
- Create: `frontend/apps/web/test/clubs/club-detail-about.test.tsx`

### Step 1 — `highlights-repeater.test.tsx`

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HighlightsRepeater } from '../../app/manage/clubs/[clubId]/info/_components/HighlightsRepeater';

describe('HighlightsRepeater', () => {
  it('+ 강조 항목 추가 버튼을 누르면 빈 항목이 onChange 로 전달된다', () => {
    const onChange = vi.fn();
    render(<HighlightsRepeater value={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /강조 항목 추가/ }));
    expect(onChange).toHaveBeenLastCalledWith(['']);
  });

  it('삭제 버튼을 누르면 해당 항목이 빠진 새 배열이 전달된다', () => {
    const onChange = vi.fn();
    render(<HighlightsRepeater value={['a', 'b']} onChange={onChange} />);

    const deleteButtons = screen.getAllByRole('button', { name: '삭제' });
    fireEvent.click(deleteButtons[0] as HTMLButtonElement);
    expect(onChange).toHaveBeenLastCalledWith(['b']);
  });

  it('최대 개수에 도달하면 추가 버튼이 사라진다', () => {
    render(<HighlightsRepeater value={['a','b','c','d','e','f','g','h','i','j']} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /강조 항목 추가/ })).toBeNull();
  });
});
```

### Step 2 — `club-detail-about.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ClubDetailAbout } from '../../app/clubs/[clubId]/_components/ClubDetailAbout';

describe('ClubDetailAbout', () => {
  it('모든 필드가 비면 컨테이너 자체를 렌더링하지 않는다 (null 반환)', () => {
    const { container } = render(
      <ClubDetailAbout description={null} tagline={null} highlights={[]} majorProjects={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('tagline 만 있으면 h2 만 노출된다', () => {
    render(<ClubDetailAbout description={null} tagline="코드를 두잉" highlights={[]} majorProjects={null} />);
    expect(screen.getByRole('heading', { level: 2, name: '코드를 두잉' })).toBeInTheDocument();
    expect(screen.queryByText('이런 사람이 좋아할 거예요')).toBeNull();
    expect(screen.queryByText('주요 프로젝트')).toBeNull();
  });

  it('highlights 만 있으면 강조 섹션만 노출된다', () => {
    render(
      <ClubDetailAbout
        description={null}
        tagline={null}
        highlights={['개발 기초 다진 사람', '동료가 필요한 사람']}
        majorProjects={null}
      />,
    );
    expect(screen.getByText('이런 사람이 좋아할 거예요')).toBeInTheDocument();
    expect(screen.getByText('개발 기초 다진 사람')).toBeInTheDocument();
    expect(screen.getByText('동료가 필요한 사람')).toBeInTheDocument();
  });

  it('4개 모두 있으면 모든 섹션이 노출된다', () => {
    render(
      <ClubDetailAbout
        description="설명"
        tagline="태그"
        highlights={['x']}
        majorProjects="프로젝트"
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: '태그' })).toBeInTheDocument();
    expect(screen.getByText('설명')).toBeInTheDocument();
    expect(screen.getByText('이런 사람이 좋아할 거예요')).toBeInTheDocument();
    expect(screen.getByText('주요 프로젝트')).toBeInTheDocument();
  });
});
```

### Step 3 — 실행 + 전체 회귀

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm test -- --run 2>&1 | tail -10
```
Expected: 모든 테스트 PASS (기존 + 신규).

### Step 4 — Commit

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend/apps/web/test/manage/highlights-repeater.test.tsx \
        frontend/apps/web/test/clubs/club-detail-about.test.tsx
git commit -m "test(frontend): HighlightsRepeater + ClubDetailAbout 단위 테스트"
```

---

## Task 11: PR 직전 self-check + PR 생성

### Step 1 — 7항목 self-check

```bash
echo "=== 1. 컴파일/빌드/테스트 ==="
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew compileJava compileTestJava 2>&1 | tail -3
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm -w typecheck 2>&1 | tail -3
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm test -- --run 2>&1 | tail -3
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend/apps/web && pnpm build 2>&1 | tail -3

echo "=== 2. 변경 범위 ==="
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git diff --stat develop..HEAD

echo "=== 3. 다른 측면 영향 ==="
echo "- Club.update 시그니처 변경 → 기존 18-arg 호출처 모두 19-arg 로 보정 (test 9곳)"
echo "- 응답 신규 필드 추가만이라 기존 클라이언트 호환 (필드 무시 가능)"

echo "=== 4. EOF newline ==="
for f in $(git diff --name-only develop..HEAD); do
  [ -f "$f" ] || continue
  case "$f" in
    *.java|*.tsx|*.ts|*.sql) test "$(tail -c 1 "$f" | xxd -p)" = "0a" || echo "MISSING newline: $f" ;;
  esac
done

echo "=== 5. 커밋 형식 ==="
git log --format="%s" develop..HEAD | grep -v "^\(feat\|fix\|chore\|refactor\|test\|docs\)" || echo "OK — all Conventional Commits"
```

모두 SUCCESS 여야 함. 미흡 항목 있으면 처리 후 다시 검증.

### Step 2 — push + PR

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git push -u origin feat/club-narrative-content
gh pr create --base develop --title "feat: 동아리 서술형 콘텐츠 3종 (tagline / highlights / majorProjects)" --body "$(cat <<'EOF'
## 🚀 작업 내용
- Club 도메인에 한 줄 태그라인, "이런 사람이 좋아할 거예요" 강조 리스트, "주요 프로젝트" 텍스트 3 필드를 추가했습니다.
- 관리자 동아리 정보 폼에 새 "소개 콘텐츠" fieldset 을 추가했습니다. `HighlightsRepeater` 로 강조 항목을 최대 10개까지 추가/삭제할 수 있습니다.
- 학생 측 소개 탭(`ClubDetailAbout`) 이 4개 prop 으로 확장돼 디자인 원본과 동일한 구성(태그라인 h2 → 본문 → 강조 리스트 → 주요 프로젝트) 으로 표시됩니다.
- 소개 탭 노출 조건(`hasIntro`) 이 4개 필드 OR 로 확장됐습니다. 어느 필드라도 있으면 탭이 보입니다.

## 🤔 고민했던 내용
- `Club.update()` 가 19-arg 로 늘었습니다. 후속 spec 에서 `UpdateClubPayload` record 도입으로 정리할 예정입니다.
- `majorProjects` 는 단일 TEXT 로 자유 서술 패턴을 택했습니다. 연도별/프로젝트별 구조화는 운영 요청이 생기면 별도 spec.
- `highlights` 의 아이콘은 디자인 원본 그대로 고정 체크 아이콘을 사용했습니다. 운영자 선택 옵션은 두지 않았습니다.

## 🔍 Out of Scope
- `UpdateClubPayload` record 도입 (별도 후속 spec)
- `majorProjects` 의 markdown / rich text 지원
- `highlights` 아이콘 커스터마이즈
- 소개 탭 외 화면(탐색 카드, 캘린더) 에서 tagline 활용

## 💬 리뷰 중점사항
- `Club.update()` 의 새 19-arg 시그니처와 그에 맞춘 9곳의 test 호출처 보정.
- `HighlightsRepeater` 의 추가/삭제/최대 도달 시 버튼 사라짐 동작.
- `ClubDetailAbout` 의 4-prop 분기 + 빈 데이터 null 반환 정책.
EOF
)"
```

---

## Self-Review

- [x] **스펙 커버리지**
  - 모델 3 필드 — Task 1/2 ✓
  - DTO 확장 — Task 3/4 ✓
  - 백엔드 통합 테스트 — Task 5 ✓
  - 프론트 타입/스키마 — Task 6 ✓
  - `HighlightsRepeater` — Task 7 ✓
  - `ClubInfoForm` 새 fieldset — Task 8 ✓
  - `ClubDetailAbout` 확장 + `hasIntro` 변경 — Task 9 ✓
  - 단위 테스트 — Task 10 ✓
- [x] **플레이스홀더 검사** — 모든 코드 블록 완성, TBD/TODO 없음.
- [x] **타입 일관성** — 19-arg `Club.update`, 21-arg `UpdateClubCommand` (`clubId/requesterId` + 16 + 3), 3 필드 (`tagline: string | null`, `highlights: string[]`, `majorProjects: string | null`) 모두 백엔드/프론트/mock 동일.
- [x] **DRY** — JSONB 매핑은 `Club.faqs` 패턴 재사용, Repeater 는 `FaqsRepeater` 구조 따름.
- [x] **TDD** — 백엔드 통합 테스트 Task 5, 프론트 단위 테스트 Task 10.
- [x] **자주 커밋** — 11 task ≈ 10 commit + PR 단계.
- [x] **PR 직전 self-check** — Task 11 의 7 항목 체크리스트 명시.