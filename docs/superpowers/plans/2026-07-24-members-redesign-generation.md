# 회원 관리 리디자인 + 기수 기능 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회원 관리 페이지를 운영 허브(KPI·검색·필터·상세 패널·일괄 작업)로 리디자인하고, 동아리별 선택형 기수(generation) 기능을 추가한다.

**Architecture:** 스펙 `docs/superpowers/specs/2026-07-24-members-redesign-generation-design.md` 준수. 2-PR 스택 — PR-1 BE(`feat/members-generation-be`): V93 additive(club.use_generation, club_member.generation) + 목록/export 응답 확장(generation·feeStatus 단일 쿼리) + 기수 PATCH + useGeneration 설정. PR-2 FE(`feat/members-redesign-fe`, PR-1 스택): 회원 페이지 전면 재작성 + 동아리 정보 스위치. `use_generation`은 **순수 UI 표시 제어**(BE는 항상 저장).

**Tech Stack:** Spring Boot 3.4/QueryDSL/Flyway/Testcontainers, Next.js 15/React 19/TanStack Query/shadcn(sheet·dialog)/Vitest+MSW.

## Global Constraints

- 스펙 핵심 정책 전문 준수: 휴면 전면 제외 / 회비 SoT=회비 관리(수정·납부 처리 금지, "회비 관리에서 보기" 링크만) / Enum 불변·UI 라벨만 회장·임원·부원 / 벌크 API 금지(단건 반복) / useGeneration=표시 제어 전용(OFF 여도 PATCH 저장).
- generation 검증: **양의 정수(≥1)만, 서비스 레벨** — DB CHECK 없음, 최대값 스펙 미고정.
- KPI 4번째: 기수 ON = "최신 기수"(최고 generation, "N기 X명" — 신입 가정 없음) / OFF = "최근 가입"(FE 상수 `RECENT_JOIN_DAYS = 90`).
- CSV 는 **현재 검색·필터 결과 기준**(CSV 생성은 기존처럼 프론트 — export rows 를 필터된 memberId 집합으로 거른다).
- BE: 타입·명명·트랜잭션 컨벤션(backend/CLAUDE.md), `@DisplayName` 요구사항 문장, Testcontainers. FE: `type`만·`any`/`as` 금지·TanStack 내부 모킹 금지, pnpm 은 frontend/ 에서.
- TDD RED→GREEN. 커밋 Conventional Commits 한국어, attribution 금지. push·PR 생성 금지(오케스트레이터 몫).
- 회비 판정 규칙(확정): 해당 club·user 의 **가장 최근(created_at) 비-CANCELLED FeeBill** — `PAID → PAID`, `PENDING/PARTIAL_PAID/OVERDUE → UNPAID`, 비-CANCELLED 청구가 없으면 `NONE`.
- Out of Scope 추가 확정: **회원 추가 UI/API 신설 없음**(가입은 지원 플로우가 SoT — 현 시스템에 리더의 회원 추가 기능 자체가 없음), **회원 정보 수정 모달 없음**(회원 정보는 본인 소유 — 관리 액션은 역할 변경·기수 수정·탈퇴·회장 이양만).

---

# PR-1: Backend (`feat/members-generation-be` — 현재 브랜치, 스펙 커밋 위)

### Task 1: V93 마이그레이션 + 엔티티 확장

**Files:**
- Create: `backend/src/main/resources/db/migration/V93__add_member_generation.sql`
- Modify: `backend/src/main/java/com/duing/domain/club/entity/Club.java` (`useGeneration` 필드 + `changeUseGeneration`)
- Modify: `backend/src/main/java/com/duing/domain/clubmember/entity/ClubMember.java` (`generation` 필드 + `changeGeneration`)
- Test: `backend/src/test/java/com/duing/domain/clubmember/entity/ClubMemberGenerationTest.java` (신규), 기존 Club 엔티티 테스트에 케이스 추가

**Interfaces:**
- Produces: `Club.isUseGeneration(): boolean` / `Club.changeUseGeneration(boolean)`, `ClubMember.getGeneration(): Integer(nullable)` / `ClubMember.changeGeneration(Integer)` (null 허용 = 클리어).

