# PR-1: 지원 가능 여부 사전 확인 API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /api/v1/recruitments/{recruitmentId}/applications/eligibility` 를 추가하고, submit 의 사전 가드 7단계를 단일 공용 메서드로 추출해 두 진입점이 완전히 같은 검증을 쓰게 한다.

**Architecture:** 스펙 `docs/superpowers/specs/2026-07-08-apply-eligibility-and-question-types-design.md` §1. `GeneralApplicationService.submit()` 안의 순차 가드(모집 존재 → 동아리 ACTIVE → 마감 → 외부폼 → 사용자 존재 → 중복 지원 → 회원 자격)를 `private EligibilityTarget validateEligibility(recruitmentId, userId)` 로 추출. `checkEligibility()` 는 이 메서드만 호출(부적격 시 기존 예외가 그대로 4xx 전파), `submit()` 은 이 메서드 통과 후 답변 검증·저장을 이어간다. 검증 로직의 소스는 이 한 곳뿐이어야 한다(스펙 요구).

**Tech Stack:** Spring Boot 3.4 / Java 21 / RestAssured + Testcontainers / Mockito

**사전 확인된 사실 (정찰):**
- submit 가드 순서·예외는 `GeneralApplicationService.java:115-148` 에 있음. 예외: `RecruitmentNotFoundException`(404·존재 은닉 겸용), `RecruitmentClosedException`(400), `ExternalFormSubmitException`(400), `UserNotFoundException`(404), `DuplicateApplicationException`(409), `AlreadyClubMemberException`(409), `OfficerMembershipRequiredException`(403), `IneligibleOfficerApplicantException`(403)
- `ApplicationController` 는 클래스 레벨 `@PreAuthorize("isAuthenticated()")` + `/api/v1` base — 새 GET 은 자동으로 인증 필수
- 클래스 레벨 `@Transactional(readOnly = true)` 라 `checkEligibility` 는 어노테이션 추가 불필요(읽기 전용)
- `GeneralApplicationService` 는 `@RequiredArgsConstructor`(final 필드 13개) + `ObjectProvider<ApplicationService> selfProvider` 는 `@Autowired` setter-field 주입 — 단위 테스트는 13-arg 생성자로 조립하므로 **생성자 시그니처 변경 없음**
- 서비스 단위 테스트 전례: `backend/src/test/java/com/duing/domain/application/service/ApplicationSubmitGuardsTest.java` (Mockito mock 조립) — 반드시 Read 후 같은 조립 패턴 사용
- 통합 테스트 전례: `MyApplicationControllerStepperTest`, `LeaderApplicationControllerTest` — `IntegrationTestBase` + `TestcontainersConfiguration` + RestAssured + `JwtTokenProvider`
- 스펙 문서 2건(spec + plans 4건)은 아직 미커밋 상태 — Task 0 에서 이 브랜치에 함께 커밋한다

**리뷰 파이프라인 (task 마다):** implementer → spec reviewer → duing-code-reviewer → codex:review. 권한(인증 필수 GET)·검증 단일화 리팩토링이므로 마지막에 브랜치 adversarial 리뷰 1회.

**Out of Scope:** FE 변경(PR-2), 질문 유형(PR-3/4), 응답에 부적격 사유 코드 필드 추가(기존 message 기반 유지).

---

## Task 0: 브랜치 생성 + 스펙 커밋

- [ ] `git checkout develop && git pull && git checkout -b feat/application-eligibility-api`
- [ ] 스펙·플랜 문서 커밋:

```bash
git add docs/superpowers/specs/2026-07-08-apply-eligibility-and-question-types-design.md docs/superpowers/plans/2026-07-08-pr*.md
git commit -m "docs: 지원 사전 검증·지원서 질문 유형 확장 스펙 및 구현 계획"
```

---

