# 동아리 정보 편집 페이지 리디자인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영진 콘솔 동아리 정보 편집 페이지를 목업 기준으로 전면 리디자인한다 — 잠금 필드(총동연 관리), 회장 전화 자동 연동 + `ContactVisibility` 공개 범위, 회비 구조화(`FeeCycle`+금액), 프로젝트 카드(`ProjectIcon`), SNS 4종+기타, Sticky Preview.

**Architecture:** BE는 V91 마이그레이션으로 4개 컬럼 신설 + `sns_links` 데이터 변환 후, 리더/어드민 요청 DTO를 분리하고 상세 응답에 `contactPhone` 게이트를 넣는다(PR-1). FE는 타입·스키마·학생 페이지를 새 계약으로 갱신하고(PR-2), `ClubInfoForm`을 `mode: 'leader'|'officer'|'admin'` 기반 8카드 + Sticky Preview 구조로 전면 재작성한다(PR-3).

**Tech Stack:** Backend — Spring Boot 3.4 / Java 21, RestAssured + TestContainers. Frontend — Next.js 15 / React 19, TanStack Query, zod, dnd-kit, lucide-react, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-22-club-profile-redesign-design.md` (§ 참조는 이 문서 기준)

## Global Constraints

- **PR 분리:** PR-1(backend, Task 1~4) → PR-2(frontend 데이터+학생 페이지, Task 5~6) → PR-3(frontend 폼 리디자인, Task 7~9). 브랜치: `feat/club-profile-redesign-be` → `feat/club-profile-redesign-fe-data`(PR-1 HEAD에서 분기, 스택) → `feat/club-profile-redesign-fe-form`(PR-2 HEAD에서 분기). 머지는 PR-1→2→3 순서, 스택 PR 머지 시 base 삭제 없이 머지→base 재지정 절차 준수.
- **⚠️ 배포 금지 구간:** PR-1 머지 후 PR-3 머지 전까지 develop을 prod에 배포하지 않는다. 최종 배포는 3개 모두 머지 후 BE·FE 동반 릴리스.
- **커밋:** Conventional Commits `feat(backend): ...` / `feat(frontend): ...`, 한국어. `[#이슈번호]` 형식 금지. `Co-Authored-By`/`🤖 Generated` 라인 절대 금지.
- **push·PR 생성은 사용자 지시 후에만.** 계획의 커밋 단계는 전부 로컬 커밋.
- **Backend:** DDD 구조·네이밍, DTO는 `record`, 검증 메시지 한국어, Flyway 기존 파일 수정 금지. 빌드는 `backend/` cwd에서 `./gradlew test`, 출력에서 `BUILD SUCCESSFUL` 확인(`| tail` 금지).
- **Frontend:** `any`·`as` 금지, 타입은 `type`, 네트워크는 `@duing/api` 경유, `useQuery` 내부 모킹 금지. 명령은 `frontend/` cwd에서 `pnpm lint && pnpm typecheck && pnpm test`.
- **검증 백스톱 원칙(§4.4):** highlights BE/zod 10 유지(FE 추가만 7 제한), tagline 60 유지(입력 20), tags 개당 20자 유지(FE 입력 5자 제한). **BE/zod를 조이면 기존 데이터 저장 전체가 깨진다.**
- **리뷰:** 모든 Task는 `duing-code-reviewer`(BE) 또는 spec 리뷰 + `codex:review`. Task 1·2·3·4(권한·Migration·API contract)는 `codex:adversarial-review` 추가. 리뷰어 모델에 sonnet/haiku 금지.
- **구현 서브에이전트 프롬프트에 push·PR 생성 금지 명시.**

---

# PR-1 · Backend

## Task 1: V91 마이그레이션 + 도메인 enum/엔티티 개편

**Files:**
- Create: `backend/src/main/resources/db/migration/V91__club_profile_redesign.sql`
- Create: `backend/src/main/java/com/duing/domain/club/entity/ContactVisibility.java`
- Create: `backend/src/main/java/com/duing/domain/club/entity/FeeCycle.java`
- Create: `backend/src/main/java/com/duing/domain/club/entity/ProjectIcon.java`
- Create: `backend/src/main/java/com/duing/domain/club/entity/ClubProject.java`
- Modify: `backend/src/main/java/com/duing/domain/club/entity/ClubSnsLink.java`
- Modify: `backend/src/main/java/com/duing/domain/club/entity/Club.java`
- Test: `backend/src/test/java/com/duing/domain/club/entity/ClubProfileUpdateTest.java` (신규, 순수 단위 테스트)

**Interfaces:**
- Consumes: 기존 `Club.UpdatePayload` / `Club.update()` / `blankToNull()`.
- Produces (이후 Task 전부가 의존):
  - `enum ContactVisibility { PUBLIC, LOGGED_IN_ONLY, PRIVATE }`
  - `enum FeeCycle { NONE, ONE_TIME, SEMESTER, YEARLY, MONTHLY }`
  - `enum ProjectIcon { CODE, TROPHY, USERS, ROCKET, BOOK, CAMERA, PALETTE, MUSIC, MIC, GLOBE, HEART, LEAF, BRIEFCASE, LIGHTBULB, FLASK, GAMEPAD, DUMBBELL, GRADUATION, MONITOR, SPARKLES }`
  - `record ClubProject(ProjectIcon icon, String title, String subtitle)` — compact 생성자에서 title strip, subtitle blank→null
  - `ClubSnsLink(String platform, String label, String url)` + `normalized()` — platform 허용값 `INSTAGRAM|FACEBOOK|KAKAO|OTHER`
  - `Club` getter: `getContactVisibility()`, `getMembershipFeeAmount()`, `getFeeCycle()`, `getProjects()`
  - `Club.UpdatePayload`에서 `contactEmail`/`membershipFee`/`majorProjects` **제거**, `contactVisibility`/`membershipFeeAmount`/`feeCycle`/`projects` **추가** (name/category/division/college/clearCollege는 어드민용으로 유지)

- [ ] **Step 1: 브랜치 생성**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git checkout develop && git pull
git checkout -b feat/club-profile-redesign-be
```

- [ ] **Step 2: 실패하는 단위 테스트 작성**

`backend/src/test/java/com/duing/domain/club/entity/ClubProfileUpdateTest.java`:

```java
package com.duing.domain.club.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ClubProfileUpdateTest {

    private Club createClub() {
        return Club.create("두잉코드", ClubCategory.ACADEMIC, "학술", "소개", null);
    }

    private Club.UpdatePayload emptyPayload() {
        return new Club.UpdatePayload(
                null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null);
    }

    @Test
    @DisplayName("새로 생성된 동아리는 공개 범위 PUBLIC, 회비 NONE(금액 없음), 프로젝트 빈 목록으로 시작한다")
    void defaults() {
        Club club = createClub();
        assertThat(club.getContactVisibility()).isEqualTo(ContactVisibility.PUBLIC);
        assertThat(club.getFeeCycle()).isEqualTo(FeeCycle.NONE);
        assertThat(club.getMembershipFeeAmount()).isNull();
        assertThat(club.getProjects()).isEmpty();
    }

    @Test
    @DisplayName("납부 주기를 NONE 으로 바꾸면 회비 금액이 함께 비워진다")
    void feeCycleNoneClearsAmount() {
        Club club = createClub();
        club.update(payloadWithFee(FeeCycle.SEMESTER, 30000));
        assertThat(club.getMembershipFeeAmount()).isEqualTo(30000);

        club.update(payloadWithFee(FeeCycle.NONE, 30000)); // 금액이 실려 와도 NONE 이면 무시
        assertThat(club.getFeeCycle()).isEqualTo(FeeCycle.NONE);
        assertThat(club.getMembershipFeeAmount()).isNull();
    }

    @Test
    @DisplayName("OTHER 가 아닌 SNS 플랫폼의 label 은 저장 시 null 로 정규화된다")
    void snsLabelNormalized() {
        Club club = createClub();
        Club.UpdatePayload payload = payloadWithSns(List.of(
                new ClubSnsLink("INSTAGRAM", "무시될라벨", "https://instagram.com/doing"),
                new ClubSnsLink("OTHER", " GitHub ", "https://github.com/doing")));
        club.update(payload);
        assertThat(club.getSnsLinks().get(0).label()).isNull();
        assertThat(club.getSnsLinks().get(1).label()).isEqualTo("GitHub");
    }

    @Test
    @DisplayName("프로젝트의 부제목이 공백이면 null 로 정규화된다")
    void projectSubtitleNormalized() {
        ClubProject project = new ClubProject(ProjectIcon.CODE, " 알고리즘 스터디 ", "  ");
        assertThat(project.title()).isEqualTo("알고리즘 스터디");
        assertThat(project.subtitle()).isNull();
    }

    // ---- payload helpers: 아래 두 헬퍼는 emptyPayload() 와 동일한 24개 인자 순서에서
    //      해당 필드만 채운다. UpdatePayload record 정의(Step 4)의 컴포넌트 순서를 따를 것.
    private Club.UpdatePayload payloadWithFee(FeeCycle feeCycle, Integer amount) {
        return new Club.UpdatePayload(
                null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                feeCycle, amount, null, null, null, null, null);
    }

    private Club.UpdatePayload payloadWithSns(List<ClubSnsLink> snsLinks) {
        return new Club.UpdatePayload(
                null, null, null, null, null, null, null, snsLinks, null,
                null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null);
    }
}
```

- [ ] **Step 3: 실패 확인**

```bash
cd backend && ./gradlew test --tests ClubProfileUpdateTest
```
Expected: 컴파일 실패 (`ContactVisibility`, `FeeCycle`, `ClubProject` 미정의).

- [ ] **Step 4: 구현**

`ContactVisibility.java`:

```java
package com.duing.domain.club.entity;

/** 대표 연락처(회장 전화) 공개 범위. 기본 PUBLIC — 외부 업체·협찬사가 비로그인으로도 연락 가능하도록. */
public enum ContactVisibility {
    PUBLIC,
    LOGGED_IN_ONLY,
    PRIVATE
}
```

`FeeCycle.java`:

```java
package com.duing.domain.club.entity;

/** 회비 납부 주기. NONE 은 "회비 없음"이며 이때 membershipFeeAmount 는 반드시 null (DB CHECK 백스톱). */
public enum FeeCycle {
    NONE,
    ONE_TIME,
    SEMESTER,
    YEARLY,
    MONTHLY
}
```

`ProjectIcon.java`:

```java
package com.duing.domain.club.entity;

/** 프로젝트 카드 대표 아이콘. FE lucide 매핑(CODE→Code 등)과 이중 목록 — 변경 시 FE 동시 수정. */
public enum ProjectIcon {
    CODE, TROPHY, USERS, ROCKET, BOOK, CAMERA, PALETTE, MUSIC, MIC, GLOBE,
    HEART, LEAF, BRIEFCASE, LIGHTBULB, FLASK, GAMEPAD, DUMBBELL, GRADUATION,
    MONITOR, SPARKLES
}
```

`ClubProject.java`:

```java
package com.duing.domain.club.entity;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** 주요 프로젝트 카드 항목 (JSONB 배열 원소). 순서는 배열 순서가 곧 표시 순서. */
public record ClubProject(
        @NotNull(message = "프로젝트 아이콘은 필수입니다.")
        ProjectIcon icon,

        @NotNull(message = "프로젝트 제목은 필수입니다.")
        @Size(min = 1, max = 30, message = "프로젝트 제목은 1~30자여야 합니다.")
        String title,

        @Size(max = 40, message = "프로젝트 부제목은 40자 이하여야 합니다.")
        String subtitle
) {
    public ClubProject {
        title = title == null ? null : title.strip();
        subtitle = subtitle == null || subtitle.isBlank() ? null : subtitle.strip();
    }
}
```

`ClubSnsLink.java` (전체 교체):

```java
package com.duing.domain.club.entity;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 기본 4종(INSTAGRAM/FACEBOOK/KAKAO) + OTHER(플랫폼명 직접 입력).
 * 과거 X/YOUTUBE/WEB 값은 V91 에서 OTHER + label 로 데이터 변환됐다.
 */
public record ClubSnsLink(
        @NotNull(message = "SNS 플랫폼은 필수입니다.")
        @Pattern(regexp = "INSTAGRAM|FACEBOOK|KAKAO|OTHER",
                message = "허용된 SNS 플랫폼이 아닙니다.")
        String platform,

        @Size(max = 20, message = "플랫폼명은 20자 이하여야 합니다.")
        String label,

        @NotNull(message = "SNS URL은 필수입니다.")
        @Size(min = 1, max = 500, message = "SNS URL은 1~500자여야 합니다.")
        @Pattern(regexp = "^https?://.+", message = "SNS URL은 http(s):// 로 시작해야 합니다.")
        String url
) {
    @AssertTrue(message = "기타 플랫폼은 플랫폼명을 입력해야 합니다.")
    public boolean isLabelPresentForOther() {
        return !"OTHER".equals(platform) || (label != null && !label.isBlank());
    }

    /** OTHER 외 플랫폼의 label 은 저장하지 않는다 — 요청에 실려 와도 null 정규화 (§4.2). */
    public ClubSnsLink normalized() {
        if ("OTHER".equals(platform)) {
            return new ClubSnsLink(platform, label == null ? null : label.strip(), url);
        }
        return label == null ? this : new ClubSnsLink(platform, null, url);
    }
}
```

`Club.java` 수정 — 필드 추가(기존 `majorProjects` 필드 선언 아래):

```java
    @Enumerated(EnumType.STRING)
    @Column(name = "contact_visibility", nullable = false, length = 20)
    private ContactVisibility contactVisibility = ContactVisibility.PUBLIC;

    @Column(name = "membership_fee_amount")
    private Integer membershipFeeAmount;

    @Enumerated(EnumType.STRING)
    @Column(name = "fee_cycle", nullable = false, length = 20)
    private FeeCycle feeCycle = FeeCycle.NONE;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "projects", columnDefinition = "jsonb", nullable = false)
    private List<ClubProject> projects = new ArrayList<>();
