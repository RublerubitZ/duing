# 회비 관리 시스템 Sprint 3 — BANK API 자동매칭 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 동아리 계좌의 입금 거래를 BANK API로 수집해 미납 청구와 매칭한다 — 자동매칭(Tier 1·2) + 검토 큐 후보 추천 + 1클릭 승인. 목표는 총무 업무 최소화(자동매칭률 30~50%면 충분).

**Architecture:** 인증정보(계좌 비번·주민번호6)는 동기화 시 입력받아 BANK API 호출에만 쓰고 즉시 폐기(DB·로그·이벤트·raw_payload 어디에도 미보관). 거래는 `transaction_hash`로 멱등 적재. 매칭은 "입금액 == 미납 fee_bill 잔액 인 청구가 동아리 전체 정확히 1건"(Tier 1, 전 은행) → KB `counterparty` 이름 보조(Tier 2) → 검토 큐(Tier 3). 매칭 성공 시 Sprint 2 납부 생성 경로(비관적 잠금·상태 재계산·완납 알림)를 재사용한다. ADMIN(총동연)이 등록한 동아리만 사용(BANK API 5계좌 한도).

**Tech Stack:** Spring Boot 3.4 / Java 21 / PostgreSQL(Flyway·QueryDSL·RestClient) · Next.js 15 / React 19 / TanStack Query / Zod. 설계서: `docs/superpowers/specs/2026-06-17-fee-system-sprint3-design.md`.

전제: `feat/fee-system-sprint3` 브랜치(develop 분기, Sprint 1·2 머지됨)에서 진행. 각 Task 는 현재 브랜치에 **커밋만** 하고 push/PR 은 하지 않는다(리뷰 후 오케스트레이터 처리). 통합 테스트는 실 PostgreSQL(TestContainers). **BANK API 외부 호출은 테스트에서 `BankApiClient` 스텁으로 대체**(실제 호출 금지). 모든 사용자 대면 문자열은 한국어, 커밋은 Conventional Commits(한국어, `Co-Authored-By`/`🤖` 금지).

---

## File Structure

**백엔드** (`backend/src/main/java/com/duing/`)
- `domain/fee/entity/{BankTransaction,BankMatchingSetting,MatchStatus,TransactionType}.java` — 거래·설정 애그리거트·enum
- `domain/fee/repository/{BankTransactionRepository,BankMatchingSettingRepository}.java` (+ QueryDSL custom 후보 조회)
- `global/bank/{BankApiClient,BankApiHttpClient,BankApiProperties,dto/*,exception/BankApiException}.java` — BANK API 연동(전역 인프라)
- `global/config/BankApiClientConfig.java` — RestClient 빈
- `domain/fee/service/{BankMatchingAdminService,BankTransactionSyncService,TransactionMatcher,MatchedPaymentService}.java` + command/query DTO
- `domain/fee/controller/{AdminBankMatchingController,LeaderBankTransactionController}.java` + `api/*` + `controller/dto/*`
- `domain/fee/support/{BankCodeMapper,TransactionHasher}.java` — 은행코드 매핑·해시 헬퍼
- 수정: `domain/notification/event/FeePaymentConfirmedEvent.java`(+autoMatched), `domain/notification/listener/FeePaymentConfirmedListener.java`(문구 분기)
- DB: `db/migration/V63__create_bank_matching.sql`
- 설정: `application.yml`(`bank-api`), `.env.example`(`BANK_API_KEY`/`SECRET`)

**프론트** (`frontend/`)
- `packages/types/src/bank.ts` · `packages/api/src/client.ts` · `packages/hooks/src/{bank.ts,bankQueryKeys.ts}` · `packages/schemas/src/index.ts`
- `apps/web/app/manage/clubs/[clubId]/fees/_components/{BankSyncDialog,BankReviewQueue}.tsx` + 회비 화면 "거래" 탭
- `apps/web/app/admin/.../BankMatchingClubs.tsx` (ADMIN 총동연 등록)

---

## Task BE-1: V63 마이그레이션 + 엔티티 + 리포지토리

**Files:**
- Create: `backend/src/main/resources/db/migration/V63__create_bank_matching.sql`
- Create: `backend/src/main/java/com/duing/domain/fee/entity/{MatchStatus,TransactionType,BankMatchingSetting,BankTransaction}.java`
- Create: `backend/src/main/java/com/duing/domain/fee/repository/{BankMatchingSettingRepository,BankTransactionRepository}.java`
- Modify: `backend/src/test/java/com/duing/common/IntegrationTestBase.java` (TRUNCATE)
- Test: `backend/src/test/java/com/duing/domain/fee/entity/BankTransactionTest.java`

- [ ] **Step 1: V63 마이그레이션** (기존 마이그레이션 수정 금지; 생성 순서 setting → transaction → payment 컬럼)

```sql
-- ADMIN(총동연) 이 등록한 동아리만 BANK 매칭 사용. active=API 등록까지 완료돼야 true.
CREATE TABLE bank_matching_setting (
    id             BIGSERIAL PRIMARY KEY,
    club_id        BIGINT NOT NULL UNIQUE REFERENCES club(id) ON DELETE RESTRICT,
    active         BOOLEAN NOT NULL DEFAULT FALSE,
    api_registered BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at     TIMESTAMP WITH TIME ZONE
);
ALTER TABLE bank_matching_setting ENABLE ROW LEVEL SECURITY;

-- 수집 거래(멱등 적재). transaction_hash 로 중복 차단.
CREATE TABLE bank_transaction (
    id                  BIGSERIAL PRIMARY KEY,
    club_id             BIGINT NOT NULL REFERENCES club(id) ON DELETE RESTRICT,
    bank_code           VARCHAR(10) NOT NULL,
    transaction_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    amount              BIGINT NOT NULL,
    balance             BIGINT,
    counterparty        VARCHAR(100),
    transaction_type    VARCHAR(20) NOT NULL CHECK (transaction_type IN ('DEPOSIT','WITHDRAWAL')),
    match_status        VARCHAR(20) NOT NULL CHECK (match_status IN ('PENDING','AUTO_MATCHED','MANUAL_MATCHED','IGNORED')),
    matched_fee_bill_id BIGINT REFERENCES fee_bill(id) ON DELETE RESTRICT,
    transaction_hash    VARCHAR(64) NOT NULL UNIQUE,
    raw_payload         JSONB NOT NULL,
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_bank_tx_club_status ON bank_transaction (club_id, match_status) WHERE deleted_at IS NULL;
ALTER TABLE bank_transaction ENABLE ROW LEVEL SECURITY;

-- 매칭으로 생성된 납부만 거래를 가리킨다(수동 납부는 NULL).
ALTER TABLE payment ADD COLUMN bank_transaction_id BIGINT REFERENCES bank_transaction(id) ON DELETE RESTRICT;
CREATE INDEX idx_payment_bank_tx ON payment (bank_transaction_id) WHERE deleted_at IS NULL;
```
> `users` 테이블이 `users(id)`인 것처럼 `club` 테이블은 `club(id)`이다(V60 `fee_bill.club_id REFERENCES club(id)` 동일 패턴 — 확인 완료).

