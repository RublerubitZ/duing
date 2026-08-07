# 운영진 회비 감사(Admin Fee Audit) 구현 계획 — P1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 총동연(ADMIN)이 전 동아리 회비 운영을 읽기 전용으로 감사하는 콘솔 — 계측(감사 이벤트) + 조회 API 13개 + 이상징후 + 감사 의견/메모 + FE 콘솔 2페이지.

**Architecture:** 스펙 SoT: [`docs/superpowers/specs/2026-08-04-admin-fee-audit-design.md`](../specs/2026-08-04-admin-fee-audit-design.md) (설계 확정본). `club_audit_event` V105 확장으로 회비 이벤트 15종 계측 → `/api/v1/admin/fees/**` 조회 API(기존 fee 서비스는 `requireManager` 내장이라 재사용 불가, 리포지토리·DTO 레벨만 재사용) → FE `/admin/fees` 콘솔. **이 계획은 P1(PR-1~5)만 다룬다** — P2(CSV·anomaly 배치)·P3(증빙)는 별도 계획.

**Tech Stack:** Spring Boot 3.4 / Java 21 / QueryDSL / Flyway(V105·V106) / RestAssured+TestContainers · Next.js 15 / React Query / ky / vitest+RTL

## Global Constraints

- 커밋: Conventional Commits 한국어(`feat(backend): …`), **Co-Authored-By/🤖 Generated 라인 절대 금지**. 구현 워커는 **push·PR 생성 금지** — 커밋까지만.
- 브랜치는 develop에서 분기. PR 순서: PR-1 → PR-2 → PR-3 → PR-4 → PR-5 (BE 먼저).
- Api 인터페이스(`api/*Api.java`)에만 매핑·Swagger 어노테이션, 컨트롤러는 `@RequestMapping("/api/v1")` + `@PreAuthorize("hasRole('ADMIN')")`. 모든 경로는 `/admin/` 하위(URL 레이어 백스톱 `SecurityConfig.java:97`).
- admin 서비스에서 `clubAuthService.requireManager` **호출 금지** (선례: `GeneralAdminApplicationQueryService` 클래스 주석).
- 감사 이벤트를 INSERT하는 조회 메서드는 클래스 `@Transactional(readOnly = true)` 위에 메서드 `@Transactional` 오버라이드 (readOnly에서 INSERT는 실 PG 500).
- DTO는 record + static `from()`. 변수명 모호 축약 금지(`dto`/`res` 등).
- 시각: 주입 `Clock`(seoulClock 빈) 사용. **존 이중 체제 주의** — `BaseEntity.created_at`은 JVM 존 벽시계(prod=UTC), `payment.paid_at`·`bank_transaction.transaction_at`은 KST 벽시계(`LocalDateTime.now(clock)`). Instant 변환: created_at → `ZoneId.systemDefault()`, paid_at → `Asia/Seoul`. 기간(from/to, KST 날짜) 경계 변환은 Task 4의 `AdminFeePeriod`가 전담한다.
- detail JSONB·evidence에 **PII 금지** — id·숫자·enum만 (이름·전화·계좌번호 저장 금지).
- 테스트 날짜는 전부 **상대값** (`LocalDate.now(clock).plusDays(7)` 등) — 하드코딩 미래 절대날짜 금지.
- 빌드/테스트 cwd: BE는 `backend/`에서 `./gradlew test`, FE는 `frontend/`에서 `pnpm test`·`pnpm typecheck`. 출력 확인 시 `| tail` 금지(exit code 가림) — 전체 출력에서 BUILD SUCCESSFUL / 통과 수 확인.
- V105·V106은 out-of-order 금지 — 머지 직전 develop에서 최신 번호 재확인. 신규 테이블(V106)은 `ENABLE ROW LEVEL SECURITY` 필수(`RowLevelSecurityMigrationTest`가 강제).
- FE: 검색어는 URL에 싣지 않음(기간 프리셋·필터·페이지는 URL 동기화 가능), 목록 훅은 `placeholderData: keepPreviousData`, 3단 배선(types → client.ts 선언부+구현부 → hooks+adminQueryKeys+barrel), `cleanParams`는 배열을 같은 키 반복으로 직렬화.
- 네이티브 `confirm`/`alert`/`prompt` 금지 — 토스트는 `useToast().addToast`.

---

## PR-1 — 감사 이벤트 계측 (브랜치 `feat/admin-fee-audit-instrumentation`)

### Task 1: V105 마이그레이션 + ClubAuditEventType 15종 + ClubAuditEvent 확장

**Files:**
- Create: `backend/src/main/resources/db/migration/V105__club_audit_event_fee_events.sql`
- Create: `backend/src/main/java/com/duing/domain/clubaudit/support/AuditDetailJson.java`
- Modify: `backend/src/main/java/com/duing/domain/clubaudit/entity/ClubAuditEventType.java`
- Modify: `backend/src/main/java/com/duing/domain/clubaudit/entity/ClubAuditEvent.java`
- Test: `backend/src/test/java/com/duing/domain/clubaudit/ClubAuditEventFeeTypesTest.java`

**Interfaces:**
- Consumes: 기존 `ClubAuditEvent`(빌더 private, 정적 팩토리만), `ClubAuditEventRepository`(JpaRepository).
- Produces: 이벤트 타입 15종, 팩토리 6개(아래 시그니처 — Task 2·3·5가 그대로 호출), `AuditDetailJson.of(Map<String, Object>)`.

- [ ] **Step 1: V105 SQL 작성** — 작성 전 `ls backend/src/main/resources/db/migration/ | sort -V | tail -3` 으로 V104가 최신인지 재확인.

```sql
-- 회비 감사 계측(스펙 §3.1·§4): 회비 참조 4종·변경 스냅샷 컬럼 추가, FEE_* 이벤트 15종 등록.
-- 신규 테이블을 만들지 않는다 — club_audit_event 는 범용 감사 스트림(V102)이며 V104 선례를 따른다.
--
-- 참조 컬럼: 대상 전부 soft delete 라 FK 가 이벤트 보존을 막지 않는다(V104 application_id 와 같은 전제).
-- detail: 변경 전/후 스냅샷(JSONB). id·숫자·enum 만 담고 이름·전화번호·계좌번호는 저장 금지(스펙 §9).
ALTER TABLE club_audit_event ADD COLUMN fee_policy_id BIGINT REFERENCES fee_policy (id);
ALTER TABLE club_audit_event ADD COLUMN fee_bill_id BIGINT REFERENCES fee_bill (id);
ALTER TABLE club_audit_event ADD COLUMN payment_id BIGINT REFERENCES payment (id);
ALTER TABLE club_audit_event ADD COLUMN bank_transaction_id BIGINT REFERENCES bank_transaction (id);
ALTER TABLE club_audit_event ADD COLUMN detail JSONB;

-- 이벤트 종류를 늘릴 때는 CHECK 도 함께 갱신해야 한다(V102 말미 절차 주석, V104 선례).
ALTER TABLE club_audit_event DROP CONSTRAINT club_audit_event_event_type_check;
ALTER TABLE club_audit_event ADD CONSTRAINT club_audit_event_event_type_check CHECK (event_type IN (
    'JOIN_LINK_CREATED', 'JOIN_LINK_REGENERATED', 'JOIN_LINK_REVOKED',
    'JOIN_REQUEST_CREATED', 'JOIN_REQUEST_APPROVED', 'JOIN_REQUEST_REJECTED',
    'RECRUITMENT_FORCE_CLOSED', 'APPLICATION_VIEWED',
    'FEE_POLICY_CREATED', 'FEE_POLICY_UPDATED', 'FEE_POLICY_DELETED',
    'FEE_BILL_ISSUED', 'FEE_BILL_CANCELLED',
    'FEE_PAYMENT_RECORDED', 'FEE_PAYMENT_VOIDED',
    'FEE_TX_MANUAL_MATCHED', 'FEE_TX_IGNORED', 'FEE_TX_UNMATCHED',
    'FEE_ACCOUNT_REGISTERED', 'FEE_ACCOUNT_UPDATED', 'FEE_ACCOUNT_DELETED',
    'FEE_ADMIN_DETAIL_VIEWED', 'FEE_ADMIN_CSV_DOWNLOADED'));

-- 회비 감사 로그 조회(club + 타입 필터 + 기간)용. 기존 (club_id, created_at) 인덱스는 타입 필터에 비효율.
CREATE INDEX idx_club_audit_event_club_type ON club_audit_event (club_id, event_type, created_at);
-- 관리자 목록 '최근 거래일' max 용(스펙 §10 — 기존엔 club_id+status 뿐).
CREATE INDEX idx_bank_tx_club_at ON bank_transaction (club_id, transaction_at);
```

`FEE_ADMIN_CSV_DOWNLOADED`는 P2에서 쓰지만 CHECK 재작성을 두 번 하지 않도록 지금 등록한다(코드 enum에도 함께 추가 — 미사용 값 존재는 무해).

- [ ] **Step 2: `ClubAuditEventType`에 15종 추가** — 기존 8종 뒤에 이어붙인다(각 값에 기존 스타일대로 한 줄 Javadoc):

```java
    /** 운영진이 회비 정책을 만들었다. */
    FEE_POLICY_CREATED,
    /** 운영진이 회비 정책을 수정했다 — detail 에 금액 old/new 와 변경 필드 목록이 남는다. */
    FEE_POLICY_UPDATED,
    FEE_POLICY_DELETED,
    /** 운영진이 청구를 일괄 발행했다 — 발행 액션 1회당 1건, detail 에 발행 건수·회차가 남는다. 자동 발행 잡은 계측하지 않는다(스펙 §15 결정 4). */
    FEE_BILL_ISSUED,
    FEE_BILL_CANCELLED,
    /** 납부가 기록됐다 — 수기 기록과 BANK 매칭 생성 모두 포함, detail.autoMatched 로 구분한다. */
    FEE_PAYMENT_RECORDED,
    /** 납부가 정정(VOID)됐다 — 운영진 직접 정정과 매칭취소(unmatch) 경유 모두 포함, reason 에 정정 사유가 남는다. */
    FEE_PAYMENT_VOIDED,
    FEE_TX_MANUAL_MATCHED,
    FEE_TX_IGNORED,
    /** 매칭이 취소됐다 — 같은 트랜잭션에 FEE_PAYMENT_VOIDED 가 함께 남는다(엔티티 직접 void 경로라 별도 기록, 스펙 §4). */
    FEE_TX_UNMATCHED,
    FEE_ACCOUNT_REGISTERED,
    FEE_ACCOUNT_UPDATED,
    FEE_ACCOUNT_DELETED,
    /** 총동연이 회비 감사 상세에 진입했다 — 열람 감사(상세 진입 1회 = 1건, 스펙 §15 결정 5). */
    FEE_ADMIN_DETAIL_VIEWED,
    /** 총동연이 회비 CSV 를 내려받았다(P2 예정 — CHECK 재작성을 아끼려 미리 등록). */
    FEE_ADMIN_CSV_DOWNLOADED
```

enum 상단 Javadoc의 "가입 링크 6종과 총동연 조치 2종" 문구도 "…과 회비 15종(V105)"으로 갱신.

- [ ] **Step 3: `ClubAuditEvent` 필드·팩토리 추가** — 필드 4개 + detail(BankTransaction.rawPayload와 같은 `@JdbcTypeCode(SqlTypes.JSON)` 방식), 빌더 파라미터 확장, 팩토리 6개:

```java
    /** 회비 참조(V105) — 회비 이벤트에서만 채워진다. 다른 참조와 같이 raw id 로만 보유한다. */
    @Column(name = "fee_policy_id")
    private Long feePolicyId;

    @Column(name = "fee_bill_id")
    private Long feeBillId;

    @Column(name = "payment_id")
    private Long paymentId;

    @Column(name = "bank_transaction_id")
    private Long bankTransactionId;

    /** 변경 전/후 스냅샷(V105) — id·숫자·enum 만 담는다. PII(이름·전화·계좌번호) 저장 금지(스펙 §9). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "detail", columnDefinition = "jsonb")
    private String detail;
```