```

getter 추가(`getHighlights()` 아래):

```java
    public List<ClubProject> getProjects() {
        return Collections.unmodifiableList(projects);
    }
```

`UpdatePayload` record 교체 (contactEmail/membershipFee/majorProjects 제거, 4필드 추가 — **이 순서가 Task 1 테스트 헬퍼·Task 2 Command 와 계약**):

```java
    public record UpdatePayload(
            String name,                      // 1
            ClubCategory category,            // 2
            String division,                  // 3
            String description,               // 4
            String logoUrl,                   // 5
            String coverUrl,                  // 6
            List<String> tags,                // 7
            List<ClubSnsLink> snsLinks,       // 8
            List<ClubFaq> faqs,               // 9
            Integer foundedYear,              // 10
            Integer cohortNumber,             // 11
            String location,                  // 12
            Integer activityFrequency,        // 13
            Set<DayOfWeek> activeDays,        // 14
            String tagline,                   // 15
            List<String> highlights,          // 16
            ContactVisibility contactVisibility, // 17
            FeeCycle feeCycle,                // 18
            Integer membershipFeeAmount,      // 19
            List<ClubProject> projects,       // 20
            College college,                  // 21
            Boolean clearCollege,             // 22
            Boolean clearLogoImage,           // 23
            Boolean clearCoverImage           // 24
    ) {}
```

`update()` 수정 — `contactEmail`/`membershipFee`/`majorProjects` 분기 3줄 삭제 후 추가:

```java
        if (payload.contactVisibility() != null) this.contactVisibility = payload.contactVisibility();
        if (payload.feeCycle() != null) {
            // 회비는 주기+금액 쌍으로만 갱신 — NONE 이면 금액을 무조건 비운다 (DB CHECK 정합).
            this.feeCycle = payload.feeCycle();
            this.membershipFeeAmount =
                    payload.feeCycle() == FeeCycle.NONE ? null : payload.membershipFeeAmount();
        }
        if (payload.projects() != null) this.projects = new ArrayList<>(payload.projects());
```

기존 snsLinks 분기를 정규화 적용으로 교체:

```java
        if (payload.snsLinks() != null) {
            this.snsLinks = payload.snsLinks().stream()
                    .map(ClubSnsLink::normalized)
                    .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
        }
```

(엔티티의 `contactEmail`·`membershipFee`·`majorProjects` **필드는 유지** — 컬럼이 남아 있으므로. 갱신 경로만 제거.)

`V91__club_profile_redesign.sql`:

```sql
-- 동아리 프로필 리디자인 — 대표 연락처 공개 범위 · 회비 구조화 · 프로젝트 카드 · SNS 4종 개편.
-- contact_email / membership_fee / major_projects 는 논리 제거(API 미사용) — 컬럼 drop 은 후속 마이그레이션.
ALTER TABLE club ADD COLUMN IF NOT EXISTS contact_visibility VARCHAR(20) NOT NULL DEFAULT 'PUBLIC';
ALTER TABLE club ADD COLUMN IF NOT EXISTS membership_fee_amount INTEGER;
ALTER TABLE club ADD COLUMN IF NOT EXISTS fee_cycle VARCHAR(20) NOT NULL DEFAULT 'NONE';
ALTER TABLE club ADD COLUMN IF NOT EXISTS projects JSONB NOT NULL DEFAULT '[]'::jsonb;

-- NONE ⇔ 금액 없음 (양방향), 금액은 양수 (스펙 §3.2)
ALTER TABLE club ADD CONSTRAINT chk_club_fee_cycle_amount
    CHECK ((fee_cycle = 'NONE') = (membership_fee_amount IS NULL));
ALTER TABLE club ADD CONSTRAINT chk_club_fee_amount_positive
    CHECK (membership_fee_amount IS NULL OR membership_fee_amount > 0);

-- 기존 X / YOUTUBE / WEB 플랫폼을 OTHER + label 로 보존 변환 (스펙 §3.3)
UPDATE club
SET sns_links = (
    SELECT COALESCE(jsonb_agg(
        CASE
            WHEN element->>'platform' = 'X'
                THEN jsonb_set(jsonb_set(element, '{platform}', '"OTHER"'), '{label}', '"X"')
            WHEN element->>'platform' = 'YOUTUBE'
                THEN jsonb_set(jsonb_set(element, '{platform}', '"OTHER"'), '{label}', '"YouTube"')
            WHEN element->>'platform' = 'WEB'
                THEN jsonb_set(jsonb_set(element, '{platform}', '"OTHER"'), '{label}', '"Website"')
            ELSE element
        END ORDER BY ordinality), '[]'::jsonb)
    FROM jsonb_array_elements(sns_links) WITH ORDINALITY AS entries(element, ordinality)
)
WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements(sns_links) AS entries(element)
    WHERE element->>'platform' IN ('X', 'YOUTUBE', 'WEB')
);
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
cd backend && ./gradlew test --tests ClubProfileUpdateTest
```
Expected: PASS. (이 시점에 `UpdateClubCommand`/`UpdateClubRequest`가 옛 `UpdatePayload` 시그니처를 참조해 **전체 컴파일은 깨진 상태** — Task 2에서 해소하므로 `--tests` 단위 실행이 아닌 전체 빌드는 아직 돌리지 않는다. 만약 단위 테스트 컴파일이 프로덕션 소스 오류로 막히면 Task 2 Step 3까지 함께 진행한 뒤 커밋을 분리한다.)

- [ ] **Step 6: 커밋**

```bash
git add backend/src/main/resources/db/migration/V91__club_profile_redesign.sql backend/src/main/java/com/duing/domain/club/entity/ backend/src/test/java/com/duing/domain/club/entity/ClubProfileUpdateTest.java
git commit -m "feat(backend): 동아리 프로필 도메인 개편 — 공개범위·회비 구조화·프로젝트 카드 (V91)"
```

- [ ] **Step 7: V91 변환 SQL 검수 (dev DB 드라이런)** — MCP supabase(개발 DB, 읽기 전용)에서 변환 대상 존재 여부만 확인:

```sql
SELECT id, sns_links FROM club
WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(sns_links) AS entries(element)
              WHERE element->>'platform' IN ('X','YOUTUBE','WEB'));
```
대상 행이 있으면 변환 CASE 가 그 데이터 모양(키 이름 `platform`/`url`)과 맞는지 눈으로 검증. **쓰기 실행 금지** — 실제 변환은 배포 시 Flyway 가 수행.

---

## Task 2: 리더용 요청 DTO 개편 (잠금 필드·논리 제거 필드 삭제)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/controller/dto/request/UpdateClubRequest.java` (전체 재작성)
- Modify: `backend/src/main/java/com/duing/domain/club/service/dto/command/UpdateClubCommand.java` (전체 재작성)
- Modify: `backend/src/main/java/com/duing/domain/club/api/ClubApi.java:56-57` (설명 갱신)
- Test: `backend/src/test/java/com/duing/domain/club/controller/ClubUpdateControllerTest.java` (기존 수정 + 신규 케이스)

**Interfaces:**
- Consumes: Task 1 의 `Club.UpdatePayload`(24개 컴포넌트 순서), `ContactVisibility`, `FeeCycle`, `ClubProject`.
- Produces:
  - `UpdateClubRequest` — 리더용. **없는 필드**: name/category/division/college/clearCollege/contactEmail/membershipFee/majorProjects. `toCommand(Long clubId, Long requesterId)` 는 잠금 필드 자리에 null 을 넣어 Command 를 만든다.
  - `UpdateClubCommand` — 어드민까지 커버하는 슈퍼셋(잠금 필드 포함). `toPayload()` → `Club.UpdatePayload`.

- [ ] **Step 1: 기존 테스트 파일을 새 계약으로 수정 + 신규 실패 테스트 추가**

`ClubUpdateControllerTest.java` 를 열어:
1. 요청 바디에서 `contactEmail`/`membershipFee`/`majorProjects`/`name`/`category`/`division`/`college` 를 쓰는 기존 케이스를 새 필드로 치환하거나 삭제한다(응답 단언도 동일).
2. 아래 신규 케이스를 **같은 파일의 기존 setUp/헬퍼(리더 계정 생성·토큰 발급 패턴)를 그대로 재사용**해 추가한다:

```java
    @Test
    @DisplayName("리더가 요청 바디에 동아리명을 실어 보내도 무시되고 이름은 바뀌지 않는다")
    void lockedFieldIgnored() {
        // given: 리더 토큰, ACTIVE 동아리 (기존 setUp 재사용)
        // when: PATCH /api/v1/clubs/{clubId} body = {"name":"해킹시도","location":"학생회관 101호"}
        // then: 200, 응답 name 은 기존 이름 그대로, location 만 변경
    }

    @Test
    @DisplayName("납부 주기 없이 회비 금액만 보내면 400 이다")
    void feeAmountWithoutCycleRejected() {
        // body = {"membershipFeeAmount": 30000} → 400
    }

    @Test
    @DisplayName("납부 주기가 NONE 인데 금액이 있으면 400 이다")
    void feeNoneWithAmountRejected() {
        // body = {"feeCycle":"NONE","membershipFeeAmount":30000} → 400
    }

    @Test
    @DisplayName("주기와 금액을 쌍으로 보내면 회비가 저장되고 응답에 반영된다")
    void feePairSaved() {
        // body = {"feeCycle":"SEMESTER","membershipFeeAmount":30000}
        // → 200, 응답 feeCycle=SEMESTER, membershipFeeAmount=30000
    }

    @Test
    @DisplayName("허용 목록에 없는 프로젝트 아이콘은 400 이다")
    void invalidProjectIconRejected() {
        // body = {"projects":[{"icon":"EMOJI","title":"t","subtitle":null}]} → 400 (enum 역직렬화 실패)
    }

    @Test
    @DisplayName("프로젝트는 6개를 초과할 수 없다")
    void projectsMaxSix() {
        // projects 7개 → 400
    }

    @Test
    @DisplayName("기타 SNS 플랫폼은 플랫폼명이 없으면 400 이다")
    void snsOtherRequiresLabel() {
        // body = {"snsLinks":[{"platform":"OTHER","label":null,"url":"https://a.b"}]} → 400
    }

    @Test
    @DisplayName("기타가 아닌 SNS 플랫폼의 label 은 저장되지 않는다")
    void snsNonOtherLabelDropped() {
        // body = {"snsLinks":[{"platform":"INSTAGRAM","label":"라벨","url":"https://instagram.com/x"}]}
        // → 200, 응답 snsLinks[0].label == null
    }

    @Test
    @DisplayName("대표 연락처 공개 범위를 변경할 수 있다")
    void contactVisibilityUpdated() {
        // body = {"contactVisibility":"PRIVATE"} → 200, 응답 contactVisibility=PRIVATE
    }
```

각 케이스의 주석은 구현 지침이며, 실제 코드는 같은 파일의 기존 케이스와 동일한 RestAssured 패턴(`given().header("Authorization", bearer)...patch(...)` + `then().statusCode(...)` + `body(...)` 단언)으로 완성한다. 주석만 남기는 것 금지.

- [ ] **Step 2: 실패 확인**

```bash
cd backend && ./gradlew compileTestJava
```
Expected: 컴파일 실패 (새 요청 필드 미정의).

- [ ] **Step 3: 구현**

`UpdateClubRequest.java` (전체 교체):

```java
package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.entity.ClubFaq;
import com.duing.domain.club.entity.ClubProject;
import com.duing.domain.club.entity.ClubSnsLink;
import com.duing.domain.club.entity.ContactVisibility;
import com.duing.domain.club.entity.FeeCycle;
import com.duing.domain.club.service.dto.command.UpdateClubCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.DayOfWeek;
import java.util.List;
import java.util.Set;

/**
 * 리더(운영진) 프로필 수정 요청. 동아리명·카테고리·분과·단과대학은 총동연 전용(AdminUpdateClubRequest) —
 * 이 요청에는 필드 자체가 없어 API 로도 수정할 수 없다. null/미포함 필드는 변경되지 않는다.
 */
public record UpdateClubRequest(
        String description,

        @Size(max = 500, message = "로고 URL은 500자 이하여야 합니다.")
        @Pattern(regexp = "^$|^https?://.+$|^/[^/\\\\].*$",
                message = "로고 URL은 http:// 또는 https:// 로 시작하거나 / 로 시작하는 내부 경로여야 합니다.")
        String logoUrl,

        @Size(max = 500, message = "커버 URL은 500자 이하여야 합니다.")
        @Pattern(regexp = "^$|^https?://.+$|^/[^/\\\\].*$",
                message = "커버 URL은 http:// 또는 https:// 로 시작하거나 / 로 시작하는 내부 경로여야 합니다.")
        String coverUrl,

        @Size(max = 20, message = "태그는 최대 20개까지 가능합니다.")
        List<@Size(min = 1, max = 20, message = "각 태그는 1~20자여야 합니다.") String> tags,

        @Size(max = 10, message = "SNS 링크는 최대 10개까지 가능합니다.")
        List<@Valid ClubSnsLink> snsLinks,

        @Size(max = 20, message = "FAQ는 최대 20개까지 가능합니다.")
        List<@Valid ClubFaq> faqs,

        @Min(value = 1900, message = "창설년도는 1900 이상이어야 합니다.")
        @Max(value = 2100, message = "창설년도가 너무 큽니다.")
        Integer foundedYear,

        @Min(value = 1, message = "기수는 1 이상이어야 합니다.")
        Integer cohortNumber,

        @Size(max = 200, message = "위치는 200자 이하여야 합니다.")
        String location,

        @Min(value = 1, message = "활동 빈도는 1 이상이어야 합니다.")
        Integer activityFrequency,

        Set<DayOfWeek> activeDays,

        @Size(max = 60, message = "한줄 소개는 60자 이하여야 합니다.")
        String tagline,

        @Size(max = 10, message = "강조 항목은 최대 10개까지 가능합니다.")
        List<@Size(min = 1, max = 100, message = "각 강조 항목은 1~100자여야 합니다.") String> highlights,

        ContactVisibility contactVisibility,

        FeeCycle feeCycle,

        @Min(value = 1, message = "회비 금액은 1원 이상이어야 합니다.")
        @Max(value = 10_000_000, message = "회비 금액이 너무 큽니다.")
        Integer membershipFeeAmount,

        @Size(max = 6, message = "주요 프로젝트는 최대 6개까지 가능합니다.")
        List<@Valid ClubProject> projects,

        Boolean clearLogoImage,

        Boolean clearCoverImage
) {
    /** 회비는 주기+금액 쌍 전송 규약 (§4.3) — 주기 없이 금액만, NONE+금액, 유료 주기+금액 누락 전부 거부. */
    @AssertTrue(message = "회비는 납부 주기와 금액을 함께 보내야 하며, 회비 없음(NONE)은 금액 없이 보내야 합니다.")
    public boolean isFeePairConsistent() {
        if (feeCycle == null) return membershipFeeAmount == null;
        if (feeCycle == FeeCycle.NONE) return membershipFeeAmount == null;
        return membershipFeeAmount != null;
    }

    public UpdateClubCommand toCommand(Long clubId, Long requesterId) {
        return new UpdateClubCommand(
                clubId, requesterId,
                null, null, null,                       // name, category, division — 총동연 전용
                description, logoUrl, coverUrl,
                tags, snsLinks, faqs,
                foundedYear, cohortNumber, location,
                activityFrequency, activeDays, tagline, highlights,
                contactVisibility, feeCycle, membershipFeeAmount, projects,
                null, null,                             // college, clearCollege — 총동연 전용
                clearLogoImage, clearCoverImage
        );
    }
}
```