- [ ] **Step 2: enum 2개**
```java
package com.duing.domain.fee.entity;
public enum MatchStatus { PENDING, AUTO_MATCHED, MANUAL_MATCHED, IGNORED }
```
```java
package com.duing.domain.fee.entity;
public enum TransactionType { DEPOSIT, WITHDRAWAL }
```

- [ ] **Step 3: BankMatchingSetting 엔티티** (Sprint 2 `FeeBill` 스타일: `@SQLDelete`/`@SQLRestriction`, `@Builder(PRIVATE)`, static factory, `BaseEntity`)
```java
package com.duing.domain.fee.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "bank_matching_setting")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE bank_matching_setting SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class BankMatchingSetting extends BaseEntity {

    @Column(name = "club_id", nullable = false)
    private Long clubId;

    @Column(nullable = false)
    private boolean active;

    @Column(name = "api_registered", nullable = false)
    private boolean apiRegistered;

    @Builder(access = AccessLevel.PRIVATE)
    private BankMatchingSetting(Long clubId, boolean active, boolean apiRegistered) {
        this.clubId = clubId;
        this.active = active;
        this.apiRegistered = apiRegistered;
    }

    public static BankMatchingSetting of(Long clubId) {
        return BankMatchingSetting.builder().clubId(clubId).active(false).apiRegistered(false).build();
    }

    /** BANK API 등록 성공 후에만 호출 — DB↔API 상태 일치(원자성). */
    public void activate() { this.active = true; this.apiRegistered = true; }

    /** BANK API 등록 해제 성공 후에만 호출. */
    public void deactivate() { this.active = false; this.apiRegistered = false; }

    public boolean isUsable() { return this.active && this.apiRegistered; }
}
```

- [ ] **Step 4: BankTransaction 엔티티**
```java
package com.duing.domain.fee.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.type.SqlTypes;

@Getter
@Entity
@Table(name = "bank_transaction")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE bank_transaction SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class BankTransaction extends BaseEntity {

    @Column(name = "club_id", nullable = false)
    private Long clubId;

    @Column(name = "bank_code", nullable = false, length = 10)
    private String bankCode;

    @Column(name = "transaction_at", nullable = false)
    private LocalDateTime transactionAt;

    @Column(nullable = false)
    private Long amount;

    @Column
    private Long balance;

    @Column(length = 100)
    private String counterparty;

    @Enumerated(EnumType.STRING)
    @Column(name = "transaction_type", nullable = false, length = 20)
    private TransactionType transactionType;

    @Enumerated(EnumType.STRING)
    @Column(name = "match_status", nullable = false, length = 20)
    private MatchStatus matchStatus;

    @Column(name = "matched_fee_bill_id")
    private Long matchedFeeBillId;

    @Column(name = "transaction_hash", nullable = false, length = 64)
    private String transactionHash;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "raw_payload", nullable = false, columnDefinition = "jsonb")
    private String rawPayload;

    @Builder(access = AccessLevel.PRIVATE)
    private BankTransaction(Long clubId, String bankCode, LocalDateTime transactionAt, Long amount, Long balance,
                            String counterparty, TransactionType transactionType, MatchStatus matchStatus,
                            String transactionHash, String rawPayload) {
        this.clubId = clubId;
        this.bankCode = bankCode;
        this.transactionAt = transactionAt;
        this.amount = amount;
        this.balance = balance;
        this.counterparty = counterparty;
        this.transactionType = transactionType;
        this.matchStatus = matchStatus;
        this.transactionHash = transactionHash;
        this.rawPayload = rawPayload;
    }

    public static BankTransaction ingest(Long clubId, String bankCode, LocalDateTime transactionAt, Long amount,
                                         Long balance, String counterparty, TransactionType transactionType,
                                         String transactionHash, String rawPayload) {
        // 적재 시점 상태: 입금=검토 대상(PENDING), 출금=매칭 제외(IGNORED).
        MatchStatus initial = transactionType == TransactionType.DEPOSIT ? MatchStatus.PENDING : MatchStatus.IGNORED;
        return BankTransaction.builder()
                .clubId(clubId).bankCode(bankCode).transactionAt(transactionAt).amount(amount).balance(balance)
                .counterparty(counterparty).transactionType(transactionType).matchStatus(initial)
                .transactionHash(transactionHash).rawPayload(rawPayload)
                .build();
    }

    public void matchTo(Long feeBillId, MatchStatus status) { // AUTO_MATCHED or MANUAL_MATCHED
        this.matchedFeeBillId = feeBillId;
        this.matchStatus = status;
    }

    public void ignore() { this.matchStatus = MatchStatus.IGNORED; }

    /** 매칭취소 → 재검토 가능 상태로 복귀. */
    public void resetToPending() { this.matchStatus = MatchStatus.PENDING; this.matchedFeeBillId = null; }

    public boolean isPending() { return this.matchStatus == MatchStatus.PENDING; }
    public boolean isDeposit() { return this.transactionType == TransactionType.DEPOSIT; }
}
```
> `raw_payload` 는 `@JdbcTypeCode(SqlTypes.JSON)` + `String` 로 매핑(Hibernate 6, jsonb). BANK API 응답 거래 1건의 JSON 문자열을 그대로 넣는다.

- [ ] **Step 5: 리포지토리 2개**
```java
package com.duing.domain.fee.repository;
import com.duing.domain.fee.entity.BankMatchingSetting;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
public interface BankMatchingSettingRepository extends JpaRepository<BankMatchingSetting, Long> {
    Optional<BankMatchingSetting> findByClubId(Long clubId);
}
```
```java
package com.duing.domain.fee.repository;
import com.duing.domain.fee.entity.BankTransaction;
import com.duing.domain.fee.entity.MatchStatus;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
public interface BankTransactionRepository extends JpaRepository<BankTransaction, Long> {

    Optional<BankTransaction> findByIdAndClubId(Long id, Long clubId);

    Page<BankTransaction> findByClubIdAndMatchStatus(Long clubId, MatchStatus matchStatus, Pageable pageable);

    List<BankTransaction> findByTransactionHashIn(List<String> transactionHashes);

    // 가장 최근 적재 거래 시각(증분 동기화 시작일 계산). 없으면 null.
    @Query("SELECT MAX(t.transactionAt) FROM BankTransaction t WHERE t.clubId = :clubId")
    java.time.LocalDateTime findLatestTransactionAt(@Param("clubId") Long clubId);

    // 멱등 적재: transaction_hash 충돌 시 무시. 반환 = 실제 INSERT 행 수(1 또는 0).
    @Modifying
    @Query(value = """
            INSERT INTO bank_transaction (club_id, bank_code, transaction_at, amount, balance, counterparty,
                                          transaction_type, match_status, transaction_hash, raw_payload)
            VALUES (:clubId, :bankCode, :transactionAt, :amount, :balance, :counterparty,
                    :type, :status, :hash, CAST(:rawPayload AS jsonb))
            ON CONFLICT (transaction_hash) DO NOTHING
            """, nativeQuery = true)
    int insertIgnoringConflict(@Param("clubId") Long clubId, @Param("bankCode") String bankCode,
                               @Param("transactionAt") java.time.LocalDateTime transactionAt,
                               @Param("amount") Long amount, @Param("balance") Long balance,
                               @Param("counterparty") String counterparty, @Param("type") String type,
                               @Param("status") String status, @Param("hash") String hash,
                               @Param("rawPayload") String rawPayload);
}
```
(후보 조회 QueryDSL 메서드는 BE-5 에서 `BankTransactionRepositoryCustom` 으로 추가한다.)

