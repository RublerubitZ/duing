# 지원자 관리 대시보드 설계 사양

작성일: 2026-06-07
대상 도메인:
- `backend/domain/application/**` (기존, 확장)
- `backend/domain/applicationEvaluation/**` (신규)
- `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/**`

선행 사양: 없음 (현재 운영진 지원자 페이지 기능 위에 누적).

---

## 1. 배경

운영진의 지원자 관리 페이지는 현재 다음 기능만 제공한다:
- 지원자 목록 조회 (이름·학번·이메일·답변·상태·제출시각)
- 상세 응답 모달
- 단건 / 일괄 상태 변경
- 면접 일시·장소 입력 (INTERVIEW_PENDING 한정)

실사용에서는 운영진이 **내부 평가**(점수·메모) 와 **상태 변경 이력** 을 보관할 곳이 없어 Google Sheets 등 외부 도구로 새는 문제가 있다. 또한 지원자 수가 늘면 학과·기간·이름 등으로 좁히는 검색·필터링이 필요하다.

본 spec 은 기존 페이지를 다음 네 축으로 보강한다:

1. **평가 (Evaluation)** — 운영진 1인당 1개 score(1~5) + memo, 지원자 비공개.
2. **상태 이력 (Status History)** — 상태 변경 audit log, 운영진 상세에서 타임라인 노출.
3. **검색·필터 (Search & Filter)** — 상태·College·기간 필터 + 이름/학번/major 통합 검색.
4. **상세 페이지화 (Detail Page)** — 모달 → `/[applicationId]` 라우트로 승격, 평가·이력·면접 입력을 한 화면에 모음.

---

## 2. 목표 / Non-목표

### 2.1 목표

- `application_evaluation` 테이블·도메인 신규. PUT/DELETE `/leader/applications/{id}/evaluations/me` 엔드포인트 추가.
- `application_status_history` 테이블 신규. 상태 변경 시 자동 적재, 운영진 상세 응답에 newest-first 타임라인 포함.
- 운영진 목록 GET 엔드포인트에 `status` / `college` / `q` / `submittedFrom` / `submittedTo` 옵셔널 파라미터 추가.
- 운영진 목록 응답에 `college` / `major` / `grade` / `interviewAt` / `myScore` 필드 추가.
- 운영진 상세 응답에 `myEvaluation` / `otherEvaluations` / `statusHistory` 필드 추가.
- 신규 엔드포인트 `GET .../recruitments/{rId}/applications/{aId}/neighbors` — 동일 필터 컨텍스트에서 prev/next applicationId 반환.
- 운영진 지원자 페이지를 모달 기반 → `/[applicationId]` 페이지 기반으로 재구성.
- 모집의 `useInterview` 플래그에 따라 INTERVIEW_PENDING 관련 UI 분기.

### 2.2 Non-목표 (Out of Scope)

- **지원서 첨부파일** — DB·UI·스토리지 모두 미포함. 별도 spec.
- **상태 변경 알림** (이메일·푸시·인앱) — 알림 인프라 변경 필요. 별도 spec.
- **평가 CSV/엑셀 내보내기 및 평가 집계 통계** — 다운로드, 평균 점수 분포, 합격률 시각화 미포함. 기존 `/stats` 페이지는 그대로 두고 평가 관련 차트는 미추가.
- **운영진 간 평가 댓글 / 토론 스레드** — 평가에 대한 재댓글, 멘션 등.
- **점수 기반 자동 상태 전이** — "평균 4점 이상 자동 서류합격" 같은 자동 수낙 규칙.
- **목록 페이지네이션** — `page`/`size` 쿼리 파라미터 도입, 응답 wrapper 변경, 페이지네이션 UI 모두 미포함. 모집당 100명 이상이 일상화되면 별도 spec 으로 도입 (response shape breaking change 전제).
- **상태값 enum 재네이밍** — `SUBMITTED/UNDER_REVIEW/INTERVIEW_PENDING/ACCEPTED/REJECTED` 유지. 원 요구사항의 `DOCUMENT_PASSED/INTERVIEW_SCHEDULED` 네이밍 매핑·마이그레이션 없음.
- **면접 일정 변경 추적** — `application_status_history` 는 오직 상태 전이만 기록. 면접 재일정·취소는 history 미기록.
- **지원자 본인 마이페이지의 평가 노출** — `MyApplicationDetailResponse` 는 변경하지 않으며 evaluations 필드 자체가 존재하지 않는다.

---

## 3. 도메인 배치

