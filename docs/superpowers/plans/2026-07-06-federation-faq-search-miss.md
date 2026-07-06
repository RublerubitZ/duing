# FAQ 무결과 검색어 로깅 (P2-3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox 문법.

**Goal:** /faq 공개 검색에서 결과 0건인 검색어를 서버가 집계 기록하고, admin FAQ 관리 화면의 "무결과 검색어" 패널에서 확인한다 — "학생이 찾는데 없는 FAQ"의 직접 신호(스펙 §8 P2-3 + P2-5의 검색어 부분). PR 2개(백엔드 PR11 → 프론트 PR12).

**Architecture (핵심 설계 결정):**
- **집계형 저장(raw 로그 아님)**: `(정규화 키워드 UNIQUE, miss_count, last_searched_at)` 1행 — PR9에서 확립한 **`ON CONFLICT DO UPDATE` 원자 업서트**로 miss_count+1·last_searched_at=NOW() 증분. 테이블이 작게 유지되고 admin 조회가 정렬만으로 끝남. 정규화: trim + 연속 공백 1개 압축 + lower() — 대소문자·공백 변형이 한 행으로 모임(원문 표시는 정규화형으로 충분 — 한국어 위주라 lower 영향 미미).
- **readOnly 트랜잭션 함정 회피(필수)**: `GeneralFederationFaqService`는 클래스 레벨 `@Transactional(readOnly = true)` — 검색 경로 안에서 직접 쓰면 실PG에서 500(리포에 문서화된 함정). 기록은 **별도 `FederationFaqSearchMissRecorder` 서비스의 `@Transactional(propagation = REQUIRES_NEW)`** 메서드로 분리(바깥 readOnly tx 일시 중단 후 새 쓰기 tx). **기록 실패는 검색을 절대 깨지 않는다** — recorder 호출을 try/catch로 감싸 warn 로그 후 무시(신호 유실 < 검색 가용성).
- **기록 조건**: 공개 검색 API에서 keyword가 비어있지 않고(trim 후) && 검색 결과 totalElements==0 일 때만. 카테고리 필터와 무관하게 keyword 자체를 기록(카테고리 조합은 신호 노이즈 — keyword가 본질). 키워드 길이 상한 100자(초과분은 기록 스킵 — 어뷰징 문자열 저장 방지, 검색 자체는 정상 동작).
- **어뷰징 수용**: 익명 반복 검색으로 count 인플레이션 가능 — admin 전용 참고 신호라 수용(P2-2와 동일 논리, 문서화). 단 저장 폭주는 UNIQUE 집계 구조가 자연 제한(행 수 = 고유 키워드 수).
- **admin 노출**: `GET /admin/federation/faq-search-misses?page&size` — miss_count DESC, last_searched_at DESC 정렬 고정(파라미터 없음 — YAGNI). 행: keyword·missCount·lastSearchedAt. 삭제/처리 액션 없음(P3). FE는 admin FAQ 관리 페이지에 접이식 "무결과 검색어" 패널(목록 위 카드) — 별도 라우트 아님.

**레퍼런스:** `GeneralFederationFaqService.search`(readOnly·SearchCondition), PR9의 `FederationFaqFeedbackRepository` 네이티브 업서트, `FederationFaqPublicAcceptanceTest`, admin 페이지 `app/admin/faqs/_pages/AdminFaqListPage.tsx`

---

## PR11 — backend (`feat/federation-faq-search-miss-api`)

### Task 1: V77 + 기록 경로

- [ ] **V77__create_federation_faq_search_miss.sql** (RLS 필수):

```sql
CREATE TABLE federation_faq_search_miss (
    id               BIGSERIAL PRIMARY KEY,
    keyword          VARCHAR(100) NOT NULL,
    miss_count       BIGINT       NOT NULL DEFAULT 1,
    last_searched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX uq_ffsm_keyword ON federation_faq_search_miss (keyword);
ALTER TABLE federation_faq_search_miss ENABLE ROW LEVEL SECURITY;
```