- [ ] **Step 6: IntegrationTestBase TRUNCATE 추가** (payment·fee_bill 보다 먼저 — 자식. CASCADE 라 순서 무관하나 자식 먼저 나열)
`"TRUNCATE TABLE " + "bank_transaction, " + "bank_matching_setting, " + "payment, " + "fee_bill, " + ...` 가 되도록 두 테이블을 `payment` 앞에 추가.

- [ ] **Step 7: BankTransactionTest(단위)** — `ingest(DEPOSIT)` → PENDING, `ingest(WITHDRAWAL)` → IGNORED; `matchTo(billId, AUTO_MATCHED)` → matchedFeeBillId·status 세팅; `resetToPending()` → PENDING·matchedFeeBillId null; `ignore()` → IGNORED. Korean `@DisplayName`.

- [ ] **Step 8: 컴파일·테스트·커밋**
Run: `cd backend && ./gradlew compileJava compileTestJava && ./gradlew test --tests "com.duing.domain.fee.entity.BankTransactionTest"` (Flyway V63 가 TestContainers 부팅 시 적용 → migration 검증). 회귀로 `--tests "com.duing.domain.fee.LeaderFeeBillControllerTest"` 도 통과 확인.
```bash
git add backend/src/main/resources/db/migration/V63__create_bank_matching.sql \
        backend/src/main/java/com/duing/domain/fee/entity/{MatchStatus,TransactionType,BankMatchingSetting,BankTransaction}.java \
        backend/src/main/java/com/duing/domain/fee/repository/{BankMatchingSettingRepository,BankTransactionRepository}.java \
        backend/src/test/java/com/duing/common/IntegrationTestBase.java \
        backend/src/test/java/com/duing/domain/fee/entity/BankTransactionTest.java
git commit -m "feat(backend): BANK 매칭 도메인 기반(V63 bank_transaction·setting·payment 링크) 추가"
```

---

## Task BE-2: BankApiClient (BANK API 연동)

**Files:**
- Create: `global/bank/BankApiClient.java`(인터페이스), `global/bank/BankApiHttpClient.java`(구현), `global/bank/BankApiProperties.java`, `global/config/BankApiClientConfig.java`, `global/bank/dto/{BankTransactionData,AccountSlotStatus,TransactionLookupCommand}.java`, `global/bank/exception/BankApiException.java`
- Create: `domain/fee/support/BankCodeMapper.java`, `domain/fee/support/TransactionHasher.java`
- Modify: `application.yml`, `.env.example`
- Test: `backend/src/test/java/com/duing/domain/fee/support/{BankCodeMapperTest,TransactionHasherTest}.java`

- [ ] **Step 1: 설정·프로퍼티·RestClient 빈** (Resend `ResendClientConfig`/`ResendProperties` 패턴 그대로)
`BankApiProperties`(`@ConfigurationProperties("bank-api")`): `String baseUrl, String apiKey, String secretKey`(record). `application.yml`:
```yaml
bank-api:
  base-url: https://api.bankapi.co.kr
  api-key: ${BANK_API_KEY:}
  secret-key: ${BANK_API_SECRET:}
```
`.env.example` 에 `BANK_API_KEY=` / `BANK_API_SECRET=`(주석: BANK API 인증 키, 코드/yml 하드코딩 금지, 미설정 시 매칭 기능만 비동작). `BankApiClientConfig`:
```java
@Configuration
@EnableConfigurationProperties(BankApiProperties.class)
public class BankApiClientConfig {
    @Bean
    public RestClient bankApiRestClient(BankApiProperties props) {
        SimpleClientHttpRequestFactory rf = new SimpleClientHttpRequestFactory();
        rf.setConnectTimeout(Duration.ofSeconds(5));
        rf.setReadTimeout(Duration.ofSeconds(15)); // 은행 조회는 느릴 수 있음
        return RestClient.builder()
                .baseUrl(props.baseUrl())
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + props.apiKey() + ":" + props.secretKey())
                .requestFactory(rf)
                .build();
    }
}
```

- [ ] **Step 2: DTO + 예외**
```java
// BankTransactionData — 파싱된 거래 1건(응답). rawJson 은 적재용 원본 문자열.
public record BankTransactionData(
        java.time.LocalDateTime transactionAt, // date+time 합성(Asia/Seoul)
        long amount, Long balance, String type /* "deposit"/"withdrawal" */,
        String counterparty, String description, String branch, String memo, String rawJson) {
    public boolean isDeposit() { return "deposit".equalsIgnoreCase(type); }
}
```
```java
public record AccountSlotStatus(int registeredCount, int maxAccounts, int remaining) {}
```
```java
// 거래 조회 입력. 민감정보(accountPassword·residentNumber)는 이 객체로만 흐르고 로깅 금지.
public record TransactionLookupCommand(String bankCode, String accountNumber, String accountPassword,
                                       String residentNumber, java.time.LocalDate startDate, java.time.LocalDate endDate) {}
```
`BankApiException`(풀네임 inner, `ApplicationException` 상속): `AuthFailedException`(502/401계열), `AccountNotRegisteredException`(409), `RateLimitExceededException`(429, retryAfter), `AccountLimitExceededException`(400), `BankApiCallFailedException`(502 일반). **메시지·필드에 민감정보 미포함.**

- [ ] **Step 3: BankApiClient 인터페이스 + HTTP 구현**
```java
public interface BankApiClient {
    void registerAccount(String bankCode, String accountNumber);            // POST /v1/accounts
    void deleteAccount(String bankCode, String accountNumber);              // DELETE /v1/accounts
    AccountSlotStatus getAccountStatus();                                   // GET /v1/accounts
    List<BankTransactionData> getTransactions(TransactionLookupCommand command); // POST /v1/transactions
}
```
`BankApiHttpClient`(`@Component @RequiredArgsConstructor`, inject `RestClient bankApiRestClient`, `ObjectMapper`):
- `getTransactions`: `bankApiRestClient.post().uri("/v1/transactions").contentType(JSON).body(Map.of("bankCode", cmd.bankCode(), "accountNumber", cmd.accountNumber(), "accountPassword", cmd.accountPassword(), "residentNumber", cmd.residentNumber(), "startDate", cmd.startDate() 포맷 "yyyyMMdd", "endDate", ...)).retrieve().body(String.class)` → ObjectMapper 로 파싱: `success` false 면 error 코드별 예외, true 면 `transactions[]` 각 객체를 `BankTransactionData` 로(`date`+`time`→`transactionAt` KST LocalDateTime, 각 거래 객체를 `objectMapper.writeValueAsString` → rawJson). `get/register/delete` 도 동일 패턴.
- **에러 변환**: `try { ... } catch (RestClientResponseException e) { 상태·바디의 error 코드 → BankApiException 변환 }`. **catch/log 에 민감정보(요청 바디) 절대 안 싣는다** — `log.warn("BANK API 거래조회 실패: status={}", e.getStatusCode())` 처럼 상태만. (Resend `ResendEmailSender` 의 PII 비로깅 주석 패턴 계승.)
- 429 응답의 `retryAfter` 파싱해 예외에 담아 사용자 안내.

