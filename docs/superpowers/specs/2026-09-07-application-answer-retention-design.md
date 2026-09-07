# 지원서 자유서술 답변 보관·파기 — PiiRetentionJob 확장 + 안내 문구 + 처리방침 (확정 스펙)

develop `b717d625` 기준. 2026-09-07 조사(스크래치 `inv-backend.md`·`inv-frontend.md`)와 사용자 결정 5건을 전제로, 본문은 그 범위 안에서 구현 결정을 확정한다.

## 0. 확정 원칙 (변경 불가 전제)

1. **모집글(recruitment) 자체를 삭제하지 않는다.**
2. **application row 자체를 삭제하지 않는다.** 지원 상태·지원일·처리일 등 운영 메타데이터는 유지한다.
3. **retention 대상은 지원서의 자유서술형(TEXT) 답변**이다. 선택형 답변(choiceId) 등 비개인정보 데이터는 유지한다.
4. **두 개의 보관기간을 각각의 목적에 맞게 적용한다.** 회원 탈퇴 → 45일(기존 `duing.privacy.retention.window`, 처리방침 3조와 일치) / 모집 마감 → 6개월(신설 `application-answer-window`).
5. **파기는 멱등적으로 동작한다.** 한 번 파기된 행은 재실행해도 다시 변경되지 않는다.
6. **과거 데이터에도 동일한 cutoff 계산을 적용한다.** 별도 백필 마이그레이션 없이 잡의 첫 실행이 과거 건을 처리한다.
7. **end_date 가 지난 OPEN 모집을 실제 모집 상태(CLOSED)로 자동 변경하지 않는다.** 마감 기준은 지원서 retention cutoff 계산에만 쓴다.
8. **기존 감사 로그·지원 상태 이력은 유지한다.** (조사 결과 답변 본문이 복제되는 경로는 없다 — §1)
9. **전화번호·학번 정규식 탐지·차단·마스킹은 하지 않는다.** 안내 문구 + 사후 파기 조합으로 처리한다.
10. **모집 공고 본문은 이번 retention 대상이 아니다.**

### 0.1 사용자 결정 5건 (2026-09-07)

| # | 결정 | 내용 |
|---|---|---|
| 1 | 마감일 앵커 | `LEAST(recruitment.closed_at::date, recruitment.end_date)`. NULL 은 무시, 둘 다 NULL 이면 건너뜀. 수동 `close()` 뿐 아니라 end_date 가 지난 만료-OPEN 모집, V101 이전 `closed_at IS NULL` CLOSED 행도 end_date 로 동일 처리 |
| 2 | 파기 표시 | `application.answers_purged_at` nullable 컬럼(V126) 추가. 파기된 TEXT 값은 총동연 문의 파기 전례와 같은 `(보관기간 경과로 파기되었습니다)` 로 치환. 무응답(`[""]`·`[]`)은 변경하지 않음. `answers_purged_at IS NOT NULL` 이면 재UPDATE 없음 |
| 3 | 타임존 드리프트 | 기존 잡의 system regime cutoff 를 `TimeMapper.systemNow(clock)` 으로 정정(prod 9시간 조기 발화 수정). 기존 semantics 가 유지됨을 테스트로 고정 |
| 4 | `application_draft` | 미제출 초안도 같은 두 앵커 중 먼저 도래하는 기준으로 행 삭제. 기존 PiiRetentionJob 에서 처리, 제출/명시 삭제 흐름 불변 |
| 5 | Out of Scope | `application_evaluation.memo` 는 별도 정책 대상. 처리방침 13조 공지 수단은 운영 결정 |

## 1. 현 상태 (조사 결과 요약)

