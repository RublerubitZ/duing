# BANK 자동매칭 — 어드민 계좌 표시 & 삭제 드리프트 정리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 어드민 BANK 자동매칭 화면에 동아리별 등록 계좌(은행·예금주·마스킹 번호)와 자동매칭 상태를 표시하고, 운영진 계좌 삭제가 외부 BANK 등록을 자가 정리하도록 만들며(never-block), 자동매칭 활성 중 계좌 편집을 차단한다.

**Architecture:** 백엔드는 기존 `getMatchingClubs()`가 이미 로드하는 회비 계좌를 응답 DTO에 마스킹해 노출하고(행별 복호화 graceful degrade), 계좌 삭제 시 `bank_matching_setting` 존재를 기준으로 외부 `deleteAccount()`를 best-effort 호출 후 강제 비활성화한다. 외부/복호화 실패는 흡수해 삭제를 막지 않는다. 프론트는 마스킹 정보와 상태 뱃지를 렌더하고, 운영진 삭제 모달에 활성 경고를 추가한다.

**Tech Stack:** Spring Boot 3.4 / Java 21 (DDD, JPA, RestAssured + TestContainers), Next.js 15 / React 19 (pnpm workspaces, Vitest + Testing Library).

**Spec:** `docs/superpowers/specs/2026-06-20-bank-matching-account-display-and-delete-cascade-design.md`

**PR 구성 (각 PR = 브랜치 1개, 모두 `develop` 에서 분기):**
- **PR1 (backend)** — Part 1: 어드민 overview 응답에 `bank`·`accountHolder`·`maskedAccountNumber` 추가
- **PR2 (frontend)** — Part 2: 어드민 화면 계좌 마스킹 표시 + 상태 뱃지 *(PR1 머지 후)*
- **PR3 (backend)** — Part 3: 삭제 never-block cascade + 활성 중 편집 차단 + 구조화 로그 *(독립)*
- **PR4 (frontend)** — Part 4: 운영진 삭제 모달 활성 경고 *(독립)*

> **커밋 규칙:** Conventional Commits(`feat(backend): …` / `feat(frontend): …`), 한국어. `[#이슈]` 형식·Claude 공동저자 라인 금지. **각 task 는 push/PR 생성하지 않는다 — 리뷰 후 사용자 지시로만 PR 을 만든다.**

---

## Part 1 — PR1 (backend): 어드민 overview 응답에 계좌 필드 추가

**File Structure:**
- Create: `backend/src/main/java/com/duing/domain/fee/support/AccountNumberMasker.java` — 계좌번호 마스킹 정책(끝 4자리 노출)
- Create: `backend/src/test/java/com/duing/domain/fee/support/AccountNumberMaskerTest.java` — 마스킹 단위 테스트
- Modify: `backend/src/main/java/com/duing/domain/fee/service/dto/query/BankMatchingClubResult.java` — `bank`·`accountHolder`·`maskedAccountNumber` 추가
- Modify: `backend/src/main/java/com/duing/domain/fee/controller/dto/response/BankMatchingClubResponse.java` — 동일 필드 + `from()`
- Modify: `backend/src/main/java/com/duing/domain/fee/service/GeneralBankMatchingAdminService.java` — `toClubResult()` 복호화·마스킹·행별 degrade
- Modify: `backend/src/test/java/com/duing/domain/fee/AdminBankMatchingControllerTest.java` — 마스킹/예금주/은행 + degrade 검증

### Task 1.0: 브랜치 생성

- [ ] **Step 1: develop 최신화 후 분기**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull --ff-only
git checkout -b feat/bank-matching-admin-account-fields
```

### Task 1.1: AccountNumberMasker (마스킹 정책 단위 TDD)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/fee/support/AccountNumberMasker.java`
- Test: `backend/src/test/java/com/duing/domain/fee/support/AccountNumberMaskerTest.java`

- [ ] **Step 1: 실패하는 단위 테스트 작성**

`backend/src/test/java/com/duing/domain/fee/support/AccountNumberMaskerTest.java`:

```java
package com.duing.domain.fee.support;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class AccountNumberMaskerTest {

    private final AccountNumberMasker masker = new AccountNumberMasker();

    @Test
    @DisplayName("계좌번호에서 숫자만 추출해 끝 4자리만 노출하고 앞은 ****로 가린다")
    void masksAllButLastFourDigits() {
        assertThat(masker.mask("352-1234-5678-90")).isEqualTo("****7890");
        assertThat(masker.mask("1002345678901")).isEqualTo("****8901");
    }

    @Test
    @DisplayName("숫자가 4자리 이하이거나 비어 있으면 전체를 가린다")
    void masksEntirelyWhenTooShortOrBlank() {
        assertThat(masker.mask("123")).isEqualTo("****");
        assertThat(masker.mask("12-34")).isEqualTo("****");
        assertThat(masker.mask("")).isEqualTo("****");
        assertThat(masker.mask(null)).isEqualTo("****");
    }
}
```

- [ ] **Step 2: 컴파일 실패 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.fee.support.AccountNumberMaskerTest"`
Expected: 컴파일 실패 — `AccountNumberMasker` 심볼 없음.

- [ ] **Step 3: AccountNumberMasker 구현**

`backend/src/main/java/com/duing/domain/fee/support/AccountNumberMasker.java`:

```java
package com.duing.domain.fee.support;

import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 계좌번호를 화면 노출용으로 마스킹한다. 어드민 화면은 모든 동아리 계좌를 보므로,
 * 서버에서 끝 4자리만 남기고 앞을 가려(****) 전체 계좌번호 평문이 클라이언트로 나가지 않게 한다.
 */
@Component
public class AccountNumberMasker {

    private static final int VISIBLE_TAIL = 4;
    private static final String MASK_PREFIX = "****";

    /**
     * 계좌번호에서 숫자만 추출해 끝 4자리만 노출한다(예: {@code 352-1234-5678-90 -> ****7890}).
     * 숫자가 4자리 이하이거나 입력이 비어 있으면 전체를 {@code ****} 로 가린다.
     */
    public String mask(String accountNumber) {
        if (!StringUtils.hasText(accountNumber)) {
            return MASK_PREFIX;
        }
        String digitsOnly = accountNumber.replaceAll("\\D", "");
        if (digitsOnly.length() <= VISIBLE_TAIL) {
            return MASK_PREFIX;
        }
        return MASK_PREFIX + digitsOnly.substring(digitsOnly.length() - VISIBLE_TAIL);
    }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.fee.support.AccountNumberMaskerTest"`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/fee/support/AccountNumberMasker.java \
        backend/src/test/java/com/duing/domain/fee/support/AccountNumberMaskerTest.java