```
backend/src/main/java/com/duing/domain/
├── application/                                    # 기존 — 확장
│   ├── entity/
│   │   ├── Application.java                        # 변경 없음
│   │   └── ApplicationStatusHistory.java           # 신규 (sub-entity)
│   ├── controller/LeaderApplicationController.java # 목록/상세 확장 + neighbors 추가
│   ├── api/LeaderApplicationApi.java               # 동일
│   ├── service/
│   │   ├── ApplicationService.java                 # 시그니처 확장
│   │   └── GeneralApplicationService.java          # transitionTo 직후 history 기록
│   └── repository/
│       ├── ApplicationRepository.java
│       ├── ApplicationRepositoryCustom.java        # 신규 (QueryDSL)
│       ├── ApplicationRepositoryImpl.java          # 신규
│       └── ApplicationStatusHistoryRepository.java # 신규
└── applicationEvaluation/                          # 신규 aggregate
    ├── api/LeaderApplicationEvaluationApi.java
    ├── controller/LeaderApplicationEvaluationController.java
    ├── entity/ApplicationEvaluation.java
    ├── repository/ApplicationEvaluationRepository.java
    ├── service/
    │   ├── ApplicationEvaluationService.java
    │   └── GeneralApplicationEvaluationService.java
    ├── service/dto/command/UpsertApplicationEvaluationCommand.java
    └── exception/ApplicationEvaluationDomainException.java
```

### 배치 근거

- `ApplicationStatusHistory` 는 `Application` 의 상태 전이와 강결합. `Application` aggregate 의 sub-entity 로 둔다. 단, **컬렉션 보유 금지** — `Application` 에 `@OneToMany histories` 두지 않는다. 이유: 목록 조회 등 history 가 불필요한 경로에서 LAZY 로딩 트리거 위험, 관리 복잡도 증가, history 는 audit log 라 Application 의 본질적 invariant 가 아님. 필요 시 `ApplicationStatusHistoryRepository.findByApplicationIdOrderByCreatedAtDesc(id)` 로 직접 조회.
- `ApplicationEvaluation` 은 별도 aggregate. 평가자 본인이 owner 이고 라이프사이클이 독립적. 자체 controller/service.
- 프론트는 기존 페이지 위치 보강 + `[applicationId]/` 하위 신규 라우트.

---

## 4. 데이터 모델

> **마이그레이션 버전 배정 규칙**: 배포 순서(B2 → B3)와 일치하도록 history 가 V43, evaluation 이 V44. Flyway 의 out-of-order 적용을 막기 위함.

### 4.1 Flyway V44 — `application_evaluation`

```sql
-- V44__create_application_evaluation.sql

CREATE TABLE IF NOT EXISTS application_evaluation (
    id             BIGSERIAL PRIMARY KEY,
    application_id BIGINT      NOT NULL REFERENCES application (id),
    evaluator_id   BIGINT      NOT NULL REFERENCES users (id),
    score          SMALLINT    NOT NULL CHECK (score BETWEEN 1 AND 5),
    memo           TEXT,                        -- nullable: 점수만 매기는 빠른 평가 허용
    created_at     TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP   NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMP
);

-- 한 평가자가 한 지원자에 대해 활성 평가는 1개. soft delete 후 재작성 허용.
CREATE UNIQUE INDEX IF NOT EXISTS uq_application_evaluation_active
    ON application_evaluation (application_id, evaluator_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_application_evaluation_application
    ON application_evaluation (application_id);
```

FK 정책 — 두 FK 모두 `ON DELETE` 절 없음 (default = NO ACTION). 근거:
- `application` / `users` 모두 soft delete 라 실제 row 삭제가 발생할 시나리오 없음.
- 운영 사고로 hard delete 시도 시 FK 위반으로 차단 → audit 보존. 안전망 역할.

엔티티 핵심:

```java
@Entity
@Table(name = "application_evaluation")
@SQLDelete(sql = "UPDATE application_evaluation SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Getter
public class ApplicationEvaluation extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "application_id", nullable = false)
    private Application application;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "evaluator_id", nullable = false)
    private User evaluator;

    @Column(nullable = false)
    private Integer score;

    @Column(columnDefinition = "TEXT")
    private String memo;

    public static ApplicationEvaluation create(Application application, User evaluator, int score, String memo) {
        validateScore(score);
        return ApplicationEvaluation.builder()
                .application(application)
                .evaluator(evaluator)
                .score(score)
                .memo(memo)
                .build();
    }

    public void update(int score, String memo) {
        validateScore(score);
        this.score = score;
        this.memo = memo;
    }

    private static void validateScore(int score) {
        if (score < 1 || score > 5) {
            throw new ApplicationEvaluationDomainException.EvaluationScoreOutOfRangeException();
        }
    }
}
```

- `@Version` 없음 — 본인만 자기 평가를 수정하므로 동시성 충돌 가능성 극도로 낮고 last-write-wins 로 운영 손상 없음.

### 4.2 Flyway V43 — `application_status_history`

