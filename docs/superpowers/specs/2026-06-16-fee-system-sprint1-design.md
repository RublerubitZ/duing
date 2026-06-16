# 회비 관리 시스템 — Sprint 1 설계서

- 작성일: 2026-06-16
- 대상: Du-ing(두잉) 모노레포 (backend: Spring Boot 3.4 / Java 21, frontend: Next.js 15 / React 19)
- 범위: 회비 관리 시스템 **Sprint 1** (회비 정책 · 회비 청구 · 조회)
- 전제: 이 설계는 전체 PRD(2단계·4스프린트) 중 Sprint 1만 다룬다. Sprint 2~4(납부 처리·미납 자동화·대시보드·BANK API 자동매칭)는 본 문서의 "이후 스프린트" 절에 매핑만 기록한다.

---

## 1. 배경과 목표

두잉은 동아리·모임 통합 플랫폼이며, 운영진(회장·총무)의 회비 관리 업무를 자동화하는 것이 본 시스템의 목표다. Sprint 1은 그 토대로서 다음을 제공한다.

- 동아리별 **회비 정책** 정의 (월/학기/연/일회성)
- 정책 기반 **회비 청구 수동 발행** (활성 회원 일괄, 멱등)
- 총무용 **청구 현황 조회**와 회원용 **본인 회비 조회**

Sprint 1의 성공 기준: 총무가 화면에서 정책을 만들고, 한 회차의 청구를 일괄 발행하고, 누가 무엇을 청구받았는지 확인할 수 있다. 회원은 본인 청구 내역을 볼 수 있다. (실제 납부 체크·연체·집계·자동매칭은 이후 스프린트.)

## 2. 핵심 설계 결정 (확정)

1. **동아리 단위(club-scoped)**: 회비는 특정 동아리에 귀속된다. 회비 "관리자"는 그 동아리의 **LEADER(회장)·OFFICER(총무)** 이며, 전역 시스템 ADMIN은 회비 관리에 관여하지 않는다. 권한은 기존 `ClubAuthService.requireManager(userId, clubId)`(LEADER·OFFICER 허용)로 강제한다.
2. **금액은 정수 원(`BIGINT` / Java `long`)**: KRW는 소수 단위가 없으므로 `decimal`을 쓰지 않는다. 합계·수납률·부분납부 누적이 정수로 정확하다.
3. **청구 발행은 수동 트리거 + 멱등**: Sprint 1은 총무가 직접 "이 회차 청구 발행"을 실행한다. 자동 월 발행 크론은 Sprint 2에서 동일 도메인 로직을 호출만 하도록 얇게 붙인다.
4. **청구 대상은 `user_id` 스냅샷**: `club_member_id`가 아니라 `user_id`를 저장한다. 회원이 탈퇴(soft delete) 후 재가입해도 청구 이력이 보존되고 `/my/fees`를 `user_id` 기준으로 조회할 수 있다.
5. **금액 스냅샷**: 발행 시 `fee_policy.amount`를 `fee_bill.amount`에 복사한다. 이후 정책 금액이 바뀌어도 발행된 청구액은 불변이다.
6. **취소는 `CANCELLED` 상태**(soft delete가 아님): 취소 이력이 목록에 남고, 멱등 유니크 제약이 `CANCELLED`를 제외하므로 같은 회원·회차로 재발행할 수 있다.
7. **정책에 `due_day` 없음**: 마감일은 정책에 고정하지 않고 발행 시점에 결정한다. MONTHLY는 서버가 자동 산출, 학기/연/일회성은 발행 요청에서 기간·마감일을 명시한다.

## 3. 스코프

### In Scope (Sprint 1)
- 회비 정책 CRUD (동아리별 생성·수정·활성 토글·삭제)
- 회비 청구 수동 일괄 발행 (정책 + 회차/기간/마감 → 활성 회원 전원, 멱등)
- 개별 청구 취소 (`CANCELLED` 전이)
- 총무용 청구 현황 목록 조회 (회차·상태·회원 필터, 페이지네이션)
- 회원용 본인 회비 목록 조회 (`/my/fees`)
- 프론트 화면: `/manage/clubs/[clubId]/fees`(정책·청구 2탭), `/me/fees`