| 항목 | 위치 | 현 동작 |
|---|---|---|
| 파기 잡 | `global/privacy/PiiRetentionJob` | 매일 04:30 Asia/Seoul, 단일 `@Transactional`, 벌크 UPDATE/DELETE 4개 순차. prod `enabled=true`, `window=P45D` |
| 지원서 scrub | `ApplicationRepository.scrubExpiredApplicationAnswers` | `UPDATE application SET answers='[]' WHERE deleted_at < :cutoff AND answers <> '[]'` — **soft-delete 된 지원서만** |
| 지원서 soft-delete 경로 | `GeneralApplicationService.withdraw`(지원 취소) **1곳뿐** | 운영진 삭제 없음. 모집 삭제는 CLOSED+지원자 0명 전제라 지원자 있는 모집은 삭제 불가 |
| 탈퇴 | `GeneralUserService.withdraw` | 지원서 미접촉(주석으로 파기 잡에 위임). `anonymizeExpiredUsers` 는 users 컬럼만 → **탈퇴자 답변 영구 보존(갭)** |
| 마감 판정 | `RecruitmentStatus {OPEN, CLOSED}`, `Recruitment.close(closedAt)` | CLOSED 전이 6경로 전부 `closed_at`(seoul 벽시계) 스탬프. **자동 마감 스케줄러 없음** → end_date 지난 OPEN("만료-OPEN") 정상 존재. V101 이전 CLOSED 는 `closed_at NULL`. 상시모집은 `end_date NULL` |
| answers 구조 | `application.answers jsonb` = `[{"questionId": uuid\|null, "values": [..]}]` | 유형 정보 없음. `recruitment_form.questions` jsonb 원소 `{"id","type",...}` 와 questionId 로 조인해야 TEXT 판별 가능. `questionId:null` 은 V78 잉여 답변 |
| 읽기 경로 | `RecruitmentQuestion.formatAnswerValues` → 상세 DTO 4종 | TEXT 는 `values[0]`, 빈 값은 `""`. FE 3화면(운영진 `—`, 총동연 `미작성`, 지원자 공란)은 문자열을 그대로 출력 |
| 열람 권한 | `LeaderApplicationController`·`ApplicationController`·`AdminApplicationController` | 운영진(`requireManager`)·본인·ADMIN 모두 **기간 제한 없음**. `ClosedRecruitmentPolicy` 는 쓰기에만 적용 |
| 초안 | `application_draft`(V15) `answers jsonb`, soft-delete 없음 | 삭제는 제출 시 `discard` 와 사용자 명시 DELETE 뿐. 마감 후 upsert 는 410 이지만 기존 행 잔존 → **영구 보존(갭)** |
| 복제 경로 | 상태이력(enum)·`ClubAuditEvent.reason`·`AdminUserActionLog.reason`(운영자 사유)·알림·로그·Sentry(`send-default-pii=false`)·export | **답변 본문 복제 없음(Blocking 없음)** |
| 타임존 | `TIMEZONE.md`, `TimeMapper.systemNow` | `users.deleted_at`·`application.deleted_at`·`phone_verification_events.created_at`·`phone_verifications.expires_at` = system regime(prod UTC). 기존 잡은 `LocalDateTime.now(clock)`(KST) 로 cutoff → **9시간 조기 발화(금지 패턴)** |
| 처리방침 | `frontend/apps/web/app/terms/page.tsx` 단일 위치 | 3조 보유기간 목록에 탈퇴 45일·법령 보관 2항목뿐. 지원서 답변 보관기간 조항 없음. `EFFECTIVE_DATE` 한 상수가 시행일 3곳 동기 |
| 안내 문구 | `RecruitmentForm`·`ApplyAnswersStep` | 개인정보 관련 안내 없음 |

## 2. 데이터 모델 — `V126__application_answers_purged_at.sql`

```sql
-- 지원서 자유서술 답변 파기 마커(스펙 §3). NULL = 미파기, NOT NULL = 파기 잡이 처리한 시각(DB NOW(), users.anonymized_at 과 같은 regime).
ALTER TABLE application ADD COLUMN answers_purged_at TIMESTAMP;
COMMENT ON COLUMN application.answers_purged_at IS '자유서술 답변 파기 시각(PiiRetentionJob). NULL 이면 미파기. 멱등 가드 겸 파기 기록';
```

- expand-only(nullable, DEFAULT 없음, 제약 없음) → `MigrationExpandContractGuardTest` 통과. 롤백(구 이미지)에도 안전.
- **엔티티에 매핑하지 않는다.** 잡은 native SQL 로만 읽고 쓰며, API 응답에 노출하지 않는다(`ddl-auto: validate` 는 매핑되지 않은 추가 컬럼을 허용). 화면 배지 등이 필요해지면 그때 매핑한다(YAGNI). 매핑하지 않으므로 `Application` 의 전 컬럼 UPDATE 가 이 컬럼을 건드리지 않는다.
- 인덱스 없음. 잡은 하루 1회 전량 스캔이고 `application` 규모상 불필요.
- V125 는 다른 워크트리(`V125__uploaded_object_released_at.sql`)가 사용 중이라 **V126** 으로 번호를 확정한다.

