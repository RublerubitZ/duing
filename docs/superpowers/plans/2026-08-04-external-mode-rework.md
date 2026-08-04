# 외부 폼 모집 모드 개편 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** EXTERNAL 을 모집 모드로 승격 — 작성 UX(전환 다이얼로그·전용 화면)·URL 화이트리스트·가입 코드의 Recruitment 귀속(CLOSED 후 발급) 전환.

**Architecture:** v1 가입 코드 기능(#848~#854, in-tree)이 1차 레퍼런스다. BE 2개 PR(모집 제약+URL / 코드 귀속 전환) → FE 2개 PR(작성 UX / 관리 화면 이전). 스펙 SoT: `docs/join-code-invite-spec.md` (v2).

**Tech Stack:** v1 과 동일 (Spring Boot·Flyway·RestAssured / Next.js·zod·msw)

## Global Constraints

- v1 계획(`2026-08-03-join-code-invite.md`)의 Global Constraints 전부 승계: push·PR 금지(커밋만)·어트리뷰션 금지·한국어·record DTO·api/controller 분리·MESSAGE 상수 예외·서비스 레이어 권한(requireManager)·TestContainers·상대 날짜·`@DisplayName` 문장·IntegrationTestBase TRUNCATE·RLS·TIMEZONE.md(Instant)·FE 3단 배선(types→client 두 곳→hooks+barrel)·msw 테스트·확인 모달/토스트/로딩 규약·`pt` 토큰류·cwd(backend/·frontend/)
- **INTERNAL(자체 폼) 모집·Application(지원) 플로우 동작 불변** — 기존 테스트 전체 초록이 경계
- ClubMember 생성은 `ClubMemberEnrollmentService` 그대로 (승인 경로 무변경)
- 접근성: 신규 다이얼로그는 기존 Dialog/ConfirmDialog 컴포넌트 재사용(포커스 트랩·Escape 기본 제공), 신규 버튼·카드에 적절한 role/aria
- URL 화이트리스트는 FE(zod)·BE 양쪽 동일 리터럴 목록 + **각 측 테스트가 목록 자체를 단언**(드리프트 시 한쪽 테스트 깨짐 — 회원 이름 금칙어 전례)
- 스펙 §4.2 표(4 케이스)·§3 표(호스트 3종)는 값 그대로 구현

---

## Task 1: `feat(backend): 외부 폼 모집 제약·URL 화이트리스트` (브랜치 feat/external-mode-recruitment-constraints, develop 분기)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/recruitment/service/ExternalFormUrlValidator.java` (+ 허용 목록 상수 public — 테스트가 목록 단언)
- Modify: `backend/src/main/java/com/duing/domain/recruitment/controller/dto/request/CreateRecruitmentRequest.java` — 기존 `@Pattern("^$|^https?://.+$")` 제거
- Modify: `backend/src/main/java/com/duing/domain/recruitment/service/dto/command/CreateRecruitmentCommand.java` 및/또는 `GeneralRecruitmentService` — EXTERNAL 검증 확장 지점(기존 externalFormUrl 필수 검증 위치)에 화이트리스트·EXTERNAL 제약 추가
- Test: `backend/src/test/java/com/duing/domain/recruitment/service/ExternalFormUrlValidatorTest.java` + 기존 recruitment 생성 테스트 확장

**Requirements (스펙 §2·§3):**
- 화이트리스트: `forms.gle`(host 정확 일치) / `docs.google.com` + path `/forms` 시작 / `form.naver.com`. HTTPS 만. `java.net.URI` 파싱, 파싱 실패·비 https·host 불일치·우회(`docs.google.com.evil.com`, `https://evil.com/docs.google.com/forms`, userinfo 트릭 `https://docs.google.com@evil.com/forms`) 전부 400. 에러 문구에 허용 플랫폼 안내(한국어)
- EXTERNAL 시: `useInterview=true` 400 / `showApplicantCount=true` 400 / 안내문 필드(작성 폼의 안내문이 매핑되는 실제 요청 필드를 코드에서 확인해 결정 — 판단 근거를 보고서에 기록) 값 존재 시 400. questions 비움은 기존 유지
- INTERNAL 경로 회귀 0 — 기존 recruitment 테스트 전체 초록
- 수정(update) 경로: `externalFormUrl`·`applicationMode` 는 생성 후 변경 불가(기존) — 생성 검증만으로 충분함을 테스트로 확인

**Steps:** TDD(검증기 단위 테스트 매트릭스 → 구현 → 생성 API RestAssured 케이스 추가) → `cd backend && ./gradlew test` BUILD SUCCESSFUL → 커밋 1개.

## Task 2: `feat(backend): 가입 코드 모집 귀속 전환 — CLOSED 후 발급·모집 삭제 가드` (브랜치 feat/join-code-per-recruitment, A 위 스택)

**Files:**
- Create: `backend/src/main/resources/db/migration/V99__join_code_active_per_recruitment.sql` (번호는 작성 시점 develop 재확인):
  `DROP INDEX IF EXISTS uk_club_join_code_active_per_club;` + `CREATE UNIQUE INDEX IF NOT EXISTS uk_club_join_code_active_per_recruitment ON club_join_code (recruitment_id) WHERE revoked_at IS NULL AND deleted_at IS NULL;`
  (+ 주석: dev 에 남은 v1 데이터는 사전 정리 전제 — 프로덕션 미출시)
- Modify: `ClubJoinCode.java` — `isUsable` 에서 귀속 모집 OPEN 조건 제거(미폐기·미만료·미소진만, 주석 갱신)
- Modify: `ClubJoinCodeApi/Controller/JoinCodeService/GeneralJoinCodeService` — recruitment 스코프 경로로 이동(스펙 §4.3), create 검증을 "recruitmentId 조회 → clubId 소속 대조(불일치 404) → EXTERNAL+CLOSED 아니면 409(문구: OPEN 이면 '모집이 종료된 후 가입 코드를 만들 수 있습니다.', INTERNAL 이면 '외부 폼 모집에서만 가입 코드를 사용할 수 있습니다.')" 로 교체. 활성 조회·폐기도 recruitment 스코프 소속 대조. Repository: `findByRecruitmentIdAndRevokedAtIsNull` 추가·`findByClubIdAndRevokedAtIsNull` 제거
- Modify: SecurityConfig — `GET /api/v1/clubs/*/join-codes/**` 매처를 `GET /api/v1/clubs/*/recruitments/*/join-codes/**` 로 교체 (join-requests 매처 유지)
- Modify: 모집 삭제 서비스(기존 CLOSED+무지원자 검증 위치) — **가입 코드 존재 시 409** ("가입 코드가 발급된 모집은 삭제할 수 없습니다.") 추가, `existsByRecruitmentId`
- Modify: `GeneralJoinRequestService.check/createRequest` — 모집 상태 참조 제거에 따른 정합(엔티티 isUsable 변경으로 자동 반영되는지 확인)
- Test: 기존 joincode 테스트 전면 개정(시드가 OPEN EXTERNAL → CLOSED EXTERNAL) + 신규: §4.2 표 4케이스 / 삭제 가드 / 소속 대조 404 / 같은 클럽 CLOSED EXTERNAL 모집 2개에 각각 활성 코드 / 학생 플로우(신청 차감·거절 환급·승인) 회귀 초록 / 동시성 테스트 시드 갱신

**Steps:** TDD → 전체 스위트 초록 → 커밋 1~2개.

## Task 3: `feat(frontend): 모집 작성 EXTERNAL 모드 — 전환 다이얼로그·전용 화면·URL 검증` (브랜치 feat/external-mode-form-ux, B 위 스택)

**Files:** (경로는 기존 모집 작성 폼 위치 확인 — `app/manage/clubs/[clubId]/recruitments/` 계열, `recruitment-form.test.tsx` 존재)
- Create: 전환 확인 다이얼로그 컴포넌트(스펙 §1.1 문안·절차 플로우 포함, 기존 Dialog 재사용) — 취소=INTERNAL 유지, 확인=EXTERNAL 전환
- Create: 회원 등록 절차 안내 카드 공용 컴포넌트(§7 — Task 4 도 사용, `_components` 공용 위치)
- Modify: 모집 작성 폼 — EXTERNAL 시 안내문·질문·면접·지원자 수 공개 섹션 미렌더(구조상 어려운 요소만 "외부 폼 모집에서는 사용할 수 없습니다."), 외부 폼 URL 필드 + 안내, EXTERNAL 전환 시 숨김 필드 값 리셋(면접 off·질문 비움·지원자수 off — BE 400 방지)
- Modify: zod 스키마(`packages/schemas`) — URL 화이트리스트(BE 와 동일 리터럴 목록·정확 host 파싱, http 거부) + **목록 단언 동기화 테스트**
- Test: 다이얼로그(취소/확인/Escape=취소), EXTERNAL 섹션 숨김, URL 검증 매트릭스(BE 와 동일 케이스), INTERNAL 폼 회귀

**Steps:** 테스트 먼저 → 구현 → `pnpm --filter web test -- --run`·typecheck·lint → 커밋 1개.

## Task 4: `feat(frontend): 모집 관리 회원 등록 영역 — 코드 관리 이전·안내·유출 경고` (브랜치 feat/external-mode-manage-ui, C 위 스택)

**Files:**
- Modify: `packages/types`·`packages/api/src/client.ts`(선언+구현)·`packages/hooks/src/joinCodes.ts` — 코드 생성/조회/폐기를 recruitment 스코프로 (`clubs/${clubId}/recruitments/${recruitmentId}/join-codes...`), 쿼리키 recruitmentId 포함
- Modify: 모집 관리 화면(`recruitments/[recruitmentId]` 상세) — 모드·상태별 영역(스펙 §5): INTERNAL 무표시 / EXTERNAL+OPEN "모집 종료 후 사용할 수 있습니다." / EXTERNAL+CLOSED 회원 등록 영역(활성 코드 카드+생성·재생성·폐기, 가입 요청 관리 링크+대기 배지, §7 절차 카드, §8 차감 안내, §9 복사 버튼 근처 Warning Card)
- Modify: `members/page.tsx` — 회원 초대 버튼·`InviteCodeDialog` 제거(가입 요청 링크·배지는 유지), InviteCodeDialog 는 recruitment 관리 쪽으로 이전·개편(기존 컴포넌트 재사용 가능하면 이동)
- Test: 모드·상태 3분기 렌더, 안내·경고 문구, members 회원 초대 부재, 기존 requests 페이지 회귀

**Steps:** 테스트 먼저 → 구현 → 전체 web 테스트·typecheck·lint·build → 커밋 1개.

## QA (컨트롤러 수행)

실브라우저 전체 왕복: EXTERNAL 모집 작성(다이얼로그 확인·전용 화면·URL 검증) → OPEN 상태 안내 확인 → 마감 → 회원 등록 영역에서 코드 생성(경고 카드 확인) → 학생 가입 요청(차감) → 승인 → 회원 등록. INTERNAL 모집 화면에 코드 UI 부재 확인.

## Self-check (PR 직전 공통)

v1 계획의 Self-check 승계 + 스펙 v2 §2·§3·§4.2 표 대조 + INTERNAL 회귀 확인.
