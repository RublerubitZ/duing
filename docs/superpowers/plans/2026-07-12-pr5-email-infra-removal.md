# PR5: email 물리 삭제 + 메일 인프라 제거 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MO 인증 전환(스펙 §16 PR5)의 마지막 조각 — users.email 컬럼·email_verifications 테이블 물리 drop, 고아가 된 메일 발송 인프라(Resend+Brevo 체인) 전체 제거, FE 생성 타입(schema.d.ts) 재생성.

**Architecture:** 런타임 소비처 0 확인됨(EmailSender 참조는 주석 2곳뿐). V81 마이그레이션으로 DB 정리 → 인프라·설정·의존성 삭제 → 백엔드 기동 후 `gen:api`로 FE 생성 타입 갱신. `management.health.mail.enabled=false`는 **보존**(배포 롤백 루프 전례 — 스타터 제거 후엔 무해, 주석만 갱신).

**Tech Stack:** Flyway(V81), Spring Boot 3.4, openapi-typescript(`pnpm gen:api`).

## Global Constraints

- 커밋: 한글 Conventional Commits, Co-Authored-By/🤖 금지. 구현자 push·PR 금지.
- Flyway 기존 파일 수정 금지 — V81 신규만.
- `management.health.mail.enabled=false` **삭제 금지**(application.yml:63~ 블록) — 주석만 "스타터 제거 후 무해한 잔존 설정(구 이미지 롤백 안전)" 취지로 갱신.
- 스펙 §"메일 인프라 (PR5)" 원문이 삭제 목록의 SoT: `global/email/*`·`MailProviderConfig`·`ResendClientConfig`·`spring.mail`/`email.*`/`resend.*`/`brevo.*` 설정·`spring-boot-starter-mail` 의존성·메일 테스트 4종. env `RESEND_API_KEY`·`BREVO_*`·`EMAIL_PROVIDER`·`EMAIL_VERIFICATION_SECRET` 정리(.env.example — 실 .env·서버 env는 PR 본문 안내).
- BE 테스트는 Docker(Testcontainers) 필요. 시각은 `LocalDateTime.now(clock)`.

---

### Task 1: [BE] V81 마이그레이션 + email 잔재 SQL 제거

**Files:**
- Create: `backend/src/main/resources/db/migration/V81__drop_users_email_and_email_verifications.sql`
- Modify: `anonymizeExpiredUsers` native SQL이 있는 파일(`rg -n "email = NULL|email=NULL" backend/src/main/java`로 특정 — PII 파기 잡)
- Modify: `backend/src/test/java/com/duing/common/IntegrationTestBase.java:72` (TRUNCATE 목록에서 `email_verifications` 제거)

**Interfaces:**
- Produces: users 테이블에서 email 컬럼·uk_users_email_active 인덱스 소멸, email_verifications 테이블 소멸. 이후 태스크는 email 스키마가 없다고 가정.

- [ ] **Step 1: V81 작성**

```sql
-- PR5: 학번+MO 인증 전환 완료로 email 은 어디서도 읽거나 쓰지 않는다 (V80 에서 nullable 전환·인증행 TRUNCATE).
-- 안정화 기간을 거쳤으므로 컬럼·테이블을 물리 삭제한다 (spec §9.2·§16 PR5).
DROP INDEX IF EXISTS uk_users_email_active;
ALTER TABLE users DROP COLUMN IF EXISTS email;

DROP TABLE IF EXISTS email_verifications;
```
(email_verifications에 딸린 인덱스·시퀀스는 DROP TABLE로 함께 제거된다. V18의 uk_users_email_active만 명시 drop.)

- [ ] **Step 2: 코드에서 email 스키마 참조 제거**

- PII 파기 잡의 native SQL에서 `email = NULL`(또는 유사) 라인 제거 — 컬럼이 사라지면 해당 SQL이 런타임 에러가 나므로 필수.
- `IntegrationTestBase` TRUNCATE 목록에서 `"email_verifications, " +` 라인 제거.
- `rg -n "users.email|email_verifications" backend/src` 로 잔재 0 확인(마이그레이션 히스토리 V1/V18/V80과 주석 서술은 예외 — 기존 파일 수정 금지).

- [ ] **Step 3: 테스트**

Run: `cd backend && ./gradlew test`
Expected: BUILD SUCCESSFUL — Flyway가 V81까지 적용된 컨테이너에서 전체 그린(특히 PII 파기 잡 테스트·IntegrationTestBase 기반 전체).

- [ ] **Step 4: 커밋**

```bash
git add -A && git commit -m "chore(backend): users.email 컬럼·email_verifications 테이블 물리 삭제(V81)"
```

### Task 2: [BE] 메일 인프라·설정·의존성 제거