## 3. 파기 규칙 — `PiiRetentionJob` 확장

새 잡·새 Config·새 테이블 없음. 기존 `run()` 의 단일 `@Transactional` 안에 UPDATE 1개·DELETE 1개를 추가하고, cutoff 계산을 정정한다.

### 3.1 cutoff 계산 (타임존 regime 정합)

| cutoff | 계산 | 비교 대상 컬럼(regime) |
|---|---|---|
| `withdrawnCutoff` | `TimeMapper.systemNow(clock).minus(window)` | `users.deleted_at`, `application.deleted_at`, `phone_verification_events.created_at` (system) |
| `phoneVerificationCutoff` | `TimeMapper.systemNow(clock).minus(PHONE_VERIFICATION_RETENTION)` | `phone_verifications.expires_at` (system — `PhoneVerification.issue(..., LocalDateTime.now())`) |
| `closedCutoffDate` | `LocalDate.now(clock).minus(applicationAnswerWindow)` | `recruitment.closed_at::date`(seoul 벽시계 → KST 날짜), `recruitment.end_date`(KST DATE) |

- 유일한 Clock 빈은 `seoulClock`(Asia/Seoul). 기존 코드의 `LocalDateTime.now(clock)` 두 곳을 `TimeMapper.systemNow(clock)` 으로 바꾼다. 이 정정으로 prod(JVM=UTC)에서 45일 규칙과 MO 세션 1일 유예가 9시간 이르게 발화하던 문제가 사라진다. KST JVM(로컬·CI)에서는 두 값이 같으므로 기존 통합 테스트 결과는 그대로다.
- `closedCutoffDate` 는 KST "오늘" 기준. `LocalDate.minus(Period.ofMonths(6))` 는 3/31 → 9/30 처럼 월말을 보정한다. 비교는 `<` 배타 — 앵커가 3/7 이면 9/8 04:30 KST 실행부터 파기.
- 오설정 가드: `window` 또는 `applicationAnswerWindow` 가 0/음수면 기존과 같이 `log.error` 후 **run 전체를 건너뛴다**(부분 실행 없음).

### 3.2 지원서 답변 파기 — `ApplicationRepository.purgeExpiredTextAnswers`

```java
/**
 * 마감 6개월 또는 탈퇴 45일이 지난 지원서의 자유서술(TEXT) 답변을 placeholder 로 치환한다(스펙 §3.2).
 * 유형은 answers 원소에 없어 recruitment_form.questions 와 questionId 로 조인한다 — 매칭되지 않거나
 * questionId 가 null 인 답변은 자유서술 가능성이 있어 TEXT 로 간주한다. 선택형(choiceId)은 유지한다.
 * 이미 파기된 행(answers_purged_at IS NOT NULL)과 soft-delete 행(기존 45일 규칙이 전체를 비움)은 제외한다.
 */
@Modifying(clearAutomatically = true)
@Query(value = """
        UPDATE application a
           SET answers = (
                 SELECT COALESCE(jsonb_agg(
                            CASE WHEN COALESCE(question.qtype, 'TEXT') = 'TEXT'
                                  AND jsonb_array_length(answer.elem -> 'values') > 0
                                  AND (answer.elem -> 'values' ->> 0) <> ''
                                 THEN jsonb_set(answer.elem, '{values}', jsonb_build_array(CAST(:placeholder AS text)))
                                 ELSE answer.elem END
                            ORDER BY answer.ord), '[]'::jsonb)
                   FROM jsonb_array_elements(a.answers) WITH ORDINALITY AS answer(elem, ord)
                   LEFT JOIN LATERAL (
                        SELECT question_element ->> 'type' AS qtype
                          FROM recruitment_form form, jsonb_array_elements(form.questions) question_element
                         WHERE form.recruitment_id = a.recruitment_id
                           AND question_element ->> 'id' = answer.elem ->> 'questionId'
                         LIMIT 1) question ON TRUE),
               answers_purged_at = NOW(),
               version = version + 1
          FROM recruitment r, users u
         WHERE r.id = a.recruitment_id AND u.id = a.user_id
           AND a.answers_purged_at IS NULL
           AND a.deleted_at IS NULL
           AND (LEAST(r.closed_at::date, r.end_date) < :closedCutoffDate
                OR u.deleted_at < :withdrawnCutoff)
        """, nativeQuery = true)
int purgeExpiredTextAnswers(@Param("closedCutoffDate") LocalDate closedCutoffDate,
                            @Param("withdrawnCutoff") LocalDateTime withdrawnCutoff,
                            @Param("placeholder") String placeholder);
```