## Task 1: 공용 검증 메서드 추출 + checkEligibility 서비스

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/application/service/ApplicationService.java`
- Modify: `backend/src/main/java/com/duing/domain/application/service/GeneralApplicationService.java`
- Create(Test): `backend/src/test/java/com/duing/domain/application/service/ApplicationEligibilityCheckTest.java`

- [ ] **Step 1: 실패하는 서비스 단위 테스트 작성** — 먼저 `ApplicationSubmitGuardsTest.java` 를 Read 해 mock 조립·픽스처 생성 패턴(Recruitment/User/Club 만들기, 13-arg 생성자)을 그대로 가져온다. 새 파일 케이스(각각 `@DisplayName` 은 요구사항 문장):

```java
// 조립·픽스처 헬퍼는 ApplicationSubmitGuardsTest 와 동일 패턴으로 구성한다.
// 케이스 목록 (모두 checkEligibility(userId, recruitmentId) 호출):
// 1. "존재하지 않는 모집의 지원 가능 여부 확인은 404 로 실패한다"
//    → recruitmentRepository.findById → empty, assertThrows(RecruitmentException.RecruitmentNotFoundException.class)
// 2. "비공개 상태 동아리의 모집은 지원 가능 여부 확인에서 존재를 숨긴다(404)"
//    → club.status = INACTIVE (리플렉션 또는 기존 테스트의 상태 세팅 헬퍼 재사용)
// 3. "마감된 모집은 지원 가능 여부 확인에서 차단된다"
//    → endDate 가 어제인 OPEN 모집 → ApplicationDomainException.RecruitmentClosedException
// 4. "외부 폼 모집은 지원 가능 여부 확인에서 차단된다" → ExternalFormSubmitException
// 5. "이미 지원한 모집은 지원 가능 여부 확인에서 409 로 차단된다"
//    → applicationRepository.existsByRecruitmentIdAndUserId → true → DuplicateApplicationException
// 6. "이미 동아리 소속이면 일반 모집 지원 가능 여부 확인에서 409 로 차단된다"
//    → clubMemberRepository.findByClubIdAndUserId → MEMBER 멤버십 → AlreadyClubMemberException
// 7. "운영진 모집은 비부원의 지원 가능 여부 확인을 403 으로 차단한다"
//    → targetRole=OFFICER + 멤버십 없음 → OfficerMembershipRequiredException
// 8. "모든 조건을 통과하면 지원 가능 여부 확인은 예외 없이 끝난다"
//    → assertDoesNotThrow, 그리고 applicationRepository.save 가 호출되지 않음을 verify (조회 전용 보장)
```

테스트 본문은 위 케이스를 실제 코드로 전부 작성한다(주석 아님). 날짜는 반드시 `LocalDate.now()` 상대값.

- [ ] **Step 2: 실패 확인** — `cd backend && ./gradlew test --tests 'com.duing.domain.application.service.ApplicationEligibilityCheckTest'` → `checkEligibility` 메서드가 없어 컴파일 실패 (이것이 이 단계의 기대 실패).

- [ ] **Step 3: 구현**

`ApplicationService.java` — `submit` 선언 아래에 추가:

```java
    /**
     * 제출 없이 지원 가능 여부만 사전 확인한다. submit 과 동일한 가드 체인
     * (모집 존재 → 동아리 ACTIVE → 마감 → 외부폼 → 사용자 존재 → 중복 지원 → 회원 자격)을
     * 단일 공용 메서드로 공유하므로, 부적격 시 submit 과 동일한 예외·상태코드·메시지가 발생한다.
     */
    void checkEligibility(Long userId, Long recruitmentId);
```

`GeneralApplicationService.java` — submit 의 가드 블록(L116-139)을 추출하고 submit 을 재작성:

```java
    @Override
    @Transactional
    public Long submit(SubmitApplicationCommand submitApplicationCommand) {
        EligibilityTarget eligibilityTarget = validateEligibility(
                submitApplicationCommand.recruitmentId(), submitApplicationCommand.userId());
        Recruitment recruitment = eligibilityTarget.recruitment();

        validateAnswersAgainstForm(recruitment, submitApplicationCommand.answers());

        Application application =
                Application.submit(recruitment, eligibilityTarget.user(), submitApplicationCommand.answers());
        Long savedApplicationId = applicationRepository.save(application).getId();

        applicationDraftService.discard(submitApplicationCommand.userId(), submitApplicationCommand.recruitmentId());
        return savedApplicationId;
    }

    @Override
    public void checkEligibility(Long userId, Long recruitmentId) {
        validateEligibility(recruitmentId, userId);
    }

    /**
     * 지원 사전 가드의 단일 소스. checkEligibility(사전 확인)와 submit(최종 검증)이
     * 이 메서드만 호출한다 — 검증 로직을 두 곳에 두는 것을 금지한다 (스펙 §1.2).
     * 사전 확인 통과 후 제출 사이에 상태가 변해도(TOCTOU) submit 이 같은 메서드를
     * 다시 통과하므로 최종 일관성이 보장된다.
     */
    private EligibilityTarget validateEligibility(Long recruitmentId, Long userId) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);

        // 비공개 상태 동아리의 모집에는 지원할 수 없다 — 존재 은닉을 위해 404 (공개 상세와 동일 의미론).
        if (recruitment.getClub().getStatus() != ClubStatus.ACTIVE) {
            throw new RecruitmentException.RecruitmentNotFoundException();
        }

        if (!recruitment.isEffectivelyOpen(LocalDate.now())) {
            throw new ApplicationDomainException.RecruitmentClosedException();
        }

        if (recruitment.getApplicationMode() == ApplicationMode.EXTERNAL) {
            throw new ApplicationDomainException.ExternalFormSubmitException();
        }

        User user = userRepository.findById(userId)
                .orElseThrow(UserException.UserNotFoundException::new);

        if (applicationRepository.existsByRecruitmentIdAndUserId(recruitment.getId(), user.getId())) {
            throw new ApplicationDomainException.DuplicateApplicationException();
        }

        validateClubMembershipPolicy(recruitment, user);

        return new EligibilityTarget(recruitment, user);
    }

    /** validateEligibility 통과 결과 — submit 이 후속 저장에 재사용한다. */
    private record EligibilityTarget(Recruitment recruitment, User user) {}
