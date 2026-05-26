# Plan A — Club/Recruitment 스칼라 메타데이터 백엔드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Club 에 6개, Recruitment 에 3개의 스칼라 메타데이터 컬럼을 추가하고 응답 DTO 까지 노출한다. `showApplicantCount=true` 일 때만 `applicantCount` 를 응답에 포함한다.

**Architecture:** (1) Flyway V21·V22 로 컬럼 추가, (2) 엔티티에 필드/검증/`update()` 확장, (3) Command/Query/Request/Response DTO 에 필드 노출, (4) `ApplicationRepository.countByRecruitmentId` 추가 후 RecruitmentService.getById 가 `showApplicantCount` 조건부로 호출, (5) `activeDays` 는 DB `String(50)` CSV 컬럼 ↔ 엔티티 `Set<DayOfWeek>` 변환.

**Tech Stack:** Spring Boot 3.4, Java 21, Flyway, JPA, Hibernate 6, JUnit 5 + AssertJ + Fixture Monkey, Testcontainers.

**Spec:** `docs/superpowers/specs/2026-05-19-club-scalar-metadata-and-interview-fields-design.md` §2, §4, §5.

**Branch:** `feat/club-metadata-backend`

---

## File Structure

**Create:**
- `backend/src/main/resources/db/migration/V21__alter_club_add_metadata.sql`
- `backend/src/main/resources/db/migration/V22__alter_recruitment_add_interview_metadata.sql`
- `backend/src/test/java/com/duing/domain/club/service/ClubMetadataUpdateTest.java`
- `backend/src/test/java/com/duing/domain/recruitment/service/RecruitmentInterviewMetadataTest.java`

**Modify:**
- `backend/src/main/java/com/duing/domain/club/entity/Club.java`
- `backend/src/main/java/com/duing/domain/club/service/dto/command/UpdateClubCommand.java`
- `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubDetailQuery.java`
- `backend/src/main/java/com/duing/domain/club/controller/dto/request/UpdateClubRequest.java`
- `backend/src/main/java/com/duing/domain/club/controller/dto/response/ClubDetailResponse.java`
- `backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java` (필요시 update 호출 시그니처)
- `backend/src/main/java/com/duing/domain/recruitment/entity/Recruitment.java`
- `backend/src/main/java/com/duing/domain/recruitment/exception/RecruitmentException.java`
- `backend/src/main/java/com/duing/domain/recruitment/service/dto/command/CreateRecruitmentCommand.java`
- `backend/src/main/java/com/duing/domain/recruitment/service/dto/command/UpdateRecruitmentCommand.java`
- `backend/src/main/java/com/duing/domain/recruitment/service/dto/query/RecruitmentDetailQuery.java`
- `backend/src/main/java/com/duing/domain/recruitment/controller/dto/request/CreateRecruitmentRequest.java`
- `backend/src/main/java/com/duing/domain/recruitment/controller/dto/request/UpdateRecruitmentRequest.java`
- `backend/src/main/java/com/duing/domain/recruitment/controller/dto/response/RecruitmentDetailResponse.java`
- `backend/src/main/java/com/duing/domain/recruitment/service/GeneralRecruitmentService.java`
- `backend/src/main/java/com/duing/domain/application/repository/ApplicationRepository.java`

---

## Task 1: Flyway V21 — Club 메타 컬럼 추가

**Files:**
- Create: `backend/src/main/resources/db/migration/V21__alter_club_add_metadata.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 동아리 표시용 스칼라 메타데이터 컬럼 추가 (모두 nullable).
ALTER TABLE club ADD COLUMN IF NOT EXISTS founded_year       INTEGER;
ALTER TABLE club ADD COLUMN IF NOT EXISTS cohort_number      INTEGER;
ALTER TABLE club ADD COLUMN IF NOT EXISTS location           VARCHAR(200);
ALTER TABLE club ADD COLUMN IF NOT EXISTS contact_email      VARCHAR(200);
ALTER TABLE club ADD COLUMN IF NOT EXISTS activity_frequency INTEGER;
ALTER TABLE club ADD COLUMN IF NOT EXISTS active_days        VARCHAR(50);
ALTER TABLE club ADD COLUMN IF NOT EXISTS membership_fee     VARCHAR(100);
```

> AGENTS.md 규칙: `ADD COLUMN IF NOT EXISTS` 사용 (V8, V10, V11 패턴).

- [ ] **Step 2: 컴파일 확인**

Run from `backend/`: `./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/resources/db/migration/V21__alter_club_add_metadata.sql
git commit -m "feat(backend): club 스칼라 메타데이터 컬럼 7개 추가 (Flyway V21)"
```

