# 회비 시스템 Sprint 4 — 영수증 · 자동 월발행 크론 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 으로 task 단위 구현. 각 step 은 `- [ ]` 체크박스. **구현 subagent 는 절대 push / PR 생성 / 브랜치 전환을 하지 않는다** — 로컬 커밋까지만. 머지·PR 은 사용자 지시 후 컨트롤러가 수행.
> 설계서(권위 출처): `docs/superpowers/specs/2026-06-18-fee-system-sprint4-design.md`.

**Goal:** Sprint 1~3(청구·납부·연체·알림·대시보드·BANK 자동매칭) 위에 ① 회비 영수증(프론트 인쇄용) ② MONTHLY 정책 자동 월발행 크론을 추가한다.

**Architecture:** 영수증은 신규 테이블·PDF 라이브러리 없이 기존 `fee_bill` + ACTIVE `payment` 를 조회 조립해 응답하고, 프론트가 인쇄 전용 페이지 + `window.print()` 로 PDF 저장한다. 자동발행은 `fee_policy` 에 opt-in 컬럼(V65)을 더하고, 기존 `OverdueBillJob`/`FeeJobConfig` 이중 게이팅 패턴을 복제한 `MonthlyBillIssueJob`+`FeeAutoIssueJobConfig`(독립 플래그 `duing.fee.auto-issue.enabled`)가 매일 `today.day >= issue_day` 인 정책의 그 달 청구를 멱등 발행한다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Flyway / QueryDSL / RestAssured + TestContainers · Next.js 15 / React 19 / pnpm workspaces / TanStack Query / Zod / shadcn Dialog / vitest.

---

## 0. 정찰에서 확정된 핵심 사실 (계획 전제)