- [ ] Step 1: V93 작성 — 순수 additive(기존 데이터 무영향·V92 이미지 롤백 호환):

```sql
-- 회원 기수(선택 기능): use_generation 은 UI 표시 제어 전용 설정, generation 은 회원별 기수(미사용 시 NULL 보존).
ALTER TABLE club ADD COLUMN IF NOT EXISTS use_generation BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE club_member ADD COLUMN IF NOT EXISTS generation INTEGER;
```

- [ ] Step 2: 실패 테스트 — `ClubMemberGenerationTest`: `changeGeneration(9)` 반영 / `changeGeneration(null)` 클리어 / 신규 멤버 기본 null. Club 테스트: `changeUseGeneration(true)` 반영·기본 false.
- [ ] Step 3: 엔티티 구현(기존 필드·어노테이션 패턴 준수, `@Column(name = "use_generation", nullable = false)` / `@Column(name = "generation")`).
- [ ] Step 4: `./gradlew test --tests '*ClubMemberGenerationTest*' --tests '*Club*Test*'` GREEN(backend/ 에서, exit code 확인).
- [ ] Step 5: Commit — `feat(backend): 회원 기수 컬럼·설정 추가 — V93·엔티티(use_generation 표시 제어 전용)`

### Task 2: 멤버 목록·export 응답 확장 (generation + feeStatus 단일 쿼리)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/clubmember/service/dto/query/ClubMemberQuery.java` (+`Integer generation`, +`MemberFeeStatus feeStatus`)
- Modify: `backend/src/main/java/com/duing/domain/clubmember/service/dto/query/ClubMemberExportQuery.java` (동일 2필드 추가)
- Create: `backend/src/main/java/com/duing/domain/clubmember/service/dto/query/MemberFeeStatus.java` — `public enum MemberFeeStatus { PAID, UNPAID, NONE }`
- Modify: 멤버 목록·export 서비스/리포지토리(`ClubMemberRepositoryImpl` 및 소비 서비스 — 실코드 확인 후 해당 조회 경로)
- Modify: 응답 DTO(`ClubMemberResponse`·export response — controller/dto/response) 에 두 필드 노출
- Test: 기존 멤버 목록·export 통합 테스트 파일에 케이스 추가

**Interfaces:**
- Produces: 목록/export 응답에 `generation: Integer|null`, `feeStatus: "PAID"|"UNPAID"|"NONE"`. FE(Task 4)가 소비.
- 회비 판정: Global Constraints 의 확정 규칙. 구현은 **단일 쿼리** — 예: 멤버 목록 조회 시 유저별 최신 비-CANCELLED FeeBill 을 QueryDSL 서브쿼리(또는 `row_number()` 네이티브 대신 `id in (select max(id) ... group by user_id)` 패턴)로 조인. 멤버당 추가 쿼리 금지.

- [ ] Step 1: 실패 테스트 — 시나리오 3종: ①최신 청구 PAID → PAID ②최신 청구 OVERDUE(과거에 PAID 있어도) → UNPAID ③청구 없음/전부 CANCELLED → NONE. + generation 값 반영. + 쿼리 수 가드(Hibernate 통계 또는 로그 카운트로 목록 1~2쿼리 고정 — 레포에 기존 쿼리 카운트 전례 있으면 재사용, 없으면 `SQLStatementCountValidator` 류 없이 통계 API 사용).
- [ ] Step 2: RED → Step 3: 구현(리포지토리 정독 후 기존 QueryDSL 패턴 준수) → Step 4: 관련 스위트 GREEN.
- [ ] Step 5: Commit — `feat(backend): 멤버 목록·export 에 기수·회비 상태 추가 — 최신 청구 단일 쿼리 판정`