---

## Task 2: Flyway V22 — Recruitment 면접/지원자 노출 컬럼 추가

**Files:**
- Create: `backend/src/main/resources/db/migration/V22__alter_recruitment_add_interview_metadata.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 모집 공고에 면접 일정 및 지원자 수 공개 토글 컬럼 추가.
ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS interview_start_date DATE;
ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS interview_end_date   DATE;
ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS show_applicant_count BOOLEAN NOT NULL DEFAULT FALSE;
```

- [ ] **Step 2: 컴파일 확인**

Run from `backend/`: `./gradlew compileJava`
Expected: SUCCESS

- [ ] **Step 3: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/resources/db/migration/V22__alter_recruitment_add_interview_metadata.sql
git commit -m "feat(backend): recruitment 면접 일정·지원자 공개 토글 컬럼 추가 (Flyway V22)"
```

---

## Task 3: Club 엔티티 확장 + `update()` 시그니처 확장

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/entity/Club.java`

> 백엔드 CLAUDE.md: 변수명 모호 축약 금지. `activeDays` 는 엔티티 내부에서 CSV ↔ `Set<DayOfWeek>` 변환.

- [ ] **Step 1: 필드 추가**

`Club.java` 의 `private List<ClubFaq> faqs = new ArrayList<>();` (현재 line 69) 바로 다음에 7개 필드 추가:

```java
@Column(name = "founded_year")
private Integer foundedYear;

@Column(name = "cohort_number")
private Integer cohortNumber;

@Column(name = "location", length = 200)
private String location;

@Column(name = "contact_email", length = 200)
private String contactEmail;

@Column(name = "activity_frequency")
private Integer activityFrequency;

/**
 * 활동 요일 CSV. 예: "MON,WED,FRI". 외부 노출은 {@link #getActiveDays()} 의 Set 뷰로 한다.
 */
@Column(name = "active_days", length = 50)
private String activeDays;

@Column(name = "membership_fee", length = 100)
private String membershipFee;
```

- [ ] **Step 2: 활동요일 변환 헬퍼**

`getFaqs()` 메서드 다음에 추가:

```java
public java.util.Set<java.time.DayOfWeek> getActiveDays() {
    if (activeDays == null || activeDays.isBlank()) {
        return java.util.Collections.emptySet();
    }
    java.util.Set<java.time.DayOfWeek> result = new java.util.LinkedHashSet<>();
    for (String token : activeDays.split(",")) {
        String trimmed = token.trim();
        if (trimmed.isEmpty()) continue;
        result.add(java.time.DayOfWeek.valueOf(trimmed));
    }
    return java.util.Collections.unmodifiableSet(result);
}

private static String toActiveDaysCsv(java.util.Set<java.time.DayOfWeek> days) {
    if (days == null || days.isEmpty()) return null;
    java.util.List<java.time.DayOfWeek> sorted = new java.util.ArrayList<>(days);
    sorted.sort(java.util.Comparator.naturalOrder());
    StringBuilder builder = new StringBuilder();
    for (java.time.DayOfWeek day : sorted) {
        if (builder.length() > 0) builder.append(',');
        builder.append(day.name());
    }
    return builder.toString();
}
```

- [ ] **Step 3: `update()` 시그니처 확장**

기존 `update(...)` 메서드 시그니처를 다음으로 교체:

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
        java.util.Set<java.time.DayOfWeek> activeDays,
        String membershipFee
) {
    if (name != null) this.name = name;
    if (category != null) this.category = category;
    if (division != null) this.division = division;
    if (description != null) this.description = description;
    if (logoUrl != null) this.logoUrl = logoUrl;
    if (coverUrl != null) this.coverUrl = coverUrl;
    if (tags != null) this.tags = tags.stream().distinct().toArray(String[]::new);
    if (snsLinks != null) this.snsLinks = new ArrayList<>(snsLinks);
    if (faqs != null) this.faqs = new ArrayList<>(faqs);
    if (foundedYear != null) this.foundedYear = foundedYear;
    if (cohortNumber != null) this.cohortNumber = cohortNumber;
    if (location != null) this.location = location;
    if (contactEmail != null) this.contactEmail = contactEmail;
    if (activityFrequency != null) this.activityFrequency = activityFrequency;
    if (activeDays != null) this.activeDays = toActiveDaysCsv(activeDays);
    if (membershipFee != null) this.membershipFee = membershipFee;
}
```

- [ ] **Step 4: 컴파일 확인 (호출처 컴파일 에러 예상)**

Run from `backend/`: `./gradlew compileJava 2>&1 | tail -40`
Expected: `GeneralClubService` 의 `club.update(...)` 호출이 인자 부족으로 실패. 이 호출처는 Task 4 에서 한꺼번에 고친다.

> 컴파일이 깨진 상태로 커밋하지 말 것. Task 4 와 같은 단위로 묶어 커밋.

---

## Task 4: `UpdateClubCommand` · `UpdateClubRequest` · 서비스 호출처 확장

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/dto/command/UpdateClubCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/dto/request/UpdateClubRequest.java`
- Modify: `backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java`