1. **회원 영수증 백엔드 경로 = `/api/v1/my/fees/{billId}/receipt`** (기존 `MyFeeApi` 가 `/my/fees`). 설계서 §6/§8 의 `/me/fees` 는 **프론트 라우트**이자 알림 `link_url` 일 뿐 백엔드 경로가 아니다. 총무 경로 = `/api/v1/leader/clubs/{clubId}/fee-bills/{billId}/receipt`.
2. **영수증 발급 가드 = `status != CANCELLED` AND `ACTIVE 납부합계 > 0`** 두 조건 모두. `findByFeeBillIdOrderByCreatedAtAsc` 는 ACTIVE/VOIDED 전부 반환하므로 서비스에서 `Payment::isActive` 로 필터해 합계·건수·내역을 만든다. CANCELLED 는 취소 시 payment 를 void 하지 않아 ACTIVE 가 남을 수 있으므로 **status 로 명시 제외**한다. 부분 납부 OVERDUE 는 발급 가능.
3. **receiptNumber = `"RCP-" + billingStartDate.format("yyyyMM") + "-" + billId`** (회차 라벨이 아닌 `billing_start_date` 에서 도출).
4. **멱등 발행 `bulkInsertBills`** 의 ON CONFLICT 키는 `(fee_policy_id, user_id, billing_start_date) WHERE deleted_at IS NULL AND status <> 'CANCELLED'`. 크론 `autoIssueMonthly` 는 이 메서드를 그대로 재사용 → 같은 달 재실행이면 `created=0`(재알림 없음, 캐치업 안전).
5. **크론 이중 게이팅 필수**: `FeeJobConfig`(`@EnableScheduling`)는 `duing.fee.overdue` 에 묶여 있으므로, 자동발행은 별도 `FeeAutoIssueJobConfig`(`@EnableScheduling` + `duing.fee.auto-issue`) + `MonthlyBillIssueJob`(`@ConditionalOnProperty` 같은 키) 두 개를 둔다.
6. **`autoIssueMonthly` 는 `generate` 와 달리 `requireManager`·`validateDueDate` 없음**(시스템 권위). `run()` 은 `@Transactional` 아님(정책별 자체 TX, 한 정책 실패가 배치 전체를 막지 않음). due_date = `LocalDate.of(today.getYear(), today.getMonth(), policy.getDueDay())`(과거여도 정상).
7. **Flyway 최신 V64 → 신규 V65**. 기존 마이그레이션 수정 금지. fee_policy 는 V60 에서 RLS 활성 — 컬럼 ALTER 는 추가 RLS 정책 불필요.
8. **고정 Clock**: 크론 테스트는 `LeaderFeeBillControllerTest.FixedClockConfig`(@TestConfiguration @Bean @Primary `Clock.fixed(... Asia/Seoul)`) 패턴을 차용해 `today.getDayOfMonth()` 결정성을 확보한다(`OverdueBillJobTest` 는 실 Clock 이라 차용 불가).
9. **프론트**: 영수증/인쇄 코드 전무(`window.print`/`@media print`/`receipt` grep 0건) — 100% 신규. 타입 `type`(interface 금지)·`any`/`as` 금지. 인쇄는 `window.print()` 를 `apps/web` 컴포넌트에서만 호출(packages/* 에 DOM API 금지). jsdom 은 `window.print` 미구현 → 테스트에서 `vi.spyOn(window, 'print')` stub.

---

## 1. 파일 구조 (생성 / 수정)

### ① 영수증 — 백엔드 (Task 1)
- **Create** `backend/src/main/java/com/duing/domain/fee/controller/dto/response/ReceiptResponse.java` — 영수증 응답 record + 중첩 `PaymentLine`.
- **Create** `backend/src/main/java/com/duing/domain/fee/service/ReceiptService.java` — 인터페이스.
- **Create** `backend/src/main/java/com/duing/domain/fee/service/GeneralReceiptService.java` — 조립·발급 가드.
- **Modify** `backend/src/main/java/com/duing/domain/fee/exception/FeeBillException.java` — `ReceiptUnavailableException`(404) 추가.
- **Modify** `backend/src/main/java/com/duing/domain/fee/repository/FeeBillRepository.java` — `findByIdAndUserId` 추가.
- **Modify** `backend/.../fee/api/MyFeeApi.java` + `controller/MyFeeController.java` — 회원 영수증 엔드포인트.
- **Modify** `backend/.../fee/api/LeaderFeeBillApi.java` + `controller/LeaderFeeBillController.java` — 총무 영수증 엔드포인트.
- **Create(test)** `backend/src/test/java/com/duing/domain/fee/MyFeeReceiptControllerTest.java`, `LeaderFeeReceiptControllerTest.java`.

### ① 영수증 — 프론트 (Task 2: 배선, Task 3: 화면)
- **Modify** `frontend/packages/types/src/fee.ts` — `Receipt`/`ReceiptPaymentLine` 타입.
- **Modify** `frontend/packages/api/src/client.ts` — `leader.fees.receipt` / `my.feeReceipt`.
- **Modify** `frontend/packages/hooks/src/fee.ts` — `useClubFeeReceiptQuery` / `useMyFeeReceiptQuery`.
- **Modify** `frontend/packages/hooks/src/feeQueryKeys.ts` — `receipt` / `myReceipt` 키.
- **Modify** `frontend/packages/hooks/src/index.ts` — 두 훅 export.
- **Create** `frontend/apps/web/app/_components/fee/FeeReceiptDocument.tsx` — 인쇄 시트(공유 표현 컴포넌트).
- **Create** `frontend/apps/web/app/_components/fee/FeeReceiptScreen.tsx` — 로딩/에러 + 인쇄 버튼 + 시트(공유).
- **Create** `frontend/apps/web/app/me/fees/[billId]/receipt/page.tsx` — 회원 영수증 라우트.
- **Create** `frontend/apps/web/app/manage/clubs/[clubId]/fees/[billId]/receipt/page.tsx` — 총무 영수증 라우트.
- **Modify** `frontend/apps/web/app/globals.css` — `@media print` 블록.
- **Modify** `frontend/apps/web/app/me/_components/MyFeeList.tsx` — `MyFeeRow` 에 "영수증" 링크.
- **Modify** `frontend/apps/web/app/manage/clubs/[clubId]/fees/_components/BillList.tsx` — `BillRow` 에 "영수증" 링크.
- **Create(test)** `frontend/apps/web/test/me/my-receipt.test.tsx`, `frontend/apps/web/test/manage/bill-list-receipt.test.tsx`.

### ② 자동발행 — 백엔드 (Task 4: 설정·검증, Task 5: 크론)
- **Create** `backend/src/main/resources/db/migration/V65__fee_policy_auto_issue.sql`.
- **Modify** `backend/.../fee/entity/FeePolicy.java` — 3 필드 + `applyAutoIssue`.
- **Modify** `backend/.../fee/repository/FeePolicyRepository.java` — `findAutoIssueDue`.
- **Modify** `backend/.../fee/exception/FeePolicyException.java` — `AutoIssueNotMonthlyException`, `InvalidIssueScheduleException`.
- **Modify** request/command/query/response 6 record + `GeneralFeePolicyService.java`(validateAutoIssue).
- **Modify** `backend/.../fee/service/FeeBillService.java` + `GeneralFeeBillService.java` — `autoIssueMonthly`.
- **Create** `backend/.../fee/job/MonthlyBillIssueJob.java`, `backend/.../fee/config/FeeAutoIssueJobConfig.java`.
- **Modify** `application.yml`, `src/test/resources/application.yml`, `backend/.env.example` — `duing.fee.auto-issue.enabled`.
- **Modify(test)** `FeePolicyFixture.java`(autoIssue helper). **Create(test)** `LeaderFeePolicyAutoIssueControllerTest.java`, `job/MonthlyBillIssueJobTest.java`.

### ② 자동발행 — 프론트 (Task 6)
- **Modify** `frontend/packages/types/src/fee.ts` — `FeePolicy`/`CreateFeePolicyPayload` 에 3 필드.
- **Modify** `frontend/packages/schemas/src/index.ts` — `createFeePolicySchema` 확장 + superRefine.
- **Modify** `frontend/apps/web/app/manage/clubs/[clubId]/fees/_components/CreatePolicyDialog.tsx` — 자동발행 토글·발행일·마감일(MONTHLY 한정).
- **Modify(test)** `frontend/apps/web/test/manage/create-policy-dialog.test.tsx`.

### PR 분해 (설계 §17 — 2 트랙)
영수증 = Task 1→2→3, 자동발행 = Task 4→(5,6). 두 트랙 독립. 각 트랙 내부는 백엔드 머지 후 프론트 진행(`frontend/CLAUDE.md`). 본 세션은 한 브랜치(`feat/fee-system-sprint4`)에 순차 커밋하고, PR 분리는 finishing 단계에서 사용자 지시에 따른다.

---

# Task 1 — 영수증 백엔드 (Service + 2 엔드포인트)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/fee/controller/dto/response/ReceiptResponse.java`
- Create: `backend/src/main/java/com/duing/domain/fee/service/ReceiptService.java`
- Create: `backend/src/main/java/com/duing/domain/fee/service/GeneralReceiptService.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/exception/FeeBillException.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/repository/FeeBillRepository.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/api/MyFeeApi.java`, `controller/MyFeeController.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/api/LeaderFeeBillApi.java`, `controller/LeaderFeeBillController.java`
- Test: `backend/src/test/java/com/duing/domain/fee/MyFeeReceiptControllerTest.java`, `LeaderFeeReceiptControllerTest.java`

- [ ] **Step 1: `ReceiptResponse` record 작성**

`backend/src/main/java/com/duing/domain/fee/controller/dto/response/ReceiptResponse.java`:
```java
package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.entity.Payment;
import com.duing.domain.fee.entity.PaymentMethod;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public record ReceiptResponse(
        String receiptNumber,
        String clubName,
        String memberName,
        String policyName,
        String billingPeriod,
        LocalDate billingStartDate,
        LocalDate billingEndDate,
        LocalDate dueDate,
        Long amount,
        Long paidTotal,
        Long remaining,
        int paymentCount,
        FeeStatus status,
        LocalDateTime issuedAt,
        List<PaymentLine> payments) {

    // ACTIVE 납부 1건(VOIDED 제외). id·status·voidReason 은 영수증에 불필요해 싣지 않는다.
    public record PaymentLine(Long amount, PaymentMethod method, LocalDateTime paidAt, String memo) {
        public static PaymentLine from(Payment payment) {
            return new PaymentLine(payment.getAmount(), payment.getMethod(),
                    payment.getPaidAt(), payment.getMemo());
        }
    }
}
```

- [ ] **Step 2: `ReceiptUnavailableException` + `findByIdAndUserId` 추가**

`FeeBillException.java` — `InvalidBillingPeriodException` 뒤에 inner 추가:
```java
    public static class ReceiptUnavailableException extends FeeBillException {
        private static final String MESSAGE = "납부 내역이 없어 영수증을 발급할 수 없습니다.";

        public ReceiptUnavailableException() {
            super(MESSAGE, HttpStatus.NOT_FOUND);
        }
    }
```

`FeeBillRepository.java` — `findByIdAndClubId` 바로 아래에 추가:
```java
    // 회원 영수증: 본인(userId) 청구만 노출(타인 청구는 빈 Optional → 404, 존재 비노출). @SQLRestriction 이 soft-delete 제외.
    Optional<FeeBill> findByIdAndUserId(Long id, Long userId);
```

- [ ] **Step 3: `ReceiptService` 인터페이스 작성**

`backend/src/main/java/com/duing/domain/fee/service/ReceiptService.java`:
```java
package com.duing.domain.fee.service;

import com.duing.domain.fee.controller.dto.response.ReceiptResponse;

public interface ReceiptService {
    // 회원 본인 영수증(본인 청구 아니면 404).
    ReceiptResponse getMemberReceipt(Long userId, Long billId);

    // 총무 영수증(requireManager + 동아리 격리, 아니면 403/404).
    ReceiptResponse getClubReceipt(Long clubId, Long actorId, Long billId);
}
```

- [ ] **Step 4: `GeneralReceiptService` 작성(발급 가드 포함)**

`backend/src/main/java/com/duing/domain/fee/service/GeneralReceiptService.java`:
```java
package com.duing.domain.fee.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.fee.controller.dto.response.ReceiptResponse;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.entity.Payment;
import com.duing.domain.fee.exception.FeeBillException;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.repository.PaymentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralReceiptService implements ReceiptService {

    private static final DateTimeFormatter RECEIPT_YEAR_MONTH = DateTimeFormatter.ofPattern("yyyyMM");

    private final FeeBillRepository feeBillRepository;
    private final PaymentRepository paymentRepository;
    private final FeePolicyRepository feePolicyRepository;
    private final ClubRepository clubRepository;
    private final UserRepository userRepository;
    private final ClubAuthService clubAuthService;
    private final Clock clock; // Asia/Seoul — issuedAt(now)

    @Override
    public ReceiptResponse getMemberReceipt(Long userId, Long billId) {
        FeeBill bill = feeBillRepository.findByIdAndUserId(billId, userId)
                .orElseThrow(FeeBillException.FeeBillNotFoundException::new);
        return buildReceipt(bill);
    }

    @Override
    public ReceiptResponse getClubReceipt(Long clubId, Long actorId, Long billId) {
        clubAuthService.requireManager(actorId, clubId);
        FeeBill bill = feeBillRepository.findByIdAndClubId(billId, clubId)
                .orElseThrow(FeeBillException.FeeBillNotFoundException::new);
        return buildReceipt(bill);
    }

    private ReceiptResponse buildReceipt(FeeBill bill) {
        List<Payment> activePayments = paymentRepository.findByFeeBillIdOrderByCreatedAtAsc(bill.getId()).stream()
                .filter(Payment::isActive)
                .toList();
        // 발급 가드: 취소 청구이거나 ACTIVE 납부가 0건이면 발급 불가(부분 납부 OVERDUE 는 발급 가능).
        if (bill.getStatus() == FeeStatus.CANCELLED || activePayments.isEmpty()) {
            throw new FeeBillException.ReceiptUnavailableException();
        }
        long paidTotal = activePayments.stream().mapToLong(Payment::getAmount).sum();
        String memberName = userRepository.findById(bill.getUserId()).map(User::getName).orElse("회원");
        String clubName = clubRepository.findById(bill.getClubId()).map(Club::getName).orElse("동아리");
        String policyName = feePolicyRepository.findById(bill.getFeePolicyId())
                .map(FeePolicy::getName).orElse("회비");
        String receiptNumber = "RCP-" + bill.getBillingStartDate().format(RECEIPT_YEAR_MONTH) + "-" + bill.getId();

        return new ReceiptResponse(
                receiptNumber, clubName, memberName, policyName, bill.getBillingPeriod(),
                bill.getBillingStartDate(), bill.getBillingEndDate(), bill.getDueDate(),
                bill.getAmount(), paidTotal, bill.getAmount() - paidTotal, activePayments.size(),
                bill.getStatus(), LocalDateTime.now(clock),
                activePayments.stream().map(ReceiptResponse.PaymentLine::from).toList());
    }
}
```

- [ ] **Step 5: 회원 엔드포인트 추가(`MyFeeApi` + `MyFeeController`)**

`MyFeeApi.java` — `getMyFees` 뒤에 메서드 추가(+ import `ReceiptResponse`, `PathVariable`, `GetMapping` 은 이미 있음):
```java
    @Operation(summary = "내 회비 영수증 조회",
            description = "본인 청구의 영수증 데이터를 반환한다. ACTIVE 납부가 없거나 취소된 청구는 404.")
    @GetMapping("/my/fees/{billId}/receipt")
    ResponseEntity<ApiResponse<ReceiptResponse>> getMyReceipt(
            @PathVariable Long billId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
```
import 추가: `com.duing.domain.fee.controller.dto.response.ReceiptResponse`, `org.springframework.web.bind.annotation.PathVariable`.

`MyFeeController.java` — `ReceiptService` 필드 주입(`@RequiredArgsConstructor`) + 핸들러:
```java
    private final ReceiptService receiptService;

    @Override
    public ResponseEntity<ApiResponse<ReceiptResponse>> getMyReceipt(
            @PathVariable Long billId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        ReceiptResponse receipt = receiptService.getMemberReceipt(currentUser.id(), billId);
        return ResponseEntity.ok(ApiResponse.success(receipt));
    }
```
import 추가: `ReceiptService`, `ReceiptResponse`, `org.springframework.web.bind.annotation.PathVariable`.

- [ ] **Step 6: 총무 엔드포인트 추가(`LeaderFeeBillApi` + `LeaderFeeBillController`)**

`LeaderFeeBillApi.java` — `cancel` 뒤에 메서드 추가:
```java
    @Operation(summary = "회비 영수증 조회 (LEADER/OFFICER)",
            description = "동아리 청구의 영수증 데이터를 반환한다. ACTIVE 납부가 없거나 취소된 청구는 404, 타 동아리 청구도 404.")
    @GetMapping("/leader/clubs/{clubId}/fee-bills/{billId}/receipt")
    ResponseEntity<ApiResponse<ReceiptResponse>> getReceipt(
            @PathVariable Long clubId,
            @PathVariable Long billId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
```
import 추가: `ReceiptResponse`.

`LeaderFeeBillController.java` — `ReceiptService` 필드 + 핸들러:
```java
    private final ReceiptService receiptService;

    @Override
    public ResponseEntity<ApiResponse<ReceiptResponse>> getReceipt(
            @PathVariable Long clubId,
            @PathVariable Long billId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        ReceiptResponse receipt = receiptService.getClubReceipt(clubId, currentUser.id(), billId);
        return ResponseEntity.ok(ApiResponse.success(receipt));
    }
```
import 추가: `ReceiptService`, `ReceiptResponse`.

- [ ] **Step 7: 회원 영수증 통합테스트 작성**

`backend/src/test/java/com/duing/domain/fee/MyFeeReceiptControllerTest.java` — `MyFeeControllerTest` 셋업을 그대로 따른다(같은 패키지, `saveBill`/`recordPayment` 헬퍼):
```java
package com.duing.domain.fee;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.FeeBillFixture;
import com.duing.common.fixture.FeePolicyFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.entity.Payment;
import com.duing.domain.fee.entity.PaymentMethod;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.repository.PaymentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.time.LocalDateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class MyFeeReceiptControllerTest extends IntegrationTestBase {

    @LocalServerPort
    int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired FeePolicyRepository feePolicyRepository;
    @Autowired FeeBillRepository feeBillRepository;
    @Autowired PaymentRepository paymentRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private Long clubId;
    private Long policyId;
    private User userA;
    private User userB;
    private String tokenA;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club club = clubRepository.save(ClubFixture.academic("동아리A"));
        clubId = club.getId();
        userA = userRepository.save(UserFixture.unique());
        userB = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asMember(club, userA));
        clubMemberRepository.save(ClubMember.asMember(club, userB));
        FeePolicy policy = feePolicyRepository.save(FeePolicyFixture.of(clubId, BillingType.MONTHLY, 10000L));
        policyId = policy.getId();
        tokenA = jwtTokenProvider.createToken(userA.getId(), userA.getRole().name());
    }

    private FeeBill saveBill(Long userId, String period, FeeStatus status) {
        return feeBillRepository.save(FeeBillFixture.withStatus(clubId, userId, policyId, period, status));
    }

    private void recordPayment(Long billId, long amount, boolean voided) {
        Payment payment = Payment.record(billId, amount, PaymentMethod.CASH,
                LocalDateTime.of(2026, 7, 10, 0, 0), userA.getId(), "현금 납부");
        if (voided) {
            payment.voidPayment(userA.getId(), "정정", LocalDateTime.of(2026, 7, 11, 0, 0));
        }
        paymentRepository.save(payment);
    }

    @Test
    @DisplayName("ACTIVE 납부가 있는 청구는 영수증 번호·납부합계·건수·내역을 정확히 반환한다")
    void receiptReturnsAccurateData() {
        FeeBill bill = saveBill(userA.getId(), "2026-07", FeeStatus.PARTIAL_PAID);
        recordPayment(bill.getId(), 4000L, false);
        recordPayment(bill.getId(), 3000L, false);
        recordPayment(bill.getId(), 9999L, true); // VOIDED — 제외돼야 한다

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenA)
                .when().get("/api/v1/my/fees/" + bill.getId() + "/receipt")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.receiptNumber", equalTo("RCP-202607-" + bill.getId()))
                .body("data.amount", equalTo(10000))
                .body("data.paidTotal", equalTo(7000))
                .body("data.remaining", equalTo(3000))
                .body("data.paymentCount", equalTo(2))
                .body("data.payments", hasSize(2));
    }

    @Test
    @DisplayName("부분 납부가 있는 OVERDUE 청구도 영수증을 발급한다")
    void overdueWithPaymentIssuesReceipt() {
        FeeBill bill = saveBill(userA.getId(), "2026-07", FeeStatus.OVERDUE);
        recordPayment(bill.getId(), 5000L, false);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenA)
                .when().get("/api/v1/my/fees/" + bill.getId() + "/receipt")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.paidTotal", equalTo(5000));
    }

    @Test
    @DisplayName("ACTIVE 납부가 0건인 청구는 404 를 반환한다")
    void noActivePaymentReturns404() {
        FeeBill bill = saveBill(userA.getId(), "2026-07", FeeStatus.PENDING);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenA)
                .when().get("/api/v1/my/fees/" + bill.getId() + "/receipt")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("취소된 청구는 ACTIVE 납부가 있어도 404 를 반환한다")
    void cancelledWithPaymentReturns404() {
        FeeBill bill = saveBill(userA.getId(), "2026-07", FeeStatus.CANCELLED);
        recordPayment(bill.getId(), 5000L, false);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenA)
                .when().get("/api/v1/my/fees/" + bill.getId() + "/receipt")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("타인 청구의 영수증은 404 를 반환한다(존재 비노출)")
    void otherUsersBillReturns404() {
        FeeBill billB = saveBill(userB.getId(), "2026-07", FeeStatus.PAID);
        recordPayment(billB.getId(), 10000L, false);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenA)
                .when().get("/api/v1/my/fees/" + billB.getId() + "/receipt")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }
}
```

- [ ] **Step 8: 총무 영수증 통합테스트 작성**

`backend/src/test/java/com/duing/domain/fee/LeaderFeeReceiptControllerTest.java` — `LeaderFeeBillControllerTest` 셋업(leader/member 토큰, `ClubMember.asLeader`/`of`) 패턴:
```java
package com.duing.domain.fee;

import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.FeeBillFixture;
import com.duing.common.fixture.FeePolicyFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.entity.Payment;
import com.duing.domain.fee.entity.PaymentMethod;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.repository.PaymentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.time.LocalDateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderFeeReceiptControllerTest extends IntegrationTestBase {

    @LocalServerPort
    int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired FeePolicyRepository feePolicyRepository;
    @Autowired FeeBillRepository feeBillRepository;
    @Autowired PaymentRepository paymentRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private Long clubId;
    private Long otherClubId;
    private Long policyId;
    private Long otherPolicyId;
    private Long memberUserId;
    private String leaderToken;
    private String memberToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club club = clubRepository.save(ClubFixture.academic("동아리A"));
        Club otherClub = clubRepository.save(ClubFixture.academic("동아리B"));
        clubId = club.getId();
        otherClubId = otherClub.getId();

        User leader = userRepository.save(UserFixture.unique());
        User member = userRepository.save(UserFixture.unique());
        memberUserId = member.getId();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, member, ClubMemberRole.MEMBER));

        FeePolicy policy = feePolicyRepository.save(FeePolicyFixture.of(clubId, BillingType.MONTHLY, 10000L));
        FeePolicy otherPolicy = feePolicyRepository.save(FeePolicyFixture.of(otherClubId, BillingType.MONTHLY, 10000L));
        policyId = policy.getId();
        otherPolicyId = otherPolicy.getId();

        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        memberToken = jwtTokenProvider.createToken(member.getId(), member.getRole().name());
    }

    private FeeBill savePaidBill(Long clubIdValue, Long policyIdValue) {
        FeeBill bill = feeBillRepository.save(
                FeeBillFixture.withStatus(clubIdValue, memberUserId, policyIdValue, "2026-07", FeeStatus.PAID));
        paymentRepository.save(Payment.record(bill.getId(), 10000L, PaymentMethod.TRANSFER,
                LocalDateTime.of(2026, 7, 10, 0, 0), memberUserId, null));
        return bill;
    }

    @Test
    @DisplayName("총무는 동아리 청구의 영수증을 조회할 수 있다")
    void leaderReadsReceipt() {
        FeeBill bill = savePaidBill(clubId, policyId);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-bills/" + bill.getId() + "/receipt")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.receiptNumber", equalTo("RCP-202607-" + bill.getId()))
                .body("data.paidTotal", equalTo(10000));
    }

    @Test
    @DisplayName("타 동아리 청구의 영수증은 404 를 반환한다")
    void otherClubBillReturns404() {
        FeeBill otherBill = savePaidBill(otherClubId, otherPolicyId);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-bills/" + otherBill.getId() + "/receipt")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("운영진이 아닌 회원이 총무 영수증 API 를 호출하면 403 을 반환한다")
    void nonManagerReturns403() {
        FeeBill bill = savePaidBill(clubId, policyId);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-bills/" + bill.getId() + "/receipt")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }
}
```

- [ ] **Step 9: 테스트 실행 → 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.fee.MyFeeReceiptControllerTest" --tests "com.duing.domain.fee.LeaderFeeReceiptControllerTest"`
Expected: 두 클래스 전 테스트 PASS. (TestContainers 위해 Docker 실행 필요.)

- [ ] **Step 10: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/fee backend/src/test/java/com/duing/domain/fee
git commit -m "feat(backend): 회비 영수증 조회 API(회원·총무) 추가"
```

---

# Task 2 — 영수증 프론트 배선 (types · api · hooks)

**Files:**
- Modify: `frontend/packages/types/src/fee.ts`
- Modify: `frontend/packages/api/src/client.ts`
- Modify: `frontend/packages/hooks/src/fee.ts`, `feeQueryKeys.ts`, `index.ts`

- [ ] **Step 1: `Receipt` 타입 추가**

`frontend/packages/types/src/fee.ts` — `Payment` 타입 정의 아래에 추가:
```typescript
// ReceiptResponse.payments[] 항목 미러(ACTIVE 납부, VOIDED 제외).
export type ReceiptPaymentLine = {
  amount: number;
  method: PaymentMethod;
  paidAt: string; // ISO 일시
  memo: string | null;
};

// ReceiptResponse 미러. receiptNumber = "RCP-{YYYYMM}-{billId}".
export type Receipt = {
  receiptNumber: string;
  clubName: string;
  memberName: string;
  policyName: string;
  billingPeriod: string;
  billingStartDate: string;
  billingEndDate: string;
  dueDate: string;
  amount: number;
  paidTotal: number;
  remaining: number;
  paymentCount: number;
  status: FeeStatus;
  issuedAt: string; // ISO 일시(발급 시각)
  payments: ReceiptPaymentLine[];
};
```

- [ ] **Step 2: API 클라이언트 메서드 추가**

`frontend/packages/api/src/client.ts`:
1. fee 타입 import 블록(137~157행 근처)에 `Receipt,` 추가.
2. 타입 선언부 — `leader.fees` 의 `summary(...)` 선언 뒤(498행 근처)에 추가:
```typescript
      // 청구 영수증(ACTIVE 납부 없거나 취소 청구면 404).
      receipt(clubId: number, billId: number): Promise<Receipt>;
```
3. `my` 타입 선언(522~525행)에 추가:
```typescript
    feeReceipt(billId: number): Promise<Receipt>;
```
4. 구현부 — `leader.fees` 의 `summary:` 구현 뒤(1043행 근처)에 추가:
```typescript
        receipt: (clubId, billId) =>
          jsonOk<Receipt>(http.get(`leader/clubs/${clubId}/fee-bills/${billId}/receipt`)),
```
5. `my` 구현(1078~1081행)에 추가:
```typescript
      feeReceipt: (billId) =>
        jsonOk<Receipt>(http.get(`my/fees/${billId}/receipt`)),
```

- [ ] **Step 3: 쿼리키 추가**

`frontend/packages/hooks/src/feeQueryKeys.ts` — `memberAccount` 뒤에 추가:
```typescript
  // 총무 청구 영수증.
  receipt: (clubId: number, billId: number) =>
    [...feeQueryKeys.all, 'receipt', clubId, billId] as const,
  // 회원 본인 영수증.
  myReceipt: (billId: number) => [...feeQueryKeys.all, 'my', 'receipt', billId] as const,
```

- [ ] **Step 4: 영수증 훅 추가**

`frontend/packages/hooks/src/fee.ts` — `useMyFeesQuery` 아래에 추가(`retryUnlessNotFound` 재사용 — 발급 불가/타인 청구 404 는 재시도하지 않고 빈 상태로 surface):
```typescript
export function useClubFeeReceiptQuery(clubId: number, billId: number) {
  const client = useApiClient();
  return useQuery({
    queryKey: feeQueryKeys.receipt(clubId, billId),
    queryFn: () => client.leader.fees.receipt(clubId, billId),
    staleTime: 30 * 1000,
    retry: retryUnlessNotFound,
  });
}

export function useMyFeeReceiptQuery(billId: number) {
  const client = useApiClient();
  return useQuery({
    queryKey: feeQueryKeys.myReceipt(billId),
    queryFn: () => client.my.feeReceipt(billId),
    staleTime: 30 * 1000,
    retry: retryUnlessNotFound,
  });
}
```

- [ ] **Step 5: 훅 배럴 export 추가**

`frontend/packages/hooks/src/index.ts` — `} from './fee';`(225행) 직전에 두 줄 추가:
```typescript
  useClubFeeReceiptQuery,
  useMyFeeReceiptQuery,
```

- [ ] **Step 6: 타입체크 → 통과 확인**

Run: `cd frontend && pnpm -C apps/web typecheck && pnpm -r --filter "./packages/*" build`
Expected: 타입 에러 0. (또는 프로젝트 표준: `pnpm -w typecheck`.)

- [ ] **Step 7: 커밋**

```bash
git add frontend/packages
git commit -m "feat(frontend): 회비 영수증 타입·API·훅 배선"
```

---

# Task 3 — 영수증 프론트 화면 (인쇄용 페이지 + 진입 버튼)

**Files:**
- Create: `frontend/apps/web/app/_components/fee/FeeReceiptDocument.tsx`, `FeeReceiptScreen.tsx`
- Create: `frontend/apps/web/app/me/fees/[billId]/receipt/page.tsx`
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/fees/[billId]/receipt/page.tsx`
- Modify: `frontend/apps/web/app/globals.css`, `app/me/_components/MyFeeList.tsx`, `app/manage/clubs/[clubId]/fees/_components/BillList.tsx`
- Test: `frontend/apps/web/test/me/my-receipt.test.tsx`, `frontend/apps/web/test/manage/bill-list-receipt.test.tsx`

- [ ] **Step 1: 인쇄 시트 컴포넌트 작성**

`frontend/apps/web/app/_components/fee/FeeReceiptDocument.tsx`:
```tsx
'use client';

import type { Receipt } from '@duing/types';

import { feeStatusLabel, formatWon, paymentMethodLabel } from '@/app/_lib/feeLabels';

type FeeReceiptDocumentProps = {
  receipt: Receipt;
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-charcoal-3">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

// 인쇄 시트. globals.css 의 @media print 가 .receipt-sheet 만 보이게 하고 나머지 화면 크롬을 숨긴다.
export function FeeReceiptDocument({ receipt }: FeeReceiptDocumentProps) {
  return (
    <article className="receipt-sheet rounded-xl border border-line bg-paper p-8 text-ink">
      <header className="flex items-start justify-between border-b border-line pb-4">
        <div>
          <h1 className="text-lg font-bold">회비 납부 영수증</h1>
          <p className="mt-1 text-xs text-charcoal-3">{receipt.receiptNumber}</p>
        </div>
        <p className="text-sm font-semibold">{receipt.clubName}</p>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <Field label="회원" value={receipt.memberName} />
        <Field label="정책" value={receipt.policyName} />
        <Field label="회차" value={receipt.billingPeriod} />
        <Field label="상태" value={feeStatusLabel(receipt.status)} />
        <Field label="청구 기간" value={`${receipt.billingStartDate} ~ ${receipt.billingEndDate}`} />
        <Field label="마감일" value={receipt.dueDate} />
      </dl>

      <div className="mt-4 space-y-1 rounded-lg bg-graysoft px-4 py-3 text-sm">
        <div className="flex justify-between">
          <span className="text-charcoal-2">청구액</span>
          <span className="font-semibold">{formatWon(receipt.amount)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-charcoal-2">납부액 (총 {receipt.paymentCount}회)</span>
          <span className="font-semibold">{formatWon(receipt.paidTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-charcoal-2">잔액</span>
          <span className="font-semibold">{formatWon(receipt.remaining)}</span>
        </div>
      </div>

      <h2 className="mt-5 text-sm font-bold">납부 내역</h2>
      <table className="mt-2 w-full text-left text-xs">
        <thead>
          <tr className="border-b border-line text-charcoal-3">
            <th className="py-1.5 font-medium">납부일</th>
            <th className="py-1.5 font-medium">수단</th>
            <th className="py-1.5 text-right font-medium">금액</th>
            <th className="py-1.5 font-medium">메모</th>
          </tr>
        </thead>
        <tbody>
          {receipt.payments.map((line, index) => (
            <tr key={`${line.paidAt}-${index}`} className="border-b border-line/60">
              <td className="py-1.5">{line.paidAt.slice(0, 10)}</td>
              <td className="py-1.5">{paymentMethodLabel(line.method)}</td>
              <td className="py-1.5 text-right">{formatWon(line.amount)}</td>
              <td className="py-1.5 text-charcoal-2">{line.memo ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="mt-6 text-right text-xs text-charcoal-3">
        발급일 {receipt.issuedAt.slice(0, 10)}
      </footer>
    </article>
  );
}
```
> 확인: `@/app/_lib/feeLabels` 에 `paymentMethodLabel` 이 존재(정찰 확인됨). 없으면 추가하지 말고 `line.method` 원문 표기로 폴백하되, 존재하므로 그대로 사용.

- [ ] **Step 2: 영수증 화면(상태 처리 + 인쇄 버튼) 작성**

`frontend/apps/web/app/_components/fee/FeeReceiptScreen.tsx`:
```tsx
'use client';

import Link from 'next/link';

import type { Receipt } from '@duing/types';

import { FeeReceiptDocument } from './FeeReceiptDocument';

type FeeReceiptScreenProps = {
  receipt: Receipt | undefined;
  isLoading: boolean;
  isError: boolean;
  backHref: string;
};

export function FeeReceiptScreen({ receipt, isLoading, isError, backHref }: FeeReceiptScreenProps) {
  if (isLoading) {
    return <p className="p-6 text-sm text-charcoal-3">불러오는 중…</p>;
  }

  // 발급 불가(납부 0건/취소/타인)는 404 → ApiError 로 surface 되어 receipt 가 비어 있다.
  if (isError || !receipt) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <p className="text-sm text-charcoal-2">
          영수증을 불러올 수 없어요. 납부 내역이 있는 청구만 영수증을 발급할 수 있습니다.
        </p>
        <Link
          href={backHref}
          className="mt-3 inline-block text-sm font-semibold text-ink underline"
        >
          돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={backHref} className="text-sm font-semibold text-charcoal-2 hover:text-ink">
          ← 돌아가기
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-ink-deep"
        >
          인쇄 / PDF 저장
        </button>
      </div>
      <FeeReceiptDocument receipt={receipt} />
    </div>
  );
}
```

- [ ] **Step 3: 회원 영수증 라우트 작성**

`frontend/apps/web/app/me/fees/[billId]/receipt/page.tsx`:
```tsx
'use client';

import { useParams } from 'next/navigation';

import { useMyFeeReceiptQuery } from '@duing/hooks';

import { FeeReceiptScreen } from '@/app/_components/fee/FeeReceiptScreen';

export default function MemberReceiptPage() {
  const params = useParams<{ billId: string }>();
  const billId = Number(params.billId);
  const { data: receipt, isLoading, isError } = useMyFeeReceiptQuery(billId);

  return (
    <FeeReceiptScreen
      receipt={receipt}
      isLoading={isLoading}
      isError={isError || Number.isNaN(billId)}
      backHref="/me/fees"
    />
  );
}
```

- [ ] **Step 4: 총무 영수증 라우트 작성**

`frontend/apps/web/app/manage/clubs/[clubId]/fees/[billId]/receipt/page.tsx`:
```tsx
'use client';

import { useParams } from 'next/navigation';

import { useClubFeeReceiptQuery } from '@duing/hooks';

import { FeeReceiptScreen } from '@/app/_components/fee/FeeReceiptScreen';

export default function LeaderReceiptPage() {
  const params = useParams<{ clubId: string; billId: string }>();
  const clubId = Number(params.clubId);
  const billId = Number(params.billId);
  const { data: receipt, isLoading, isError } = useClubFeeReceiptQuery(clubId, billId);

  return (
    <FeeReceiptScreen
      receipt={receipt}
      isLoading={isLoading}
      isError={isError || Number.isNaN(clubId) || Number.isNaN(billId)}
      backHref={`/manage/clubs/${clubId}/fees`}
    />
  );
}
```

- [ ] **Step 5: 인쇄 전용 CSS 추가**

`frontend/apps/web/app/globals.css` — 파일 끝에 추가(루트 레이아웃이 이미 import 하는 전역 CSS):
```css
/* 회비 영수증 인쇄: .receipt-sheet 만 보이게 하고 화면 크롬(.no-print·네비)을 모두 숨긴다. */
@media print {
  body * {
    visibility: hidden;
  }
  .receipt-sheet,
  .receipt-sheet * {
    visibility: visible;
  }
  .receipt-sheet {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    border: none;
    box-shadow: none;
  }
  .no-print {
    display: none !important;
  }
}
```
> 확인: 경로가 `apps/web/app/globals.css` 가 맞는지 먼저 열어본다(다르면 루트 레이아웃이 import 하는 전역 CSS 파일에 동일 블록 추가).

- [ ] **Step 6: 회원 청구 행에 "영수증" 링크 추가**

`frontend/apps/web/app/me/_components/MyFeeList.tsx`:
1. 상단 import 에 `import Link from 'next/link';` 추가(기존 lucide import 위/아래 외부 라이브러리 그룹).
2. `MyFeeRow` 의 `<li>` 안, 콘텐츠 `<div className="min-w-0 flex-1">…</div>` **뒤**(닫는 `</li>` 직전)에 추가:
```tsx
      {bill.paidAmount > 0 && bill.status !== 'CANCELLED' && (
        <Link
          href={`/me/fees/${bill.id}/receipt`}
          className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-charcoal-2 transition-colors hover:bg-graysoft"
        >
          영수증
        </Link>
      )}
```
(조건 `paidAmount > 0 && status !== 'CANCELLED'` 는 백엔드 발급 가드와 일치 — 납부가 있는 청구에만 노출.)

- [ ] **Step 7: 총무 청구 행에 "영수증" 링크 추가**

`frontend/apps/web/app/manage/clubs/[clubId]/fees/_components/BillList.tsx`:
1. 상단 import 에 `import Link from 'next/link';` 추가.
2. `BillRow` 시그니처에 `clubId` 를 구조분해에 추가(이미 prop 으로 전달됨, 296행):
```tsx
function BillRow({ clubId, bill, member, onCancel, onRecord, onHistory }: BillRowProps) {
```
3. 액션 버튼 `<div className="flex shrink-0 items-center gap-1.5">`(345행) 안 **첫 자식**으로 추가:
```tsx
        {bill.paidAmount > 0 && bill.status !== 'CANCELLED' && (
          <Link
            href={`/manage/clubs/${clubId}/fees/${bill.id}/receipt`}
            className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-charcoal-2 transition-colors hover:bg-graysoft"
          >
            영수증
          </Link>
        )}
```

- [ ] **Step 8: 회원 영수증 페이지 테스트 작성**

`frontend/apps/web/test/me/my-receipt.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Receipt } from '@duing/types';

const mockUseMyFeeReceiptQuery = vi.fn();
vi.mock('@duing/hooks', () => ({
  useMyFeeReceiptQuery: (billId: number) => mockUseMyFeeReceiptQuery(billId),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ billId: '100' }),
}));

