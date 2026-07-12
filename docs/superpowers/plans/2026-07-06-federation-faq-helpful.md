# FAQ Helpful 피드백 (P2-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** FAQ 항목에 "이 답변이 도움이 되었나요?" 피드백을 붙이고, 집계는 **admin FAQ 관리 화면에서만** 노출한다(학생에게 카운트 비공개 — 갭 신호 전용). 스펙 §8 P2-2. PR 2개(백엔드 PR9 → 프론트 PR10).

**Architecture (핵심 설계 결정):**
- **식별·dedup**: 로그인 사용자는 `user_id`, 비로그인은 FE가 localStorage에 보관하는 UUID `session_key`. 한 FAQ에 식별자당 피드백 1건 — 재제출은 **값 갱신(upsert)** 으로 마음 바꾸기 허용. DB 부분 유니크 인덱스 2개가 경합 방어(중복 INSERT는 유니크 위반 catch 후 무시 — 멱등, 도배 409 불필요).
- **비로그인 허용**: `POST /federation/faqs/{faqId}/feedback` 을 SecurityConfig에 **`HttpMethod.POST` 정확 패턴**(`/api/v1/federation/faqs/*/feedback`)으로 permitAll — 기존 FAQ GET 스타일과 동일, `/federation/**` 광역 금지 원칙 유지(비밀문의 방어 불변).
- **어뷰징 수용**: 익명이 session_key를 바꿔가며 인플레이션 가능 — 카운트는 admin 전용 참고 신호이고 어떤 공개 표면·정렬에도 쓰이지 않으므로 수용(문서화). rate limit 스코프 밖.
- **admin 노출**: 별도 화면 없이 기존 admin FAQ 목록 응답에 `helpfulCount`/`notHelpfulCount` 집계 2필드 추가(LEFT JOIN 집계 1쿼리) → 기존 관리 화면 테이블에 컬럼 2개. "안됨 많은 순" 정렬은 후속(P3) — 지금은 표시만.
- **학생 UI 상태**: 서버 조회 없이 localStorage에 `faqId→helpful` 기록으로 내 선택 표시(비로그인·로그인 공용 단순화 — 서버와 어긋나도 UI 상태일 뿐, YAGNI).

**레퍼런스:** `domain/federation/` FAQ 컨트롤러·서비스·`FederationFaqPublicAcceptanceTest`(permitAll 회귀 잠금 방식), `V73__create_federation_faq.sql`, FE `app/faq/_components/`(아코디언), `app/admin/faqs/`(관리 목록), 훅 `federationFaqs.ts`

---

## PR9 — backend (`feat/federation-faq-feedback-api`)

### Task 1: V76 + 엔티티 + POST 피드백 API

- [ ] **V76__create_federation_faq_feedback.sql** — RLS 필수:

```sql
CREATE TABLE federation_faq_feedback (
    id          BIGSERIAL PRIMARY KEY,
    faq_id      BIGINT      NOT NULL REFERENCES federation_faq (id),
    user_id     BIGINT      REFERENCES users (id),
    session_key VARCHAR(64),
    helpful     BOOLEAN     NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_fff_identity CHECK (user_id IS NOT NULL OR session_key IS NOT NULL)
);
CREATE UNIQUE INDEX uq_fff_faq_user ON federation_faq_feedback (faq_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX uq_fff_faq_session ON federation_faq_feedback (faq_id, session_key) WHERE user_id IS NULL AND session_key IS NOT NULL;
ALTER TABLE federation_faq_feedback ENABLE ROW LEVEL SECURITY;
```

- [ ] 엔티티 `FederationFaqFeedback` — BaseEntity 상속(updated_at 있음), soft delete 불필요(@SQLDelete 없음 — 피드백은 갱신만), `updateHelpful(boolean)` 도메인 메서드
- [ ] `POST /federation/faqs/{faqId}/feedback` — request `{helpful: Boolean @NotNull(message="도움 여부는 필수 입력값입니다."), sessionKey: String @Size(max=64)}`. 컨트롤러에서 `@AuthenticationPrincipal`(nullable — permitAll 경로) 수신. 서비스 로직:
  - 로그인: userId로 조회→있으면 updateHelpful, 없으면 insert(sessionKey 무시)
  - 비로그인: sessionKey 필수(없으면 400 "세션 키는 필수 입력값입니다."), sessionKey로 조회→갱신 or insert
  - faqId는 **발행된(published) FAQ만**(미발행·미존재 404 — 공개 단건 조회와 동일 규칙)
  - insert 시 유니크 위반(DataIntegrityViolation) catch → 재조회 후 갱신(경합 멱등 수렴, flush 필요)
  - 응답 204