`UpdateClubCommand.java` (전체 교체 — 어드민 포함 슈퍼셋):

```java
package com.duing.domain.club.service.dto.command;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubFaq;
import com.duing.domain.club.entity.ClubProject;
import com.duing.domain.club.entity.ClubSnsLink;
import com.duing.domain.club.entity.ContactVisibility;
import com.duing.domain.club.entity.FeeCycle;
import com.duing.domain.user.entity.College;
import java.time.DayOfWeek;
import java.util.List;
import java.util.Set;

/** 리더/어드민 공용 수정 커맨드. 리더 요청은 잠금 필드(name/category/division/college)에 항상 null 을 넣는다. */
public record UpdateClubCommand(
        Long clubId,
        Long requesterId,
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
        Integer activityFrequency,
        Set<DayOfWeek> activeDays,
        String tagline,
        List<String> highlights,
        ContactVisibility contactVisibility,
        FeeCycle feeCycle,
        Integer membershipFeeAmount,
        List<ClubProject> projects,
        College college,
        Boolean clearCollege,
        Boolean clearLogoImage,
        Boolean clearCoverImage
) {
    public Club.UpdatePayload toPayload() {
        return new Club.UpdatePayload(
                name(), category(), division(), description(), logoUrl(), coverUrl(),
                tags(), snsLinks(), faqs(), foundedYear(), cohortNumber(), location(),
                activityFrequency(), activeDays(), tagline(), highlights(),
                contactVisibility(), feeCycle(), membershipFeeAmount(), projects(),
                college(), clearCollege(), clearLogoImage(), clearCoverImage()
        );
    }
}
```

`ClubApi.java` 의 updateClub `@Operation` 설명을 다음으로 교체:

```java
    @Operation(summary = "동아리 정보 수정 (LEADER)",
            description = "본인이 LEADER 인 동아리의 프로필을 부분 수정한다. null/미포함 필드는 변경되지 않는다. "
                    + "동아리명·카테고리·분과·단과대학은 총동연 전용(PATCH /admin/clubs/{clubId}) — 이 요청으로는 수정할 수 없다.")
```

- [ ] **Step 4: 테스트 통과 확인** (이 시점엔 응답 개편 전이라 `ClubDetailResponse` 는 아직 옛 형태 — Step 1 에서 응답 단언 중 `feeCycle`/`contactVisibility` 등 신규 응답 필드 단언은 **Task 4 이후에만 통과**한다. 해당 단언이 포함된 케이스(`feePairSaved`, `snsNonOtherLabelDropped`, `contactVisibilityUpdated`)는 `@Disabled("Task 4 응답 개편 후 활성화")` 를 잠정 부여하고, Task 4 Step 5 에서 해제한다.)

```bash
cd backend && ./gradlew test --tests ClubUpdateControllerTest
```
Expected: PASS (@Disabled 3건 제외).

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/club/ backend/src/test/java/com/duing/domain/club/
git commit -m "feat(backend): 리더 동아리 수정 요청에서 총동연 전용 필드 분리 및 회비·프로젝트·공개범위 수신"
```

---

## Task 3: 어드민 전용 요청 DTO 분리

**Files:**
- Create: `backend/src/main/java/com/duing/domain/club/controller/dto/request/AdminUpdateClubRequest.java`
- Modify: `backend/src/main/java/com/duing/domain/club/api/AdminClubApi.java:50-58`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/AdminClubController.java:62-71`
- Test: `backend/src/test/java/com/duing/domain/club/controller/AdminClubUpdateControllerTest.java` (기존 수정 + 신규 케이스)

**Interfaces:**
- Consumes: Task 2 의 `UpdateClubCommand`(슈퍼셋), Task 1 enum들.
- Produces: `AdminUpdateClubRequest` — 리더 필드 전체 + `name`(@Size 1~100)/`category`(ClubCategory)/`division`(@Size≤50)/`college`(College)/`clearCollege`(Boolean). `toCommand(clubId, requesterId)` 는 전 필드 전달. 동일한 `isFeePairConsistent()` 포함.

- [ ] **Step 1: 기존 어드민 테스트 수정 + 신규 실패 테스트**

`AdminClubUpdateControllerTest.java`: 제거된 필드 사용처를 정리하고 추가 —

```java
    @Test
    @DisplayName("총동연은 동아리명·카테고리·분과를 수정할 수 있다")
    void adminUpdatesLockedFields() {
        // ADMIN 토큰으로 PATCH /api/v1/admin/clubs/{clubId}
        // body = {"name":"새이름","category":"SPORTS","division":"체육"}
        // → 200, 응답 name/category/division 반영
    }

    @Test
    @DisplayName("총동연 수정 요청도 회비 쌍 규칙을 따른다")
    void adminFeePairValidated() {
        // body = {"membershipFeeAmount": 5000} → 400
    }
```

(구현은 같은 파일의 기존 RestAssured 패턴으로 완성. 주석만 남기기 금지.)

- [ ] **Step 2: 실패 확인** — `cd backend && ./gradlew compileTestJava` → 컴파일 실패.

- [ ] **Step 3: 구현**

`AdminUpdateClubRequest.java` — `UpdateClubRequest` 와 동일한 필드·검증에 아래를 **추가**한 record (import 는 `ClubCategory`, `College` 추가):

```java
        @Size(min = 1, max = 100, message = "동아리 이름은 1~100자여야 합니다.")
        String name,

        ClubCategory category,

        @Size(max = 50, message = "분류는 50자 이하여야 합니다.")
        String division,

        College college,

        Boolean clearCollege,
```

record 선언 맨 앞에 위 5개를 두고 나머지는 `UpdateClubRequest` 와 동일 순서로 나열한다. `isFeePairConsistent()` 동일 포함. `toCommand`:

```java
    public UpdateClubCommand toCommand(Long clubId, Long requesterId) {
        return new UpdateClubCommand(
                clubId, requesterId,
                name, category, division,
                description, logoUrl, coverUrl,
                tags, snsLinks, faqs,
                foundedYear, cohortNumber, location,
                activityFrequency, activeDays, tagline, highlights,
                contactVisibility, feeCycle, membershipFeeAmount, projects,
                college, clearCollege,
                clearLogoImage, clearCoverImage
        );
    }
```

`AdminClubApi.updateClub` 파라미터 타입을 `AdminUpdateClubRequest` 로 바꾸고 설명 교체:

```java
    @Operation(summary = "동아리 정보 수정 (ADMIN)",
            description = "총동연이 임의 동아리의 프로필을 부분 수정한다. 리더 요청과 달리 동아리명·카테고리·분과·단과대학(잠금 필드)까지 수정할 수 있다. "
                    + "null/미포함 필드는 변경되지 않고, 조회 가능한 모든 상태의 동아리를 수정할 수 있다.")
```

`AdminClubController.updateClub` 의 파라미터 타입 동일 교체 (변수명 `adminUpdateClubRequest`).

- [ ] **Step 4: 테스트 통과** — `cd backend && ./gradlew test --tests AdminClubUpdateControllerTest` → PASS.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/club/ backend/src/test/java/com/duing/domain/club/
git commit -m "feat(backend): 총동연 전용 동아리 수정 요청 분리 — 잠금 필드는 ADMIN 만 수정"
```

---

## Task 4: 상세 응답 개편 + 대표 연락처 공개 게이트

**Files:**
- Create: `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubViewer.java`
- Modify: `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubDetailQuery.java` (전체 재작성)
- Modify: `backend/src/main/java/com/duing/domain/club/controller/dto/response/ClubDetailResponse.java` (전체 재작성)
- Modify: `backend/src/main/java/com/duing/domain/club/service/ClubService.java:23-26` (시그니처)
- Modify: `backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java:117-155` (viewer 전달 + 게이트)
- Modify: `backend/src/main/java/com/duing/domain/club/api/ClubApi.java:51-54` + `controller/ClubController.java:61-76`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/AdminClubController.java:56-71`
- Test: `backend/src/test/java/com/duing/domain/club/controller/ClubDetailContactVisibilityTest.java` (신규)

**Interfaces:**
- Consumes: Task 1~3 전부. `ClubMemberRepository.findByClubIdAndUserId`, `ClubMember.canManageClub()`, `User.getPhone()`, `UserRole.ADMIN`.
- Produces:
  - `record ClubViewer(Long userId, boolean admin)` + `static ClubViewer anonymous()`
  - `ClubService.getById(Long clubId, ClubViewer viewer)` / `getActiveById(Long clubId, ClubViewer viewer)`
  - `ClubDetailQuery`/`ClubDetailResponse`: `contactEmail`/`membershipFee`/`majorProjects` 제거, `contactPhone`(String, nullable) / `contactVisibility`(ContactVisibility, 항상 포함) / `membershipFeeAmount`(Integer) / `feeCycle`(FeeCycle) / `projects`(List<ClubProject>) 추가. 필드 순서: 기존 순서 유지하되 `leaderName` 뒤에 `contactPhone`, `contactVisibility` 삽입, `location` 뒤에 `activityFrequency`, `activeDays`, `membershipFeeAmount`, `feeCycle`, `tagline`, `highlights`, `projects` 순.
  - `ClubDetailQuery.of(Club club, Long leaderId, String leaderName, String contactPhone, List<ClubPhotoQuery> photos, StudentRecruitmentProjection activeRecruitment)`

- [ ] **Step 1: 실패하는 게이트 매트릭스 테스트 작성**

`ClubDetailContactVisibilityTest.java` — `IntegrationTestBase` 상속, `ClubUpdateControllerTest` 의 setUp 패턴(리더 User+phone, OFFICER, 일반 학생, ADMIN 계정, ACTIVE 동아리 + LEADER ClubMember 생성)을 재사용해 다음 케이스 구현:

```java
    // 각 케이스: club.contactVisibility 를 리포지토리로 세팅 후 GET /api/v1/clubs/{clubId}
    @Test @DisplayName("PUBLIC 이면 비로그인 사용자도 회장 전화번호 원본을 본다")
    void publicVisibleToAnonymous() { /* 토큰 없이 GET → contactPhone == 회장 phone, contactVisibility == "PUBLIC" */ }

    @Test @DisplayName("LOGGED_IN_ONLY 면 비로그인에게는 null, 로그인 사용자에게는 원본이 보인다")
    void loggedInOnlyGate() { /* 익명 → contactPhone null / 일반 학생 토큰 → 원본 */ }

    @Test @DisplayName("PRIVATE 이면 일반 로그인 사용자에게도 null 이다")
    void privateHiddenFromMembers() { /* 일반 학생 토큰 → null, contactVisibility == "PRIVATE" */ }

    @Test @DisplayName("PRIVATE 이어도 해당 동아리 임원(OFFICER)에게는 원본이 보인다")
    void privateVisibleToOfficer() { /* OFFICER 토큰 → 원본 */ }

    @Test @DisplayName("PRIVATE 이어도 총동연(ADMIN)은 어드민 조회로 원본을 본다")
    void privateVisibleToAdmin() { /* ADMIN 토큰, GET /api/v1/admin/clubs/{clubId} → 원본 */ }

    @Test @DisplayName("회장이 없는 동아리는 공개 범위와 무관하게 contactPhone 이 null 이다")
    void leaderlessClubHasNoPhone() { /* LEADER ClubMember 미생성 → PUBLIC 이어도 null */ }

    @Test @DisplayName("공개 범위가 비공개여도 contactVisibility 값 자체는 응답에 항상 포함된다")
    void visibilityAlwaysSerialized() { /* PRIVATE + 익명 → body contactVisibility == "PRIVATE" */ }
```

`contactVisibility` 세팅은 `clubRepository` 로 로드 후 `club.update(...)` 페이로드(Task 1 헬퍼처럼 contactVisibility 만 채운 UpdatePayload) + `saveAndFlush` 로 한다.

- [ ] **Step 2: 실패 확인** — `cd backend && ./gradlew compileTestJava` → 컴파일 실패.

- [ ] **Step 3: 구현**

`ClubViewer.java`:

```java
package com.duing.domain.club.service.dto.query;

/** 상세 조회 요청자 신원 — 대표 연락처 공개 게이트 판정용. 익명은 userId null. */
public record ClubViewer(Long userId, boolean admin) {
    public static ClubViewer anonymous() {
        return new ClubViewer(null, false);
    }
}
```