```java
    public static ClubAuditEvent feePolicy(ClubAuditEventType eventType, Long clubId,
                                           Long feePolicyId, Long actorUserId, String detail) {
        return ClubAuditEvent.builder()
                .clubId(clubId).eventType(eventType).actorUserId(actorUserId)
                .feePolicyId(feePolicyId).detail(detail)
                .build();
    }

    public static ClubAuditEvent feeBill(ClubAuditEventType eventType, Long clubId, Long feePolicyId,
                                         Long feeBillId, Long actorUserId, String detail) {
        return ClubAuditEvent.builder()
                .clubId(clubId).eventType(eventType).actorUserId(actorUserId)
                .feePolicyId(feePolicyId).feeBillId(feeBillId).detail(detail)
                .build();
    }

    /** 납부 기록·정정 — reason 은 정정 사유(voidReason)에만 채워진다. */
    public static ClubAuditEvent feePayment(ClubAuditEventType eventType, Long clubId, Long feeBillId,
                                            Long paymentId, Long bankTransactionId, Long actorUserId,
                                            String reason, String detail) {
        return ClubAuditEvent.builder()
                .clubId(clubId).eventType(eventType).actorUserId(actorUserId)
                .feeBillId(feeBillId).paymentId(paymentId).bankTransactionId(bankTransactionId)
                .reason(reason).detail(detail)
                .build();
    }

    public static ClubAuditEvent feeTransaction(ClubAuditEventType eventType, Long clubId,
                                                Long bankTransactionId, Long feeBillId, Long actorUserId) {
        return ClubAuditEvent.builder()
                .clubId(clubId).eventType(eventType).actorUserId(actorUserId)
                .bankTransactionId(bankTransactionId).feeBillId(feeBillId)
                .build();
    }

    /** 계좌 등록·변경·삭제 — 계좌번호는 detail 에도 절대 싣지 않는다(은행 코드만). */
    public static ClubAuditEvent feeAccount(ClubAuditEventType eventType, Long clubId,
                                            Long actorUserId, String detail) {
        return ClubAuditEvent.builder()
                .clubId(clubId).eventType(eventType).actorUserId(actorUserId).detail(detail)
                .build();
    }

    /** 총동연 회비 감사 상세 열람 — 개인정보성 재무 데이터 열람 이력이라 진입마다 한 건씩 남는다. */
    public static ClubAuditEvent feeAdminView(Long clubId, Long actorUserId) {
        return ClubAuditEvent.builder()
                .clubId(clubId).eventType(ClubAuditEventType.FEE_ADMIN_DETAIL_VIEWED)
                .actorUserId(actorUserId)
                .build();
    }
```

- [ ] **Step 4: `AuditDetailJson` 작성**

```java
package com.duing.domain.clubaudit.support;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;

/**
 * 감사 detail JSONB 직렬화. 감사 기록은 변이와 같은 트랜잭션이라(스펙 §4) 직렬화 실패를 삼키지 않고
 * 예외로 올려 변이째 롤백시킨다 — 감사 없는 변이를 허용하지 않는다.
 */
public final class AuditDetailJson {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private AuditDetailJson() {
    }

    public static String of(Map<String, Object> detail) {
        try {
            return MAPPER.writeValueAsString(detail);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("감사 detail 직렬화 실패", exception);
        }
    }
}
```

- [ ] **Step 5: 정합 테스트 작성** — 신규 타입이 DDL CHECK와 어긋나면 INSERT가 터지므로, 15종 전부를 실제로 저장해 본다:

```java
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ClubAuditEventFeeTypesTest extends IntegrationTestBase {

    @Autowired ClubAuditEventRepository clubAuditEventRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;

    @Test
    @DisplayName("회비 이벤트 15종 전부가 event_type CHECK 를 통과해 저장된다 — enum·DDL 정합 가드")
    void allFeeEventTypesPassCheckConstraint() {
        User actor = userRepository.save(UserFixture.unique());
        Club club = clubRepository.save(ClubFixture.academic("감사대상"));

        // 참조 id 는 FK 라 실존 행이 필요하므로 null 로 저장한다(컬럼 전부 nullable) —
        // 이 테스트의 목적은 CHECK 정합뿐이고 참조 채움은 Task 2·3 계측 테스트가 검증한다.
        for (ClubAuditEventType type : ClubAuditEventType.values()) {
            if (!type.name().startsWith("FEE_")) continue;
            clubAuditEventRepository.save(ClubAuditEvent.feeAccount(
                    type, club.getId(), actor.getId(),
                    AuditDetailJson.of(Map.of("probe", type.name()))));
        }
        long feeEventCount = clubAuditEventRepository.findAll().stream()
                .filter(event -> event.getEventType().name().startsWith("FEE_")).count();
        assertThat(feeEventCount).isEqualTo(15);
    }
}
```

주의: `feeAccount` 팩토리는 타입을 받으므로 정합 프로브로 재사용 가능하다. `IntegrationTestBase`·`UserFixture`·`ClubFixture`는 기존 테스트(`AdminRecruitmentForceCloseTest`)와 같은 import를 쓴다.

- [ ] **Step 6: 실행·검증** — `backend/`에서 `./gradlew test --tests ClubAuditEventFeeTypesTest --tests RowLevelSecurityMigrationTest`. 기대: 둘 다 PASS(BUILD SUCCESSFUL 확인 — V105는 기존 테이블 변경이라 RLS 영향 없음이 함께 확인된다).

- [ ] **Step 7: 커밋** — `feat(backend): club_audit_event 회비 이벤트 확장 — V105 참조 4종·detail JSONB·타입 15종`

### Task 2: 정책·청구·계좌 변이 계측

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/fee/service/GeneralFeePolicyService.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/service/GeneralFeeBillService.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/service/GeneralFeeAccountService.java`
- Test: `backend/src/test/java/com/duing/domain/fee/FeeAuditInstrumentationTest.java`

**Interfaces:**
- Consumes: Task 1의 팩토리 `feePolicy(...)`, `feeBill(...)`, `feeAccount(...)`, `AuditDetailJson.of(...)`.
- Produces: 없음(기존 API 동작 불변 — 감사 행만 추가).

- [ ] **Step 1: 세 서비스에 `ClubAuditEventRepository` 주입 추가** — 각 클래스의 `private final` 필드 블록에 `private final ClubAuditEventRepository clubAuditEventRepository;` 한 줄. `@RequiredArgsConstructor`라 생성자 수정 불요.

- [ ] **Step 2: `GeneralFeePolicyService` 계측** — 각 메서드의 **기존 로직 맨 끝**(변이 확정 후, 같은 트랜잭션)에 삽입. `create`는 현재 `return feePolicyRepository.save(policy).getId();` 한 줄이므로 **save 결과를 지역변수로 분리**한 뒤 기록하고 반환한다:

```java
        FeePolicy savedPolicy = feePolicyRepository.save(policy);
        clubAuditEventRepository.save(ClubAuditEvent.feePolicy(
                ClubAuditEventType.FEE_POLICY_CREATED, command.clubId(), savedPolicy.getId(),
                command.actorId(), AuditDetailJson.of(Map.of(
                        "amount", savedPolicy.getAmount(),
                        "billingType", savedPolicy.getBillingType().name(),
                        "targetType", savedPolicy.getTargetType().name()))));
        return savedPolicy.getId();
```

`update`는 변경 적용 **직전에** old 금액을 캡처해 diff를 남긴다:

```java
        long oldAmount = policy.getAmount();
        boolean wasActive = policy.isActive();
        // ... 기존 변경 적용 로직 그대로 ...
        Map<String, Object> auditDetail = new LinkedHashMap<>();
        if (oldAmount != policy.getAmount()) {
            auditDetail.put("amount", Map.of("old", oldAmount, "new", policy.getAmount()));
        }
        if (wasActive != policy.isActive()) {
            auditDetail.put("active", Map.of("old", wasActive, "new", policy.isActive()));
        }
        clubAuditEventRepository.save(ClubAuditEvent.feePolicy(
                ClubAuditEventType.FEE_POLICY_UPDATED, command.clubId(), policy.getId(),
                command.actorId(), AuditDetailJson.of(auditDetail)));
```

`delete`는 `FEE_POLICY_DELETED`, detail 없이(`null`) policyId·actorId만. 주의: command record의 실제 접근자명(`clubId()`/`actorId()`)은 파일을 열어 기존 사용부와 맞춘다 — `delete(Long clubId, Long actorId, Long policyId)`처럼 개별 파라미터인 메서드는 그 파라미터를 그대로 쓴다.

- [ ] **Step 3: `GeneralFeeBillService` 계측** — `generate`는 `generateForAllMembers`/`generateForSelectedMembers`로 분기해 각각 return하므로 "메서드 끝" 삽입 지점이 없다. 두 경로가 **이미 공유하는 `publishIssuedEventIfAny(clubId, policyId, resolved, created)`**(`GeneralFeeBillService.java:124~`, created>0 가드 내장)에 `Long actorId` 파라미터를 추가하고 그 안에서 기록한다(호출부 2곳도 actorId 전달로 수정). `GenerateBillsResult`의 발행 건수 필드는 **`created`**다:

```java
        // publishIssuedEventIfAny 내부 — 기존 created > 0 가드 안에 추가. 발행 1회 = 1건.
        clubAuditEventRepository.save(ClubAuditEvent.feeBill(
                ClubAuditEventType.FEE_BILL_ISSUED, clubId, policyId, null, actorId,
                AuditDetailJson.of(Map.of(
                        "issuedCount", created,
                        "billingPeriod", resolved.billingPeriod()))));
```

`cancel`은 이미 CANCELLED면 멱등 no-op(`GeneralFeeBillService.java:181` 부근)이고 기존 지역변수 `FeeStatus previous`가 있다 — **실제 전이 시에만** 기록:

```java
        // cancel — previous 는 기존 지역변수(L180). 멱등 재호출은 기록하지 않는다.
        if (previous != FeeStatus.CANCELLED) {
            clubAuditEventRepository.save(ClubAuditEvent.feeBill(
                    ClubAuditEventType.FEE_BILL_CANCELLED, clubId, bill.getFeePolicyId(), bill.getId(),
                    actorId, AuditDetailJson.of(Map.of(
                            "amount", bill.getAmount(), "statusBefore", previous.name()))));
        }
```

**`autoIssueMonthly`는 건드리지 않는다** — 시스템 잡 미계측(스펙 §15 결정 4), actor가 없어 저장 자체가 불가하다. `publishIssuedEventIfAny`에 actorId를 추가하면 `autoIssueMonthly` 호출 경로가 있는지 확인 — 있다면 그 경로는 `actorId=null`로 넘겨 **null이면 기록 생략** 분기를 가드 안에 둔다.

- [ ] **Step 4: `GeneralFeeAccountService` 계측** — `upsert`는 `findByClubId().map(...).orElseGet(...)` 람다 분기라 한 줄 삽입이 안 된다. 람다 진입 **전에** `boolean existing = feeAccountRepository.existsByClubId(command.clubId());`(기존 메서드 실존)로 선판정하고, 기존 return 직전에 기록. `delete`는 `FEE_ACCOUNT_DELETED`. detail은 은행 코드만:

```java
        boolean existing = feeAccountRepository.existsByClubId(command.clubId());
        // ... 기존 upsert 분기 로직 그대로 ...
        clubAuditEventRepository.save(ClubAuditEvent.feeAccount(
                existing ? ClubAuditEventType.FEE_ACCOUNT_UPDATED : ClubAuditEventType.FEE_ACCOUNT_REGISTERED,
                command.clubId(), command.actorId(),
                AuditDetailJson.of(Map.of("bank", command.bank().name()))));
```

- [ ] **Step 5: 계측 테스트 작성** — 기존 운영진 API를 RestAssured로 호출하고 감사 행을 단언한다. 셋업은 `AdminRecruitmentForceCloseTest` 패턴(leader 토큰, `ClubMember.asLeader`). 핵심 케이스 5개(각각 독립 `@Test`):
  1. `POST /leader/clubs/{clubId}/fee-policies` → `FEE_POLICY_CREATED` 1건, `feePolicyId`=응답 id, `actorUserId`=leader, detail에 `"amount"` 포함.
  2. `PATCH .../fee-policies/{policyId}` 금액 10000→30000 → `FEE_POLICY_UPDATED`, detail JSON을 ObjectMapper로 파싱해 `amount.old=10000, amount.new=30000` 단언.
  3. `POST .../fee-policies/{policyId}/bills` (회원 2명) → `FEE_BILL_ISSUED` **정확히 1건**(청구당 1건 아님), detail `issuedCount=2`. 같은 발행 재호출(멱등, created=0) → 이벤트 여전히 1건.
  3-1. `DELETE .../fee-bills/{billId}` 재호출(멱등) → `FEE_BILL_CANCELLED` 여전히 1건.
  4. `DELETE .../fee-bills/{billId}` → `FEE_BILL_CANCELLED`, `feeBillId` 채움, detail `statusBefore="PENDING"`.
  5. `PUT .../fee-account` 최초 → `FEE_ACCOUNT_REGISTERED`; 같은 요청 재호출(계좌 변경) → `FEE_ACCOUNT_UPDATED`; `DELETE` → `FEE_ACCOUNT_DELETED`. **detail 문자열에 계좌번호 원문이 포함되지 않음을 단언**(`assertThat(event.getDetail()).doesNotContain(계좌번호)`).

- [ ] **Step 6: 실행** — `backend/`에서 `./gradlew test --tests FeeAuditInstrumentationTest` → PASS 확인 후 기존 회귀: `./gradlew test --tests '*FeePolicy*' --tests '*FeeBill*' --tests '*FeeAccount*'` → PASS.

- [ ] **Step 7: 커밋** — `feat(backend): 회비 정책·청구·계좌 변이 감사 계측 — 발행 1회 1건·시스템 잡 제외`

### Task 3: 납부·매칭 변이 계측

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/fee/service/GeneralPaymentService.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/service/GeneralMatchedPaymentService.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/service/GeneralBankTransactionReviewService.java`
- Test: `backend/src/test/java/com/duing/domain/fee/FeePaymentAuditInstrumentationTest.java`