```

기존 submit 본문의 주석("비공개 상태 동아리의…")은 추출된 메서드로 함께 이동한다. import 변화 없음(모두 기존 사용 중).

- [ ] **Step 4: 통과 확인** — `./gradlew test --tests 'com.duing.domain.application.service.*'` → PASS (신규 + `ApplicationSubmitGuardsTest` 등 기존 가드 테스트 회귀 포함), BUILD SUCCESSFUL 출력 직접 확인.

- [ ] **Step 5: 커밋** — `feat(backend): 지원 사전 가드를 공용 메서드로 추출하고 checkEligibility 추가`

---

## Task 2: API 인터페이스 + 컨트롤러 + 통합 테스트

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/application/api/ApplicationApi.java`
- Modify: `backend/src/main/java/com/duing/domain/application/controller/ApplicationController.java`
- Create(Test): `backend/src/test/java/com/duing/domain/application/controller/ApplicationEligibilityControllerTest.java`

- [ ] **Step 1: 실패하는 통합 테스트 작성** — 픽스처는 기존 `application/controller/*Test` 의 saveUser/saveClub/saveRecruitment 패턴을 Read 해 재사용(없으면 `common/fixture/` 확인). 케이스:

```java
// 모두 GET /api/v1/recruitments/{recruitmentId}/applications/eligibility, Authorization: Bearer <학생 토큰>
// 1. "지원 가능한 모집이면 200 을 반환한다" → OPEN·SELF 모집 + 무관 학생 → 200, body("ok", equalTo(true))
// 2. "이미 지원한 모집의 사전 확인은 409 와 기존 중복 지원 메시지를 반환한다"
//    → Application.submit(...) 저장 후 호출 → 409, body("message", equalTo("이미 지원한 모집 공고입니다."))
// 3. "마감된 모집의 사전 확인은 400 을 반환한다" → close() 된 모집 → 400
// 4. "이미 동아리 소속이면 사전 확인이 409 를 반환한다" → ClubMember 로 등록된 학생 → 409
// 5. "존재하지 않는 모집의 사전 확인은 404 를 반환한다"
// 6. "외부 폼 모집의 사전 확인은 400 을 반환한다" → EXTERNAL 모집(createWithOptions)
// 7. "미인증 요청은 401 을 반환한다" → Authorization 헤더 없이 → 401
//    (기존 통합 테스트에서 미인증 기대 코드가 401 인지 403 인지 확인해 실제 보안 설정과 일치시킬 것 — 다르면 보고에 명시)
```

전부 실제 RestAssured 코드로 작성. `Recruitment.create(...)`/`createWithOptions(...)` 시그니처는 기존 테스트에서 확인해 맞춘다. 날짜는 상대값.

- [ ] **Step 2: 실패 확인** — `./gradlew test --tests 'com.duing.domain.application.controller.ApplicationEligibilityControllerTest'` → 엔드포인트 부재로 404 FAIL.

- [ ] **Step 3: 구현**

`ApplicationApi.java` — `submit` 선언 아래에 추가:

```java
    @Operation(summary = "지원 가능 여부 사전 확인",
            description = "지원서 작성 화면 진입 전에 제출과 동일한 정책(마감·중복 지원·회원 자격 등)으로 "
                    + "지원 가능 여부를 확인한다. 가능하면 200, 불가하면 제출 시와 동일한 상태코드·메시지로 실패한다.")
    @GetMapping("/recruitments/{recruitmentId}/applications/eligibility")
    ResponseEntity<ApiResponse<Void>> checkEligibility(
            @PathVariable Long recruitmentId,
            @AuthenticationPrincipal UserPrincipal currentUser
    );
```

`ApplicationController.java` — `submit` 아래에 추가:

```java
    @Override
    public ResponseEntity<ApiResponse<Void>> checkEligibility(
            @PathVariable Long recruitmentId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        applicationService.checkEligibility(currentUser.id(), recruitmentId);
        return ResponseEntity.ok(ApiResponse.success(null));
    }
```

`ApiResponse.success(null)` 이 컴파일되는지 확인하고, 시그니처가 다르면(`success()` 무인자 팩토리 존재 등) 실제 팩토리에 맞춘다 — 다르게 맞췄으면 보고에 명시.

- [ ] **Step 4: 통과 확인** — `./gradlew test --tests 'com.duing.domain.application.controller.*'` → PASS, BUILD SUCCESSFUL 직접 확인.

- [ ] **Step 5: 커밋** — `feat(backend): 지원 가능 여부 사전 확인 API 추가`

---

## Task 3: 전체 테스트 + PR

- [ ] `cd backend && ./gradlew test` → BUILD SUCCESSFUL (출력 직접 확인 — `| tail` 금지, 전체 출력에서 확인)
- [ ] 브랜치 adversarial 리뷰 1회 (codex:adversarial-review — 권한·검증 단일화 대상)
- [ ] self-check 7항목 (빌드·범위·타측면 영향·리뷰 완료·plan 재검증·커밋 규칙·EOF newline)
- [ ] push + PR 생성 (제목: `feat(backend): 지원 가능 여부 사전 확인 API 추가`, 본문 🚀/🤔/💬, **머지 금지 — 사용자 지시 대기**)