- [ ] **Step 4: BankCodeMapper** (Sprint 2 `Bank` enum → BANK API 코드; 적격성)
```java
@Component
public class BankCodeMapper {
    public String toApiCode(Bank bank) {
        return switch (bank) {
            case NH -> "NH";
            case KB -> "KB";
            case WOORI -> "WR";
            default -> throw new BankApiException.UnsupportedBankException(); // {NH,KB,WOORI} 외
        };
    }
    public boolean isEligible(Bank bank) { return bank == Bank.NH || bank == Bank.KB || bank == Bank.WOORI; }
}
```
(`UnsupportedBankException` 400, "농협·KB국민·우리은행만 자동매칭을 지원합니다." 를 `BankApiException` 에 추가.)

- [ ] **Step 5: TransactionHasher** (설계 §4.2 정확히)
```java
@Component
public class TransactionHasher {
    // SHA-256( club_id|bank_code|transaction_at(ISO)|amount|balance|type|counterparty|description|branch|memo )
    public String hash(Long clubId, String bankCode, BankTransactionData d) {
        String input = String.join("|",
                String.valueOf(clubId), bankCode, d.transactionAt().toString(), String.valueOf(d.amount()),
                String.valueOf(d.balance()), normalizeType(d.type()),
                nz(d.counterparty()), nz(d.description()), nz(d.branch()), nz(d.memo()));
        return sha256Hex(input);
    }
    private static String nz(String s) { return s == null ? "" : s; }
    private static String normalizeType(String t) { return "deposit".equalsIgnoreCase(t) ? "DEPOSIT" : "WITHDRAWAL"; }
    private static String sha256Hex(String input) {
        try {
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256")
                    .digest(input.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(64);
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
```

- [ ] **Step 6: 헬퍼 단위 테스트** — `BankCodeMapperTest`(NH/KB/WOORI 매핑, 그 외 UnsupportedBankException, isEligible), `TransactionHasherTest`(동일 입력 → 동일 64자 해시, counterparty null vs "" 동일 처리, description·branch·memo 반영으로 다른 거래는 다른 해시). 외부 호출 없음.

- [ ] **Step 7: 컴파일·테스트·커밋**
Run: `./gradlew test --tests "com.duing.domain.fee.support.*"`
```bash
git add backend/src/main/java/com/duing/global/bank backend/src/main/java/com/duing/global/config/BankApiClientConfig.java \
        backend/src/main/java/com/duing/domain/fee/support backend/src/main/resources/application.yml backend/.env.example \
        backend/src/test/java/com/duing/domain/fee/support
git commit -m "feat(backend): BANK API 연동 클라이언트 + 은행코드 매핑·거래 해시 헬퍼 추가"
```

---

## Task BE-3: ADMIN 허용/해제 API (등록 원자성)

**Files:**
- Create: `domain/fee/service/BankMatchingAdminService.java`, `domain/fee/controller/AdminBankMatchingController.java`, `domain/fee/api/AdminBankMatchingApi.java`, `controller/dto/request/UpdateBankMatchingRequest.java`, `controller/dto/response/BankMatchingClubResponse.java`
- Test: `backend/src/test/java/com/duing/domain/fee/AdminBankMatchingControllerTest.java`

- [ ] **Step 1: BankMatchingAdminService** — **외부 API 먼저, DB 나중(원자성)**
주입: `BankMatchingSettingRepository`, `FeeAccountRepository`, `ClubRepository`, `BankApiClient`, `BankCodeMapper`, `FeeAccountCipher`.
```java
@Transactional
public void setActive(Long clubId, boolean active) {
    // 적격성: fee_account 존재 + 은행 적격(NH/KB/WOORI)
    FeeAccount account = feeAccountRepository.findByClubId(clubId)
            .orElseThrow(BankMatchingException.FeeAccountRequiredException::new);
    if (!bankCodeMapper.isEligible(account.getBank())) {
        throw new BankApiException.UnsupportedBankException();
    }
    BankMatchingSetting setting = bankMatchingSettingRepository.findByClubId(clubId)
            .orElseGet(() -> bankMatchingSettingRepository.save(BankMatchingSetting.of(clubId)));
    String bankCode = bankCodeMapper.toApiCode(account.getBank());
    String accountNumber = feeAccountCipher.decrypt(account.getAccountNumber(), clubId);
    if (active) {
        bankApiClient.registerAccount(bankCode, accountNumber); // ① 외부 등록(실패 시 예외 → DB 미변경)
        setting.activate();                                     // ② 성공 시에만 DB 반영
    } else {
        bankApiClient.deleteAccount(bankCode, accountNumber);   // ① 외부 해제(이미 미등록은 멱등)
        setting.deactivate();                                   // ②
    }
}
```
> 외부 호출이 같은 `@Transactional` 안에 있다. 외부 등록 성공 후 DB 커밋이 실패하는 드문 경우 BANK API 에는 등록된 채 DB 미반영(슬롯 1 소모) — `registerAccount` 는 `ACCOUNT_ALREADY_REGISTERED` 를 멱등 성공으로 처리해 재시도 가능하게 한다. "DB 먼저 변경 후 외부 호출" 순서는 금지(상태 불일치 방지).
조회: `getMatchingClubs()` → 동아리별 적격성·등록상태 + `bankApiClient.getAccountStatus()`(슬롯) 조합. `requireActiveUsable(clubId)` 헬퍼(동기화/검토에서 재사용): setting `isUsable()` + 은행 적격 아니면 `BankMatchingNotEnabledException`.

`BankMatchingException`(풀네임 inner): `FeeAccountRequiredException`(409 "회비 계좌를 먼저 등록해야 합니다."), `BankMatchingNotEnabledException`(403 "이 동아리는 BANK 자동매칭 미사용입니다.").

- [ ] **Step 2: request/response + api/controller** (admin 패턴: `@RequestMapping("/api/v1") @PreAuthorize("hasRole('ADMIN')")` implements `AdminBankMatchingApi` — `AdminLeaderSuccessionController` 미러)
- `PUT /admin/clubs/{clubId}/bank-matching` body `UpdateBankMatchingRequest(@NotNull Boolean active)` → `setActive(clubId, active)` → 200 `ApiResponse<Void>`.
- `GET /admin/clubs/bank-matching` → 200 `ApiResponse<List<BankMatchingClubResponse>>` (clubId, clubName, eligible, ineligibleReason, registered, + 슬롯 헤더는 별도 필드/응답).
컨트롤러 메서드에 `@PathVariable`·`@Valid @RequestBody`·`@AuthenticationPrincipal UserPrincipal` 명시.