(deleted_at은 BaseEntity 매핑 강제 — PR9 전례. soft delete 로직 없음)
- [ ] 엔티티 `FederationFaqSearchMiss`(BaseEntity, 읽기 전용 모델 — 쓰기는 네이티브 업서트만, Javadoc 명시) + repository에 `@Modifying(clearAutomatically = true)` 네이티브: `INSERT INTO federation_faq_search_miss (keyword) VALUES (:keyword) ON CONFLICT (keyword) DO UPDATE SET miss_count = federation_faq_search_miss.miss_count + 1, last_searched_at = NOW(), updated_at = NOW()`
- [ ] `FederationFaqSearchMissRecorder` 서비스: `@Transactional(propagation = Propagation.REQUIRES_NEW)` `record(String rawKeyword)` — 정규화(trim·공백압축·lower) 후 비어있거나 100자 초과면 no-op, 업서트 1회. 클래스 Javadoc에 readOnly 함정 회피 근거 명시
- [ ] 검색 경로 연결: `GeneralFederationFaqService.search`(또는 컨트롤러 — 서비스가 totalElements를 아는 위치 판단) 에서 keyword 존재 && 결과 0건이면 `try { recorder.record(keyword) } catch (Exception e) { log.warn } ` — **검색 응답은 기록 성패와 무관**
- [ ] 인수 테스트 5케이스: ① 무결과 검색 → 행 1건(miss_count=1) ② 같은 키워드 재검색 → count=2·행 1건 ③ 대소문자/공백 변형(" Abc "·"abc") → 같은 행 ④ 결과 있는 검색 → 미기록 ⑤ keyword 없는 목록 조회 → 미기록. **실PG(TestContainers) 경유 — readOnly 함정 회귀 잠금이 핵심 목적**
- [ ] IntegrationTestBase TRUNCATE 추가 → Commit `feat(backend): FAQ 무결과 검색어 집계 기록 (V77)`

### Task 2: admin 조회 API

- [ ] `GET /admin/federation/faq-search-misses?page&size` — AdminFederationFaqApi 확장 or 신규 인터페이스(기존 admin FAQ 컨트롤러 구조 보고 판단), `hasRole('ADMIN')`, 정렬 고정(miss_count DESC, last_searched_at DESC), 응답 `{keyword, missCount, lastSearchedAt}` PageResponse
- [ ] 인수 테스트 3케이스: 정렬 정확(카운트 내림차순)·페이지네이션·비ADMIN 403
- [ ] 전체 `./gradlew test` green → Commit `feat(backend): admin 무결과 검색어 조회 API`

### Task 3 (게이트): duing-code-reviewer + codex adversarial(readOnly 회피 정합·REQUIRES_NEW 커넥션 풀 고갈 시나리오·업서트 원자성·admin 경계) → 반영 → push → PR

---

## PR12 — web (`feat/federation-faq-search-miss-web`) — PR11 머지 후

### Task 4: admin 패널 + 게이트

- [ ] types `FaqSearchMiss{keyword, missCount, lastSearchedAt}` + client `admin.federationFaqSearchMisses.list({page,size})` + hook `useAdminFaqSearchMissesQuery`
- [ ] AdminFaqListPage 상단(필터 아래·테이블 위)에 접이식 카드 "무결과 검색어" — 기본 접힘, 펼치면 상위 10개(page 0 size 10) 테이블(키워드·횟수·마지막 검색일), 0건이면 "아직 무결과 검색어가 없어요", "더 보기"는 페이지네이션(기존 Pagination)
- [ ] 테스트 3케이스(렌더·빈 상태·펼침 토글) + 검증 4종 + 시각 QA(무결과 검색 유발 → admin 확인은 계정 차단 시 스킵·비로그인 검색만 확인) + FE 리뷰 + codex → 반영 → push → PR

## Out of Scope
- 삭제/처리(dismiss) 액션·정렬 파라미터·기간 필터(P3), pg_trgm 검색 개선(이 데이터로 방향 확정 후), rate limit

## Self-Review
- readOnly 함정: REQUIRES_NEW 분리+try/catch 무시+실PG 인수 테스트로 3중 방어 — 리포 메모리의 "콜드 경로 실PG 통합테스트 필수"와 정합. 집계 업서트는 PR9 확립 패턴 재사용이라 경합 안전. 기록 조건(0건+keyword 존재)이 컨트롤러/서비스 중 totalElements를 아는 위치와 일치하는지 구현자가 확인하도록 명시.