**Interfaces:**
- Consumes: Task 1의 `feePayment(...)`, `feeTransaction(...)`.
- Produces: 없음(동작 불변).

- [ ] **Step 1: `GeneralPaymentService` 계측** — `record` 끝(수기 납부, `bankTransactionId=null`, detail `{"amount": …, "method": …, "autoMatched": false}`), `voidPayment` 끝(멱등 no-op 경로 — 이미 VOIDED — 에서는 **기록하지 않는다**, 실제 전이 시에만):

```java
        // voidPayment — 실제 VOID 전이가 일어난 경우에만(멱등 no-op 는 이미 기록된 이력이 있다).
        clubAuditEventRepository.save(ClubAuditEvent.feePayment(
                ClubAuditEventType.FEE_PAYMENT_VOIDED, command.clubId(), payment.getFeeBillId(),
                payment.getId(), payment.getBankTransactionId(), command.actorId(),
                command.reason(), AuditDetailJson.of(Map.of("amount", payment.getAmount()))));
```

기존 `voidPayment`가 멱등 no-op을 어떻게 처리하는지(`Payment.voidPayment` 내부 no-op) 확인 — 서비스에서 전이 여부를 알 수 없으면 호출 전 `payment.getStatus() == PaymentStatus.ACTIVE`를 캡처해 분기한다.

- [ ] **Step 2: `GeneralMatchedPaymentService.createMatchedPayment` 계측** — 납부 생성 확정 후. 자동 매칭 경로(`GeneralTransactionMatcher`, sync 트리거 운영진이 actor)와 수동 승인 경로가 모두 이 메서드를 타므로 `FEE_PAYMENT_RECORDED`는 여기 한 곳이면 두 경로가 커버된다:

```java
        clubAuditEventRepository.save(ClubAuditEvent.feePayment(
                ClubAuditEventType.FEE_PAYMENT_RECORDED, tx.getClubId(), feeBillId,
                savedPayment.getId(), tx.getId(), actorId, null,
                AuditDetailJson.of(Map.of("amount", tx.getAmount(), "autoMatched", autoMatched))));
```

- [ ] **Step 3: `GeneralBankTransactionReviewService` 계측** — `approve` 끝에 `FEE_TX_MANUAL_MATCHED`(feeTransaction 팩토리), `ignore` 끝에 `FEE_TX_IGNORED`(feeBillId=null), `unmatch`의 기존 `log.info` 직전에 **2건 동시 기록**(스펙 §4 — unmatch는 `payment.voidPayment` 엔티티 직접 호출이라 서비스 계측이 안 탄다):

```java
        clubAuditEventRepository.save(ClubAuditEvent.feeTransaction(
                ClubAuditEventType.FEE_TX_UNMATCHED, clubId, txId, bill.getId(), actorId));
        clubAuditEventRepository.save(ClubAuditEvent.feePayment(
                ClubAuditEventType.FEE_PAYMENT_VOIDED, clubId, bill.getId(), payment.getId(),
                txId, actorId, UNMATCH_REASON, AuditDetailJson.of(Map.of("amount", payment.getAmount()))));
```

unmatch의 멱등 no-op 경로(동시 정정으로 이미 VOIDED → `MatchedPaymentNotFoundException`)는 예외로 빠지므로 이중 기록 위험 없음.

- [ ] **Step 4: 테스트 작성** — `FeePaymentAuditInstrumentationTest`, 케이스 5개:
  1. 수기 납부 기록 → `FEE_PAYMENT_RECORDED` 1건, `bankTransactionId=null`, detail `autoMatched=false`.
  2. 납부 정정 → `FEE_PAYMENT_VOIDED`, `reason` = 요청 사유. **같은 정정 재호출(멱등) → VOIDED 이벤트가 여전히 1건**.
  3. 수동 매칭 승인(approve) → `FEE_TX_MANUAL_MATCHED` + `FEE_PAYMENT_RECORDED` 각 1건(같은 tx).
  4. 매칭 취소(unmatch) → `FEE_TX_UNMATCHED` + `FEE_PAYMENT_VOIDED` 각 1건, VOIDED의 `reason="매칭취소"`.
  5. ignore → `FEE_TX_IGNORED` 1건, `feeBillId=null`.
  BankTransaction 픽스처는 기존 매칭 테스트(`GeneralBankTransactionReviewService` 관련 기존 테스트 파일)의 저장 방식을 그대로 복사한다(`BankTransaction.ingest(...)` + save).

- [ ] **Step 5: 실행** — `./gradlew test --tests FeePaymentAuditInstrumentationTest --tests '*BankTransaction*' --tests '*Payment*'` → PASS.

- [ ] **Step 6: 커밋** — `feat(backend): 납부·매칭 변이 감사 계측 — unmatch 이중 이벤트·멱등 경로 미기록`

---

## PR-2 — 관리자 조회 API (브랜치 `feat/admin-fee-audit-query-api`)

### Task 4: 기간 헬퍼 + 목록·대시보드·상세 KPI

**Files:**
- Create: `backend/src/main/java/com/duing/domain/fee/service/dto/query/AdminFeePeriod.java`
- Create: `backend/src/main/java/com/duing/domain/fee/service/dto/query/AdminFeeClubRow.java`
- Create: `backend/src/main/java/com/duing/domain/fee/service/dto/query/AdminFeeClubSort.java`
- Create: `backend/src/main/java/com/duing/domain/fee/service/dto/query/AdminFeeUsageFilter.java`
- Create: `backend/src/main/java/com/duing/domain/fee/repository/AdminFeeAuditQueryRepository.java`
- Create: `backend/src/main/java/com/duing/domain/fee/service/AdminFeeAuditQueryService.java` + `GeneralAdminFeeAuditQueryService.java`
- Create: `backend/src/main/java/com/duing/domain/fee/api/AdminFeeAuditApi.java`
- Create: `backend/src/main/java/com/duing/domain/fee/controller/AdminFeeAuditController.java`
- Create: `backend/src/main/java/com/duing/domain/fee/controller/dto/response/` 하위 `AdminFeeClubSummaryResponse.java`, `AdminFeeDashboardResponse.java`, `AdminFeeClubDetailResponse.java`
- Test: `backend/src/test/java/com/duing/domain/fee/controller/AdminFeeAuditClubsTest.java`

**Interfaces:**
- Consumes: Task 1 `feeAdminView(clubId, actorUserId)`.
- Produces (Task 5·6·7·8이 사용):
  - `AdminFeePeriod.of(LocalDate from, LocalDate to)` → record `AdminFeePeriod(LocalDate dateFrom, LocalDate dateTo, LocalDateTime createdFrom, LocalDateTime createdTo, LocalDateTime paidFrom, LocalDateTime paidTo)` — to 경계는 **exclusive**(+1일 자정).
  - `AdminFeeAuditQueryRepository` 집계 메서드(아래), `AdminFeeAuditQueryService`, `AdminFeeAuditApi`/`AdminFeeAuditController`(Task 5·6·7·8이 메서드 추가).

- [ ] **Step 1: `AdminFeePeriod` 작성** — 존 이중 체제(Global Constraints)를 한 곳에 가둔다:

```java
package com.duing.domain.fee.service.dto.query;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * 관리자 회비 감사 공통 기간(스펙 §7.0). from/to 는 KST 날짜이고 to 는 포함(당일 끝까지)이다.
 * 존 이중 체제를 여기 한 곳에 가둔다 — created_at 은 JVM 존 벽시계(prod=UTC),
 * paid_at·transaction_at 은 KST 벽시계라 같은 날짜 범위라도 비교 경계가 다르다.
 * created*/paid* 경계는 전부 exclusive upper(+1일 자정)로 통일한다.
 */
public record AdminFeePeriod(
        LocalDate dateFrom, LocalDate dateTo,
        LocalDateTime createdFrom, LocalDateTime createdTo,
        LocalDateTime paidFrom, LocalDateTime paidTo
) {
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    public static AdminFeePeriod of(LocalDate from, LocalDate to) {
        return new AdminFeePeriod(
                from, to,
                from == null ? null : toSystemZone(from),
                to == null ? null : toSystemZone(to.plusDays(1)),
                from == null ? null : from.atStartOfDay(),
                to == null ? null : to.plusDays(1).atStartOfDay());
    }

    private static LocalDateTime toSystemZone(LocalDate kstDate) {
        return kstDate.atStartOfDay(SEOUL).withZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime();
    }
}
```

- [ ] **Step 2: 쿼리 DTO·enum 작성**

```java
public enum AdminFeeClubSort { OUTSTANDING, BILLED, COLLECTED, RECENT_PAYMENT, NAME }

public enum AdminFeeUsageFilter { USING, NOT_USING }

/** 목록 한 행 — 집계는 CANCELLED 청구·VOIDED 납부 제외(스펙 §7.1). */
public record AdminFeeClubRow(
        Long clubId, String clubName, String clubStatus, boolean feeUsing,
        long activePolicyCount, long memberCount,
        long billCount, long totalBilled, long totalPaid, long outstanding,
        long unpaidMemberCount, LocalDateTime lastPaidAt, LocalDateTime lastTransactionAt
) {}
```

- [ ] **Step 3: `AdminFeeAuditQueryRepository` 작성** — `@Repository` + `JPAQueryFactory` 컴포넌트. 전 동아리 횡단이라 기존 `FeeBillRepositoryImpl`(clubId 필수 가드)을 쓰지 않고 신설한다. **집계는 테이블별 GROUP BY 소쿼리 5개 + 서비스 메모리 병합**(스펙 §10 — 동아리 수백 규모라 허용, 상관 서브쿼리 소용돌이 회피):

```java
@Repository
@RequiredArgsConstructor
public class AdminFeeAuditQueryRepository {

    private final JPAQueryFactory queryFactory;

    /** 목록 대상 동아리 — deleted 제외 + ACTIVE·INACTIVE 만(스펙 §7.1). q 는 동아리명 contains. */
    public List<Tuple> findClubs(String q) {
        return queryFactory
                .select(club.id, club.name, club.status)
                .from(club)
                .where(club.status.in(ClubStatus.ACTIVE, ClubStatus.INACTIVE),
                        q == null || q.isBlank() ? null : club.name.containsIgnoreCase(q))
                .fetch();
    }

    /** 동아리별 청구 집계(CANCELLED 제외) — clubId → [billCount, totalBilled]. */
    public List<Tuple> aggregateBills(AdminFeePeriod period) {
        return queryFactory
                .select(feeBill.clubId, feeBill.count(), feeBill.amount.sum())
                .from(feeBill)
                .where(feeBill.status.ne(FeeStatus.CANCELLED),
                        createdGoe(period), createdLt(period))
                .groupBy(feeBill.clubId)
                .fetch();
    }

    /** 동아리별 수납 집계 — 기간 내 발행 청구의 ACTIVE 납부 합계·최근 납부일(납부 시점 무관, 스펙 §7.0). */
    public List<Tuple> aggregatePayments(AdminFeePeriod period) {
        return queryFactory
                .select(feeBill.clubId, payment.amount.sum(), payment.paidAt.max())
                .from(payment)
                .join(feeBill).on(feeBill.id.eq(payment.feeBillId))
                .where(payment.status.eq(PaymentStatus.ACTIVE),
                        feeBill.status.ne(FeeStatus.CANCELLED),
                        createdGoe(period), createdLt(period))
                .groupBy(feeBill.clubId)
                .fetch();
    }

    /** 동아리별 미납 인원(distinct user, PENDING·PARTIAL_PAID·OVERDUE). */
    public List<Tuple> aggregateUnpaidMembers(AdminFeePeriod period) {
        return queryFactory
                .select(feeBill.clubId, feeBill.userId.countDistinct())
                .from(feeBill)
                .where(feeBill.status.in(FeeStatus.PENDING, FeeStatus.PARTIAL_PAID, FeeStatus.OVERDUE),
                        createdGoe(period), createdLt(period))
                .groupBy(feeBill.clubId)
                .fetch();
    }

    /** 동아리별 활성 정책 수 / 활성 멤버 수 / 최근 거래일 — 같은 GROUP BY 꼴 3개. */
    public List<Tuple> countActivePolicies() { /* fee_policy where active groupBy clubId */ }
    public List<Tuple> countMembers() { /* clubMember where deletedAt isNull groupBy club.id */ }
    public List<Tuple> findLastTransactionAt() { /* bank_transaction max(transactionAt) groupBy clubId */ }

    private BooleanExpression createdGoe(AdminFeePeriod period) {
        return period.createdFrom() == null ? null : feeBill.createdAt.goe(period.createdFrom());
    }

    private BooleanExpression createdLt(AdminFeePeriod period) {
        return period.createdTo() == null ? null : feeBill.createdAt.lt(period.createdTo());
    }
}
```