- [ ] **Step 3: 통합 테스트** (`AdminBankMatchingControllerTest`, BANK API 는 **스텁 빈**으로 대체 — `@TestConfiguration` 에 `BankApiClient` 스텁 등록, 등록 성공/실패/한도초과 시나리오 제어)
```text
- 적격 동아리 활성화 → BANK API 등록 호출되고 active=api_registered=true 가 된다
- BANK API 등록 실패(스텁이 AccountLimitExceeded 던짐) → DB active=false 유지(미변경)되고 400
- fee_account 없음 → 409, 미지원 은행(예: 신한) → 400
- 비활성화 → BANK API 해제 호출 + active=false
- 비ADMIN 접근 → 403
```
> 스텁은 호출 인자(특히 계좌번호)와 호출 순서(등록 호출이 DB 반영 전인지)를 검증할 수 있게 작성. 실제 외부 호출 절대 금지.

- [ ] **Step 4: 커밋**
```bash
git add backend/src/main/java/com/duing/domain/fee backend/src/test/java/com/duing/domain/fee/AdminBankMatchingControllerTest.java
git commit -m "feat(backend): BANK 매칭 ADMIN 허용/해제 API(등록 원자성) 구현"
```

---

## Task BE-4: 거래 동기화(멱등 적재 · 인증정보 비저장)

**Files:**
- Create: `domain/fee/service/BankTransactionSyncService.java`, `service/dto/command/SyncTransactionsCommand.java`, `service/dto/query/SyncResult.java`, `domain/fee/controller/LeaderBankTransactionController.java`(sync 만 우선), `api/LeaderBankTransactionApi.java`, `controller/dto/request/SyncBankTransactionsRequest.java`, `controller/dto/response/SyncResultResponse.java`
- Test: `backend/src/test/java/com/duing/domain/fee/BankTransactionSyncTest.java`

- [ ] **Step 1: SyncTransactionsCommand / SyncResult**
```java
// 민감정보 운반 — 어디에도 저장·로깅 금지. 처리 후 스코프 종료로 폐기.
public record SyncTransactionsCommand(Long clubId, Long actorId, String accountPassword, String residentNumber) {}
public record SyncResult(int fetched, int newlyStored, int autoMatched, int pendingReview) {}
```

- [ ] **Step 2: BankTransactionSyncService** (매칭은 BE-5 에서 주입 — 본 태스크는 적재까지, autoMatched=0 으로 두고 BE-5 에서 채움)
주입: `ClubAuthService`, `BankMatchingAdminService`(requireActiveUsable), `FeeAccountRepository`, `FeeAccountCipher`, `BankCodeMapper`, `BankApiClient`, `TransactionHasher`, `BankTransactionRepository`, `Clock`.
```java
@Transactional
public SyncResult sync(SyncTransactionsCommand command) {
    clubAuthService.requireManager(command.actorId(), command.clubId());
    bankMatchingAdminService.requireActiveUsable(command.clubId());
    FeeAccount account = feeAccountRepository.findByClubId(command.clubId())
            .orElseThrow(BankMatchingException.FeeAccountRequiredException::new);
    String bankCode = bankCodeMapper.toApiCode(account.getBank());
    String accountNumber = feeAccountCipher.decrypt(account.getAccountNumber(), command.clubId());

    LocalDate today = LocalDate.now(clock);
    LocalDate start = resolveStartDate(command.clubId(), today); // max(최근거래일-1, today-14)
    List<BankTransactionData> fetched = bankApiClient.getTransactions(new TransactionLookupCommand(
            bankCode, accountNumber, command.accountPassword(), command.residentNumber(), start, today));
    // command.accountPassword()/residentNumber() 는 이 호출 외 어디에도 쓰지 않는다(저장·로그·이벤트 금지).

    List<String> insertedHashes = new ArrayList<>();
    for (BankTransactionData d : fetched) {
        String hash = transactionHasher.hash(command.clubId(), bankCode, d);
        String type = d.isDeposit() ? "DEPOSIT" : "WITHDRAWAL";
        String status = d.isDeposit() ? "PENDING" : "IGNORED";
        int inserted = bankTransactionRepository.insertIgnoringConflict(
                command.clubId(), bankCode, d.transactionAt(), d.amount(), d.balance(), d.counterparty(),
                type, status, hash, d.rawJson());
        if (inserted == 1) insertedHashes.add(hash);
    }
    // 방금 적재된 PENDING 입금만 매칭 대상으로 재조회(BE-5 에서 matcher 호출).
    List<BankTransaction> newDeposits = insertedHashes.isEmpty() ? List.of()
            : bankTransactionRepository.findByTransactionHashIn(insertedHashes).stream()
                .filter(BankTransaction::isPending).filter(BankTransaction::isDeposit).toList();
    int autoMatched = 0; // BE-5: newDeposits 각각 matcher.tryAutoMatch(...) → 성공 카운트
    return new SyncResult(fetched.size(), insertedHashes.size(), autoMatched, newDeposits.size() - autoMatched);
}

private LocalDate resolveStartDate(Long clubId, LocalDate today) {
    LocalDateTime latest = bankTransactionRepository.findLatestTransactionAt(clubId);
    LocalDate floor = today.minusDays(14);
    if (latest == null) return floor;
    LocalDate fromLatest = latest.toLocalDate().minusDays(1);
    return fromLatest.isBefore(floor) ? floor : fromLatest; // 최대 14일 윈도우
}
```

- [ ] **Step 3: request/response + api/controller** (총무 패턴: `@PreAuthorize("isAuthenticated()")`, `requireManager` 는 서비스에서)
- `POST /leader/clubs/{clubId}/bank-transactions/sync` body `SyncBankTransactionsRequest(@NotBlank accountPassword, @NotBlank residentNumber)` → 200 `ApiResponse<SyncResultResponse>`.
- **보안**: `SyncBankTransactionsRequest` 는 `record` 이지만 `toString` 이 민감정보를 노출하지 않도록 **커스텀 `toString` 오버라이드**(`"SyncBankTransactionsRequest[REDACTED]"`) — 컨트롤러/로깅에서 본문이 찍혀도 값 비노출. 컨트롤러는 이 값을 로깅하지 않는다.

- [ ] **Step 4: 통합 테스트** (`BankTransactionSyncTest`, BANK API 스텁이 거래 목록 반환)
```text
- 동기화 시 입금은 PENDING, 출금은 IGNORED 로 적재된다
- 같은 거래를 두 번 동기화해도 중복 적재 0건(transaction_hash ON CONFLICT)
- 미허용 동아리/비총무 동기화 차단(403)
- (보안 회귀) 동기화 요청·예외 경로에서 accountPassword·residentNumber 가 응답·로그·DB(raw_payload 포함) 어디에도 나타나지 않는다 — raw_payload 에는 BANK API 응답 거래만 들어감을 단언
```
> 보안 회귀 테스트: 스텁이 받은 인자를 캡처해 비밀번호/주민번호가 전달됐는지(API 호출엔 전달돼야 함) 확인하되, 저장된 `bank_transaction.raw_payload`·`SyncResultResponse`·발생 예외 메시지에는 그 값이 없음을 단언.