규칙 요약:

| 상황 | 결과 |
|---|---|
| TEXT 답변, 내용 있음 | `values = ["(보관기간 경과로 파기되었습니다)"]` |
| TEXT 답변, `[""]` 또는 `[]`(무응답) | 그대로 |
| SINGLE/MULTIPLE_CHOICE 답변 | 그대로(choiceId 유지) |
| questionId 가 폼에 없음 · `questionId:null` | TEXT 로 간주(내용 있으면 치환) |
| 앵커 둘 다 NULL(상시모집 + `closed_at NULL`) 이고 사용자 미탈퇴 | `LEAST` = NULL → 조건 false → 건너뜀(fail-safe) |
| `answers_purged_at IS NOT NULL` | 재UPDATE 없음(멱등) |
| `application.deleted_at IS NOT NULL` | 제외 — 기존 `scrubExpiredApplicationAnswers`(45일 후 `[]`)가 담당 |
| TEXT 답변이 하나도 없는 지원서 | answers 불변, `answers_purged_at` 만 기록(보관 정책이 적용됐음을 표시, 이후 재스캔 제외) |

- placeholder 는 `PiiRetentionJob` 의 상수 `ANSWER_PURGED_PLACEHOLDER = "(보관기간 경과로 파기되었습니다)"`(`FederationInquiryPurgeJob.PLACEHOLDER_CONTENT` 와 같은 문자열, 도메인이 달라 상수는 각자 소유). 바인드 파라미터로 전달한다.
- `version = version + 1`: `Application` 은 `@Version` 이 있고 `@DynamicUpdate` 가 없어 전 컬럼 UPDATE 를 한다. 04:30 에 마감 후 최종 확정 트랜잭션이 겹치면 파기 전 answers 로 되돌릴 수 있으므로 version 을 올려 상대 flush 가 `ObjectOptimisticLockingFailureException`(409) 으로 실패하게 한다 — 안전 방향(운영진은 새로고침 후 재시도).
- 모집의 soft-delete 여부는 조건에 넣지 않는다(지원자가 있는 모집은 삭제 불가). `recruitment_form.deleted_at` 도 보지 않는다(질문 정의 조회 목적).
- 로컬 Postgres 16 픽스처 9행으로 검증한 문장을 그대로 채택했다(스크래치 `inv-scrub-check.sql`; `[]` 대신 placeholder·무응답 제외 조건만 추가).

### 3.3 초안 삭제 — `ApplicationDraftRepository.deleteExpired`

```java
/** 마감 6개월 또는 탈퇴 45일이 지난 미제출 초안을 물리 삭제한다(스펙 §3.3). 초안은 감사 가치가 없고 soft-delete 컬럼도 없다. */
@Modifying(clearAutomatically = true)
@Query(value = """
        DELETE FROM application_draft draft
         USING recruitment r, users u
         WHERE r.id = draft.recruitment_id AND u.id = draft.user_id
           AND (LEAST(r.closed_at::date, r.end_date) < :closedCutoffDate
                OR u.deleted_at < :withdrawnCutoff)
        """, nativeQuery = true)
int deleteExpired(@Param("closedCutoffDate") LocalDate closedCutoffDate,
                  @Param("withdrawnCutoff") LocalDateTime withdrawnCutoff);
```

- 제출된 지원서(`application`)와 미제출 초안(`application_draft`)은 **테이블로 구분**된다. 제출 시 `GeneralApplicationService.submit` 이 같은 트랜잭션에서 `discard` 하므로 정상 흐름에서 둘은 공존하지 않고, 이 DELETE 는 `application` 을 전혀 건드리지 않는다.
- 기존 `deleteByUserIdAndRecruitmentId`(제출·명시 삭제)·`deleteAllByRecruitmentId` 는 변경하지 않는다.
- 삭제는 행 단위 물리 삭제라 자연히 멱등이다.

### 3.4 실행 순서·로그

