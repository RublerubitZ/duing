# 운영진 회비 감사(Admin Fee Audit) 설계

- 작성일: 2026-08-04
- 대상: 백엔드(`backend/`, Spring Boot 3.4 / Java 21) + 프론트(`frontend/apps/web`, Next.js 15 App Router)
- 상태: 설계 확정(2026-08-04 사용자 리뷰 완료 — 열린 논점 4건 확정, 전역 기간 필터·대시보드 활동 요약·Cashbook 확장 방향 반영)
- **SoT**: develop `cc019cd2` 이후 (V104가 최신 마이그레이션 — 신규는 V105부터, 머지 직전 develop 재확인·out-of-order 금지)
- 선행 스펙: [`2026-06-16-fee-system-sprint1-design.md`](./2026-06-16-fee-system-sprint1-design.md) — 회비 도메인 원형, [`2026-08-04-admin-recruitment-management-design.md`](./2026-08-04-admin-recruitment-management-design.md) — 관리자 콘솔·`club_audit_event` 확장 선례, [`2026-07-26-admin-user-management-design.md`](./2026-07-26-admin-user-management-design.md) — 관리자 목록·페이징 선례

---

## 1. 목적 · 원칙

### 1.1 왜 필요한가

회비는 플랫폼에서 유일하게 **돈이 흐르는 도메인**인데, 현재 총동아리연합회(ADMIN)가 볼 수 있는 것은 BANK 자동매칭 허용 현황(`GET /admin/clubs/bank-matching`) 하나뿐이다. 동아리 회비 운영은 전적으로 운영진(LEADER/OFFICER)의 손에 있고, 다음 상황에서 총동연은 대응 수단이 없다.

- **민원 대응** — "회비를 냈는데 미납 처리됐다", "낸 회비가 어디로 갔는지 모르겠다" 류의 회원 민원이 들어오면, 총동연이 해당 동아리의 청구·납부 이력을 직접 확인할 방법이 없어 운영진의 말에 의존해야 한다.
- **정기 감사** — 학기말·연말 회비 운영 실태 점검(수납률, 미수금, 취소·정정 빈도) 시 동아리별로 자료 제출을 요구하는 수작업뿐이다.
- **이상 운영 탐지** — 납부 취소 남발, 수동 매칭 과다, 계좌 빈번 교체 같은 위험 신호를 아무도 보고 있지 않다.

### 1.2 감사자 원칙 — Read Only

이 기능의 뼈대가 되는 원칙. **ADMIN은 감사자(auditor)이지 회계 주체가 아니다.**

| 구분 | 내용 |
|---|---|
| **ADMIN 가능** | 전 동아리 회비 현황 조회, 동아리별 청구·납부·정책·계좌(마스킹) 조회, 감사 로그 조회, 이상징후 조회, CSV 다운로드(P2), 감사 의견·운영 메모 작성, 증빙 요청 생성(P3) |
| **ADMIN 불가** | 회비 정책 생성·수정·삭제, 청구 발행·취소, 납부 기록·승인·정정(VOID), 매칭 승인·취소, 환불, 계좌 등록·수정·삭제, 회원 회비 변경·면제, 금액 변경 — **일체의 회계 데이터 쓰기** |

Read Only의 정확한 경계: **동아리 회계 데이터(`fee_policy`·`fee_bill`·`payment`·`fee_account`·`bank_transaction`)에 대해 ADMIN 쓰기 API는 이 스펙에 존재하지 않으며, 향후에도 이 콘솔에 추가하지 않는다.** ADMIN이 쓰는 것은 자신의 감사 산출물(감사 의견·운영 메모·증빙 요청)과 감사 로그의 열람 이벤트뿐이다.

> **설계 결정 — 기존 `PUT /admin/clubs/{clubId}/bank-matching`(BANK 매칭 허용 토글)은 이 원칙과 충돌하지 않는다.** 그것은 플랫폼 기능 게이트(허용 목록 관리)이지 회계 데이터 개입이 아니다. 해당 화면(`/admin/bank-matching`)은 그대로 두고, 회비 감사 콘솔의 계좌 탭에서 링크로만 연결한다.

---

## 2. 도메인 전제 (코드 근거)

