# BANK 자동매칭 — 어드민 계좌 표시 & 운영진 삭제 드리프트 정리 설계

- 작성일: 2026-06-20
- 대상: 백엔드(Spring Boot 3.4 / Java 21, fee 도메인) + 프론트엔드(Next.js 15, 어드민·운영진 화면)
- 배경: 어드민(총동연) `BANK 자동매칭` 화면이 동아리명·등록상태만 보여주고 **어떤 계좌가 등록됐는지** 안 보였다. 또한 운영진 계좌 삭제 경로(`DELETE /leader/clubs/{clubId}/fee-account`)가 `fee_account` soft delete만 하고 외부 BANK 등록·`bank_matching_setting`을 정리하지 않아 **외부 슬롯이 영구 점유되는 상태 드리프트**가 발생할 수 있었다.

## 목표

1. **어드민 화면에 등록 계좌 표시** — 동아리별 `은행 · 예금주 · 마스킹 계좌번호`와 자동매칭 활성 여부를 보여 운영 가시성을 높인다.
2. **운영진 계좌 삭제 시 외부 BANK 등록을 정리** — 삭제는 절대 막지 않으면서, 가능한 경우 외부 등록을 해제하고 내부 설정을 강제 비활성화해 드리프트를 자가 치유한다.
3. **자동매칭 활성 중 계좌 편집 차단** — 외부에 등록된 번호와 DB가 어긋나는 또 다른 드리프트를 사전에 막는다.

## 핵심 설계 원칙

- **삭제 가능 여부 > 외부 시스템 정합성.** BANK 자동매칭은 부가 기능이며, 외부 장애·복호화 실패로 운영진의 계좌 삭제가 막혀선 안 된다.
- **API-first(켜기/끄기).** 자동매칭을 *켤* 때는 기존대로 외부 등록 성공 후에만 DB를 바꾼다(원자성). *삭제*는 예외로, 외부 해제를 best-effort로 시도하되 실패해도 삭제를 진행한다.
- **PII 비노출.** 마스킹은 서버에서 수행해 전체 계좌번호 평문이 어드민 클라이언트로 나가지 않는다. 로그·감사에도 계좌번호·예금주를 절대 싣지 않는다.
- **요청 범위만 수정.** 범용 감사 로그 인프라 신설 등 큰 리팩토링은 하지 않는다.

## Out of Scope

- 영속 감사 로그 테이블(`bank_matching_event`) 신설 — 후속 PR로 분리(아래 "감사 로그" 참조).
- 외부 `POST /v1/accounts/check`(등록 여부 확인) API 도입.
- 어드민 화면에 계좌 **삭제** 버튼 추가 — 계좌 삭제는 운영진 권한으로 유지.
- 활성 중 편집을 막는 프론트 사전 차단(버튼 비활성 등) — 백엔드 409 메시지를 기존 토스트로 노출하는 선에서 처리.
- 드리프트 상태(`active`≠`apiRegistered`)를 어드민 화면에 분리 노출 — 상태 표시는 기존 `registered` 재사용으로 한정.

---

## Part A — 어드민 화면 등록 계좌 마스킹 표시

### A-1. 백엔드 (PR1)

응답에 계좌 식별 정보를 추가한다. 데이터는 이미 `getMatchingClubs()`가 `feeAccountRepository.findAll()`로 로드 중이므로, **응답 DTO에 필드만 추가**하면 된다.

수정 파일:
- `service/dto/query/BankMatchingClubResult.java` — 필드 추가: `Bank bank`, `String accountHolder`, `String maskedAccountNumber`
- `controller/dto/response/BankMatchingClubResponse.java` — 동일 필드 추가 + `from()` 매핑
- `service/GeneralBankMatchingAdminService.java#toClubResult()` — 마스킹 생성 + **행별 graceful degrade**
- `support/AccountNumberMasker.java` (신규) — 마스킹 정책 helper(단위 테스트 가능)

마스킹 정책 (`AccountNumberMasker`):
- 복호화된 계좌번호의 **끝 4자리만 노출**, 앞은 `****`로 가린다 → 예: `****1234`
- 길이가 4 미만이면 전체를 `****`로 가린다(노출 0)

행별 graceful degrade:
- `toClubResult()`에서 계좌번호 복호화를 `try/catch`로 감싼다.
- 복호화 성공 → `maskedAccountNumber = masker.mask(평문)`
- 복호화 실패(키 회전·암호문 손상) → `maskedAccountNumber = null`로 두고 **그 행만** 비운다. 페이지 전체를 422/500으로 떨구지 않는다(슬롯 graceful degrade와 동일 철학). `bank`·`accountHolder`는 복호화가 필요 없으므로 항상 채운다.

`registered` 필드는 그대로 둔다(= `BankMatchingSetting.isUsable()` = `active && apiRegistered`). 프론트의 활성/비활성 표시에 그대로 쓴다.

### A-2. 프론트엔드 (PR2)

수정 파일:
- `packages/types/src/bank.ts` — `BankMatchingClub`에 `bank: Bank`(`fee.ts`의 `Bank` 재사용), `accountHolder: string`, `maskedAccountNumber: string | null` 추가
- `apps/web/app/admin/bank-matching/_components/BankMatchingClubs.tsx` — 행에 계좌 한 줄 + 활성 뱃지 추가