```sql
-- V43__create_application_status_history.sql

CREATE TABLE IF NOT EXISTS application_status_history (
    id              BIGSERIAL PRIMARY KEY,
    application_id  BIGINT      NOT NULL REFERENCES application (id),
    previous_status VARCHAR(20) NOT NULL,        -- 첫 전이부터 기록. SUBMITTED 진입은 미기록.
    new_status      VARCHAR(20) NOT NULL,
    changed_by      BIGINT      NOT NULL REFERENCES users (id),
    created_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMP                    -- BaseEntity 일관성 위해 컬럼만 유지. 항상 NULL.
);

CREATE INDEX IF NOT EXISTS idx_application_status_history_application
    ON application_status_history (application_id, created_at);
```

엔티티 핵심 — **append-only audit log**:

```java
@Entity
@Table(name = "application_status_history")
// 의도적으로 @SQLDelete / @SQLRestriction 를 붙이지 않음.
// append-only audit log 이며 hard delete 도 금지. Repository 에서 delete API 미노출로 보장.
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Getter
public class ApplicationStatusHistory extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "application_id", nullable = false)
    private Application application;

    @Enumerated(EnumType.STRING)
    @Column(name = "previous_status", nullable = false, length = 20)
    private ApplicationStatus previousStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "new_status", nullable = false, length = 20)
    private ApplicationStatus newStatus;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "changed_by", nullable = false)
    private User changedBy;

    public static ApplicationStatusHistory record(
            Application application,
            ApplicationStatus previousStatus,
            ApplicationStatus newStatus,
            User changedBy
    ) {
        return ApplicationStatusHistory.builder()
                .application(application)
                .previousStatus(previousStatus)
                .newStatus(newStatus)
                .changedBy(changedBy)
                .build();
    }
}
```

- `changedAt` 별도 컬럼 없음 — `BaseEntity.createdAt` 이 변경 시각. DTO 에서만 `changedAt` 으로 노출.
- `deleted_at` 컬럼은 BaseEntity 일관성으로 따라오지만 항상 NULL.

### 4.3 `application` 테이블

변경 없음. 검색·필터 인덱스 추가 불필요 (모집당 N 작아 `idx_application_recruitment` + 인메모리 필터/QueryDSL join 으로 충분).

---

## 5. Backend API

기본 경로 `/api/v1/leader`. 운영진 권한은 `clubAuthService.requireManager(currentUserId, clubId)` 로 일관 가드 (기존 패턴 재사용).

### 5.1 엔드포인트 요약

| Method | Path | 변화 |
|---|---|---|
| GET | `/leader/recruitments/{recruitmentId}/applications` | **확장** — 필터 쿼리 파라미터 + 응답 필드 |
| GET | `/leader/applications/{applicationId}` | **확장** — evaluations / statusHistory 포함 |
| PATCH | `/leader/applications/{applicationId}/status` | **내부** — history 자동 적재 |
| PATCH | `/leader/applications/bulk-status` | **내부** — 성공 건마다 history 자동 적재 |
| PATCH | `/leader/applications/{applicationId}/interview` | 변경 없음 |
| **PUT** | `/leader/applications/{applicationId}/evaluations/me` | **신규** — 내 평가 upsert |
| **DELETE** | `/leader/applications/{applicationId}/evaluations/me` | **신규** — 내 평가 삭제 |
| **GET** | `/leader/recruitments/{recruitmentId}/applications/{applicationId}/neighbors` | **신규** — prev/next id |

### 5.2 목록 GET — 필터·검색

```
GET /leader/recruitments/{recruitmentId}/applications
    ?status=UNDER_REVIEW
    &college=ENGINEERING
    &q=홍길동
    &submittedFrom=2026-05-01
    &submittedTo=2026-05-31
```

- 모든 파라미터 옵셔널. 다 비면 전체 반환.
- 정렬: 제출 시각 desc (최근 지원자가 위로). 현재 asc 라면 desc 로 변경 — 운영진 워크플로 정합성.
- `q`: `user.name`, `user.studentId`, `user.major` 에 대해 `containsIgnoreCase` OR 매칭.
- `submittedFrom` / `submittedTo`: LocalDate. half-open 구간으로 명시.
  - 필터 조건: `application.createdAt >= submittedFrom 00:00:00 AND application.createdAt < submittedTo.plusDays(1) 00:00:00`
  - `submittedTo=2026-05-31` → 5월 31일 23:59:59.999 까지 포함.
  - `submittedFrom > submittedTo` → 400 `InvalidDateRangeException`.
  - 타임존 KST (`Asia/Seoul`) 서버 단일 처리.
- 응답: `List<ApplicantResponse>` (wrapper 도입 없음). 페이지네이션 미도입.
- 구현: `ApplicationRepositoryCustom` + QueryDSL `BooleanExpression` 동적 조건. `myScore` 채움을 위한 self join:
  `LEFT JOIN application_evaluation eval ON eval.application_id = application.id AND eval.evaluator_id = :currentUserId AND eval.deleted_at IS NULL`