- [ ] **Step 5: 커밋**
```bash
git add backend/src/main/java/com/duing/domain/fee backend/src/test/java/com/duing/domain/fee/BankTransactionSyncTest.java
git commit -m "feat(backend): 거래 동기화 멱등 적재 + 인증정보 비저장·비로깅 구현"
```

---

## Task BE-5: 매칭 엔진 + 매칭 납부 생성 + 알림 문구 분기

**Files:**
- Create: `domain/fee/service/TransactionMatcher.java`, `domain/fee/service/MatchedPaymentService.java`, `repository/BankTransactionRepositoryCustom.java` + `Impl`(후보 조회 QueryDSL) 또는 `FeeBillRepository` 후보 쿼리
- Modify: `BankTransactionSyncService`(matcher 호출), `domain/notification/event/FeePaymentConfirmedEvent.java`(+autoMatched), `domain/notification/listener/FeePaymentConfirmedListener.java`(문구 분기), `GeneralPaymentService`(매칭 납부 생성 시 autoMatched 플래그 전달 경로)
- Test: `backend/src/test/java/com/duing/domain/fee/TransactionMatcherTest.java`, `BankTransactionMatchIntegrationTest.java`

- [ ] **Step 1: 후보 청구 조회** — 미납 fee_bill 중 잔액(remaining)==입금액 인 청구 목록(동아리 전체, 정렬 due_date asc → created_at desc → id asc)
`FeeBillRepository`(또는 custom)에 QueryDSL 추가: 입력(clubId, depositAmount) → 미납(`status ∈ {PENDING,PARTIAL_PAID,OVERDUE}`) fee_bill 중 `amount − COALESCE(ACTIVE payment 합계,0) == depositAmount` 인 청구를 `(due_date asc, created_at desc, id asc)` 로 반환. Sprint 2 `FeePaidAmountReader`/`payment` 합계 패턴 재사용(상관 서브쿼리 또는 join+having). 반환 = 후보 `MatchCandidate(feeBillId, userId, memberName, billingPeriod, dueDate, remaining)` 목록(memberName 은 `club_member`/`users` join — Sprint 2 회원명 조회 패턴 재사용; 구현 시 실제 회원명 컬럼 대조).

- [ ] **Step 2: TransactionMatcher** (설계 §5)
```java
/** PENDING 입금 거래에 대해 자동매칭을 시도. 성공 시 true(납부 생성). 실패 시 PENDING 유지. */
@Transactional
public boolean tryAutoMatch(BankTransaction tx, Long actorId) {
    List<MatchCandidate> candidates = candidateBills(tx.getClubId(), tx.getAmount());
    MatchCandidate chosen = null;
    if (candidates.size() == 1) {
        chosen = candidates.get(0);                                  // Tier 1: 전 은행
    } else if (candidates.size() >= 2 && "KB".equals(tx.getBankCode())
            && tx.getCounterparty() != null && !tx.getCounterparty().isBlank()) {
        List<MatchCandidate> byName = candidates.stream()
                .filter(c -> normalize(c.memberName()).equals(normalize(tx.getCounterparty())))
                .toList();
        if (byName.size() == 1) chosen = byName.get(0);              // Tier 2: KB 이름 보조
    }
    if (chosen == null) return false;                                // Tier 3: 검토 큐(PENDING 유지)
    matchedPaymentService.createMatchedPayment(tx, chosen.feeBillId(), actorId, MatchStatus.AUTO_MATCHED, true);
    return true;
}
private static String normalize(String s) { return s == null ? "" : s.replaceAll("\\s", ""); }
```

- [ ] **Step 3: MatchedPaymentService** — 매칭 납부 생성(Sprint 2 잠금·상태계산·알림 재사용)
주입: `FeeBillRepository`, `PaymentRepository`, `FeeBillStatusCalculator`, `ApplicationEventPublisher`, `BankTransactionRepository`, `Clock`.
```java
@Transactional
public void createMatchedPayment(BankTransaction tx, Long feeBillId, Long actorId, MatchStatus matchStatus, boolean autoMatched) {
    FeeBill bill = feeBillRepository.findByIdAndClubIdForUpdate(feeBillId, tx.getClubId()) // Sprint 2 비관적 잠금
            .orElseThrow(FeeBillException.FeeBillNotFoundException::new);
    long activePaid = paymentRepository.sumActiveByFeeBillId(bill.getId());
    long remaining = bill.getAmount() - activePaid;
    if (remaining != tx.getAmount()) {                 // 동시성: 사이에 잔액 변동 → 자동매칭 포기(검토 큐로)
        throw new BankMatchingException.MatchAmountMismatchException();
    }
    LocalDateTime paidAt = tx.getTransactionAt();
    Payment payment = paymentRepository.save(Payment.record(
            bill.getId(), remaining, PaymentMethod.TRANSFER, paidAt, actorId, "BANK 매칭"));
    payment.linkBankTransaction(tx.getId());           // payment.bank_transaction_id (Sprint 2 엔티티에 세터 추가)
    long newSum = activePaid + remaining;
    FeeStatus newStatus = statusCalculator.calculate(bill.getAmount(), bill.getDueDate(), newSum);
    bill.updateStatus(newStatus);
    tx.matchTo(bill.getId(), matchStatus);
    eventPublisher.publishEvent(new FeePaymentConfirmedEvent(
            bill.getUserId(), bill.getId(), bill.getBillingPeriod(), newStatus,
            bill.getAmount() - newSum, payment.getId(), autoMatched)); // autoMatched 추가
}
```
- `Payment` 엔티티(Sprint 2)에 `bankTransactionId` 필드 + `linkBankTransaction(Long)` + `Payment.record` 는 그대로(기존). 매칭취소는 BE-6.
- `MatchAmountMismatchException`(409) 는 `tryAutoMatch` 내부에서 잡아 `false` 반환(검토 큐로) — `tryAutoMatch` 의 `createMatchedPayment` 호출을 try/catch 로 감싸 mismatch 시 false.

- [ ] **Step 4: FeePaymentConfirmedEvent + Listener 문구 분기** (Sprint 2 확장)
- `FeePaymentConfirmedEvent` 에 `boolean autoMatched` 추가(맨 끝). Sprint 2 의 기존 publish 2곳(`GeneralPaymentService.record`)은 `false` 로 호출하도록 인자 추가.
- `FeePaymentConfirmedListener` PAID 분기:
```java
String title = event.autoMatched() ? "회비 납부가 자동으로 확인되었어요" : "회비 납부가 완료되었어요";
String body = event.autoMatched()
        ? event.billingPeriod() + " 회비가 자동으로 확인되었습니다"
        : event.billingPeriod() + " 회비 완납 확인";
```
(타입 `FEE_PAID_CONFIRMED`·dedupKey `FEE_PAID_CONFIRMED:b=<billId>` 불변. PARTIAL 분기는 매칭이 완납만 만들므로 변경 없음.)

- [ ] **Step 5: 동기화에 matcher 연결** — `BankTransactionSyncService` 의 `autoMatched` 계산을 `for (BankTransaction dep : newDeposits) if (matcher.tryAutoMatch(dep, command.actorId())) autoMatched++;` 로 채운다.