표시:
- `{bankLabel(bank)} · {accountHolder} · {maskedAccountNumber}` (은행 한글 라벨은 기존 `app/_lib/feeLabels.ts`의 `bankLabel` 재사용) → 예: `KB국민은행 · 홍길동 · ****1234`
- `maskedAccountNumber === null`이면 "복호화 실패" 등으로 degrade 표시(행은 유지)
- 활성 뱃지: `registered === true` → "자동매칭 활성", `false` → "자동매칭 비활성"

---

## Part B — 운영진 삭제 드리프트 정리 + 활성 중 편집 차단 (PR3 백엔드 / PR4 프론트)

### B-1. 자동매칭 활성 중 계좌 편집 전체 차단 (백엔드)

정책: **자동매칭이 활성화된 계좌는 수정할 수 없다.** 은행·계좌번호·예금주 **모두** 차단한다. 저장된 번호는 암호문이라 복호화 없이 변경 여부를 판단할 수 없고, 부분 허용은 일관성이 깨지므로 편집 자체를 막는다.

수정 파일:
- `service/GeneralFeeAccountService.java#upsert()` — 변이 전 가드 추가
- `exception/FeeAccountException.java` — 신규 `BankMatchingActiveException`(409)
- `service/GeneralFeeAccountService.java` — `BankMatchingAdminService` 주입(순환 없음: admin 서비스는 fee 서비스에 의존하지 않음)

로직:
```
upsert(command):
  requireManager(...)
  if bankMatchingAdminService.isActiveUsable(command.clubId()):
      throw BankMatchingActiveException   // 활성 = 잠금. 신규 등록은 isActiveUsable=false라 통과
  ... 기존 암호화·저장 로직 ...
```

`BankMatchingActiveException`(HTTP 409):
> 자동매칭이 활성화된 계좌는 수정할 수 없습니다. 자동매칭 해제 후 다시 시도해 주세요.

운영 규칙: 자동매칭 ON → 계좌 잠금 / 자동매칭 OFF → 계좌 수정 가능.

### B-2. 계좌 삭제 never-block + 외부 등록 정리 (백엔드)

정책: **삭제는 외부 연동·복호화 실패로 절대 막지 않는다.** 외부 해제는 best-effort, 내부 설정은 강제 비활성, `fee_account`는 항상 soft delete.

수정 파일:
- `service/BankMatchingAdminService.java` — 인터페이스에 `void unregisterForAccountRemoval(Long clubId)` 추가
- `service/GeneralBankMatchingAdminService.java` — 위 메서드 구현 + `setActive()`의 해제 로직 일부 재사용
- `service/GeneralFeeAccountService.java#delete()` — soft delete 전에 `unregisterForAccountRemoval` 호출

`unregisterForAccountRemoval(clubId)` — never throws(외부/암호 실패를 내부에서 흡수):
```
setting = bankMatchingSettingRepository.findByClubId(clubId)
if setting == null:
    return                                   // 등록 흔적 없음 → 정리할 것 없음
account = feeAccountRepository.findByClubId(clubId)  // 삭제 직전이라 아직 존재
externalCleared = false
try:
    bankCode = bankCodeMapper.toApiCode(account.getBank())
    number   = feeAccountCipher.decrypt(account.getAccountNumber(), clubId)
    bankApiClient.deleteAccount(bankCode, number)    // 멱등 — 반복 호출 안전
    externalCleared = true
catch (RuntimeException failure):
    log.warn("BANK_ACCOUNT_UNREGISTER_FAILED clubId={} errorCode={}", clubId, codeOf(failure))
setting.deactivate()                          // 항상 강제 비활성
if externalCleared:
    log.info("BANK_ACCOUNT_UNREGISTERED clubId={}", clubId)
else:
    log.warn("BANK_ACCOUNT_FORCE_DEACTIVATED clubId={}", clubId)
```

핵심:
- **unregister 시도 기준은 `setting != null`(존재 여부)** 이지 `isActiveUsable`가 아니다. `active=false`인데 외부엔 등록 남은 드리프트까지 정리한다. 외부 `deleteAccount`는 멱등이라 미등록 계좌에 호출해도 안전.
- 외부/복호화 실패는 `catch`로 흡수하므로 트랜잭션이 롤백되지 않고 삭제가 진행된다(`BankApiHttpClient`는 `@Transactional`이 아니라 예외를 잡아도 롤백 마킹이 없다).
- 계좌가 없을 때(방어): 외부 호출 없이 `setting.deactivate()` + `BANK_ACCOUNT_FORCE_DEACTIVATED` 로그만.

`delete()`:
```
delete(clubId, actorId):
  requireManager(actorId, clubId)
  account = loadByClubId(clubId)                       // 없으면 404
  bankMatchingAdminService.unregisterForAccountRemoval(clubId)
  feeAccountRepository.delete(account)                 // @SQLDelete soft delete
```