### Task 3: 기수 PATCH API + useGeneration 설정 + ClubDetail 노출

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/clubmember/api/ClubMemberApi.java` + controller — `PATCH /leader/clubs/{clubId}/members/{memberId}/generation` (기존 role 변경 경로·권한 패턴 클론; 실제 base path 는 기존 role PATCH 와 동일 프리픽스 사용)
- Create: request record `UpdateMemberGenerationRequest(Integer generation)` — **null 허용**(클리어), 값이 있으면 서비스에서 ≥1 검증(위반 400 "기수는 1 이상의 정수여야 합니다.")
- Modify: 멤버 서비스 — `changeGeneration` 오케스트레이션(권한 `requireEditableClubManager` 계열 기존 그대로, 타 클럽 멤버 404 기존 패턴). **use_generation 검사 없음 — 항상 저장**.
- Modify: `UpdateClubRequest`/`UpdateClubCommand`/`GeneralClubService` — `useGeneration Boolean`(null=미변경, 기존 부분 갱신 패턴), `ClubDetailQuery`/`ClubDetailResponse` 에 `useGeneration boolean` 노출.
- Test: 통합 — PATCH 저장/클리어(null)/0·음수 400/OFF 상태에서도 저장됨/타 클럽 404/MEMBER 권한 403, UpdateClub useGeneration true 반영·null 미변경, ClubDetail 응답 노출.

**Interfaces:**
- Produces: 위 API 2종 — FE(Task 4)가 소비. 시그니처: PATCH body `{"generation": 9}` 또는 `{"generation": null}` → 204.

- [ ] Step 1: 실패 테스트(위 케이스 전부, 기존 통합 테스트 픽스처 재사용) → Step 2: RED → Step 3: 구현 → Step 4: `./gradlew test` **전체** GREEN(exit code 직접 확인).
- [ ] Step 5: Commit — `feat(backend): 회원 기수 수정 API·기수 사용 설정 — 표시 제어 전용 정책`

---

# PR-2: Frontend (`feat/members-redesign-fe` — PR-1 위 스택. Task 4 시작 전 브랜치 생성은 오케스트레이터가 수행)

### Task 4: 타입·클라이언트·훅·스키마 확장

**Files:**
- Modify: `frontend/packages/types/src/club.ts` — `ClubMemberSummary`(목록 타입, 실명 확인)에 `generation: number | null`·`feeStatus: 'PAID' | 'UNPAID' | 'NONE'`, `ClubDetail`에 `useGeneration: boolean`, export 타입에도 동일 반영
- Modify: `frontend/packages/api/src/client.ts` — `updateMemberGeneration(clubId, memberId, payload: { generation: number | null })`, club update payload 에 `useGeneration?: boolean`
- Modify: `frontend/packages/hooks/src/` — `useUpdateMemberGenerationMutation(clubId)`(멤버 목록 invalidate), 기존 club update 훅은 payload 타입 확장만
- Modify: `frontend/packages/schemas/src/index.ts` — club update 스키마에 `useGeneration: z.boolean().optional()`
- Test: `frontend/packages/hooks/test/` 신규 훅 invalidation 계약 테스트(기존 heroActivities.test 패턴)

**Interfaces:**
- Produces: 위 시그니처 그대로 — Task 6~11 이 소비. BE 계약(Task 2·3 응답)과 1:1.

- [ ] TDD → GREEN(`pnpm --filter @duing/hooks test -- --run` + web typecheck) → Commit — `feat(frontend): 회원 기수·회비 상태 타입·API·훅 확장`

### Task 5: 역할 라벨 유틸 + "임원" 표기 교체

**Files:**
- Create: `frontend/apps/web/app/_lib/clubMemberRoleLabel.ts` — `export function clubMemberRoleLabel(role: ClubMemberRole): string` → LEADER 회장 / OFFICER **임원** / MEMBER 부원
- Modify: 회원 관리·admin 회원 문맥의 기존 인라인 표기("운영진" 등)를 유틸로 교체 — `grep -rn "운영진"` 으로 **ClubMember 역할 문맥만** 전수 확인(모집 targetRole·마케팅 문구 등 비-멤버 문맥은 무접촉, 리포트에 교체/보류 목록 기록)
- Test: `frontend/apps/web/test/_lib/club-member-role-label.test.ts` + 교체 파일 기존 테스트 단언 갱신

- [ ] TDD → GREEN(관련 스위트+typecheck) → Commit — `feat(frontend): 회원 역할 라벨 유틸 — OFFICER 표기 임원으로 통일`

### Task 6: 동아리 정보 ⑨ "회원 기수 관리" 스위치

**Files:**
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx` — 신규 `SectionCard number={9} title="회원 기수 관리"`: 스위치(ON/OFF) + 설명 "회원별 기수를 관리해요. 끄면 기수 관련 화면이 숨겨지고, 기존 기수 데이터는 보존됩니다." dirty 비교·payload 는 기존 필드 패턴(변경 시에만 포함) 준수
- Test: `frontend/apps/web/test/manage/club-info-form.test.tsx` 케이스 추가(토글 → payload useGeneration 포함 / 무변경 → 미포함)

