# Two-stage loading 제거 + active 모집 단일 제약

작성일: 2026-05-19

## 1. 배경 / 목표

Plan C(PR #97) 결과 학생측 동아리 상세 페이지가 **세 번의 직렬 fetch** 로 동작한다.

1. `useClubDetailQuery(clubId)` → `ClubDetail`
2. `useClubRecruitmentsQuery(clubId)` → `RecruitmentSummary[]` (활성 모집 찾기 위해서만 사용)
3. 위 결과의 활성 모집 id 로 `useRecruitmentDetailQuery(activeId)` → `RecruitmentDetail`

세 번째 호출이 두 번째 응답을 기다려야 시작되므로 모집 카드 표시까지 두 번의 왕복이 발생한다. 본 spec 은 이 직렬 의존성을 제거하고, 학생측 데이터를 **`ClubDetail` 한 번의 응답**으로 제공한다.

이를 위해 다음을 도입한다.

1. **도메인 제약**: 한 동아리에 동시 active(`status=OPEN` 이고 `endDate` 가 미경과/null) 모집은 1개만 허용한다.
2. **교체 endpoint**: 기존 active 를 마감하면서 새 active 를 만드는 전용 API.
3. **`StudentRecruitmentProjection`**: 학생 공개 화면 전용 읽기 모델. `ClubDetail` 응답에 임베드.
4. **방어적 노출 정책**: 만약 어떤 비정상 경로로 active 가 여러 개 존재하더라도 startDate ASC 의 첫 번째 1개만 학생에게 노출한다.

## 2. 도메인 제약 — active 모집 단일

### 검증 위치

엔티티 정적 메서드(`Recruitment.createWithOptions`) 가 아니라 **서비스 레이어**에서 검증한다. Repository 접근이 필요하기 때문이다.

```java
// GeneralRecruitmentService.create 가드 추가 (clubAuthService.requireManager 다음)
if (recruitmentRepository.existsActiveByClubId(clubId)) {
    throw new RecruitmentException.DuplicateActiveRecruitmentException();
}
```

### 신규 예외

`RecruitmentException` 내부 클래스:

```java
public static class DuplicateActiveRecruitmentException extends RecruitmentException {
    private static final String MESSAGE = "이미 진행 중인 모집이 있습니다. 기존 모집을 마감하거나 교체 endpoint 를 사용하세요.";

    public DuplicateActiveRecruitmentException() {
        super(MESSAGE, HttpStatus.CONFLICT);
    }
}
```

### 신규 Repository 메서드

`RecruitmentRepositoryCustom` 에 두 메서드 추가.

| 메서드 | 시그니처 | 동작 |
|---|---|---|
| `existsActiveByClubId` | `boolean existsActiveByClubId(Long clubId)` | `status=OPEN && deleted_at IS NULL && (end_date IS NULL OR end_date >= today)` 인 행 존재 여부 |
| `findActiveByClubId` | `Optional<Recruitment> findActiveByClubId(Long clubId)` | 같은 조건. 여러 개 잡히면 startDate ASC, id ASC tie-break |

### 교체 endpoint

#### `POST /api/v1/leader/clubs/{clubId}/recruitments/replace-active`

- Body: 기존 `CreateRecruitmentRequest` 그대로 재사용.
- 응답: HTTP 201, body 에 새 recruitment id.
- 인증: `clubAuthService.requireManager(currentUserId, clubId)` (기존 create 와 동일).

#### `GeneralRecruitmentService.replaceActive`

```java
@Transactional
public Long replaceActive(CreateRecruitmentCommand command) {
    Club club = clubRepository.findById(command.clubId())
            .orElseThrow(ClubException.ClubNotFoundException::new);
    clubAuthService.requireManager(command.currentUserId(), club.getId());

    recruitmentRepository.findActiveByClubId(club.getId())
            .ifPresent(Recruitment::close);

    // 이후 흐름은 기존 create 와 동일 (Recruitment.createWithOptions + Form attach + save + event publish)
}
```

> create 의 본문을 헬퍼 메서드로 추출해 replaceActive 에서 재사용하면 중복이 줄어든다.

### 도메인 제약 미적용 결정

DB unique partial index (`UNIQUE (club_id) WHERE status='OPEN' AND deleted_at IS NULL`) 는 본 spec 에서 도입하지 않는다(YAGNI). 운영자 한 명 시나리오에서 동시 INSERT race 가 사실상 발생 안 한다. 강한 보장 필요 시 후속 spec.

## 3. 학생 화면 전용 Projection

### `StudentRecruitmentProjection`

위치: `backend/src/main/java/com/duing/domain/recruitment/service/dto/query/StudentRecruitmentProjection.java`

```java
public record StudentRecruitmentProjection(
        Long id,
        String title,
        LocalDate startDate,
        LocalDate endDate,
        RecruitmentDisplayStatus displayStatus,
        int capacity,
        boolean useInterview,
        TargetRole targetRole,
        ApplicationMode applicationMode,
        String externalFormUrl,
        LocalDate interviewStartDate,
        LocalDate interviewEndDate,
        Integer applicantCount
) {
    /**
     * applicantCount 는 showApplicantCount=true 일 때만 호출자가 count 결과를 넘겨준다.
     * false 면 null 을 넘겨 학생 응답에 비공개로 정규화한다.
     */
    public static StudentRecruitmentProjection from(
            Recruitment recruitment,
            LocalDate today,
            Integer applicantCount
    ) {
        return new StudentRecruitmentProjection(
                recruitment.getId(),
                recruitment.getTitle(),
                recruitment.getStartDate(),
                recruitment.getEndDate(),
                RecruitmentDisplayStatus.resolve(
                        recruitment.getStatus(),
                        recruitment.getStartDate(),
                        recruitment.getEndDate(),
                        today),
                recruitment.getCapacity(),
                recruitment.isUseInterview(),
                recruitment.getTargetRole(),
                recruitment.getApplicationMode(),
                recruitment.getExternalFormUrl(),
                recruitment.getInterviewStartDate(),
                recruitment.getInterviewEndDate(),
                applicantCount
        );
    }
}
```

### 제외된 필드

- `content` — 학생 카드/탭에서 본문은 ClubDetail.description 으로 대체. 모집 본문은 노출 안 함 (디자인 원본도 모집 카드에 본문 없음).
- `questions` — 지원 폼 진입 시점에 별도로 로드해야 함. 카드에는 노출 X.
- `showApplicantCount` — 클라이언트가 알 필요 없음. 비공개면 `applicantCount=null` 로 정규화돼 내려간다.
- `status` (`RecruitmentStatus`) — `displayStatus` 가 그 의미를 포함.
- `clubId` / `clubName` — ClubDetail 안에 임베드되므로 컨텍스트에서 알 수 있음.
- `effectivelyOpen` — `displayStatus in (OPEN, ALWAYS_OPEN)` 로 클라이언트가 도출.

## 4. ClubDetail 응답 임베드

### Query DTO

`ClubDetailQuery` 끝에 `activeRecruitment` 추가:

```java
public record ClubDetailQuery(
        // ... 기존 필드 21개 ...
        StudentRecruitmentProjection activeRecruitment   // nullable, 활성 모집 없으면 null
) {
    public static ClubDetailQuery of(
            Club club,
            Long leaderId,
            String leaderName,
            List<ClubPhotoQuery> photos,
            StudentRecruitmentProjection activeRecruitment
    ) { /* ... */ }
}
```

### Response DTO

`ClubDetailResponse` 도 동일하게 `activeRecruitment` 필드 추가하고 `from(query)` 매핑 보강.

### 서비스 흐름

`GeneralClubService.getClubDetail(Long clubId)` 변경:

```java
public ClubDetailQuery getClubDetail(Long clubId) {
    Club club = clubRepository.findById(clubId)
            .orElseThrow(ClubException.ClubNotFoundException::new);
    // 기존 leader / photos 조회 그대로

    LocalDate today = LocalDate.now();
    Optional<Recruitment> activeOpt = recruitmentRepository.findActiveByClubId(clubId);
    StudentRecruitmentProjection activeProjection = activeOpt
            .map(active -> {
                Integer applicantCount = active.isShowApplicantCount()
                        ? (int) applicationRepository.countByRecruitmentId(active.getId())
                        : null;
                return StudentRecruitmentProjection.from(active, today, applicantCount);
            })
            .orElse(null);

    return ClubDetailQuery.of(club, leaderId, leaderName, photoQueries, activeProjection);
}
```

`GeneralClubService` 에 `ApplicationRepository` 의존성 추가.

## 5. 프론트엔드 변경

### 타입 (`packages/types/src/club.ts`)

`StudentRecruitmentProjection` 신규 + `ClubDetail.activeRecruitment` 추가:

```ts
export type StudentRecruitmentProjection = {
  id: number;
  title: string;
  startDate: string;
  endDate: string | null;
  displayStatus: RecruitmentDisplayStatus;
  capacity: number;
  useInterview: boolean;
  targetRole: TargetRole;
  applicationMode: ApplicationMode;
  externalFormUrl: string | null;
  interviewStartDate: string | null;
  interviewEndDate: string | null;
  applicantCount: number | null;
};

export type ClubDetail = ClubSummary & {
  // ... 기존 필드 ...
  activeRecruitment: StudentRecruitmentProjection | null;
};
```

### 학생측 `app/clubs/[clubId]/page.tsx`

- `useClubRecruitmentsQuery` import 제거 + 사용 제거
- `useRecruitmentDetailQuery` import 제거 + 사용 제거
- `<ClubRecruitmentCard recruitment={club.activeRecruitment ?? undefined} clubId={clubId} />`
- `<ClubDetailHero recruitmentDisplayStatus={club.activeRecruitment?.displayStatus} />`

### `ClubRecruitmentCard` prop 타입 변경

기존: `recruitment: RecruitmentDetail | undefined`
변경: `recruitment: StudentRecruitmentProjection | undefined`

기존 카드 로직(`displayStatus` 분기, 면접 일정 행, 지원자 행) 은 필드 부분집합이라 그대로 동작.

### `useRecruitmentDetailQuery` 잔존 사용처

학생측 외에 잔존 사용처를 grep 한다. 본 spec 의 변경은 학생측 동아리 상세 페이지에 한정.

### 잔존 grep 대상

`useClubRecruitmentsQuery` 사용처도 grep. 본 spec 머지 후 학생측 page.tsx 에서는 사라지지만 다른 곳(예: 캘린더, 관리자 페이지) 에서는 그대로 유지.

## 6. 테스트

### 백엔드

- `RecruitmentRepositoryImpl` 의 `existsActiveByClubId` / `findActiveByClubId`
  - active 1건만 존재 → true / 그 1건 반환
  - active 0건 → false / empty
  - active 2건(비정상) → true / startDate ASC 첫 번째 반환
  - 종료일 지난 OPEN, CLOSED, 상시(endDate=null) 케이스
- `RecruitmentService.create` 가 active 충돌 시 `DuplicateActiveRecruitmentException` (HTTP 409)
- `RecruitmentService.replaceActive` 가
  - 기존 active 를 CLOSED 로 바꾸고
  - 새 active 생성하고
  - 트랜잭션 안에서 두 동작이 모두 commit / 예외 시 모두 rollback
- `ClubService.getClubDetail` 가
  - active 없으면 `activeRecruitment=null`
  - showApplicantCount=true 일 때 `applicantCount` 가 실제 지원자 수
  - showApplicantCount=false 일 때 `applicantCount=null`

### 프론트엔드

- `ClubRecruitmentCard` 의 mock 을 `StudentRecruitmentProjection` 형태로 업데이트(필드 부분집합이라 기존 mock 의 superset 제거만 필요)
- 학생측 page.tsx 의 `useClubRecruitmentsQuery`, `useRecruitmentDetailQuery` import 제거 후 typecheck/build/test 통과 확인

## 7. 구현 순서

단일 PR 로 진행. 내부 commit 단위:

1. **`RecruitmentRepositoryCustom`** 메서드 2개 + 구현체 + 단위 회귀 테스트
2. **`DuplicateActiveRecruitmentException`** + `GeneralRecruitmentService.create` 가드
3. **replace-active endpoint** (`ClubRecruitmentApi` 시그니처 + `ClubRecruitmentController` 구현 + `GeneralRecruitmentService.replaceActive`)
4. **`StudentRecruitmentProjection`** record 신규
5. **`ClubDetailQuery` / `ClubDetailResponse`** 에 `activeRecruitment` 임베드 + `GeneralClubService.getClubDetail` 흐름 + `ApplicationRepository` 의존성 주입
6. **백엔드 통합 테스트** (`RecruitmentReplaceActiveTest`, `ClubDetailActiveRecruitmentTest`)
7. **프론트 타입 확장** (`StudentRecruitmentProjection` + `ClubDetail.activeRecruitment`)
8. **학생측 `page.tsx` 정리** + `ClubRecruitmentCard` prop 타입 교체 + 테스트 mock 업데이트

각 commit 은 자체 컴파일/테스트 클린 유지.

## 8. 리스크 / 체크 포인트

- **endDate 변경 후 active 사라짐**: 운영자가 active 모집의 종료일을 줄여 즉시 만료시키면 active 상태가 사라진다. 정상 close 와 동일 효과라 도메인상 OK.
- **replace-active 권한**: 기존 `clubAuthService.requireManager` 로 보호 (LEADER/OFFICER).
- **race 가능성**: 동시 INSERT 로 active 2건 만들 가능. 운영자 1명 시나리오에서 거의 없음. 강한 보장 필요해지면 DB partial unique index 후속 spec.
- **`useClubRecruitmentsQuery` 잔존**: 학생측 외(캘린더, 관리자) 의 사용처는 영향 없음.
- **응답 크기 증가**: active 가 null 인 경우 한 줄, 있는 경우 ~13 필드. 부담 없음.
- **호환성**: 신규 필드 추가만이라 기존 클라이언트(모바일 등) 무영향.
- **운영 데이터 정합성**: production DB(Supabase) 의 현재 모집 4건 중 OPEN 1건 (id=503 "외부폼 테스트"). active 단일 제약과 위배 없음 — 즉시 머지 가능.
