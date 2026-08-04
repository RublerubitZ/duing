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
- Modify: `ClubJoinCodeApi/Controller/JoinCodeService/GeneralJoinCodeService` — recruitment 스코프 경로로 이동(스펙 §4.3), create 검증을 "recruitmentId 조회 → clubId 소속 대조(불일치 404) → **INTERNAL 이면 409('외부 폼 모집에서만 가입 코드를 사용할 수 있습니다.') — 모집 상태 무관**" 으로 교체. 활성 조회·폐기도 recruitment 스코프 소속 대조. Repository: `findByRecruitmentIdAndRevokedAtIsNull` 추가·`findByClubIdAndRevokedAtIsNull` 제거
- Modify: SecurityConfig — `GET /api/v1/clubs/*/join-codes/**` 매처를 `GET /api/v1/clubs/*/recruitments/*/join-codes/**` 로 교체 (join-requests 매처 유지)
- Modify: 모집 삭제 서비스(기존 CLOSED+무지원자 검증 위치) — **단계적 삭제 정책(스펙 §4.2 표)**: PENDING 가입 요청 존재 시 409("처리되지 않은 가입 요청이 있습니다. 먼저 승인하거나 거절해주세요.") / 그 외(코드만·처리 완료 이력만)는 허용하되 **삭제 트랜잭션에서 활성 코드 자동 폐기**(revoke). Repository: PENDING 존재 검사·활성 코드 조회 재사용
- Modify: `GeneralJoinRequestService.check/createRequest` — 모집 상태 참조 제거에 따른 정합(엔티티 isUsable 변경으로 자동 반영되는지 확인)
- Test: 기존 joincode 테스트 recruitment 스코프 개정(시드 모집 상태는 무관 — 최소 diff) + 신규: §4.2 표 4케이스(INTERNAL 2건 409·EXTERNAL 2건 201) / 삭제 정책 3분기(코드만→삭제+코드 폐기 확인, PENDING→409, 처리 완료 이력만→삭제+이력 보존 확인) / 소속 대조 404 / 같은 클럽 CLOSED EXTERNAL 모집 2개에 각각 활성 코드 / 학생 플로우(신청 차감·거절 환급·승인) 회귀 초록 / 동시성 테스트 시드 갱신

**Steps:** TDD → 전체 스위트 초록 → 커밋 1~2개.

## Task 3: `feat(frontend): 모집 작성 EXTERNAL 모드 — 전환 다이얼로그·전용 화면·URL 검증` (브랜치 feat/external-mode-form-ux, B 위 스택)

**Files:** (경로는 기존 모집 작성 폼 위치 확인 — `app/manage/clubs/[clubId]/recruitments/` 계열, `recruitment-form.test.tsx` 존재)
- Create: 전환 확인 다이얼로그 컴포넌트(스펙 §1.1 문안·절차 플로우 포함, 기존 Dialog 재사용) — 취소=INTERNAL 유지, 확인=EXTERNAL 전환
- Create: 회원 등록 절차 안내 카드 공용 컴포넌트(§7 — Task 4 도 사용, `_components` 공용 위치)
- Modify: 모집 작성 폼 — EXTERNAL 시 안내문·질문·면접·지원자 수 공개 섹션 미렌더(구조상 어려운 요소만 "외부 폼 모집에서는 사용할 수 없습니다."), 외부 폼 URL 필드 + 안내, **전환 확인 시점에 즉시 값 초기화(안내문·질문 비움·면접 off·지원자수 off — 저장 후 400 을 보는 UX 금지, BE 검증은 방어선)**
- Modify: zod 스키마(`packages/schemas`) — URL 화이트리스트(BE 와 동일 리터럴 목록·정확 host 파싱, http 거부) + **목록 단언 동기화 테스트**
- Test: 다이얼로그(취소/확인/Escape=취소), EXTERNAL 섹션 숨김, URL 검증 매트릭스(BE 와 동일 케이스), INTERNAL 폼 회귀

**Steps:** 테스트 먼저 → 구현 → `pnpm --filter web test -- --run`·typecheck·lint → 커밋 1개.