git commit -m "feat(backend): 회비 계좌번호 끝 4자리 마스킹 유틸 추가"
```

### Task 1.2: overview 응답에 계좌 필드 노출 + 행별 degrade

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/fee/service/dto/query/BankMatchingClubResult.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/controller/dto/response/BankMatchingClubResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/service/GeneralBankMatchingAdminService.java`
- Test: `backend/src/test/java/com/duing/domain/fee/AdminBankMatchingControllerTest.java`

- [ ] **Step 1: 실패하는 통합 테스트 추가**

`AdminBankMatchingControllerTest.java` 의 `overviewDegradesWhenBankApiDown()` 메서드 **다음에** 아래 두 테스트를 추가한다(클래스 닫는 `}` 직전):

```java
    @Test
    @DisplayName("현황 조회 응답에 동아리별 은행·예금주·마스킹 계좌번호가 채워진다")
    void overviewIncludesMaskedAccountFields() {
        saveClubWithAccount("적격동아리", Bank.NH, "352-1234-5678-90");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/clubs/bank-matching")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.clubs.find { it.clubName == '적격동아리' }.bank", equalTo("NH"))
                .body("data.clubs.find { it.clubName == '적격동아리' }.accountHolder", equalTo("동아리회비"))
                .body("data.clubs.find { it.clubName == '적격동아리' }.maskedAccountNumber", equalTo("****7890"));
    }

    @Test
    @DisplayName("한 계좌의 복호화가 실패해도 그 행만 maskedAccountNumber=null 로 비우고 나머지·페이지는 정상 반환된다")
    void overviewDegradesPerRowOnDecryptFailure() {
        saveClubWithAccount("정상동아리", Bank.NH, "352-1234-5678-90");
        // 유효한 base64 가 아닌 손상된 암호문을 직접 저장해 복호화 실패를 유발한다.
        Club broken = clubRepository.save(ClubFixture.academic("손상동아리"));
        feeAccountRepository.save(FeeAccount.create(broken.getId(), Bank.KB, "not-a-valid-ciphertext", "총무"));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/clubs/bank-matching")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.clubs.size()", equalTo(2))
                .body("data.clubs.find { it.clubName == '정상동아리' }.maskedAccountNumber", equalTo("****7890"))
                .body("data.clubs.find { it.clubName == '손상동아리' }.bank", equalTo("KB"))
                .body("data.clubs.find { it.clubName == '손상동아리' }.accountHolder", equalTo("총무"))
                .body("data.clubs.find { it.clubName == '손상동아리' }.maskedAccountNumber", nullValue());
    }
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.fee.AdminBankMatchingControllerTest"`
Expected: FAIL — 응답에 `bank`/`accountHolder`/`maskedAccountNumber` 가 없어 `null` 이라 assertion 실패.

- [ ] **Step 3: BankMatchingClubResult 에 필드 추가**

`backend/src/main/java/com/duing/domain/fee/service/dto/query/BankMatchingClubResult.java` 전체를 아래로 교체:

```java
package com.duing.domain.fee.service.dto.query;

import com.duing.domain.fee.entity.Bank;

/**
 * ADMIN BANK 자동매칭 관리 화면의 동아리 한 행.
 *
 * <p>{@code eligible} 은 회비 계좌가 등록돼 있고 지원 은행(NH/KB/우리)인지 여부다.
 * 부적격이면 {@code ineligibleReason} 에 사람이 읽을 수 있는 사유를 담고, 적격이면 null 이다.
 * {@code registered} 는 자동매칭 설정이 실제 동작 가능(active && api_registered)한 상태인지다.
 * {@code maskedAccountNumber} 는 끝 4자리만 노출한 마스킹 문자열이며, 복호화 실패 시 null 이다.
 */
public record BankMatchingClubResult(
        Long clubId,
        String clubName,
        Bank bank,
        String accountHolder,
        String maskedAccountNumber,
        boolean eligible,
        String ineligibleReason,
        boolean registered
) {
}
```

- [ ] **Step 4: BankMatchingClubResponse 에 필드 추가**

`backend/src/main/java/com/duing/domain/fee/controller/dto/response/BankMatchingClubResponse.java` 전체를 아래로 교체:

```java
package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.entity.Bank;
import com.duing.domain.fee.service.dto.query.BankMatchingClubResult;

/**
 * ADMIN BANK 자동매칭 관리 화면의 동아리 한 행 응답.
 * {@code eligible} 이 false 면 {@code ineligibleReason} 에 사유가 담기고, true 면 null 이다.
 * {@code maskedAccountNumber} 는 끝 4자리만 노출한 마스킹 문자열이며, 복호화 실패 시 null 이다.
 */
public record BankMatchingClubResponse(
        Long clubId,
        String clubName,
        Bank bank,
        String accountHolder,
        String maskedAccountNumber,
        boolean eligible,
        String ineligibleReason,
        boolean registered
) {

    public static BankMatchingClubResponse from(BankMatchingClubResult result) {
        return new BankMatchingClubResponse(
                result.clubId(),
                result.clubName(),
                result.bank(),
                result.accountHolder(),
                result.maskedAccountNumber(),
                result.eligible(),
                result.ineligibleReason(),
                result.registered());
    }
}
```

- [ ] **Step 5: 서비스에 masker 주입 + toClubResult 복호화·마스킹·degrade**

`GeneralBankMatchingAdminService.java` 수정:

(5a) import 에 `AccountNumberMasker` 추가 — 기존 `import com.duing.domain.fee.support.BankCodeMapper;` 아래에:

```java
import com.duing.domain.fee.support.AccountNumberMasker;
```

(5b) 필드 주입 추가 — 기존 `private final BankCodeMapper bankCodeMapper;` 아래에:

```java
    private final AccountNumberMasker accountNumberMasker;
```

(5c) `toClubResult(...)` 메서드 전체를 아래로 교체:

```java
    private BankMatchingClubResult toClubResult(
            FeeAccount account,
            Map<Long, String> clubNamesById,
            Map<Long, BankMatchingSetting> settingsByClubId
    ) {
        boolean eligible = bankCodeMapper.isEligible(account.getBank());
        String ineligibleReason = eligible ? null : "지원하지 않는 은행입니다(농협·KB국민·우리만 가능).";
        boolean registered = Optional.ofNullable(settingsByClubId.get(account.getClubId()))
                .map(BankMatchingSetting::isUsable)
                .orElse(false);
        // 계좌번호는 복호화해 끝 4자리만 마스킹한다. 한 계좌의 복호화가 실패해도(키 회전·암호문 손상)
        // 그 행만 maskedAccountNumber=null 로 비우고 페이지는 정상 반환한다(graceful degrade).
        String maskedAccountNumber;
        try {
            maskedAccountNumber = accountNumberMasker.mask(
                    feeAccountCipher.decrypt(account.getAccountNumber(), account.getClubId()));
        } catch (RuntimeException decryptFailure) {
            maskedAccountNumber = null;
        }
        return new BankMatchingClubResult(
                account.getClubId(),
                clubNamesById.get(account.getClubId()),
                account.getBank(),
                account.getAccountHolder(),
                maskedAccountNumber,
                eligible,
                ineligibleReason,
                registered);
    }
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.fee.AdminBankMatchingControllerTest"`
Expected: PASS (기존 테스트 + 신규 2건)

- [ ] **Step 7: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/fee/service/dto/query/BankMatchingClubResult.java \
        backend/src/main/java/com/duing/domain/fee/controller/dto/response/BankMatchingClubResponse.java \
        backend/src/main/java/com/duing/domain/fee/service/GeneralBankMatchingAdminService.java \
        backend/src/test/java/com/duing/domain/fee/AdminBankMatchingControllerTest.java
git commit -m "feat(backend): 어드민 BANK 자동매칭 현황에 은행·예금주·마스킹 계좌번호 노출"
```

> **PR1 준비 완료.** 리뷰 후 사용자 지시 시 PR 생성.

---

## Part 2 — PR2 (frontend): 어드민 화면 계좌 마스킹 표시 + 상태 뱃지

> PR1 머지 후 진행한다(실데이터 확인). 컴포넌트 테스트는 mock 데이터라 병렬 개발도 가능.

**File Structure:**
- Modify: `frontend/packages/types/src/bank.ts` — `BankMatchingClub` 타입에 계좌 필드 추가
- Modify: `frontend/apps/web/app/admin/bank-matching/_components/BankMatchingClubs.tsx` — 계좌 줄 + 상태 뱃지 렌더
- Modify: `frontend/apps/web/test/admin/bank-matching/bank-matching-clubs.test.tsx` — fixture + 렌더 검증

### Task 2.0: 브랜치 생성

- [ ] **Step 1: 분기**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull --ff-only
git checkout -b feat/bank-matching-admin-account-display
```

### Task 2.1: 타입 확장 → 실패 테스트 → 컴포넌트 렌더

**Files:**
- Modify: `frontend/packages/types/src/bank.ts`
- Modify: `frontend/apps/web/test/admin/bank-matching/bank-matching-clubs.test.tsx`
- Modify: `frontend/apps/web/app/admin/bank-matching/_components/BankMatchingClubs.tsx`

- [ ] **Step 1: 타입에 계좌 필드 추가**

`frontend/packages/types/src/bank.ts` 최상단 import 추가(파일 첫 줄 주석 아래):

```ts
import type { Bank } from './fee';
```

그리고 `BankMatchingClub` 타입을 아래로 교체:

```ts
// BankMatchingClubResponse 미러. ADMIN BANK 자동매칭 관리 화면의 동아리 한 행.
// eligible=false 면 ineligibleReason 에 사유가 담기고, true 면 null 이다.
// maskedAccountNumber 는 끝 4자리만 노출한 마스킹 문자열이며, 복호화 실패 시 null 이다.
export type BankMatchingClub = {
  clubId: number;
  clubName: string;
  bank: Bank;
  accountHolder: string;
  maskedAccountNumber: string | null;
  eligible: boolean;
  ineligibleReason: string | null;
  registered: boolean;
};
```

- [ ] **Step 2: 테스트 fixture 갱신 + 실패 테스트 추가**

`bank-matching-clubs.test.tsx` 의 `makeClub` 을 아래로 교체(필드 추가):

```tsx
function makeClub(overrides: Partial<BankMatchingClub> = {}): BankMatchingClub {
  return {
    clubId: 1,
    clubName: '두잉 동아리',
    bank: 'NH',
    accountHolder: '홍길동',
    maskedAccountNumber: '****7890',
    eligible: true,
    ineligibleReason: null,
    registered: false,
    ...overrides,
  };
}
```

그리고 `describe('BankMatchingClubs', ...)` 안 마지막 `it(...)` **다음에** 아래 두 테스트를 추가:

```tsx
  it('등록 계좌의 은행 라벨·예금주·마스킹 번호와 자동매칭 활성 뱃지를 렌더링한다', () => {
    mockOverview.mockReturnValue({
      clubs: [
        makeClub({
          clubId: 1,
          clubName: '코딩 동아리',
          bank: 'KB',
          accountHolder: '김두잉',
          maskedAccountNumber: '****1234',
          registered: true,
        }),
      ],
      slots,
    });
    render(<BankMatchingClubs />);

    expect(screen.getByText('KB국민 · 김두잉 · ****1234')).toBeInTheDocument();
    expect(screen.getByText('자동매칭 활성')).toBeInTheDocument();
  });

  it('maskedAccountNumber 가 null 이면 "계좌 확인 불가" 로 표시하고 비활성 뱃지를 노출한다', () => {
    mockOverview.mockReturnValue({
      clubs: [
        makeClub({
          clubId: 2,
          clubName: '재즈 동아리',
          bank: 'NH',
          accountHolder: '총무',
          maskedAccountNumber: null,
          registered: false,
        }),
      ],
      slots,
    });
    render(<BankMatchingClubs />);

    expect(screen.getByText('NH농협 · 총무 · 계좌 확인 불가')).toBeInTheDocument();
    expect(screen.getByText('자동매칭 비활성')).toBeInTheDocument();
  });
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- --run test/admin/bank-matching/bank-matching-clubs.test.tsx`
Expected: FAIL — 컴포넌트가 계좌 줄/활성 뱃지를 아직 렌더하지 않아 신규 2건 실패.