- [ ] **Step 6: 테스트**
`TransactionMatcherTest`(통합, 스텁 후보 또는 실 데이터):
```text
- 잔액==입금액 청구가 정확히 1건 → AUTO_MATCHED + payment(TRANSFER, bank_transaction_id) + 청구 PAID
- 후보 2건(비KB) → 매칭 안 됨(PENDING 유지)
- 후보 2건(KB, counterparty=회원명) → 이름으로 1건 좁혀 AUTO_MATCHED; 동명이인 → PENDING
- 후보 0건 → PENDING
- PARTIAL_PAID 청구의 잔액==입금액 → 후보로 잡혀 매칭(완납 처리)
- 자동매칭 완납 → FEE_PAID_CONFIRMED 알림 "자동으로" 문구
- 동시성: 같은 청구로 두 입금 자동매칭 시도 → 한 건만 성공(나머지 잔액 불일치로 PENDING)
```

- [ ] **Step 7: 커밋**
```bash
git add backend/src/main/java/com/duing/domain backend/src/test/java/com/duing/domain/fee
git commit -m "feat(backend): BANK 거래 자동매칭 엔진(Tier1/2) + 매칭 납부 생성 + 자동 확인 알림"
```

---

## Task BE-6: 검토 큐 API (목록·승인·무시·매칭취소)

**Files:**
- Modify: `LeaderBankTransactionController.java`/`api`, `BankTransactionSyncService` 외 새 `BankTransactionReviewService.java`
- Create: `controller/dto/request/ApproveMatchRequest.java`, `controller/dto/response/{BankTransactionResponse,MatchCandidateResponse}.java`
- Test: `backend/src/test/java/com/duing/domain/fee/LeaderBankTransactionReviewTest.java`

- [ ] **Step 1: BankTransactionReviewService**
```java
List<BankTransactionView> list(Long clubId, Long actorId, MatchStatus status, Pageable pageable);
//  PENDING 항목은 후보(candidateBills, 정렬 due_date asc→created_at desc→id asc) 동봉
void approve(Long clubId, Long actorId, Long txId, Long feeBillId); // 후보 검증 → MANUAL_MATCHED + 납부
void ignore(Long clubId, Long actorId, Long txId);                  // IGNORED
void unmatch(Long clubId, Long actorId, Long txId);                 // 연결 payment VOID + 거래 PENDING 복귀
```
- `approve`: `requireManager`; tx 로드(PENDING 아니면 `AlreadyMatchedException` 409); `feeBillId` 가 후보(잔액==tx.amount, 같은 동아리, 미납)인지 검증(아니면 `InvalidMatchCandidateException` 400); `matchedPaymentService.createMatchedPayment(tx, feeBillId, actorId, MANUAL_MATCHED, false)`.
- `ignore`: tx `ignore()`.
- `unmatch`: tx 로드(AUTO/MANUAL_MATCHED 아니면 400); 연결 payment(`paymentRepository.findByBankTransactionIdAndStatusActive` 또는 tx→payment 역참조) **Sprint 2 VOID 경로로 취소** + 청구 상태 재계산 + `tx.resetToPending()`. (Sprint 2 `GeneralPaymentService.voidPayment` 재사용하되 actor=총무, reason="매칭취소".)

- [ ] **Step 2: api/controller 엔드포인트** (`LeaderBankTransactionController` 에 추가)
- `GET  /leader/clubs/{clubId}/bank-transactions?status=&page=&size=` → 200 페이지(PENDING 은 후보 동봉).
- `POST /leader/clubs/{clubId}/bank-transactions/{txId}/approve` body `ApproveMatchRequest(@NotNull Long feeBillId)` → 201/200.
- `POST /leader/clubs/{clubId}/bank-transactions/{txId}/ignore` → 204.
- `POST /leader/clubs/{clubId}/bank-transactions/{txId}/unmatch` → 204.

- [ ] **Step 3: 테스트** (`LeaderBankTransactionReviewTest`)
```text
- 목록 조회: PENDING 입금에 후보 청구가 정렬(due_date asc)되어 동봉된다
- 승인 → MANUAL_MATCHED + payment 생성 + 청구 PAID; 후보 아닌 feeBillId 승인 → 400; 이미 매칭된 거래 승인 → 409
- 무시 → IGNORED
- 매칭취소 → 연결 payment VOID + 청구 상태 복귀 + 거래 PENDING; 매칭 안 된 거래 매칭취소 → 400
- 비총무 403, 타 동아리 거래 404
```

- [ ] **Step 4: 커밋**
```bash
git add backend/src/main/java/com/duing/domain/fee backend/src/test/java/com/duing/domain/fee/LeaderBankTransactionReviewTest.java
git commit -m "feat(backend): BANK 거래 검토 큐 API(목록·승인·무시·매칭취소) 구현"
```

---

## Task FE-1: 프론트 packages 배선

**Files:** `frontend/packages/{types,api,hooks,schemas}/src/*`

- [ ] **Step 1: 타입** (`packages/types/src/bank.ts`) — 백엔드 DTO 1:1
```ts
export type MatchStatus = 'PENDING' | 'AUTO_MATCHED' | 'MANUAL_MATCHED' | 'IGNORED';
export type TransactionType = 'DEPOSIT' | 'WITHDRAWAL';
export type MatchCandidate = {
  feeBillId: number; userId: number; memberName: string;
  billingPeriod: string; dueDate: string; remaining: number;
};
export type BankTransaction = {
  id: number; transactionAt: string; amount: number; balance: number | null;
  counterparty: string | null; transactionType: TransactionType;
  matchStatus: MatchStatus; matchedFeeBillId: number | null;
  candidates: MatchCandidate[];   // PENDING 일 때만 채워짐
};
export type SyncResult = { fetched: number; newlyStored: number; autoMatched: number; pendingReview: number };
export type SyncBankTransactionsPayload = { accountPassword: string; residentNumber: string };
export type BankMatchingClub = {
  clubId: number; clubName: string; eligible: boolean; ineligibleReason: string | null; registered: boolean;
};
export type BankMatchingSlots = { registeredCount: number; maxAccounts: number; remaining: number };
```

- [ ] **Step 2: api 클라이언트** (`packages/api/src/client.ts`) — `leader.fees.bank.*` + `admin.bankMatching.*`
`bank.sync(clubId, payload)→SyncResult` / `bank.list(clubId, params)→PageResponse<BankTransaction>` / `bank.approve(clubId, txId, feeBillId)→void` / `bank.ignore(clubId, txId)→void` / `bank.unmatch(clubId, txId)→void`; `admin.bankMatching.list()→{clubs, slots}` / `admin.bankMatching.setActive(clubId, active)→void`. `jsonOk`/`jsonVoid`/`cleanParams` 재사용.

