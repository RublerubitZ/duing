# BE#0 — 지원 시 슬롯 제출 제거 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지원서 제출 흐름에서 면접 슬롯 선택(AT_APPLICATION 결합)을 제거해, 면접 세팅과 무관하게 지원이 항상 동작하게 만든다.

**Architecture:** `GeneralApplicationService.submit()` → `InterviewAvailabilityService.createAllInSubmission()` 호출 사슬과 `SubmitApplicationRequest/Command.interviewSlotIds` 필드를 제거한다. 구 스키마(interview_config/slot/availability)는 유지 — 테이블·엔티티는 BE#1 에서 전환한다. TDD: 디커플링 통합 테스트(RED) → 결합 제거(GREEN) → DTO 슬림화·죽은 코드 정리(REFACTOR).

**Tech Stack:** Spring Boot 3.4 / Java 21 / JUnit 5 + AssertJ / Testcontainers(@SpringBootTest 통합) / Mockito(단위)

**근거 스펙:** `docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md` §12 BE#0, §13 제거 대상
**후속:** BE#1(V49 스키마 전환)은 이 PR 머지 후 별도 계획으로 작성. FE#1(apply 슬롯 스텝 제거)이 이 PR 과 짝.

**역호환 메모 (PR 본문에 기재):** 구버전 FE 가 `interviewSlotIds` 를 계속 보내도 Spring Boot 기본 Jackson 설정(`fail-on-unknown-properties=false`, 오버라이드 없음 확인됨)으로 무시된다. 슬롯을 보내도 availability 는 더 이상 저장되지 않는다 — 출시 전이므로 허용, FE#1 에서 전송 UI 제거.

---

## File Map (변경 전모)

| 구분 | 파일 | 작업 |
|---|---|---|
| main | `backend/src/main/java/com/duing/domain/application/controller/dto/request/SubmitApplicationRequest.java` | `interviewSlotIds` 필드 제거 |
| main | `backend/src/main/java/com/duing/domain/application/service/dto/command/SubmitApplicationCommand.java` | `interviewSlotIds` 필드 제거 |
| main | `backend/src/main/java/com/duing/domain/application/service/GeneralApplicationService.java` | `createAllInSubmission` 호출 + `interviewAvailabilityService` 필드 + import 2개 제거 |
| main | `backend/src/main/java/com/duing/domain/interview/service/InterviewAvailabilityService.java` | `createAllInSubmission` 메서드 시그니처 제거 |
| main | `backend/src/main/java/com/duing/domain/interview/service/GeneralInterviewAvailabilityService.java` | `createAllInSubmission` 구현 제거 |
| main | `backend/src/main/java/com/duing/domain/interview/service/dto/command/CreateAvailabilitiesInSubmissionCommand.java` | 파일 삭제 |
| test | `backend/src/test/java/com/duing/domain/interview/service/InterviewAvailabilitySubmissionTest.java` | 파일 삭제 (8개 테스트 전부 제거 대상 행동 검증) |
| test | `backend/src/test/java/com/duing/domain/application/service/ApplicationSubmitDecouplingTest.java` | 신규 — 디커플링 통합 테스트 2건 |
| test | `backend/src/test/java/com/duing/domain/application/controller/dto/request/SubmitApplicationRequestTest.java` | 재작성 (슬롯 정규화 테스트 → answers 매핑 테스트) |
| test | `backend/src/test/java/com/duing/domain/application/service/ApplicationSubmitGuardsTest.java` | mock 필드·생성자 인자·command 4번째 인자 제거 |
| test | `backend/src/test/java/com/duing/domain/application/service/MyApplicationDetailAccessTest.java` | mock 필드·생성자 인자 제거 |
| test | `backend/src/test/java/com/duing/domain/application/service/MyApplicationsQueryTest.java` | mock 필드·생성자 인자 제거 |
| test | `backend/src/test/java/com/duing/domain/application/service/ApplicantDetailServiceTest.java` | mock 필드·생성자 인자 제거 |
| test | `backend/src/test/java/com/duing/domain/application/service/ApplicationStatusServiceTest.java` | mock 필드·생성자 인자 제거 |
| test | `backend/src/test/java/com/duing/domain/draft/integration/SubmitDiscardsDraftTest.java` | command 4번째 인자 제거 (3곳) |

