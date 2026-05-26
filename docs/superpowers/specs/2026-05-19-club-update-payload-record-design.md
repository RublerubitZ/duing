# `Club.UpdatePayload` record 도입 — `Club.update()` 19-arg 정리

작성일: 2026-05-19

## 배경

PR3 / Plan A·B·C / 서술형 콘텐츠 PR 을 거치며 `Club.update(...)` 시그니처가 19-arg 까지 부풀었다.
호출처에서 인자 순서를 잘못 맞춰도 컴파일이 통과되고, 새 필드를 추가할 때마다 모든 호출처가 깨진다.

본 spec 은 `Club` 엔티티 안에 nested record `Club.UpdatePayload` 를 도입해 단일 인자로 정리한다.
순수 백엔드 내부 리팩토링. 외부 계약 / 동작 변화 없음.

## 설계

### 1. `Club.UpdatePayload` nested record

`Club.java` 안에 `public static record UpdatePayload(...)` 19 평탄 필드.

```java
public static record UpdatePayload(
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
) {}
```

- 필드 순서는 현재 `Club.update(...)` 의 인자 순서와 동일 (학습 비용 최소).
- 카테고리별 sub-record 분할 안 함 (도메인 경계가 더 명확해질 때 후속).

### 2. `Club.update(UpdatePayload)` 시그니처 변경

19-arg → 1-arg. body 의 null-skip 로직 19 라인은 그대로 유지하고 `payload.<accessor>()` 로 참조만 바꾼다.

```java
public void update(UpdatePayload payload) {
    if (payload.name() != null) this.name = payload.name();
    if (payload.category() != null) this.category = payload.category();
    // ... 17 more
    if (payload.highlights() != null) this.highlights = new ArrayList<>(payload.highlights());
    if (payload.majorProjects() != null) this.majorProjects = payload.majorProjects();
}
```

`highlights` 의 defensive copy (`new ArrayList<>(...)`) 와 `tags`/`snsLinks`/`faqs` 의 기존 처리는 모두 그대로 보존.

### 3. `UpdateClubCommand.toPayload()` 메서드

`UpdateClubCommand` record (21 컴포넌트 — clubId/requesterId + 19) 에 변환 메서드:

```java
public Club.UpdatePayload toPayload() {
    return new Club.UpdatePayload(
            name(),
            category(),
            division(),
            description(),
            logoUrl(),
            coverUrl(),
            tags(),
            snsLinks(),
            faqs(),
            foundedYear(),
            cohortNumber(),
            location(),
            contactEmail(),
            activityFrequency(),
            activeDays(),
            membershipFee(),
            tagline(),
            highlights(),
            majorProjects()
    );
}
```

Request → Command → Payload 3-tier 매핑 일관성. clubId/requesterId 는 service 가 별도로 사용.

### 4. `GeneralClubService.update` 호출 변경

```java
club.update(updateClubCommand.toPayload());
```

기존 19 라인의 `club.update(...)` 호출이 1 라인으로 축소.

### 5. 기존 호출처 보정

- `backend/src/test/java/com/duing/domain/club/entity/ClubUpdateTest.java` 3 곳 — `club.update(...)` 19-arg 직접 호출 → `club.update(new Club.UpdatePayload(...))`.

`new UpdateClubCommand(...)` 21-arg 호출 (ClubUpdateServiceTest, ClubMetadataUpdateTest, ClubNarrativeUpdateTest) 은 본 spec 에서 손대지 않는다 (Out of Scope).

## 검증

- `cd backend && ./gradlew compileJava compileTestJava` SUCCESS
- 기존 통합 테스트 (`ClubUpdateTest`, `ClubUpdateServiceTest`, `ClubMetadataUpdateTest`, `ClubNarrativeUpdateTest`) 동작 동일하므로 회귀 검증. Docker 가용 시 `./gradlew test --tests "com.duing.domain.club.*"`.

## 리스크

- 거의 없음. 순수 1-arg 래핑이라 동작 동일.
- nested record 라 `Club` 의 외부 import 가 늘어남 (`Club.UpdatePayload` 사용처). 다만 호출처가 service 1 + test 3 으로 적어 부담 미미.

## Out of Scope

- **`UpdateClubCommand` 자체의 21-arg 정리** — Command 도 record-payload 패턴으로 정리할 수 있으나 본 spec 은 엔티티 진입점만 다룬다. 별도 spec.
- **`ClubUpdateServiceTest`, `ClubMetadataUpdateTest`, `ClubNarrativeUpdateTest` 의 `new UpdateClubCommand(...)` 21-arg 호출 builder/factory 화** — 별도 cleanup PR. 본 spec 의 변경 범위에서 명시적으로 제외.
- **다른 도메인의 비슷한 메서드** (`Recruitment.update`, `Application.update` 등) 동일 패턴 적용 — 필요해질 때 별도 spec.
- **API 응답 / HTTP 계약 변경** — 외부 클라이언트 영향 0. `UpdateClubRequest`, `ClubDetailResponse` 모양 무변경.
- **카테고리별 sub-record 분할** (BasicInfo / MetaInfo / Narrative) — 본 spec 은 평탄 19 필드. 도메인 경계가 더 명확해질 때 후속.
- **신규 단위/통합 테스트 추가** — 순수 1-arg 래핑이라 동작 동일. 기존 통합 테스트가 회귀 검증.