### Out of Scope (이후 스프린트, 본 Sprint에서 구현하지 않음)
- 납부 처리(수동 체크)·`PAID`/`PARTIAL_PAID` 전이, `payment` 테이블 → **Sprint 2**
- 미납/연체 자동화, 알림(인앱·이메일), `notification_log`, 자동 발행/연체 크론 → **Sprint 2**
- 집계 대시보드(수납률·미수금·총액 등) → **Sprint 2**
- BANK API 거래 수집·자동매칭·관리자 검토 큐·영수증, `bank_transaction`·`member_payment_code`·`bank_account` → **Sprint 3~4**
- 앱 푸시(FCM): 디바이스 토큰 인프라 자체가 없으므로 별도 구축 건 → **범위 외**
- 출석 연동 할인·포인트 차감·가상계좌·자동이체·카드결제·회계 장부·예산·AI 리포트 → 향후 확장(스키마가 막지 않도록만 설계)

## 4. 데이터 모델 (Flyway V60)

새 마이그레이션 파일 1개로 두 테이블을 생성한다. 기존 마이그레이션 수정 금지, snake_case, `TIMESTAMP WITH TIME ZONE`, `BIGSERIAL`, `VARCHAR + CHECK`(네이티브 ENUM 금지), FK `ON DELETE RESTRICT`, BaseEntity 표준 컬럼(`created_at`/`updated_at`/`deleted_at`), 그리고 **각 테이블 `ENABLE ROW LEVEL SECURITY`**(V59 패턴: 정책은 만들지 않음, 앱은 owner 역할로 접속하여 우회).

```sql
-- fee_policy : 동아리별 회비 정책
CREATE TABLE fee_policy (
    id            BIGSERIAL PRIMARY KEY,
    club_id       BIGINT NOT NULL REFERENCES club(id) ON DELETE RESTRICT,
    name          VARCHAR(100) NOT NULL,
    amount        BIGINT NOT NULL CHECK (amount >= 0),          -- 정수 원
    billing_type  VARCHAR(20) NOT NULL
                  CHECK (billing_type IN ('MONTHLY','SEMESTER','YEARLY','ONE_TIME')),
    active        BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_fee_policy_club ON fee_policy (club_id) WHERE deleted_at IS NULL;
ALTER TABLE fee_policy ENABLE ROW LEVEL SECURITY;

-- fee_bill : 회원 1명 × 1회차 청구서
CREATE TABLE fee_bill (
    id                 BIGSERIAL PRIMARY KEY,
    club_id            BIGINT NOT NULL REFERENCES club(id) ON DELETE RESTRICT,
    user_id            BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,  -- 발행 시점 회원 스냅샷
    fee_policy_id      BIGINT NOT NULL REFERENCES fee_policy(id) ON DELETE RESTRICT,
    amount             BIGINT NOT NULL CHECK (amount >= 0),     -- 정책 금액 스냅샷
    billing_period     VARCHAR(30) NOT NULL,                    -- 표시 라벨: "2026-07","2026-1학기","2026","MT참가비"
    billing_start_date DATE NOT NULL,
    billing_end_date   DATE NOT NULL,
    due_date           DATE NOT NULL,
    status             VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING','PAID','PARTIAL_PAID','OVERDUE','CANCELLED')),
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_fee_bill_period_range CHECK (billing_end_date >= billing_start_date)
);
-- 멱등 핵심: 같은 정책·회원·회차(시작일)는 1건만, 단 취소건은 제외하여 재발행 허용
CREATE UNIQUE INDEX uk_fee_bill_idem
    ON fee_bill (fee_policy_id, user_id, billing_start_date)
    WHERE deleted_at IS NULL AND status <> 'CANCELLED';
CREATE INDEX idx_fee_bill_club_status ON fee_bill (club_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_fee_bill_user ON fee_bill (user_id) WHERE deleted_at IS NULL;
ALTER TABLE fee_bill ENABLE ROW LEVEL SECURITY;
```

설계 노트:
- `status`는 5값을 미리 `CHECK`에 넣지만 Sprint 1에서 실제 사용하는 전이는 `PENDING`(발행)·`CANCELLED`(취소)뿐이다. `PAID`/`PARTIAL_PAID`/`OVERDUE`는 Sprint 2 payment·크론에서 채운다.
- `due_date`는 청구 기간과 별개다. 학기 회비는 기간이 6개월이라도 마감일은 보통 학기 초다.
- 기존 `Club.membershipFee`(free-form `String(100)`)는 본 설계에서 건드리지 않는다. 향후 "대표 회비 표시"로 남기거나 정책 요약으로 대체할 수 있으나 Sprint 1 범위 밖이다.