- [ ] **Step 1: `UpdateClubCommand` 필드 추가**

먼저 `UpdateClubCommand.java` 파일을 읽어 현재 record 구조 확인. 필드 정의의 끝(가장 마지막 인자 뒤)에 다음 7개 추가:

```java
Integer foundedYear,
Integer cohortNumber,
String location,
String contactEmail,
Integer activityFrequency,
java.util.Set<java.time.DayOfWeek> activeDays,
String membershipFee
```

- [ ] **Step 2: `UpdateClubRequest` 필드 추가**

먼저 파일을 읽어 record 구조와 `toCommand()` 헬퍼 구조 파악. 7개 필드 추가 (검증 어노테이션 포함):

```java
@Min(value = 1900, message = "창설년도는 1900 이상이어야 합니다.")
@Max(value = 2100, message = "창설년도가 너무 큽니다.")
Integer foundedYear,

@Min(value = 1, message = "기수는 1 이상이어야 합니다.")
Integer cohortNumber,

@Size(max = 200, message = "위치는 200자 이하여야 합니다.")
String location,

@Email(message = "이메일 형식이 올바르지 않습니다.")
@Size(max = 200, message = "이메일은 200자 이하여야 합니다.")
String contactEmail,

@Min(value = 1, message = "활동 빈도는 1 이상이어야 합니다.")
Integer activityFrequency,

java.util.Set<java.time.DayOfWeek> activeDays,

@Size(max = 100, message = "회비 표기는 100자 이하여야 합니다.")
String membershipFee
```

`toCommand()` 안에서 새 필드를 새 `UpdateClubCommand` 인스턴스에 전달.

import 추가: `jakarta.validation.constraints.Email`, `Max`, (이미 있는 경우 생략).

- [ ] **Step 3: `GeneralClubService.updateClub(...)` 호출처 수정**

`GeneralClubService` 에서 `club.update(...)` 호출 부분을 새 시그니처에 맞춰 7개 인자를 끝에 추가. 각 인자는 `command.foundedYear()` 등 그대로 전달.

- [ ] **Step 4: 컴파일 확인**

Run from `backend/`: `./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/club/entity/Club.java \
        backend/src/main/java/com/duing/domain/club/service/dto/command/UpdateClubCommand.java \
        backend/src/main/java/com/duing/domain/club/controller/dto/request/UpdateClubRequest.java \
        backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java
git commit -m "feat(backend): Club에 스칼라 메타데이터 7필드 + update 시그니처 확장"
```

---

## Task 5: `ClubDetailQuery` · `ClubDetailResponse` 에 메타 필드 노출

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubDetailQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/dto/response/ClubDetailResponse.java`

- [ ] **Step 1: `ClubDetailQuery` 필드 + `from()` 매핑 추가**

먼저 파일을 읽어 record 와 `from(Club)` 정적 팩토리를 확인. 7개 필드를 record 끝에 추가:

```java
Integer foundedYear,
Integer cohortNumber,
String location,
String contactEmail,
Integer activityFrequency,
java.util.Set<java.time.DayOfWeek> activeDays,
String membershipFee
```

`from(Club club)` 의 생성자 호출에 다음을 끝에 추가:

```java
club.getFoundedYear(),
club.getCohortNumber(),
club.getLocation(),
club.getContactEmail(),
club.getActivityFrequency(),
club.getActiveDays(),
club.getMembershipFee()
```

- [ ] **Step 2: `ClubDetailResponse` 필드 + `from()` 매핑 추가**

먼저 파일을 읽어 record 와 매핑 패턴 확인. 동일 패턴으로 7개 필드를 record 끝에 추가. JSON 직렬화는 Spring Boot 기본 Jackson 으로 `DayOfWeek` enum 이름이 들어간다 (`"MON"`).

`activeDays` 타입은 `java.util.Set<java.time.DayOfWeek>` 그대로 노출. (Jackson 이 enum.name() 으로 직렬화 — `["MON","WED","FRI"]`)

- [ ] **Step 3: 컴파일 확인**

Run from `backend/`: `./gradlew compileJava`
Expected: SUCCESS

- [ ] **Step 4: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/club/service/dto/query/ClubDetailQuery.java \
        backend/src/main/java/com/duing/domain/club/controller/dto/response/ClubDetailResponse.java
git commit -m "feat(backend): ClubDetail 응답에 스칼라 메타 필드 노출"
```