- [ ] **Step 4: 컴포넌트에 계좌 줄 + 상태 뱃지 렌더**

`BankMatchingClubs.tsx` import 에 bankLabel 추가 — 기존 `import { useToast } ...` 아래에:

```tsx
import { bankLabel } from '@/app/_lib/feeLabels';
```

`BankMatchingClubRow` 의 `<div className="min-w-0"> ... </div>` 블록을 아래로 교체:

```tsx
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{club.clubName}</p>
        <p className="mt-0.5 truncate text-xs text-charcoal-2">
          {bankLabel(club.bank)} · {club.accountHolder} · {club.maskedAccountNumber ?? '계좌 확인 불가'}
        </p>
        <p className="mt-0.5 text-xs text-charcoal-3">
          {club.registered ? '자동매칭 활성' : '자동매칭 비활성'}
          {!club.eligible && club.ineligibleReason && (
            <span className="text-charcoal-3"> · {club.ineligibleReason}</span>
          )}
        </p>
      </div>
```

- [ ] **Step 5: 테스트 통과 확인 + 타입체크**

Run: `cd frontend && pnpm --filter @duing/web test -- --run test/admin/bank-matching/bank-matching-clubs.test.tsx`
Expected: PASS

Run: `cd frontend && pnpm -r typecheck`
Expected: 통과(에러 0)

- [ ] **Step 6: 커밋**

```bash
git add frontend/packages/types/src/bank.ts \
        frontend/apps/web/app/admin/bank-matching/_components/BankMatchingClubs.tsx \
        frontend/apps/web/test/admin/bank-matching/bank-matching-clubs.test.tsx
git commit -m "feat(frontend): 어드민 BANK 자동매칭 화면에 마스킹 계좌·상태 뱃지 표시"
```

> **PR2 준비 완료.**

---

## Part 3 — PR3 (backend): 삭제 cascade + 편집 차단 + 구조화 로그

**File Structure:**
- Create: `backend/src/main/java/com/duing/domain/fee/support/BankAccountAuditEvent.java` — 구조화 로그 이벤트 enum
- Modify: `backend/src/main/java/com/duing/domain/fee/exception/FeeAccountException.java` — `BankMatchingActiveException`(409)
- Modify: `backend/src/main/java/com/duing/domain/fee/service/BankMatchingAdminService.java` — `unregisterForAccountRemoval` 선언
- Modify: `backend/src/main/java/com/duing/domain/fee/service/GeneralBankMatchingAdminService.java` — 구현 + setActive 로그
- Modify: `backend/src/main/java/com/duing/domain/fee/service/GeneralFeeAccountService.java` — 편집 가드 + 삭제 cascade
- Create: `backend/src/test/java/com/duing/domain/fee/FeeAccountBankMatchingCascadeTest.java` — 통합 테스트

### Task 3.0: 브랜치 생성

- [ ] **Step 1: 분기**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull --ff-only
git checkout -b feat/fee-account-delete-cascade-guard
```

### Task 3.1: 자동매칭 활성 중 계좌 편집 차단(409)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/fee/exception/FeeAccountException.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/service/GeneralFeeAccountService.java`
- Create: `backend/src/test/java/com/duing/domain/fee/FeeAccountBankMatchingCascadeTest.java`

- [ ] **Step 1: 통합 테스트 클래스 작성(편집 가드 2건 포함)**

`backend/src/test/java/com/duing/domain/fee/FeeAccountBankMatchingCascadeTest.java`:

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
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.global.bank.BankApiClient;
import com.duing.global.bank.dto.AccountSlotStatus;
import com.duing.global.bank.dto.BankTransactionData;
import com.duing.global.bank.dto.TransactionLookupCommand;
import com.duing.global.crypto.FeeAccountCipher;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