- [ ] TDD → GREEN → Commit — `feat(frontend): 동아리 정보에 회원 기수 관리 스위치 추가`

### Task 7: 회원 목록 테이블 + 검색 + 필터 (페이지 코어)

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/members/_components/MemberTable.tsx`(행 포함), `MemberFilterChips.tsx`, `_lib/memberFilters.ts`(순수 함수 — 필터·검색 로직)
- Test: `frontend/apps/web/test/manage/members/member-filters.test.ts`, `member-table.test.tsx`

**Interfaces:**
- Produces: `filterMembers(members, { query, filters, useGeneration }): ClubMemberSummary[]` 순수 함수 — 검색(이름·학과·학번·기수 "N기"·역할 라벨), 필터 조합(역할 3종·회비 미납·최근 가입(`RECENT_JOIN_DAYS = 90` 상수 export)·기수별). `MemberTable({ members, useGeneration, selectedIds, onToggleSelect, onToggleAll, onOpenDetail })` — 컬럼: 체크박스/아바타+이름+학과·학년/역할(clubMemberRoleLabel)/기수(useGeneration 시 "N기", null "—")/회비(납부·미납·"—")/가입일/상세. 전화번호 비노출. 빈 결과 상태(검색어 포함 문구). 결과 수 표시는 페이지(Task 11)가 filterMembers 결과 length 로.
- 필터 정의는 선언적 배열(`{ key, label, predicate }`) — 향후 항목 추가 대비.

- [ ] TDD(필터 조합·검색 대상 5종·기수 OFF 시 기수 검색 제외·컬럼 조건부) → GREEN → Commit — `feat(frontend): 회원 목록 테이블·검색·필터 — 조건부 기수·선언적 필터`

### Task 8: KPI 4종

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/members/_components/MemberKpis.tsx`, `_lib/memberKpis.ts`(순수 계산)
- Test: `frontend/apps/web/test/manage/members/member-kpis.test.ts(x)`

**Interfaces:**
- Produces: `computeMemberKpis(members, useGeneration): Kpi[]` — ①재적 회원(전체 수) ②임원(회장 1·임원 N 서브) ③회비 미납(UNPAID 수) ④ON: "최신 기수" 값 "N기" 서브 "X명"(최고 generation — null 제외, 전원 null 이면 "—") / OFF: "최근 가입" 값 X명(90일). 렌더는 기존 KPI 카드 스타일(모집 관리 RecruitmentKpiRow 전례 참조).

- [ ] TDD(4종 계산·ON/OFF 전환·전원 null 엣지) → GREEN → Commit — `feat(frontend): 회원 KPI — 재적·임원·미납·최신 기수/최근 가입`