| 사실 | 근거 |
|---|---|
| 회비 엔티티 6종: `FeePolicy`(fee_policy), `FeeBill`(fee_bill), `Payment`(payment), `FeeAccount`(fee_account), `BankTransaction`(bank_transaction), `BankMatchingSetting`(bank_matching_setting). 연관관계 매핑 없이 raw `Long` id 참조 | `backend/src/main/java/com/duing/domain/fee/entity/` |
| 청구 상태 `FeeStatus = PENDING, PAID, PARTIAL_PAID, OVERDUE, CANCELLED` — 사용자 요구의 UNPAID는 코드에 없고 PENDING(+PARTIAL_PAID)이 대응 | `fee/entity/FeeStatus.java` |
| **OVERDUE 전이는 실시간이 아니다** — `OverdueBillJob`(00:10 KST, `@ConditionalOnProperty` opt-in)이 돌아야 PENDING→OVERDUE. 잡 실행 전·비활성 시 DB status만 믿으면 연체 집계가 틀어진다 | `fee/job/OverdueBillJob.java` |
| 납부는 삭제 대신 정정: `PaymentStatus = ACTIVE, VOIDED`, `voidedBy/voidedAt/voidReason` 컬럼으로 이력 보존 | `fee/entity/Payment.java` |
| 거래 매칭 상태 `MatchStatus = PENDING, AUTO_MATCHED, MANUAL_MATCHED, IGNORED` — 수동 승인(`approve`)·무시(`ignore`)·매칭 취소(`unmatch`)가 이미 존재 | `fee/entity/BankTransaction.java`, `fee/service/GeneralBankTransactionReviewService.java` |
| `PaymentMethod.AUTO_MATCHED`는 저장되지 않는 죽은 값 — BANK 매칭 납부도 `TRANSFER`로 기록. 자동/수동 판별은 `payment.bank_transaction_id` → `bank_transaction.match_status` 조인으로 | `fee/service/GeneralMatchedPaymentService.java`, `GeneralPaymentService.java:45` |
| **환불(refund)·회비 면제(waive/exempt)는 도메인에 존재하지 않음** (코드·DB 히트 0건) | `src/main/java` 전수 grep |
| 계좌번호는 AES-256-GCM 암호화 저장, ADMIN 노출은 `AccountNumberMasker`(끝 4자리) 마스킹 선례 존재. 복호화 실패 시 null로 graceful degrade | `fee/support/AccountNumberMasker.java`, `fee/service/GeneralBankMatchingAdminService.java` |
| 전화번호 마스킹 유틸 존재 | `user/support/PhoneMasker.java` |
| `club_audit_event`(V102)는 append-only 범용 감사 테이블 — 수정·삭제 메서드 없는 정적 팩토리, 대상은 id로만 보유. V102 주석에 **"도메인별 감사 테이블 신설 금지"** 명시. V104(#877)가 관리자 액션(`RECRUITMENT_FORCE_CLOSED`, `APPLICATION_VIEWED`)으로 확장한 선례 | `clubaudit/entity/ClubAuditEvent.java`, `db/migration/V102`·`V104` |
| **회비 도메인은 현재 `club_audit_event`를 전혀 쓰지 않음** — 감사 흔적은 `log.info` 구조화 로그뿐 | `fee/service/General*Service.java` |
| 기존 회비 서비스는 전부 `clubAuthService.requireManager` 가드 내장 → **admin 경로에서 서비스 재사용 불가**, 리포지토리·DTO 레벨만 재사용 (관리자 모집 관리와 동일한 경계) | `fee/service/GeneralFeeBillSummaryService.java:22` 등 |
| 운영진 수납 집계 DTO 원형 존재: `FeeBillSummary(totalBilled, totalPaid, outstanding, collectionRate, billCount, 상태별 count)` | `fee/service/dto/query/FeeBillSummary.java` |
| 관리자 API 이중 방어: 컨트롤러 `@PreAuthorize("hasRole('ADMIN')")` + URL 레이어 `/api/v1/admin/**` → `hasRole("ADMIN")` 백스톱. **모든 관리자 엔드포인트는 반드시 `/api/v1/admin/` 하위** | `global/config/SecurityConfig.java:97` |
| 관리자 목록 페이징 선례 두 갈래: `Pageable`+`PageResponse<T>`(회원 관리) vs 무페이징 List(모집 관리). 커서 페이지네이션 전례 없음 | `global/response/PageResponse.java` |
| 감사 이벤트를 기록하는 조회 API는 `@Transactional(readOnly = true)` 금지 — readOnly에서 INSERT는 실 PG 500 | 관리자 모집 관리 계획 문서에 기록된 함정 |
| 회원 식별: 학번 `users.student_id`, 기수 `club_member.generation`, 시스템 역할 `UserRole { STUDENT, ADMIN }` | `user/entity/UserRole.java`, `clubmember/` |
| CSV 백엔드 생성 선례: `ResponseEntity<byte[]>` + RFC 5987 한글 파일명 + UTF-8 BOM + CRLF + 수식 인젝션 방지 + 다운로드 감사 이벤트 | `facilitysubmission/service/export/CsvSubmissionWriter.java` |
| 신규 테이블은 RLS 필수 (`ENABLE ROW LEVEL SECURITY` 누락 시 빌드 실패) | `test/.../global/RowLevelSecurityMigrationTest.java` |

---

## 3. 데이터 모델

### 3.1 `club_audit_event` 확장 (V105) — 회비 이벤트

V102의 "도메인별 감사 테이블 신설 금지" 원칙에 따라 **회비 전용 감사 테이블을 만들지 않고 `club_audit_event`에 이벤트 타입을 추가**한다. V104가 확립한 확장 절차(참조 컬럼 추가 + `event_type` CHECK 재작성)를 그대로 따른다.

```sql
-- V105__club_audit_event_fee_events.sql
ALTER TABLE club_audit_event
    ADD COLUMN fee_policy_id       BIGINT,
    ADD COLUMN fee_bill_id         BIGINT,
    ADD COLUMN payment_id          BIGINT,
    ADD COLUMN bank_transaction_id BIGINT,
    ADD COLUMN detail              JSONB;

-- event_type CHECK 재작성: V102 말미에 문서화된 절차(DROP CONSTRAINT → 전체 목록 ADD) 그대로 — V104가 실행 선례.
-- 제약 이름은 club_audit_event_event_type_check (V104에서 확정).
-- 기존 8종 + 아래 15종 (최장 24자 — VARCHAR(30) 수용 확인):
--   FEE_POLICY_CREATED, FEE_POLICY_UPDATED, FEE_POLICY_DELETED,
--   FEE_BILL_ISSUED, FEE_BILL_CANCELLED,
--   FEE_PAYMENT_RECORDED, FEE_PAYMENT_VOIDED,
--   FEE_TX_MANUAL_MATCHED, FEE_TX_IGNORED, FEE_TX_UNMATCHED,
--   FEE_ACCOUNT_REGISTERED, FEE_ACCOUNT_UPDATED, FEE_ACCOUNT_DELETED,
--   FEE_ADMIN_DETAIL_VIEWED, FEE_ADMIN_CSV_DOWNLOADED

CREATE INDEX idx_club_audit_event_club_type ON club_audit_event (club_id, event_type, created_at);
CREATE INDEX idx_bank_tx_club_at ON bank_transaction (club_id, transaction_at);  -- 목록 '최근 거래일' max용 (기존엔 club_id+status뿐)
```

- 참조 컬럼의 FK 제약 여부는 V104의 `application_id`와 동일하게 맞춘다(구현 시 V104 실물 확인). 회비 테이블은 전부 soft delete라 참조 무결성 유지에 문제 없다.
- `detail JSONB`: 변경 전/후 값 스냅샷. **id·숫자·enum만 담는다 — 이름·전화번호·계좌번호 등 PII 저장 금지** (조회 시 조인으로 해석). 예: `{"amount": {"old": 10000, "new": 30000}}`.
- `reason VARCHAR(500)`(V104 기존 컬럼)을 납부 정정 사유(`voidReason`) 등에 재사용.
- append-only 불변: 엔티티에 수정·삭제 메서드를 추가하지 않는다. 정적 팩토리만 추가.

### 3.2 `admin_fee_audit_comment` (V106) — 감사 의견 + 운영 메모

감사 의견(상태 워크플로 있음)과 운영 메모(자유 기록)는 "ADMIN이 동아리에 남기는 텍스트"라는 동일 구조라 **테이블 하나에 `kind`로 구분**한다 (→ §15 결정 2).

```sql
-- V106__admin_fee_audit_comment.sql
CREATE TABLE admin_fee_audit_comment (
    id              BIGSERIAL PRIMARY KEY,
    club_id         BIGINT       NOT NULL REFERENCES club (id),
    author_user_id  BIGINT       NOT NULL REFERENCES users (id),
    kind            VARCHAR(20)  NOT NULL,
    status          VARCHAR(20),
    content         VARCHAR(2000) NOT NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),   -- BaseEntity 컨벤션 따름
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMP,
    CONSTRAINT chk_fee_audit_comment_kind   CHECK (kind IN ('AUDIT_OPINION', 'OPERATION_MEMO')),
    CONSTRAINT chk_fee_audit_comment_status CHECK (
        (kind = 'AUDIT_OPINION'  AND status IN ('OPEN', 'IN_REVIEW', 'RESOLVED'))
     OR (kind = 'OPERATION_MEMO' AND status IS NULL)
    )
);
CREATE INDEX idx_fee_audit_comment_club ON admin_fee_audit_comment (club_id, created_at DESC);
ALTER TABLE admin_fee_audit_comment ENABLE ROW LEVEL SECURITY;
```

- `status` 라벨: `OPEN` 진행중 / `IN_REVIEW` 확인중 / `RESOLVED` 완료.
- BaseEntity 상속(soft delete). 의견·메모는 감사 **산출물**이지 감사 **대상**이 아니므로 append-only를 적용하지 않는다 — 수정·삭제 허용 (→ §15 결정 3).
- ADMIN 전용 데이터: 동아리 측에는 어떤 API로도 노출되지 않는다.

### 3.3 `fee_anomaly` (P2) — 이상징후 지속화

P1은 상세 화면 진입 시 on-demand 계산이라 테이블이 없다 (→ §5). P2에서 목록 컬럼·대시보드 집계·확인 처리(ack)가 필요해질 때 야간 배치가 쓰는 스냅샷 테이블을 추가한다.

```sql
-- P2 스케치 (번호는 착수 시점에 확정)
CREATE TABLE fee_anomaly (
    id           BIGSERIAL PRIMARY KEY,
    club_id      BIGINT      NOT NULL REFERENCES club (id),
    rule_id      VARCHAR(10) NOT NULL,          -- FA-01 ~
    severity     VARCHAR(10) NOT NULL,          -- INFO/WARNING/HIGH/CRITICAL
    evidence     JSONB       NOT NULL,          -- 판정 근거 수치 (PII 금지)
    detected_at  TIMESTAMP   NOT NULL,
    resolved_at  TIMESTAMP,                     -- ADMIN 확인 처리
    resolved_by  BIGINT REFERENCES users (id),
    ...
);
```

### 3.4 `evidence_request` / `evidence_file` (P3) — 증빙 요청

엔티티 스케치만 확정하고 DDL은 착수 시점에 작성한다.

- `EvidenceRequest`: `clubId`, `requesterUserId`(ADMIN), `title`, `description(1000)`, `dueDate`, `status ∈ (REQUESTED, SUBMITTED, RETURNED, CONFIRMED, CANCELLED)`
- `EvidenceFile`: `evidenceRequestId`, `objectKey`, `originalName`, `size`, `contentType`, `uploadedBy`(동아리 운영진)
- 워크플로는 §7.12, 스토리지·보존 정책은 P3 착수 시 일괄 설계 (→ §15 결정 14).

### 3.5 신규 Entity 정리 (사용자 요구 §16 대응)

| 후보 Entity | 판정 | 근거 |
|---|---|---|
| 회비 감사 로그 테이블 | ❌ 신설 안 함 | `club_audit_event` 확장이 정석 (V102 설계 의도) |
| `AdminFeeAuditComment` | ✅ 신규 (V106, P1) | 감사 의견+운영 메모, 기존 테이블에 대응물 없음 |
| `FeeAnomaly` | ✅ 신규 (P2) | P1은 on-demand 계산으로 무테이블 |
| `EvidenceRequest` / `EvidenceFile` | ✅ 신규 (P3) | 선택 기능, 비공개 스토리지 결정 선행 |

---

## 4. 감사 이벤트 계측 — 기존 변이 지점 → 이벤트 매핑

회비 감사 로그는 **지금부터 쌓아야 나중에 볼 수 있다.** 그래서 계측(PR-1)이 이 기능 전체에서 가장 먼저 나가는 조각이다. 기존 운영진 변이 서비스에 `ClubAuditEvent` 기록을 추가한다 (선례: `GeneralJoinRequestService`가 `ClubAuditEventRepository.save(ClubAuditEvent.joinRequest(...))` 직접 호출).

| 이벤트 타입 | 발생 지점 | 참조 컬럼 | detail 예시 |
|---|---|---|---|
| `FEE_POLICY_CREATED` | `GeneralFeePolicyService.create` | fee_policy_id | `{"amount": 30000, "billingType": "SEMESTER"}` |
| `FEE_POLICY_UPDATED` | `GeneralFeePolicyService.update` | fee_policy_id | 변경 필드 old/new diff |
| `FEE_POLICY_DELETED` | `GeneralFeePolicyService.delete` | fee_policy_id | — |
| `FEE_BILL_ISSUED` | `GeneralFeeBillService.generate` (일괄 발행 1회당 1건) | fee_policy_id | `{"issuedCount": 42, "billingPeriod": "2026-2"}` |
| `FEE_BILL_CANCELLED` | `GeneralFeeBillService.cancel` | fee_bill_id | `{"amount": 30000, "status": "PENDING"}` |
| `FEE_PAYMENT_RECORDED` | `GeneralPaymentService.record` + `GeneralMatchedPaymentService.createMatchedPayment` | fee_bill_id, payment_id, (bank_transaction_id) | `{"amount": 30000, "method": "TRANSFER", "autoMatched": true}` |
| `FEE_PAYMENT_VOIDED` | `GeneralPaymentService.voidPayment` **및** `GeneralBankTransactionReviewService.unmatch` | fee_bill_id, payment_id | `{"amount": 30000}` + reason=voidReason |
| `FEE_TX_MANUAL_MATCHED` | `GeneralBankTransactionReviewService.approve` | bank_transaction_id, fee_bill_id | `{"amount": 30000}` |
| `FEE_TX_IGNORED` | `...ReviewService.ignore` | bank_transaction_id | — |
| `FEE_TX_UNMATCHED` | `...ReviewService.unmatch` | bank_transaction_id, fee_bill_id | — |
| | ⚠ unmatch는 `payment.voidPayment(...)` **엔티티 메서드 직접 호출**이라 서비스 계측만으론 VOID 이벤트가 누락된다 — unmatch 지점에서 `FEE_TX_UNMATCHED`+`FEE_PAYMENT_VOIDED` 2건을 함께 기록 | | |
| `FEE_ACCOUNT_REGISTERED` / `FEE_ACCOUNT_UPDATED` | `GeneralFeeAccountService.upsert` (신규/변경 분기) | — | `{"bank": "KB"}` — 계좌번호 저장 금지 |
| `FEE_ACCOUNT_DELETED` | `GeneralFeeAccountService.delete` | — | `{"bank": "KB"}` |
| `FEE_ADMIN_DETAIL_VIEWED` | 신규 `GeneralAdminFeeAuditQueryService.getClubDetail` (상세 진입 시) | — | — |
| `FEE_ADMIN_CSV_DOWNLOADED` | 신규 CSV 다운로드 (P2) | — | `{"rows": 120}` |

계측 규칙:

- **actor는 항상 사람.** `club_audit_event.actor_user_id NOT NULL`을 유지한다. 자동 발행(`MonthlyBillIssueJob`)·연체 전이(`OverdueBillJob`) 등 **시스템 잡은 계측하지 않는다** — 자동 발행은 운영진의 `autoIssue` 정책 설정(그 자체가 감사됨)에서 파생되고, OVERDUE 전이는 상태값으로 확인 가능하다 (→ §15 결정 4). BANK 자동매칭 납부는 sync를 트리거한 운영진이 actor다.
- 기록은 변이와 **같은 트랜잭션** 안에서 수행 (운영진 변이 서비스는 이미 쓰기 트랜잭션이라 추가 비용 없음). 감사 기록 실패 = 변이 롤백 — 감사 없는 변이를 허용하지 않는다.
- `FEE_ADMIN_DETAIL_VIEWED`를 기록하는 관리자 상세 API는 `readOnly = true` 금지 (§2 함정).
- 열람 이벤트 단위는 "동아리 상세 진입 1회당 1건"이다. 청구·납부 탭 API마다 기록하면 화면 하나에 3~4건씩 쌓여 노이즈만 커진다. 선례(`APPLICATION_VIEWED` = 지원서 상세 열람 단위)와 같은 굵기 (→ §15 결정 5).

---

## 5. 이상징후 (Audit Rule)

### 5.1 Rule 정의

데이터 소스는 회비 테이블 직접 집계(payment·fee_bill·fee_account)와 `club_audit_event`(FEE_*) 두 갈래 — 이벤트 기반 Rule은 계측(PR-1) 배포 이후 데이터부터 유효하다.

**윈도우 = 전역 기간 필터**(→ §7.0, 기본 최근 30일)를 따른다. 예외는 버스트 탐지 Rule(FA-05·FA-06) — 짧은 고유 윈도우가 판정 정의의 일부라 기간과 무관하게 현재 기준으로 평가한다(과거 시점 버스트의 소급 탐지는 P2 야간 배치의 일 단위 스냅샷이 자연히 커버). 긴 기간 선택 시 건수 임계값은 환산하지 않는다 — 과탐 성향은 감사 특성상 의도된 보수성이다(놓침보다 낫다).

| Rule | 이름 | 조건 (윈도우) | Severity | 소스 |
|---|---|---|---|---|
| FA-01 | 수동 매칭 비율 과다 | 기간 내 매칭 완료 거래 중 MANUAL_MATCHED ≥ 60% 이고 ≥ 5건 | WARNING | bank_transaction |
| | | ≥ 80% 이고 ≥ 10건 | HIGH | |
| FA-02 | 납부 정정(VOID) 과다 | 기간 내 VOIDED 납부 ≥ 3건 | WARNING | payment |
| | | ≥ 8건 | HIGH | |
| FA-03 | 청구 취소 과다 | 기간 내 CANCELLED 청구가 발행분의 ≥ 20% 이고 ≥ 5건 | WARNING | fee_bill |
| FA-04 | 마감 후 정정 | 마감일(due) 경과 청구의 납부 VOID — 기간 내 ≥ 1건 | INFO | payment ⋈ fee_bill |
| | | ≥ 3건 | WARNING | |
| FA-05 | 동일 운영진 반복 변경 | 동일 actor의 7일 내 (정정+취소+정책 수정) ≥ 5건 — 고유 윈도우 고정 | HIGH | club_audit_event |
| FA-06 | 단시간 대량 변경 | 24시간 내 FEE_* 변이 이벤트 ≥ 20건 — 고유 윈도우 고정 | HIGH | club_audit_event |
| | | ≥ 50건 | CRITICAL | |
| FA-07 | 정책 금액 급변 | 기간 내 동일 정책 금액 변경 ≥ 3회 | WARNING | club_audit_event (detail.amount) |
| FA-08 | 계좌 빈번 교체 | 기간 내 계좌 변경·삭제 ≥ 2회 (기간이 90일 미만이면 90일로 하한) | CRITICAL | club_audit_event |

Severity 의미: `INFO` 참고(정상 운영에서도 발생) / `WARNING` 패턴 주시 / `HIGH` 감사 의견 작성 검토 / `CRITICAL` 즉시 확인(수납 경로 변조 리스크).

### 5.2 계산 방식 — P1 on-demand, P2 배치

- **P1**: 동아리 상세의 이상징후 탭 진입 시 8개 Rule을 그 자리에서 평가해 반환한다. 동아리 1개 × 윈도우 30~90일 집계 쿼리 몇 개 — 인덱스(§10) 하에 수 ms. 임계값은 서비스 상수로 하드코딩한다.
- **P2**: 목록의 "이상징후" 컬럼·대시보드 "이상징후 동아리 수"는 전 동아리 × 8 Rule이라 야간 배치(`FeeAnomalyScanJob`, 기존 잡처럼 `@ConditionalOnProperty` opt-in)가 `fee_anomaly`에 스냅샷을 남기고, 목록은 그 존재 여부만 조인한다. ADMIN 확인 처리(resolve)도 이때 추가. 임계값도 이 시점에 프로퍼티로 승격.
- Rule 엔진·인터페이스 추상화는 만들지 않는다. Rule 8개는 각각 쿼리 하나 + 임계 비교라 메서드 8개로 충분하다 (→ §15 결정 6).

---

## 6. 백엔드 설계

### 6.1 패키지 — 기존 `domain/fee/` 확장

```
domain/fee/
├── api/
│   └── AdminFeeAuditApi.java                       # 신규 — 매핑·Swagger 어노테이션은 여기만
├── controller/
│   ├── AdminFeeAuditController.java                # 신규 — @RequestMapping("/api/v1") + @PreAuthorize("hasRole('ADMIN')")
│   └── dto/response/
│       ├── AdminFeeClubSummaryResponse.java        # 신규 (목록 행)
│       ├── AdminFeeDashboardResponse.java          # 신규
│       ├── AdminFeeClubDetailResponse.java         # 신규 (KPI)
│       ├── AdminFeePolicyResponse.java             # 신규
│       ├── AdminFeeBillRowResponse.java            # 신규
│       ├── AdminFeePaymentRowResponse.java         # 신규
│       ├── AdminFeeAccountResponse.java            # 신규 (마스킹)
│       ├── AdminFeeAuditLogResponse.java           # 신규
│       ├── AdminFeeAnomalyResponse.java            # 신규
│       └── AdminFeeAuditCommentResponse.java       # 신규
├── service/
│   ├── AdminFeeAuditQueryService.java / GeneralAdminFeeAuditQueryService.java      # 신규 — 조회 전담
│   ├── AdminFeeAnomalyService.java   / GeneralAdminFeeAnomalyService.java          # 신규 — Rule 평가
│   ├── AdminFeeAuditCommentService.java / GeneralAdminFeeAuditCommentService.java  # 신규 — 의견·메모 CRUD
│   └── dto/query/
│       ├── AdminFeeClubSearchCondition.java        # 신규 (q, usage)
│       ├── AdminFeeClubSort.java                   # 신규 enum
│       ├── AdminFeeClubRow.java                    # 신규 (집계 프로젝션)
│       └── AdminFeeBillSearchCondition.java        # 신규
├── repository/
│   ├── FeeBillRepositoryImpl.java                  # 확장 — admin 횡단 집계 쿼리 추가
│   └── AdminFeeAuditCommentRepository.java         # 신규
└── entity/
    └── AdminFeeAuditComment.java                   # 신규
```

`clubaudit` 쪽: `ClubAuditEventType`에 FEE_* 15종 추가, `ClubAuditEvent`에 회비용 정적 팩토리 추가, `ClubAuditEventRepository`에 회비 감사 로그 조회 메서드(club_id + FEE_* 타입 필터 + 페이징) 추가 — 현재 조회 메서드 0개인 것은 "조회 화면은 후속" 의도였고 이 스펙이 그 후속이다.

### 6.2 재사용 경계

- 기존 `General*` 회비 서비스는 `requireManager`가 박혀 있어 **호출 금지**. 재사용은 리포지토리(`FeeBillRepositoryImpl` QueryDSL)·쿼리 DTO(`FeeBillSummary`)·지원 컴포넌트(`AccountNumberMasker`, `FeeAccountCipher`) 레벨까지만.
- 기존 회비 리포지토리 쿼리는 `clubId` 필수 가드가 걸려 있어 전 동아리 횡단 조회 불가 — admin용 집계 쿼리는 신규 작성한다.
- admin 서비스에는 `requireManager`를 넣지 않는다 (선례: `GeneralAdminRecruitmentQueryService` — "admin은 전 동아리 접근이 정당하다").

### 6.3 트랜잭션

- `GeneralAdminFeeAuditQueryService.getClubDetail`만 쓰기 트랜잭션 (`FEE_ADMIN_DETAIL_VIEWED` INSERT). 나머지 조회는 `readOnly = true`.
- 시각은 주입 `Clock`(seoulClock) 사용, 감사 이벤트 `created_at` 등 FE 절대시각 변환은 기존 타임존 규약(TIMEZONE.md) 따름.

### 6.4 CSV (P2)

`GET /admin/fees/{clubId}/bills/csv` — 청구+납부 현황 전체. `CsvSubmissionWriter` 패턴 복제(BOM·CRLF·RFC4180·수식 인젝션 방지), `ResponseEntity<byte[]>` + RFC 5987 한글 파일명(`{동아리명}_회비감사_{YYYY-MM-DD}.csv`) + `X-Content-Type-Options: nosniff`, 다운로드마다 `FEE_ADMIN_CSV_DOWNLOADED` 기록. CSV에 전화번호는 포함하지 않는다(§9).

---

## 7. API 설계

베이스 `/api/v1`, `ApiResponse<T>` 래퍼, DTO는 record + static `from()`. 전부 👑 ADMIN (`@PreAuthorize` + URL 레이어 이중 방어). 사용자 요구의 예시 경로(`GET /admin/fees` 등)를 레포 컨벤션에 맞춰 확정한 것이 아래다.

| # | 메서드 · 경로 | 단계 | 설명 |
|---|---|---|---|
| 1 | `GET /admin/fees` | P1 | 동아리 회비 현황 목록 (페이징·검색·정렬) |
| 2 | `GET /admin/fees/dashboard` | P1 | 전체 현황 KPI |
| 3 | `GET /admin/fees/{clubId}` | P1 | 동아리 상세 KPI — **열람 이벤트 기록** |
| 4 | `GET /admin/fees/{clubId}/policies` | P1 | 회비 정책 목록 (납부율 포함) |
| 5 | `GET /admin/fees/{clubId}/bills` | P1 | 청구 내역 (페이징·상태 필터·검색) |
| 6 | `GET /admin/fees/{clubId}/payments` | P1 | 납부 내역 (페이징·상태 필터) |
| 7 | `GET /admin/fees/{clubId}/account` | P1 | 계좌 정보 (마스킹, GET만 존재) |
| 8 | `GET /admin/fees/{clubId}/audit-logs` | P1 | 감사 로그 (페이징·타입·기간 필터) |
| 9 | `GET /admin/fees/{clubId}/anomalies` | P1 | 이상징후 on-demand 평가 |
| 10 | `GET /admin/fees/{clubId}/audit-comments` | P1 | 감사 의견·운영 메모 목록 |
| 11 | `POST /admin/fees/{clubId}/audit-comments` | P1 | 의견·메모 작성 |
| 12 | `PATCH /admin/fees/{clubId}/audit-comments/{commentId}` | P1 | 내용·상태 수정 |
| 13 | `DELETE /admin/fees/{clubId}/audit-comments/{commentId}` | P1 | soft delete |
| 14 | `GET /admin/fees/{clubId}/bills/csv` | P2 | CSV 다운로드 — **다운로드 이벤트 기록** |
| 15 | `POST /admin/fees/{clubId}/evidence-requests` 외 | P3 | 증빙 요청 (§7.12) |

`{clubId}` 경로와 리터럴 세그먼트(`dashboard`)가 겹치지 않도록 리터럴 경로를 먼저 선언한다 (Spring은 리터럴 우선 매칭이지만 Swagger 정렬을 위해서도 명시).

### 7.0 공통 기간 파라미터

감사 콘솔 전역에서 하나의 기간 기준을 쓴다. 조회 API는 공통으로 `from`/`to`(KST 날짜, 각각 생략 가능)를 받고, 리소스별 기준 시각은 아래로 고정한다.

| 리소스 | 기준 | 생략 시 |
|---|---|---|
| 목록(§7.1)·대시보드(§7.2)·상세 KPI(§7.3) | 청구 `created_at`으로 청구 집합을 자르고, 수납액은 **그 집합의** ACTIVE 납부 합계(납부 시점 무관 — 기간 경계에서 수납률·미수금이 자기모순 나지 않도록) | 전체 기간 |
| 정책(§7.4) | 납부율 분모 = 기간 내 발행 청구(`created_at`) | 전체 기간 |
| 청구(§7.5) | `created_at` | 전체 기간 |
| 납부(§7.6) | `paid_at` | 전체 기간 |
| 감사 로그(§7.8) | `created_at` | 전체 기간 |
| 이상징후(§7.9) | Rule 평가 윈도우 자체(§5.1) | 최근 30일 |

프리셋(최근 30일 · 최근 90일 · 이번 학기 · 올해 · 직접 선택)은 **FE가 from/to로 환산해서 보낸다** — 서버에 학기 개념을 심지 않는다. 학기 경계는 FE 상수: 1학기 3/1~8/31, 2학기 9/1~익년 2월 말(KST).

### 7.1 `GET /admin/fees` — 동아리 목록

파라미터: `q`(동아리명 contains, ignoreCase) · `usage`(`USING`/`NOT_USING`, 생략=전체) · `from`/`to`(§7.0) · `sort`(`OUTSTANDING`기본/`BILLED`/`COLLECTED`/`RECENT_PAYMENT`/`NAME`) · `page`/`size`(Pageable). 회비 데이터는 건수가 커지므로 `Pageable` + `PageResponse<T>`(회원 관리 선례)를 쓴다 — 모집 관리의 무페이징은 따르지 않는다.

컬럼별 데이터 소스 (CANCELLED 청구는 모든 집계에서 제외):

목록 스코프: `deleted_at IS NULL` + `club.status IN (ACTIVE, INACTIVE)`. INACTIVE(비활성)도 포함한다 — 비활성 수순의 동아리야말로 미수금 감사가 필요하다(행에 상태 배지 표기). PENDING_APPROVAL·REJECTED는 회비 데이터가 존재할 수 없어 제외.

| 응답 필드 | 소스 |
|---|---|
| `clubName` | `club.name` (+ `clubStatus` — INACTIVE 배지용) |
| `feeUsing` | 활성 `fee_policy` ≥ 1 **또는** 청구 이력 ≥ 1 (→ §15 결정 7) |
| `activePolicyCount` | `fee_policy` where active |
| `memberCount` | 활성 `club_member` 수 |
| `billCount` / `totalBilled` | `fee_bill` count / sum(amount) |
| `totalPaid` | `payment` sum(amount) where ACTIVE (fee_bill 조인으로 club 스코프) |
| `outstanding` | `totalBilled - totalPaid` |
| `unpaidMemberCount` | distinct `user_id` where status ∈ (PENDING, PARTIAL_PAID, OVERDUE) |
| `lastPaidAt` | max(`payment.paid_at`) ACTIVE |
| `lastTransactionAt` | max(`bank_transaction.transaction_at`) |
| `hasAnomaly` | **P2** (`fee_anomaly` 존재 조인) — P1 응답에서는 필드 자체를 미포함 |

```json
// 200 — PageResponse<AdminFeeClubSummaryResponse>
{
  "content": [
    {
      "clubId": 12, "clubName": "멋쟁이사자처럼", "clubStatus": "ACTIVE", "feeUsing": true,
      "activePolicyCount": 1, "memberCount": 48,
      "billCount": 96, "totalBilled": 2880000, "totalPaid": 2550000,
      "outstanding": 330000, "unpaidMemberCount": 11,
      "lastPaidAt": "2026-08-01T05:12:44Z", "lastTransactionAt": "2026-08-03T01:30:00Z"
    }
  ],
  "page": 0, "size": 20, "totalElements": 64, "totalPages": 4, "hasNext": true
}
```

### 7.2 `GET /admin/fees/dashboard`

파라미터: `from`/`to`(§7.0 — 집계 범위).

```json
{
  "clubCount": 182, "feeUsingClubCount": 64,
  "totalBilled": 48200000, "totalPaid": 41350000, "totalOutstanding": 6850000,
  "collectionRate": 85.8,
  "openOpinionCount": 3,
  "recentActivity": {
    "since": "2026-08-03T15:00:00Z",
    "eventCounts": { "FEE_POLICY_UPDATED": 2, "FEE_PAYMENT_VOIDED": 5, "FEE_ACCOUNT_UPDATED": 1 },
    "newOpinionCount": 3
  }
}
```

- `recentActivity` — **최근 변경 요약**: 감사 로그 전체를 열지 않고도 "오늘 무슨 일이 있었나"를 첫 화면에서 파악하는 영역. `since` = KST 오늘 00:00(고정 — 전역 기간 필터와 무관), `eventCounts` = FEE_* **변이** 이벤트(열람 이벤트 제외) 타입별 건수 Map(0건 키 없음, `club_audit_event` GROUP BY 한 방), `newOpinionCount` = 오늘 생성된 감사 의견 수. FE는 "오늘: 정책 변경 2 · 납부 정정 5 · 계좌 변경 1 · 신규 의견 3" 한 줄로 렌더.
- `openOpinionCount`·`recentActivity`는 V106(PR-3)에 종속되므로 **PR-3에서 추가**된다 — PR-2 시점 응답에는 필드 미포함. `anomalyClubCount`는 P2에서 추가.

### 7.3 `GET /admin/fees/{clubId}` — 상세 KPI

`FeeBillSummary` 원형을 admin 스코프로 재구성.

**연체는 DB status가 아니라 파생 계산이다** (→ §15 결정 10). `OverdueBillJob`은 자정 배치 + env opt-in이라 status `OVERDUE`는 최대 1일 지연되거나 영영 안 나올 수 있다. 감사 콘솔은 정확성이 목적이므로 미납/연체를 마감일로 가른다:

- 완납 `paidCount` = status PAID
- 미납 `unpaidCount` = status ∈ (PENDING, PARTIAL_PAID, OVERDUE) **and** `due_date ≥ today`
- 연체 `overdueCount` = status ∈ (PENDING, PARTIAL_PAID, OVERDUE) **and** `due_date < today`
- 취소 `cancelledCount` = status CANCELLED (집계 제외 대상 표시용)

```json
{
  "clubId": 12, "clubName": "멋쟁이사자처럼", "clubStatus": "ACTIVE",
  "memberCount": 48, "activePolicyCount": 1,
  "billCount": 96,
  "paidCount": 80, "unpaidCount": 8, "overdueCount": 7, "cancelledCount": 1,
  "totalBilled": 2880000, "totalPaid": 2550000, "outstanding": 330000,
  "collectionRate": 88.5,
  "bankMatchingActive": true
}
```

이 API 호출 시 `FEE_ADMIN_DETAIL_VIEWED` 기록 (쓰기 트랜잭션).

### 7.4 `GET /admin/fees/{clubId}/policies`

파라미터: `from`/`to`(§7.0). 납부율 = 해당 정책의 기간 내 발행 청구(CANCELLED 제외) 중 PAID 비율.

```json
[
  {
    "policyId": 3, "name": "2026-2학기 회비", "amount": 30000,
    "billingType": "SEMESTER", "targetType": "ALL_MEMBERS",
    "active": true, "autoIssue": false, "issueDay": null, "dueDay": null,
    "billCount": 48, "paidCount": 40, "paymentRate": 83.3,
    "createdAt": "2026-07-01T00:10:00Z"
  }
]
```

### 7.5 `GET /admin/fees/{clubId}/bills`

파라미터: `filter`(아래 콘솔 필터 enum, 생략=전체) · `q`(회원명 contains·학번 prefix — AdminUserApi 검색 규칙 미러) · `from`/`to`(§7.0) · `sort`(`LATEST`기본/`DUE`/`AMOUNT`) · `page`/`size`.

필터는 raw `FeeStatus`가 아니라 **콘솔 의미 enum** `AdminFeeBillFilter`로 받는다 — 연체 파생 계산(§7.3)을 서버가 소유하고, FE 칩과 1:1 대응된다. 사용자 요구의 PAID/UNPAID/OVERDUE가 그대로 이 enum이다.

| filter | 조건 |
|---|---|
| `PAID` | status = PAID |
| `UNPAID` | status ∈ (PENDING, PARTIAL_PAID, OVERDUE) and `due_date ≥ today` |
| `OVERDUE` | status ∈ (PENDING, PARTIAL_PAID, OVERDUE) and `due_date < today` |
| `CANCELLED` | status = CANCELLED |

```json
// 200 — PageResponse<AdminFeeBillRowResponse>
{
  "content": [
    {
      "billId": 512, "userId": 90, "userName": "김두잉", "studentId": "20231234", "generation": 3,
      "policyName": "2026-2학기 회비", "billingPeriod": "2026-2",
      "amount": 30000, "paidAmount": 30000, "status": "PAID", "overdue": false,
      "createdAt": "2026-07-01T00:10:00Z", "dueDate": "2026-09-15", "lastPaidAt": "2026-08-01T05:12:44Z"
    }
  ],
  "page": 0, "size": 20, "totalElements": 96, "totalPages": 5, "hasNext": true
}
```

- `status`는 DB 원본(배지용), `overdue`는 파생 boolean — 배치 지연으로 status가 PENDING인 마감 경과 청구도 FE가 연체 배지를 정확히 붙일 수 있다.
- `generation`은 nullable(기수 미지정 회원) — FE는 `—` 표기.

### 7.6 `GET /admin/fees/{clubId}/payments`

파라미터: `status`(`ACTIVE`/`VOIDED`, 생략=전체) · `from`/`to`(§7.0) · `page`/`size`. 정렬은 paid_at 최신순 고정.

`matchType` 파생 규칙: `bank_transaction_id` null → `DIRECT`(수기 기록) / `bank_transaction.match_status = AUTO_MATCHED` → `AUTO` / `MANUAL_MATCHED` → `MANUAL`.

```json
{
  "content": [
    {
      "paymentId": 300, "billId": 512, "userName": "김두잉",
      "amount": 30000, "method": "TRANSFER", "paidAt": "2026-08-01T05:12:44Z",
      "matchType": "AUTO", "counterparty": "김두잉",
      "recordedByName": "박운영", "status": "ACTIVE",
      "voidedByName": null, "voidedAt": null, "voidReason": null
    }
  ],
  "page": 0, "size": 20, "totalElements": 84, "totalPages": 5, "hasNext": true
}
```

- 입금자(`counterparty`)는 BANK 거래 연결 시에만 존재 (`bank_transaction.counterparty`), 수기 기록은 null.
- 수동 승인 여부·승인자: `matchType=MANUAL`이면 `recordedByName`이 승인자다.
- VOIDED 행도 반환한다 — 정정 이력이 감사의 핵심.

### 7.7 `GET /admin/fees/{clubId}/account`

**GET만 존재한다. PUT/DELETE는 만들지 않는다.**

```json
{
  "registered": true,
  "bank": "KB",
  "maskedAccountNumber": "****7890",
  "accountHolder": "멋쟁이사자처럼 회장 김대표",
  "bankMatchingActive": true
}
```

- 은행 한글 표시명은 FE 라벨 맵 소유(`Bank` enum은 코드만) — `bankName` 필드 없음.
- `AccountNumberMasker` 재사용 — 복호화 실패 시 `maskedAccountNumber: null` (graceful degrade, `GeneralBankMatchingAdminService` 선례).
- 미등록 시 `registered: false` + 나머지 null.
- BANK 매칭 허용 토글은 기존 `/admin/bank-matching` 화면 링크로 안내.

### 7.8 `GET /admin/fees/{clubId}/audit-logs`

파라미터: `types`(FEE_* 이벤트 타입 목록, 생략=FEE_* 전체) · `from`/`to`(§7.0) · `page`/`size`. 정렬은 created_at 최신순 고정.

```json
{
  "content": [
    {
      "eventId": 9001, "eventType": "FEE_PAYMENT_VOIDED",
      "actorUserId": 4, "actorName": "박운영",
      "createdAt": "2026-08-02T11:03:00Z",
      "reason": "금액 오기입",
      "refs": { "feePolicyId": null, "feeBillId": 512, "paymentId": 300, "bankTransactionId": null },
      "detail": { "amount": 30000 }
    }
  ],
  "page": 0, "size": 20, "totalElements": 213, "totalPages": 11, "hasNext": true
}
```

- 이 화면이 답하는 질문: **누가(actorName) · 언제(createdAt) · 무엇을(eventType + refs) · 어떻게(detail old/new + reason)**.
- 회비 외 이벤트(JOIN_*, RECRUITMENT_*)는 이 API에서 제외 — event_type IN (FEE_*)로 고정.
- 감사 로그는 계측 배포 시점부터 쌓인다. 그 이전 이력은 존재하지 않음을 FE 빈 상태 문구로 명시한다.

### 7.9 `GET /admin/fees/{clubId}/anomalies`

파라미터: `from`/`to`(§7.0 — 생략 시 최근 30일. §5.1의 Rule 평가 윈도우로 쓰인다).

```json
{
  "evaluatedAt": "2026-08-04T02:00:00Z",
  "window": { "from": "2026-07-05", "to": "2026-08-04" },
  "anomalies": [
    {
      "ruleId": "FA-02", "severity": "WARNING",
      "title": "납부 정정(VOID) 과다",
      "description": "기간 내 납부 정정 5건 (기준 3건)",
      "evidence": { "voidCount": 5, "threshold": 3 }
    }
  ]
}
```

미탐지 시 `anomalies: []`.

### 7.10 감사 의견 · 운영 메모

```json
// GET /admin/fees/{clubId}/audit-comments?kind=AUDIT_OPINION  (kind 생략=전체, 최신순)
[
  {
    "commentId": 11, "kind": "AUDIT_OPINION", "status": "OPEN",
    "content": "3월 납부 취소 5건 사유 확인 필요. 회장에게 유선 문의 예정.",
    "authorName": "총동연 관리자", "createdAt": "2026-08-04T02:10:00Z", "updatedAt": "2026-08-04T02:10:00Z"
  },
  { "commentId": 12, "kind": "OPERATION_MEMO", "status": null, "content": "작년에도 유사 민원 1건 있었음", "authorName": "총동연 관리자", "createdAt": "...", "updatedAt": "..." }
]

// POST /admin/fees/{clubId}/audit-comments
{ "kind": "AUDIT_OPINION", "content": "..." }   // status 생략 시 OPEN 자동 부여. OPERATION_MEMO는 status 항상 없음

// PATCH /admin/fees/{clubId}/audit-comments/{commentId}
{ "status": "RESOLVED" }        // content·status 부분 수정, OPERATION_MEMO에 status 전달 시 400
```

검증: `content` 1~2000자. 의견 status는 생략 시 `OPEN` 자동 부여(2026-08-04 사용자 확정), `OPEN → IN_REVIEW → RESOLVED` 흐름이 기본이되 전이 제약은 두지 않는다(재오픈 허용). 400 코드 예: `FEE_AUDIT_COMMENT_STATUS_NOT_ALLOWED`(메모에 status 전달).

### 7.11 에러 응답

| 상황 | 코드 |
|---|---|
| ADMIN 아님 | 403 (`JwtAccessDeniedHandler` 통일 처리) |
| 존재하지 않는 clubId | 404 `CLUB_NOT_FOUND` |
| 잘못된 enum 파라미터 | 400 (전역 바인딩 처리) |
| 의견/메모가 해당 club 소속 아님 | 404 `FEE_AUDIT_COMMENT_NOT_FOUND` (clubId 대조 필수 — IDOR 가드) |

### 7.12 증빙 요청 워크플로 (P3)

```
ADMIN                          동아리 운영진(LEADER/OFFICER)
  │ POST evidence-requests        │
  │  (title·설명·기한)            │
  ├── REQUESTED ────────────────▶ │  운영 콘솔에 요청 노출
  │                               │  파일 업로드(영수증·입금증·거래내역)
  │                               │  POST .../files → POST .../submit
  │ ◀──────────────── SUBMITTED ──┤
  │ 검토                          │
  ├─ CONFIRMED (종결)             │
  ├─ RETURNED (보완 요청) ──────▶ │  재업로드 → 재제출(SUBMITTED)
  └─ CANCELLED (철회)             │
```

- ADMIN API: `POST /admin/fees/{clubId}/evidence-requests`, `GET` 목록, `PATCH .../{id}` (CONFIRMED/RETURNED/CANCELLED 전이).
- 동아리 API: `GET /leader/clubs/{clubId}/evidence-requests`, `POST .../{id}/files`, `POST .../{id}/submit` — 기존 `requireManager` 가드.
- 상태 전이 외 수정 불가, 파일은 제출 전까지만 교체 가능. 모든 전이는 `club_audit_event`에 기록(타입은 P3 착수 시 추가).
- **스토리지는 P3 착수 시 설계**(2026-08-04 사용자 확정 — 지금 확정하지 않음): 비공개 스토리지·Signed URL·접근 권한·파일 보존 정책을 P3에서 일괄 설계한다 (→ §15 결정 14). 현 업로드 인프라는 공개 이미지(R2 public) 위주라 그대로 못 쓴다는 사실만 기록해 둔다. 파일 검증은 파일 업로드 보안 감사(#789) 통과 파이프라인 재사용.

---

## 8. 프론트엔드 UX 설계

### 8.1 IA · 라우트

```
app/admin/fees/
├── page.tsx                          # 얇은 래퍼
├── _pages/AdminFeesPage.tsx          # 'use client' — 대시보드 KPI + 동아리 목록
├── [clubId]/
│   ├── page.tsx
│   └── _pages/AdminFeeClubDetailPage.tsx   # 탭 컨테이너
├── _components/
│   ├── FeePeriodSelect.tsx               # 전역 기간 셀렉터 (프리셋 → from/to 환산, §7.0)
│   ├── FeeDashboardStrip.tsx  FeeClubsTable.tsx
│   ├── FeeKpiCards.tsx  FeePoliciesTable.tsx  FeeBillsTable.tsx  FeePaymentsTable.tsx
│   ├── FeeAccountCard.tsx  FeeAuditLogList.tsx  FeeAnomalyList.tsx
│   └── FeeAuditCommentPanel.tsx
└── _lib/feeAuditLabels.ts            # 이벤트 타입·severity·상태 라벨/배지 클래스 맵
```

- `adminSections.ts`에 1항목 추가: `{ href: '/admin/fees', title: '회비 감사', description: '동아리 회비 운영 현황 조회와 감사', group: '동아리', icon: FileSearch }` — 어드민 홈 카드·사이드바 동시 반영.
- 관리자 메뉴 최종: 모집 관리 · 동아리 관리 · 회원 관리 · **회비 감사(신규)** (+기존 BANK 자동매칭 등).
- 데이터 배선은 3단 규약: `packages/types/src/adminFee.ts`(백엔드 Response 미러 주석) → `packages/api/src/client.ts` `admin.fees` 네임스페이스(선언부+구현부) → `packages/hooks/src/adminFees.ts` + `adminQueryKeys.ts`(`feesAll`/`feesList(params)`/`feesDetail(clubId)`/`feesBills(clubId, params)`…) + barrel export.
- 목록·청구 검색은 `useDebouncedValue(300)` + `placeholderData: keepPreviousData`(포커스 상실 방지). **검색어는 URL에 싣지 않는다**(관리자 콘솔 규약 — 유출 방지). 필터·페이지·탭만 `router.replace` URL 동기화.
- 상태별 UX: `isLoading` → `ListRowsSkeleton`, `isError` → `ConsoleCard > ErrorState(onRetry)`, 빈 결과 → `EmptyState`. 날짜는 `formatDateTimeKst`.

### 8.2 목록 화면 `/admin/fees` (Wireframe)

```
┌ 회비 감사 ──────────────────────────────── (기간 ▼ 전체) ─────────┐
│ [사용 동아리 64/182] [총 청구 4,820만] [총 수납 4,135만]           │
│ [미수금 685만] [수납률 85.8%] [진행중 의견 3]      ← FeeDashboardStrip
│ 오늘: 정책 변경 2 · 납부 정정 5 · 계좌 변경 1 · 신규 의견 3        │
├───────────────────────────────────────────────────────────────────┤
│ (검색: 동아리명 ______)  (필터칩: 전체 | 회비 사용 | 미사용)        │
│ (정렬 ▼ 미수금 많은순)                                            │
├───────────────────────────────────────────────────────────────────┤
│ 동아리       정책  회원  청구건  청구액    수납액    미수금  미납  최근납부 │
│ 멋쟁이사자…   1    48    96    288만    255만    33만    11   08-01  │
│ 두잉밴드      2    30    60    180만    180만     0      0   07-28  │
│ …                                            (행 클릭 → 상세)      │
├───────────────────────────────────────────────────────────────────┤
│                      [Pagination]                                  │
└───────────────────────────────────────────────────────────────────┘
```

- 12개 요구 컬럼 중 테이블에는 8개(동아리명·활성 정책·총 회원·청구 건수·청구액·수납액·미수금·미납 인원·최근 납부일 중 화면 폭에 맞게)만 싣고, 회비 사용 여부는 필터칩·행 스타일로, 최근 거래일·이상징후(P2)는 상세에서 보여준다 — 가로 스크롤 테이블 방지.
- 미사용 동아리 행은 흐린 처리, 집계는 `—`.

### 8.3 상세 화면 `/admin/fees/[clubId]` (Wireframe)

```
┌ ← 목록  멋쟁이사자처럼 — 회비 감사  [읽기 전용]  (기간 ▼ 최근 30일)┐
│ [총 회원 48] [활성 정책 1] [청구 96건] [완납 80] [미납 11] [연체 4] │
│ [총 수납 255만] [미수금 33만] [수납률 88.5%]        ← FeeKpiCards  │
├───────────────────────────────────────────────────────────────────┤
│ 탭: [개요] [정책] [청구] [납부] [계좌] [감사 로그] [이상징후] [의견·메모] │
├───────────────────────────────────────────────────────────────────┤
│ (탭 콘텐츠)                                                        │
└───────────────────────────────────────────────────────────────────┘
```

- 헤더에 항상 **"읽기 전용" 배지** — 이 콘솔에서 아무것도 바꿀 수 없음을 시각적으로 못박는다 (선례: 관리자 지원서 시트의 읽기 전용 정책 주석).
- **기간 셀렉터는 상세 헤더에 1개** (`FeePeriodSelect`) — KPI·정책 납부율·청구·납부·감사 로그·이상징후 탭이 전부 같은 기간을 쓴다. 탭 전환에도 유지되고, 프리셋 키(또는 직접 선택 from/to)는 URL 동기화 대상(검색어 금지 규약과 무관 — 기간은 유출 위험 없는 필터다). 목록 화면의 셀렉터도 동일 컴포넌트(기본 "전체").
- 개요 탭 = KPI + 이상징후 요약(최고 severity 1줄) + 최근 감사 로그 5건.

**정책 탭** — 표: 정책명 · 대상(전체/선택) · 금액 · 유형(월/학기/연/일시) · 상태(활성/비활성) · 발행 건수 · 납부율. 행동 버튼 없음.

**청구 탭** — 필터칩 `전체 | 완납 | 미납 | 연체 | 취소`(`AdminFeeBillFilter` 1:1, 연체는 파생 §7.5), 검색(회원명·학번), 표: 회원 · 학번 · 기수 · 회차 · 금액 · 납부액 · 상태배지 · 생성일 · 마감일 · 납부일. 상태배지는 기존 `feeLabels` 재사용하되 `overdue=true`면 연체 배지 우선.

**납부 탭** — 필터칩 `전체 | 유효 | 정정됨`, 표: 입금자 · 회원 · 금액 · 입금일 · 매칭(자동/수동/수기 배지) · 기록자/승인자 · 상태. VOIDED 행은 취소선 + 정정 사유 툴팁.

**계좌 탭** —
```
┌ FeeAccountCard ──────────────────────────────┐
│ KB국민은행  ****7890                          │
│ 예금주: 멋쟁이사자처럼 회장 김대표             │
│ BANK 자동매칭: 사용 중                        │
│ ⓘ 계좌 정보는 조회만 가능합니다.              │
│   매칭 허용 설정은 [BANK 자동매칭 콘솔 →]     │
└──────────────────────────────────────────────┘
```

### 8.4 감사 로그 탭 (Wireframe) — 이 콘솔의 핵심 화면

```
│ (필터: 유형그룹 ▼ 전체|정책|청구|납부|매칭|계좌|열람) — 기간은 헤더 셀렉터 공용 │
├───────────────────────────────────────────────────────────────────┤
│ 08-02 11:03  [납부 정정]  박운영                                   │
│              청구 #512 · 30,000원 · 사유: 금액 오기입              │
│ 08-01 05:12  [납부 기록]  박운영                                   │
│              청구 #512 · 30,000원 · BANK 자동매칭                  │
│ 07-30 21:44  [정책 수정]  김회장                                   │
│              금액 10,000 → 30,000                                  │
│ …                                          [Pagination]           │
```

- 행 구성 = 누가(actorName) / 언제(KST) / 무엇을(이벤트 라벨 배지 + 대상 ref) / 어떻게(detail diff·reason 한 줄 요약).
- `detail`의 old/new는 `feeAuditLabels.ts`의 필드별 포매터로 한국어 문장화(`금액 10,000 → 30,000`).
- 빈 상태 문구: "감사 로그는 2026-XX-XX(계측 배포일) 이후의 변경부터 기록됩니다."

### 8.5 이상징후 탭 (Wireframe)

```
│ ⚠ CRITICAL  계좌 빈번 교체 — 최근 90일 계좌 변경 2회 (기준 2회)     │
│ ⚠ WARNING   납부 정정 과다 — 최근 30일 5건 (기준 3건)              │
│    [근거 보기 ▼] → evidence 수치 + 관련 감사 로그 필터 링크        │
│ ✓ 나머지 6개 Rule 정상                                            │
```

- severity 배지 색: INFO 회색 / WARNING 앰버 / HIGH 오렌지 / CRITICAL 레드 (기존 배지 클래스 맵 스타일).
- 각 항목에서 감사 로그 탭으로 해당 유형·기간 필터를 걸어 이동하는 링크 제공.
- 평가 윈도우 = 헤더 기간 셀렉터(§7.0). 버스트 Rule(FA-05/06)은 고유 윈도우 고정임을 항목 라벨에 병기.

### 8.6 의견·메모 탭 (Wireframe)

```
│ [감사 의견] [운영 메모]  ← 서브 토글                               │
│ ┌ 작성 ──────────────────────────────┐                            │
│ │ (textarea)               [등록]    │                            │
│ └────────────────────────────────────┘                            │
│ ● 진행중  08-04  총동연 관리자                                     │
│   "3월 납부 취소 5건 사유 확인 필요…"   (상태 ▼ 진행중|확인중|완료) │
│ ● 완료    07-20  총동연 관리자        …                            │
```

- 의견 상태 변경은 인라인 select → PATCH. 메모는 상태 없이 텍스트만.
- 이 탭 전체가 ADMIN 전용 데이터임을 상단 안내 1줄로 명시("동아리에는 표시되지 않습니다").

---

## 9. 권한 · 보안

- **RBAC 삼중 가드** (기존 관리자 콘솔과 동일): ① 미들웨어 `auth_hint` role 검증 → `/403` rewrite, ② `AdminRoleGuard`(fail-closed), ③ 서버 `@PreAuthorize("hasRole('ADMIN')")` + URL 레이어 백스톱. FE 가드는 편의일 뿐 보안 경계는 서버다.
- **읽기 전용 강제**: 회계 데이터 쓰기 API 자체가 없다 — 화면에서 숨기는 게 아니라 서버에 엔드포인트가 존재하지 않는 것이 원칙. `AdminFeeAuditApi` 인터페이스에 GET 외 회계 메서드를 두지 않는다.
- **감사 로그 위변조 방지**: `club_audit_event`는 append-only — 엔티티에 수정·삭제 메서드 없음, UPDATE/DELETE API 없음, 변이와 동일 트랜잭션 기록(감사 실패 = 변이 롤백). 애플리케이션 레벨 보장이며 DB 권한 분리는 도입하지 않는다 (→ §15 결정 8).
- **개인정보 최소 노출**:
  - 계좌번호는 항상 `AccountNumberMasker` 마스킹(끝 4자리) — 평문 복호화 API를 admin에 만들지 않는다.
  - 전화번호는 이 콘솔 어디에도 노출하지 않는다 (회원 연락은 회원 관리 콘솔 소관, 필요 시 `PhoneMasker` 마스킹 선례 따름).
  - `detail` JSONB·`fee_anomaly.evidence`에 PII 저장 금지 — id·숫자·enum만.
  - 검색어 URL 미탑재 (referrer·방문 기록 유출 방지).
- **Audit Trail(열람 감사)**: 관리자의 상세 열람(`FEE_ADMIN_DETAIL_VIEWED`)·CSV 다운로드(`FEE_ADMIN_CSV_DOWNLOADED`)를 동일 감사 로그에 남긴다 — 감사자도 감사된다. `APPLICATION_VIEWED` 선례와 동일 굵기.
- **다운로드 권한**: CSV는 ADMIN 전용 + 다운로드 이벤트 기록 + `nosniff` + 수식 인젝션 방지. CSV에 전화번호 미포함.
- **IDOR**: 의견·메모 수정/삭제 시 `commentId`의 club 소속 대조(경로 clubId와 불일치 시 404).

---

## 10. 성능

전제 규모: 대구대 단일 캠퍼스 — 동아리 수백, 동아리당 회원 수십, 청구 연 수만 건, 감사 이벤트 일 수백 건. **이 규모에서 offset 페이징 + 인덱스로 충분하다.**

- **페이지네이션**: 목록·청구·납부·감사 로그 전부 `Pageable` + `PageResponse<T>`. 커서 페이지네이션은 도입하지 않는다 — 레포 전례가 없고, 이 규모에서 offset 열화가 관측될 일이 없다. 감사 로그가 장기적으로 가장 커지는 테이블이나 `(club_id, created_at)` 인덱스로 club 스코프 조회가 커버된다 (→ §15 결정 9).
- **인덱스**:
  - `club_audit_event (club_id, event_type, created_at)` — V105 신규 (타입 필터 감사 로그 조회).
  - `fee_bill (club_id, status)` — **기존 `idx_fee_bill_club_status`(V60, partial) 재사용**, 추가 불요.
  - `payment (fee_bill_id)` — **기존 `idx_payment_bill`(V62) 재사용**, 추가 불요.
  - `bank_transaction (club_id, transaction_at)` — **V105 신규** (기존엔 club_id+status뿐 — 최근 거래일 max용).
- **집계 최적화**: 목록은 QueryDSL 단일 쿼리 — `club` 기준 LEFT JOIN 서브쿼리 집계(fee_bill 합계, payment 합계, 미납 distinct). 동아리 수백 규모라 전체 GROUP BY 후 정렬·페이징해도 수십 ms. 정렬 컬럼이 집계값(미수금순)이어도 문제없는 이유가 이것이다.
- **KPI 캐시**: BE 캐시 도입하지 않음 — 집계가 이미 싸다. FE는 React Query `staleTime` 60s로 탭 이동 간 재조회만 억제. 실측으로 느려지면 그때 dashboard 응답만 캐시한다.
- **이상징후**: P1 on-demand는 단일 club 스코프라 저비용. 전 동아리 스캔은 P2 야간 배치로만.

---

## 11. 테스트 전략

- **BE** (`AdminFeeAuditControllerTest` — RestAssured + TestContainers):
  - 권한: 비로그인 401, STUDENT 403, ADMIN 200 (URL 레이어 백스톱 회귀 포함).
  - 목록 집계 정확성: CANCELLED 제외, VOIDED 납부 제외, 미납 인원 distinct.
  - 청구 필터: `AdminFeeBillFilter` 파생 조건 — 특히 연체 경계(마감일 당일/전일/익일 × status PENDING·OVERDUE 조합), `q` 회원명·학번 검색.
  - 기간 필터: 리소스별 기준 컬럼(§7.0) 적용, 경계값(from=to, 기간 밖 납부가 붙은 기간 내 청구의 수납액 포함) 검증.
  - 마스킹: 계좌 응답이 `****` 패턴인지, 평문이 어디에도 없는지. 복호화 실패 시 null 반환.
  - **열람 감사**: 상세 API 호출 후 `FEE_ADMIN_DETAIL_VIEWED` 행 존재 검증 — 실 PG 통합 테스트로 readOnly 함정 회귀 방지.
  - 계측: 각 변이 API 호출 후 대응 이벤트 + detail 검증. detail에 PII 필드 부재 검증.
  - 이상징후: Rule별 경계값(임계 -1/정확히/+1) 단위 테스트. **날짜는 전부 상대값** — 하드코딩 미래 절대날짜 금지(타임밤 방지).
  - 의견·메모: kind-status CHECK(메모에 status 400), IDOR(타 club commentId 404).
  - 마이그레이션: event_type CHECK 재작성 검증, RLS 테스트 자동 커버.
- **FE** (`frontend/apps/web/test/admin/fees/*.test.tsx` — vitest + RTL):
  - 목록 렌더·필터칩·검색 debounce·keepPreviousData 포커스 유지.
  - 상세 탭 전환, 감사 로그 detail 포매팅(`금액 10,000 → 30,000`), severity 배지 매핑.
  - 훅 테스트: query key 계층(무효화 전파), 의견 PATCH 후 invalidate.

---

## 12. 릴리스 계획 · PR 분할 (1단위 = 1브랜치 = 1PR)

**P1 (MVP)**

| 순서 | 범위 | 비고 |
|---|---|---|
| PR-1 (BE) | V105(이벤트 타입 15종 + 참조 컬럼 + detail + 인덱스) + 기존 변이 서비스 계측 | **가장 먼저** — 배포 즉시 로그 축적 시작 |
| PR-2 (BE) | 관리자 조회 API: 목록·대시보드·상세 KPI(열람 이벤트)·정책·청구·납부·계좌 — 전역 기간 파라미터(§7.0) 포함 | PR-1 뒤 |
| PR-3 (BE) | 감사 로그 조회 + 이상징후 on-demand + V106 의견·메모 CRUD + dashboard `openOpinionCount`·`recentActivity` | |
| PR-4 (FE) | `/admin/fees` 목록 + 대시보드 + 상세 탭(개요·정책·청구·납부·계좌) + 기간 셀렉터 + adminSections 등록 | PR-2 뒤 |
| PR-5 (FE) | 감사 로그·이상징후·의견/메모 탭 | PR-3 뒤 |

**P2** — CSV 다운로드(BE+FE, 다운로드 감사 포함), `fee_anomaly` 야간 배치 + 목록 이상징후 컬럼 + 대시보드 anomalyClubCount + 확인 처리(resolve), 임계값 프로퍼티화, 감사 로그 actor 필터.

**P3** — 증빙 요청 워크플로(비공개 스토리지 결정 선행), 회계(cashbook) 감사 확장(§13).

릴리스 주의: V105는 V103·V104(prod 릴리스 대기 중)와 순서 충돌이 없도록, 선행 마이그레이션이 prod에 나간 뒤 릴리스한다.

### 예상 영향도

| 단계 | Backend | Frontend | DB Migration | Admin UI | Audit |
|---|---|---|---|---|---|
| P1 | 계측(기존 서비스 ~10곳 수정) + 조회 API 13개 + 서비스 3쌍 | 신규 콘솔 2페이지·컴포넌트 ~10개·3단 배선 | V105, V106 (2건) | 메뉴 1항목 + 목록·상세 | 이벤트 15종 신설, 열람 감사 시작 |
| P2 | CSV + 배치 잡 1개 | CSV 버튼·이상징후 컬럼 | fee_anomaly (1건) | 목록 컬럼·대시보드 확장 | 다운로드 감사 |
| P3 | 증빙 API(admin+leader 양측) | admin 요청 UI + 운영 콘솔 제출 UI | evidence 2테이블 | 요청 관리 화면 | 증빙 전이 이벤트 |

---

## 13. 향후 확장

이 구조가 확장 가능한 이유는 **감사 스트림(`club_audit_event`)·감사 산출물(`admin_fee_audit_comment`)·탐지(`fee_anomaly`)가 회비에 하드코딩되지 않은 축**이기 때문이다.

- **회계(Cashbook·장부) 감사** — 이 스펙의 구현 대상은 아니고 확장 방향만 문서화한다(2026-08-04 사용자 확정). 회비 감사 콘솔이 **수납까지**를 보는 데 비해, 장부 감사는 **수납 → 장부 기록 → 지출**의 전체 자금 흐름을 같은 콘솔에서 잇는다. 구조는 이미 준비돼 있다: `cashbook_entry`가 `bank_transaction_id` FK로 수납 거래와 연결돼 있고(`source ∈ (MANUAL, BANK_API)`, `excluded` 플래그), 감사 스트림은 `club_audit_event`에 CASHBOOK_*(기록 생성·수정·제외 등) 이벤트 타입을 추가하면 된다 — 테이블 신설 불요. 콘솔은 상세에 "장부" 탭 하나를 더하고 전역 기간 필터(§7.0)를 그대로 적용한다. 착수 시 별도 스펙에서 지출 증빙(§7.12 증빙 요청과 연계)까지 다룬다.
- **시설 사용 감사** — 이미 `facility_submission_audit`·`facility_booking_status_history`가 있어 조회 콘솔만 붙이면 된다.
- **민원 감사** — `admin_fee_audit_comment.kind` 확장(예: `COMPLAINT`) 또는 범용 `admin_club_comment`로 리네임 승격 — 구조 변경 없이 kind 추가.
- **운영 점수·동아리 평가** — P2 `fee_anomaly` 지속화가 선행되면 Rule 평가 결과의 severity 가중 합산으로 산출 가능. 점수화는 별도 스펙에서.

단, 지금 범용화하지 않는다 — 회비 감사 하나를 완성하고, 두 번째 감사 도메인이 실제로 착수될 때 공통화한다 (YAGNI).

---

## 14. Out of Scope

- **환불(refund)** — 도메인에 개념 자체가 없다. 환불 기능이 생기면 그때 `FEE_REFUNDED` 이벤트로 계측 추가.
- **회원 회비 면제(waive/exempt)** — 동일. 도메인 부재.
- **ADMIN의 회계 개입 일체** — 대리 정정·대리 승인·정책 강제 변경 등. 원칙상 영구 제외 (§1.2).
- **동아리 측에 감사 의견 공개** — **비공개(ADMIN Only) 확정**(2026-08-04). 감사 의견은 내부 감사 기록 성격. 감사 결과의 공식 전달 요구가 생기면 별도 "감사 결과 통보" 기능으로 설계한다.
- **이상징후 알림(Slack·인앱)** — P2 배치 도입 후 필요성 재검토.
- **삭제(soft delete)된 동아리 감사** — 목록은 ACTIVE·INACTIVE까지만(§7.1). 삭제 동아리 회계 이력 열람은 요구 발생 시.
- **cashbook(장부) 조회 탭** — 회계 감사 확장(§13)에서.
- **감사 로그 소급 생성** — 계측 이전 변이는 복원 불가, 백필하지 않는다.

---

## 15. 확정 결정 기록 · 열린 결정 포인트

### 확정 (이 스펙의 제안)

1. **회비 전용 감사 테이블을 만들지 않고 `club_audit_event`를 확장한다** — V102 설계 의도("도메인별 감사 테이블 신설 금지") 준수. 변경 전/후 값은 `detail JSONB` 컬럼 신설로 수용.
2. **감사 의견과 운영 메모는 단일 테이블(`admin_fee_audit_comment`) + `kind` 구분** — 구조가 동일(동아리에 붙는 ADMIN 텍스트)하고 차이는 status 유무뿐. CHECK 제약으로 kind별 status 규칙 강제.
3. **의견·메모는 append-only가 아니다** — 감사 대상(회계 데이터·감사 로그)과 감사 도구(의견·메모)를 구분. 도구는 수정·soft delete 허용.
4. **시스템 잡은 계측하지 않는다** — `actor_user_id NOT NULL` 유지. 감사 로그는 "사람의 개입" 추적이 목적. 자동 발행·연체 전이는 정책 설정 감사 + 상태값으로 충분.
5. **열람 감사 굵기는 "상세 진입 1회 = 1건" + CSV 다운로드** — 탭 API마다 기록하면 노이즈. `APPLICATION_VIEWED` 선례와 동일.
6. **이상징후는 P1 on-demand(무테이블·상수 임계값), P2에서 배치+지속화** — Rule 엔진 추상화 없이 메서드 8개.
7. **"회비 사용" 판정 = 활성 정책 ≥1 또는 청구 이력 ≥1** — 계좌만 등록한 동아리는 미사용으로 본다(청구 없이는 감사 대상 데이터가 없음).
8. **append-only는 애플리케이션 레벨 보장** — DB 계정 권한 분리(UPDATE 권한 회수)는 운영 복잡도 대비 이득이 없어 도입하지 않음. 엔티티 불변 + API 부재 + 코드 리뷰로 지킨다.
9. **offset 페이징 유지, 커서 미도입** — 규모 근거는 §10. 감사 로그 장기 증가는 `(club_id, event_type, created_at)` 인덱스로 커버.
10. **미납/연체는 DB status가 아닌 마감일 파생 계산** — `OverdueBillJob`이 자정 배치 + env opt-in이라 status `OVERDUE`는 지연·부재 가능. 감사 콘솔의 KPI·필터(`AdminFeeBillFilter`)·행 `overdue` boolean은 전부 `due_date < today` 파생으로 통일해 배치 상태에 면역이다. 운영진 화면(기존 status 기반)과 수치가 다를 수 있음은 의도된 차이.
11. **전역 기간 필터** (2026-08-04 반영) — 콘솔 전 화면이 하나의 `from`/`to` 기준을 공유(§7.0). 프리셋→날짜 환산은 FE 소유(서버에 학기 개념 없음). 이상징후는 기간=Rule 윈도우, 버스트 Rule(FA-05/06)만 고유 윈도우 고정.
12. **대시보드 최근 변경 요약** (2026-08-04 반영) — KST 오늘 기준 FEE_* 변이 이벤트 타입별 카운트 + 신규 의견 수(`recentActivity`, PR-3). `club_audit_event` GROUP BY 한 방이라 추가 비용 무시 가능.
13. **P1 범위 유지 — 이상징후·감사 의견 포함** (2026-08-04 사용자 확정) — 감사 콘솔은 조회 화면이 아니라 감사 업무 도구다. 조회만으로는 의견 기록·이상 확인이 불가해 실사용성이 떨어지고, 이상징후는 구현 난이도 대비 감사 기능의 핵심이다.
14. **증빙 스토리지는 P3 착수 시 일괄 설계** (2026-08-04 사용자 확정) — 비공개 스토리지·Signed URL·접근 권한·파일 보존 정책을 그때 함께 확정. 지금은 구조를 못박지 않는다.
15. **감사 의견 비공개(ADMIN Only)** (2026-08-04 사용자 확정) — 내부 감사 기록·운영 메모 성격. 공식 전달 요구가 생기면 별도 "감사 결과 통보" 기능으로.
16. **의견 status 기본값 OPEN 자동 부여** (2026-08-04 사용자 확정) — 생략 시 OPEN 저장, `OPEN → IN_REVIEW → RESOLVED` 흐름(전이 제약 없음, 재오픈 허용).

### 열린 결정 포인트

없음 — 2026-08-04 사용자 리뷰에서 4건 전부 확정 (결정 13~16).