## Task 4: `feat(frontend): 모집 관리 회원 등록 영역 — 코드 관리 이전·안내·유출 경고` (브랜치 feat/external-mode-manage-ui, C 위 스택)

**Files:**
- Modify: `packages/types`·`packages/api/src/client.ts`(선언+구현)·`packages/hooks/src/joinCodes.ts` — 코드 생성/조회/폐기를 recruitment 스코프로 (`clubs/${clubId}/recruitments/${recruitmentId}/join-codes...`), 쿼리키 recruitmentId 포함
- Modify: 모집 관리 화면(`recruitments/[recruitmentId]` 상세) — 모드별 영역(스펙 §5): INTERNAL 무표시 / **EXTERNAL(상태 무관) 회원 등록 영역**(활성 코드 카드+생성·재생성·폐기, 가입 요청 관리 링크+대기 배지, §7 절차 카드 — "모집 종료→합격자 선정"은 권장 순서로 안내, §8 차감 안내, §9 복사 버튼 근처 Warning Card). **상세 헤더에 "외부 폼 모집" 배지 + 플랫폼명(호스트 판별: Google Forms/Naver Form)**
- Modify: `members/page.tsx` — 회원 초대 **진입점 구조는 유지**하되 코드 생성 기능 대신 "외부 폼 모집의 회원 등록은 모집 관리에서 진행합니다." 안내 + 모집 관리 이동 링크로 대체(향후 이메일/QR/직접 초대 확장 자리). `InviteCodeDialog` 의 코드 관리 UI 는 recruitment 관리 쪽으로 이전·개편
- Test: 모드 2분기 렌더(INTERNAL 무표시/EXTERNAL 영역), 헤더 배지·플랫폼명, 안내·경고 문구, members 안내 대체 확인, 기존 requests 페이지 회귀

**Steps:** 테스트 먼저 → 구현 → 전체 web 테스트·typecheck·lint·build → 커밋 1개.

## Task 5: `feat(backend): 가입 코드 OPEN 정책·감사 주체 기록` (브랜치 feat/join-code-open-policy, Task 4 위 스택)

**Files/Requirements (스펙 §3.1 감사·§4.2 최종):**
- 생성 조건을 `EXTERNAL && OPEN` 으로 — CLOSED 는 409 신규 문구 "모집이 진행 중일 때만 가입 코드를 만들 수 있습니다."(MESSAGE 상수), INTERNAL 문구 기존 유지
- `ClubJoinCode.isUsable` 에 **귀속 모집 OPEN 조건 복원**(v1 메커니즘 — 파생 판정, 주석 갱신). 학생 check/createRequest 는 엔티티 판정으로 자동 반영 확인. **기존 PENDING 승인/거절은 모집 종료 후에도 가능**(승인 경로는 isUsable 미사용 — 확인만)
- Create: `V100__join_code_audit_columns.sql` — `created_by BIGINT REFERENCES users(id)`·`revoked_by BIGINT REFERENCES users(id)` (기존 행은 null 허용 — dev 정리 전제라 백필 불요, 주석). 번호는 작성 시점 재확인
- 서비스: create 시 created_by=requester 기록, revoke 시 revoked_by=requester, 모집 삭제의 자동 폐기 벌크 UPDATE 에 revoked_by=삭제 수행자 전달
- 발급↔삭제 모집 잠금 직렬화는 유지(정책상 상호 배타 복원돼도 심층 방어)
- Test: 조건 표 4케이스(EXTERNAL+OPEN 201 / EXTERNAL+CLOSED 409 / INTERNAL 2건 409) / 파생 사용(코드 발급 후 모집 CLOSED → check usable=false·신규 요청 409·**기존 PENDING 승인 성공**) / 모집 기간 재개 시 재사용 가능 / audit 컬럼 기록 3경로(생성·수동 폐기·삭제 자동 폐기) 단언 / 기존 스위트 초록

## Task 7: `feat(backend): 가입 링크 감사 이벤트·상태 카운트` (브랜치 feat/club-audit-events, Task 5 위 스택)