### Task 9: 회원 상세 패널 (반응형 3단)

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/members/_components/MemberDetailPanel.tsx`, `_lib/membershipDuration.ts`
- Test: `frontend/apps/web/test/manage/members/member-detail-panel.test.tsx`, `membership-duration.test.ts`

**Interfaces:**
- Produces: `MemberDetailPanel({ member, clubId, useGeneration, open, onClose })` — 데스크탑(lg+) 우측 고정 컬럼, 태블릿(md~lg) shadcn Sheet, 모바일(<md) 풀스크린 Dialog(기존 프리미티브 재사용, 분기는 CSS 우선·필요 시 matchMedia).
  - 기본 정보: 이름·아바타·학과·학년·학번·연락처(+`navigator.clipboard` 복사 버튼, 복사됨 피드백)·가입일·**가입 기간**·기수(조건부)
  - `formatMembershipDuration(joinedAt, now): string` — "2년 4개월"/"3개월"/"이번 달 가입" (now 주입으로 테스트 결정적)
  - 운영 정보: 역할, 회비 상태(🟢 납부/🔴 미납/⚪ 관리 대상 아님) + "회비 관리에서 보기" 링크(`/manage/clubs/{clubId}/fees`)
  - 관리: 역할 세그먼트(기존 role PATCH 훅), 기수 수정(ON — 숫자 입력+저장·비우기, `useUpdateMemberGenerationMutation`), 기존 탈퇴 다이얼로그·회장 이양 트리거 재사용(RemoveMemberDialog·TransferLeaderDialog·SuccessionRequestModal 기능 인벤토리 보존)

- [ ] TDD(가입 기간 경계·복사 호출·조건부 기수·회비 3상태 표기·관리 액션 배선) → GREEN → Commit — `feat(frontend): 회원 상세 패널 — 반응형 3단·가입 기간·회비 상태·관리 액션`

### Task 10: 일괄 선택 + 툴바

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/members/_components/MemberBulkToolbar.tsx`, `_lib/runBulkMemberAction.ts`
- Test: `frontend/apps/web/test/manage/members/member-bulk.test.tsx`

**Interfaces:**
- Produces: `runBulkMemberAction(memberIds, action: (id) => Promise<void>): Promise<{ succeeded: number; failed: { id, message }[] }>` — 순차 실행(동시 폭주 방지), 부분 실패 수집. `MemberBulkToolbar({ selectedIds, useGeneration, onDone })` — 임원 승급/부원 강등(기존 role PATCH)/기수 변경(ON — 입력 다이얼로그 후 일괄)/탈퇴(위험색, ConfirmDialog 경유). 진행 중 표시 + 완료 시 "N명 처리, M명 실패" 요약(실패 사유 목록). 회장(LEADER)은 승급/강등/탈퇴 대상에서 제외(기존 단건 정책 준수 — 선택돼 있으면 스킵하고 요약에 표기).

- [ ] TDD(부분 실패 요약·LEADER 스킵·순차 실행) → GREEN → Commit — `feat(frontend): 회원 일괄 작업 — 단건 반복·부분 실패 요약`

### Task 11: CSV 필터 기준 + 페이지 조립

**Files:**
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/members/_components/MemberCsvDownloadPopover.tsx` — 현재 필터 결과의 memberId 집합을 prop 으로 받아 export rows 필터링, CSV 컬럼 확장(기수 ON 시 기수·회비 상태), 팝오버에 "현재 필터 기준 N명" 안내
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/members/page.tsx` — 전면 재작성: KPI → 툴바(필터·검색·결과 수) ↔ 선택 시 벌크 툴바 전환 → MemberTable → MemberDetailPanel. 기존 MemberSection/MemberRow 삭제(기능 인벤토리 — 회장 이양·승계 요청·탈퇴·CSV — 신규 구조로 전부 이관 확인 후). `useGeneration` 은 기존 club detail 쿼리에서.
- Test: `frontend/apps/web/test/manage/members/members-page.test.tsx`(MSW 조립 — ON/OFF 렌더 전환·결과 수·상세 열기), CSV 테스트 갱신

- [ ] TDD → GREEN → **전체 검증**: `pnpm --filter @duing/web test -- --run` 전체 + typecheck + lint + CI-env build(전부 exit code 확인) → Commit — `feat(frontend): 회원 관리 페이지 조립 — 운영 허브 리디자인`

### Task 12: 실브라우저 QA

- [ ] 서버 기동(레포 절차) 후: ①기수 토글 실전환(정보 페이지 ON→회원 페이지 컬럼·필터·KPI·상세·입력 등장 / OFF→전부 소멸·데이터 보존 확인) ②검색·필터 조합·결과 수 ③상세 패널 반응형 3단(1440/900/390) ④연락처 복사 ⑤일괄 작업(승급→강등 원복, 부분 실패 시나리오) ⑥CSV 필터 기준 다운로드 내용 검증 ⑦회비 상태 표기(가능하면 청구 있는 클럽) ⑧기존 기능 회귀(회장 이양·탈퇴). QA 데이터 원복. 스크린샷 `.superpowers/sdd/qa5/`.
- [ ] Commit 없음(문제 시 해당 Task 복귀).