## 5. billing_type별 기간·마감 산출 규칙

발행 요청은 `billing_type`에 따라 입력이 다르다. 서버는 아래 규칙으로 `billing_period`(라벨)·`billing_start_date`·`billing_end_date`·`due_date`를 확정한다. 모든 날짜 계산은 `Asia/Seoul` 기준이다.

| billing_type | 요청 입력 | 기간(start~end) | due_date | billing_period 라벨 |
|---|---|---|---|---|
| MONTHLY | `billingPeriod`="2026-07" | 해당 월 1일 ~ 말일 | 기본=말일 (요청 `dueDate`로 override 가능) | "2026-07" |
| SEMESTER | `billingStartDate`,`billingEndDate`,`dueDate`,`semesterLabel` | 입력값 | 입력값 | "2026-1학기" 등 입력 라벨 |
| YEARLY | `billingPeriod`="2026" (+옵션 `dueDate`) | 1/1 ~ 12/31 | 기본=01/31 (override 가능) | "2026" |
| ONE_TIME | `name`(라벨), `billingStartDate`,`dueDate` | start=end=행사일 | 입력값 | 입력 라벨(예 "MT참가비") |

- MONTHLY의 기본 마감일이 말일인 이유: 정책에 `due_day`가 없으므로 안전한 기본값을 쓰고, 필요 시 발행 시 `dueDate`로 덮어쓴다.
- SEMESTER는 학교·운영마다 학기 경계가 다르므로 기간·마감을 항상 명시받는다. (예: 1학기 2026-03-01~2026-08-31, 마감 2026-03-31)
- 멱등 회차 식별자는 `billing_start_date`다. 따라서 같은 ONE_TIME 정책으로도 다른 행사일이면 별개 청구로 발행된다.

## 6. API 엔드포인트

경로 prefix는 기존 컨벤션을 따른다(`/api/v1`). 관리 API는 `leader/clubs/{clubId}/...`, 회원 API는 `my/...`. HTTP 상태는 프로젝트 규칙(POST 201, GET 200, PATCH/DELETE 204)을 따른다.

### 회비 정책 — `LeaderFeePolicyController` (`LeaderFeePolicyApi` 인터페이스)
- `POST   /api/v1/leader/clubs/{clubId}/fee-policies` → 201, 생성된 id
- `GET    /api/v1/leader/clubs/{clubId}/fee-policies` → 200, 목록
- `PATCH  /api/v1/leader/clubs/{clubId}/fee-policies/{policyId}` → 204 (name·amount·billing_type·active)
- `DELETE /api/v1/leader/clubs/{clubId}/fee-policies/{policyId}` → 204 (soft delete; 발행 이력 있으면 거부하고 `active=false` 유도)

### 회비 청구 — `LeaderFeeBillController` (`LeaderFeeBillApi`)
- `POST   /api/v1/leader/clubs/{clubId}/fee-policies/{policyId}/bills` → 201
  - 요청 body는 `billing_type`에 따라 5절 입력. 응답: `{ "created": <int>, "skipped": <int> }`
- `GET    /api/v1/leader/clubs/{clubId}/fee-bills` → 200
  - query: `billingPeriod`, `status`, `userId`, 페이지네이션(`page`,`size`)
- `DELETE /api/v1/leader/clubs/{clubId}/fee-bills/{billId}` → 204 (개별 취소: `CANCELLED` 전이)

### 회원 본인 — `MyFeeController` (`MyFeeApi`)
- `GET    /api/v1/my/fees` → 200
  - query: 옵션 `clubId`, `status`. `@AuthenticationPrincipal`의 `currentUser.id()` 본인 것만.

## 7. 도메인 서비스 로직

백엔드 도메인 패키지: `com.duing.domain.fee/{api,controller,service,repository,entity,exception}`. 두 애그리거트(`FeePolicy`, `FeeBill`)와 각 컨트롤러/서비스/리포지토리를 둔다. 엔티티는 `BaseEntity` 상속, `@Builder(access=PRIVATE)` + static `create(...)` 팩토리, 모든 연관관계 `LAZY`, soft delete(`@SQLDelete`/`@SQLRestriction`). 서비스는 인터페이스 + `General{Domain}Service` 구현, `@Transactional(readOnly=true)` 기본·쓰기 메서드만 오버라이드.