### 5.3 `ApplicantResponse` — 확장

```java
public record ApplicantResponse(
    Long applicationId,
    Long userId,
    String userName,
    String studentId,
    String email,
    College college,                // NEW
    String major,                   // NEW
    Grade grade,                    // NEW
    ApplicationStatus status,
    LocalDateTime submittedAt,
    LocalDateTime interviewAt,      // NEW — 없으면 null
    Integer myScore                 // NEW — 내가 매긴 점수, 미작성이면 null
) {
    public static ApplicantResponse from(ApplicantQuery query) { ... }
}
```

- 기존 `answers` 필드는 목록 응답에 그대로 유지 (backward-compat). 신규 컬럼은 옵셔널 추가만 발생하여 프론트 F1 머지 전에도 화면이 깨지지 않는다.

### 5.4 상세 GET — 응답 확장

```java
public record ApplicantDetailResponse(
    Long applicationId,
    Long userId, String userName, String studentId, String email,
    College college, String major, Grade grade,
    List<String> answers,
    ApplicationStatus status,
    LocalDateTime submittedAt,
    LocalDateTime interviewAt,
    String interviewLocation,
    ApplicationEvaluationItem myEvaluation,            // NEW — 본인 평가, 미작성이면 null
    List<ApplicationEvaluationItem> otherEvaluations,  // NEW — 본인 제외 운영진 평가
    List<StatusHistoryItem> statusHistory              // NEW — newest-first
) {}

public record ApplicationEvaluationItem(
    Long evaluatorId,
    String evaluatorName,
    Integer score,
    String memo,
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {}

public record StatusHistoryItem(
    ApplicationStatus previousStatus,
    ApplicationStatus newStatus,
    Long changedById,
    String changedByName,
    LocalDateTime changedAt
) {}
```

- Service 가 currentUserId 기준으로 myEvaluation / otherEvaluations 분리해 채움. 프론트는 분기 로직 없이 두 필드 그대로 사용.
- `statusHistory` 는 `ORDER BY created_at DESC` 로 newest-first 반환.

### 5.5 평가 upsert / 삭제

```java
public record UpsertApplicationEvaluationRequest(
    @NotNull @Min(1) @Max(5) Integer score,
    @Size(max = 2000) String memo
) {
    public UpsertApplicationEvaluationCommand toCommand(Long applicationId, Long evaluatorId) { ... }
}
```

- `PUT /leader/applications/{applicationId}/evaluations/me` → 204
  - `(application_id, evaluator_id)` 활성 row 있으면 score/memo 갱신, 없으면 신규.
  - 권한: `clubAuthService.requireManager`.
  - 본인 row 만 식별하므로 partial UNIQUE 충돌 없음.
- `DELETE /leader/applications/{applicationId}/evaluations/me` → 204
  - 없는 상태에서 호출해도 204 (idempotent). 404 던지지 않음.

### 5.6 상태 변경 시 history 기록 흐름

`ApplicationService` 안에서 `transitionTo` 호출 직후 같은 트랜잭션에서 history 적재:

```java
ApplicationStatus previousStatus = application.getStatus();
application.transitionTo(newStatus, recruitment.isUseInterview());
applicationStatusHistoryRepository.save(
    ApplicationStatusHistory.record(application, previousStatus, newStatus, changedByUser)
);
```

- Bulk 도 동일 패턴. 성공한 항목별로 1 row. 건별 트랜잭션 구조 유지 (한 건 실패가 다른 건 롤백 유발 안 함).
- `transitionTo()` 자체는 상태 검증·변경까지만 책임. history 생성은 service 책임 → aggregate 경계 명확.

### 5.7 Neighbor 엔드포인트

```
GET /leader/recruitments/{recruitmentId}/applications/{applicationId}/neighbors
    ?status=&college=&q=&submittedFrom=&submittedTo=
→ 200 { "prevApplicationId": Long | null, "nextApplicationId": Long | null }
```

- 목록과 **동일한 QueryDSL 조건·정렬** 을 재사용. 단일 진실 보장.
- 정렬 desc 기준으로 자신보다 createdAt 큰 것 중 가장 가까운 = prev (newer), 작은 것 중 가장 가까운 = next (older). 명세상으로는 "왼쪽 버튼이 prev (더 최근), 오른쪽 버튼이 next (더 오래된)" 로 일관.
- 응답 가벼움 (id 2개). prev/next 클릭마다 1회 호출.
- 권한: `clubAuthService.requireManager`.

### 5.8 Privacy 가드

- `MyApplicationDetailResponse` (지원자 본인용) 은 **변경하지 않음** — evaluations 필드 자체가 없음.
- `ApplicationEvaluation` 은 운영진 전용 service 흐름에서만 조회되도록 분리. `requireManager` 통과 안 한 경로에서는 어떤 DTO 변환을 통해서도 평가가 새지 않게.
- 회귀 단위 테스트: "지원자가 자기 application 조회해도 evaluations 응답에 없다."