- [ ] SecurityConfig: `.requestMatchers(HttpMethod.POST, "/api/v1/federation/faqs/*/feedback").permitAll()` — 기존 FAQ GET 블록 옆에 배치, 주석에 광역 금지 원칙 유지 명시
- [ ] 인수 테스트 7케이스: ① 비로그인+sessionKey 201/204 ② 같은 sessionKey 재제출 값 갱신(카운트 1 유지) ③ 로그인 제출·재제출 갱신 ④ 비로그인 sessionKey 누락 400 ⑤ 미발행 FAQ 404 ⑥ 미존재 404 ⑦ 로그인+비로그인 같은 FAQ 각 1건(총 2건 독립)
- [ ] IntegrationTestBase TRUNCATE에 `federation_faq_feedback` 추가 → Commit `feat(backend): FAQ 도움됨 피드백 API (V76)`

### Task 2: admin 집계 노출

- [ ] admin FAQ 목록 조회(QueryDSL — AdminFederationFaqRepositoryCustom 확인)에 helpful/notHelpful 집계 LEFT JOIN 추가, `AdminFederationFaqSummaryResponse`에 `helpfulCount`/`notHelpfulCount`(long) 추가 — record positional 계층 동기화 주의
- [ ] 인수 테스트 2케이스: 피드백 3건(도움2·안됨1) 시딩 → admin 목록 카운트 정확, 피드백 0건 FAQ는 0/0
- [ ] `./gradlew test` 전체 green → Commit `feat(backend): admin FAQ 목록에 피드백 집계 추가`

### Task 3 (PR9 게이트): duing-code-reviewer + codex adversarial(비로그인 경로 남용·유니크 경합·permitAll 경계가 비밀문의 침범 안 하는지) → 반영 → push → PR

---

## PR10 — web (`feat/federation-faq-feedback-web`) — PR9 머지 후

### Task 4: 데이터 레이어 + 학생 버튼

- [ ] types: `FederationFaqFeedbackPayload{helpful: boolean; sessionKey?: string}`, admin summary 타입에 카운트 2필드. client: `federationFaqs.submitFeedback(faqId, payload)` (jsonVoid). hooks: `useSubmitFaqFeedbackMutation()` — invalidate 불필요(공개 표면에 카운트 없음)
- [ ] `app/faq/_lib/faqFeedbackSession.ts`: `getFaqFeedbackSessionKey()`(localStorage `duing:faq-feedback-session`, 없으면 crypto.randomUUID 생성 — SSR 가드 typeof window) + `getMyFaqFeedback(faqId)`/`setMyFaqFeedback(faqId, helpful)`(localStorage map `duing:faq-feedback-choices`)
- [ ] `FaqFeedback` 컴포넌트(`app/faq/_components/`): "이 답변이 도움이 되었나요?" + 👍 도움됐어요 / 👎 아쉬워요 버튼. 클릭 → mutation(로그인 여부 무관 sessionKey 항상 동봉 — 백엔드가 로그인 시 무시) → 성공 시 localStorage 기록+선택 상태 하이라이트+"의견이 반영되었어요" 문구. 이미 선택했으면 초기 렌더부터 선택 표시, 반대 버튼 클릭으로 변경 가능. 실패 토스트. **카운트 어디에도 미표시**
- [ ] FAQ 아코디언 펼침 컨텐츠 하단 + FaqDeepLinkCard 하단에 통합. 홈 HomeFaqAccordion은 제외(홈은 요약 표면 — /faq 유도)
- [ ] 테스트 4케이스: 클릭 payload(helpful·sessionKey)/선택 상태 복원/변경 제출/실패 토스트 → Commit 2개(데이터 레이어/컴포넌트+통합)

### Task 5: admin 컬럼 + 게이트

- [ ] admin FAQ 관리 목록에 "도움됨/아쉬움" 컬럼(카운트 2개 — 안됨>도움이면 시각 강조(text-coral) — 갭 신호), 테스트 1케이스
- [ ] 검증 4종 + 시각 QA(비로그인 시크릿 창 포함: 제출→새로고침 상태 복원→변경, admin 스킵 전례) + FE 리뷰 + codex → 반영 → push → PR

## Out of Scope
- 안됨 순 정렬·무결과 검색어(P2-3)·rate limit·홈 아코디언 노출·피드백 사유 텍스트

## Self-Review
- dedup 계약(userId 우선, sessionKey는 비로그인 전용 유니크)이 DB 인덱스·서비스 분기·FE sessionKey 상시 동봉과 정합. permitAll은 POST 단일 경로로 비밀문의 광역 금지 원칙 유지. 카운트 비공개 계약이 응답(공개 DTO 무변경)·FE(미표시)·admin(전용 노출)까지 일관.