주석 처리한 3개 메서드도 위 두 집계와 같은 꼴로 **전부 실제 작성**한다(각 4~6줄): `countActivePolicies`는 `feePolicy.active.isTrue()` where + `groupBy(feePolicy.clubId)`, `countMembers`는 `clubMember.deletedAt.isNull()` + `groupBy(clubMember.club.id)`, `findLastTransactionAt`은 `bankTransaction.transactionAt.max()` + `groupBy(bankTransaction.clubId)`. static import는 `QClub.club`, `QFeeBill.feeBill`, `QPayment.payment`, `QFeePolicy.feePolicy`, `QClubMember.clubMember`, `QBankTransaction.bankTransaction`.

- [ ] **Step 4: 상세 KPI 파생 집계 추가** — 같은 리포지토리에, 연체는 status가 아니라 dueDate 파생(스펙 §15 결정 10). `CaseBuilder`로 한 방:

```java
    /** 상세 KPI — 완납/미납/연체/취소 파생 분류(스펙 §7.3). today 는 KST 오늘(서비스가 seoulClock 으로 계산해 넘긴다). */
    public AdminFeeKpiProjection summarizeClub(Long clubId, AdminFeePeriod period, LocalDate today) {
        NumberExpression<Long> unpaidRemainder = new CaseBuilder()
                .when(feeBill.status.in(FeeStatus.PENDING, FeeStatus.PARTIAL_PAID, FeeStatus.OVERDUE)
                        .and(feeBill.dueDate.goe(today))).then(1L).otherwise(0L).sum();
        NumberExpression<Long> overdueDerived = new CaseBuilder()
                .when(feeBill.status.in(FeeStatus.PENDING, FeeStatus.PARTIAL_PAID, FeeStatus.OVERDUE)
                        .and(feeBill.dueDate.lt(today))).then(1L).otherwise(0L).sum();
        NumberExpression<Long> paidCount = new CaseBuilder()
                .when(feeBill.status.eq(FeeStatus.PAID)).then(1L).otherwise(0L).sum();
        NumberExpression<Long> cancelledCount = new CaseBuilder()
                .when(feeBill.status.eq(FeeStatus.CANCELLED)).then(1L).otherwise(0L).sum();
        return queryFactory
                .select(Projections.constructor(AdminFeeKpiProjection.class,
                        feeBill.count(), paidCount, unpaidRemainder, overdueDerived, cancelledCount))
                .from(feeBill)
                .where(feeBill.clubId.eq(clubId), createdGoe(period), createdLt(period))
                .fetchOne();
    }
```

`AdminFeeKpiProjection`은 `service/dto/query/`에 record로: `(long billCount, long paidCount, long unpaidCount, long overdueCount, long cancelledCount)` — billCount는 CANCELLED 포함 전체이므로 응답에서 `billCount - cancelledCount`로 보정하지 말고, where에 `status.ne(CANCELLED)`를 넣지 않은 이유(취소 건수 표시)를 주석으로 남긴다. 금액 합계(totalBilled/totalPaid/outstanding)는 Step 3의 club별 집계를 clubId 단건 조건으로 재사용.

- [ ] **Step 5: 서비스 작성** — `GeneralAdminFeeAuditQueryService`(클래스 `@Transactional(readOnly = true)`), `requireManager` 없음:

```java
    public PageResponse<AdminFeeClubRow> searchClubs(String q, AdminFeeUsageFilter usage,
                                                     AdminFeePeriod period, AdminFeeClubSort sort,
                                                     Pageable pageable) {
        // 소쿼리 6개를 clubId 로 메모리 병합한다 — 동아리 수백 규모라 전체 병합·정렬·페이징 허용(스펙 §10).
        // ponytail: 메모리 페이징. 동아리 수천 규모가 되면 집계 정렬 쿼리로 이관.
```

병합 로직: `findClubs` 결과를 기준으로 각 집계를 `Map<Long, Tuple>`로 뒤집어 `AdminFeeClubRow` 조립(`feeUsing = activePolicyCount > 0 || billCount > 0`, `outstanding = totalBilled - totalPaid`), `usage` 필터 적용, `sort` enum별 `Comparator`(OUTSTANDING = `comparingLong(...).reversed()`, NAME = 한국어 `Collator`), 수동 페이징(`subList` + `PageImpl` → `PageResponse.from`). `getDashboard(period)`는 같은 병합 결과를 합산(clubCount/feeUsingClubCount/totalBilled/totalPaid/totalOutstanding/collectionRate — 분모 0이면 rate 0.0). `getClubDetail(clubId, period, adminUserId)`는:

```java
    /** 열람 감사를 같은 트랜잭션에 남기므로 조회지만 쓰기 트랜잭션이다(선례: GeneralAdminApplicationQueryService). */
    @Transactional
    public AdminFeeClubDetailQuery getClubDetail(Long clubId, AdminFeePeriod period, Long adminUserId) {
        Club targetClub = clubRepository.findById(clubId)
                .orElseThrow(ClubException.ClubNotFoundException::new);  // com.duing.domain.club.exception — 실존 확인됨
        clubAuditEventRepository.save(ClubAuditEvent.feeAdminView(clubId, adminUserId));
        LocalDate today = LocalDate.now(clock);
        // summarizeClub + 금액 집계 + 멤버·정책 수 + bankMatchingSetting 활성 여부 조립
    }
```

- [ ] **Step 6: Api·컨트롤러·응답 DTO 작성** — `AdminRecruitmentApi`/`AdminRecruitmentController` 패턴 복제. Api 인터페이스에 `@Tag(name = "회비 감사(총동연)")` + 메서드 3개, from/to는 `@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from` 형태. 응답 DTO는 record + `from()` — 시각 변환은 `paidAt.atZone(ZoneId.of("Asia/Seoul")).toInstant()` / created 계열은 `atZone(ZoneId.systemDefault()).toInstant()`(Global Constraints). 스펙 §7.1~§7.3 JSON 예시의 필드명과 1:1로 맞춘다(`recentActivity`·`openOpinionCount`는 PR-3에서 추가하므로 지금은 미포함).

```java
    @Operation(summary = "회비 감사 동아리 목록 (ADMIN)",
            description = "전 동아리 회비 현황. q 는 동아리명 부분 일치(대소문자 무시), usage 생략 시 전체. "
                    + "from/to(KST 날짜, to 포함)는 청구 발행일 기준으로 집계 범위를 자른다. "
                    + "집계에서 취소 청구·정정 납부는 제외된다. 기본 정렬은 미수금 많은 순.")
    @GetMapping("/admin/fees")
    ResponseEntity<ApiResponse<PageResponse<AdminFeeClubSummaryResponse>>> searchFeeClubs(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) AdminFeeUsageFilter usage,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "OUTSTANDING") AdminFeeClubSort sort,
            @Parameter(hidden = true) Pageable pageable);

    @GetMapping("/admin/fees/dashboard")
    ResponseEntity<ApiResponse<AdminFeeDashboardResponse>> getFeeDashboard(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to);

    @GetMapping("/admin/fees/{clubId}")
    ResponseEntity<ApiResponse<AdminFeeClubDetailResponse>> getFeeClubDetail(
            @PathVariable Long clubId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser);
```

`dashboard` 리터럴 경로가 `{clubId}`와 겹치므로 인터페이스에서 리터럴 메서드를 먼저 선언.

- [ ] **Step 7: 테스트 작성** — `AdminFeeAuditClubsTest`, 케이스:
  1. 권한: 비로그인 401 / STUDENT 토큰 403 / ADMIN 200 (`/api/v1/admin/fees`).
  2. 집계 정확성: 동아리 A(청구 3건 중 1건 CANCELLED, 납부 2건 중 1건 VOIDED) → `billCount=2, totalBilled=취소 제외 합, totalPaid=ACTIVE 합, outstanding=차액`.
  3. 미납 인원 distinct: 같은 회원에 미납 청구 2건 → `unpaidMemberCount=1`.
  4. 기간 필터: from=오늘(청구는 어제 발행) → 그 동아리 `billCount=0`; from=어제 → 포함.
  5. 상세 진입 → `FEE_ADMIN_DETAIL_VIEWED` 1건 저장(실 PG — readOnly 함정 회귀), KPI 파생: 마감 지난 PENDING 청구가 `overdueCount`로 잡힘(**DB status는 PENDING인 채로** — OverdueBillJob 미실행 상태).
  6. 미존재 clubId → 404.

- [ ] **Step 8: 실행** — `./gradlew test --tests AdminFeeAuditClubsTest` → PASS.

- [ ] **Step 9: 커밋** — `feat(backend): 관리자 회비 감사 목록·대시보드·상세 KPI API — 기간 필터·연체 파생·열람 감사`

### Task 5: 정책·청구·납부·계좌 조회 API

**Files:**
- Create: `backend/src/main/java/com/duing/domain/fee/service/dto/query/AdminFeeBillFilter.java`, `AdminFeeBillSort.java`, `AdminFeeBillRow.java`, `AdminFeePaymentRow.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/repository/AdminFeeAuditQueryRepository.java`
- Modify: `AdminFeeAuditQueryService.java` / `GeneralAdminFeeAuditQueryService.java`, `AdminFeeAuditApi.java`, `AdminFeeAuditController.java`
- Create: `controller/dto/response/` 하위 `AdminFeePolicyResponse.java`, `AdminFeeBillRowResponse.java`, `AdminFeePaymentRowResponse.java`, `AdminFeeAccountResponse.java`
- Test: `backend/src/test/java/com/duing/domain/fee/controller/AdminFeeAuditDetailTest.java`

**Interfaces:**
- Consumes: Task 4의 `AdminFeePeriod`, 리포지토리, Api/Controller(메서드 추가), 기존 `AccountNumberMasker`(빈, `mask(String)`), `FeeAccountCipher`, `BankMatchingSetting` 리포지토리.
- Produces: `AdminFeeBillFilter { PAID, UNPAID, OVERDUE, CANCELLED }`(FE Task 9 미러), 엔드포인트 4개(§7.4~§7.7).

- [ ] **Step 1: 청구 검색 쿼리** — `findMatchCandidates`의 조인 스타일(clubMember LEFT JOIN + deletedAt.isNull() ON절, 납부 합계 상관 서브쿼리)을 그대로 따른다:

```java
    public Page<AdminFeeBillRow> searchBillsForAdmin(Long clubId, AdminFeeBillFilter filter, String q,
                                                     AdminFeePeriod period, LocalDate today,
                                                     AdminFeeBillSort sort, Pageable pageable) {
        NumberExpression<Long> activePaidSum = Expressions.asNumber(JPAExpressions
                .select(payment.amount.sum().coalesce(0L))
                .from(payment)
                .where(payment.feeBillId.eq(feeBill.id), payment.status.eq(PaymentStatus.ACTIVE)));
        // 정책은 soft delete 될 수 있으므로 LEFT JOIN — 이름 null 이면 FE 가 "삭제된 정책"으로 읽는다.
        List<AdminFeeBillRow> content = queryFactory
                .select(Projections.constructor(AdminFeeBillRow.class,
                        feeBill.id, feeBill.userId, clubMember.user.name, clubMember.user.studentId,
                        clubMember.generation, feePolicy.name, feeBill.billingPeriod,
                        feeBill.amount, activePaidSum, feeBill.status,
                        feeBill.createdAt, feeBill.dueDate,
                        Expressions.asDateTime(JPAExpressions
                                .select(payment.paidAt.max()).from(payment)
                                .where(payment.feeBillId.eq(feeBill.id),
                                       payment.status.eq(PaymentStatus.ACTIVE)))))
                .from(feeBill)
                .leftJoin(clubMember).on(clubMember.club.id.eq(feeBill.clubId),
                        clubMember.user.id.eq(feeBill.userId), clubMember.deletedAt.isNull())
                .leftJoin(feePolicy).on(feePolicy.id.eq(feeBill.feePolicyId))
                .where(feeBill.clubId.eq(clubId), filterCondition(filter, today),
                        billSearchCondition(q), createdGoe(period), createdLt(period))
                .orderBy(orderOf(sort)).offset(pageable.getOffset()).limit(pageable.getPageSize())
                .fetch();
        // count 는 기존 searchClubBills 방식 그대로(FeeBillRepositoryImpl.java:52~63):
        // 같은 where 로 Long total 별도 fetchOne → new PageImpl<>(content, pageable, total == null ? 0L : total).
    }

    /** 콘솔 필터 → 파생 조건(스펙 §7.5). UNPAID/OVERDUE 는 status 가 아니라 dueDate 로 가른다. */
    private BooleanExpression filterCondition(AdminFeeBillFilter filter, LocalDate today) {
        if (filter == null) return null;
        BooleanExpression unpaidStatuses =
                feeBill.status.in(FeeStatus.PENDING, FeeStatus.PARTIAL_PAID, FeeStatus.OVERDUE);
        return switch (filter) {
            case PAID -> feeBill.status.eq(FeeStatus.PAID);
            case UNPAID -> unpaidStatuses.and(feeBill.dueDate.goe(today));
            case OVERDUE -> unpaidStatuses.and(feeBill.dueDate.lt(today));
            case CANCELLED -> feeBill.status.eq(FeeStatus.CANCELLED);
        };
    }

    /** q — 회원명 contains(대소문자 무시)·학번 prefix(AdminUserApi 검색 규칙 미러). */
    private BooleanExpression billSearchCondition(String q) {
        if (q == null || q.isBlank()) return null;
        return clubMember.user.name.containsIgnoreCase(q)
                .or(clubMember.user.studentId.startsWith(q));
    }
```