```
1. anonymizeExpiredUsers(withdrawnCutoff)                         (기존)
2. scrubExpiredApplicationAnswers(withdrawnCutoff)                (기존 — soft-delete 지원서 전체 [] )
3. purgeExpiredTextAnswers(closedCutoffDate, withdrawnCutoff, ph) (신설)
4. deleteExpired drafts(closedCutoffDate, withdrawnCutoff)        (신설)
5. deleteExpiredVerifications(phoneVerificationCutoff)            (기존)
6. deleteExpiredEvents(withdrawnCutoff)                           (기존)
```

- 2 와 3 은 `deleted_at` 조건이 상호 배타라 순서 무관. 단일 트랜잭션 유지(기존 패턴; 외부 호출 없음).
- 로그 한 줄에 `applicationAnswersPurged={}`, `applicationDraftsDeleted={}`, `closedCutoffDate={}` 를 추가한다. **건수와 cutoff 만** 기록하고 답변 내용·사용자 식별자는 남기지 않는다.

### 3.5 백필·첫 실행

- 잡에 건수 상한이 없으므로 배포 다음 04:30 KST 실행이 과거 전량을 1회에 처리한다. 별도 데이터 마이그레이션은 만들지 않는다(비가역 변경을 Flyway 로 하면 되돌릴 수 없다).
- 04:15 KST 일일 DB 백업이 잡 직전에 있어 복구 안전망이 된다.
- 릴리스 런북(§9)에서 prod 건수를 먼저 확인한다.

## 4. 설정 — `duing.privacy.retention`

```java
@Validated
@ConfigurationProperties(prefix = "duing.privacy.retention")
public record RetentionProperties(boolean enabled,
                                  @NotNull Period window,
                                  @NotNull Period applicationAnswerWindow) {
}
```

| 파일 | 변경 |
|---|---|
| `application.yml` | `application-answer-window: ${DUING_PII_APPLICATION_ANSWER_WINDOW:P6M}` (주석: 모집 마감 후 지원서 자유서술 답변·미제출 초안 보관기간, 처리방침 3조와 일치) |
| `application-prod.yml` | 변경 없음 — `enabled` 만 오버라이드 중이고 window 는 base 기본값을 쓴다(기존 관례) |
| `src/test/resources/application.yml` | `application-answer-window: P6M` |

- `PrivacyRetentionConfig`(바인딩)·`PiiRetentionJobConfig`(스케줄링) 변경 없음.
- `RetentionProperties` 생성자 인자가 늘어나므로 `PiiRetentionJobTest` 의 수동 생성 2곳을 갱신한다. `PiiRetentionJob` 은 `ApplicationDraftRepository` 를 **마지막 `private final` 필드**로 추가한다(`@RequiredArgsConstructor` 인자 순서 보존).

## 5. 프론트엔드 — 안내 문구 2곳

보안 장치가 아니라 **수집 최소화 예방책**이다. 새 컴포넌트 없이 기존 힌트 클래스를 재사용하고, PC 기하는 한 줄 추가 외에 바꾸지 않는다.

### 5.1 질문 빌더(운영진) — `manage/clubs/[clubId]/recruitments/_components/RecruitmentForm.tsx`

`지원 질문 *` 라벨 `<p>` 와 `<QuestionBuilder>` 사이에 섹션 단위 한 줄:

```tsx
<p className={cn(fieldLabelClass, 'mb-1')}>
  지원 질문 <span className="text-coral">*</span>
  <span className="ml-1 font-normal text-charcoal-3">(최소 1개)</span>
</p>
<p className="mb-3 text-xs text-charcoal-3">
  학번·전화번호 등 개인정보는 지원자 프로필에서 확인할 수 있으니 질문으로 요청하지 않는 것을 권장합니다.
</p>
<QuestionBuilder … />
```

- 라벨의 `mb-3` 을 `mb-1` 로 옮겨 라벨→힌트→빌더 간격을 유지한다. 클래스는 `QuestionBuilder` 의 선택지 힌트(`text-xs text-charcoal-3`) 전례.
- 기존 `test/manage/recruitment-form.test.tsx` 는 `주관식`·`선택지를 2개 이상…` 만 단언하므로 충돌 없음. 문구 존재 단언 1개를 추가한다.

### 5.2 지원 폼(지원자) — `apply/[recruitmentId]/_components/ApplyAnswersStep.tsx`