### FeePolicyService
- `create(CreateFeePolicyCommand)` → `Long`: `requireManager` 후 정책 저장
- `update(UpdateFeePolicyCommand)` → `void`
- `getPolicies(clubId)` → 목록 Query
- `delete(clubId, policyId)` → `void`: 발행된 `fee_bill` 존재 시 `DeleteForbidden`, 아니면 soft delete

### FeeBillService — 핵심: `generateBills`
`generateBills(GenerateBillsCommand)` → `GenerateBillsResult(created, skipped)`:
1. `clubAuthService.requireManager(actorId, clubId)`
2. 정책 조회 → `club_id` 일치·`active=true` 검증 (`Inactive` 시 409)
3. `billing_type` ↔ 입력 검증, 5절 규칙으로 `billing_period`·`start`·`end`·`due_date` 확정 (`InvalidBillingPeriod` 시 400)
4. 활성 회원 조회: `ClubMember where club_id=:clubId and deleted_at IS NULL` → `user_id` 집합
5. 같은 `(fee_policy_id, billing_start_date)`로 이미 발행된(취소 아님) `user_id` 집합을 조회해 제외 → 신규 대상만 `fee_bill` **bulk insert** (정책 `amount` 스냅샷, `status='PENDING'`)
6. 반환 `{ created: 신규건수, skipped: 기존건수 }`. 동시 호출의 최종 방어선은 `uk_fee_bill_idem` 유니크 제약(충돌 시 해당 건 skip 처리)

기타:
- `cancelBill(clubId, billId)` → `void`: `requireManager` 후 `status='CANCELLED'` 전이(이미 `CANCELLED`면 멱등 no-op)
- `getBills(clubId, BillSearchQuery, pageable)`: QueryDSL `BooleanExpression` 동적 필터(`billingPeriod`/`status`/`userId`)
- `getMyFees(userId, MyFeeSearchQuery)`: `user_id` 기준, 옵션 `clubId`/`status` 필터

DTO 2계층: `controller/dto/{request,response}`(HTTP 경계, `@Valid`/한국어 메시지) + `service/dto/{command,query}`(서비스 경계). 변환: Request→`toCommand()`, Query→`Response.from()`.

## 8. 권한 · 예외

- 관리 컨트롤러: 클래스 `@PreAuthorize("isAuthenticated()")`, 서비스 진입부에서 `clubAuthService.requireManager(actorId, clubId)`(LEADER·OFFICER 허용). LEADER 전용 작업 없음.
- `/my/fees`: `@PreAuthorize("isAuthenticated()")` + `currentUser.id()`로 본인 데이터 한정.
- 예외(`ApplicationException` 상속, `{Domain}Exception` 부모 + static final inner):
  - `FeePolicyException`: `NotFound`(404), `ClubMismatch`(403), `Inactive`(409), `DeleteForbidden`(409, 발행 이력 존재)
  - `FeeBillException`: `NotFound`(404), `ClubMismatch`(403), `InvalidBillingPeriod`(400)
- 권한 실패는 `ClubAuthService`의 `AccessDeniedException`(403)으로 일관 처리(전역 핸들러).

## 9. 프론트엔드

위치(기존 영역 재사용): `/admin`=글로벌 ADMIN, **`/manage`=클럽 회장·총무**, `/me`=회원.

### 총무 관리 — `/manage/clubs/[clubId]/fees` (2탭)
- 서버 컴포넌트 `page.tsx` → 클라이언트 `_pages/ClubFeesPage.tsx`(탭) → `_containers/` → `_components/` + `_lib/`
- **[정책] 탭**: 정책 목록(테이블/카드) + "정책 추가" 다이얼로그(`name`·`amount`·`billing_type`) + 수정·활성 토글
- **[청구] 탭**: "청구 발행" 다이얼로그(정책 선택 → MONTHLY는 회차만, SEMESTER/YEARLY/ONE_TIME은 기간·마감·라벨 입력) + 청구 현황 테이블(회차·상태·회원 필터, 행별 취소)

### 회원 — `/me/fees`
- 본인 청구 목록(동아리별 그룹), 상태 뱃지(`PENDING`=납부대기 등), 금액 원 포맷