@Import({TestcontainersConfiguration.class, FeeAccountBankMatchingCascadeTest.StubBankApiConfig.class})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FeeAccountBankMatchingCascadeTest extends IntegrationTestBase {

    /** 외부 BANK API 대체 stub. deleteAccount 실패를 주입해 never-block 정책을 검증한다. */
    static class StubBankApiClient implements BankApiClient {
        final List<String> calls = new ArrayList<>();
        volatile RuntimeException deleteFailure; // null 이면 성공

        void reset() {
            calls.clear();
            deleteFailure = null;
        }

        @Override
        public void registerAccount(String bankCode, String accountNumber) {
            calls.add("registerAccount");
        }

        @Override
        public void deleteAccount(String bankCode, String accountNumber) {
            calls.add("deleteAccount");
            if (deleteFailure != null) {
                throw deleteFailure;
            }
        }

        @Override
        public AccountSlotStatus getAccountStatus() {
            return new AccountSlotStatus(0, 5, 5);
        }

        @Override
        public List<BankTransactionData> getTransactions(TransactionLookupCommand command) {
            return List.of();
        }
    }

    @TestConfiguration
    static class StubBankApiConfig {
        @Bean
        @Primary
        StubBankApiClient stubBankApiClient() {
            return new StubBankApiClient();
        }
    }

    @LocalServerPort
    int port;

    @Autowired
    UserRepository userRepository;
    @Autowired
    ClubRepository clubRepository;
    @Autowired
    ClubMemberRepository clubMemberRepository;
    @Autowired
    JwtTokenProvider jwtTokenProvider;
    @Autowired
    FeeAccountCipher feeAccountCipher;
    @Autowired
    StubBankApiClient stubBankApiClient;
    @Autowired
    JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String adminToken;
    private String leaderToken;
    private Long clubId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        stubBankApiClient.reset();

        User admin = userRepository.save(adminUser());
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());

        Club club = clubRepository.save(ClubFixture.academic("동아리A"));
        clubId = club.getId();
        User leader = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
    }

    private User adminUser() {
        long seq = sequence.incrementAndGet();
        return User.create("20" + seq, "관리자" + seq, "admin" + seq + "@duing.ac.kr", "h",
                UserRole.ADMIN, Grade.FRESHMAN, College.IT_ENGINEERING, "미설정",
                "010-0000-0000", LocalDateTime.now());
    }

    private void leaderUpsert(String bank, String accountNumber, String accountHolder, int expectedStatus) {
        Map<String, Object> body = new HashMap<>();
        body.put("bank", bank);
        body.put("accountNumber", accountNumber);
        body.put("accountHolder", accountHolder);
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(body)
                .when().put("/api/v1/leader/clubs/" + clubId + "/fee-account")
                .then().statusCode(expectedStatus);
    }

    private void adminSetActive(boolean active) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("active", active))
                .when().put("/api/v1/admin/clubs/" + clubId + "/bank-matching")
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    private void leaderDelete(int expectedStatus) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete("/api/v1/leader/clubs/" + clubId + "/fee-account")
                .then().statusCode(expectedStatus);
    }

    private Boolean readSettingActive() {
        List<Boolean> rows = jdbcTemplate.queryForList(
                "SELECT active FROM bank_matching_setting WHERE club_id = ? AND deleted_at IS NULL",
                Boolean.class, clubId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private boolean feeAccountExists() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM fee_account WHERE club_id = ? AND deleted_at IS NULL",
                Integer.class, clubId);
        return count != null && count > 0;
    }

    private String storedAccountNumber() {
        return jdbcTemplate.queryForObject(
                "SELECT account_number FROM fee_account WHERE club_id = ? AND deleted_at IS NULL",
                String.class, clubId);
    }

    @Test
    @DisplayName("자동매칭 활성 계좌를 운영진이 수정하려 하면 409 를 반환하고 저장된 계좌번호가 변경되지 않는다")
    void editActiveAccountConflict() {
        leaderUpsert("NH", "352-1234-5678-90", "총무", HttpStatus.OK.value());
        adminSetActive(true);

        leaderUpsert("NH", "999-888-777", "총무", HttpStatus.CONFLICT.value());

        assertThat(feeAccountCipher.decrypt(storedAccountNumber(), clubId)).isEqualTo("352-1234-5678-90");
    }

    @Test
    @DisplayName("자동매칭 비활성 계좌는 운영진이 정상적으로 수정할 수 있다")
    void editInactiveAccountAllowed() {
        leaderUpsert("NH", "352-1234-5678-90", "총무", HttpStatus.OK.value());

        leaderUpsert("KB", "111-222-333", "새총무", HttpStatus.OK.value());

        assertThat(feeAccountCipher.decrypt(storedAccountNumber(), clubId)).isEqualTo("111-222-333");
    }
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.fee.FeeAccountBankMatchingCascadeTest"`
Expected: FAIL — `editActiveAccountConflict` 가 200 을 받아(가드 없음) 409 기대와 불일치.

- [ ] **Step 3: BankMatchingActiveException 추가**

`FeeAccountException.java` 의 `AccountDecryptionFailedException` 클래스 **다음에**(부모 클래스 닫는 `}` 직전) 추가:

```java
    /**
     * 자동매칭이 사용 가능한(active && api_registered, 지원 은행) 계좌를 수정·재등록하려 한 경우.
     * 외부 BANK 에 등록된 번호와 DB 가 어긋나는 드리프트를 막기 위해 잠근다 — 변경하려면 자동매칭을 먼저 해제해야 한다.
     */
    public static class BankMatchingActiveException extends FeeAccountException {
        private static final String MESSAGE =
                "자동매칭이 활성화된 계좌는 수정할 수 없습니다. 자동매칭 해제 후 다시 시도해 주세요.";

        public BankMatchingActiveException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }
```

- [ ] **Step 4: upsert 에 편집 가드 추가**

`GeneralFeeAccountService.java` 수정:

(4a) **import 불필요** — `BankMatchingAdminService` 는 `GeneralFeeAccountService` 와 같은 패키지(`com.duing.domain.fee.service`)이므로 import 를 추가하지 않는다. `FeeAccountException` 도 이미 import 되어 있어(`FeeAccountNotFoundException` 사용) `BankMatchingActiveException` 을 바로 쓸 수 있다.

(4b) 필드 주입 추가 — 기존 `private final FeeAccountCipher feeAccountCipher;` 아래에:

```java
    private final BankMatchingAdminService bankMatchingAdminService;
```

(4c) `upsert(...)` 메서드에서 `requireManager(...)` 호출 **다음 줄에** 가드 추가:

```java
        clubAuthService.requireManager(command.actorId(), command.clubId());
        // 자동매칭이 사용 가능한(계좌 존재 + 사용 가능 설정 + 지원 은행) 동안에는 계좌를 잠근다 —
        // 외부에 등록된 번호와 DB 가 어긋나는 드리프트를 막는다. 변경하려면 자동매칭을 먼저 해제해야 한다.
        // 계좌가 없는 최초 등록은 isActiveUsable=false 라 정상 통과한다.
        if (bankMatchingAdminService.isActiveUsable(command.clubId())) {
            throw new FeeAccountException.BankMatchingActiveException();
        }
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.fee.FeeAccountBankMatchingCascadeTest"`
Expected: PASS (편집 가드 2건)

- [ ] **Step 6: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/fee/exception/FeeAccountException.java \
        backend/src/main/java/com/duing/domain/fee/service/GeneralFeeAccountService.java \
        backend/src/test/java/com/duing/domain/fee/FeeAccountBankMatchingCascadeTest.java