import MemberReceiptPage from '@/app/me/fees/[billId]/receipt/page';

const buildReceipt = (over: Partial<Receipt> = {}): Receipt => ({
  receiptNumber: 'RCP-202607-100',
  clubName: '동아리A',
  memberName: '김회원',
  policyName: '월 회비',
  billingPeriod: '2026-07',
  billingStartDate: '2026-07-01',
  billingEndDate: '2026-07-31',
  dueDate: '2026-07-31',
  amount: 10000,
  paidTotal: 7000,
  remaining: 3000,
  paymentCount: 2,
  status: 'PARTIAL_PAID',
  issuedAt: '2026-07-15T00:00:00',
  payments: [
    { amount: 4000, method: 'CASH', paidAt: '2026-07-10T00:00:00', memo: null },
    { amount: 3000, method: 'TRANSFER', paidAt: '2026-07-12T00:00:00', memo: '이체' },
  ],
  ...over,
});

beforeEach(() => {
  mockUseMyFeeReceiptQuery.mockReset();
});

describe('회원 영수증 페이지', () => {
  it('영수증 번호와 납부 합계를 표시한다', () => {
    mockUseMyFeeReceiptQuery.mockReturnValue({ data: buildReceipt(), isLoading: false, isError: false });
    render(<MemberReceiptPage />);
    expect(screen.getByText('RCP-202607-100')).toBeInTheDocument();
    expect(screen.getByText('회비 납부 영수증')).toBeInTheDocument();
  });

  it('인쇄 버튼이 window.print 를 호출한다', () => {
    mockUseMyFeeReceiptQuery.mockReturnValue({ data: buildReceipt(), isLoading: false, isError: false });
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<MemberReceiptPage />);
    fireEvent.click(screen.getByRole('button', { name: '인쇄 / PDF 저장' }));
    expect(printSpy).toHaveBeenCalledOnce();
    printSpy.mockRestore();
  });

  it('발급 불가(에러)면 안내 문구와 돌아가기 링크를 표시한다', () => {
    mockUseMyFeeReceiptQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<MemberReceiptPage />);
    expect(screen.getByText(/영수증을 불러올 수 없어요/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '돌아가기' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 9: 청구 목록 영수증 버튼 노출 테스트 작성**

`frontend/apps/web/test/manage/bill-list-receipt.test.tsx` — 기존 `bill-list.test.tsx` 의 hooks/api/toast mock 패턴을 따른다:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseClubFeeBillsQuery = vi.fn();
vi.mock('@duing/hooks', () => ({
  useClubFeeBillsQuery: (clubId: number, params: unknown) => mockUseClubFeeBillsQuery(clubId, params),
  useCancelBillMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useClubMembersQuery: () => ({ data: [{ userId: 42, name: '김회원', studentId: '20210001' }] }),
  useBillPaymentsQuery: () => ({ data: [], isLoading: false }),
  useRecordPaymentMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useVoidPaymentMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));

const { MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message = 'api error') {
      super(message);
      this.status = status;
      this.name = 'ApiError';
    }
  }
  return { MockApiError };
});
vi.mock('@duing/api', () => ({ ApiError: MockApiError }));
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

import { BillList } from '@/app/manage/clubs/[clubId]/fees/_components/BillList';

const buildBill = (over: Record<string, unknown> = {}) => ({
  id: 100, clubId: 1, userId: 42, feePolicyId: 7, amount: 10000,
  billingPeriod: '2026-07', billingStartDate: '2026-07-01', billingEndDate: '2026-07-31',
  dueDate: '2026-07-31', status: 'PARTIAL_PAID', paidAmount: 4000, remainingAmount: 6000, ...over,
});
const buildPage = (content: unknown[]) => ({
  content, page: 0, size: 20, totalElements: content.length,
  totalPages: content.length === 0 ? 0 : 1, hasNext: false,
});

beforeEach(() => {
  mockUseClubFeeBillsQuery.mockReset();
});

describe('총무 청구 목록 — 영수증 버튼', () => {
  it('납부가 있는 청구에는 영수증 링크가 보인다', () => {
    mockUseClubFeeBillsQuery.mockReturnValue({ data: buildPage([buildBill()]), isLoading: false });
    render(<BillList clubId={1} />);
    const receiptLink = screen.getByRole('link', { name: '영수증' });
    expect(receiptLink).toHaveAttribute('href', '/manage/clubs/1/fees/100/receipt');
  });

  it('납부가 없는 청구에는 영수증 링크가 없다', () => {
    mockUseClubFeeBillsQuery.mockReturnValue({
      data: buildPage([buildBill({ status: 'PENDING', paidAmount: 0, remainingAmount: 10000 })]),
      isLoading: false,
    });
    render(<BillList clubId={1} />);
    expect(screen.queryByRole('link', { name: '영수증' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 10: 테스트·타입체크 실행 → 통과 확인**

Run: `cd frontend && pnpm -C apps/web test -- my-receipt bill-list-receipt && pnpm -C apps/web typecheck`
Expected: 테스트 PASS, 타입 에러 0.

- [ ] **Step 11: 커밋**

```bash
git add frontend/apps/web
git commit -m "feat(frontend): 회비 영수증 인쇄 페이지 및 진입 버튼 추가"
```

---

# Task 4 — 자동발행 설정 (V65 · FeePolicy · 검증 · 생성/수정 API)

**Files:**
- Create: `backend/src/main/resources/db/migration/V65__fee_policy_auto_issue.sql`
- Modify: `backend/.../fee/entity/FeePolicy.java`, `repository/FeePolicyRepository.java`, `exception/FeePolicyException.java`
- Modify: `CreateFeePolicyRequest.java`, `UpdateFeePolicyRequest.java`, `CreateFeePolicyCommand.java`, `UpdateFeePolicyCommand.java`, `FeePolicyQuery.java`, `FeePolicyResponse.java`, `GeneralFeePolicyService.java`
- Modify(test): `FeePolicyFixture.java` · Test: `LeaderFeePolicyAutoIssueControllerTest.java`

- [ ] **Step 1: V65 마이그레이션 작성**

`backend/src/main/resources/db/migration/V65__fee_policy_auto_issue.sql`:
```sql
-- 회비 정책에 자동 월발행 opt-in 컬럼 추가(Sprint 4).
-- auto_issue: 매월 자동 발행 여부(기본 false). issue_day: 발행일, due_day: 마감일(둘 다 1~28).
-- 정합성(ck_fee_policy_auto_issue): 자동발행이 켜진 정책은 MONTHLY + 발행/마감일 1~28 + 마감일 >= 발행일.
-- 1~28 제한으로 말일/달 길이 엣지를 회피한다. issue_day/due_day 는 nullable(auto_issue=false 일 때 무의미).
ALTER TABLE fee_policy ADD COLUMN auto_issue BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE fee_policy ADD COLUMN issue_day  SMALLINT;
ALTER TABLE fee_policy ADD COLUMN due_day    SMALLINT;
ALTER TABLE fee_policy ADD CONSTRAINT ck_fee_policy_auto_issue CHECK (
    auto_issue = FALSE
    OR (billing_type = 'MONTHLY'
        AND issue_day BETWEEN 1 AND 28
        AND due_day   BETWEEN 1 AND 28
        AND due_day >= issue_day)
);
```

- [ ] **Step 2: `FeePolicy` 엔티티에 필드·설정 메서드 추가**

`FeePolicy.java` — `active` 필드 아래에 추가:
```java
    @Column(name = "auto_issue", nullable = false)
    private boolean autoIssue;

    @Column(name = "issue_day")
    private Integer issueDay;

    @Column(name = "due_day")
    private Integer dueDay;
```
그리고 `update(...)` 메서드 아래에 추가:
```java
    /**
     * 자동 월발행 설정을 반영한다. 끄는 경우(autoIssue=false) 발행일·마감일을 함께 비운다(DB CHECK 정합).
     * 켜는 경우 호출 전 검증(MONTHLY·1~28·dueDay>=issueDay)을 통과했다고 가정한다.
     */
    public void applyAutoIssue(boolean autoIssue, Integer issueDay, Integer dueDay) {
        this.autoIssue = autoIssue;
        this.issueDay = autoIssue ? issueDay : null;
        this.dueDay = autoIssue ? dueDay : null;
    }
```
> 주의: Lombok `@Getter` 는 boolean `autoIssue` 에 `isAutoIssue()`, Integer 에 `getIssueDay()`/`getDueDay()` 를 생성한다. 기존 `create()`/`@Builder` 는 변경 불필요(새 필드는 기본값 false/null).

- [ ] **Step 3: 자동발행 검증 예외 2종 추가**

`FeePolicyException.java` — `FeePolicyBillingTypeImmutableException` 뒤에 추가:
```java
    public static class AutoIssueNotMonthlyException extends FeePolicyException {
        private static final String MESSAGE = "자동 발행은 매월(MONTHLY) 정책에서만 설정할 수 있습니다.";

        public AutoIssueNotMonthlyException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    public static class InvalidIssueScheduleException extends FeePolicyException {
        private static final String MESSAGE =
                "발행일·마감일은 1~28 사이여야 하며, 마감일은 발행일과 같거나 이후여야 합니다.";

        public InvalidIssueScheduleException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }
```

- [ ] **Step 4: 정책 DTO 6종에 3 필드 추가**

`CreateFeePolicyCommand.java`:
```java
public record CreateFeePolicyCommand(Long clubId, Long actorId, String name, Long amount, BillingType billingType,
                                     Boolean autoIssue, Integer issueDay, Integer dueDay) {
}
```
`UpdateFeePolicyCommand.java`:
```java
public record UpdateFeePolicyCommand(Long clubId, Long actorId, Long policyId,
                                     String name, Long amount, BillingType billingType, Boolean active,
                                     Boolean autoIssue, Integer issueDay, Integer dueDay) {
}
```
`CreateFeePolicyRequest.java`(+ import `jakarta.validation.constraints.Max`, `Min`):
```java
public record CreateFeePolicyRequest(
        @NotBlank(message = "정책 이름은 필수입니다.") @Size(max = 100, message = "정책 이름은 100자 이하여야 합니다.") String name,
        @NotNull(message = "금액은 필수입니다.") @PositiveOrZero(message = "금액은 0 이상이어야 합니다.") Long amount,
        @NotNull(message = "회비 유형은 필수입니다.") BillingType billingType,
        Boolean autoIssue,
        @Min(value = 1, message = "발행일은 1~28 사이여야 합니다.") @Max(value = 28, message = "발행일은 1~28 사이여야 합니다.") Integer issueDay,
        @Min(value = 1, message = "마감일은 1~28 사이여야 합니다.") @Max(value = 28, message = "마감일은 1~28 사이여야 합니다.") Integer dueDay) {

    public CreateFeePolicyCommand toCommand(Long clubId, Long actorId) {
        return new CreateFeePolicyCommand(clubId, actorId, name, amount, billingType, autoIssue, issueDay, dueDay);
    }
}
```
`UpdateFeePolicyRequest.java`(+ import `Max`, `Min`):
```java
public record UpdateFeePolicyRequest(
        @Pattern(regexp = "^\\s*\\S.*$", message = "정책 이름은 공백일 수 없습니다.")
        @Size(max = 100, message = "정책 이름은 100자 이하여야 합니다.") String name,
        @PositiveOrZero(message = "금액은 0 이상이어야 합니다.") Long amount,
        BillingType billingType, Boolean active,
        Boolean autoIssue,
        @Min(value = 1, message = "발행일은 1~28 사이여야 합니다.") @Max(value = 28, message = "발행일은 1~28 사이여야 합니다.") Integer issueDay,
        @Min(value = 1, message = "마감일은 1~28 사이여야 합니다.") @Max(value = 28, message = "마감일은 1~28 사이여야 합니다.") Integer dueDay) {

    public UpdateFeePolicyCommand toCommand(Long clubId, Long actorId, Long policyId) {
        return new UpdateFeePolicyCommand(clubId, actorId, policyId, name, amount, billingType, active,
                autoIssue, issueDay, dueDay);
    }
}
```
`FeePolicyQuery.java`:
```java
public record FeePolicyQuery(Long id, String name, Long amount, BillingType billingType, boolean active,
                             boolean autoIssue, Integer issueDay, Integer dueDay) {

    public static FeePolicyQuery from(FeePolicy policy) {
        return new FeePolicyQuery(policy.getId(), policy.getName(), policy.getAmount(),
                policy.getBillingType(), policy.isActive(),
                policy.isAutoIssue(), policy.getIssueDay(), policy.getDueDay());
    }
}
```
`FeePolicyResponse.java`:
```java
public record FeePolicyResponse(Long id, String name, Long amount, BillingType billingType, boolean active,
                                boolean autoIssue, Integer issueDay, Integer dueDay) {

    public static FeePolicyResponse from(FeePolicyQuery query) {
        return new FeePolicyResponse(query.id(), query.name(), query.amount(), query.billingType(), query.active(),
                query.autoIssue(), query.issueDay(), query.dueDay());
    }
}
```

- [ ] **Step 5: `GeneralFeePolicyService` 공유 검증 + 적용**

`GeneralFeePolicyService.java` — `import com.duing.domain.fee.entity.BillingType;` 추가. `create`/`update` 교체 + private `validateAutoIssue` 추가:
```java
    @Override
    @Transactional
    public Long create(CreateFeePolicyCommand command) {
        clubAuthService.requireManager(command.actorId(), command.clubId());
        FeePolicy policy = FeePolicy.create(command.clubId(), command.name(), command.amount(), command.billingType());
        if (Boolean.TRUE.equals(command.autoIssue())) {
            validateAutoIssue(command.billingType(), command.issueDay(), command.dueDay());
            policy.applyAutoIssue(true, command.issueDay(), command.dueDay());
        }
        return feePolicyRepository.save(policy).getId();
    }

    @Override
    @Transactional
    public void update(UpdateFeePolicyCommand command) {
        clubAuthService.requireManager(command.actorId(), command.clubId());
        FeePolicy policy = feePolicyRepository.findByIdAndClubIdForUpdate(command.policyId(), command.clubId())
                .orElseThrow(FeePolicyException.FeePolicyNotFoundException::new);
        boolean changesBillingType = command.billingType() != null
                && command.billingType() != policy.getBillingType();
        if (changesBillingType && feeBillRepository.existsByFeePolicyId(command.policyId())) {
            throw new FeePolicyException.FeePolicyBillingTypeImmutableException();
        }
        policy.update(command.name(), command.amount(), command.billingType(), command.active());
        // autoIssue 미전송(null)은 기존 자동발행 설정 유지. 명시 true/false 일 때만 반영한다.
        if (command.autoIssue() != null) {
            if (command.autoIssue()) {
                validateAutoIssue(policy.getBillingType(), command.issueDay(), command.dueDay());
                policy.applyAutoIssue(true, command.issueDay(), command.dueDay());
            } else {
                policy.applyAutoIssue(false, null, null);
            }
        }
    }

    // 생성·수정 공유 검증: 자동발행은 MONTHLY 한정, 발행일·마감일 1~28, 마감일 >= 발행일.
    private void validateAutoIssue(BillingType billingType, Integer issueDay, Integer dueDay) {
        if (billingType != BillingType.MONTHLY) {
            throw new FeePolicyException.AutoIssueNotMonthlyException();
        }
        if (issueDay == null || dueDay == null
                || issueDay < 1 || issueDay > 28 || dueDay < 1 || dueDay > 28
                || dueDay < issueDay) {
            throw new FeePolicyException.InvalidIssueScheduleException();
        }
    }
```

- [ ] **Step 6: `FeePolicyFixture` 에 autoIssue 헬퍼 추가**

`FeePolicyFixture.java` — `inactive` 아래에 추가:
```java
    /** 자동 월발행이 켜진 MONTHLY 정책(issueDay/dueDay 지정). */
    public static FeePolicy autoIssue(Long clubId, int issueDay, int dueDay) {
        FeePolicy policy = FeePolicy.create(clubId, "자동 월 회비", 10000L, BillingType.MONTHLY);
        policy.applyAutoIssue(true, issueDay, dueDay);
        return policy;
    }
```

- [ ] **Step 7: 정책 생성/수정 자동발행 통합테스트 작성**

`backend/src/test/java/com/duing/domain/fee/LeaderFeePolicyAutoIssueControllerTest.java`:
```java
package com.duing.domain.fee;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderFeePolicyAutoIssueControllerTest extends IntegrationTestBase {

    @LocalServerPort
    int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired FeePolicyRepository feePolicyRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private Long clubId;
    private String leaderToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club club = clubRepository.save(ClubFixture.academic("동아리A"));
        clubId = club.getId();
        User leader = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
    }

    @Test
    @DisplayName("MONTHLY 정책을 자동발행 켜서 생성하면 발행일·마감일이 저장된다")
    void createMonthlyWithAutoIssue() {
        Integer id = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("name", "월 회비", "amount", 10000, "billingType", "MONTHLY",
                        "autoIssue", true, "issueDay", 5, "dueDay", 20))
                .when().post("/api/v1/leader/clubs/" + clubId + "/fee-policies")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().path("data");

        FeePolicy saved = feePolicyRepository.findById(id.longValue()).orElseThrow();
        assertThat(saved.isAutoIssue()).isTrue();
        assertThat(saved.getIssueDay()).isEqualTo(5);
        assertThat(saved.getDueDay()).isEqualTo(20);
    }

    @Test
    @DisplayName("비-MONTHLY 정책을 자동발행 켜서 생성하면 400 을 반환한다")
    void createNonMonthlyAutoIssueRejected() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("name", "학기 회비", "amount", 50000, "billingType", "SEMESTER",
                        "autoIssue", true, "issueDay", 5, "dueDay", 20))
                .when().post("/api/v1/leader/clubs/" + clubId + "/fee-policies")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("마감일이 발행일보다 앞서면 400 을 반환한다")
    void dueBeforeIssueRejected() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("name", "월 회비", "amount", 10000, "billingType", "MONTHLY",
                        "autoIssue", true, "issueDay", 20, "dueDay", 5))
                .when().post("/api/v1/leader/clubs/" + clubId + "/fee-policies")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("기존 MONTHLY 정책을 수정으로 자동발행 켤 수 있다")
    void updateEnablesAutoIssue() {
        FeePolicy policy = feePolicyRepository.save(
                com.duing.common.fixture.FeePolicyFixture.monthly(clubId));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("autoIssue", true, "issueDay", 3, "dueDay", 25))
                .when().patch("/api/v1/leader/clubs/" + clubId + "/fee-policies/" + policy.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        FeePolicy updated = feePolicyRepository.findById(policy.getId()).orElseThrow();
        assertThat(updated.isAutoIssue()).isTrue();
        assertThat(updated.getIssueDay()).isEqualTo(3);
        assertThat(updated.getDueDay()).isEqualTo(25);
    }
}
```

- [ ] **Step 8: 테스트 실행 → 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.fee.LeaderFeePolicyAutoIssueControllerTest"`
Expected: 전 테스트 PASS. (V65 적용 + ddl-auto=validate 정합 확인.)

- [ ] **Step 9: 커밋**

```bash
git add backend/src/main/resources/db/migration/V65__fee_policy_auto_issue.sql backend/src/main/java/com/duing/domain/fee backend/src/test/java/com/duing/domain/fee backend/src/test/java/com/duing/common/fixture/FeePolicyFixture.java
git commit -m "feat(backend): 회비 정책 자동 월발행 설정(생성·수정) 및 검증 추가"
```

---

# Task 5 — 자동발행 크론 (autoIssueMonthly · MonthlyBillIssueJob · 플래그)

**Files:**
- Modify: `backend/.../fee/repository/FeePolicyRepository.java`, `service/FeeBillService.java`, `service/GeneralFeeBillService.java`
- Create: `backend/.../fee/job/MonthlyBillIssueJob.java`, `config/FeeAutoIssueJobConfig.java`
- Modify: `application.yml`, `src/test/resources/application.yml`, `backend/.env.example`
- Test: `backend/src/test/java/com/duing/domain/fee/job/MonthlyBillIssueJobTest.java`

- [ ] **Step 1: `findAutoIssueDue` 쿼리 추가**

`FeePolicyRepository.java` — `findByIdAndClubIdForUpdate` 아래에 추가(+ import `java.util.List`):
```java
    // 자동 월발행 대상: 활성 + MONTHLY + auto_issue=true + 발행일이 오늘 일자 이하(today.day >= issue_day, 캐치업).
    // @SQLRestriction(deleted_at IS NULL)이 JPQL 에 자동 적용된다.
    @Query("""
            SELECT p FROM FeePolicy p
            WHERE p.active = true
              AND p.billingType = com.duing.domain.fee.entity.BillingType.MONTHLY
              AND p.autoIssue = true
              AND p.issueDay <= :dayOfMonth
            """)
    List<FeePolicy> findAutoIssueDue(@Param("dayOfMonth") int dayOfMonth);
```

- [ ] **Step 2: `FeeBillService` 인터페이스에 `autoIssueMonthly` 추가**

`FeeBillService.java`(+ import `com.duing.domain.fee.entity.FeePolicy`, `java.time.LocalDate`):
```java
    // 크론 전용 발행 경로(권한·과거검증 없음, 시스템 권위). 정책의 그 달(today 기준) 청구를 멱등 발행한다.
    void autoIssueMonthly(FeePolicy policy, LocalDate today);
```

- [ ] **Step 3: `GeneralFeeBillService.autoIssueMonthly` 구현**

`GeneralFeeBillService.java` — `import java.time.format.DateTimeFormatter;` 추가. 클래스 상단 상수 + `generate` 뒤에 메서드 추가:
```java
    private static final DateTimeFormatter AUTO_ISSUE_YEAR_MONTH = DateTimeFormatter.ofPattern("yyyy-MM");
```
```java
    @Override
    @Transactional
    public void autoIssueMonthly(FeePolicy policy, LocalDate today) {
        // 방어적 no-op: 크론 조회와 발행 사이 상태가 바뀌었을 수 있으므로 다시 확인(권한 검증은 없음 — 시스템 권위).
        if (!policy.isActive() || policy.getBillingType() != BillingType.MONTHLY || !policy.isAutoIssue()) {
            return;
        }
        String yearMonth = today.format(AUTO_ISSUE_YEAR_MONTH); // "2026-07"
        BillingPeriodResolver.Resolved resolved = periodResolver.resolveMonthly(yearMonth);
        // 마감일은 정책 dueDay 로 산출(말일 아님). 과거 검증 없음 — 캐치업 발행 시 과거여도 정상(연체 크론이 처리).
        LocalDate dueDate = LocalDate.of(today.getYear(), today.getMonth(), policy.getDueDay());

        int created = feeBillRepository.bulkInsertBills(
                policy.getClubId(), policy.getId(), policy.getAmount(), resolved.billingPeriod(),
                resolved.startDate(), resolved.endDate(), dueDate);

        log.info("auto-issue monthly bills: clubId={}, policyId={}, period={}, created={}",
                policy.getClubId(), policy.getId(), resolved.billingPeriod(), created);

        // 새 청구가 생성된 경우에만 발행 알림(이미 그 달 발행이면 created=0 → 재알림 없음, 캐치업 안전).
        if (created > 0) {
            String clubName = clubRepository.findById(policy.getClubId())
                    .map(Club::getName).orElse("동아리");
            eventPublisher.publishEvent(new FeeBillsIssuedEvent(
                    policy.getClubId(), clubName, policy.getId(), resolved.billingPeriod(),
                    resolved.startDate(), dueDate));
        }
    }
```

- [ ] **Step 4: `FeeAutoIssueJobConfig` 작성**

`backend/src/main/java/com/duing/domain/fee/config/FeeAutoIssueJobConfig.java`:
```java
package com.duing.domain.fee.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 회비 자동 월발행 크론을 활성화하는 설정 클래스.
 * {@code DUING_FEE_AUTO_ISSUE_ENABLED=true} 환경변수(또는 yml 키)가 설정된 경우에만 스케줄링이 켜진다.
 * 연체 크론(FeeJobConfig, duing.fee.overdue)과 독립 on/off 하기 위해 별도 @EnableScheduling 설정을 둔다.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "duing.fee.auto-issue", name = "enabled", havingValue = "true")
public class FeeAutoIssueJobConfig {}
```

- [ ] **Step 5: `MonthlyBillIssueJob` 작성**

`backend/src/main/java/com/duing/domain/fee/job/MonthlyBillIssueJob.java`:
```java
package com.duing.domain.fee.job;

import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.service.FeeBillService;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(prefix = "duing.fee.auto-issue", name = "enabled", havingValue = "true")
public class MonthlyBillIssueJob {

    private final FeePolicyRepository feePolicyRepository;
    private final FeeBillService feeBillService;
    private final Clock clock;

    // 매일 00:20 (Asia/Seoul). 연체 크론(00:10)과 시간을 분리한다.
    // run() 은 @Transactional 이 아니다 — 각 정책 발행(autoIssueMonthly)이 자체 트랜잭션을 가져
    // 한 정책 실패가 배치 전체를 막거나 롤백시키지 않게 한다(try/catch 로 정책별 격리).
    @Scheduled(cron = "0 20 0 * * *", zone = "Asia/Seoul")
    public void run() {
        LocalDate today = LocalDate.now(clock);
        int dayOfMonth = today.getDayOfMonth();
        List<FeePolicy> duePolicies = feePolicyRepository.findAutoIssueDue(dayOfMonth);
        if (duePolicies.isEmpty()) {
            log.info("MonthlyBillIssueJob: 자동발행 대상 정책 없음 (day={})", dayOfMonth);
            return;
        }
        int succeeded = 0;
        for (FeePolicy policy : duePolicies) {
            try {
                feeBillService.autoIssueMonthly(policy, today);
                succeeded++;
            } catch (Exception failure) {
                log.warn("MonthlyBillIssueJob: 정책 자동발행 실패 clubId={}, policyId={}",
                        policy.getClubId(), policy.getId(), failure);
            }
        }
        log.info("MonthlyBillIssueJob: 대상 {}건 중 {}건 처리", duePolicies.size(), succeeded);
    }
}
```

- [ ] **Step 6: 환경 플래그 3곳 추가**

`backend/src/main/resources/application.yml` — `duing.fee.overdue` 블록 뒤에 추가:
```yaml
    auto-issue:
      # 회비 자동 월발행 크론(매일 00:20 Asia/Seoul) — MONTHLY auto_issue 정책의 그 달 청구를 자동 발행.
      # 기본 비활성 — 운영에서 DUING_FEE_AUTO_ISSUE_ENABLED=true 주입 시 활성화한다.
      enabled: ${DUING_FEE_AUTO_ISSUE_ENABLED:false}
```
`backend/src/test/resources/application.yml` — `duing.fee.overdue.enabled: false` 뒤(같은 들여쓰기)에 추가:
```yaml
    auto-issue:
      enabled: false
```
`backend/.env.example` — `DUING_FEE_OVERDUE_ENABLED=true` 근처에 추가:
```
# 회비 자동 월발행 크론 활성화(미설정 시 false). 운영에서만 true 권장.
DUING_FEE_AUTO_ISSUE_ENABLED=false
```

- [ ] **Step 7: 크론 통합테스트 작성(고정 Clock)**

`backend/src/test/java/com/duing/domain/fee/job/MonthlyBillIssueJobTest.java`:
```java
package com.duing.domain.fee.job;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.FeePolicyFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.notification.entity.Notification;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.repository.NotificationRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;

@Import({TestcontainersConfiguration.class, MonthlyBillIssueJobTest.FixedClockConfig.class})
@SpringBootTest(properties = "duing.fee.auto-issue.enabled=true")
class MonthlyBillIssueJobTest extends IntegrationTestBase {

    // 오늘을 2026-06-15(Asia/Seoul)로 고정 — issue_day 비교(today.day=15)를 결정적으로 만든다.
    static final LocalDate TODAY = LocalDate.of(2026, 6, 15);

    @TestConfiguration
    static class FixedClockConfig {
        @Bean
        @Primary
        Clock fixedClock() {
            return Clock.fixed(TODAY.atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant(), ZoneId.of("Asia/Seoul"));
        }
    }

    @Autowired MonthlyBillIssueJob job;
    @Autowired ClubRepository clubRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired FeePolicyRepository feePolicyRepository;
    @Autowired FeeBillRepository feeBillRepository;
    @Autowired NotificationRepository notificationRepository;

    private Long clubId;

    @BeforeEach
    void setUp() {
        Club club = clubRepository.save(ClubFixture.academic("자동발행동아리"));
        clubId = club.getId();
        addActiveMembers(2);
    }

    private void addActiveMembers(int count) {
        Club club = clubRepository.findById(clubId).orElseThrow();
        for (int index = 0; index < count; index++) {
            User user = userRepository.save(UserFixture.unique());
            clubMemberRepository.save(ClubMember.asMember(club, user));
        }
    }

    private long billCount() {
        return feeBillRepository.count();
    }

    private long issuedNotificationCount() {
        return notificationRepository.findAll().stream()
                .filter(notification -> notification.getType() == NotificationType.FEE_BILL_ISSUED)
                .count();
    }

    @Test
    @DisplayName("발행일이 오늘 일자 이하면 그 달 청구를 회원 수만큼 발행하고 발행 알림을 보낸다")
    void issuesWhenDayReached() {
        feePolicyRepository.save(FeePolicyFixture.autoIssue(clubId, 5, 25)); // issue_day=5 <= 15

        job.run();

        List<FeeBill> bills = feeBillRepository.findAll();
        assertThat(bills).hasSize(2);
        assertThat(bills).allSatisfy(bill -> {
            assertThat(bill.getBillingPeriod()).isEqualTo("2026-06");
            assertThat(bill.getBillingStartDate()).isEqualTo(LocalDate.of(2026, 6, 1));
            assertThat(bill.getDueDate()).isEqualTo(LocalDate.of(2026, 6, 25));
        });
        assertThat(issuedNotificationCount()).isEqualTo(2);
    }

    @Test
    @DisplayName("발행일이 오늘 일자보다 크면 그 달 청구를 발행하지 않는다")
    void skipsWhenDayNotReached() {
        feePolicyRepository.save(FeePolicyFixture.autoIssue(clubId, 20, 25)); // issue_day=20 > 15

        job.run();

        assertThat(billCount()).isZero();
    }

    @Test
    @DisplayName("같은 달에 두 번 실행해도 청구·알림이 중복 생성되지 않는다(캐치업 멱등)")
    void idempotentOnRerun() {
        feePolicyRepository.save(FeePolicyFixture.autoIssue(clubId, 5, 25));

        job.run();
        long billsAfterFirst = billCount();
        long notisAfterFirst = issuedNotificationCount();
        job.run();

        assertThat(billCount()).isEqualTo(billsAfterFirst);
        assertThat(issuedNotificationCount()).isEqualTo(notisAfterFirst);
    }

    @Test
    @DisplayName("비활성·비-MONTHLY·자동발행 꺼짐 정책은 발행 대상에서 제외된다")
    void excludesNonEligiblePolicies() {
        feePolicyRepository.save(FeePolicyFixture.inactive(clubId)); // active=false
        feePolicyRepository.save(FeePolicyFixture.of(clubId, BillingType.SEMESTER, 50000L)); // 비-MONTHLY
        feePolicyRepository.save(FeePolicyFixture.monthly(clubId)); // auto_issue=false

        job.run();

        assertThat(billCount()).isZero();
    }

    @Test
    @DisplayName("마감일이 오늘보다 과거인 캐치업 발행도 성공한다(과거 검증 미적용)")
    void catchUpWithPastDueSucceeds() {
        feePolicyRepository.save(FeePolicyFixture.autoIssue(clubId, 5, 10)); // due 2026-06-10 < today 06-15

        job.run();

        List<FeeBill> bills = feeBillRepository.findAll();
        assertThat(bills).hasSize(2);
        assertThat(bills).allSatisfy(bill ->
                assertThat(bill.getDueDate()).isEqualTo(LocalDate.of(2026, 6, 10)));
    }
}
```
> 주의: AFTER_COMMIT 리스너는 각 `autoIssueMonthly` TX 커밋 후 동기 실행되므로 `job.run()` 반환 뒤 `notificationRepository` 조회로 검증 가능(같은 TX 안에서는 안 보임 — run() 은 비-@Transactional 이라 문제 없음).

- [ ] **Step 8: 테스트 실행 → 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.fee.job.MonthlyBillIssueJobTest"`
Expected: 전 테스트 PASS.

- [ ] **Step 9: 백엔드 전체 테스트로 회귀 확인**

Run: `cd backend && ./gradlew test`
Expected: 기존 + 신규 전부 PASS(정책 DTO 4 필드 확장이 기존 정책 테스트를 깨지 않는지 확인).

- [ ] **Step 10: 커밋**

```bash
git add backend
git commit -m "feat(backend): 회비 자동 월발행 크론(MonthlyBillIssueJob) 추가"
```

---

# Task 6 — 자동발행 프론트 (정책 폼 토글·발행일·마감일)

**Files:**
- Modify: `frontend/packages/types/src/fee.ts`, `frontend/packages/schemas/src/index.ts`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/fees/_components/CreatePolicyDialog.tsx`
- Test: `frontend/apps/web/test/manage/create-policy-dialog.test.tsx`

- [ ] **Step 1: 타입에 자동발행 필드 추가**

`frontend/packages/types/src/fee.ts`:
1. `FeePolicy` 타입에 추가:
```typescript
export type FeePolicy = {
  id: number;
  name: string;
  amount: number;
  billingType: BillingType;
  active: boolean;
  autoIssue: boolean;
  issueDay: number | null;
  dueDay: number | null;
};
```
2. `CreateFeePolicyPayload` 에 옵션 필드 추가(`UpdateFeePolicyPayload` 는 `Partial<CreateFeePolicyPayload> & { active? }` 라 자동 반영):
```typescript
export type CreateFeePolicyPayload = {
  name: string;
  amount: number;
  billingType: BillingType;
  autoIssue?: boolean;
  issueDay?: number;
  dueDay?: number;
};
```

- [ ] **Step 2: `createFeePolicySchema` 확장 + superRefine**

`frontend/packages/schemas/src/index.ts` — `createFeePolicySchema` 정의 교체(빈 number 입력을 `undefined` 로 정규화하는 `optionalDay` 전처리 + 자동발행 superRefine):
```typescript
// 빈 number 입력("")을 undefined 로 정규화한다 — z.coerce.number()는 ""→0 으로 강제하므로(자동발행 off 시 오탐) 전처리가 필요.
const optionalDay = (label: string) =>
  z.preprocess(
    (raw) => (raw === '' || raw === undefined || raw === null ? undefined : raw),
    z.coerce
      .number({ invalid_type_error: `${label}은 숫자여야 합니다.` })
      .int(`${label}은 정수여야 합니다.`)
      .min(1, `${label}은 1~28 사이여야 합니다.`)
      .max(28, `${label}은 1~28 사이여야 합니다.`)
      .optional(),
  );

export const createFeePolicySchema = z
  .object({
    name: z.string().min(1, '정책 이름은 필수입니다.').max(100, '정책 이름은 100자 이하여야 합니다.'),
    amount: z.coerce
      .number({ invalid_type_error: '금액은 숫자여야 합니다.' })
      .int('금액은 정수여야 합니다.')
      .min(0, '금액은 0 이상이어야 합니다.'),
    billingType: z.enum(['MONTHLY', 'SEMESTER', 'YEARLY', 'ONE_TIME'], {
      errorMap: () => ({ message: '회비 유형을 선택해주세요.' }),
    }),
    autoIssue: z.boolean().default(false),
    issueDay: optionalDay('발행일'),
    dueDay: optionalDay('마감일'),
  })
  .superRefine((value, ctx) => {
    if (!value.autoIssue) {
      return;
    }
    if (value.billingType !== 'MONTHLY') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['autoIssue'],
        message: '자동 발행은 매월(MONTHLY) 정책에서만 설정할 수 있습니다.',
      });
      return;
    }
    if (value.issueDay === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['issueDay'], message: '발행일을 입력해 주세요.' });
    }
    if (value.dueDay === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dueDay'], message: '마감일을 입력해 주세요.' });
    }
    if (value.issueDay !== undefined && value.dueDay !== undefined && value.dueDay < value.issueDay) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueDay'],
        message: '마감일은 발행일과 같거나 이후여야 합니다.',
      });
    }
  });
```
(`CreateFeePolicyInput` 추론 타입은 그대로 — `issueDay?: number`, `dueDay?: number`, `autoIssue: boolean` 이 추가된다.)

- [ ] **Step 3: `CreatePolicyDialog` 에 자동발행 UI 추가**

`frontend/apps/web/app/manage/clubs/[clubId]/fees/_components/CreatePolicyDialog.tsx`:
1. `useForm` 구조분해에 `watch` 추가 + `defaultValues` 확장:
```tsx
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateFeePolicyInput>({
    resolver: zodResolver(createFeePolicySchema),
    defaultValues: policy
      ? {
          name: policy.name,
          amount: policy.amount,
          billingType: policy.billingType,
          autoIssue: policy.autoIssue,
          issueDay: policy.issueDay ?? undefined,
          dueDay: policy.dueDay ?? undefined,
        }
      : { name: '', amount: 0, billingType: 'MONTHLY', autoIssue: false, issueDay: undefined, dueDay: undefined },
  });

  // 자동발행은 MONTHLY 정책만. 생성 모드는 선택 중인 유형, 수정 모드는 (잠긴) 기존 유형을 본다.
  const watchedBillingType = watch('billingType');
  const watchedAutoIssue = watch('autoIssue');
  const effectiveBillingType = isEditMode ? policy.billingType : watchedBillingType;
  const showAutoIssue = effectiveBillingType === 'MONTHLY';
```
2. `onSubmit` 을 자동발행 필드 포함으로 교체:
```tsx
  const onSubmit = (formData: CreateFeePolicyInput) => {
    if (isEditMode) {
      const payload: UpdateFeePolicyPayload = {
        name: formData.name.trim(),
        amount: formData.amount,
        autoIssue: formData.autoIssue,
      };
      if (formData.autoIssue) {
        payload.issueDay = formData.issueDay;
        payload.dueDay = formData.dueDay;
      }
      updatePolicy.mutate({ policyId: policy.id, payload }, { onSuccess: onClose });
      return;
    }
    const payload: CreateFeePolicyPayload = {
      name: formData.name.trim(),
      amount: formData.amount,
      billingType: formData.billingType,
      autoIssue: formData.autoIssue,
    };
    if (formData.autoIssue) {
      payload.issueDay = formData.issueDay;
      payload.dueDay = formData.dueDay;
    }
    createPolicy.mutate(payload, { onSuccess: onClose });
  };
```
import 추가: `import type { BillingType, FeePolicy } from '@duing/types';` 줄을 `import type { BillingType, CreateFeePolicyPayload, FeePolicy, UpdateFeePolicyPayload } from '@duing/types';` 로 확장.
3. 회비 유형 `<div>` 블록(159행 닫는 `</div>`) 뒤, `submitErrorMessage` 블록 앞에 자동발행 섹션 추가:
```tsx
          {showAutoIssue && (
            <div className="rounded-md border border-line p-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                <input type="checkbox" {...register('autoIssue')} className="h-4 w-4 accent-ink" />
                매월 자동 발행
              </label>
              <p className="mt-1 text-xs text-charcoal-3">
                매월 발행일이 되면 활성 회원에게 이 정책의 청구를 자동으로 발행합니다.
              </p>
              {watchedAutoIssue && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="policy-issue-day" className="mb-1 block text-xs font-semibold text-charcoal-2">
                      발행일(1~28)
                    </label>
                    <input
                      id="policy-issue-day"
                      type="number"
                      min={1}
                      max={28}
                      placeholder="5"
                      {...register('issueDay')}
                      className={cn(inputCls, errors.issueDay && errorInputCls)}
                    />
                    {errors.issueDay && (
                      <p className="mt-1 text-xs text-coral">{errors.issueDay.message}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="policy-due-day" className="mb-1 block text-xs font-semibold text-charcoal-2">
                      마감일(1~28)
                    </label>
                    <input
                      id="policy-due-day"
                      type="number"
                      min={1}
                      max={28}
                      placeholder="20"
                      {...register('dueDay')}
                      className={cn(inputCls, errors.dueDay && errorInputCls)}
                    />
                    {errors.dueDay && <p className="mt-1 text-xs text-coral">{errors.dueDay.message}</p>}
                  </div>
                </div>
              )}
              {errors.autoIssue && <p className="mt-1 text-xs text-coral">{errors.autoIssue.message}</p>}
            </div>
          )}
```

- [ ] **Step 4: 정책 폼 자동발행 테스트 추가**

`frontend/apps/web/test/manage/create-policy-dialog.test.tsx` — 기존 파일에 케이스 추가(기존 mock 셋업 재사용). 신규 it 두 개:
```tsx
  it('MONTHLY 자동발행을 켜고 발행일·마감일을 입력하면 페이로드에 실려 생성된다', async () => {
    const user = userEvent.setup();
    mockCreateMutate.mockImplementation((_payload: unknown, options: { onSuccess: () => void }) =>
      options.onSuccess(),
    );
    render(<CreatePolicyDialog clubId={1} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/정책 이름/), '월 회비');
    await user.click(screen.getByLabelText('매월 자동 발행'));
    await user.type(screen.getByLabelText('발행일(1~28)'), '5');
    await user.type(screen.getByLabelText('마감일(1~28)'), '20');
    await user.click(screen.getByRole('button', { name: '추가' }));

    await waitFor(() => expect(mockCreateMutate).toHaveBeenCalled());
    expect(mockCreateMutate.mock.calls[0][0]).toMatchObject({
      autoIssue: true,
      issueDay: 5,
      dueDay: 20,
    });
  });

  it('마감일이 발행일보다 앞서면 검증 에러를 보여준다', async () => {
    const user = userEvent.setup();
    render(<CreatePolicyDialog clubId={1} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/정책 이름/), '월 회비');
    await user.click(screen.getByLabelText('매월 자동 발행'));
    await user.type(screen.getByLabelText('발행일(1~28)'), '20');
    await user.type(screen.getByLabelText('마감일(1~28)'), '5');
    await user.click(screen.getByRole('button', { name: '추가' }));

    expect(await screen.findByText('마감일은 발행일과 같거나 이후여야 합니다.')).toBeInTheDocument();
    expect(mockCreateMutate).not.toHaveBeenCalled();
  });