주관식 질문이 하나라도 있을 때만, 루트 `<div className="space-y-7">` 의 첫 자식으로:

```tsx
{questions.some((question) => question.type === 'TEXT') && (
  <p className="text-sm text-charcoal-3">학번·전화번호 등 개인정보는 꼭 필요한 경우에만 입력해주세요.</p>
)}
```

- 클래스는 같은 파일의 "별도 질문이 없습니다" 안내(`text-sm text-charcoal-3`) 전례.
- `test/apply/apply-page.test.tsx` 의 "모집 안내 섹션이 form 첫 텍스트 노드보다 앞선다" 단언은 힌트가 form 안 첫 노드가 되어도 참이다(안내 섹션은 form 밖). 주관식 있음/없음 두 케이스 단언을 추가한다.

## 6. 개인정보 처리방침 — `apps/web/app/terms/page.tsx`

3조 `List` items 의 법령 보관 항목 뒤에 한 항목 추가. 문체는 기존 "운영팀은 … 합니다" 경어체.

```tsx
// 모집 마감 후 지원서 자유서술 답변 파기 잡(PiiRetentionJob application-answer-window)의 실제 보관기간과 일치시킨다.
const APPLICATION_ANSWER_RETENTION_PERIOD = '모집 종료 후 6개월';
…
`모집 지원서의 자유서술형 답변은 해당 ${APPLICATION_ANSWER_RETENTION_PERIOD}간 보관한 뒤 파기합니다. 지원 상태·지원일 등 운영에 필요한 최소 정보는 지원 내역으로 계속 보관합니다.`,
```

- 탈퇴 45일 조항은 "개인정보를 파기" 로 이미 포괄하며, 이번 구현으로 실제 동작(탈퇴자 지원서 답변·초안 파기)이 그 문장과 일치하게 된다. 문안 변경 없음.
- `EFFECTIVE_DATE` 는 이 변경이 prod 에 배포되는 **정기 릴리스일**로 갱신한다. 구현 시점에는 다음 정기 릴리스 예정일을 넣고, 릴리스일이 달라지면 릴리스 PR 에서 맞춘다(시행일·부칙·13조 3곳이 이 상수 하나로 동기).
- 13조가 약속한 "변경 시 서비스 화면 공지" 의 수단(공지사항/배너)은 **운영 결정 사항**으로 남긴다(§10).

## 7. API 계약

변경 없음. `answers` 문자열에 placeholder 가 들어갈 뿐 DTO 구조·필드·상태코드는 그대로다. `answers_purged_at` 은 노출하지 않는다.

## 8. 테스트

### 8.1 백엔드 통합 — `PiiRetentionJobTest` 확장 (Testcontainers Postgres 16, `IntegrationTestBase`, 상대 날짜만)

픽스처: `Recruitment.create(...)` + `recruitment.attachForm(RecruitmentForm.create(recruitment, [TEXT q1, SINGLE q2, MULTIPLE q3]))` 저장 후 JdbcTemplate 로 `closed_at`/`end_date`/`status`/`deleted_at` 을 직접 조정(`softDeleteDaysAgo` 전례). 지원서는 `Application.submit(recruitment, user, answers)`.