---

## Task 6: Club 메타데이터 통합 테스트

**Files:**
- Create: `backend/src/test/java/com/duing/domain/club/service/ClubMetadataUpdateTest.java`

> 기존 `RecruitmentCreateExtensionTest` 와 동일한 통합 테스트 패턴 (`@SpringBootTest + @Transactional + TestcontainersConfiguration`).

- [ ] **Step 1: 테스트 작성**

먼저 동아리 도메인의 기존 통합 테스트(예: `backend/src/test/java/com/duing/domain/club/`) 파일을 하나 열어 fixture 패턴(User/Club 생성 도우미) 확인. 본 테스트는 그 패턴을 그대로 따른다.

`backend/src/test/java/com/duing/domain/club/service/ClubMetadataUpdateTest.java`:

```java
package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.command.UpdateClubCommand;
import com.duing.domain.club.service.dto.query.ClubDetailQuery;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
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
class ClubMetadataUpdateTest {

    @Autowired private ClubService clubService;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("동아리 메타데이터(창설년도/기수/위치/이메일/활동/회비)를 업데이트하면 ClubDetail 응답에 반영된다")
    void updateAndReadClubMetadata() throws Exception {
        User leader = saveLeader();
        Club club = saveActiveClub("메타동아리");
        saveMembership(club, leader, ClubMemberRole.LEADER);

        UpdateClubCommand updateCommand = new UpdateClubCommand(
                club.getId(),
                leader.getId(),
                null, null, null, null, null, null, null, null, null,
                2018,                                               // foundedYear
                10,                                                 // cohortNumber
                "학생회관 405호",                                    // location
                "doing-code@duing.ac.kr",                           // contactEmail
                2,                                                  // activityFrequency
                new LinkedHashSet<>(List.of(DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY)),
                "학기당 30,000원"                                   // membershipFee
        );

        clubService.updateClub(updateCommand);

        ClubDetailQuery detail = clubService.getClubDetail(club.getId());
        assertThat(detail.foundedYear()).isEqualTo(2018);
        assertThat(detail.cohortNumber()).isEqualTo(10);
        assertThat(detail.location()).isEqualTo("학생회관 405호");
        assertThat(detail.contactEmail()).isEqualTo("doing-code@duing.ac.kr");
        assertThat(detail.activityFrequency()).isEqualTo(2);
        assertThat(detail.activeDays()).containsExactlyInAnyOrder(DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY);
        assertThat(detail.membershipFee()).isEqualTo("학기당 30,000원");
    }

    /* ---- helpers ---- */

    private User saveLeader() {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                "메타리더",
                "meta" + unique + "@daegu.ac.kr",
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
                ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private void saveMembership(Club club, User user, ClubMemberRole role) {
        clubMemberRepository.save(ClubMember.of(club, user, role));
    }
}
```

> 정확한 `ClubService.updateClub` / `getClubDetail` 메서드명은 `GeneralClubService` 를 읽어 확인. 다르면 실제 메서드명 사용.

- [ ] **Step 2: 테스트 컴파일 확인**

Run from `backend/`: `./gradlew compileTestJava`
Expected: SUCCESS

- [ ] **Step 3: (Docker 가용 시) 테스트 실행**

Run: `./gradlew test --tests "com.duing.domain.club.service.ClubMetadataUpdateTest"`
Expected: PASS. Docker 미가용 시 컴파일 SUCCESS 만 확인 후 DONE_WITH_CONCERNS 로 보고.

- [ ] **Step 4: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/test/java/com/duing/domain/club/service/ClubMetadataUpdateTest.java
git commit -m "test(backend): Club 메타데이터 업데이트/조회 통합 테스트 추가"
```

---

## Task 7: `ApplicationRepository.countByRecruitmentId` 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/application/repository/ApplicationRepository.java`

- [ ] **Step 1: 메서드 추가**

`ApplicationRepository` 안 (`existsByRecruitmentIdAndUserId` 다음 줄) 에 다음 메서드 추가:

```java
long countByRecruitmentId(Long recruitmentId);
```

> Spring Data JPA 가 메서드명만으로 쿼리를 만든다. 별도 `@Query` 필요 없음.

- [ ] **Step 2: 컴파일**

Run from `backend/`: `./gradlew compileJava`
Expected: SUCCESS