git commit -m "feat(backend): 자동매칭 활성 회비 계좌 수정 차단(409)"
```

### Task 3.2: 삭제 never-block cascade + 구조화 로그

**Files:**
- Create: `backend/src/main/java/com/duing/domain/fee/support/BankAccountAuditEvent.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/service/BankMatchingAdminService.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/service/GeneralBankMatchingAdminService.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/service/GeneralFeeAccountService.java`
- Test: `backend/src/test/java/com/duing/domain/fee/FeeAccountBankMatchingCascadeTest.java`

- [ ] **Step 1: 삭제 cascade 테스트 3건 추가**

`FeeAccountBankMatchingCascadeTest.java` 의 `editInactiveAccountAllowed()` **다음에**(클래스 닫는 `}` 직전) 추가:

```java
    @Test
    @DisplayName("자동매칭 활성 계좌를 운영진이 삭제하면 외부 deleteAccount 가 호출되고 설정이 비활성화되며 계좌가 soft delete 된다")
    void deleteActiveAccountCascades() {
        leaderUpsert("NH", "352-1234-5678-90", "총무", HttpStatus.OK.value());
        adminSetActive(true);
        assertThat(readSettingActive()).isTrue();
        stubBankApiClient.calls.clear();

        leaderDelete(HttpStatus.NO_CONTENT.value());

        assertThat(stubBankApiClient.calls).contains("deleteAccount");
        assertThat(readSettingActive()).isFalse();
        assertThat(feeAccountExists()).isFalse();
    }

    @Test
    @DisplayName("외부 deleteAccount 가 실패해도 계좌 삭제는 성공하고 설정이 강제 비활성화된다(never-block)")
    void deleteNeverBlockedByExternalFailure() {
        leaderUpsert("NH", "352-1234-5678-90", "총무", HttpStatus.OK.value());
        adminSetActive(true);
        stubBankApiClient.deleteFailure = new RuntimeException("BANK API down");
        stubBankApiClient.calls.clear();

        leaderDelete(HttpStatus.NO_CONTENT.value());

        assertThat(stubBankApiClient.calls).contains("deleteAccount");
        assertThat(readSettingActive()).isFalse();
        assertThat(feeAccountExists()).isFalse();
    }

    @Test
    @DisplayName("자동매칭 설정이 없는 계좌 삭제는 외부 호출 없이 soft delete 된다")
    void deleteWithoutSettingSkipsExternal() {
        leaderUpsert("NH", "352-1234-5678-90", "총무", HttpStatus.OK.value());
        stubBankApiClient.calls.clear();

        leaderDelete(HttpStatus.NO_CONTENT.value());

        assertThat(stubBankApiClient.calls).doesNotContain("deleteAccount");
        assertThat(feeAccountExists()).isFalse();
    }
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.fee.FeeAccountBankMatchingCascadeTest"`
Expected: FAIL — `deleteActiveAccountCascades` 가 deleteAccount 미호출/설정 active 잔존으로 실패.

- [ ] **Step 3: 구조화 로그 이벤트 enum 생성**

`backend/src/main/java/com/duing/domain/fee/support/BankAccountAuditEvent.java`:

```java
package com.duing.domain.fee.support;

/**
 * BANK 자동매칭 계좌 등록·해제 관련 구조화 로그 이벤트명. 장애 추적·운영 분석에 쓴다.
 * PII(계좌번호·예금주)는 이 이벤트와 함께 절대 기록하지 않는다(clubId·event·errorCode 만).
 */
public enum BankAccountAuditEvent {
    BANK_ACCOUNT_REGISTERED,
    BANK_ACCOUNT_UNREGISTERED,
    BANK_ACCOUNT_UNREGISTER_FAILED,
    BANK_ACCOUNT_FORCE_DEACTIVATED,
}
```

- [ ] **Step 4: 인터페이스에 unregisterForAccountRemoval 선언**

`BankMatchingAdminService.java` 의 `requireActiveUsable(Long clubId);` **다음에**(인터페이스 닫는 `}` 직전) 추가:

```java

    /**
     * 회비 계좌 삭제에 앞서 외부 BANK 등록을 정리한다. {@code bank_matching_setting} 행이 존재하면
     * 외부 해제를 best-effort 로 시도하고(실패해도 흡수), 설정을 강제 비활성화한다.
     *
     * <p>외부/복호화 실패로 <b>절대 예외를 던지지 않는다</b> — 계좌 삭제가 외부 장애로 막혀선 안 되기 때문이다.
     * 트리거 기준은 설정의 active 여부가 아니라 행 <em>존재</em> 여부다(active=false·외부 등록 잔존 드리프트까지 정리).
     */
    void unregisterForAccountRemoval(Long clubId);
```

- [ ] **Step 5: 구현체 — @Slf4j + 메서드 구현 + setActive 로그**

`GeneralBankMatchingAdminService.java` 수정:

(5a) import 추가 — 기존 `import com.duing.domain.fee.support.BankCodeMapper;` 아래에:

```java
import com.duing.domain.fee.support.BankAccountAuditEvent;
```

그리고 클래스 상단 lombok import 영역에:

```java
import lombok.extern.slf4j.Slf4j;
```

(5b) 클래스 선언 어노테이션에 `@Slf4j` 추가 — 기존:

```java
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralBankMatchingAdminService implements BankMatchingAdminService {
```

를 아래로 교체:

```java
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralBankMatchingAdminService implements BankMatchingAdminService {
```

(5c) `setActive(...)` 의 `if (active) { ... } else { ... }` 블록을 아래로 교체(로그 추가):

```java
        if (active) {
            bankApiClient.registerAccount(bankCode, accountNumber);     // ① 외부 등록(실패 시 예외 → 아래 DB 반영 안 됨)
            setting.activate();                                         // ② 성공 시에만 DB
            log.info("bankAccountAudit event={} clubId={}",
                    BankAccountAuditEvent.BANK_ACCOUNT_REGISTERED, clubId);
        } else {
            bankApiClient.deleteAccount(bankCode, accountNumber);       // ① 외부 해제
            setting.deactivate();                                      // ②
            log.info("bankAccountAudit event={} clubId={}",
                    BankAccountAuditEvent.BANK_ACCOUNT_UNREGISTERED, clubId);
        }
```

(5d) `getMatchingClubs()` 메서드 **다음에**(또는 `setActive` 다음, 클래스 내 적절한 위치) `unregisterForAccountRemoval` 구현 추가:

```java
    @Override
    @Transactional
    public void unregisterForAccountRemoval(Long clubId) {
        BankMatchingSetting setting = bankMatchingSettingRepository.findByClubId(clubId).orElse(null);
        if (setting == null) {
            return; // 자동매칭 설정 흔적이 없으면 외부에 정리할 등록도 없다.
        }
        // 외부 해제는 best-effort — 복호화 실패·BANK API 장애를 흡수하고 계좌 삭제를 막지 않는다.
        FeeAccount account = feeAccountRepository.findByClubId(clubId).orElse(null);
        boolean externalCleared = false;
        if (account != null) {
            try {
                String bankCode = bankCodeMapper.toApiCode(account.getBank());
                String accountNumber = feeAccountCipher.decrypt(account.getAccountNumber(), clubId);
                bankApiClient.deleteAccount(bankCode, accountNumber); // 멱등 — 미등록 계좌에도 안전
                externalCleared = true;
            } catch (RuntimeException externalFailure) {
                log.warn("bankAccountAudit event={} clubId={} errorCode={}",
                        BankAccountAuditEvent.BANK_ACCOUNT_UNREGISTER_FAILED, clubId,
                        externalFailure.getClass().getSimpleName());
            }
        } else {
            log.warn("bankAccountAudit event={} clubId={} errorCode={}",
                    BankAccountAuditEvent.BANK_ACCOUNT_UNREGISTER_FAILED, clubId, "ACCOUNT_MISSING");
        }
        setting.deactivate();
        bankMatchingSettingRepository.save(setting); // 비활성 영속을 코드에 명시(dirty checking 의존 X)
        if (externalCleared) {
            log.info("bankAccountAudit event={} clubId={}",
                    BankAccountAuditEvent.BANK_ACCOUNT_UNREGISTERED, clubId);
        } else {
            log.warn("bankAccountAudit event={} clubId={}",
                    BankAccountAuditEvent.BANK_ACCOUNT_FORCE_DEACTIVATED, clubId);
        }
    }
```

- [ ] **Step 6: 삭제 cascade — GeneralFeeAccountService.delete()**

`GeneralFeeAccountService.java` 의 `delete(...)` 메서드 전체를 아래로 교체:

```java
    @Override
    @Transactional
    public void delete(Long clubId, Long actorId) {
        clubAuthService.requireManager(actorId, clubId);
        FeeAccount account = loadByClubId(clubId);
        // 삭제는 외부/암호 실패로 막지 않는다. 외부 BANK 등록은 best-effort 로 정리하고 설정을 강제 비활성화한다.
        // (soft delete 전에 호출해야 account 암호문이 살아 있어 외부 해제에 쓸 수 있다.)
        bankMatchingAdminService.unregisterForAccountRemoval(clubId);
        feeAccountRepository.delete(account); // @SQLDelete soft delete
    }
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.fee.FeeAccountBankMatchingCascadeTest"`
Expected: PASS (편집 가드 2건 + 삭제 cascade 3건)

- [ ] **Step 8: 회귀 확인 — 기존 fee/BANK 테스트**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.fee.*"`
Expected: PASS (기존 `AdminBankMatchingControllerTest`·`FeeAccountControllerTest` 등 영향 없음)

- [ ] **Step 9: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/fee/support/BankAccountAuditEvent.java \
        backend/src/main/java/com/duing/domain/fee/service/BankMatchingAdminService.java \
        backend/src/main/java/com/duing/domain/fee/service/GeneralBankMatchingAdminService.java \
        backend/src/main/java/com/duing/domain/fee/service/GeneralFeeAccountService.java \
        backend/src/test/java/com/duing/domain/fee/FeeAccountBankMatchingCascadeTest.java
git commit -m "feat(backend): 회비 계좌 삭제 시 외부 BANK 등록 정리(never-block) + 구조화 로그"
```

> **PR3 준비 완료.**

---

## Part 4 — PR4 (frontend): 운영진 삭제 모달 활성 경고

**File Structure:**
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/fees/_components/FeeAccountSection.tsx` — 활성 여부 조회 + 모달 경고 분기
- Modify: `frontend/apps/web/test/manage/fee-account-section.test.tsx` — 훅 mock 보강 + 경고 노출 검증

### Task 4.0: 브랜치 생성

- [ ] **Step 1: 분기**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull --ff-only
git checkout -b feat/fee-account-delete-modal-warning
```

### Task 4.1: 활성 시 삭제 모달 경고 문구

**Files:**
- Modify: `frontend/apps/web/test/manage/fee-account-section.test.tsx`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/fees/_components/FeeAccountSection.tsx`

- [ ] **Step 1: 테스트 훅 mock 보강 + 경고 테스트 추가**

`fee-account-section.test.tsx` 의 `vi.mock('@duing/hooks', ...)` 블록을 아래로 교체(`useClubBankMatchingStatusQuery` 추가):

```tsx
const mockUseClubFeeAccountQuery = vi.fn();
const mockUpsertMutate = vi.fn();
const mockDeleteMutate = vi.fn();
const mockUseClubBankMatchingStatusQuery = vi.fn();
vi.mock('@duing/hooks', () => ({
  useClubFeeAccountQuery: (clubId: number) => mockUseClubFeeAccountQuery(clubId),
  useUpsertFeeAccountMutation: () => ({ mutate: mockUpsertMutate, isPending: false, error: null }),
  useDeleteFeeAccountMutation: () => ({ mutate: mockDeleteMutate, isPending: false, error: null }),
  useClubBankMatchingStatusQuery: (clubId: number) => mockUseClubBankMatchingStatusQuery(clubId),
}));
```

그리고 `beforeEach` 를 아래로 교체(기본 비활성 반환 설정):

```tsx
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseClubBankMatchingStatusQuery.mockReturnValue({ data: { enabled: false } });
  });
```

마지막 `it(...)` **다음에**(describe 닫기 직전) 아래 두 테스트 추가:

```tsx
  it('자동매칭이 활성(enabled=true)이면 삭제 모달에 자동매칭 해제 경고를 노출한다', async () => {
    const user = userEvent.setup();
    mockUseClubFeeAccountQuery.mockReturnValue({ data: registeredAccount, isLoading: false, error: null });
    mockUseClubBankMatchingStatusQuery.mockReturnValue({ data: { enabled: true } });
    render(<FeeAccountSection clubId={1} />);

    await user.click(screen.getByRole('button', { name: '삭제' }));
    const dialog = await screen.findByRole('alertdialog', { name: '회비 계좌 삭제 확인' });

    expect(
      within(dialog).getByText(/자동매칭도 함께 해제되며/),
    ).toBeInTheDocument();
  });

  it('자동매칭이 비활성(enabled=false)이면 삭제 모달에 기본 안내만 노출한다', async () => {
    const user = userEvent.setup();
    mockUseClubFeeAccountQuery.mockReturnValue({ data: registeredAccount, isLoading: false, error: null });
    mockUseClubBankMatchingStatusQuery.mockReturnValue({ data: { enabled: false } });
    render(<FeeAccountSection clubId={1} />);

    await user.click(screen.getByRole('button', { name: '삭제' }));
    const dialog = await screen.findByRole('alertdialog', { name: '회비 계좌 삭제 확인' });

    expect(within(dialog).queryByText(/자동매칭도 함께 해제되며/)).not.toBeInTheDocument();
    expect(
      within(dialog).getByText(/동아리원이 더 이상 입금 계좌를 확인할 수 없습니다/),
    ).toBeInTheDocument();
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- --run test/manage/fee-account-section.test.tsx`
Expected: FAIL — 모달에 경고 문구가 없어 활성 케이스 실패(그리고 컴포넌트가 아직 `useClubBankMatchingStatusQuery` 를 호출하지 않음).

- [ ] **Step 3: FeeAccountSection — 활성 조회 + 모달에 전달**

`FeeAccountSection.tsx` 수정:

(3a) hooks import 에 `useClubBankMatchingStatusQuery` 추가 — 기존:

```tsx
import {
  useClubFeeAccountQuery,
  useDeleteFeeAccountMutation,
  useUpsertFeeAccountMutation,
} from '@duing/hooks';
```

를 아래로 교체:

```tsx
import {
  useClubBankMatchingStatusQuery,
  useClubFeeAccountQuery,
  useDeleteFeeAccountMutation,
  useUpsertFeeAccountMutation,
} from '@duing/hooks';
```

(3b) `FeeAccountSection` 함수 본문 상단(기존 `const { data: account, ... } = useClubFeeAccountQuery(clubId);` 아래)에 활성 여부 조회 추가:

```tsx
  // 자동매칭 사용 가능 여부 — 삭제 모달에서 "삭제 시 자동매칭도 해제됨" 경고 노출 판단에 쓴다.
  const { data: matchingStatus } = useClubBankMatchingStatusQuery(clubId);
  const bankMatchingActive = matchingStatus?.enabled === true;
```

(3c) 모달 렌더 부분에 prop 전달 — 기존:

```tsx
      {isDeleteOpen && account && (
        <DeleteFeeAccountConfirm
          clubId={clubId}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => reset({ bank: BANKS[0], accountNumber: '', accountHolder: '' })}
        />
      )}
```

를 아래로 교체:

```tsx
      {isDeleteOpen && account && (
        <DeleteFeeAccountConfirm
          clubId={clubId}
          bankMatchingActive={bankMatchingActive}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => reset({ bank: BANKS[0], accountNumber: '', accountHolder: '' })}
        />
      )}
```

- [ ] **Step 4: DeleteFeeAccountConfirm — props 타입 + 경고 분기**

`FeeAccountSection.tsx` 의 `DeleteFeeAccountConfirmProps` 타입을 아래로 교체:

```tsx
type DeleteFeeAccountConfirmProps = {
  clubId: number;
  bankMatchingActive: boolean;
  onClose: () => void;
  onDeleted: () => void;
};
```

`DeleteFeeAccountConfirm` 함수 시그니처를 아래로 교체:

```tsx
function DeleteFeeAccountConfirm({
  clubId,
  bankMatchingActive,
  onClose,
  onDeleted,
}: DeleteFeeAccountConfirmProps) {
```

그리고 모달 본문 안내 `<p>` (기존):

```tsx
        <p className="mt-2 text-sm text-charcoal-2">
          등록된 회비 계좌를 삭제할까요? 동아리원이 더 이상 입금 계좌를 확인할 수 없습니다.
        </p>
```

를 아래로 교체(활성 시 경고):

```tsx
        {bankMatchingActive ? (
          <p className="mt-2 text-sm text-coral">
            현재 자동매칭이 활성화된 계좌입니다. 계좌를 삭제하면 자동매칭도 함께 해제되며, 이후 입금 내역
            자동 조회가 중단됩니다. 정말 삭제하시겠습니까?
          </p>
        ) : (
          <p className="mt-2 text-sm text-charcoal-2">
            등록된 회비 계좌를 삭제할까요? 동아리원이 더 이상 입금 계좌를 확인할 수 없습니다.
          </p>
        )}
```

- [ ] **Step 5: 테스트 통과 확인 + 타입체크**

Run: `cd frontend && pnpm --filter @duing/web test -- --run test/manage/fee-account-section.test.tsx`
Expected: PASS (기존 + 신규 2건)

Run: `cd frontend && pnpm --filter @duing/web typecheck`
Expected: 통과(에러 0)

- [ ] **Step 6: 커밋**

```bash
git add frontend/apps/web/app/manage/clubs/[clubId]/fees/_components/FeeAccountSection.tsx \
        frontend/apps/web/test/manage/fee-account-section.test.tsx
git commit -m "feat(frontend): 자동매칭 활성 회비 계좌 삭제 모달에 해제 경고 노출"
```

> **PR4 준비 완료.**

---

## 전체 검증 (PR별 push/PR 생성 전)

각 Part 완료 후, 해당 영역 전체 검증을 돌린다:

- **백엔드(PR1·PR3):** `cd backend && ./gradlew test` — 전체 통과(Docker 실행 필요: TestContainers)
- **프론트(PR2·PR4):** `cd frontend && pnpm -r typecheck && pnpm -r test -- --run` — typecheck·테스트 전체 통과

> **PR 생성은 리뷰 후 사용자 지시로만 한다(자동 생성·자동 머지 금지).** 의존: PR2 는 PR1 머지 후, PR4·PR3 는 상호/타 PR 과 독립.