`ClubDetailQuery.java` — record 컴포넌트를 Interfaces 블록 명세대로 재작성:

```java
public record ClubDetailQuery(
        Long id, String name, ClubCategory category, String division, College college,
        String description, String logoUrl, String coverUrl,
        List<String> tags, List<ClubSnsLink> snsLinks, List<ClubFaq> faqs,
        Long leaderId, String leaderName,
        String contactPhone, ContactVisibility contactVisibility,
        ClubStatus status, List<ClubPhotoQuery> photos,
        Integer foundedYear, Integer cohortNumber, String location,
        Integer activityFrequency, Set<DayOfWeek> activeDays,
        Integer membershipFeeAmount, FeeCycle feeCycle,
        String tagline, List<String> highlights, List<ClubProject> projects,
        StudentRecruitmentProjection activeRecruitment, boolean centralClub
) {
    /** contactPhone 은 서비스에서 공개 게이트를 통과한 값만 받는다 (회장 부재 시 null). */
    public static ClubDetailQuery of(Club club, Long leaderId, String leaderName, String contactPhone,
                                     List<ClubPhotoQuery> photos, StudentRecruitmentProjection activeRecruitment) {
        return new ClubDetailQuery(
                club.getId(), club.getName(), club.getCategory(), club.getDivision(), club.getCollege(),
                club.getDescription(), club.getLogoUrl(), club.getCoverUrl(),
                club.getTags(), club.getSnsLinks(), club.getFaqs(),
                leaderId, leaderName,
                contactPhone, club.getContactVisibility(),
                club.getStatus(), photos,
                club.getFoundedYear(), club.getCohortNumber(), club.getLocation(),
                club.getActivityFrequency(), club.getActiveDays(),
                club.getMembershipFeeAmount(), club.getFeeCycle(),
                club.getTagline(), club.getHighlights(), club.getProjects(),
                activeRecruitment, club.isCentralClub()
        );
    }
}
```

`ClubDetailResponse.java` — 동일 컴포넌트 구성으로 재작성, `from(ClubDetailQuery)` 는 1:1 매핑 (기존 스타일 유지, import 에 `ClubProject`/`ContactVisibility`/`FeeCycle` 추가).

`ClubService.java`:

```java
    ClubDetailQuery getById(Long clubId, ClubViewer viewer);

    /** 학생/공개용 상세 — 운영 중(ACTIVE) 동아리만. 그 외 상태는 ClubNotFoundException(404). */
    ClubDetailQuery getActiveById(Long clubId, ClubViewer viewer);
```

`GeneralClubService.java`:

```java
    @Override
    public ClubDetailQuery getById(Long clubId, ClubViewer viewer) {
        Club club = clubRepository.findById(clubId)
                .orElseThrow(ClubException.ClubNotFoundException::new);
        return toDetailQuery(club, viewer);
    }

    @Override
    public ClubDetailQuery getActiveById(Long clubId, ClubViewer viewer) {
        Club club = clubRepository.findById(clubId)
                .orElseThrow(ClubException.ClubNotFoundException::new);
        if (club.getStatus() != ClubStatus.ACTIVE) {
            throw new ClubException.ClubNotFoundException();
        }
        return toDetailQuery(club, viewer);
    }

    private ClubDetailQuery toDetailQuery(Club club, ClubViewer viewer) {
        // ... photos / activeRecruitment 기존 로직 유지 ...
        return clubMemberRepository.findFirstByClubIdAndRole(clubId, ClubMemberRole.LEADER)
                .map(leader -> ClubDetailQuery.of(
                        club, leader.getUser().getId(), leader.getUser().getName(),
                        resolveContactPhone(club, leader.getUser().getPhone(), viewer),
                        photos, activeRecruitment))
                .orElseGet(() -> ClubDetailQuery.of(club, null, null, null, photos, activeRecruitment));
    }

    /**
     * 대표 연락처 게이트 (§5.3) — PUBLIC=전체, LOGGED_IN_ONLY=로그인, PRIVATE=해당 동아리 임원만.
     * ADMIN 과 임원은 편집 화면 표시용으로 정책 무관 상시 노출. 임원 여부 조회는 PRIVATE+로그인일 때만 발생.
     */
    private String resolveContactPhone(Club club, String leaderPhone, ClubViewer viewer) {
        if (viewer.admin()) return leaderPhone;
        ContactVisibility visibility = club.getContactVisibility();
        if (visibility == ContactVisibility.PUBLIC) return leaderPhone;
        if (viewer.userId() == null) return null;
        if (visibility == ContactVisibility.LOGGED_IN_ONLY) return leaderPhone;
        boolean clubStaff = clubMemberRepository.findByClubIdAndUserId(club.getId(), viewer.userId())
                .map(ClubMember::canManageClub)
                .orElse(false);
        return clubStaff ? leaderPhone : null;
    }
```

(update/updateAsAdmin 후 재조회를 담당하는 컨트롤러 쪽 `getById` 호출도 viewer 를 받도록 아래에서 수정. import 에 `ContactVisibility` 추가.)

`ClubApi.getClub` — 선택적 principal 추가:

```java
    @GetMapping("/clubs/{clubId}")
    ResponseEntity<ApiResponse<ClubDetailResponse>> getClub(
            @PathVariable Long clubId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser);
```

`ClubController`:

```java
    private static ClubViewer toViewer(UserPrincipal currentUser) {
        if (currentUser == null) return ClubViewer.anonymous();
        return new ClubViewer(currentUser.id(), UserRole.ADMIN.name().equals(currentUser.role()));
    }

    @Override
    public ResponseEntity<ApiResponse<ClubDetailResponse>> getClub(
            @PathVariable Long clubId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        ClubDetailResponse response =
                ClubDetailResponse.from(clubService.getActiveById(clubId, toViewer(currentUser)));
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    // updateClub 재조회도 viewer 전달 (리더 본인 → 임원 게이트 통과, 전화 항상 표시)
    ClubDetailResponse response = ClubDetailResponse.from(clubService.getById(clubId, toViewer(currentUser)));
```

`AdminClubController.getAdminClub`/`updateClub` 재조회:

```java
    ClubDetailResponse response = ClubDetailResponse.from(
            clubService.getById(clubId, new ClubViewer(currentUser.id(), true)));
```

(`getAdminClub` 은 principal 파라미터가 없으므로 `AdminClubApi`/`AdminClubController` 의 getAdminClub 에 `@AuthenticationPrincipal UserPrincipal currentUser` 를 추가한다 — 클래스 레벨 `@PreAuthorize("hasRole('ADMIN')")` 이므로 항상 non-null.)

- [ ] **Step 4: 다른 컴파일 깨짐 정리** — `ClubDetailResponse`/`ClubDetailQuery` 의 제거 필드를 참조하는 기존 테스트(예: `AdminClubDetailControllerTest`, `ClubDetailStatusControllerTest`)의 단언을 새 필드로 치환.

- [ ] **Step 5: Task 2 의 `@Disabled` 3건 해제 후 전체 테스트**

```bash
cd backend && ./gradlew test
```
Expected: `BUILD SUCCESSFUL` (출력에서 문자열 확인).

- [ ] **Step 6: 커밋**

```bash
git add backend/
git commit -m "feat(backend): 동아리 상세에 회장 전화 공개 게이트·회비 구조·프로젝트 카드 응답 적용"
```

**PR-1 완료 후:** duing-code-reviewer + codex:review + codex:adversarial-review(권한 게이트·마이그레이션·API contract). 리뷰 통과 후 사용자에게 push/PR 여부 확인.

---

# PR-2 · Frontend 데이터 계약 + 학생 페이지

## Task 5: 타입·스키마·클라이언트 개편 + 기존 폼 잠정 컴파일 패치

**Files:**
- Modify: `frontend/packages/types/src/club.ts`
- Modify: `frontend/packages/schemas/src/index.ts` (updateClubSchema 영역 재작성)
- Modify: `frontend/packages/api/src/client.ts` (admin update 페이로드 타입)
- Modify: `frontend/packages/hooks/src/` 내 `useAdminUpdateClubMutation` 정의 파일 (`grep -rn "useAdminUpdateClubMutation" packages/hooks/src` 로 위치 확인)
- Create: `frontend/apps/web/app/_lib/clubFee.ts`
- Create: `frontend/apps/web/app/_lib/projectIcons.tsx`
- Create: `frontend/apps/web/app/_lib/snsPlatform.ts`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx` (잠정 패치)
- Test: `frontend/apps/web/test/clubs/club-fee-format.test.ts`, `frontend/apps/web/test/manage/update-club-schema.test.ts`

**Interfaces:**
- Consumes: PR-1 API 계약.
- Produces (PR-2/3 전체가 의존):

```ts
// @duing/types
export type ContactVisibility = 'PUBLIC' | 'LOGGED_IN_ONLY' | 'PRIVATE';
export type FeeCycle = 'NONE' | 'ONE_TIME' | 'SEMESTER' | 'YEARLY' | 'MONTHLY';
export const PROJECT_ICONS = [
  'CODE', 'TROPHY', 'USERS', 'ROCKET', 'BOOK', 'CAMERA', 'PALETTE', 'MUSIC', 'MIC', 'GLOBE',
  'HEART', 'LEAF', 'BRIEFCASE', 'LIGHTBULB', 'FLASK', 'GAMEPAD', 'DUMBBELL', 'GRADUATION',
  'MONITOR', 'SPARKLES',
] as const;
export type ProjectIcon = (typeof PROJECT_ICONS)[number];
export type ClubProject = { icon: ProjectIcon; title: string; subtitle: string | null };
export type ClubSnsPlatform = 'INSTAGRAM' | 'FACEBOOK' | 'KAKAO' | 'OTHER';
export type ClubSnsLink = { platform: ClubSnsPlatform; label: string | null; url: string };
// ClubDetail: contactEmail/membershipFee/majorProjects 제거 →
//   contactPhone: string | null; contactVisibility: ContactVisibility;
//   membershipFeeAmount: number | null; feeCycle: FeeCycle; projects: ClubProject[];
// UpdateClubPayload: name/category/division/college/clearCollege/contactEmail/membershipFee/majorProjects 제거 →
//   contactVisibility?: ContactVisibility; feeCycle?: FeeCycle;
//   membershipFeeAmount?: number | null; projects?: ClubProject[];
export type AdminUpdateClubPayload = UpdateClubPayload & {
  name?: string; category?: ClubCategory; division?: string | null;
  college?: College; clearCollege?: boolean;
};
```

```ts
// @duing/schemas — clubProfileBaseSchema(z.object) + 리더/어드민 파생
export const updateClubSchema = clubProfileBaseSchema.refine(feePairRule);
export const adminUpdateClubSchema = clubProfileBaseSchema.extend({
  name: z.string().min(1, '동아리 이름은 1~100자여야 합니다.').max(100, '동아리 이름은 1~100자여야 합니다.'),
  category: z.enum(['ACADEMIC', 'CULTURE', 'ART', 'SPORTS', 'VOLUNTEER', 'RELIGION', 'HOBBY', 'OTHER']),
  division: z.string().max(50, '분류는 50자 이하여야 합니다.').nullable(),
}).refine(feePairRule);
```

```ts
// apps/web/app/_lib/clubFee.ts
export function formatClubFee(feeCycle: FeeCycle, amount: number | null): string | null;
// apps/web/app/_lib/projectIcons.tsx
export const PROJECT_ICON_COMPONENTS: Record<ProjectIcon, LucideIcon>;
export const PROJECT_CARD_TONES: readonly string[]; // 4색 순환 배경 클래스
// apps/web/app/_lib/snsPlatform.ts
export const SNS_PLATFORM_LABELS: Record<ClubSnsPlatform, string>;
export function snsDisplayName(link: ClubSnsLink): string;
```

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/apps/web/test/clubs/club-fee-format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatClubFee } from '@/app/_lib/clubFee';

describe('formatClubFee', () => {
  it('학기당 30000원을 "학기당 30,000원"으로 표기한다', () => {
    expect(formatClubFee('SEMESTER', 30000)).toBe('학기당 30,000원');
  });
  it('1회 납부는 "1회 납부 50,000원"으로 표기한다', () => {
    expect(formatClubFee('ONE_TIME', 50000)).toBe('1회 납부 50,000원');
  });
  it('NONE 은 null 을 반환한다 — 미입력과 구분할 수 없으므로 표기하지 않는다(§8)', () => {
    expect(formatClubFee('NONE', null)).toBeNull();
  });
  it('금액이 없으면 null 을 반환한다 (방어)', () => {
    expect(formatClubFee('SEMESTER', null)).toBeNull();
  });
});
```