| DisplayName(요구사항 문장) | 기대 |
|---|---|
| 탈퇴 후 보관기간(45일) 미만인 회원의 지원서 답변은 유지된다 | answers 불변, `answers_purged_at IS NULL` |
| 탈퇴 후 보관기간이 지난 회원의 지원서는 TEXT 답변만 placeholder 로 치환되고 선택형 답변은 유지된다 | q1 = placeholder, q2·q3 choiceId 그대로, 마커 NOT NULL, version+1 |
| 마감(closed_at) 후 6개월 미만인 모집의 지원서 답변은 유지된다 | 불변 |
| 마감(closed_at) 후 6개월이 지난 모집의 지원서는 TEXT 답변이 파기된다 | placeholder |
| end_date 가 지난 뒤 6개월이 넘은 OPEN 모집(만료-OPEN)의 지원서도 파기되며 모집 상태는 OPEN 그대로다 | placeholder, `recruitment.status = 'OPEN'` 유지 |
| closed_at 이 없는(V101 이전) CLOSED 모집은 end_date 기준으로 파기된다 | placeholder |
| 상시모집이면서 closed_at 이 없는 CLOSED 모집은 앵커가 없어 건너뛴다 | 불변 |
| 아직 마감되지 않은(end_date 미래) OPEN 모집의 지원서는 파기하지 않는다 | 불변 |
| 폼에 없는 questionId·questionId 가 null 인 답변은 TEXT 로 간주해 파기한다 | placeholder |
| 무응답(`[""]`)·빈(`[]`) TEXT 답변과 이미 `[]` 인 지원서는 내용이 바뀌지 않고 마커만 기록된다 | answers 동일, 마커 NOT NULL |
| 한 번 파기된 지원서는 재실행해도 다시 갱신되지 않는다(멱등) | 2회 실행 후 `answers_purged_at`·`version` 동일 |
| 여러 모집·여러 지원서가 섞여 있어도 각 행이 자기 조건으로만 판정된다 | 조사 픽스처(9행)와 같은 혼합 케이스를 한 테스트에서 행별 단언 |
| soft-delete 된 지원서는 기존 45일 규칙대로 answers 전체가 `[]` 가 된다(기존 동작 유지) | 기존 테스트 `scrubsExpiredApplicationAnswers` 그대로 통과 |
| 마감 6개월이 지난 모집의 미제출 초안은 삭제된다 | `application_draft` 행 0 |
| 탈퇴 후 45일이 지난 회원의 미제출 초안은 삭제된다 | 행 0 |
| 최근 마감·활성 회원의 초안은 유지된다 | 행 1 |
| 초안 삭제는 제출된 지원서 행을 건드리지 않는다 | 같은 (user, recruitment) 의 `application` 행 유지 |
| 기존 케이스 전부 | 탈퇴 45일 미만/경과 비식별화·MO 세션·이벤트 테스트 변경 없이 통과 |

### 8.2 백엔드 단위 — `PiiRetentionJobCutoffTest` (Mockito, 컨텍스트 없음)

타임존 드리프트는 JVM 기본 존이 KST 가 아닐 때만 드러나므로, 테스트가 `TimeZone.setDefault(UTC)` 를 `try/finally` 로 잠시 바꾼 뒤(테스트 JVM 은 순차 실행, 종료 시 복원) 고정 Clock(`Clock.fixed(instant, Asia/Seoul)`) 으로 잡을 실행하고 리포지토리 mock 에 전달된 인자를 캡처한다.

| DisplayName | 기대 |
|---|---|
| 탈퇴 45일 cutoff 는 JVM 기본 존이 UTC 여도 KST 벽시계가 아니라 저장 존(UTC) 벽시계로 계산된다 | `anonymizeExpiredUsers` 인자 == `LocalDateTime.ofInstant(instant, UTC).minus(P45D)` (KST 로 계산하면 9시간 차이) |
| MO 세션 1일 유예 cutoff 도 저장 존 벽시계로 계산된다 | `deleteExpiredVerifications` 인자 == `ofInstant(instant, UTC).minus(1d)` |
| 마감 6개월 cutoff 날짜는 KST "오늘" 기준이다 | instant = `2026-09-07T20:00:00Z`(KST 9/8 05:00) → `closedCutoffDate == 2026-03-08` (UTC 날짜 9/7 이 아님) |
| 두 보관기간 중 하나라도 0/음수면 어떤 리포지토리도 호출하지 않는다 | `verifyNoInteractions` |

### 8.3 배선 — `PrivacyRetentionSchedulingWiringTest`

변경 없음(플래그별 스케줄러 배선만 검증). 새 프로퍼티는 `@Validated @NotNull` 이라 test yml 누락 시 컨텍스트 기동 실패로 드러난다.

### 8.4 프론트엔드 (vitest + typecheck + lint)

- `test/manage/recruitment-form.test.tsx`: 안내 문구 존재 단언 1개.
- `test/apply/apply-page.test.tsx`: 주관식 포함 픽스처에서 문구 노출, 선택형만 있는 픽스처에서 미노출.
- `terms` 페이지는 테스트 없음(기존 관례).

## 9. 릴리스 런북 (컨트롤러·운영)