기존 정책 제거: cascade 복호화 실패를 422로 매핑해 삭제를 막던 안은 폐기한다(삭제는 항상 허용).

### B-3. Tier 1 구조화 로그 (백엔드, 영속 테이블 없음)

범용 감사 로그 인프라가 없으므로 이번 범위에선 **구조화 로그만** 남긴다. 이벤트·필드:

| 이벤트 | 발생 지점 | 레벨 |
|---|---|---|
| `BANK_ACCOUNT_REGISTERED` | `setActive(clubId, true)` 성공 | INFO |
| `BANK_ACCOUNT_UNREGISTERED` | `setActive(clubId, false)` 성공 / 삭제 cascade 외부 해제 성공 | INFO |
| `BANK_ACCOUNT_UNREGISTER_FAILED` | 삭제 cascade 외부 해제 실패 | WARN |
| `BANK_ACCOUNT_FORCE_DEACTIVATED` | 외부 해제 실패 후 강제 비활성 | WARN |

- 로그 필드: `clubId`, `event`, `errorCode`(optional)
- **PII(계좌번호·예금주)는 절대 기록하지 않는다.**
- 이벤트명은 `BankAccountAuditEvent` enum(또는 상수)으로 정의해 오타·표류를 막는다.
- 영속 감사 이력이 필요해지면 후속 PR에서 `bank_matching_event` 테이블을 별도 설계한다.

### B-4. 운영진 삭제 모달 경고 (프론트, PR4)

수정 파일:
- `apps/web/app/manage/clubs/[clubId]/fees/_components/FeeAccountSection.tsx` — `DeleteFeeAccountConfirm`에 활성 시 경고 분기

로직:
- 운영진 화면은 이미 `useClubBankMatchingStatusQuery(clubId).enabled`로 활성 여부를 안다.
- `enabled === true`일 때 모달 본문을 경고 문구로 교체:
> 현재 자동매칭이 활성화된 계좌입니다.
> 계좌를 삭제하면 자동매칭도 함께 해제되며,
> 이후 입금 내역 자동 조회가 중단됩니다.
> 정말 삭제하시겠습니까?
- `enabled !== true`이면 기존 문구 유지.

---

## 데이터 흐름 / 정합성 요약

- **삭제(활성)**: 외부 `deleteAccount` 성공 → `setting.deactivate()` → `fee_account` soft delete. 외부 실패해도 → 로그 + 강제 비활성 + soft delete(삭제는 항상 성공). 외부 멱등이라 잔여 슬롯은 재시도/수동 정리로 회수 가능.
- **삭제(드리프트: active=false·외부 등록 남음)**: `setting != null` 기준으로 외부 해제 시도 → 자가 치유.
- **편집(활성)**: 409로 거부, DB·외부 모두 불변 → 드리프트 0.
- **어드민 조회**: 행별 복호화. 일부 실패해도 그 행만 마스킹 null, 나머지·페이지는 정상.

## 테스트

백엔드(RestAssured + Fixture Monkey, `BankApiClient` stub):
- 어드민 overview 응답에 `bank`·`accountHolder`·`maskedAccountNumber`가 채워진다(마스킹 `****`+끝4 형식 검증).
- 한 계좌의 복호화가 실패해도 그 행만 `maskedAccountNumber=null`이고 페이지는 정상 반환된다(행별 degrade).
- 활성 계좌 편집 시도 시 409가 발생하고 DB가 변경되지 않는다.
- 비활성 계좌는 편집이 정상 동작한다(신규 등록 포함).
- 활성 계좌 삭제 시 외부 `deleteAccount`가 호출되고 설정이 비활성화되며 계좌가 soft delete 된다.
- 외부 `deleteAccount`가 예외를 던져도 삭제가 성공하고 설정이 강제 비활성화된다(never-block).
- 복호화가 실패해도 삭제가 성공하고 설정이 강제 비활성화된다(never-block).
- `setting != null`이면 `active=false`여도 외부 해제를 시도한다(드리프트 정리).
- 미등록(`setting == null`) 계좌 삭제는 외부 호출 없이 soft delete 된다.

프론트:
- 어드민 행이 `은행 · 예금주 · ****끝4`와 `registered` 기반 활성/비활성 뱃지를 렌더한다.
- `maskedAccountNumber=null` 행은 degrade 문구로 표시된다.
- 운영진 삭제 모달이 `enabled=true`일 때 경고 문구를, 아니면 기존 문구를 보여준다.

## PR 분해 (1PR = 1단위)

- **PR1 (backend)**: 어드민 overview 응답에 `bank`/`accountHolder`/`maskedAccountNumber` 추가 + 행별 복호화 degrade + `AccountNumberMasker`.
- **PR2 (frontend·admin)**: 어드민 화면 계좌 마스킹 표시 + `registered` 기반 활성/비활성 뱃지. (PR1 머지 후)
- **PR3 (backend)**: 삭제 never-block cascade(`setting` 존재 기준·강제 비활성) + 활성 중 편집 차단(409) + Tier1 구조화 로그(`setActive` 포함). (A와 독립)
- **PR4 (frontend·leader)**: 삭제 확인 모달 경고 문구(활성 시).