주의: `GeneralApplicationService` 의 `interviewAvailabilityRepository`/`interviewScheduleRepository`/`interviewConfigRepository`/`interviewSlotRepository` 필드는 **조회 경로에서 계속 사용 중** — 건드리지 않는다 (BE#1 범위).

---

### Task 1: 브랜치 생성

- [x] **Step 1: develop 최신화 후 분기**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull origin develop
git checkout -b feat/remove-apply-slot-submission
```

Expected: `Switched to a new branch 'feat/remove-apply-slot-submission'`
(브랜치 네이밍은 저장소 실관행 — `refactor/unify-s3-env-var-names` 등 이슈번호 없는 형식 — 을 따른다)

---

### Task 2: 디커플링 통합 테스트 작성 (RED)

**Files:**
- Delete: `backend/src/test/java/com/duing/domain/interview/service/InterviewAvailabilitySubmissionTest.java`
- Create: `backend/src/test/java/com/duing/domain/application/service/ApplicationSubmitDecouplingTest.java`

구 테스트 8건은 전부 "지원 제출이 슬롯에 결합된" 행동(빈 슬롯 거부·마감 후 거부·슬롯 검증·availability 동시 저장)을 검증하므로 통째로 삭제한다. 새 테스트는 디커플링의 핵심 2가지를 검증한다. 이 시점에는 4-arg `SubmitApplicationCommand` 가 살아있으므로 로컬 헬퍼 `submitCommand()` 로 감싸 Task 4 에서 한 줄만 고치게 한다.

- [x] **Step 1: 구 테스트 파일 삭제**

```bash
git rm backend/src/test/java/com/duing/domain/interview/service/InterviewAvailabilitySubmissionTest.java
```

- [x] **Step 2: 새 통합 테스트 작성**

`backend/src/test/java/com/duing/domain/application/service/ApplicationSubmitDecouplingTest.java`:

```java
package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.interview.entity.InterviewConfig;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewConfigRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
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
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ApplicationSubmitDecouplingTest extends IntegrationTestBase {

    @Autowired private ApplicationService applicationService;
    @Autowired private ApplicationRepository applicationRepository;
    @Autowired private InterviewAvailabilityRepository availabilityRepository;
    @Autowired private InterviewConfigRepository configRepository;
    @Autowired private InterviewSlotRepository slotRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    // ── 헬퍼 (구 InterviewAvailabilitySubmissionTest 패턴 유지) ──────────────────

    private User saveStudent(String nameSuffix) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                nameSuffix + unique,
                "decouple" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    private Club saveActiveClub(String name) {
        Club club = Club.create(name + "-" + sequence.incrementAndGet(),
                ClubCategory.OTHER, "분과", "설명", null);
        try {
            Field statusField = Club.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(club, ClubStatus.ACTIVE);
        } catch (ReflectiveOperationException reflectionFailure) {
            throw new IllegalStateException(reflectionFailure);
        }
        return clubRepository.save(club);
    }

    private Recruitment saveOpenRecruitment(Club club, String title) {
        LocalDate today = LocalDate.now();
        return recruitmentRepository.save(
                Recruitment.create(club, title + "-" + sequence.incrementAndGet(),
                        null, today.minusDays(1), today.plusDays(7), 10));
    }

    private Recruitment setupInterviewRecruitment(String label) {
        User leader = saveStudent("리더-" + label);
        Club club = saveActiveClub("면접동아리-" + label);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        return saveOpenRecruitment(club, "면접모집-" + label);
    }

    private void saveOpenConfig(Long recruitmentId) {
        configRepository.save(
                InterviewConfig.create(recruitmentId, LocalDateTime.now().plusDays(7)));
    }

    private void saveClosedConfig(Long recruitmentId) {
        configRepository.save(
                InterviewConfig.create(recruitmentId, LocalDateTime.now().minusSeconds(1)));
    }

    private void saveSlot(Long recruitmentId) {
        slotRepository.save(
                InterviewSlot.create(recruitmentId,
                        LocalDateTime.now().plusDays(10),
                        LocalDateTime.now().plusDays(10).plusHours(1),
                        5));
    }

    // Task 4 에서 3-arg 로 축소된다 — 테스트 본문은 그대로 유지하기 위한 단일 변경점.
    private SubmitApplicationCommand submitCommand(Long recruitmentId, Long userId) {
        return new SubmitApplicationCommand(recruitmentId, userId, List.of(), List.of());
    }

    // ── 테스트 ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("면접 모집이어도 지원 제출은 슬롯 선택 없이 성공하고 availability 는 생성되지 않는다")
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void interviewRecruitmentSubmitSucceedsWithoutSlotSelection() {
        Recruitment recruitment = setupInterviewRecruitment("디커플링");
        saveOpenConfig(recruitment.getId());
        saveSlot(recruitment.getId());

        User applicant = saveStudent("지원자");
        Long applicationId = applicationService.submit(
                submitCommand(recruitment.getId(), applicant.getId()));

        assertThat(applicationId).isNotNull();
        assertThat(availabilityRepository.findByApplicationId(applicationId)).isEmpty();
    }

    @Test
    @DisplayName("availabilityDeadline 이 지난 면접 모집에도 지원 제출은 성공한다")
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void submitSucceedsAfterAvailabilityDeadline() {
        Recruitment recruitment = setupInterviewRecruitment("마감후디커플링");
        saveClosedConfig(recruitment.getId());
        saveSlot(recruitment.getId());

        User applicant = saveStudent("지원자");
        Long applicationId = applicationService.submit(
                submitCommand(recruitment.getId(), applicant.getId()));

        assertThat(applicationId).isNotNull();
        assertThat(applicationRepository.existsByRecruitmentIdAndUserId(
                recruitment.getId(), applicant.getId())).isTrue();
    }
}
```

- [x] **Step 3: RED 확인** (Docker 실행 상태 필요 — Testcontainers)

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend
./gradlew test --tests "com.duing.domain.application.service.ApplicationSubmitDecouplingTest"
```

Expected: **FAIL 2건** — 둘 다 `InterviewException$InvalidSlotSelection` (현재 구현은 InterviewConfig 가 있는 모집에서 빈 slotIds 를 400 으로 거부한다. 마감 케이스도 빈 슬롯 검증이 마감 검증보다 먼저라 같은 예외).

---

### Task 3: 제출 결합 제거 (GREEN)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/application/service/GeneralApplicationService.java`
- Modify: `backend/src/test/java/com/duing/domain/application/service/ApplicationSubmitGuardsTest.java`
- Modify: `backend/src/test/java/com/duing/domain/application/service/MyApplicationDetailAccessTest.java`
- Modify: `backend/src/test/java/com/duing/domain/application/service/MyApplicationsQueryTest.java`
- Modify: `backend/src/test/java/com/duing/domain/application/service/ApplicantDetailServiceTest.java`
- Modify: `backend/src/test/java/com/duing/domain/application/service/ApplicationStatusServiceTest.java`

`@RequiredArgsConstructor` 생성 생성자에서 `interviewAvailabilityService` 가 빠지면 13-arg 직접 생성하는 단위 테스트 5개가 컴파일 실패한다 — 같은 Task 에서 함께 수정해야 GREEN 이 된다.

- [x] **Step 1: `GeneralApplicationService.submit()` 에서 호출 제거**

`submit()` 내부에서 아래 블록을 삭제:

```java
        interviewAvailabilityService.createAllInSubmission(new CreateAvailabilitiesInSubmissionCommand(
                savedApplicationId,
                submitApplicationCommand.recruitmentId(),
                submitApplicationCommand.interviewSlotIds()
        ));
```

- [x] **Step 2: 필드 + import 제거**

필드 삭제:

```java
    private final InterviewAvailabilityService interviewAvailabilityService;
```

import 2줄 삭제:

```java
import com.duing.domain.interview.service.InterviewAvailabilityService;
import com.duing.domain.interview.service.dto.command.CreateAvailabilitiesInSubmissionCommand;
```

(나머지 interview repository 필드 4개와 그 import 는 조회 경로에서 사용 중 — 유지)

- [x] **Step 3: 단위 테스트 5개 파일에서 생성자 인자 제거**

5개 파일(`ApplicationSubmitGuardsTest`, `MyApplicationDetailAccessTest`, `MyApplicationsQueryTest`, `ApplicantDetailServiceTest`, `ApplicationStatusServiceTest`) 각각에서 동일 패턴 3줄 삭제:

mock 필드:

```java
    private final InterviewAvailabilityService interviewAvailabilityService = mock(InterviewAvailabilityService.class);
```

생성자 호출의 인자 한 줄 (`applicationEvaluationRepository,` 와 `interviewAvailabilityRepository,` 사이):

```java
            interviewAvailabilityService,
```

import:

```java
import com.duing.domain.interview.service.InterviewAvailabilityService;
```

- [x] **Step 4: GREEN 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend
./gradlew test --tests "com.duing.domain.application.service.ApplicationSubmitDecouplingTest" \
               --tests "com.duing.domain.application.*" \
               --tests "com.duing.domain.draft.*"
```

Expected: **전부 PASS** (디커플링 2건 GREEN. draft 통합 테스트는 4-arg command 를 아직 쓰므로 이 시점에 컴파일·통과 유지됨)

- [x] **Step 5: Commit**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src
git commit -m "feat(backend): 지원 제출에서 면접 슬롯 결합 제거"
```

---

### Task 4: DTO 슬림화 + 죽은 코드 정리 (REFACTOR)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/application/controller/dto/request/SubmitApplicationRequest.java`
- Modify: `backend/src/main/java/com/duing/domain/application/service/dto/command/SubmitApplicationCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/service/InterviewAvailabilityService.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/service/GeneralInterviewAvailabilityService.java`
- Delete: `backend/src/main/java/com/duing/domain/interview/service/dto/command/CreateAvailabilitiesInSubmissionCommand.java`
- Modify: `backend/src/test/java/com/duing/domain/application/controller/dto/request/SubmitApplicationRequestTest.java`
- Modify: `backend/src/test/java/com/duing/domain/application/service/ApplicationSubmitDecouplingTest.java`
- Modify: `backend/src/test/java/com/duing/domain/application/service/ApplicationSubmitGuardsTest.java`
- Modify: `backend/src/test/java/com/duing/domain/draft/integration/SubmitDiscardsDraftTest.java`

- [x] **Step 1: `SubmitApplicationRequest` 전체 교체**

```java
package com.duing.domain.application.controller.dto.request;

import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record SubmitApplicationRequest(
        @NotNull(message = "답변 목록은 필수 입력값입니다.")
        List<String> answers
) {
    public SubmitApplicationCommand toCommand(Long recruitmentId, Long userId) {
        return new SubmitApplicationCommand(recruitmentId, userId, answers);
    }
}
```

- [x] **Step 2: `SubmitApplicationCommand` 전체 교체**

```java
package com.duing.domain.application.service.dto.command;

import java.util.List;

public record SubmitApplicationCommand(
        Long recruitmentId,
        Long userId,
        List<String> answers
) {}
```

- [x] **Step 3: `InterviewAvailabilityService` 인터페이스에서 `createAllInSubmission` 제거 — 전체 교체**

```java
package com.duing.domain.interview.service;

import com.duing.domain.interview.controller.dto.response.MyInterviewAvailabilitiesResponse;
import com.duing.domain.interview.service.dto.command.UpdateAvailabilityCommand;

public interface InterviewAvailabilityService {

    /**
     * 지원자 본인이 자신의 application 에 등록된 면접 가능 시간을 전체 교체한다.
     * 기존 availability 를 모두 삭제하고 새 slotIds 로 재등록한다.
     */
    void replace(UpdateAvailabilityCommand command);

    /**
     * 지원자 본인이 등록한 면접 가능 시간(slotIds) 을 조회한다.
     */
    MyInterviewAvailabilitiesResponse findMyAvailabilities(Long applicationId, Long actorUserId);
}
```

- [x] **Step 4: `GeneralInterviewAvailabilityService` 에서 구현 제거**

`createAllInSubmission` 메서드 전체(Javadoc 포함, `@Override @Transactional public void createAllInSubmission(...) { ... }`)를 삭제하고 import 1줄 삭제:

```java
import com.duing.domain.interview.service.dto.command.CreateAvailabilitiesInSubmissionCommand;
```

(`HashSet`/`DataIntegrityViolationException`/`InterviewSlot`/`InterviewConfig`/`SQLException` 등 나머지 import 는 `replace()`/`isAvailabilityUniqueViolation()` 이 사용 — 유지)

- [x] **Step 5: command 파일 삭제**

```bash
git rm backend/src/main/java/com/duing/domain/interview/service/dto/command/CreateAvailabilitiesInSubmissionCommand.java
```

- [x] **Step 6: `SubmitApplicationRequestTest` 전체 교체** (구 2건은 슬롯 정규화 검증 — 무의미)

```java
package com.duing.domain.application.controller.dto.request;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SubmitApplicationRequestTest {

    @Test
    @DisplayName("지원 제출 요청은 답변과 경로 파라미터만으로 command 로 변환된다")
    void toCommandMapsAnswersAndIds() {
        SubmitApplicationRequest request = new SubmitApplicationRequest(List.of("답변"));

        SubmitApplicationCommand command = request.toCommand(1L, 100L);

        assertThat(command.answers()).containsExactly("답변");
        assertThat(command.recruitmentId()).isEqualTo(1L);
        assertThat(command.userId()).isEqualTo(100L);
    }
}
```

- [x] **Step 7: 테스트 3개 파일의 4-arg command 호출을 3-arg 로 축소**

`ApplicationSubmitDecouplingTest` — 헬퍼 1곳:

```java
    private SubmitApplicationCommand submitCommand(Long recruitmentId, Long userId) {
        return new SubmitApplicationCommand(recruitmentId, userId, List.of());
    }
```

(헬퍼 위의 `// Task 4 에서 3-arg 로 축소된다 ...` 주석도 함께 삭제)

`ApplicationSubmitGuardsTest` — 2곳 (line 81, 190):

```java
        SubmitApplicationCommand submitCommand = new SubmitApplicationCommand(RECRUITMENT_ID, USER_ID, List.of());
```

```java
    private SubmitApplicationCommand submitCommand() {
        return new SubmitApplicationCommand(RECRUITMENT_ID, USER_ID, List.of());
    }
```

`SubmitDiscardsDraftTest` — 3곳 (line 76, 100, 112), 각각 마지막 `List.of()` 인자 하나 제거:

```java
        SubmitApplicationCommand submitCommand = new SubmitApplicationCommand(
                openRecruitment.getId(), student.getId(), List.of()
        );
```

```java
        SubmitApplicationCommand firstSubmit = new SubmitApplicationCommand(
                openRecruitment.getId(), student.getId(), List.of()
        );
```

```java
        SubmitApplicationCommand duplicateSubmit = new SubmitApplicationCommand(
                openRecruitment.getId(), student.getId(), List.of()
        );
```

- [x] **Step 8: 전체 테스트 GREEN 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend
./gradlew test
```

Expected: **BUILD SUCCESSFUL, 전체 PASS** — `interviewSlotIds`/`createAllInSubmission` 참조가 0이어야 컴파일된다. 잔여 참조 확인:

```bash
grep -rn "interviewSlotIds\|createAllInSubmission\|CreateAvailabilitiesInSubmission" backend/src --include="*.java"
```

Expected: 출력 없음

- [x] **Step 9: Commit**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add -A backend/src
git commit -m "refactor(backend): 지원 제출 DTO 와 면접 도메인의 제출 시 슬롯 등록 경로 제거"
```

---

### Task 5: 최종 검증 + PR 생성

- [x] **Step 1: PR 직전 self-check 7항목** (각 항목 실제 실행·확인 후 체크)

1. 컴파일/테스트 SUCCESS — Task 4 Step 8 의 `./gradlew test` 결과 재확인 (BUILD SUCCESSFUL)
2. 변경 범위 = 스펙 BE#0 — File Map 의 15개 파일 외 변경 0건: `git diff develop --stat` 로 대조
3. 다른 영역 영향 — FE apply 페이지가 슬롯 선택을 계속 전송하나 무시됨(역호환), FE#1 에서 제거 예정. PR 본문에 명시
4. task review 완료 — 각 Task 마다 spec + quality 리뷰 dispatch 했는지 확인 (subagent-driven 실행 시)
5. 본 계획의 체크박스 — 실행 후 재검증 마킹
6. 커밋 메시지 — Conventional Commits 형식, Co-Authored-By/🤖 Generated 라인 없음: `git log develop..HEAD --format=%B` 로 확인
7. EOF newline — 변경 파일 전부 newline 종료:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
for f in $(git diff develop --name-only --diff-filter=d); do
  [ -n "$(tail -c1 "$f")" ] && echo "EOF newline 누락: $f"
done; true
```

Expected: 출력 없음

- [x] **Step 2: push + PR 생성** (자동 머지 금지 — PR 생성까지만)

```bash
git push -u origin feat/remove-apply-slot-submission
gh pr create --base develop --title "feat(backend): 지원 시 면접 슬롯 제출 제거" --body "$(cat <<'EOF'
## 🚀 작업 내용

면접 재설계(Round 중심 · AFTER_SCREENING)의 첫 단계로, 지원서 제출에서 면접 슬롯 선택을 분리했습니다. 지금까지는 면접을 쓰는 모집에 지원하려면 반드시 가능 시간을 골라야 했고, 운영진이 슬롯을 만들어두지 않으면 지원 자체가 막혔습니다. 이제 지원은 면접 세팅과 무관하게 항상 동작하고, 가능 시간 수집은 이후 면접 대상 선정 단계(InterviewRound, BE#2~)에서 이뤄집니다.

스키마와 면접 엔티티는 건드리지 않았습니다(BE#1 에서 전환). 제출 트랜잭션 안에서 availability 를 함께 저장하던 경로와 요청 DTO 의 슬롯 필드만 걷어냈습니다.

## 🤔 고민했던 내용

- 구버전 프론트가 슬롯 필드를 계속 보내는 동안의 호환성: Spring Boot 기본 Jackson 설정이 알 수 없는 필드를 무시하므로 기존 요청도 그대로 201 입니다. 보내진 슬롯은 더 이상 저장되지 않는데, 출시 전이고 프론트 짝 PR(FE#1)이 바로 따라오므로 허용했습니다.
- 기존 제출-슬롯 통합 테스트 8건은 전부 "결합된 행동"을 검증하고 있어 수정이 아니라 삭제가 맞다고 판단했고, 대신 디커플링의 핵심(슬롯 없이 제출 성공 / 마감 이후에도 제출 성공)을 검증하는 테스트로 대체했습니다.

## 💬 리뷰 중점사항

- 제출 흐름에서 면접 관련 검증이 사라지는 것이 의도된 동작입니다 — 스펙(docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md)의 결함 3 제거에 해당합니다.
- 단위 테스트 5개 파일의 생성자 인자 축소가 기계적 변경으로만 이뤄졌는지 봐주세요.
EOF
)"
```

Expected: PR URL 출력. **머지하지 않는다** — 사용자 지시 대기.

---

## Self-Review (작성 후 점검 완료)

- **스펙 커버리지**: BE#0 범위(§12 — submit 결합 제거, 구 스키마 유지, FE#1 짝) 전부 Task 2~5 에 매핑. 구 스키마·엔티티·`replace()`/`findMyAvailabilities()` 경로는 의도적으로 미변경 (BE#1 범위).
- **플레이스홀더**: 없음 — 모든 코드 블록 완성형.
- **타입 일관성**: `SubmitApplicationCommand(Long, Long, List<String>)` 3-arg 시그니처가 Task 4 Step 1·2·7 전체에서 일치. `submitCommand()` 헬퍼명 Task 2/4 일치.