1. 배포 전 prod DB 에서 첫 실행 규모 확인(읽기 전용):
   ```sql
   SELECT count(*) FILTER (WHERE LEAST(r.closed_at::date, r.end_date) < CURRENT_DATE - INTERVAL '6 months') AS by_close,
          count(*) FILTER (WHERE u.deleted_at < NOW() - INTERVAL '45 days') AS by_withdrawal,
          count(*) FILTER (WHERE r.closed_at IS NULL AND r.end_date IS NULL AND r.status = 'CLOSED') AS no_anchor
     FROM application a JOIN recruitment r ON r.id = a.recruitment_id JOIN users u ON u.id = a.user_id
    WHERE a.deleted_at IS NULL;
   ```
   `no_anchor` 가 0 이 아니면 해당 모집 목록을 별도 이슈로 기록한다(이번 범위에서 백필하지 않음).
2. 배포 → V126 적용 확인 → 다음 04:30 KST 실행 로그에서 `applicationAnswersPurged`·`applicationDraftsDeleted` 건수가 1단계 추정과 맞는지 확인.
3. 이후 매일 건수가 소량(신규 도래분)으로 떨어지는지 1주일 관찰.
4. 처리방침 개정 공지(13조) — 운영 결정 후 별도 진행.

## 10. Out of Scope (이번 스펙에서 다루지 않는 것)

- **`application_evaluation.memo`**(평가자가 지원자에 대해 쓰는 자유서술): 데이터 주체·목적이 달라 별도 retention 정책이 필요하다. 이번 작업에서 건드리지 않는다.
- 처리방침 13조에 따른 **개정 공지 수단**(공지사항·배너): 운영 결정 사항.
- **모집 공고 본문**의 연락처: 공개 게시물이며 회장 연락처 공개 여부 설정(`contactVisibility`)이 별도로 있다. 작성 UI 에서 "본문 대신 공개 연락처 설정을 쓰라" 는 안내는 **별도 개선 제안**으로만 남긴다.
- 전화번호·학번 정규식 탐지·차단·마스킹.
- application row 삭제, 모집 삭제, 모집 상태 자동 CLOSED 전이, 자동 마감 스케줄러.
- FE "파기됨" 배지·`answers_purged_at` API 노출·엔티티 매핑.
- `answers_purged_at` 이 없는 앵커 NULL(상시모집 + V101 이전 CLOSED) 행의 `closed_at` 백필.
- `application_draft` soft-delete 컬럼 도입(물리 삭제로 충분).
- 잡의 회당 처리 상한·dry-run 플래그(날짜 조건은 결정적이고 04:15 백업이 안전망).
- 타임존 2단계(timestamptz 통일·엔티티 Instant 전환) — 이번엔 cutoff 계산만 정정.
- 무응답 표기가 화면마다 다른 문제(`—`/`미작성`/공란)의 통일.

## 11. 리스크 / 체크 포인트

- **동시 최종 확정과 version 충돌**: 04:30 에 운영진이 마감 모집의 최종 결과를 확정하는 순간과 겹치면 409. 발생 확률 극히 낮고 재시도로 해결. 반대로 version 을 올리지 않으면 파기가 조용히 되돌아가므로 올리는 쪽이 옳다.
- **end_date 연장으로 앵커가 미래로 이동**: 이미 파기된 지원서는 복구되지 않는다(허용). 마커가 있어 재파기도 없다.
- **폼 질문 유형 변경**: TEXT 판정은 파기 시점의 `recruitment_form.questions` 를 본다. 제출 후 유형이 바뀐 질문은 현재 유형으로 판정된다(질문 편집은 모집 OPEN 중에만 가능하고, 마감 6개월 뒤엔 사실상 고정).
- **placeholder 가 지원자 본인 화면에도 노출**: 의도된 동작(내 답변이 보관기간 경과로 파기됐음을 알림). 총동연 문의 파기와 같은 문구라 일관된다.
- **첫 실행 규모**: 과거 전량을 한 트랜잭션에서 처리한다. `application`·`application_draft` 규모상 문제 없으나 §9-1 로 건수를 먼저 본다.
- **KST JVM 에서는 드리프트 정정이 무동작**: 로컬·CI 통합 테스트로는 9시간 차이를 재현할 수 없어 §8.2 단위 테스트가 유일한 회귀 방어선이다.
- **`ddl-auto: validate`**: 매핑되지 않은 컬럼 추가는 통과한다. 추후 매핑 시 `LocalDateTime` 로 매핑하고 regime 은 system(DB NOW()) 으로 기록한다.