`AdminFeeBillSort { LATEST, DUE, AMOUNT }` → orderOf: LATEST=`createdAt.desc(), id.desc()`, DUE=`dueDate.asc(), id.asc()`, AMOUNT=`amount.desc(), id.desc()`.

응답 행의 `overdue` boolean은 쿼리가 아니라 **서비스 매핑에서 파생**한다(스펙 §7.5 — PAID/CANCELLED는 마감 경과여도 false):

```java
        LocalDate today = LocalDate.now(clock);
        boolean overdue = UNPAID_STATUSES.contains(row.status()) && row.dueDate().isBefore(today);
        // UNPAID_STATUSES = Set.of(FeeStatus.PENDING, FeeStatus.PARTIAL_PAID, FeeStatus.OVERDUE) 서비스 상수
```

- [ ] **Step 2: 납부 검색 쿼리** — recordedBy/voidedBy 이름은 user 별칭 조인:

```java
    public Page<AdminFeePaymentRow> searchPaymentsForAdmin(Long clubId, PaymentStatus status,
                                                           AdminFeePeriod period, Pageable pageable) {
        QUser recordedByUser = new QUser("recordedByUser");
        QUser voidedByUser = new QUser("voidedByUser");
        List<AdminFeePaymentRow> content = queryFactory
                .select(Projections.constructor(AdminFeePaymentRow.class,
                        payment.id, feeBill.id, clubMember.user.name,
                        payment.amount, payment.method, payment.paidAt,
                        bankTransaction.matchStatus, bankTransaction.counterparty,
                        recordedByUser.name, payment.status,
                        voidedByUser.name, payment.voidedAt, payment.voidReason))
                .from(payment)
                .join(feeBill).on(feeBill.id.eq(payment.feeBillId), feeBill.clubId.eq(clubId))
                .leftJoin(clubMember).on(clubMember.club.id.eq(feeBill.clubId),
                        clubMember.user.id.eq(feeBill.userId), clubMember.deletedAt.isNull())
                .leftJoin(bankTransaction).on(bankTransaction.id.eq(payment.bankTransactionId))
                .leftJoin(recordedByUser).on(recordedByUser.id.eq(payment.recordedBy))
                .leftJoin(voidedByUser).on(voidedByUser.id.eq(payment.voidedBy))
                .where(status == null ? null : payment.status.eq(status),
                        paidGoe(period), paidLt(period))
                .orderBy(payment.paidAt.desc(), payment.id.desc())
                .offset(pageable.getOffset()).limit(pageable.getPageSize())
                .fetch();
        // count 쿼리 동일 where.
    }
```

`paidGoe/paidLt`는 `period.paidFrom()/paidTo()` 기준(KST 벽시계). matchType 파생은 응답 DTO `from()`에서: `bankTransactionId(→ matchStatus) null → "DIRECT"`, `AUTO_MATCHED → "AUTO"`, 그 외 → `"MANUAL"` (unmatch로 PENDING 복귀한 과거 납부도 MANUAL로 표기 — 원 매칭 방식은 복원 불가, 주석으로 한계 명시).

- [ ] **Step 3: 정책 조회 + 정책별 납부율** — `List<Tuple>` 하나: feePolicy 전체(active 무관) + 정책별 기간 내 청구 수(CANCELLED 제외)·PAID 수 GROUP BY. 서비스에서 `paymentRate = paidCount * 100.0 / billCount`(분모 0 → 0.0) 조립.

- [ ] **Step 4: 계좌 조회 서비스** — `GeneralBankMatchingAdminService.resolveMaskedAccountNumber` 패턴 미러(복호화 실패 → null 마스킹, graceful degrade):

```java
    public AdminFeeAccountQuery getAccount(Long clubId) {
        return feeAccountRepository.findByClubId(clubId)
                .map(account -> new AdminFeeAccountQuery(true, account.getBank(),
                        maskSafely(clubId, account.getAccountNumber()), account.getAccountHolder(),
                        bankMatchingSettingRepository.findByClubId(clubId)
                                .map(BankMatchingSetting::isUsable).orElse(false)))
                .orElseGet(AdminFeeAccountQuery::notRegistered);
    }
```

`findByClubId` 시그니처는 기존 `FeeAccountRepository`·`BankMatchingSettingRepository`에서 확인(없으면 동일 네이밍으로 추가). **PUT/DELETE는 만들지 않는다.**

- [ ] **Step 5: Api·컨트롤러 메서드 4개 추가** — §7.4~§7.7 경로·파라미터 그대로 (`GET /admin/fees/{clubId}/policies|bills|payments|account`). bills는 `filter`(`AdminFeeBillFilter`, 생략=전체)·`q`·from/to·`sort`(기본 LATEST)·Pageable, payments는 `status`·from/to·Pageable.

- [ ] **Step 6: 테스트** — `AdminFeeAuditDetailTest`:
  1. bills `filter=OVERDUE`: 마감 어제·status PENDING 청구가 잡히고, 마감 내일·PENDING은 `filter=UNPAID`에서만 잡힘(파생 경계 — 마감 **당일**은 UNPAID).
  2. bills `q`: 이름 부분 일치·학번 prefix 각 1케이스.
  3. bills 응답 `overdue` boolean: status PENDING + 마감 경과 행이 `true`.
  4. payments: VOIDED 행 포함 반환, `voidReason`·`voidedByName` 채움; BANK 매칭 납부의 `matchType="AUTO"`·`counterparty` 채움; 수기 납부 `matchType="DIRECT"`.
  5. account: 응답 계좌번호가 `****` + 끝 4자리 형식이고 **평문이 응답 본문 어디에도 없음**(`response.asString()` 전체 검색); 미등록 동아리 → `registered=false`.
  6. 정책 납부율: 청구 4건 중 PAID 3건 → `paymentRate=75.0`.

- [ ] **Step 7: 실행** — `./gradlew test --tests AdminFeeAuditDetailTest` → PASS.

- [ ] **Step 8: 커밋** — `feat(backend): 관리자 회비 청구·납부·정책·계좌 조회 API — 파생 필터·마스킹·매칭 유형 표기`

---

## PR-3 — 감사 로그·이상징후·의견 (브랜치 `feat/admin-fee-audit-log-anomaly`)

### Task 6: 감사 로그 조회 API

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubaudit/repository/ClubAuditEventRepositoryCustom.java` + `ClubAuditEventRepositoryImpl.java`
- Modify: `ClubAuditEventRepository.java` (Custom 상속 추가)
- Modify: `AdminFeeAuditApi.java`, `AdminFeeAuditController.java`, `GeneralAdminFeeAuditQueryService.java`
- Create: `controller/dto/response/AdminFeeAuditLogResponse.java`
- Test: `backend/src/test/java/com/duing/domain/fee/controller/AdminFeeAuditLogTest.java`

**Interfaces:**
- Consumes: Task 1 이벤트·Task 4 `AdminFeePeriod`(created 경계 사용).
- Produces: `Page<ClubAuditEvent> searchFeeEvents(Long clubId, Collection<ClubAuditEventType> types, LocalDateTime createdFrom, LocalDateTime createdTo, Pageable pageable)`.

- [ ] **Step 1: Custom 리포지토리** — QueryDSL(널 파라미터 JPQL 함정 회피). 기본 대상은 FEE_* 전체:

```java
    @Override
    public Page<ClubAuditEvent> searchFeeEvents(Long clubId, Collection<ClubAuditEventType> types,
                                                LocalDateTime createdFrom, LocalDateTime createdTo,
                                                Pageable pageable) {
        List<ClubAuditEvent> content = queryFactory
                .selectFrom(clubAuditEvent)
                .where(clubAuditEvent.clubId.eq(clubId),
                        clubAuditEvent.eventType.in(types),
                        createdFrom == null ? null : clubAuditEvent.createdAt.goe(createdFrom),
                        createdTo == null ? null : clubAuditEvent.createdAt.lt(createdTo))
                .orderBy(clubAuditEvent.createdAt.desc(), clubAuditEvent.id.desc())
                .offset(pageable.getOffset()).limit(pageable.getPageSize())
                .fetch();
        // count 동일 where. 기존 리포지토리 주석("조회 화면은 후속") 은 이 작업으로 소임을 다했으니 갱신한다.
    }