### 5.9 도메인 예외

`ApplicationEvaluationDomainException` (static inner class 패턴):
- `EvaluationScoreOutOfRangeException` — 400
- `ApplicationEvaluationNotFoundException` — 404 (필요 시)

`ApplicationDomainException` (기존, 추가):
- `InvalidDateRangeException` — 400 (`submittedFrom > submittedTo`)

권한 예외는 `ClubAuthService` 가 던지는 기존 예외 재사용.

---

## 6. Frontend

### 6.1 라우트 / 파일 구조

```
manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/
├── page.tsx                            # 목록 (필터·검색·테이블·bulk)
├── _components/
│   ├── ApplicantTable.tsx              # 기존, 컬럼 추가
│   ├── BulkActionBar.tsx               # 기존, terminal 비활성화 로직 보강
│   ├── BulkConfirmDialog.tsx           # 기존
│   ├── ApplicantsFilterBar.tsx         # NEW — 상태·College·기간 필터
│   ├── ApplicantsSearchInput.tsx       # NEW — 이름·학번·major 통합 input (debounced)
│   └── applicationStatusTransitions.ts # 기존
└── [applicationId]/                    # NEW — 상세 페이지 라우트
    ├── page.tsx                        # Server Component (라우팅 진입점)
    └── _components/
        ├── ApplicantDetailPage.tsx     # NEW — 클라이언트 조립
        ├── ApplicantProfilePanel.tsx   # NEW
        ├── ApplicantAnswersPanel.tsx   # NEW
        ├── EvaluationPanel.tsx         # NEW — 컨테이너
        ├── MyEvaluationCard.tsx        # NEW — 편집 가능 폼
        ├── OtherEvaluationsList.tsx    # NEW — 읽기 전용
        ├── StatusTimeline.tsx          # NEW — newest-first
        ├── StatusActionBar.tsx         # NEW — 다음 상태 + InterviewModal 트리거
        ├── ApplicantNavBar.tsx         # NEW — prev/next + 목록 복귀
        └── InterviewModal.tsx          # 기존 InterviewModal 이전
```

기존 `ApplicantDetailModal.tsx` 는 **삭제**. `InterviewModal.tsx` 는 상세 페이지 하위로 이동.

### 6.2 `packages/*` 추가

**packages/types:**

```ts
export type ApplicationEvaluation = {
  evaluatorId: number;
  evaluatorName: string;
  score: number;          // 1-5
  memo: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApplicationStatusHistoryItem = {
  previousStatus: ApplicationStatus;
  newStatus: ApplicationStatus;
  changedById: number;
  changedByName: string;
  changedAt: string;
};

// Applicant (목록): college / major / grade / interviewAt / myScore 옵셔널 필드 추가. answers 는 유지.
// ApplicantDetail (상세): myEvaluation (nullable) / otherEvaluations / statusHistory 추가.
```

**packages/api/src/client.ts:**

```ts
getApplicants(recruitmentId, params: {
  status?, college?, q?, submittedFrom?, submittedTo?
}): Promise<Applicant[]>
getApplicantDetail(applicationId): Promise<ApplicantDetail>
getApplicantNeighbors(recruitmentId, applicationId, filters): Promise<{
  prevApplicationId: number | null;
  nextApplicationId: number | null;
}>
upsertMyApplicationEvaluation(applicationId, { score, memo }): Promise<void>
deleteMyApplicationEvaluation(applicationId): Promise<void>
```

**packages/hooks:**

```ts
useApplicantsQuery(recruitmentId, filters)
useApplicantDetailQuery(applicationId)
useApplicantNeighborsQuery(recruitmentId, applicationId, filters)
useUpsertMyApplicationEvaluationMutation()
useDeleteMyApplicationEvaluationMutation()
```

각 mutation 성공 시:
- `queryClient.invalidateQueries({ queryKey: ['applicantDetail', applicationId] })`
- `queryClient.invalidateQueries({ queryKey: ['applicants', recruitmentId] })` — myScore 갱신

### 6.3 목록 페이지 UX

- 상단: 모집공고 정보 + 통계 카드 (기존 유지).
- 필터 바 (`ApplicantsFilterBar`):
  - 상태 드롭다운 (전체 + 5개 상태). `useInterview=false` 면 INTERVIEW_PENDING 옵션 숨김.
  - College 드롭다운 (전체 + College enum).
  - 기간: `submittedFrom` / `submittedTo` 두 개의 date input.
  - 통합 검색창 (`ApplicantsSearchInput`): 이름·학번·학과명 / 300ms debounce.
  - "필터 초기화" 버튼.
  - **URL 쿼리스트링 동기화** (`useSearchParams`) — 새로고침·뒤로가기·링크 공유 시 필터 유지.
