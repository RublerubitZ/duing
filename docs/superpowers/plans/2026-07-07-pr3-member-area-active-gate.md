# PR-3: 멤버 내부 영역 나머지 ACTIVE 게이트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox 문법.

**Goal:** PR-2 에서 신설한 `ClubAuthService.requireActiveMember` 를 나머지 멤버 내부 영역 조회에 적용해, 비 ACTIVE 동아리의 기존 멤버가 공지·일정·멤버십 정보를 직접 API 로 조회할 수 없게 한다 (403 + 상태별 메시지). 스펙 Part B 완결.

**대상 (requireMember/resolveMembership 전수 grep, 2026-07-07 확정):**
| 파일 | 라인 | 엔드포인트 | 교체 |
|---|---|---|---|
| `clubevent/controller/ClubEventReadController.java` | :33, :42 | 멤버용 일정 조회 2개 | requireMember → requireActiveMember |
| `notice/controller/LeaderClubNoticeController.java` | :37, :49 | 멤버용 공지 조회 2개 | requireMember → requireActiveMember |
| `clubmember/controller/ClubMembershipController.java` | :29 | `GET /clubs/{clubId}/membership` (멤버 페이지 접근 판정) | resolveMembership → requireActiveMember |

- `resolveMembership` 메서드 자체는 유지 (제거 금지 — 인터페이스 안정성).
- 상태별 메시지·예외(NotActiveClub)는 PR-2 산출물 재사용 — 신규 예외/메시지 없음.
- 운영진/리더 경로(requireManager/requireLeader)는 Part C(PR-4) — 변경 금지.

**Out of Scope:** 리더 쓰기 게이트(PR-4), FE 변경(멤버 페이지는 403 을 기존 비멤버 UX 로 처리), 메시지 신규 정의 없음.

---

## Task 1: 5개 호출부 교체 + 테스트 (TDD)

- [ ] **Step 1: 실패하는 테스트** — 각 컨트롤러의 기존 테스트 파일(구현 시 grep 확정)에 INACTIVE 케이스 1개씩 추가: ACTIVE 동아리+멤버십(+공지/일정 데이터) 셋업 → 직접 SQL 로 club 만 INACTIVE 전환 → 조회 → **403 + "운영 종료된 동아리입니다."** (상태 3종 전수와 메시지 매핑은 PR-2 의 NotActiveClub·FeeAccount 테스트가 이미 고정 — 여기선 게이트 연결 검증만). membership 엔드포인트도 동일 1케이스.
- [ ] **Step 2: 실패 확인** (200 반환)
- [ ] **Step 3: 구현** — 5개 호출부 한 줄씩 교체 (import 불필요 — 같은 clubAuthService 메서드 호출)
- [ ] **Step 4: 통과 확인** — clubevent/notice/clubmember 도메인 테스트 + BUILD SUCCESSFUL
- [ ] **Step 5: 커밋** — `feat(backend): 비 ACTIVE 동아리 멤버 내부 영역(공지·일정·멤버십) 조회 차단`

## Task 2: 전체 테스트 + PR
- [ ] `./gradlew test` BUILD SUCCESSFUL, self-check 7항목, push + PR (머지 금지)

**리뷰 파이프라인:** implementer → spec reviewer → duing-code-reviewer → codex 리뷰(권한 — 적대 관점 포함). PR-2 와 동일 패턴의 기계적 확장이라 별도 adversarial 세션은 생략하고 codex 리뷰에 우회 경로 점검을 포함.