- [ ] **Step 3: hooks + queryKeys** (`packages/hooks/src/{bank.ts,bankQueryKeys.ts}`) — `useBankSyncMutation`·`useBankTransactionsQuery`·`useApproveMatchMutation`·`useIgnoreTransactionMutation`·`useUnmatchTransactionMutation`·`useAdminBankMatchingQuery`·`useSetBankMatchingMutation`. sync/approve/ignore/unmatch 성공 시 거래 목록 + Sprint 2 청구목록(`billsByClub`)·요약(`summaryByClub`) 무효화(매칭이 납부를 만들므로).

- [ ] **Step 4: schemas** (`packages/schemas/src/index.ts`) — `syncBankTransactionsSchema`: `accountPassword`(z.string().min(1)), `residentNumber`(z.string().regex(/^\d{6}$/, '주민번호 앞 6자리')). 한국어 메시지. **클라이언트도 이 값을 저장/로깅하지 않는다**(폼 제출 후 즉시 리셋).

- [ ] **Step 5: typecheck + 커밋**
Run: `cd frontend && pnpm -w typecheck`
```bash
git commit -am "feat(frontend): BANK 매칭 타입·API·훅·스키마 배선"
```

---

## Task FE-2: 총무 거래 탭 — 동기화 모달 + 검토 큐

**Files:** `apps/web/app/manage/clubs/[clubId]/fees/_components/{BankSyncDialog,BankReviewQueue}.tsx`, `_pages/ClubFeesPage.tsx`(거래 탭 추가), test

- [ ] **Step 1: 거래 탭 게이팅** — `ClubFeesPage` 의 탭 배열에 `{ id:'bank', label:'거래' }` 추가(라벨 옆 안내). `useAdminBankMatchingQuery`가 아닌 동아리 단위 사용가능 여부는 **백엔드가 미사용이면 sync/list 403/404** 를 주므로, 거래 탭은 항상 노출하되 미사용 동아리에선 "이 동아리는 BANK 자동매칭 미사용" 안내 카드로 처리(프론트 우회 차단은 백엔드가 담당). (사용가능 플래그를 별도 조회하고 싶으면 `bank.list` 200/403 으로 판별.)
- [ ] **Step 2: BankSyncDialog** — shadcn Dialog(Sprint 2 `RecordPaymentDialog` 패턴). `useForm(zodResolver(syncBankTransactionsSchema))`: 은행(읽기전용, fee_account 은행 라벨)·계좌 비밀번호(`type=password`)·주민번호 앞 6자리(`type=password`, 6자리). `useBankSyncMutation`. 성공 토스트("N건 적재 · M건 자동매칭 · K건 검토 필요") + **폼 즉시 리셋**(민감정보 비보관). `ApiError`(429 rate limit·403 미사용·502 BANK API) 메시지 배너.
- [ ] **Step 3: BankReviewQueue** — `useBankTransactionsQuery(clubId, {status:'PENDING'})`. 카드: 입금액·입금시각·counterparty(있으면) + 후보 청구 리스트(회원명·청구종류·잔액, 정렬됨) 각 [승인]; [무시] 버튼. AUTO/MANUAL_MATCHED 거래 이력 섹션 + [매칭취소]. 승인/무시/매칭취소 mutation + 확인 다이얼로그.
- [ ] **Step 4: 테스트** (Vitest+RTL, `@duing/hooks` mock) — 동기화 모달(주민번호 6자리 검증·성공 토스트·리셋), 검토 큐(후보 표시·승인 호출 인자 feeBillId·무시·매칭취소), 미사용 동아리 안내.
- [ ] **Step 5: typecheck+test+커밋**
```bash
git commit -am "feat(frontend): 회비 거래 탭 — 동기화 모달 + 검토 큐(승인·무시·매칭취소)"
```

---

## Task FE-3: ADMIN 총동연 BANK 등록 페이지

**Files:** `apps/web/app/admin/.../BankMatchingClubs.tsx`(기존 admin 영역에 섹션/페이지), test

- [ ] **Step 1: BankMatchingClubs** — `useAdminBankMatchingQuery()`. 상단 슬롯 현황 `registeredCount/maxAccounts · 남은 N`(한도 차면 [등록] 비활성). 동아리 목록(검색): 동아리명·적격성(부적격 사유 표시)·등록상태·[등록]/[해제](`useSetBankMatchingMutation`, 부적격이면 비활성). 등록 실패(한도초과/미지원) `ApiError` 메시지.
- [ ] **Step 2: admin 라우트 연결** — 기존 admin 관리 영역(`apps/web/app/admin/...`)에 "BANK API 동아리 등록" 섹션/탭으로 배치(기존 admin 페이지 구조·권한 가드 재사용).
- [ ] **Step 3: 테스트** — 적격/부적격 행 렌더·[등록] 호출(active=true)·슬롯 한도 시 비활성·등록 실패 메시지.
- [ ] **Step 4: typecheck+test+커밋**
```bash
git commit -am "feat(frontend): ADMIN 총동연 BANK API 동아리 등록 페이지"
```

---

## Self-Review (작성자 점검)

- **스펙 커버리지**: ADMIN 허용·계좌 등록(BE-3, §8)·등록 원자성(BE-3 §8) / 동기화 멱등 적재·인증정보 비저장(BE-4, §7·§10) / 3단계 매칭(BE-5, §5) / 검토 큐 승인·무시·매칭취소(BE-6, §8) / 매칭 납부 TRANSFER+링크·완납 알림 문구 분기(BE-5, §2.7·§9.3) / transaction_hash 강화(BE-2, §4.2) / 후보 정렬(BE-5·BE-6, §8) / ADMIN 등록 게이팅(FE-3·BE-4, §11) / 보안 회귀(BE-4, §12) — 설계 §3~§13 전 항목 매핑됨.
- **타입 일관성**: `BankTransaction.ingest/matchTo/resetToPending`, `BankMatchingSetting.activate/deactivate/isUsable`, `BankApiClient.{registerAccount,deleteAccount,getAccountStatus,getTransactions}`, `TransactionHasher.hash`, `BankCodeMapper.{toApiCode,isEligible}`, `MatchedPaymentService.createMatchedPayment(tx, feeBillId, actorId, matchStatus, autoMatched)`, `FeePaymentConfirmedEvent(... , autoMatched)` 가 전 구간 동일 시그니처.
- **확인 보류(구현 시작 시 실파일 대조 — placeholder 아님, 기존 구현과 1:1 정렬)**: ① `FeeAccountRepository.findByClubId` 정확한 메서드명(Sprint 1/2 계좌 조회) ② 회원명 조회 컬럼/경로(`club_member`/`users` — Sprint 2 회원명 표시 코드 재사용) ③ `Payment` 엔티티에 `bankTransactionId` 필드+`linkBankTransaction` 세터 추가 위치 ④ `payment.bank_transaction_id` 역참조 조회(`PaymentRepository.findByBankTransactionId…`)로 unmatch 시 ACTIVE 납부 찾기 ⑤ admin 프론트 라우트 실제 위치(`apps/web/app/admin/...`) ⑥ `RestClient` 에러 바디(`success:false, error:{code}`) 파싱 형태(문서상 두 형태 혼재 — 구현 시 실제 응답 대조). ⑦ BANK API 스텁 빈 등록 방식(`@TestConfiguration` `@Primary`).