- 테이블 (`ApplicantTable`):
  - 컬럼: `[☑]` · 이름 · 학과(`college` 라벨 + `major`) · 학번 · 학년 · 지원일시 · 상태 · 면접일정 · **내 점수**.
  - 면접일정 컬럼: `useInterview=false` 면 컬럼 자체 숨김.
  - 내 점수 컬럼: `myScore` null → "—" / 숫자 → `4 / 5` 뱃지. 색상 단계 (1·2 빨강 / 3 회색 / 4·5 초록).
  - 행 클릭 → `/applicants/[applicationId]` push (현재 필터 search params 보존).
  - 체크박스: `status ∈ {ACCEPTED, REJECTED}` → `disabled` + tooltip "최종 상태인 지원자는 선택할 수 없습니다".
  - 빈 상태 분기: "검색 결과 없음" vs "지원자가 아직 없습니다".
- Bulk 결과 처리:
  - mutation 응답 `{ succeeded: number[], failed: { applicationId, reason }[] }` 기반.
  - Toast: "7명 변경 완료". `failed > 0` 면 추가 토스트 "3명 실패 (이미 최종 상태 등)". 자세한 사유는 기존 BulkConfirmDialog 결과 모달 패턴 따름.
  - `useInterview=false` 면 Bulk 타겟 옵션에서 INTERVIEW_PENDING 제외.

### 6.4 상세 페이지 UX

1024px 기준 2-column, 모바일 1-column 스택. 레이아웃:

```
┌─────────────────────────────────────────────────────────┐
│  [← 목록] [< 이전] [다음 >]            상태: 검토중       │  ApplicantNavBar
├─────────────────────────────────────────────────────────┤
│  ┌─ ProfilePanel ──────────────┐  ┌─ EvaluationPanel ─┐│
│  │ 이름·학번·학과·연락처         │  │ ▌ 내 평가         ││
│  │ 지원일시·면접일정             │  │ score [1-5 라디오]││
│  └──────────────────────────────┘  │ memo [textarea]   ││
│  ┌─ AnswersPanel ──────────────┐   │ [저장] [삭제]      ││
│  │ Q&A 응답                     │   ├───────────────────┤│
│  └──────────────────────────────┘  │ 다른 운영진 평가  ││
│  ┌─ StatusTimeline ────────────┐   │ • 김민지 4/5      ││
│  │ ● 최신 ← 이전 (by 김민지)   │   │ • 박지호 3/5      ││
│  │ ● 이전 ← 이전이전           │   └───────────────────┘│
│  │ ○ SUBMITTED (시작점)        │   ┌─ StatusActionBar ─┐│
│  └──────────────────────────────┘  │ [서류합격][불합격]││
│                                    │ [면접 일정 입력]  ││
│                                    └───────────────────┘│
└─────────────────────────────────────────────────────────┘
```

- **MyEvaluationCard**:
  - 빈 상태: "평가를 아직 작성하지 않았어요" + [작성하기] 버튼.
  - 편집: score 1-5 라디오 + memo textarea. placeholder "강점, 약점, 협업 경험, 추가 검증 필요 사항 등".
  - helper text: "메모는 평가 근거 작성에 사용됩니다. 지원자에게는 공개되지 않습니다."
  - 저장: `useUpsertMyApplicationEvaluationMutation`.
  - 삭제: confirm dialog 후 `useDeleteMyApplicationEvaluationMutation`.

- **OtherEvaluationsList**:
  - 빈 상태: "다른 운영진의 평가가 아직 없어요" (회색 텍스트만).
  - 다건: 이름·점수 뱃지·메모·작성/수정 시각 카드 리스트.

- **StatusActionBar**:
  - 현재 상태에서 가능한 transition 만 버튼 노출. `applicationStatusTransitions.ts` 재사용 + `useInterview` 분기.
  - INTERVIEW_PENDING 상태에서 면접 일정 입력 버튼 → InterviewModal 트리거.
  - `useInterview=false` 면 INTERVIEW_PENDING 경유 버튼 자체 없음.

- **StatusTimeline (newest-first)**:
  - 위에서 아래로 최신 → 시작점.
  - 가장 아래 SUBMITTED 진입은 회색 도트 (history 없음, application.createdAt 표시).
  - 비어있으면 SUBMITTED 도트만 표시.

- **ApplicantNavBar**:
  - `useApplicantNeighborsQuery(recruitmentId, applicationId, filtersFromUrl)` 호출.
  - prev/next id null 이면 버튼 disabled.
  - 클릭 시 같은 search params 유지하면서 다음 id 로 push.
  - 키보드 단축키 옵션 (`[` / `]`).

### 6.5 면접 미사용 모집(`useInterview=false`) 분기 요약