`frontend/apps/web/test/manage/update-club-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { adminUpdateClubSchema, updateClubSchema } from '@duing/schemas';

const base = {
  description: null, logoUrl: null, coverUrl: null,
  tags: [], snsLinks: [], faqs: [],
  foundedYear: null, cohortNumber: null, location: null,
  activityFrequency: null, activeDays: [], tagline: null, highlights: [],
  contactVisibility: 'PUBLIC', feeCycle: 'NONE', membershipFeeAmount: null, projects: [],
};

describe('updateClubSchema (리더)', () => {
  it('회비 없음(NONE)+금액 null 조합을 허용한다', () => {
    expect(updateClubSchema.safeParse(base).success).toBe(true);
  });
  it('NONE 인데 금액이 있으면 거부한다', () => {
    expect(updateClubSchema.safeParse({ ...base, membershipFeeAmount: 30000 }).success).toBe(false);
  });
  it('유료 주기인데 금액이 없으면 거부한다', () => {
    expect(updateClubSchema.safeParse({ ...base, feeCycle: 'SEMESTER' }).success).toBe(false);
  });
  it('기타 SNS 는 label 이 없으면 거부한다', () => {
    const link = { platform: 'OTHER', label: null, url: 'https://github.com/doing' };
    expect(updateClubSchema.safeParse({ ...base, snsLinks: [link] }).success).toBe(false);
  });
  it('기본 플랫폼은 label 없이 허용한다', () => {
    const link = { platform: 'KAKAO', label: null, url: 'https://open.kakao.com/x' };
    expect(updateClubSchema.safeParse({ ...base, snsLinks: [link] }).success).toBe(true);
  });
  it('프로젝트 7개는 거부한다 (최대 6)', () => {
    const project = { icon: 'CODE', title: '프로젝트', subtitle: null };
    expect(updateClubSchema.safeParse({ ...base, projects: Array(7).fill(project) }).success).toBe(false);
  });
  it('허용 목록 밖 아이콘은 거부한다', () => {
    const project = { icon: 'EMOJI', title: '프로젝트', subtitle: null };
    expect(updateClubSchema.safeParse({ ...base, projects: [project] }).success).toBe(false);
  });
  it('강조 항목 10개까지는 백스톱으로 허용한다 (FE 추가 제한과 별개, §4.4)', () => {
    expect(updateClubSchema.safeParse({ ...base, highlights: Array(10).fill('항목') }).success).toBe(true);
  });
});

describe('adminUpdateClubSchema (총동연)', () => {
  it('잠금 필드(name/category/division)를 포함해 검증한다', () => {
    const admin = { ...base, name: '두잉코드', category: 'ACADEMIC', division: null };
    expect(adminUpdateClubSchema.safeParse(admin).success).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인** — `cd frontend && pnpm test -- club-fee-format update-club-schema` → FAIL (미정의).

- [ ] **Step 3: 구현**

`packages/types/src/club.ts` — Interfaces 블록의 정의로 `ContactVisibility`/`FeeCycle`/`PROJECT_ICONS`/`ProjectIcon`/`ClubProject`/`ClubSnsPlatform` 추가, `ClubSnsLink`/`ClubDetail`/`UpdateClubPayload` 수정, `AdminUpdateClubPayload` 추가.

`packages/schemas/src/index.ts` — 기존 `updateClubSchema` 를 다음으로 교체:

```ts
const feePairRule = {
  check: (data: { feeCycle?: 'NONE' | 'ONE_TIME' | 'SEMESTER' | 'YEARLY' | 'MONTHLY'; membershipFeeAmount?: number | null }) =>
    data.feeCycle === undefined
      ? (data.membershipFeeAmount ?? null) === null
      : (data.feeCycle === 'NONE') === ((data.membershipFeeAmount ?? null) === null),
  options: { message: '회비는 납부 주기와 금액을 함께 확인해 주세요.', path: ['membershipFeeAmount'] as const },
};

export const clubProjectSchema = z.object({
  icon: z.enum(['CODE', 'TROPHY', 'USERS', 'ROCKET', 'BOOK', 'CAMERA', 'PALETTE', 'MUSIC', 'MIC', 'GLOBE',
    'HEART', 'LEAF', 'BRIEFCASE', 'LIGHTBULB', 'FLASK', 'GAMEPAD', 'DUMBBELL', 'GRADUATION', 'MONITOR', 'SPARKLES']),
  title: z.string().trim().min(1, '프로젝트 제목은 1~30자여야 합니다.').max(30, '프로젝트 제목은 1~30자여야 합니다.'),
  subtitle: z.string().max(40, '프로젝트 부제목은 40자 이하여야 합니다.').nullable(),
});

const clubSnsLinkSchema = z.object({
  platform: z.enum(['INSTAGRAM', 'FACEBOOK', 'KAKAO', 'OTHER']),
  label: z.string().max(20, '플랫폼명은 20자 이하여야 합니다.').nullable(),
  url: z.string().min(1, 'SNS URL은 1~500자여야 합니다.').max(500, 'SNS URL은 1~500자여야 합니다.')
    .regex(/^https?:\/\/.+/, 'SNS URL은 http(s):// 로 시작해야 합니다.'),
}).refine((link) => link.platform !== 'OTHER' || (link.label !== null && link.label.trim().length > 0), {
  message: '기타 플랫폼은 플랫폼명을 입력해 주세요.',
  path: ['label'],
});

const clubProfileBaseSchema = z.object({
  description: z.string().nullable(),
  logoUrl: z.string().max(500, '로고 URL은 500자 이하여야 합니다.').nullable(),
  coverUrl: z.string().max(500, '커버 URL은 500자 이하여야 합니다.').nullable(),
  tags: z.array(
    z.string().min(1, '각 태그는 1~20자여야 합니다.').max(20, '각 태그는 1~20자여야 합니다.'),
  ).max(20, '태그는 최대 20개까지 가능합니다.'),
  snsLinks: z.array(clubSnsLinkSchema).max(10, 'SNS 링크는 최대 10개까지 가능합니다.'),
  faqs: z.array(
    z.object({
      question: z.string().min(1, 'FAQ 질문은 1~200자여야 합니다.').max(200, 'FAQ 질문은 1~200자여야 합니다.'),
      answer: z.string().min(1, 'FAQ 답변은 1~2000자여야 합니다.').max(2000, 'FAQ 답변은 1~2000자여야 합니다.'),
      order: z.number().int().min(0, 'FAQ 순서는 0 이상이어야 합니다.'),
    }),
  ).max(20, 'FAQ는 최대 20개까지 가능합니다.'),
  foundedYear: z.number().int().min(1900, '창설년도는 1900 이상이어야 합니다.')
    .max(2100, '창설년도가 너무 큽니다.').nullable().optional(),
  cohortNumber: z.number().int().min(1, '기수는 1 이상이어야 합니다.').nullable().optional(),
  location: z.string().max(200, '위치는 200자 이하여야 합니다.').nullable().optional(),
  activityFrequency: z.number().int().min(1, '활동 빈도는 1 이상이어야 합니다.').nullable().optional(),
  activeDays: z.array(z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'])).optional(),
  // 새 입력 UI 는 20자 제한 — 기존 60자 시절 저장 값이 깨지지 않게 백스톱 60 유지.
  tagline: z.string().max(60, '한줄 소개는 60자 이하여야 합니다.').nullable().optional(),
  // FE 추가 제한은 7 — 기존 8~10개 데이터 저장이 깨지지 않게 백스톱 10 유지 (§4.4).
  highlights: z.array(
    z.string().min(1, '강조 항목은 비어 있을 수 없습니다.').max(100, '각 강조 항목은 100자 이하여야 합니다.'),
  ).max(10, '강조 항목은 최대 10개까지 가능합니다.').optional(),
  contactVisibility: z.enum(['PUBLIC', 'LOGGED_IN_ONLY', 'PRIVATE']).optional(),
  feeCycle: z.enum(['NONE', 'ONE_TIME', 'SEMESTER', 'YEARLY', 'MONTHLY']).optional(),
  membershipFeeAmount: z.number().int().min(1, '회비 금액은 1원 이상이어야 합니다.')
    .max(10_000_000, '회비 금액이 너무 큽니다.').nullable().optional(),
  projects: z.array(clubProjectSchema).max(6, '주요 프로젝트는 최대 6개까지 가능합니다.').optional(),
});

export const updateClubSchema = clubProfileBaseSchema.refine(feePairRule.check, feePairRule.options);
export type UpdateClubInput = z.infer<typeof updateClubSchema>;

export const adminUpdateClubSchema = clubProfileBaseSchema.extend({
  name: z.string().min(1, '동아리 이름은 1~100자여야 합니다.').max(100, '동아리 이름은 1~100자여야 합니다.'),
  category: z.enum(['ACADEMIC', 'CULTURE', 'ART', 'SPORTS', 'VOLUNTEER', 'RELIGION', 'HOBBY', 'OTHER']),
  division: z.string().max(50, '분류는 50자 이하여야 합니다.').nullable(),
}).refine(feePairRule.check, feePairRule.options);
export type AdminUpdateClubInput = z.infer<typeof adminUpdateClubSchema>;
```

`apps/web/app/_lib/clubFee.ts`:

```ts
import type { FeeCycle } from '@duing/types';

export const FEE_CYCLE_LABELS: Record<Exclude<FeeCycle, 'NONE'>, string> = {
  ONE_TIME: '1회 납부',
  SEMESTER: '학기당',
  YEARLY: '연간',
  MONTHLY: '월간',
};

/** NONE(미입력/회비 없음 구분 불가)은 null — 호출부는 항목을 숨긴다 (§8). */
export function formatClubFee(feeCycle: FeeCycle, amount: number | null): string | null {
  if (feeCycle === 'NONE' || amount === null) return null;
  return `${FEE_CYCLE_LABELS[feeCycle]} ${amount.toLocaleString('ko-KR')}원`;
}
```

`apps/web/app/_lib/projectIcons.tsx`:

```tsx
import {
  BookOpen, Briefcase, Camera, Code, Dumbbell, FlaskConical, Gamepad2, Globe,
  GraduationCap, Heart, Leaf, Lightbulb, Mic, Monitor, Music, Palette, Rocket,
  Sparkles, Trophy, Users, type LucideIcon,
} from 'lucide-react';
import type { ProjectIcon } from '@duing/types';

/** BE ProjectIcon enum 과 이중 목록 — enum 변경 시 양쪽 동시 수정 (§4.1). */
export const PROJECT_ICON_COMPONENTS: Record<ProjectIcon, LucideIcon> = {
  CODE: Code, TROPHY: Trophy, USERS: Users, ROCKET: Rocket, BOOK: BookOpen,
  CAMERA: Camera, PALETTE: Palette, MUSIC: Music, MIC: Mic, GLOBE: Globe,
  HEART: Heart, LEAF: Leaf, BRIEFCASE: Briefcase, LIGHTBULB: Lightbulb,
  FLASK: FlaskConical, GAMEPAD: Gamepad2, DUMBBELL: Dumbbell,
  GRADUATION: GraduationCap, MONITOR: Monitor, SPARKLES: Sparkles,
};

/** 카드 배경 팔레트 — 순서 기반 순환(Green→Blue→Orange→Purple), 데이터에 저장하지 않는다 (§4.1·§8). */
export const PROJECT_CARD_TONES = [
  'bg-[#E3E9E1]', 'bg-[#DDE8F1]', 'bg-[#FBEFD7]', 'bg-[#E9E2F1]',
] as const;

export function projectCardTone(index: number): string {
  return PROJECT_CARD_TONES[index % PROJECT_CARD_TONES.length];
}
```

`apps/web/app/_lib/snsPlatform.ts`:

```ts
import type { ClubSnsLink, ClubSnsPlatform } from '@duing/types';

export const SNS_PLATFORM_LABELS: Record<ClubSnsPlatform, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  KAKAO: '카카오톡',
  OTHER: '기타',
};

export function snsDisplayName(link: ClubSnsLink): string {
  if (link.platform === 'OTHER') return link.label ?? SNS_PLATFORM_LABELS.OTHER;
  return SNS_PLATFORM_LABELS[link.platform];
}
```

`packages/api/src/client.ts` — `admin.clubs.update` 의 페이로드 타입을 `AdminUpdateClubPayload` 로 변경(임포트 추가), 주석 갱신: "총동연 전용 — 잠금 필드(name/category/division/college)까지 수정 가능". `packages/hooks` 의 `useAdminUpdateClubMutation` 페이로드 타입 동일 변경.

`ClubInfoForm.tsx` **잠정 패치** (PR-3 에서 전면 재작성 예정 — 여기서는 컴파일 그린만):
1. `contactEmail`/`membershipFee`/`majorProjects` state·JSX·fullData·buildPayload 참조 제거.
2. `name`/`category`/`division`/`college` 입력에 `disabled` 부여 + buildPayload/fullData 에서 해당 diff 제거 (`clearCollege` 포함).
3. fullData 에 `contactVisibility: detail.contactVisibility, feeCycle: detail.feeCycle, membershipFeeAmount: detail.membershipFeeAmount, projects: detail.projects` 를 그대로 넣어 zod 통과 유지.
4. `snsLinks` 신규 행 추가 기본값을 `{ platform: 'INSTAGRAM', label: null, url: '' }` 로 수정 (`SnsLinksRepeater.tsx` add() 도 동일 — PLATFORMS 상수는 `['INSTAGRAM','FACEBOOK','KAKAO','OTHER']` 로 축소, label 입력은 PR-3 에서).

- [ ] **Step 4: 테스트·타입 통과**

```bash
cd frontend && pnpm test -- club-fee-format update-club-schema && pnpm typecheck
```
Expected: 신규 테스트 PASS. typecheck 는 `ClubDetail` 필드 변경으로 학생 페이지·테스트 픽스처에서 실패 목록이 나온다 — **다음 Task 범위**이므로 실패 파일 목록만 기록해 두고 진행 (커밋은 가능).

- [ ] **Step 5: 커밋**

```bash
git add frontend/
git commit -m "feat(frontend): 동아리 프로필 새 데이터 계약 — 공개범위·회비 구조·프로젝트·SNS 4종 타입/스키마"
```

---

## Task 6: 학생 상세 페이지 데이터 반영

**Files:**
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailInfoList.tsx`
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubContactCard.tsx`
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailAbout.tsx`
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailTabs.tsx` (props 전달부)
- Modify: `frontend/apps/web/test/clubs/` 하위 관련 테스트 + `ClubDetail` 픽스처 전체 (`grep -rln "contactEmail\|majorProjects\|membershipFee" apps/web` 로 잔여 참조 0 확인)
- Test: `club-detail-info-list.test.tsx`, `club-contact-card.test.tsx`, `club-detail-about.test.tsx` 갱신

**Interfaces:**
- Consumes: Task 5 의 타입·`formatClubFee`·`PROJECT_ICON_COMPONENTS`/`projectCardTone`·`snsDisplayName`.
- Produces: `ClubContactCard` 새 props `{ snsLinks, location, contactPhone, contactVisibility }`, `ClubDetailAbout` 새 props `{ description, highlights, projects }`.

- [ ] **Step 1: 실패하는 테스트 갱신** — 세 테스트 파일에서 제거 필드 픽스처를 새 필드로 바꾸고 다음 케이스를 추가한다:

```tsx
// club-detail-info-list.test.tsx 추가 케이스
it('회비는 주기+금액 조합으로 표시된다', () => { /* feeCycle:'SEMESTER', membershipFeeAmount:30000 → "학기당 30,000원" */ });
it('회비 NONE 은 회비 항목을 표시하지 않는다', () => { /* feeCycle:'NONE' → queryByText('회비') null */ });
it('대표 연락처가 오면 전화번호를 표시한다', () => { /* contactPhone:'010-1234-5678' → 노출 */ });
it('LOGGED_IN_ONLY 인데 전화번호가 없으면 "로그인 후 확인 가능"을 안내한다', () => {});
it('PRIVATE 이면 "대표 연락처 비공개"를 안내한다', () => {});
it('PUBLIC 인데 전화번호가 없으면(회장 미등록) 연락처 항목을 숨긴다', () => {});