```

- [ ] **Step 2: 서비스 메서드** — `getAuditLogs(clubId, types, period, pageable)`: types 생략 시 `ClubAuditEventType.values()` 중 `FEE_`로 시작하는 것 전체(서비스 상수 `FEE_EVENT_TYPES`로 필터 — 회비 외 이벤트는 이 API에서 제외, 스펙 §7.8). actorName은 이벤트들의 `actorUserId` 집합을 `userRepository.findAllById`로 일괄 로드해 Map 병합(N+1 방지). 응답 DTO의 `refs`는 4개 id를 묶은 중첩 record, `detail`은 저장된 JSON 문자열을 Jackson `readTree` 없이 **raw passthrough**(`@JsonRawValue`)로 내린다:

```java
public record AdminFeeAuditLogResponse(
        Long eventId, String eventType, Long actorUserId, String actorName,
        Instant createdAt, String reason, Refs refs,
        @JsonRawValue String detail
) {
    public record Refs(Long feePolicyId, Long feeBillId, Long paymentId, Long bankTransactionId) {}
}
```

`@JsonRawValue`를 record 컴포넌트에 쓰는 레포 선례는 없다(전체 grep 0건) — Task 6 테스트 1(detail JSON 파싱)이 직렬화 형태를 검증하므로 깨지면 대안으로 교체: 서비스에서 `ObjectMapper.readValue(detail, Map.class)`로 역직렬화해 `Map<String, Object> detail` 컴포넌트로 내린다.

- [ ] **Step 3: Api 메서드** — `GET /admin/fees/{clubId}/audit-logs`, 파라미터 `types`(`List<ClubAuditEventType>`, 생략=FEE_* 전체 — FEE_* 외 타입이 오면 400이 아니라 무시하고 FEE_*와 교집합), from/to, Pageable. Swagger description에 "감사 로그는 계측 배포 시점 이후의 변경만 기록된다" 명시.

- [ ] **Step 4: 테스트** — `AdminFeeAuditLogTest`:
  1. 정책 수정 + 납부 정정 발생시킨 뒤 조회 → 최신순 2건, actorName 채움, `FEE_POLICY_UPDATED`의 detail 파싱해 `amount.old/new` 확인.
  2. `types=FEE_PAYMENT_VOIDED` 필터 → 1건만.
  3. 회비 외 이벤트(가입 링크 등) 존재해도 응답에 없음.
  4. 기간 필터: to=어제 → 0건.
  5. STUDENT 403.

- [ ] **Step 5: 실행·커밋** — `./gradlew test --tests AdminFeeAuditLogTest` → PASS. 커밋: `feat(backend): 관리자 회비 감사 로그 조회 API — FEE_* 한정·actor 일괄 해석·detail passthrough`

### Task 7: 이상징후 on-demand 평가

**Files:**
- Create: `backend/src/main/java/com/duing/domain/fee/service/AdminFeeAnomalyService.java` + `GeneralAdminFeeAnomalyService.java`
- Create: `backend/src/main/java/com/duing/domain/fee/service/dto/query/FeeAnomaly.java`, `FeeAnomalySeverity.java`
- Modify: `AdminFeeAuditQueryRepository.java`(집계 3개 추가), `ClubAuditEventRepositoryCustom/Impl`(카운트 2개 추가), `AdminFeeAuditApi.java`, `AdminFeeAuditController.java`
- Create: `controller/dto/response/AdminFeeAnomalyReportResponse.java`
- Test: `backend/src/test/java/com/duing/domain/fee/service/AdminFeeAnomalyServiceTest.java` (통합, 경계값)

**Interfaces:**
- Produces: `AdminFeeAnomalyService.evaluate(Long clubId, LocalDate from, LocalDate to)` → `FeeAnomalyReport(Instant evaluatedAt, LocalDate windowFrom, LocalDate windowTo, List<FeeAnomaly> anomalies)`; `FeeAnomaly(String ruleId, FeeAnomalySeverity severity, String title, String description, Map<String, Object> evidence)`; `FeeAnomalySeverity { INFO, WARNING, HIGH, CRITICAL }`.

- [ ] **Step 1: 임계값 상수 + Rule 8개 구현** — Rule 엔진 추상화 없이 private 메서드 8개(스펙 §15 결정 6). from 생략 시 `to(기본 오늘) - 30일`. 데이터 소스와 조건은 스펙 §5.1 표 그대로:

```java
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralAdminFeeAnomalyService implements AdminFeeAnomalyService {

    // ponytail: 임계값 하드코딩 — P2 배치 도입 때 프로퍼티로 승격(스펙 §5.2).
    private static final double MANUAL_RATIO_WARNING = 0.60;   // FA-01
    private static final long MANUAL_MIN_WARNING = 5;
    private static final double MANUAL_RATIO_HIGH = 0.80;
    private static final long MANUAL_MIN_HIGH = 10;
    private static final long VOID_WARNING = 3;                // FA-02
    private static final long VOID_HIGH = 8;
    private static final double CANCEL_RATIO_WARNING = 0.20;   // FA-03
    private static final long CANCEL_MIN = 5;
    private static final long LATE_VOID_WARNING = 3;           // FA-04 (1건 이상 INFO)
    private static final long ACTOR_BURST_HIGH = 5;            // FA-05, 7일 고정
    private static final long EVENT_BURST_HIGH = 20;           // FA-06, 24h 고정
    private static final long EVENT_BURST_CRITICAL = 50;
    private static final long POLICY_AMOUNT_CHANGES_WARNING = 3; // FA-07
    private static final long ACCOUNT_CHANGES_CRITICAL = 2;    // FA-08, 윈도우 하한 90일
```

각 rule 메서드는 `Optional<FeeAnomaly>` 반환(이중 임계는 높은 것부터 판정). 필요한 신규 쿼리:
- `AdminFeeAuditQueryRepository.countMatchedTransactions(clubId, from, to)` → Tuple(전체 matched 수, MANUAL_MATCHED 수) — `transactionAt` 기간, `matchStatus.in(AUTO_MATCHED, MANUAL_MATCHED)` + CaseBuilder MANUAL 카운트. *(FA-01)*
- `countVoidedPayments(clubId, from, to)` — `payment.voidedAt` 기간 + feeBill 조인 club 스코프. *(FA-02)*
- `countLateVoids(clubId, from, to)` — 위 + `payment.voidedAt > bill.dueDate.plusDays(1).atStartOfDay()` 상당: QueryDSL로는 `payment.voidedAt.goe(...)` 비교가 컬럼 간이라 `Expressions.dateTimeTemplate` 대신 **voidedAt·dueDate를 함께 select해 Java에서 판정**(행 수가 적어 허용). *(FA-04)*
- `countCancelledAndIssued(clubId, from, to)` — 기간 내 발행 수(created_at)와 CANCELLED 수(updated_at 근사 — cancel은 종단 전이라 updated_at ≈ 취소 시각, 주석으로 근사 명시). *(FA-03)*
- `ClubAuditEventRepositoryCustom.countByActorSince(clubId, types, since)` → actor별 카운트 Tuple 목록(7일 고정, `FEE_PAYMENT_VOIDED`·`FEE_BILL_CANCELLED`·`FEE_POLICY_UPDATED`). *(FA-05)*
- `countMutationEventsSince(clubId, since)` — FEE_* 중 열람 2종 제외, 24h 고정. *(FA-06)*
- FA-07: `searchFeeEvents(clubId, Set.of(FEE_POLICY_UPDATED), createdFrom, createdTo, 무페이징 상당)` 결과를 Java에서 detail 파싱(`amount` 키 존재만 확인) → feePolicyId별 카운트 최대값 ≥ 3.
- FA-08: `searchFeeEvents(clubId, Set.of(FEE_ACCOUNT_UPDATED, FEE_ACCOUNT_DELETED), max(윈도우, 90일) 경계, …)` 카운트.

evaluate()는 8개를 순서대로 호출해 탐지분만 모으고 severity 내림차순 정렬(CRITICAL 먼저). `evaluatedAt = clock.instant()`, 시각·오늘 계산은 seoulClock.

- [ ] **Step 2: Api 메서드** — `GET /admin/fees/{clubId}/anomalies` + from/to. 응답은 스펙 §7.9 JSON 미러(`window.from/to` 포함).

- [ ] **Step 3: 테스트** — 경계값 중심(상대 날짜만):
  1. FA-02: VOID 2건 → 미탐지 / 3건 → WARNING / 8건 → HIGH(WARNING 아님 — 상위 우선).
  2. FA-01: matched 5건 중 MANUAL 3건(60%) → WARNING; 4건 중 3건(75%지만 5건 미만) → 미탐지.
  3. FA-08: 계좌 변경 이벤트 2건(60일 전·10일 전, 기간=최근 30일이어도 하한 90일 적용) → CRITICAL. **`created_at`은 BaseEntity 자동 스탬프라 save로는 과거 이벤트를 못 만든다** — 저장 후 `JdbcTemplate.update("UPDATE club_audit_event SET created_at = ? WHERE id = ?", 상대 과거 시각, eventId)`로 백데이트한다(FA-05/06/07은 현재 시각 이벤트로 충분).
  4. FA-06: 24h 내 변이 이벤트 20건 벌크 저장 → HIGH; 열람 이벤트만 20건 → 미탐지.
  5. 아무것도 없으면 `anomalies=[]` + 200.

- [ ] **Step 4: 실행·커밋** — `./gradlew test --tests AdminFeeAnomalyServiceTest` → PASS. 커밋: `feat(backend): 회비 이상징후 on-demand 평가 — FA-01~08·severity 4단계·기간 연동`

### Task 8: V106 감사 의견·운영 메모 + dashboard 확장

**Files:**
- Create: `backend/src/main/resources/db/migration/V106__admin_fee_audit_comment.sql` (스펙 §3.2 DDL 그대로 — RLS 포함)
- Create: `backend/src/main/java/com/duing/domain/fee/entity/AdminFeeAuditComment.java`, `FeeAuditCommentKind.java`, `FeeAuditCommentStatus.java`
- Create: `backend/src/main/java/com/duing/domain/fee/repository/AdminFeeAuditCommentRepository.java`
- Create: `backend/src/main/java/com/duing/domain/fee/service/AdminFeeAuditCommentService.java` + `GeneralAdminFeeAuditCommentService.java`
- Create: `backend/src/main/java/com/duing/domain/fee/exception/FeeAuditCommentException.java`
- Modify: `AdminFeeAuditApi.java`, `AdminFeeAuditController.java`, `AdminFeeDashboardResponse.java`, `GeneralAdminFeeAuditQueryService.java`
- Modify: `backend/src/main/java/com/duing/domain/clubaudit/repository/ClubAuditEventRepositoryCustom.java` + `ClubAuditEventRepositoryImpl.java` (recentActivity용 `countMutationEventsByTypeSince`)
- Create: `controller/dto/request/CreateFeeAuditCommentRequest.java`, `UpdateFeeAuditCommentRequest.java`, `controller/dto/response/AdminFeeAuditCommentResponse.java`
- Test: `backend/src/test/java/com/duing/domain/fee/controller/AdminFeeAuditCommentTest.java`

**Interfaces:**
- Produces: 엔드포인트 4개(§7.10 — GET/POST/PATCH/DELETE), `FeeAuditCommentKind { AUDIT_OPINION, OPERATION_MEMO }`, `FeeAuditCommentStatus { OPEN, IN_REVIEW, RESOLVED }`(FE Task 9 미러), dashboard `openOpinionCount`·`recentActivity`.

- [ ] **Step 1: V106 작성** — 스펙 §3.2 DDL 복사(테이블·CHECK 2개·인덱스·`ENABLE ROW LEVEL SECURITY`). 작성 전 최신 번호 재확인(V105가 develop에 있는지).

- [ ] **Step 2: 엔티티·리포지토리** — BaseEntity 상속, 수정 메서드는 도메인 검증 내장:

```java
    /** 내용·상태 부분 수정. 메모(OPERATION_MEMO)는 status 를 가질 수 없다 — DB CHECK 와 같은 규칙을 도메인에서도 지킨다. */
    public void update(String content, FeeAuditCommentStatus status) {
        if (content != null) this.content = content;
        if (status != null) {
            if (this.kind == FeeAuditCommentKind.OPERATION_MEMO) {
                throw new FeeAuditCommentException.StatusNotAllowedException();
            }
            this.status = status;
        }
    }
```

리포지토리: `List<AdminFeeAuditComment> findByClubIdAndKindOrderByCreatedAtDesc(Long clubId, FeeAuditCommentKind kind)`, `findByClubIdOrderByCreatedAtDesc(Long clubId)`, `Optional<AdminFeeAuditComment> findByIdAndClubId(Long id, Long clubId)` *(IDOR 가드 — 스펙 §7.11)*, `long countByStatus(FeeAuditCommentStatus status)`, `long countByKindAndCreatedAtGreaterThanEqual(FeeAuditCommentKind kind, LocalDateTime since)` *(newOpinionCount — kind=AUDIT_OPINION 한정)*.

- [ ] **Step 3: 서비스** — create(생성 시 `AUDIT_OPINION` + status null → **OPEN 자동 부여**, 스펙 §15 결정 16; `OPERATION_MEMO` + status 전달 → 400 `FEE_AUDIT_COMMENT_STATUS_NOT_ALLOWED`), update/delete는 `findByIdAndClubId` → 404 `FEE_AUDIT_COMMENT_NOT_FOUND`. content 1~2000자 검증은 request DTO `@Size`. 목록 응답의 `authorName`은 Task 6과 같은 방식 — `author_user_id` 집합을 `userRepository.findAllById`로 일괄 로드해 병합(N+1 방지).

- [ ] **Step 4: dashboard 확장** — `AdminFeeDashboardResponse`에 `openOpinionCount` + `recentActivity(Instant since, Map<String, Long> eventCounts, long newOpinionCount)` 추가. `recentActivity`: since = KST 오늘 00:00을 **JVM 존으로 변환**(`AdminFeePeriod.of(today, today).createdFrom()` 재사용) → `ClubAuditEventRepositoryCustom.countMutationEventsByTypeSince(since)`(club 무관 전역, 열람 2종 제외, `groupBy(eventType)`), `newOpinionCount = countByKindAndCreatedAtGreaterThanEqual(FeeAuditCommentKind.AUDIT_OPINION, since)`. eventCounts는 0건 키 없음(GROUP BY 결과 그대로).

- [ ] **Step 5: 테스트** — `AdminFeeAuditCommentTest`:
  1. 의견 생성 status 생략 → 응답 `status="OPEN"`.
  2. 메모 생성에 status 전달 → 400 + 코드 `FEE_AUDIT_COMMENT_STATUS_NOT_ALLOWED`.
  3. PATCH `RESOLVED` → 반영; 메모에 PATCH status → 400.
  4. **IDOR**: 다른 동아리 경로로 남의 commentId PATCH → 404.
  5. DELETE 후 목록 미노출(soft delete).
  6. dashboard: 오늘 의견 1건·정책 수정 1건 발생 → `openOpinionCount=1`, `recentActivity.eventCounts["FEE_POLICY_UPDATED"]=1`, `newOpinionCount=1`.

- [ ] **Step 6: 실행·커밋** — `./gradlew test --tests AdminFeeAuditCommentTest && ./gradlew test --tests RowLevelSecurityMigrationTest` → PASS. 커밋: `feat(backend): 회비 감사 의견·운영 메모 — V106 단일 테이블·OPEN 기본값·dashboard 활동 요약`

---

## PR-4 — FE 콘솔 목록·상세 (브랜치 `feat/admin-fee-audit-console`)

### Task 9: 타입·클라이언트·훅 배선

**Files:**
- Create: `frontend/packages/types/src/adminFee.ts` (+ `packages/types/src/index.ts` barrel export 추가)
- Modify: `frontend/packages/api/src/client.ts` (선언부 `admin.fees` 블록 + 구현부 — 두 곳 모두)
- Create: `frontend/packages/hooks/src/adminFees.ts`
- Modify: `frontend/packages/hooks/src/adminQueryKeys.ts`, `frontend/packages/hooks/src/index.ts`

**Interfaces:**
- Consumes: BE 응답 JSON(스펙 §7.1~§7.10) — 필드명 1:1 미러.
- Produces (Task 10~14가 사용): 아래 타입·훅 이름 전부.

- [ ] **Step 1: `adminFee.ts` 작성** — 페이지 응답은 기존 `PageResponse<T>` 미러(`packages/types/src/api.ts` — content/page/size/totalElements/totalPages/hasNext, 실존 확인됨)를 `import type { PageResponse } from './api'`로 재사용한다(신규 페이지 타입 정의 금지). 핵심 타입:

```ts
/** 백엔드 AdminFeeClubSummaryResponse 미러. 집계는 취소 청구·정정 납부 제외(서버 계산). */
export type AdminFeeClubSummary = {
  clubId: number;
  clubName: string;
  clubStatus: 'ACTIVE' | 'INACTIVE';
  feeUsing: boolean;
  activePolicyCount: number;
  memberCount: number;
  billCount: number;
  totalBilled: number;
  totalPaid: number;
  outstanding: number;
  unpaidMemberCount: number;
  lastPaidAt: string | null; // ISO 절대시각(서버가 존 변환을 끝냈다)
  lastTransactionAt: string | null;
};

export type AdminFeeClubSort = 'OUTSTANDING' | 'BILLED' | 'COLLECTED' | 'RECENT_PAYMENT' | 'NAME';
export type AdminFeeUsageFilter = 'USING' | 'NOT_USING';
/** 콘솔 필터 — 미납/연체는 서버가 due_date 파생으로 가른다(status 아님). */
export type AdminFeeBillFilter = 'PAID' | 'UNPAID' | 'OVERDUE' | 'CANCELLED';
export type FeeAuditCommentKind = 'AUDIT_OPINION' | 'OPERATION_MEMO';
export type FeeAuditCommentStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED';
export type FeeAnomalySeverity = 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';

export type AdminFeePeriodParams = { from?: string; to?: string }; // KST yyyy-MM-dd, to 포함

export type AdminFeeClubSearchParams = AdminFeePeriodParams & {
  q?: string;
  usage?: AdminFeeUsageFilter;
  sort?: AdminFeeClubSort;
  page?: number;
  size?: number;
};
```

이어서 같은 파일에 `AdminFeeDashboard`(recentActivity `eventCounts: Record<string, number>` — **없을 수 있는 필드가 아니라 항상 옴**, 0건 타입 키만 없음), `AdminFeeClubDetail`, `AdminFeePolicy`, `AdminFeeBillRow`(`overdue: boolean` 포함), `AdminFeePaymentRow`(`matchType: 'AUTO' | 'MANUAL' | 'DIRECT'`), `AdminFeeAccount`, `AdminFeeAuditLog`(`refs` 중첩 + `detail: Record<string, unknown> | null`), `AdminFeeAnomalyReport`, `AdminFeeAuditComment`, `AdminFeeBillSearchParams`, `AdminFeePaymentSearchParams`, `AdminFeeAuditLogSearchParams`, `CreateFeeAuditCommentPayload`, `UpdateFeeAuditCommentPayload` — 각각 스펙 §7 JSON 예시 필드와 1:1, JSDoc은 "왜 이 형태인지"(null 의미) 스타일.

- [ ] **Step 2: `client.ts` 배선** — 선언부(admin 네임스페이스 안):

```ts
    fees: {
      list(params: AdminFeeClubSearchParams): Promise<PageResponse<AdminFeeClubSummary>>;
      dashboard(params: AdminFeePeriodParams): Promise<AdminFeeDashboard>;
      /** 호출마다 열람 감사 이벤트가 남는다 — 상세 진입에서만 부른다. */
      detail(clubId: number, params: AdminFeePeriodParams): Promise<AdminFeeClubDetail>;
      policies(clubId: number, params: AdminFeePeriodParams): Promise<AdminFeePolicy[]>;
      bills(clubId: number, params: AdminFeeBillSearchParams): Promise<PageResponse<AdminFeeBillRow>>;
      payments(clubId: number, params: AdminFeePaymentSearchParams): Promise<PageResponse<AdminFeePaymentRow>>;
      account(clubId: number): Promise<AdminFeeAccount>;
      auditLogs(clubId: number, params: AdminFeeAuditLogSearchParams): Promise<PageResponse<AdminFeeAuditLog>>;
      anomalies(clubId: number, params: AdminFeePeriodParams): Promise<AdminFeeAnomalyReport>;
      comments(clubId: number, kind?: FeeAuditCommentKind): Promise<AdminFeeAuditComment[]>;
      createComment(clubId: number, payload: CreateFeeAuditCommentPayload): Promise<AdminFeeAuditComment>;
      updateComment(clubId: number, commentId: number, payload: UpdateFeeAuditCommentPayload): Promise<void>;
      deleteComment(clubId: number, commentId: number): Promise<void>;
    };
```

구현부는 `admin.recruitments` 블록 바로 아래에 같은 꼴(`jsonOk` + `cleanParams`, list·bills·auditLogs는 `timeout: REQUEST_TIMEOUT_MS.search`, update/delete는 `jsonVoid`). 경로는 `admin/fees`, `admin/fees/dashboard`, `admin/fees/${clubId}`, … (api/v1 prefix 없음 — prefixUrl 포함).

- [ ] **Step 3: `adminQueryKeys.ts` + `adminFees.ts` 훅** — 키는 계층 규약(무효화 전파):

```ts
  feesAll: ['admin', 'fees'] as const,
  feesList: (params: AdminFeeClubSearchParams) =>
    [...adminQueryKeys.feesAll, 'list', params] as const,
  feesDashboard: (params: AdminFeePeriodParams) =>
    [...adminQueryKeys.feesAll, 'dashboard', params] as const,
  feesDetail: (clubId: number, params: AdminFeePeriodParams) =>
    [...adminQueryKeys.feesAll, 'detail', clubId, params] as const,
  feesPolicies: (clubId: number, params: AdminFeePeriodParams) =>
    [...adminQueryKeys.feesAll, 'policies', clubId, params] as const,
  feesBills: (clubId: number, params: AdminFeeBillSearchParams) =>
    [...adminQueryKeys.feesAll, 'bills', clubId, params] as const,
  feesPayments: (clubId: number, params: AdminFeePaymentSearchParams) =>
    [...adminQueryKeys.feesAll, 'payments', clubId, params] as const,
  feesAccount: (clubId: number) => [...adminQueryKeys.feesAll, 'account', clubId] as const,
  feesAuditLogs: (clubId: number, params: AdminFeeAuditLogSearchParams) =>
    [...adminQueryKeys.feesAll, 'audit-logs', clubId, params] as const,
  feesAnomalies: (clubId: number, params: AdminFeePeriodParams) =>
    [...adminQueryKeys.feesAll, 'anomalies', clubId, params] as const,
  feesComments: (clubId: number, kind?: FeeAuditCommentKind) =>
    [...adminQueryKeys.feesAll, 'comments', clubId, kind ?? 'ALL'] as const,
```

훅: 조회 11개는 `useAdminFeeClubsQuery` 등 `useQuery` 꼴(목록·청구·납부·감사로그는 `placeholderData: keepPreviousData`), 뮤테이션 3개(`useCreateFeeAuditCommentMutation` 등)는 `onSuccess`에서 `invalidateQueries({ queryKey: adminQueryKeys.feesComments(clubId) })`가 아니라 **`[...adminQueryKeys.feesAll, 'comments', clubId]` prefix 무효화 + dashboard 무효화**(openOpinionCount 갱신) — kind별 키가 함께 살아나도록. `useAdminFeeClubDetailQuery`는 열람 감사 특성상 `staleTime: 60_000`. barrel(`hooks/src/index.ts`)에 전부 named export.

- [ ] **Step 4: 검증·커밋** — `frontend/`에서 `pnpm typecheck` → 통과. 커밋: `feat(frontend): 관리자 회비 감사 API 배선 — 타입 미러·클라이언트·훅 12종`

### Task 10: 목록 페이지 + 기간 셀렉터 + 메뉴 등록

**Files:**
- Create: `frontend/apps/web/app/admin/fees/page.tsx`, `_pages/AdminFeesPage.tsx`
- Create: `frontend/apps/web/app/admin/fees/_components/FeePeriodSelect.tsx`, `FeeDashboardStrip.tsx`, `FeeClubsTable.tsx`
- Create: `frontend/apps/web/app/admin/fees/_lib/feePeriod.ts`, `feeAuditLabels.ts`
- Modify: `frontend/apps/web/app/admin/_lib/adminSections.ts`
- Test: `frontend/apps/web/test/admin/fees/admin-fees-list.test.tsx`

**Interfaces:**
- Consumes: Task 9 훅·타입.
- Produces: `FeePeriodSelect`(props `{ value: FeePeriodValue; onChange: (next: FeePeriodValue) => void; defaultPreset?: FeePeriodPreset }`), `resolvePeriodParams(value: FeePeriodValue): AdminFeePeriodParams`, `FEE_EVENT_TYPE_LABEL`·`FEE_SEVERITY_BADGE_CLASS` 라벨 맵 — Task 11~14가 재사용.

- [ ] **Step 1: `feePeriod.ts`** — 프리셋 → from/to 환산(스펙 §7.0 — 서버는 학기 개념을 모른다):

```ts
export type FeePeriodPreset = 'ALL' | 'LAST_30D' | 'LAST_90D' | 'SEMESTER' | 'YEAR' | 'CUSTOM';
export type FeePeriodValue = { preset: FeePeriodPreset; from?: string; to?: string }; // CUSTOM 일 때만 from/to

/** KST 오늘 기준 환산. 학기 경계: 1학기 3/1~8/31, 2학기 9/1~익년 2월 말(스펙 §7.0). */
export function resolvePeriodParams(value: FeePeriodValue): AdminFeePeriodParams {
  const today = todayKstDateString(); // @duing/hooks/datetime 기존 유틸
  switch (value.preset) {
    case 'ALL': return {};
    case 'LAST_30D': return { from: addDaysKst(today, -30), to: today };
    case 'LAST_90D': return { from: addDaysKst(today, -90), to: today };
    case 'SEMESTER': return semesterRange(today);
    case 'YEAR': return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case 'CUSTOM': return { from: value.from, to: value.to };
  }
}
```

`addDaysKst`·`semesterRange`(월 ≥ 3 && ≤ 8 → `3/1~8/31`, 그 외 → 9/1 시작·익년 2월 말은 `new Date(Date.UTC(y+1, 2, 0))` 말일 계산)는 같은 파일에 구현. `@duing/hooks/datetime`에 이미 동등 유틸이 있으면 그것을 쓴다(`rg "addDays" frontend/packages/hooks/src/datetime*`).

- [ ] **Step 2: `FeePeriodSelect`** — `<select>`(프리셋) + CUSTOM 선택 시 `<input type="date">` 2개 노출(네이티브 — 커스텀 피커 금지). 라벨: 전체/최근 30일/최근 90일/이번 학기/올해/직접 선택.

- [ ] **Step 3: `adminSections.ts` 항목 추가** — 모집 관리 항목 아래에:

```ts
  {
    href: '/admin/fees',
    title: '회비 감사',
    description: '동아리 회비 운영 현황 조회와 감사',
    group: '동아리',
    icon: FileSearch,
  },
```

`FileSearch`는 lucide-react import에 추가(기존 아이콘 import 줄에 병기).

- [ ] **Step 4: `AdminFeesPage`** — `AdminRecruitmentsPage` 골격 복제: 검색 `useState`+`useDebouncedValue(300)`(URL 미탑재 주석 유지), 기간은 `FeePeriodSelect` 상태 + **프리셋 키만 URL 동기화**(`router.replace`, `usersQuerySync.ts` 방식 미러 — CUSTOM의 from/to도 쿼리 파라미터로), `useAdminFeeDashboardQuery(periodParams)` → `FeeDashboardStrip`(KPI 칩 + `recentActivity` 한 줄 — `openOpinionCount`·`recentActivity`는 optional chaining으로 PR-3 배포 전에도 안전), usage는 필터칩 `전체 | 회비 사용 | 미사용`(스펙 §8.2 — `AdminRecruitmentsPage`의 FilterChips 로컬 패턴 복제), `useAdminFeeClubsQuery({...periodParams, q, usage, sort, page, size: 20})` → 3단 분기(`ListRowsSkeleton` / `ErrorState(onRetry)` / `ConsoleCard > FeeClubsTable`) + `@/components/Pagination`. 미사용 동아리 행은 흐림 처리(`feeUsing === false` → `opacity-60`), 금액은 `Intl.NumberFormat('ko-KR')`, 행 클릭 → `/admin/fees/${clubId}` 이동(`toRoute`).

- [ ] **Step 5: `feeAuditLabels.ts`** — Task 11~14가 함께 쓰는 라벨 SoT(전부 이 파일에서만 정의):

```ts
export const FEE_EVENT_TYPE_LABEL: Record<string, string> = {
  FEE_POLICY_CREATED: '정책 생성', FEE_POLICY_UPDATED: '정책 수정', FEE_POLICY_DELETED: '정책 삭제',
  FEE_BILL_ISSUED: '청구 발행', FEE_BILL_CANCELLED: '청구 취소',
  FEE_PAYMENT_RECORDED: '납부 기록', FEE_PAYMENT_VOIDED: '납부 정정',
  FEE_TX_MANUAL_MATCHED: '수동 매칭', FEE_TX_IGNORED: '거래 무시', FEE_TX_UNMATCHED: '매칭 취소',
  FEE_ACCOUNT_REGISTERED: '계좌 등록', FEE_ACCOUNT_UPDATED: '계좌 변경', FEE_ACCOUNT_DELETED: '계좌 삭제',
  FEE_ADMIN_DETAIL_VIEWED: '감사 열람', FEE_ADMIN_CSV_DOWNLOADED: 'CSV 다운로드',
};
export const FEE_SEVERITY_LABEL: Record<FeeAnomalySeverity, string> = {
  INFO: '참고', WARNING: '주의', HIGH: '경고', CRITICAL: '심각',
};
export const FEE_SEVERITY_BADGE_CLASS: Record<FeeAnomalySeverity, string> = { /* 회색/앰버/오렌지/레드 — UserStatusBadge 클래스 맵 참고 */ };
export const FEE_COMMENT_STATUS_LABEL: Record<FeeAuditCommentStatus, string> = {
  OPEN: '진행중', IN_REVIEW: '확인중', RESOLVED: '완료',
};
export const FEE_MATCH_TYPE_LABEL = { AUTO: '자동', MANUAL: '수동', DIRECT: '수기' } as const;
```

- [ ] **Step 6: 테스트** — `admin-fees-list.test.tsx`(모킹 패턴은 `admin-recruitments-list.test.tsx` 복제 — 훅 vi.mock·debounce 항등·next/navigation):
  1. 목록 렌더: 동아리명·미수금 포맷(₩ 아님, `330,000`).
  2. 검색 입력 → 훅이 `q`로 호출되고 `mockReplace`에 검색어 미포함(URL 금지 규약).
  3. 기간 프리셋 변경 → 훅 params에 from/to 반영.
  4. 미사용 동아리 행 흐림 클래스.
  5. 에러 시 ErrorState + 재시도 버튼.

- [ ] **Step 7: 실행·커밋** — `frontend/`에서 `pnpm --filter web test -- --run admin-fees-list && pnpm typecheck` → PASS. 커밋: `feat(frontend): 관리자 회비 감사 목록·대시보드 — 기간 셀렉터·메뉴 등록`

### Task 11: 상세 페이지 — 개요·정책·청구·납부·계좌 탭

**Files:**
- Create: `frontend/apps/web/app/admin/fees/[clubId]/page.tsx`, `_pages/AdminFeeClubDetailPage.tsx`
- Create: `_components/FeeKpiCards.tsx`, `FeePoliciesTable.tsx`, `FeeBillsTable.tsx`, `FeePaymentsTable.tsx`, `FeeAccountCard.tsx`
- Test: `frontend/apps/web/test/admin/fees/admin-fee-detail.test.tsx`

**Interfaces:**
- Consumes: Task 9 훅, Task 10 `FeePeriodSelect`·`resolvePeriodParams`·라벨 맵.
- Produces: 탭 컨테이너(`tab` URL 동기화 — Task 12~14가 탭 추가).

- [ ] **Step 1: 상세 컨테이너** — 헤더(← 목록 링크 · 동아리명 · **"읽기 전용" 배지** · `FeePeriodSelect` 기본 `LAST_30D`), 탭 상태는 `tab` 쿼리 파라미터로 URL 동기화(`router.replace`). 탭 정의는 배열 상수로 두고 PR-5에서 3개 추가만 하면 되게:

```tsx
const TABS = [
  { key: 'overview', label: '개요' },
  { key: 'policies', label: '정책' },
  { key: 'bills', label: '청구' },
  { key: 'payments', label: '납부' },
  { key: 'account', label: '계좌' },
  // PR-5: audit-logs · anomalies · comments
] as const;
```

`useAdminFeeClubDetailQuery(clubId, periodParams)`는 **컨테이너에서 1회만** 호출(열람 이벤트가 탭 전환마다 남지 않게 — client.ts 주석과 동일 이유).

- [ ] **Step 2: 개요 탭** — `FeeKpiCards`(총 회원/활성 정책/청구 건수/완납/미납/연체/취소/총 수납/미수금/수납률 — detail 응답 그대로, 연체 카드에 "마감일 기준 산출" 캡션), BANK 매칭 여부 라인.

- [ ] **Step 3: 청구 탭** — 필터칩 `전체|완납|미납|연체|취소`(`AdminFeeBillFilter` 1:1, `FilterChips`는 `AdminRecruitmentsPage` 로컬 패턴 복제), 검색(회원명·학번, debounce, URL 미탑재), `useAdminFeeBillsQuery` + Pagination. 행: 회원/학번/기수(`generation ?? '—'`)/회차/정책명(`policyName ?? '삭제된 정책'`)/금액/납부액/상태배지(**`overdue===true`면 연체 배지 우선**, 아니면 기존 `feeLabels`의 FeeStatus 라벨)/생성일/마감일/납부일(`formatDateTimeKst`).

- [ ] **Step 4: 납부 탭** — 필터칩 `전체|유효|정정됨`(`status` ACTIVE/VOIDED), 행: 입금자(`counterparty ?? '—'`)/회원/금액/입금일/매칭 배지(`FEE_MATCH_TYPE_LABEL[matchType]`)/기록자/상태. VOIDED 행은 `line-through` + `voidReason`·`voidedByName` 표시(툴팁 대신 서브 텍스트 줄 — 모바일 접근성).

- [ ] **Step 5: 정책·계좌 탭** — 정책 표(정책명/대상/금액/유형/상태/발행 건수/납부율 — 액션 버튼 없음), `FeeAccountCard`(스펙 §8.3 wireframe — 은행명+마스킹 번호+예금주+매칭 여부 + "계좌 정보는 조회만 가능합니다" 안내 + `/admin/bank-matching` 링크, 미등록 시 EmptyState).

- [ ] **Step 6: 테스트** — `admin-fee-detail.test.tsx`:
  1. 탭 전환에도 detail 훅 호출 1회(열람 감사 중복 방지 — mock 호출 수 단언).
  2. 청구 행: `status: 'PENDING', overdue: true` → 연체 배지 렌더.
  3. 연체 필터칩 클릭 → 훅 `filter: 'OVERDUE'` 호출.
  4. VOIDED 납부 행 취소선 + 사유 노출.
  5. 계좌 탭: 마스킹 번호 그대로 렌더, 수정 UI 부재(버튼 쿼리 0건 단언).

- [ ] **Step 7: 실행·커밋** — `pnpm --filter web test -- --run admin-fee-detail && pnpm typecheck` → PASS. 커밋: `feat(frontend): 관리자 회비 감사 상세 — KPI·정책·청구·납부·계좌 탭 (읽기 전용)`

---

## PR-5 — FE 감사 탭 3종 (브랜치 `feat/admin-fee-audit-console-audit-tabs`)

### Task 12: 감사 로그 탭

**Files:**
- Create: `frontend/apps/web/app/admin/fees/_components/FeeAuditLogList.tsx`
- Modify: `_pages/AdminFeeClubDetailPage.tsx` (TABS에 `{ key: 'audit-logs', label: '감사 로그' }` 추가)
- Modify: `_lib/feeAuditLabels.ts` (detail 포매터 추가)
- Test: `frontend/apps/web/test/admin/fees/admin-fee-audit-log.test.tsx`

- [ ] **Step 1: detail 포매터** — `feeAuditLabels.ts`에:

```ts
/** detail JSONB 를 한국어 한 줄로. 알 수 없는 키는 건너뛴다 — BE 가 필드를 늘려도 깨지지 않게. */
export function formatAuditDetail(detail: Record<string, unknown> | null): string {
  if (!detail) return '';
  const parts: string[] = [];
  const amount = detail.amount;
  if (typeof amount === 'number') parts.push(`금액 ${amount.toLocaleString('ko-KR')}원`);
  if (isOldNew(amount)) parts.push(`금액 ${fmt(amount.old)} → ${fmt(amount.new)}`);
  if (isOldNew(detail.active)) parts.push(detail.active.new ? '활성화' : '비활성화');
  if (typeof detail.issuedCount === 'number') parts.push(`${detail.issuedCount}건 발행`);
  if (typeof detail.billingPeriod === 'string') parts.push(`회차 ${detail.billingPeriod}`);
  if (detail.autoMatched === true) parts.push('BANK 자동매칭');
  if (typeof detail.statusBefore === 'string') parts.push(`이전 상태 ${detail.statusBefore}`);
  if (typeof detail.bank === 'string') parts.push(`은행 ${detail.bank}`);
  return parts.join(' · ');
}
```

`isOldNew`/`fmt` 타입가드·포맷 헬퍼 포함해 전부 구현.

- [ ] **Step 2: `FeeAuditLogList`** — 유형그룹 `<select>`(전체/정책/청구/납부/매칭/계좌/열람 → 각 그룹의 `types` 배열 상수 매핑, cleanParams가 배열을 반복 키로 직렬화), `useAdminFeeAuditLogsQuery(clubId, { types, ...periodParams, page })` + Pagination. 행: 시각(KST) · 이벤트 라벨 배지 · actorName · `formatAuditDetail(detail)` + `reason` (`사유: …`). 빈 상태: "감사 로그는 계측 배포 이후의 변경부터 기록됩니다."

- [ ] **Step 3: 테스트** — detail 포매터 단위 3케이스(`{amount:{old:10000,new:30000}}` → `금액 10,000 → 30,000`, `{issuedCount:2,billingPeriod:'2026-2'}`, null → ''), 리스트 렌더·유형그룹 변경 시 types 배열 호출.

- [ ] **Step 4: 실행·커밋** — `pnpm --filter web test -- --run admin-fee-audit-log && pnpm typecheck`. 커밋: `feat(frontend): 회비 감사 로그 탭 — 유형그룹 필터·detail 한국어 포매팅`

### Task 13: 이상징후 탭

**Files:**
- Create: `frontend/apps/web/app/admin/fees/_components/FeeAnomalyList.tsx`
- Modify: `_pages/AdminFeeClubDetailPage.tsx` (TABS `{ key: 'anomalies', label: '이상징후' }`)
- Test: `frontend/apps/web/test/admin/fees/admin-fee-anomalies.test.tsx`

- [ ] **Step 1: `FeeAnomalyList`** — `useAdminFeeAnomaliesQuery(clubId, periodParams)`. 탐지 항목: severity 배지(`FEE_SEVERITY_BADGE_CLASS`) + title + description + "근거 보기" 토글(`<details>` 네이티브)로 evidence 키·값 나열 + **감사 로그 탭으로 이동 링크**(해당 rule의 관련 유형그룹 + 현재 기간을 tab 쿼리로 — FA-05/06/07/08 → 대응 types, FA-01~04는 소스가 회비 테이블이라 링크 생략). 버스트 rule(FA-05/06) 항목엔 "고유 윈도우(7일/24시간) 고정" 캡션. 미탐지 시: "기간 내 탐지된 이상징후가 없습니다" + 평가 기준(`evaluatedAt`, `window.from~to`) 표기.

- [ ] **Step 2: 테스트** — CRITICAL 정렬 최상단, `<details>` 토글로 evidence 노출, 빈 배열 → 정상 문구.

- [ ] **Step 3: 실행·커밋** — `pnpm --filter web test -- --run admin-fee-anomalies && pnpm typecheck`. 커밋: `feat(frontend): 회비 이상징후 탭 — severity 배지·근거 토글·감사 로그 연결`

### Task 14: 의견·메모 탭

**Files:**
- Create: `frontend/apps/web/app/admin/fees/_components/FeeAuditCommentPanel.tsx`
- Modify: `_pages/AdminFeeClubDetailPage.tsx` (TABS `{ key: 'comments', label: '의견·메모' }`)
- Test: `frontend/apps/web/test/admin/fees/admin-fee-comments.test.tsx`

- [ ] **Step 1: `FeeAuditCommentPanel`** — 서브 토글(감사 의견 | 운영 메모, `kind` 상태) + 상단 안내 1줄("동아리에는 표시되지 않습니다"). 작성 폼: `<textarea>`(maxLength 2000) + 등록 버튼(`useCreateFeeAuditCommentMutation` — 의견 생성 시 status 미전송 = 서버 OPEN 기본값, 스펙 §7.10). 목록 행: 상태 배지(`FEE_COMMENT_STATUS_LABEL`, 의견만) · 작성자 · 시각 · 내용. 의견 행의 인라인 `<select>`로 상태 변경(`useUpdateFeeAuditCommentMutation`), 삭제 버튼은 **인라인 확인 UI**(네이티브 confirm 금지 — "삭제" 클릭 → 같은 자리에서 "정말 삭제/취소" 2버튼 교체). 실패 시 `useToast().addToast(message, { variant: 'error' })`.

- [ ] **Step 2: 테스트** — 의견 등록 시 payload에 status 부재, 상태 select 변경 → update 뮤테이션 호출, 메모 토글 시 상태 UI 미렌더, 삭제 인라인 확인 2단계.

- [ ] **Step 3: 실행·커밋** — `pnpm --filter web test -- --run admin-fee && pnpm typecheck` (fees 테스트 전체 회귀). 커밋: `feat(frontend): 회비 감사 의견·운영 메모 탭 — 상태 워크플로·인라인 삭제 확인`

---

## 완료 기준 (PR별 self-check)

- PR마다: 스펙 해당 절과 diff 대조(Out of Scope 침범 없음 — 특히 **회계 데이터 쓰기 API 0개**), `./gradlew test`/`pnpm test` 전체 green, 커밋 메시지 형식, push·PR 생성은 사용자 지시 대기.
- PR-1 머지 전 develop에서 V105 번호 최신 재확인(V104 이후 다른 마이그레이션이 먼저 머지됐으면 리네임).
- PR-4·5는 실브라우저 QA(:3000, `pnpm dev`) 1회: 목록 → 상세 → 탭 순회 → 기간 변경, 콘솔 에러 0건 확인 후 dev 서버 종료.