**Files:**
- Delete: `backend/src/main/java/com/duing/global/email/` 전체(11파일: BrevoProperties·EmailException·FallbackEmailSender·MailProviderException·BrevoMailProvider·LoggingEmailSender·MailProvider·ResendMailProvider·ResendProperties·EmailMessage·EmailSender)
- Delete: `backend/src/main/java/com/duing/global/config/MailProviderConfig.java`, `ResendClientConfig.java`
- Delete: `backend/src/test/java/com/duing/global/email/` 4테스트 + `backend/src/test/java/com/duing/common/StubEmailSender.java`
- Modify: `backend/build.gradle.kts:55-56` (starter-mail 의존성+주석 제거; resend SDK 의존성이 있으면 함께)
- Modify: `backend/src/main/resources/application.yml` (spring.mail 블록·email.*·resend.*·brevo.* 제거 — **management.health.mail.enabled=false 블록은 보존, 주석 갱신**)
- Modify: `backend/src/main/resources/application-prod.yml` (email 발송 체인 블록 제거), `application-local.yml` 해당 시
- Modify: `backend/.env.example` (RESEND_API_KEY·RESEND_FROM·BREVO_SMTP_LOGIN·BREVO_SMTP_KEY·EMAIL_PROVIDER·EMAIL_VERIFICATION_SECRET + 관련 한글 발신자명 경고 주석 제거)
- Modify: `backend/src/main/java/com/duing/global/bank/BankApiHttpClient.java:31` (Javadoc의 `{@link ...ResendMailProvider}` 참조 리워드 — 삭제 클래스 링크 잔존 금지)
- Modify: `backend/src/main/java/com/duing/global/mo/OctomoMoVerificationClient.java:68` (주석의 "FallbackEmailSender 의 PII 배제 정책과 동일" 리워드)
- Modify: stale "PR4" 주석 3곳 현행화(이미 출시됨): `PhoneVerificationEventType`(번호변경·재설정은 PR4에서 기록 → "번호변경·재설정 포함"), `UpdateProfileRequest`("PR4" 제거), `User.markPhoneVerified` Javadoc("및 PR4 번호 변경" → "및 번호 변경")

**Interfaces:**
- Consumes: Task 1 완료 상태(email 스키마 부재).
- Produces: 컴파일 그래프에서 메일 스택 소멸 — `rg -in "resend|brevo|EmailSender|MailProvider|spring-boot-starter-mail" backend/src backend/build.gradle.kts` 매치 0 (단, SentryConfigTest의 `email=test@...` 쿼리 마스킹 픽스처는 무관하므로 유지).

- [ ] **Step 1: 삭제 + 리워드**

위 목록대로 삭제·수정. yml 주석 갱신 예(application.yml health 블록):
```yaml
    mail:
      # spring-boot-starter-mail 제거(PR5) 후 이 키는 무해한 잔존 설정이다. 굳이 지우지 않는 이유:
      # 구 이미지로 롤백하면 JavaMailSender 헬스체크가 되살아나 배포가 롤백 루프에 빠진 전례가 있다.
      enabled: false
```

- [ ] **Step 2: 잔재 grep + 전체 테스트**

Run: `rg -in "resend|brevo|emailsender|mailprovider|starter-mail|EMAIL_PROVIDER|EMAIL_VERIFICATION_SECRET" backend/src backend/build.gradle.kts backend/.env.example` → 유의미 매치 0(SentryConfigTest 픽스처·마이그레이션 히스토리 주석 제외). 이후 `cd backend && ./gradlew test` → BUILD SUCCESSFUL.
CI 워크플로도 확인: `rg -in "resend|brevo|email" .github/workflows/backend-ci.yml` — 매치 시 제거.

- [ ] **Step 3: 커밋**

```bash
git add -A && git commit -m "chore(backend): 메일 발송 인프라(Resend·Brevo 체인)와 설정·의존성 제거"
```

### Task 3: [FE] 생성 타입(schema.d.ts) 재생성

**Files:**
- Regenerate: `frontend/packages/api/src/generated/schema.d.ts` (`pnpm gen:api` — 로컬 백엔드 :8080 필요)

**Interfaces:**
- Consumes: Task 1·2가 반영된 백엔드의 `/v3/api-docs`.
- Produces: email 잔재 0인 생성 타입. 수기 타입·클라이언트는 무수정이 목표(이미 PR2~4에서 정리됨).

- [ ] **Step 1: 백엔드 기동 + 재생성**

```bash
cd backend && set -a && source .env && set +a && MO_PROVIDER=stub ./gradlew bootRun --args='--spring.profiles.active=local' &
# Started 확인 후
cd ../frontend && pnpm gen:api
```
(기동은 오케스트레이터가 백그라운드로 관리해도 된다. 포트 8080 선점 프로세스 주의.)

- [ ] **Step 2: 검증**

- `rg -c "email" frontend/packages/api/src/generated/schema.d.ts` → 0 (혹은 잔존 시 각 매치가 email 무관 문자열인지 판단해 보고).
- diff에 email 경로/스키마 제거 외 잡음(순서 뒤바뀜 등)이 크면 원인 보고.
- `cd frontend && pnpm typecheck && pnpm lint && pnpm --filter @duing/web exec vitest run && pnpm --filter @duing/hooks test && pnpm --filter @duing/schemas test` → 전부 그린(생성 타입만 바뀌므로 무수정 그린이 기대값).

- [ ] **Step 3: 커밋**

```bash
git add frontend/packages/api/src/generated/schema.d.ts && git commit -m "chore(web): OpenAPI 생성 타입 재생성(email 스키마 제거 반영)"
```

---

## Self-Review

1. **Spec coverage** — 스펙 §"메일 인프라 (PR5)" 삭제 목록 전 항목이 T2에, V80 주석의 "물리 drop은 PR5" 약속이 T1에, §16 PR5 행의 gen:api가 T3에 매핑. health.mail 보존 명시. 갭 없음.
2. **Placeholder scan** — V81 전문·yml 주석 예시·grep 검증식 제공. anonymize 파일은 rg로 특정 지시(파일명 미상이나 검색식이 결정적). TBD 없음.
3. **Type consistency** — BE만 스키마 변경, FE는 생성 파일 재생성뿐이라 교차 시그니처 없음.

**Out of Scope:** 서버(deploy) 실 env 및 GitHub Secrets의 RESEND/BREVO 값 삭제(PR 본문에 운영 체크리스트로 안내 — 코드가 참조하지 않으므로 잔존해도 무해), terms 배포 게이트(별도 브랜치), users.email 관련 과거 마이그레이션(V1·V18·V80) 수정(Flyway 불변).