- [ ] **Step 3: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/application/repository/ApplicationRepository.java
git commit -m "feat(backend): ApplicationRepository.countByRecruitmentId 추가"
```

---

## Task 8: Recruitment 엔티티 + 면접 일정 검증 + 신규 예외

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/recruitment/entity/Recruitment.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/exception/RecruitmentException.java`

- [ ] **Step 1: 예외 추가**

`RecruitmentException.java` 의 inner class 영역 끝에 다음 예외 추가:

```java
public static class InvalidInterviewPeriodException extends RecruitmentException {
    private static final String MESSAGE = "면접 종료일은 시작일보다 빠를 수 없습니다.";

    public InvalidInterviewPeriodException() {
        super(MESSAGE, HttpStatus.BAD_REQUEST);
    }
}
```

- [ ] **Step 2: Recruitment 엔티티 필드 추가**

기존 필드 영역 (예: `useInterview` 다음) 에 추가:

```java
@Column(name = "interview_start_date")
private LocalDate interviewStartDate;

@Column(name = "interview_end_date")
private LocalDate interviewEndDate;

@Column(name = "show_applicant_count", nullable = false)
private boolean showApplicantCount;
```

- [ ] **Step 3: `Builder` / `createWithOptions` 시그니처 확장**

`createWithOptions` 의 시그니처에 끝에 3개 인자 추가:

```java
public static Recruitment createWithOptions(Club club, String title, String content,
                                            LocalDate startDate, LocalDate endDate, int capacity,
                                            ApplicationMode applicationMode, String externalFormUrl,
                                            boolean useInterview, TargetRole targetRole,
                                            LocalDate interviewStartDate,
                                            LocalDate interviewEndDate,
                                            boolean showApplicantCount) {
```

그리고 본문의 endDate 검증 다음에 면접일 검증 추가:

```java
if (interviewStartDate != null && interviewEndDate != null
        && interviewEndDate.isBefore(interviewStartDate)) {
    throw new RecruitmentException.InvalidInterviewPeriodException();
}
```

`Recruitment.builder()` 체인에 다음 호출 추가:

```java
.interviewStartDate(interviewStartDate)
.interviewEndDate(interviewEndDate)
.showApplicantCount(showApplicantCount)
```

`@Builder(access = AccessLevel.PRIVATE)` 생성자 시그니처에도 3개 인자 추가. 본문에서 `this.interviewStartDate = interviewStartDate; this.interviewEndDate = interviewEndDate; this.showApplicantCount = showApplicantCount;`

`Recruitment.create(...)` (간단 팩토리) 도 호출 시 끝에 `null, null, false` 추가.

- [ ] **Step 4: `update()` 확장**

기존 `update(UpdateRecruitmentCommand command)` 끝부분에 추가:

```java
if (command.interviewStartDate() != null || command.interviewEndDate() != null) {
    LocalDate resolvedInterviewStart = command.interviewStartDate() != null
            ? command.interviewStartDate() : this.interviewStartDate;
    LocalDate resolvedInterviewEnd = command.interviewEndDate() != null
            ? command.interviewEndDate() : this.interviewEndDate;
    if (resolvedInterviewStart != null && resolvedInterviewEnd != null
            && resolvedInterviewEnd.isBefore(resolvedInterviewStart)) {
        throw new RecruitmentException.InvalidInterviewPeriodException();
    }
    this.interviewStartDate = resolvedInterviewStart;
    this.interviewEndDate = resolvedInterviewEnd;
}
if (command.showApplicantCount() != null) {
    this.showApplicantCount = command.showApplicantCount();
}
```

- [ ] **Step 5: 컴파일 — 호출처 깨질 수 있음**

Run from `backend/`: `./gradlew compileJava 2>&1 | tail -30`
Expected: `createWithOptions` 호출처들이 인자 부족으로 실패할 수 있다. Task 9 에서 함께 고친다.

---