### 공통 배선 (pnpm workspaces)
- `packages/types/src/fee.ts`: `FeePolicy`, `FeeBill`, `BillingType`, `FeeStatus`, 검색 파라미터/`PageResponse` 타입 (`export type`, no `any`)
- `packages/api/src/client.ts`: `leader.fees.*`(정책/청구/발행/취소/현황) + `my.fees.list()` 네임스페이스 추가
- `packages/hooks/src/fee.ts` + `feeQueryKeys.ts`: `useClubFeePoliciesQuery`, `useGenerateBillsMutation`, `useClubFeeBillsQuery`, `useCancelBillMutation`, `useMyFeesQuery` 등 + 무효화 로직
- `packages/schemas`: 정책 생성/수정·청구 발행 입력 Zod 스키마(React Hook Form 연동)
- UI: shadcn/ui 컴포넌트 + `cn()`, 라우팅은 `toRoute()`/`toLinkRoute()`

## 10. 테스트 전략

### 백엔드 (RestAssured + TestContainers + Fixture Monkey, `@DisplayName`은 요구사항 문장)
- 청구 발행 멱등성: 두 번 호출 시 `created`/`skipped`가 정확하다
- 활성 회원만 청구된다(soft-deleted 멤버 제외)
- 금액 스냅샷: 정책 금액을 바꿔도 기존 청구액은 불변이다
- billing_type별 기간·마감 산출: MONTHLY 자동(말일), SEMESTER/YEARLY/ONE_TIME 명시값, `dueDate` override
- 취소: `CANCELLED` 전이 후 같은 회원·회차 재발행이 가능하다
- 권한: 일반 MEMBER가 발행/조회 시 403, `/my/fees`는 본인 것만 반환된다
- 비활성 정책으로 청구 시 409, 발행 이력 있는 정책 삭제 시 409
- 잘못된 `billing_type`/회차 입력 시 400

### 프론트 (Vitest + React Testing Library, 기존 `test/` 패턴)
- `_lib` 단위: 상태 뱃지 라벨, 금액 원 포맷, billing_type 라벨/입력 분기
- 발행 다이얼로그 입력 검증(Zod), 빈 상태, 권한/탭 노출

## 11. 빌드 순서 (1PR = 1단위)

백엔드 API 단위로 먼저 머지한 뒤 프론트 페이지 단위 PR을 올린다. 모든 브랜치는 `develop`에서 분기·`develop`으로 PR.

1. `feat(backend)`: V60 마이그레이션 + `fee` 도메인 엔티티/리포지토리 골격
2. `feat(backend)`: 회비 정책 CRUD API (+테스트)
3. `feat(backend)`: 회비 청구 발행·취소 API (멱등 로직, +테스트)
4. `feat(backend)`: 청구 현황 조회 API + `/my/fees` (+테스트)
5. `feat(frontend)`: `packages` 배선(types/api/hooks/schemas)
6. `feat(frontend)`: `/manage/clubs/[clubId]/fees` 정책 탭
7. `feat(frontend)`: 청구 탭(발행·현황·취소)
8. `feat(frontend)`: `/me/fees`

## 12. 이후 스프린트 / v2 매핑 (참고)

본 설계는 v2 개선안의 다음 항목을 의도적으로 이후로 미뤘다. 스키마는 이를 막지 않도록 잡았다(상태값 5종 선반영, 금액 스냅샷, 청구 기간 컬럼).

- **Sprint 2**: `payment`(bill_id·amount·payment_method·match_type·paid_at) 테이블, 수동 납부 체크 → `PAID`/`PARTIAL_PAID` 전이, 미납 연체 크론(`PENDING`→`OVERDUE`), 알림(인앱 `Notification`/이메일 Resend 재사용) + `notification_log`, 집계 대시보드
- **Sprint 3**: `bank_account`, `member_payment_code`, `bank_transaction`(`raw_payload jsonb` 포함), BANK API 폴링 배치, 1~4차 자동매칭(입금코드 → 회원명+금액 → 회원명+최근미납 → 검토 큐)
- **Sprint 4**: 관리자 검토 큐(`review_status`/`reviewed_by`/`reviewed_at`/`review_note`), 자동 영수증, 운영 안정화
- **운영 원칙**: 목표는 "100% 자동 매칭"이 아니라 "총무 업무 최소화" — 자동매칭 실패 시에도 후보 추천 + 원클릭 승인 UX를 지향한다.
- **향후 확장**: 출석 연동 할인, 포인트 차감, 행사 참가비, 회계 장부, 예산, 가상계좌/자동이체/카드결제, AI 총무 리포트