// club-contact-card.test.tsx 추가 케이스
it('기타 플랫폼은 label 로 표시된다', () => { /* {platform:'OTHER',label:'GitHub',url:...} → "GitHub" */ });
it('기본 플랫폼은 고정 명칭으로 표시된다', () => { /* KAKAO → "카카오톡" */ });
it('전화번호는 tel: 링크로 렌더된다', () => {});

// club-detail-about.test.tsx 추가 케이스
it('프로젝트 카드가 제목·부제목·아이콘과 함께 렌더된다', () => {});
it('subtitle 이 null 이면 부제목 줄을 렌더하지 않는다', () => {});
it('프로젝트가 없으면 주요 프로젝트 섹션을 렌더하지 않는다', () => {});
```

(케이스 본문은 기존 테스트 파일의 렌더/단언 패턴으로 완성.)

- [ ] **Step 2: 실패 확인** — `cd frontend && pnpm test -- club-detail` → FAIL.

- [ ] **Step 3: 구현**

`ClubDetailInfoList.tsx` 의 rows 구성 교체:

```tsx
import { formatClubFee } from '../../../_lib/clubFee';

  const rows: Row[] = [];
  if (club.leaderName !== null) rows.push({ label: '동아리 회장', value: club.leaderName });
  if (club.foundedYear !== null) rows.push({ label: '창설년도', value: `${club.foundedYear}년` });
  if (club.cohortNumber !== null) rows.push({ label: '현재 기수', value: `${club.cohortNumber}기` });
  const feeText = formatClubFee(club.feeCycle, club.membershipFeeAmount);
  if (feeText !== null) rows.push({ label: '회비', value: feeText });
  if (club.location !== null) rows.push({ label: '위치', value: club.location });
  // 대표 연락처 — 정책 상태를 명시적으로 안내 (§8). PUBLIC+null(회장 미등록)은 숨김(fail-safe).
  if (club.contactPhone !== null) {
    rows.push({ label: '대표 연락처', value: club.contactPhone });
  } else if (club.contactVisibility === 'LOGGED_IN_ONLY') {
    rows.push({ label: '대표 연락처', value: '로그인 후 확인 가능' });
  } else if (club.contactVisibility === 'PRIVATE') {
    rows.push({ label: '대표 연락처', value: '대표 연락처 비공개' });
  }
```

`ClubContactCard.tsx` — props 를 `{ snsLinks, location, contactPhone, contactVisibility }` 로 교체:

```tsx
import type { ClubSnsLink, ContactVisibility } from '@duing/types';
import { snsDisplayName } from '../../../_lib/snsPlatform';
import { safeExternalHref } from '../../../_lib/route';

type Props = {
  snsLinks: ClubSnsLink[];
  location: string | null;
  contactPhone: string | null;
  contactVisibility: ContactVisibility;
};