| 영역 | `true` | `false` |
|---|---|---|
| 상태 필터 드롭다운 | 5개 전체 | INTERVIEW_PENDING 숨김 |
| Bulk 타겟 옵션 | INTERVIEW_PENDING 포함 | INTERVIEW_PENDING 제외 |
| StatusActionBar 버튼 | INTERVIEW_PENDING 경유 | UNDER_REVIEW → ACCEPTED/REJECTED 직행 |
| 면접 일정 컬럼 (목록) | 표시 | 컬럼 숨김 |
| InterviewModal | INTERVIEW_PENDING 에서 트리거 가능 | 트리거 진입점 없음 |
| StatusTimeline | 그대로 | 그대로 (보통 짧은 흐름) |

분기 신호: `useRecruitmentDetailQuery(recruitmentId).useInterview` 한 곳에서 받아 prop 전달.

### 6.6 Privacy 가드

`apps/web/app/me/applications/[applicationId]/page.tsx` 는 `MyApplicationDetailResponse` 만 사용. 타입상 evaluations 필드 자체가 없으므로 본 작업으로 우발 노출 발생할 수 없음. 별도 변경 없음.

---

## 7. 테스트

### 7.1 백엔드

기존 패턴: RestAssured + Fixture Monkey + TestContainers PostgreSQL. `@DisplayName` 은 요구사항 문장.

**application 도메인 (확장 케이스):**
- 목록 status 필터: 5개 enum 단일 적용 시 해당 상태만 반환된다
- 목록 College 필터: 다른 College 지원자는 제외된다
- 목록 통합 검색 `q`: 이름·학번·major 어느 하나만 일치해도 매칭되며 대소문자를 무시한다
- 목록 기간 필터: `submittedTo` 당일 23:59 에 제출된 건이 포함된다 (half-open 검증)
- 목록 기간 필터: `submittedFrom > submittedTo` 면 400 응답
- 목록 모든 파라미터 없으면 전체가 반환된다
- 목록 응답에 myScore 가 currentUser 의 평가 점수로 채워지고 미작성 시 null 이다
- 상태 변경 시 history 가 한 줄 적재된다 (previousStatus·newStatus·changedBy 일치)
- 상태 변경 트랜잭션에서 history save 실패 시 transition 도 롤백된다 (실패 시뮬레이션)
- Bulk 상태 변경 중 일부 실패: 성공 건만 status 변경되고 성공 건만 history 적재된다
- `useInterview=false` 모집에 Bulk 로 INTERVIEW_PENDING 요청 시 모두 실패로 분류된다
- 상세 응답에서 myEvaluation 과 otherEvaluations 가 currentUserId 기준으로 분리된다
- 상세 응답의 statusHistory 가 newest-first 로 정렬된다
- Neighbor 엔드포인트: 동일 필터에서 prev/next id 가 목록 정렬과 일치한다
- Neighbor 엔드포인트: 첫 번째 → prev=null, 마지막 → next=null, 단일 건이면 둘 다 null
- 운영진이 아닌 사용자가 위 모든 엔드포인트 호출 시 403

**applicationEvaluation 도메인:**
- PUT 호출 시 없으면 신규 생성되고 204 가 반환된다
- PUT 호출 시 있으면 score/memo 가 갱신되고 204 가 반환된다
- score 0 / 6 / null 요청 시 400
- memo null 은 허용되고 2000자 초과 시 400
- 다른 운영진의 평가는 본인 PUT 으로 수정되지 않는다
- DELETE 호출 시 없는 평가에 대해서도 204 (idempotent)
- 운영진이 아닌 사용자가 PUT/DELETE 호출 시 403
- 지원자 본인의 마이페이지 응답에 평가 관련 필드가 존재하지 않는다 (privacy 회귀)

### 7.2 프론트

기존 `apps/web/test/[route]/` 패턴. TanStack Query 내부 모킹 금지.

- `ApplicantTable`: terminal 상태 행 체크박스 disabled + tooltip
- `ApplicantTable`: myScore null → "—" / 숫자 → 뱃지 렌더링
- `ApplicantTable`: `useInterview=false` 시 면접일정 컬럼 미렌더
- `ApplicantsFilterBar`: 필터 변경 → URL 쿼리스트링 동기화, 초기화 시 모든 필터 비움
- `ApplicantsSearchInput`: debounce 300ms 후 쿼리 트리거
- `useApplicantsQuery`: 필터 쿼리키 분리 — 동일 필터 재호출 시 캐시 hit
- `MyEvaluationCard`: 빈 상태 / 작성 / 수정 / 삭제 흐름, 저장 후 본인 카드 갱신
- `OtherEvaluationsList`: 빈 상태 / 다건 표시
- `StatusActionBar`: 현재 상태별 노출 버튼, `useInterview` 분기
- `StatusTimeline`: newest-first 정렬, SUBMITTED 만 있는 경우 회색 도트
- `ApplicantNavBar`: neighbors 응답에 따라 prev/next disabled, 클릭 시 URL search params 유지
- Detail page: 다음 지원자 이동 시 URL 변경 + 데이터 리프레시

