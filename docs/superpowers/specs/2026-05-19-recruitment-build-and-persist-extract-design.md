# `GeneralRecruitmentService` 중복 본문 헬퍼 추출

작성일: 2026-05-19

## 배경

`GeneralRecruitmentService.create` 와 `replaceActive` 가 약 30 라인 중복.
- 공통: `createWithOptions` → form attach (SELF) → `save` → 조건부 `RecruitmentOpenedEvent` 발행
- 차이: pre-step (가드 vs 기존 active close) + club 조회 + requireManager

본 spec 은 공통 부분만 `private buildAndPersist(Club, CreateRecruitmentCommand)` 로 추출한다. 사용자 가시 변화 없는 순수 리팩토링.

## 설계

### 새 private 메서드

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

### `create` 변경

`existsActiveByClubId` 가드 다음의 본문을 `return buildAndPersist(club, createRecruitmentCommand);` 한 줄로 교체.

### `replaceActive` 변경

`findActiveByClubId(...).ifPresent(Recruitment::close)` 다음의 본문을 `return buildAndPersist(club, command);` 한 줄로 교체.

## 변경 범위

- 단일 파일 `backend/src/main/java/com/duing/domain/recruitment/service/GeneralRecruitmentService.java`
- 기존 통합 테스트 (`RecruitmentCreateExtensionTest`, `RecruitmentReplaceActiveTest`, `RecruitmentAlwaysOpenTest`, `RecruitmentInterviewMetadataTest` 등) 가 동일 동작을 그대로 검증. 신규 테스트 추가 불필요.

## 검증

- `cd backend && ./gradlew compileJava compileTestJava` SUCCESS
- 가능한 한 (Docker 가용 시) `./gradlew test --tests "com.duing.domain.recruitment.*"` 회귀 검증

## 리스크

- 거의 없음. 순수 추출이라 동작 동일.
- `buildAndPersist` 가 `private` 라 외부 noise 없음.
- 의도된 차이점 (가드 vs close) 가 호출자 측에 그대로 남아 명확함.

## Out of Scope

- **`RecruitmentService` 인터페이스 시그니처 변경 없음** — 외부 계약 무변경. 프론트엔드 / 다른 클라이언트 영향 0.
- **HTTP API 응답 모양 변경 없음** — `/api/v1/leader/clubs/{clubId}/recruitments` 와 `/replace-active` 둘 다 응답 동일.
- **`create` / `replaceActive` 의 pre-step 통합 시도 안 함** — 가드 vs close 는 두 진입점의 정책 차이라 호출자 측에 그대로 남긴다.
- **추가 추출 (예: `RecruitmentForm.create + attach` 헬퍼, `event publish` 헬퍼) 안 함** — 단일 호출처라 YAGNI. 본 spec 은 두 호출처에서 중복되는 30 라인 한 묶음만 추출.
- **새 단위 테스트 추가 안 함** — 동작 변화 없는 순수 추출. 기존 통합 테스트 (`RecruitmentCreateExtensionTest`, `RecruitmentReplaceActiveTest`, `RecruitmentAlwaysOpenTest`, `RecruitmentInterviewMetadataTest`) 가 회귀 검증.
- **`UpdateClubPayload` 같은 record-payload 패턴 도입 안 함** — 별도 후속 spec.