export function ClubContactCard({ snsLinks, location, contactPhone, contactVisibility }: Props) {
  const contactLine =
    contactPhone !== null
      ? { text: contactPhone, href: `tel:${contactPhone.replaceAll('-', '')}` }
      : contactVisibility === 'LOGGED_IN_ONLY'
        ? { text: '로그인 후 확인 가능', href: null }
        : contactVisibility === 'PRIVATE'
          ? { text: '대표 연락처 비공개', href: null }
          : null; // PUBLIC + 회장 미등록 → 숨김
  const hasAny = snsLinks.length > 0 || location !== null || contactLine !== null;
  if (!hasAny) return null;
  return (
    <div className="rounded-[18px] bg-sage-mist p-5">
      <div className="mb-3 text-xs font-bold tracking-wide06 text-ink-deep">CONTACT</div>
      <ul className="flex flex-col gap-2 text-[13.5px] text-charcoal">
        {location !== null && <li>📍 {location}</li>}
        {contactLine !== null && (
          <li>
            📞{' '}
            {contactLine.href ? (
              <a href={contactLine.href} className="hover:underline">{contactLine.text}</a>
            ) : (
              <span className="text-charcoal-3">{contactLine.text}</span>
            )}
          </li>
        )}
        {snsLinks.map((link) => {
          const safeUrl = safeExternalHref(link.url);
          const displayName = snsDisplayName(link);
          return (
            <li key={link.url}>
              {safeUrl ? (
                <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {displayName} · {link.url}
                </a>
              ) : (
                <span>{displayName} · {link.url}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

`ClubDetailAbout.tsx` — `majorProjects: string | null` prop 을 `projects: ClubProject[]` 로 교체하고 카드 렌더:

```tsx
import type { ClubProject } from '@duing/types';
import { PROJECT_ICON_COMPONENTS, projectCardTone } from '../../../_lib/projectIcons';

type Props = {
  description: string | null;
  highlights: string[];
  projects: ClubProject[];
};

export function ClubDetailAbout({ description, highlights, projects }: Props) {
  const hasAny = description !== null || highlights.length > 0 || projects.length > 0;
  if (!hasAny) return null;

  return (
    <article className="max-w-[700px] text-[15.5px] leading-relaxed text-charcoal">
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

      {projects.length > 0 && (
        <>
          <h3 className="mt-6 mb-3 font-bold text-ink-deep">주요 프로젝트</h3>
          <ul className="space-y-2">
            {projects.map((project, idx) => {
              const IconComponent = PROJECT_ICON_COMPONENTS[project.icon];
              return (
                <li
                  key={`${project.title}-${idx}`}
                  className="flex items-center gap-3 rounded-[12px] border border-line bg-white px-3 py-2.5"
                >
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-[10px] ${projectCardTone(idx)}`}
                  >
                    <IconComponent aria-hidden className="h-5 w-5 text-ink-deep" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-ink-deep">{project.title}</span>
                    {project.subtitle !== null && (
                      <span className="mt-0.5 block truncate text-[12px] text-charcoal-3">{project.subtitle}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </article>
  );
}
```

`ClubDetailTabs.tsx` — About/Contact 에 새 props 전달(`projects={club.projects}`, `contactPhone={club.contactPhone}`, `contactVisibility={club.contactVisibility}`), 탭 노출 판정에서 `majorProjects` → `projects.length > 0`, `contactEmail` → `contactPhone !== null || contactVisibility !== 'PUBLIC'` 로 치환.

- [ ] **Step 4: 픽스처 정리 + 전체 그린**

```bash
cd frontend && grep -rln "contactEmail\|majorProjects\|membershipFee\b" apps/web packages | grep -v node_modules
```
남은 참조(테스트 픽스처 등)를 전부 새 필드로 치환 (`contactPhone: null, contactVisibility: 'PUBLIC', feeCycle: 'NONE', membershipFeeAmount: null, projects: []` 기본). 이후:

```bash
pnpm lint && pnpm typecheck && pnpm test
```
Expected: 전부 PASS.

- [ ] **Step 5: 커밋**

```bash
git add frontend/
git commit -m "feat(frontend): 학생 동아리 상세에 프로젝트 카드·회비 조합·대표 연락처 정책 안내 반영"
```

**PR-2 완료 후:** spec 리뷰 + codex:review. 사용자에게 push/PR 여부 확인.

---

# PR-3 · Frontend 폼 리디자인 + Sticky Preview

> 디자인 기준: 스펙 §6~§7 + 사용자 제공 목업(`MgrClubInfo`). 카드 번호 배지·잠금 인풋·요일 버튼·세그먼트·체크 카드·드래그 핸들·겹침 로고 구조를 목업대로 따르되, 색·클래스는 관리 콘솔 기존 토큰(`#cfcab8`/`#4a6b3f`/`#2a2f27` 계열, `btn btn-primary`)을 쓴다.

## Task 7: 폼 프리미티브 + 리피터 컴포넌트

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/SectionCard.tsx`
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/LockedInput.tsx`
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ContactVisibilityField.tsx`
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/FeeCycleSegment.tsx`
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ProjectIconPicker.tsx`
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ProjectsRepeater.tsx`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/HighlightsRepeater.tsx` (dnd 정렬 + 추가 7 제한으로 재작성)
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/SnsLinksRepeater.tsx` (4종+기타 label 입력)
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/TagsInput.tsx` (`maxTagLength` prop 추가 — **IME 3중 가드(isComposing+keyCode 229+조합상태)는 절대 변경 금지**)
- Test: `frontend/apps/web/test/manage/club-info-repeaters.test.tsx` (신규)

**Interfaces:**
- Consumes: Task 5 의 타입·`PROJECT_ICON_COMPONENTS`·`projectCardTone`·`SNS_PLATFORM_LABELS`. dnd-kit(`@dnd-kit/core`/`sortable`/`utilities` — 기설치, `apps/web/app/manage/clubs/[clubId]/photos/_components/PhotoGrid.tsx` 의 센서·전략 패턴 재사용).
- Produces (Task 8 이 사용):

```ts
SectionCard: { number: number; title: string; description?: string; children: ReactNode }
LockedInput: { value: string }                       // 자물쇠 아이콘 포함 읽기 전용 표시
ContactVisibilityField: {
  phone: string | null;                              // null = 회장 미등록
  value: ContactVisibility;
  onChange: (next: ContactVisibility) => void;
  disabled: boolean;
}
FeeCycleSegment: { value: FeeCycle; onChange: (next: FeeCycle) => void; disabled: boolean }
ProjectIconPicker: { value: ProjectIcon; onChange: (next: ProjectIcon) => void }
ProjectsRepeater: { value: ClubProject[]; onChange: (next: ClubProject[]) => void; readOnly: boolean } // 최대 6, dnd 정렬
HighlightsRepeater: { value: string[]; onChange: (next: string[]) => void; readOnly: boolean }         // 추가 제한 7, dnd 정렬
SnsLinksRepeater: { value: ClubSnsLink[]; onChange: (next: ClubSnsLink[]) => void; readOnly: boolean } // OTHER 선택 시 label 입력 노출
TagsInput: 기존 props + { maxTagLength?: number }    // 기본 5, 초과 입력 차단
```

- [ ] **Step 1: 실패하는 테스트 작성** — `club-info-repeaters.test.tsx`:

```tsx
// 렌더·상호작용 케이스 (Testing Library, user-event). dnd 동작은 jsdom 한계로 제외 — Task 9 실브라우저 QA.
it('강조 항목이 7개면 추가 버튼이 비활성화되고 7/7 카운터가 보인다', () => {});
it('강조 항목이 9개(레거시)여도 목록은 전부 렌더되고 삭제는 가능하다', () => {});
it('프로젝트 추가 시 아이콘 선택기에서 선택한 아이콘이 카드에 반영된다', () => {});
it('프로젝트가 6개면 추가 버튼이 비활성화된다', () => {});
it('SNS 플랫폼에서 기타를 선택하면 플랫폼명 입력이 나타난다', () => {});
it('기타에서 기본 플랫폼으로 되돌리면 label 이 null 로 초기화된다', () => {});
it('태그는 5자를 초과해 입력할 수 없다', () => {});
it('keyCode 229(한글 IME 조합 중) Enter 로는 태그가 등록되지 않는다', () => {}); // 기존 가드 회귀 방지
it('공개 범위 라디오에서 비공개를 선택하면 onChange 가 PRIVATE 로 호출된다', () => {});
it('회장 미등록이면 전화 대신 안내 문구가 보인다', () => {});
```

- [ ] **Step 2: 실패 확인** — `cd frontend && pnpm test -- club-info-repeaters` → FAIL.

- [ ] **Step 3: 구현**

`SectionCard.tsx`:

```tsx
import type { ReactNode } from 'react';

type SectionCardProps = { number: number; title: string; description?: string; children: ReactNode };

/** 목업의 번호 배지 카드 (§6.1). 배지·제목 행 + 32px 들여쓴 본문. */
export function SectionCard({ number, title, description, children }: SectionCardProps) {
  return (
    <section className="mb-4 rounded-[18px] border border-[#d9d4c3] bg-white p-[22px]">
      <div className={`flex items-baseline gap-2.5 ${description ? 'mb-1' : 'mb-4'}`}>
        <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-[#e3e9e1] font-mono text-[12px] font-extrabold text-[#1f3a2e]">
          {number}
        </span>
        <h3 className="text-[16px] font-bold text-[#2a2f27]">{title}</h3>
      </div>
      {description && <p className="mb-4 ml-8 text-[12.5px] leading-relaxed text-[#8a8f83]">{description}</p>}
      <div className="ml-0 sm:ml-8">{children}</div>
    </section>
  );
}
```

`LockedInput.tsx`:

```tsx
import { Lock } from 'lucide-react';

/** 총동연 전용 관리 항목 표시 — 잠금 아이콘 포함 읽기 전용 (§6.1 목업 Locked Input). */
export function LockedInput({ value }: { value: string }) {
  return (
    <div className="flex w-full items-center gap-2 rounded-[8px] border border-[#cfcab8] bg-[#f5f3ec] px-3 py-2.5 text-[14px] font-semibold text-[#4a5247]">
      <span className="min-w-0 flex-1 truncate">{value}</span>
      <Lock aria-label="총동연 관리 항목" className="h-3.5 w-3.5 shrink-0 text-[#8a8f83]" />
    </div>
  );
}
```

`ContactVisibilityField.tsx`:

```tsx
'use client';

import type { ContactVisibility } from '@duing/types';

const VISIBILITY_OPTIONS: { value: ContactVisibility; label: string }[] = [
  { value: 'PUBLIC', label: '전체 공개' },
  { value: 'LOGGED_IN_ONLY', label: '로그인 사용자만 공개' },
  { value: 'PRIVATE', label: '비공개' },
];

type Props = {
  phone: string | null;
  value: ContactVisibility;
  onChange: (next: ContactVisibility) => void;
  disabled: boolean;
};

export function ContactVisibilityField({ phone, value, onChange, disabled }: Props) {
  return (
    <div className="space-y-3">
      {phone !== null ? (
        <div className="flex w-full max-w-[280px] items-center gap-2 rounded-[8px] border border-[#cfcab8] bg-[#f5f3ec] px-3 py-2.5 font-mono text-[14px] font-semibold text-[#2a2f27]">
          {phone}
          <span className="text-[11.5px] font-normal text-[#8a8f83]">(회장 전화번호)</span>
        </div>
      ) : (
        <p className="text-[13px] text-[#8a8f83]">
          회장 미등록 — 회원 명단에서 회장을 지정하면 자동으로 연동됩니다.
        </p>
      )}

      <fieldset disabled={disabled} className="m-0 border-0 p-0">
        <legend className="mb-1.5 text-[12.5px] font-medium text-[#4a5247]">공개 범위</legend>
        <div className="flex flex-col gap-1.5">
          {VISIBILITY_OPTIONS.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-center gap-2 text-[13.5px] text-[#2a2f27]">
              <input
                type="radio"
                name="contact-visibility"
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                className="accent-[#4a6b3f]"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <p className="text-[12px] leading-relaxed text-[#8a8f83]">
        대표 연락처를 공개하면 외부 방문자도 동아리에 직접 연락할 수 있습니다. 공개 전 회장에게 반드시 안내
        및 동의를 받아주세요.
      </p>
      {value === 'PUBLIC' && (
        <p className="text-[12px] leading-relaxed text-[#b04a2a]">
          대표 연락처를 전체 공개하면 로그인하지 않은 외부 방문자도 전화번호를 확인할 수 있습니다.
        </p>
      )}
    </div>
  );
}
```

`FeeCycleSegment.tsx`:

```tsx
'use client';

import type { FeeCycle } from '@duing/types';

const CYCLE_OPTIONS: { value: FeeCycle; label: string }[] = [
  { value: 'NONE', label: '회비 없음' },
  { value: 'ONE_TIME', label: '1회 납부' },
  { value: 'SEMESTER', label: '학기당' },
  { value: 'YEARLY', label: '연간' },
  { value: 'MONTHLY', label: '월간' },
];

type Props = { value: FeeCycle; onChange: (next: FeeCycle) => void; disabled: boolean };

export function FeeCycleSegment({ value, onChange, disabled }: Props) {
  return (
    <div role="radiogroup" aria-label="납부 주기" className="inline-flex flex-wrap gap-[3px] rounded-[11px] bg-[#f0ede3] p-[3px]">
      {CYCLE_OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`rounded-[9px] px-3.5 py-2 text-[13px] font-bold transition-colors disabled:cursor-default ${
              selected ? 'bg-white text-[#2a2f27] shadow-sm' : 'bg-transparent text-[#8a8f83] hover:text-[#4a5247]'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
```

`ProjectIconPicker.tsx`:

```tsx
'use client';

import { PROJECT_ICONS, type ProjectIcon } from '@duing/types';
import { PROJECT_ICON_COMPONENTS } from '@/app/_lib/projectIcons';

type Props = { value: ProjectIcon; onChange: (next: ProjectIcon) => void };

export function ProjectIconPicker({ value, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="아이콘 선택" className="grid grid-cols-10 gap-1.5 max-sm:grid-cols-5">
      {PROJECT_ICONS.map((icon) => {
        const IconComponent = PROJECT_ICON_COMPONENTS[icon];
        const selected = value === icon;
        return (
          <button
            key={icon}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={icon}
            onClick={() => onChange(icon)}
            className={`grid h-9 w-9 place-items-center rounded-[8px] border transition-colors ${
              selected
                ? 'border-[#4a6b3f] bg-[#e3e9e1] text-[#1f3a2e]'
                : 'border-[#e2ddcb] bg-white text-[#8a8f83] hover:border-[#cfcab8] hover:text-[#4a5247]'
            }`}
          >
            <IconComponent className="h-4.5 w-4.5" />
          </button>
        );
      })}
    </div>
  );
}
```

`ProjectsRepeater.tsx` — dnd 정렬 + 인라인 편집(최대 6). dnd 배선은 `PhotoGrid.tsx` 의 `DndContext`/`SortableContext`/`useSortable` 패턴을 그대로 따른다:

```tsx
'use client';

import { useState } from 'react';
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { ClubProject } from '@duing/types';
import { PROJECT_ICON_COMPONENTS, projectCardTone } from '@/app/_lib/projectIcons';
import { ProjectIconPicker } from './ProjectIconPicker';

const MAX_PROJECTS = 6;

type Props = { value: ClubProject[]; onChange: (next: ClubProject[]) => void; readOnly: boolean };

function SortableProjectRow({
  id, project, index, readOnly, editing, onEdit, onRemove, onPatch,
}: {
  id: string;
  project: ClubProject;
  index: number;
  readOnly: boolean;
  editing: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onPatch: (patch: Partial<ClubProject>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id, disabled: readOnly });
  const IconComponent = PROJECT_ICON_COMPONENTS[project.icon];
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="rounded-[12px] border border-[#e2ddcb] bg-white"
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        {!readOnly && (
          <button
            type="button"
            aria-label="순서 변경"
            className="cursor-grab touch-none text-[#b8b8ac] hover:text-[#4a5247]"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <span className={`grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[10px] ${projectCardTone(index)}`}>
          <IconComponent aria-hidden className="h-5 w-5 text-[#1f3a2e]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-bold text-[#2a2f27]">{project.title || '제목 없음'}</span>
          {project.subtitle !== null && project.subtitle !== '' && (
            <span className="mt-0.5 block truncate text-[11.5px] text-[#8a8f83]">{project.subtitle}</span>
          )}
        </span>
        {!readOnly && (
          <>
            <button type="button" onClick={onEdit} className="shrink-0 text-[12.5px] font-medium text-[#3e5b34] hover:underline">
              {editing ? '접기' : '편집'}
            </button>
            <button type="button" onClick={onRemove} aria-label="프로젝트 삭제" className="shrink-0 text-[12.5px] text-[#8a8f83] hover:text-[#b35a3a]">
              ✕
            </button>
          </>
        )}
      </div>
      {editing && !readOnly && (
        <div className="space-y-3 border-t border-[#f0ede3] px-3 py-3">
          <ProjectIconPicker value={project.icon} onChange={(icon) => onPatch({ icon })} />
          <input
            type="text"
            value={project.title}
            maxLength={30}
            onChange={(event) => onPatch({ title: event.target.value })}
            placeholder="프로젝트 제목 (30자 이내)"
            className="w-full rounded-[8px] border border-[#cfcab8] px-3 py-2 text-[13.5px] focus:border-[#4a6b3f] focus:outline-none"
          />
          <input
            type="text"
            value={project.subtitle ?? ''}
            maxLength={40}
            onChange={(event) => onPatch({ subtitle: event.target.value === '' ? null : event.target.value })}
            placeholder="부제목 (선택, 40자 이내)"
            className="w-full rounded-[8px] border border-[#cfcab8] px-3 py-2 text-[13.5px] focus:border-[#4a6b3f] focus:outline-none"
          />
        </div>
      )}
    </li>
  );
}

export function ProjectsRepeater({ value, onChange, readOnly }: Props) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = value.map((_, index) => `project-${index}`);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    onChange(arrayMove(value, from, to));
    setEditingIndex(null);
  }

  function add() {
    if (value.length >= MAX_PROJECTS) return;
    onChange([...value, { icon: 'CODE', title: '', subtitle: null }]);
    setEditingIndex(value.length);
  }

  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {value.map((project, index) => (
              <SortableProjectRow
                key={ids[index]}
                id={ids[index]}
                project={project}
                index={index}
                readOnly={readOnly}
                editing={editingIndex === index}
                onEdit={() => setEditingIndex(editingIndex === index ? null : index)}
                onRemove={() => {
                  onChange(value.filter((_, i) => i !== index));
                  setEditingIndex(null);
                }}
                onPatch={(patch) => onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)))}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {!readOnly && (
        <button
          type="button"
          onClick={add}
          disabled={value.length >= MAX_PROJECTS}
          className="text-[13px] font-medium text-[#3e5b34] hover:underline disabled:cursor-not-allowed disabled:text-[#b8b8ac] disabled:no-underline"
        >
          ＋ 프로젝트 추가 ({value.length}/{MAX_PROJECTS})
        </button>
      )}
    </div>
  );
}
```

`HighlightsRepeater.tsx` — 동일한 dnd 패턴으로 재작성. 행 UI 는 목업의 체크 카드: `⠿ 핸들(GripVertical) + Check 아이콘(text-[#4a6b3f]) + <input value> + ✕ 삭제`. 추가 버튼: `＋ 항목 추가 ({value.length}/7)`, `value.length >= 7` 이면 disabled (기존 8~10개 레거시는 렌더·수정·삭제 가능, 추가만 차단 — §4.4). 항목 input `maxLength={100}`.

`SnsLinksRepeater.tsx` — PLATFORMS 를 라벨 select 로 교체:

```tsx
// 핵심 변경부만 — 나머지 구조·클래스는 기존 유지
import { SNS_PLATFORM_LABELS } from '@/app/_lib/snsPlatform';
const PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'KAKAO', 'OTHER'] as const;

// select 옵션: {PLATFORMS.map((p) => <option key={p} value={p}>{SNS_PLATFORM_LABELS[p]}</option>)}
// platform 변경 핸들러: update(idx, { platform: next, label: next === 'OTHER' ? (link.label ?? '') : null })
// OTHER 행에만 label 입력 추가 (URL input 앞):
{link.platform === 'OTHER' && (
  <input
    type="text"
    value={link.label ?? ''}
    maxLength={20}
    onChange={(event) => update(idx, { label: event.target.value })}
    placeholder="플랫폼명 (예: GitHub)"
    disabled={readOnly}
    className={rowInputCls}
  />
)}
// add(): { platform: 'INSTAGRAM', label: null, url: '' }
// 행 grid: OTHER 여부에 따라 'grid grid-cols-[110px_1fr_auto]' → OTHER 시 두 입력을 세로 스택으로
```

`TagsInput.tsx` — props 에 `maxTagLength?: number`(기본 5) 추가, 입력 `maxLength={maxTagLength}` + 등록 시 `if (tag.length > maxTagLength) return;` 가드. **IME 관련 코드(isComposing/keyCode 229/조합상태 가드)는 그대로 둔다.**

- [ ] **Step 4: 테스트 통과** — `cd frontend && pnpm test -- club-info-repeaters` → PASS.

- [ ] **Step 5: 커밋**

```bash
git add frontend/
git commit -m "feat(frontend): 동아리 정보 폼 프리미티브 — 잠금 인풋·공개범위·회비 세그먼트·프로젝트/강조 드래그 리피터"
```

---

## Task 8: ClubInfoForm 전면 재작성 + Sticky Preview + 페이지 배선

**Files:**
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx` (전면 재작성)
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubProfilePreview.tsx`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/info/page.tsx` (`readOnly` → `mode` 매핑)
- Modify: `frontend/apps/web/app/admin/clubs/[clubId]/_pages/AdminClubDetailPage.tsx` (`mode="admin"`)
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/FaqsRepeater.tsx` (목업 Q&A 카드 스타일로 restyle — 기능 변경 없음)
- Test: `frontend/apps/web/test/manage/club-info-form.test.tsx` (신규 또는 기존 갱신)

**Interfaces:**
- Consumes: Task 5·7 전부, `updateClubSchema`/`adminUpdateClubSchema`, `formatClubFee`, 기존 `ImageUploader`/`ActiveDaysToggle`/`ButtonSpinner`/`DIVISIONS`/`COLLEGE_OPTIONS`. 활동 요일 라벨은 기존 유틸 재사용(`grep -rn "activeDays" apps/web/app/clubs/_lib` 로 위치 확인 — `apps/web/test/clubs/active-days-label.test.ts` 가 가리키는 함수).
- Produces:

```ts
ClubInfoFormProps = {
  detail: ClubDetail;
  mode: 'leader' | 'officer' | 'admin';   // §6 표 — officer 는 전체 읽기 전용 + 저장 버튼 미노출
  mutation: { mutateAsync: (payload: AdminUpdateClubPayload) => Promise<ClubDetail>; isPending: boolean };
  onCancel?: () => void;
  onSaved?: () => void;
};
ClubProfilePreview: { preview: ClubPreviewData }     // 아래 타입, ClubInfoForm 내부에서 조립
type ClubPreviewData = {
  name: string; logoUrl: string; coverUrl: string; cohortNumber: number | null;
  tagline: string; tags: string[]; foundedYear: number | null;
  activityFrequency: number | null; activeDays: ClubDayOfWeek[]; location: string;
  feeCycle: FeeCycle; membershipFeeAmount: number | null; highlights: string[];
};
```

- [ ] **Step 1: 실패하는 테스트 작성** — `club-info-form.test.tsx`:

```tsx
it('leader 모드는 동아리명·카테고리·분과가 잠금 표시되고 안내 문구가 보인다', () => {});
it('officer 모드는 저장 버튼이 노출되지 않는다', () => {});
it('admin 모드는 동아리명 입력이 편집 가능하다', () => {});
it('한줄 소개 입력 시 프리뷰에 즉시 반영된다', () => {});
it('회비 주기를 학기당으로 바꾸고 금액을 넣으면 페이로드에 쌍으로 담긴다', () => {});
it('회비를 회비 없음으로 바꾸면 페이로드 금액이 null 이다', () => {});
it('leader 모드 페이로드에는 name/category/division/college 키가 없다', () => {});
it('기존 회비 미입력(NONE)이면 재입력 안내가 보이고, 주기를 저장 상태로 바꾸면 사라진다', () => {});
it('과동아리(centralClub=false)는 분과 대신 단과대학이 잠금 표시된다', () => {});
```

(mutation 은 `mutateAsync: vi.fn()` 주입 — TanStack Query 내부 모킹 아님.)

- [ ] **Step 2: 실패 확인** — `pnpm test -- club-info-form` → FAIL.

- [ ] **Step 3: `ClubInfoForm.tsx` 전면 재작성**

구조 (전체 파일 ~450줄, 아래 골격과 규칙대로 완성):

```tsx
'use client';
// imports: 타입, updateClubSchema/adminUpdateClubSchema, Task 7 컴포넌트, ImageUploader,
// ActiveDaysToggle, TagsInput, FaqsRepeater, ButtonSpinner, DIVISIONS, COLLEGE_OPTIONS,
// ClubProfilePreview, CATEGORY_LABELS(기존 상수 유지)

export function ClubInfoForm({ detail, mode, mutation, onCancel, onSaved }: ClubInfoFormProps) {
  const readOnly = mode === 'officer';
  const adminMode = mode === 'admin';

  // ── state: 기존 필드 유지 + 신규 ──
  // name/category/division/college: adminMode 에서만 편집 (leader/officer 는 detail 값 그대로 표시)
  const [contactVisibility, setContactVisibility] = useState(detail.contactVisibility);
  const [feeCycle, setFeeCycle] = useState(detail.feeCycle);
  const [feeAmount, setFeeAmount] = useState(
    detail.membershipFeeAmount !== null ? String(detail.membershipFeeAmount) : '',
  );
  const [projects, setProjects] = useState(detail.projects);
  // contactEmail/membershipFee/majorProjects state 는 존재하지 않는다.

  // ── buildPayload(): 기존 diff 패턴 유지 + 규칙 ──
  // 1) 회비: feeCycle 또는 feeAmount 가 detail 과 다르면 항상 쌍으로 담는다 (§4.3):
  //    payload.feeCycle = feeCycle;
  //    payload.membershipFeeAmount = feeCycle === 'NONE' ? null : Number(feeAmount);
  // 2) projects/contactVisibility: JSON diff / 단순 비교.
  // 3) adminMode 일 때만 name/category/division/college(+clearCollege) diff 추가.
  //    leader/officer 페이로드에 잠금 필드 키가 절대 들어가지 않는다.

  // ── handleSubmit(): fullData 를 mode 에 따라 updateClubSchema | adminUpdateClubSchema 로 safeParse.
  //    fullData 의 회비: { feeCycle, membershipFeeAmount: feeCycle === 'NONE' ? null : (feeAmount === '' ? null : Number(feeAmount)) }
  //    유료 주기 + 빈 금액은 zod feePairRule 이 잡는다(에러 메시지 그대로 노출).

  const showFeeMigrationNotice =
    detail.feeCycle === 'NONE' && detail.membershipFeeAmount === null
    && feeCycle === 'NONE'; // §6.5 — 저장 상태 기준이므로 detail 로 판정, 입력 중엔 유지

  const preview: ClubPreviewData = { /* 현재 state 조립 — 저장 전 실시간 (§7) */ };

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-9 xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start xl:gap-6">
      <form onSubmit={handleSubmit}>
        <header>…기존 헤더 유지, officer 안내 문구 유지…</header>

        {/* ① 로고 · 커버 — 목업: 커버 위 좌하단 겹침 로고 */}
        <SectionCard number={1} title="로고 · 커버 이미지" description="커버는 프로필 상단 배경, 로고는 카드 아바타로 노출돼요.">
          <div className="relative mb-14">
            <ImageUploader value={coverUrl} onChange={setCoverUrl} purpose="COVER" aspectRatio="16/9" … />
            <div className="absolute -bottom-10 left-5 w-[96px] rounded-[16px] border-[3px] border-white bg-white shadow-md">
              <ImageUploader value={logoUrl} onChange={setLogoUrl} purpose="LOGO" aspectRatio="1/1" … />
            </div>
          </div>
          {/* readOnly 시 기존 ImageWithFallback 분기 유지 */}
        </SectionCard>

        {/* ② 기본 정보 — 잠금 3종 + 창설년도·기수·위치·대표 연락처 */}
        <SectionCard number={2} title="기본 정보"
          description={adminMode ? undefined
            : '동아리명 · 카테고리 · 분과(또는 단과대학)는 총동연에서 관리하며 운영진은 수정할 수 없습니다.'}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {adminMode
              ? <>…기존 name input / category select / division·college select (fieldset disabled={readOnly})…</>
              : <>
                  <Field label="동아리명"><LockedInput value={detail.name} /></Field>
                  <Field label="카테고리"><LockedInput value={CATEGORY_LABELS[detail.category]} /></Field>
                  {detail.centralClub
                    ? <Field label="분과"><LockedInput value={detail.division ?? '미지정'} /></Field>
                    : <Field label="단과대학"><LockedInput value={collegeLabel(detail.college)} /></Field>}
                </>}
          </div>
          …창설년도/현재 기수(2col grid) · 동아리방 위치 — 기존 input 패턴…
          <Field label="대표 연락처">
            <ContactVisibilityField phone={detail.contactPhone} value={contactVisibility}
              onChange={setContactVisibility} disabled={readOnly} />
          </Field>
        </SectionCard>

        {/* ③ 활동 요일 · 빈도 · 회비 */}
        <SectionCard number={3} title="활동 요일 · 빈도 · 회비">
          …ActiveDaysToggle + 주 N회 (기존 패턴)…
          <Field label="회비">
            {showFeeMigrationNotice && (
              <p className="mb-2 text-[12px] text-[#8a6d3b]">
                회비 정보가 새 형식으로 개편되었어요. 회비가 있다면 금액과 주기를, 없다면 &apos;회비 없음&apos;을 선택해 주세요.
              </p>
            )}
            <FeeCycleSegment value={feeCycle} onChange={(next) => {
              setFeeCycle(next);
              if (next === 'NONE') setFeeAmount('');
            }} disabled={readOnly} />
            {feeCycle !== 'NONE' && (
              <div className="mt-2 flex items-center gap-2">
                <input type="number" min={1} value={feeAmount}
                  onChange={(event) => setFeeAmount(event.target.value)}
                  className="w-[120px] …inputCls…" placeholder="30000" disabled={readOnly} />
                <span className="text-[13px] text-[#4a5247]">원</span>
              </div>
            )}
          </Field>
        </SectionCard>

        {/* ④ 소개 — 한줄(20자 카운터)·해시태그(TagsInput maxTagLength=5)·상세(textarea 카드) */}
        <SectionCard number={4} title="소개">…기존 tagline/tags/description 블록 이식…</SectionCard>

        {/* ⑤ 이런 사람이 좋아할 거예요 */}
        <SectionCard number={5} title="이런 사람이 좋아할 거예요"
          description="지원 전 핏을 판단하도록 돕는 문구예요. 최대 7줄.">
          <HighlightsRepeater value={highlights} onChange={setHighlights} readOnly={readOnly} />
        </SectionCard>

        {/* ⑥ 주요 프로젝트 */}
        <SectionCard number={6} title="주요 프로젝트" description="동아리 대표 활동·결과물을 보여줘요. 최대 6개.">
          <ProjectsRepeater value={projects} onChange={setProjects} readOnly={readOnly} />
        </SectionCard>

        {/* ⑦ SNS · 외부 링크 */}
        <SectionCard number={7} title="SNS · 외부 링크">
          <SnsLinksRepeater value={snsLinks} onChange={setSnsLinks} readOnly={readOnly} />
        </SectionCard>

        {/* ⑧ FAQ */}
        <SectionCard number={8} title="자주 묻는 질문" description="지원자 문의를 줄여줘요.">
          <FaqsRepeater value={faqs} onChange={setFaqs} readOnly={readOnly} />
        </SectionCard>

        …error/savedAt 표시 + 저장/취소 버튼 (officer 미노출, 기존 패턴 유지 — Preview 쪽엔 버튼 없음 §7)…
      </form>

      {/* 우측 Sticky Preview — xl 미만 숨김 (§7) */}
      <aside className="hidden xl:block xl:sticky xl:top-6">
        <ClubProfilePreview preview={preview} />
      </aside>
    </div>
  );
}
```

`Field` 는 파일 내 로컬 헬퍼(라벨+본문, 기존 `fieldCls`/`labelCls` 재사용)로 둔다. `collegeLabel` 은 `COLLEGE_OPTIONS` 에서 코드→라벨 조회(미지정 시 `'미지정'`).

`ClubProfilePreview.tsx` (전체):

```tsx
import { Check } from 'lucide-react';
import type { ClubDayOfWeek, FeeCycle } from '@duing/types';
import { formatClubFee } from '@/app/_lib/clubFee';

export type ClubPreviewData = {
  name: string; logoUrl: string; coverUrl: string; cohortNumber: number | null;
  tagline: string; tags: string[]; foundedYear: number | null;
  activityFrequency: number | null; activeDays: ClubDayOfWeek[]; location: string;
  feeCycle: FeeCycle; membershipFeeAmount: number | null; highlights: string[];
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
  if (feeText !== null) metaItems.push(['회비', feeText]); // NONE 은 학생 페이지와 동일하게 숨김 (§7)

  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2 text-[12px] font-bold tracking-[0.05em] text-[#8a8f83]">
        <span className="h-[7px] w-[7px] rounded-full bg-[#4a6b3f]" />학생에게 보이는 프로필
      </div>
      <div className="overflow-hidden rounded-[22px] border border-[#d9d4c3] bg-white shadow-md">
        <div className="relative h-24 bg-gradient-to-br from-[#1F4A36] to-[#2E6149]">
          {preview.coverUrl !== '' && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={preview.coverUrl} alt="" draggable={false} className="h-full w-full object-cover" />
          )}
          <div className="absolute -bottom-6 left-4 grid h-14 w-14 place-items-center overflow-hidden rounded-[16px] border-[3px] border-white bg-[#1f3a2e] font-mono text-[20px] font-bold text-white">
            {preview.logoUrl !== '' ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={preview.logoUrl} alt="로고" draggable={false} className="h-full w-full object-cover" />
            ) : (
              <span aria-hidden>{'{ }'}</span>
            )}
          </div>
        </div>
        <div className="px-4 pb-4 pt-9">
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
```

`info/page.tsx` — `readOnly` 계산을 mode 매핑으로 교체:

```tsx
const mode = managedClub.myRole === 'LEADER' ? 'leader' : 'officer';
// <ClubInfoForm detail={detail} mode={mode} mutation={updateMutation} />
```

`AdminClubDetailPage.tsx` — `<ClubInfoForm detail={club} mode="admin" mutation={updateMutation} onCancel={...} onSaved={...} />`.

`FaqsRepeater.tsx` — 목업 Q&A 카드 스타일(카드 테두리·Q 뱃지 `text-[#4a6b3f] font-extrabold`·질문 굵게·답변 들여쓰기)로 클래스만 조정. props·동작 변경 없음.

- [ ] **Step 4: 테스트 통과 + 전체 그린**

```bash
cd frontend && pnpm test -- club-info-form club-info-repeaters && pnpm lint && pnpm typecheck && pnpm test
```
Expected: 전부 PASS.

- [ ] **Step 5: 커밋**

```bash
git add frontend/
git commit -m "feat(frontend): 동아리 정보 편집 페이지 전면 리디자인 — 8카드 구조·mode 권한·Sticky Preview"
```

---

## Task 9: 통합 검증 + 실브라우저 QA

**Files:** 수정 없음(발견된 결함 수정만).

- [ ] **Step 1: 정적 검증** — `cd frontend && pnpm lint && pnpm typecheck && pnpm test && pnpm build` 전부 그린 확인 (build 출력 오류 0). `cd backend && ./gradlew test` 재확인.

- [ ] **Step 2: dev 서버 기동** — `cd frontend && pnpm dev` 를 **파일 리다이렉트 백그라운드**로 띄우고(파이프 금지) 로그에서 `Local: http://localhost:3000` 확인 (3001 로 밀리면 좀비 프로세스 정리: 부모→워커→포트 순 kill).

- [ ] **Step 3: Playwright MCP 로 QA** (jsdom 이 못 잡는 항목 중심):
  - `/manage/clubs/{clubId}/info` — 8카드 렌더, 커버 위 로고 겹침, Locked Input, 공개 범위 라디오, 회비 세그먼트↔금액 입력 연동.
  - **드래그 정렬**: 강조 항목·프로젝트 실드래그로 순서 변경 (메모리 전례: dnd 는 실브라우저 필수, `<img>` draggable 가드 확인).
  - **Sticky Preview**: 한줄 소개·태그·회비 입력이 즉시 반영, 스크롤 시 고정, 뷰포트 축소(<xl) 시 숨김.
  - 저장 → 성공 후 `/clubs/{clubId}` 학생 페이지에서 프로젝트 카드·회비 조합·연락처 안내 확인.
  - 총동연 콘솔 `/admin/clubs/{clubId}` 수정 모드 — 잠금 필드 편집 가능 확인.
  - 한글 IME 로 태그 입력(이중 등록 없음) 확인.
- [ ] **Step 4: 서버 정리** — dev 서버 프로세스 종료(부모→워커→:3000 점유 순), 종료 확인.
- [ ] **Step 5: 발견 결함 수정 후 재검증·커밋** — 수정이 있으면 해당 Task 의 테스트를 함께 보강.

**PR-3 완료 후:** spec 리뷰 + codex:review + (드래그·권한 분기) codex:adversarial-review. 이후 사용자에게 3개 브랜치 push/PR 생성 여부 확인.