## Task 9: Recruitment Command/Request/Response/Service 확장

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/recruitment/service/dto/command/CreateRecruitmentCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/service/dto/command/UpdateRecruitmentCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/controller/dto/request/CreateRecruitmentRequest.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/controller/dto/request/UpdateRecruitmentRequest.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/service/GeneralRecruitmentService.java`

- [ ] **Step 1: `CreateRecruitmentCommand` 필드 추가**

record 끝에 3개 필드 추가:

```java
LocalDate interviewStartDate,
LocalDate interviewEndDate,
boolean showApplicantCount
```

compact constructor 안의 검증은 그대로 두고, `showApplicantCount` 는 boolean 이라 null 처리 불필요.

- [ ] **Step 2: `UpdateRecruitmentCommand` 필드 추가**

record 끝에 3개 필드 추가:

```java
LocalDate interviewStartDate,
LocalDate interviewEndDate,
Boolean showApplicantCount
```

update 는 nullable 이므로 `Boolean`.

- [ ] **Step 3: `CreateRecruitmentRequest` 필드 + `toCommand` 확장**

먼저 파일을 읽어 record 와 `toCommand` 구조 확인. 3개 필드 추가:

```java
LocalDate interviewStartDate,
LocalDate interviewEndDate,
Boolean showApplicantCount
```

`toCommand(...)` 안에서 `interviewStartDate, interviewEndDate, Boolean.TRUE.equals(showApplicantCount)` 를 새 Command 인자로 전달.

- [ ] **Step 4: `UpdateRecruitmentRequest` 필드 + `toCommand` 확장**

3개 필드 추가:

```java
LocalDate interviewStartDate,
LocalDate interviewEndDate,
Boolean showApplicantCount
```

`toCommand(...)` 에서 새 Command 인자로 전달.

- [ ] **Step 5: `GeneralRecruitmentService.create` 의 `Recruitment.createWithOptions` 호출 확장**

기존 호출 끝에 3개 인자 추가:

```java
createRecruitmentCommand.interviewStartDate(),
createRecruitmentCommand.interviewEndDate(),
createRecruitmentCommand.showApplicantCount()
```

- [ ] **Step 6: 컴파일**

Run from `backend/`: `./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 7: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/recruitment/entity/Recruitment.java \
        backend/src/main/java/com/duing/domain/recruitment/exception/RecruitmentException.java \
        backend/src/main/java/com/duing/domain/recruitment/service/dto/command/CreateRecruitmentCommand.java \
        backend/src/main/java/com/duing/domain/recruitment/service/dto/command/UpdateRecruitmentCommand.java \
        backend/src/main/java/com/duing/domain/recruitment/controller/dto/request/CreateRecruitmentRequest.java \
        backend/src/main/java/com/duing/domain/recruitment/controller/dto/request/UpdateRecruitmentRequest.java \
        backend/src/main/java/com/duing/domain/recruitment/service/GeneralRecruitmentService.java
git commit -m "feat(backend): Recruitment에 면접 일정·지원자 수 공개 필드 추가"
```

---

## Task 10: `RecruitmentDetailQuery` · `Response` 에 필드 + 조건부 `applicantCount` 노출

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/recruitment/service/dto/query/RecruitmentDetailQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/controller/dto/response/RecruitmentDetailResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/service/GeneralRecruitmentService.java`

- [ ] **Step 1: `RecruitmentDetailQuery` 필드 추가 + 정적 팩토리 수정**

record 끝에 4개 필드 추가:

```java
LocalDate interviewStartDate,
LocalDate interviewEndDate,
boolean showApplicantCount,
Integer applicantCount        // null if showApplicantCount=false
```

기존 `from(Recruitment recruitment, LocalDate today)` 를 더 이상 모든 case 에 충분하지 않으므로 다음 정적 팩토리로 교체 (오버로드 추가):

```java
public static RecruitmentDetailQuery from(
        Recruitment recruitment,
        LocalDate today,
        Integer applicantCount   // null 이면 응답에서도 null
) {
    List<String> questions = recruitment.getForm() != null
            ? recruitment.getForm().getQuestions()
            : List.of();
    return new RecruitmentDetailQuery(
            recruitment.getId(),
            recruitment.getClub().getId(),
            recruitment.getClub().getName(),
            recruitment.getTitle(),
            recruitment.getContent(),
            recruitment.getStartDate(),
            recruitment.getEndDate(),
            recruitment.getCapacity(),
            recruitment.getStatus(),
            RecruitmentDisplayStatus.resolve(
                    recruitment.getStatus(),
                    recruitment.getStartDate(),
                    recruitment.getEndDate(),
                    today),
            recruitment.isEffectivelyOpen(today),
            questions,
            recruitment.getApplicationMode(),
            recruitment.getExternalFormUrl(),
            recruitment.isUseInterview(),
            recruitment.getTargetRole(),
            recruitment.getInterviewStartDate(),
            recruitment.getInterviewEndDate(),
            recruitment.isShowApplicantCount(),
            applicantCount
    );
}
```

기존 1-인자 `from(recruitment, today)` 시그니처는 `from(recruitment, today, null)` 로 위임하는 오버로드로 유지하거나 제거. 호출처가 본 spec 내에서만 있으므로 제거하고 모든 호출처를 새 시그니처로 통일.

- [ ] **Step 2: `RecruitmentDetailResponse` 동일 패턴**

record 끝에 4개 필드 + `from(query)` 매핑에 추가:

