# `buildAndPersist` 헬퍼 추출 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GeneralRecruitmentService.create` 와 `replaceActive` 의 30 라인 중복을 `private Long buildAndPersist(Club, CreateRecruitmentCommand)` 한 곳으로 묶는다.

**Architecture:** 순수 추출. 사용자 가시 동작 변화 없음. 호출자는 pre-step (`existsActiveByClubId` 가드 vs `findActiveByClubId().ifPresent(close)`) 만 본인이 결정한 뒤 헬퍼 한 줄을 호출.

**Tech Stack:** Spring Boot 3.4, Java 21.

**Spec:** `docs/superpowers/specs/2026-05-19-recruitment-build-and-persist-extract-design.md`

**Branch:** `refactor/recruitment-build-and-persist-extract`

---

## Task 1: 헬퍼 추출 + 두 메서드 본문 단축

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/recruitment/service/GeneralRecruitmentService.java`

### Step 1 — `buildAndPersist` 추가

`close(Long, Long)` 메서드 다음, 그리고 `replaceActive(...)` **앞** 에 다음 private 메서드 추가:

```java
private Long buildAndPersist(Club club, CreateRecruitmentCommand command) {
    Recruitment recruitment;
    try {
        recruitment = Recruitment.createWithOptions(
                club,
                command.title(),
                command.content(),
                command.startDate(),
                command.endDate(),
                command.capacity(),
                command.applicationMode(),
                command.externalFormUrl(),
                command.useInterview(),
                command.targetRole(),
                command.interviewStartDate(),
                command.interviewEndDate(),
                command.showApplicantCount()
        );
    } catch (IllegalArgumentException exception) {
        throw new RecruitmentException.InvalidRecruitmentPeriodException();
    }

    if (command.applicationMode() == ApplicationMode.SELF) {
        RecruitmentForm form = RecruitmentForm.create(recruitment, command.questions());
        recruitment.attachForm(form);
    }

    Recruitment saved = recruitmentRepository.save(recruitment);

    if (saved.getStatus() == RecruitmentStatus.OPEN
            && !saved.getStartDate().isAfter(LocalDate.now())) {
        eventPublisher.publishEvent(new RecruitmentOpenedEvent(
                saved.getId(),
                club.getId(),
                club.getName(),
                saved.getTitle(),
                saved.getEndDate()));
    }

    return saved.getId();
}
```

### Step 2 — `create` 본문 단축

기존 `create` 메서드에서 `existsActiveByClubId` 가드 **다음** 의 모든 본문 (recruitment 생성 / form attach / save / event publish) 을 다음 한 줄로 교체:

```java
return buildAndPersist(club, createRecruitmentCommand);
```

최종 모양:

```java
@Override
@Transactional
public Long create(CreateRecruitmentCommand createRecruitmentCommand) {
    Club club = clubRepository.findById(createRecruitmentCommand.clubId())
            .orElseThrow(ClubException.ClubNotFoundException::new);

    clubAuthService.requireManager(createRecruitmentCommand.currentUserId(), club.getId());

    if (recruitmentRepository.existsActiveByClubId(club.getId())) {
        throw new RecruitmentException.DuplicateActiveRecruitmentException();
    }

    return buildAndPersist(club, createRecruitmentCommand);
}
```

### Step 3 — `replaceActive` 본문 단축

기존 `replaceActive` 의 `findActiveByClubId(...).ifPresent(Recruitment::close)` **다음** 의 모든 본문을 다음 한 줄로 교체:

```java
return buildAndPersist(club, command);
```

최종 모양:

```java
@Override
@Transactional
public Long replaceActive(CreateRecruitmentCommand command) {
    Club club = clubRepository.findById(command.clubId())
            .orElseThrow(ClubException.ClubNotFoundException::new);

    clubAuthService.requireManager(command.currentUserId(), club.getId());

    recruitmentRepository.findActiveByClubId(club.getId())
            .ifPresent(Recruitment::close);

    return buildAndPersist(club, command);
}
```

### Step 4 — 컴파일 + 회귀 테스트

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew compileJava compileTestJava 2>&1 | tail -5
```
Expected: BUILD SUCCESSFUL.

Docker 가용 시:
```bash
./gradlew test --tests "com.duing.domain.recruitment.*" 2>&1 | tail -10
```
Expected: 기존 테스트 모두 PASS (동작 변화 없음).

### Step 5 — Commit

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/recruitment/service/GeneralRecruitmentService.java
git commit -m "refactor(backend): RecruitmentService에 buildAndPersist 헬퍼 추출"
```

## Task 2: PR

### Step 1 — Push

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git push -u origin refactor/recruitment-build-and-persist-extract
```

### Step 2 — PR 생성

```bash
gh pr create --base develop --title "refactor(backend): RecruitmentService.create/replaceActive 중복 본문 추출" --body "$(cat <<'EOF'
## 🚀 작업 내용
- `GeneralRecruitmentService.create` 와 `replaceActive` 사이의 30 라인 중복(`createWithOptions` 호출 / form attach / save / event publish) 을 `private Long buildAndPersist(Club, CreateRecruitmentCommand)` 한 곳으로 추출했습니다.
- pre-step (active 단일 가드 vs 기존 active close) 은 호출자 측에 유지해 두 진입점의 정책 차이는 그대로 노출됩니다.

## 🤔 고민했던 내용
- `club` lookup + `requireManager` 까지 공유 헬퍼에 넣는 안과 비교했는데, club 인스턴스를 헬퍼 안에서 한 번 더 변환할 일이 사라져 호출자가 직접 다루는 게 명확하다고 봤습니다.
- 사용자 가시 동작 변화 없는 순수 리팩토링이라 새 테스트를 추가하지 않았고, 기존 통합 테스트들이 회귀 검증을 담당합니다.

## 💬 리뷰 중점사항
- 두 메서드의 pre-step 차이가 호출자 측에 그대로 남아있는지 확인 부탁드립니다.
- `buildAndPersist` 가 `private` 라 외부 noise 없이 단일 호출처에서만 쓰입니다.
EOF
)"
```

---

## Self-Review
- [x] **스펙 커버리지** — 헬퍼 추출 (Task 1), PR 생성 (Task 2). 신규 테스트 불필요 명시. ✓
- [x] **플레이스홀더 검사** — 모든 코드 블록 완성. ✓
- [x] **타입 일관성** — `buildAndPersist` 시그니처 (`Club`, `CreateRecruitmentCommand`) 가 두 호출처에서 동일. ✓