```
> 기존 테스트 파일에 `userEvent`/`waitFor`/`vi` import 가 이미 있으면 재사용. `mockCreateMutate` 명은 기존 파일의 create mutation mock 이름에 맞춘다(파일을 먼저 읽어 확인).

- [ ] **Step 5: 테스트·타입체크 실행 → 통과 확인**

Run: `cd frontend && pnpm -C apps/web test -- create-policy-dialog && pnpm -C apps/web typecheck`
Expected: 테스트 PASS, 타입 에러 0.

- [ ] **Step 6: 커밋**

```bash
git add frontend
git commit -m "feat(frontend): 회비 정책 폼 자동 월발행 설정(토글·발행일·마감일) 추가"
```

---

## 2. 자기 검토 (Self-Review)

**Spec coverage** — 설계서 §4~§17 매핑:
- §4·5 ReceiptResponse(+paymentCount) → Task 1 Step 1. §6 API 2개(경로 정정 /my, /leader) → Task 1 Step 5·6. §7 발급 가드(CANCELLED·납부0 → 404, OVERDUE+부분납부 발급) → Task 1 Step 4. §8 프론트 인쇄 페이지·진입 버튼 → Task 2·3.
- §9 V65 → Task 4 Step 1. §10 생성·수정 공유 검증(validateAutoIssue) → Task 4 Step 5. §11 MonthlyBillIssueJob(today.day>=issue_day, 멱등) → Task 5 Step 5. §12 autoIssueMonthly(권한·과거검증 없음, due=dueDay) → Task 5 Step 3. §13 POST·PATCH 양쪽 → Task 4 Step 4·5. §14 프론트 폼(MONTHLY 한정·superRefine) → Task 6. §15 권한·예외 → Task 1·4 예외. §16 테스트(OVERDUE 발급·CANCELLED 404·생성/수정·멱등·캐치업·과거마감) → Task 1·4·5 테스트. §17 빌드순서 6 PR → Task 1~6.

**Placeholder scan**: 전 step 에 실제 코드/명령/기대결과 포함. `…`(생략)은 기존 파일의 미변경부 표기에만 사용, 신규 코드에는 없음.

**Type consistency**: `ReceiptResponse`(BE record) ↔ `Receipt`(FE type) 필드 1:1(receiptNumber/clubName/memberName/policyName/billingPeriod/billing*Date/dueDate/amount/paidTotal/remaining/paymentCount/status/issuedAt/payments[amount,method,paidAt,memo]). `FeePolicy` 3 필드(autoIssue/issueDay/dueDay)가 entity·query·response·FE type 에서 일관. `autoIssueMonthly(FeePolicy, LocalDate)` 시그니처가 interface·impl·job 호출에서 일치. `findAutoIssueDue(int)` repository·job 일치. 메서드명 `applyAutoIssue`/`validateAutoIssue`/`getMemberReceipt`/`getClubReceipt` 전 task 일관.

**정찰 정정 반영**: 회원 경로 `/my/fees/...`(테스트 URL·client.ts·MyFeeApi 일치), 발급 가드 status≠CANCELLED AND ACTIVE>0(BE·FE 진입조건 `paidAmount>0 && status!=='CANCELLED'` 일치), 멱등 bulkInsertBills 재사용(키 변경 없음), 이중 게이팅 별도 Config.

---

## 3. 실행 핸드오프

Plan 저장 완료. 실행은 **Subagent-Driven**(권장) — Task 1~6 을 fresh subagent 로 순차 구현하고 task 마다 spec + duing-code-reviewer 리뷰(권한/상태전이/동시성/Migration/API contract 영역이므로 adversarial 리뷰 추가), 구현 subagent 는 push/PR 금지. 두 트랙(영수증 Task1~3 / 자동발행 Task4~6)은 독립이므로 사용자 지시에 따라 1 PR 또는 2 PR 로 분리.