```java
query.interviewStartDate(),
query.interviewEndDate(),
query.showApplicantCount(),
query.applicantCount()
```

- [ ] **Step 3: `GeneralRecruitmentService.getById` 수정**

기존 코드:

```java
public RecruitmentDetailQuery getById(Long recruitmentId) {
    Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
            .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
    return RecruitmentDetailQuery.from(recruitment, LocalDate.now());
}
```

→ 변경:

```java
public RecruitmentDetailQuery getById(Long recruitmentId) {
    Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
            .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
    Integer applicantCount = recruitment.isShowApplicantCount()
            ? (int) applicationRepository.countByRecruitmentId(recruitmentId)
            : null;
    return RecruitmentDetailQuery.from(recruitment, LocalDate.now(), applicantCount);
}
```

서비스 클래스 상단에 `private final ApplicationRepository applicationRepository;` 필드 추가 (`@RequiredArgsConstructor` 가 잡아준다).

import `com.duing.domain.application.repository.ApplicationRepository`.

- [ ] **Step 4: 컴파일**

Run from `backend/`: `./gradlew compileJava`
Expected: SUCCESS

- [ ] **Step 5: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/recruitment/service/dto/query/RecruitmentDetailQuery.java \
        backend/src/main/java/com/duing/domain/recruitment/controller/dto/response/RecruitmentDetailResponse.java \
        backend/src/main/java/com/duing/domain/recruitment/service/GeneralRecruitmentService.java
git commit -m "feat(backend): RecruitmentDetail에 면접 일정·지원자 수 조건부 노출"
```

---

## Task 11: Recruitment 통합 테스트

**Files:**
- Create: `backend/src/test/java/com/duing/domain/recruitment/service/RecruitmentInterviewMetadataTest.java`

- [ ] **Step 1: 테스트 작성**

기존 `RecruitmentAlwaysOpenTest.java` 파일을 fixture 패턴 참고용으로 열어 보고, 동일 패턴으로 작성:

```java
package com.duing.domain.recruitment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.command.CreateRecruitmentCommand;
import com.duing.domain.recruitment.service.dto.query.RecruitmentDetailQuery;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
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
class RecruitmentInterviewMetadataTest {

    @Autowired private RecruitmentService recruitmentService;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private ApplicationRepository applicationRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("면접 시작일이 종료일보다 늦으면 InvalidInterviewPeriodException 이 발생한다")
    void invalidInterviewPeriodIsRejected() throws Exception {
        Club club = saveClubWithLeader();
        CreateRecruitmentCommand invalidCommand = new CreateRecruitmentCommand(
                club.getId(),
                club.getLeader().getId(),
                "면접일정테스트",
                null,
                LocalDate.now(),
                LocalDate.now().plusDays(7),
                10,
                ApplicationMode.SELF,
                null,
                true,
                TargetRole.MEMBER,
                List.of("자기소개"),
                LocalDate.now().plusDays(10),
                LocalDate.now().plusDays(8),
                false
        );

        assertThatThrownBy(() -> recruitmentService.create(invalidCommand))
                .isInstanceOf(RecruitmentException.InvalidInterviewPeriodException.class);
    }

    @Test
    @DisplayName("showApplicantCount=false 면 RecruitmentDetail.applicantCount 가 null 로 응답된다")
    void applicantCountHiddenWhenToggleOff() throws Exception {
        Club club = saveClubWithLeader();
        Long recruitmentId = createRecruitment(club, false);

        RecruitmentDetailQuery detail = recruitmentService.getById(recruitmentId);
        assertThat(detail.showApplicantCount()).isFalse();
        assertThat(detail.applicantCount()).isNull();
    }

    @Test
    @DisplayName("showApplicantCount=true 면 applicantCount 가 실제 지원자 수로 응답된다")
    void applicantCountVisibleWhenToggleOn() throws Exception {
        Club club = saveClubWithLeader();
        Long recruitmentId = createRecruitment(club, true);

        Recruitment recruitment = recruitmentRepository.findById(recruitmentId).orElseThrow();
        User applicant = saveLeader("지원자");
        applicationRepository.save(Application.create(
                recruitment, applicant, java.util.Map.of("자기소개", "안녕")
        ));

        RecruitmentDetailQuery detail = recruitmentService.getById(recruitmentId);
        assertThat(detail.showApplicantCount()).isTrue();
        assertThat(detail.applicantCount()).isEqualTo(1);
    }

    /* ---- helpers ---- */