**Files/Requirements (스펙 §3.1 최종·§7.2):**
- Create: 마이그레이션(번호 재확인) — `club_audit_event` 테이블(club_id NOT NULL + recruitment_id·join_code_id·join_request_id nullable 참조)(recruitment_id·club_id·join_code_id null·join_request_id null·event_type VARCHAR(30) CHECK 6종·actor_user_id·created_at, **RLS 필수**, 조회 인덱스 (recruitment_id, created_at)) + IntegrationTestBase TRUNCATE 추가
- 이벤트 기록 6지점(각 트랜잭션 내): 링크 생성 CREATED / 재생성 트랜잭션 = 구 링크 REVOKED + 신규 REGENERATED / 수동·삭제 자동 폐기 REVOKED / 학생 요청 JOIN_REQUEST_CREATED(actor=학생) / 승인 APPROVED·거절(수동·자동) REJECTED(actor=운영진)
- 활성 링크 조회 응답에 **totalRequestCount(누적)·pendingCount** 포함 (JoinRequest 를 join_code 기준 집계 — 스펙 §7.2 Status Card 용, 응답 shape 보고서에 명시)
- Test: 이벤트 6종 기록 단언(재생성=REVOKED+REGENERATED 쌍) / 카운트 정확성(요청·거절·승인 혼합 시나리오) / 전체 스위트 초록

## Task 6: `feat(frontend): 모집 카드 액션 분기·가입 링크 UX 최종` (브랜치 feat/external-mode-card-actions, **Task 7 위 스택**)

**Files/Requirements (스펙 §5·§5.1·§7·§7.1):**
- 모집 관리 목록 카드 액션 분기: INTERNAL [지원자 관리][통계] 기존 유지 / EXTERNAL **[가입 코드][가입 요청 관리(대기 배지)]** — 지원자·통계 버튼 제거
- 카드 [가입 코드] → 다이얼로그로 코드 관리 전체(생성·활성 카드·재생성·폐기) — 상세의 `MemberEnrollmentSection` 컴포넌트 재사용(중복 금지)
- EXTERNAL 상세의 [지원자 관리]·[통계] 링크 제거, 상세 회원 등록 영역: **CLOSED 시 생성 폼 대신** "모집이 진행 중일 때만 가입 코드를 만들 수 있습니다." 안내(기존 코드 카드는 사용 불가 상태로 유지·요청 관리 링크 유지)
- 스펙 §4.3(프리셋 라디오 3택·만료 표시: OPEN="모집 종료 후 N일까지" 텍스트/CLOSED=구체 일시)·§4.3.1(종료 후 폐기 = 경고 문안+**타이핑 2단계 확인** 모달 내 인라인 입력, OPEN 중 폐기 = 기존 단일 확인)·§6(학생 합격 축하 진입 "약 30초"+신청 완료 문구 — 즉시 등록 표현 금지)·§7 절차 카드·**§7.1 정책 안내 4줄 카드(구 5줄 대체)**·**§7.2 Status Card**(상태·기간·누적 가입 신청·승인 대기 — Task 7 응답 카운트 소비)·합격 안내 문구 복사 템플릿 — 문안 전부 스펙 자구
- 사용자 대면 "가입 코드" → **"가입 링크"** 잔여 문구 일괄 통일(학생 랜딩·요청 콘솔·members 안내 포함), CLOSED 시 생성 폼 미노출(Task 5 인계 — 409 노출 방지)
- Test: 카드 분기 2모드 / 다이얼로그·프리셋 / Status Card 수치 / 정책 카드 4줄 / 종료 후 폐기 타이핑 게이트(불일치 시 비활성) / 학생 진입·완료 문구 / 절차 카드 순서 / INTERNAL 회귀

## QA (컨트롤러 수행)

실브라우저 전체 왕복: EXTERNAL 모집 작성(다이얼로그 확인·전용 화면·URL 검증) → OPEN 상태 안내 확인 → 마감 → 회원 등록 영역에서 코드 생성(경고 카드 확인) → 학생 가입 요청(차감) → 승인 → 회원 등록. INTERNAL 모집 화면에 코드 UI 부재 확인.

## Self-check (PR 직전 공통)

v1 계획의 Self-check 승계 + 스펙 v2 §2·§3·§4.2 표 대조 + INTERNAL 회귀 확인.