---

## 8. 구현 순서 / 브랜치 분할

CLAUDE.md "API 1개 = 브랜치 1개 = PR 1개" 원칙. 총 6 PR. `develop` 분기 → `develop` 으로 PR.

### 백엔드 (순차)

**B1. `feat/N-application-search-filter`**
- 목록 GET 확장 (필터 쿼리 파라미터).
- `ApplicantResponse` 에 `college` / `major` / `grade` / `interviewAt` 추가 (`myScore` 는 B3 후 추가).
- `ApplicationRepositoryCustom` + QueryDSL `BooleanExpression`.
- `InvalidDateRangeException` 추가.
- 회귀 + 신규 테스트.

**B2. `feat/N-application-status-history`**
- V43 마이그레이션 추가.
- `ApplicationStatusHistory` 엔티티·리포지토리·DTO 추가.
- `GeneralApplicationService.updateStatus` / bulk 흐름에 history 기록 추가.
- `ApplicantDetailResponse` 에 `statusHistory` 필드 추가 (newest-first).

**B3. `feat/N-application-evaluation`**
- V44 마이그레이션 추가.
- `applicationEvaluation/` 신규 도메인 일체.
- PUT / DELETE `/evaluations/me` 엔드포인트.
- `ApplicantDetailResponse` 에 `myEvaluation` / `otherEvaluations` 추가.
- `ApplicantResponse` 에 `myScore` 추가 (B1 응답 컬럼 추가, 목록 쿼리에 LEFT JOIN).

**B4. `feat/N-application-neighbors-api`**
- Neighbor 엔드포인트.
- B1 의 QueryDSL `BooleanExpression` 재사용 + ordering position 계산.

### 프론트 (B1~B4 모두 머지 후)

**F1. `feat/N-applicants-list-filter-search`**
- `packages/types`: Applicant 확장 + ApplicationEvaluation / StatusHistoryItem.
- `packages/api/client`: getApplicants 새 시그니처.
- `packages/hooks`: useApplicantsQuery 확장 (필터 쿼리키).
- 목록 페이지: ApplicantsFilterBar, ApplicantsSearchInput, URL 동기화.
- ApplicantTable 컬럼 추가, terminal 행 disabled, `useInterview` 분기.

**F2. `feat/N-applicant-detail-page`**
- 라우트 `[applicationId]/page.tsx` 추가, 기존 `ApplicantDetailModal` 제거.
- 컴포넌트: ApplicantProfilePanel / ApplicantAnswersPanel / StatusTimeline / StatusActionBar / ApplicantNavBar.
- 평가: EvaluationPanel + MyEvaluationCard + OtherEvaluationsList.
- 훅: useApplicantDetailQuery 확장, useUpsertMyApplicationEvaluationMutation, useDeleteMyApplicationEvaluationMutation, useApplicantNeighborsQuery.
- InterviewModal 이전.

### 순서 근거

- B1·B2 는 독립 가능하지만 둘 다 `ApplicantDetailResponse` 를 건드리므로 순차로 둠 (충돌 방지).
- B3 가 `myScore` 컬럼을 추가하면서 B1 의 `ApplicantResponse` 와 상세 응답을 1차 확장. 프론트가 한 번에 흡수하기 위해 백엔드 모두 머지 후 F1 진입.
- F1·F2 직렬. F1 의 새 hook/타입을 F2 가 그대로 import.

---

## 9. 리스크 & 주의사항

1. **`@SQLDelete` 없는 `ApplicationStatusHistory`** — 기존 패턴과 다름. 엔티티 상단 주석으로 의도 (append-only audit log, hard delete 금지) 명시. 리뷰어 혼선 방지.
2. **partial UNIQUE 인덱스 (`WHERE deleted_at IS NULL`)** — H2 미지원. TestContainers PostgreSQL 로 테스트 (기존 패턴).
3. **`myScore` 의 N+1 위험** — 목록 조회 시 평가 LEFT JOIN 한 번에 처리. 회귀 테스트로 쿼리 수 검증 권장.
4. **상태 전이와 history 기록 트랜잭션** — `transitionTo()` 는 성공했는데 history save 가 실패하면 데이터 누락. 같은 `@Transactional` 안에서 처리되어 자동 롤백. Bulk 의 건별 트랜잭션 구조 유지 (각 건이 transition + history 한 묶음).
5. **운영 안전망** — V43 / V44 둘 다 `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` 로 idempotent. 기존 Flyway 패턴 일치.
6. **응답 필드 추가는 backward-compatible** — `ApplicantResponse` / `ApplicantDetailResponse` 에 필드만 추가하므로 기존 프론트는 새 필드를 무시하면 그대로 동작. F1·F2 머지 전까지 프론트 화면 깨지지 않음.