    private Long createRecruitment(Club club, boolean showApplicantCount) {
        return recruitmentService.create(new CreateRecruitmentCommand(
                club.getId(),
                club.getLeader().getId(),
                "공고",
                null,
                LocalDate.now(),
                LocalDate.now().plusDays(7),
                10,
                ApplicationMode.SELF,
                null,
                false,
                TargetRole.MEMBER,
                List.of("자기소개"),
                null,
                null,
                showApplicantCount
        ));
    }

    private Club saveClubWithLeader() throws Exception {
        User leader = saveLeader("리더");
        Club club = Club.create("면접일정-" + sequence.incrementAndGet(),
                ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        clubRepository.save(club);
        clubMemberRepository.save(ClubMember.of(club, leader, ClubMemberRole.LEADER));
        // Club.leader 가 별도 필드가 아니라 ClubMember 로 정규화돼 있음.
        // 본 테스트는 club.getLeader() 가 아니라 leader 변수로 직접 사용.
        return club;
    }

    private User saveLeader(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "user" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()
        ));
    }
}
```

> **주의:** 위 테스트의 `Application.create(...)` 인자, `Club.getLeader()` 존재 여부, `RecruitmentService.create` 와 `getById` 의 정확한 시그니처는 기존 `RecruitmentAlwaysOpenTest.java` 와 `Application` 엔티티를 읽어 맞춘다. 다르면 그 패턴 그대로 카피.

- [ ] **Step 2: 테스트 컴파일/실행**

Run from `backend/`: `./gradlew compileTestJava`
Expected: SUCCESS

(Docker 가용 시) `./gradlew test --tests "com.duing.domain.recruitment.service.RecruitmentInterviewMetadataTest"`
Expected: 3 PASS

- [ ] **Step 3: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/test/java/com/duing/domain/recruitment/service/RecruitmentInterviewMetadataTest.java
git commit -m "test(backend): Recruitment 면접 일정·지원자 수 노출 통합 테스트"
```

---

## Task 12: 전체 빌드 + PR

- [ ] **Step 1: 전체 컴파일/테스트**

Run from `backend/`: `./gradlew compileJava compileTestJava`
Expected: BUILD SUCCESSFUL.

Docker 가용 시 `./gradlew test`.

- [ ] **Step 2: PR 생성**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git push -u origin feat/club-metadata-backend
gh pr create --base develop --title "feat(backend): 동아리 스칼라 메타데이터 + 모집 면접/지원자 노출 확장" --body "$(cat <<'EOF'
## 🚀 작업 내용
- Club 에 창설년도/기수/위치/컨택 이메일/활동 빈도/활동 요일/회비 7개 컬럼을 추가했습니다.
- Recruitment 에 면접 시작일·종료일·지원자 수 공개 토글을 추가했습니다.
- ClubDetail/RecruitmentDetail 응답에 새 필드를 모두 노출했고, `applicantCount` 는 동아리장이 공개를 켰을 때만 응답에 포함됩니다.
- 면접 시작일이 종료일보다 늦으면 도메인 단에서 차단합니다.

## 🤔 고민했던 내용
- `activeDays` 를 CSV 로 보관하고 엔티티 내부에서 `Set<DayOfWeek>` 로 변환했습니다. 별도 테이블이나 PG enum 도입은 사용량(현재는 표시만) 대비 과한 비용이라 보류했습니다.
- 지원자 수는 동아리장이 비공개를 기본값으로 갖도록 했고, 응답에서도 null 로 떨어져 클라이언트가 행 자체를 숨길 수 있게 했습니다.

## 💬 리뷰 중점사항
- `Club.update()` 시그니처가 길어졌습니다. record-payload 도입은 별도 PR 로 검토하면 좋겠습니다.
- 면접 일정 검증이 startDate/endDate 둘 다 들어왔을 때만 동작합니다 (한쪽만 있어도 허용).
EOF
)"
```

---

## Self-Review

- [x] **스펙 커버리지** — §2 의 8개 필드 모두 Task 3/8 에서 추가. §3 의 capacity 갈음/회원수 제외는 코드 변경 없음. §4 마이그레이션 Task 1·2. §5 백엔드 변경 모두 Task 3~10. §6 프론트는 본 plan 범위 외 (Plan B).
- [x] **플레이스홀더 검사** — 모든 코드 블록 완성. "TBD" 없음.
- [x] **타입 일관성** — `Set<DayOfWeek>` / `Integer` / `LocalDate` 가 entity/Command/Query/Request/Response 전반에서 동일. `applicantCount` 는 `Integer`(nullable).
- [x] **DRY** — `applicantCount` 계산은 `getById` 한 곳에서만. CSV 변환은 엔티티 내부 헬퍼.
- [x] **TDD** — Task 6·11 통합 테스트.
- [x] **자주 커밋** — 12 task = 12 commit.
