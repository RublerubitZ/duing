# 어드민 백엔드 Critical/Major 정합 수정 — Spec

작성일: 2026-05-21
대상 영역: `backend/src/main/java/com/duing/domain/**` 의 어드민(`/api/v1/admin/**`) 컨트롤러 7종 및 관련 서비스
관련 기준: `backend/CLAUDE.md`, `backend/AGENTS.md`

---

## 1. 배경

어드민 영역(9개 도메인 / 30개 엔드포인트)을 컨벤션 기준으로 전수 리뷰한 결과, Critical 2건·Major 4건·Minor 1건이 식별됐다. 프론트는 현재 동아리 관리·공지 관리 2개 도메인만 이 어드민 API 를 소비하지만, **나머지 7개 도메인 프론트 구현이 곧 진행될 예정**이므로 이를 시작하기 전 백엔드 정합성을 안정화한다.

---

## 2. 목표

1. 회장 강제 지정 동시성 결함을 DB·애플리케이션 이중 방어로 차단
2. 도메인 예외 의미 오용 해소 — 클럽 부재를 `ClubException` 으로 정상화
3. `@Valid` 누락으로 인한 Bean Validation 미동작 5건 보강
4. DDD 레이어 위반(Controller→Repository 직접 의존) 6개 컨트롤러 정리 — Service Query DTO 패턴으로 통일
5. 페이지 항목별 N+1 조회 3건 일괄 제거 (`findAllById` + Map 인덱싱)

---

## 3. 비-목표 (Out of Scope)

- **프론트 어드민 미구현 7개 도메인 구현** — 별도 spec 으로 진행 (이 작업의 안정화 이후 시작)
- 어드민 외 영역(예: 학생 사용자용 동아리 조회) 의 동일 컨벤션 위반 — 본 spec 에서는 어드민만 다룬다
- 권한 모델 자체 변경(예: ADMIN 세분화) — 현행 `hasRole('ADMIN')` 유지
- 새로운 어드민 기능 추가 — 기존 동작은 유지하며 내부 구조만 정리
- 어드민 외 도메인의 N+1 / @Valid 누락 점검 — 별도 작업
- 성능 측정·튜닝(인덱스 추가 등) 은 본 작업 범위 아님 (단, PR1 의 UNIQUE 부분 인덱스는 정확성 목적이므로 포함)

---

## 4. PR 분할 시퀀스

총 7 PR. 각 PR 은 독립 머지 가능하나, **권장 머지 순서는 아래와 같다**.

### PR 1 — `fix/admin-leader-assignment-safety` 🔴
**회장 강제 지정 동시성 + 예외 타입 정합**

- Flyway 마이그레이션: `club_member` 에 부분 UNIQUE 인덱스 추가
  - `CREATE UNIQUE INDEX uq_club_member_leader ON club_member(club_id) WHERE role = 'LEADER'`
  - 마이그레이션 직전 사전 검증 SQL 추가 (운영 데이터에 중복 LEADER 존재 시 마이그레이션 실패 → 수동 보정 후 재시도)
- `GeneralAdminLeaderAssignmentService` — 기존 비관적 락은 유지하되 `DataIntegrityViolationException` catch → 도메인 예외 변환
  - 신규 예외: `ClubMemberException.LeaderAlreadyExistsException` (혹은 기존 적합 예외 재사용 — 구현 시 확인)
- `AdminLeaderSuccessionController.assign`, `listMemberHistory` — 클럽 존재 검증을 Service 로 이동, 실패 시 `ClubException.ClubNotFoundException`
- 테스트: `@SpringBootTest` 기반 동시성 테스트 1건 (`CountDownLatch` 로 2 스레드 경쟁 → 한 건만 성공)

### PR 2 — `fix/admin-valid-annotation` 🟡
**`@Valid @RequestBody` 누락 5건 일괄**

대상 컨트롤러:
- `AdminNoticeController`
- `AdminPromotionController`
- `AdminPromotionRequestController`
- `AdminRecertificationRequestController`
- `AdminRecertificationRoundController`

각 메서드 파라미터에 `@Valid @RequestBody` 명시. 컨트롤러당 "필수 필드 누락 시 400" 케이스 1건씩 acceptance 테스트에 추가.

### PR 3-1 — `refactor/admin-recertification-layering` 🟡
**재인증 도메인 리팩토링 + 공통 상수 추출**

- `AdminRecertificationRequestController` — Repository 5종 주입 제거. Service 에 `getRequestDetail(requestId)`, `listRequests(filter, pageable)`, `getRecertificationStatus()` 추가 (조합 조회·N+1 제거 포함)
- `AdminRecertificationRoundController` — `UserRepository` 주입 제거. `listRounds` 의 라운드별 사용자 조회를 `findAllById` 1회로
- 공통 상수 추출: `global/constant/AdminLabels.DELETED = "(삭제됨)"` 신설 (이 PR 에서 신설하고 후속 PR 들이 import)
- Query DTO 추가: `RecertificationRequestDetailQuery`, `RecertificationRoundListQuery` (Service→Controller 전달용 record)

### PR 3-2 — `refactor/admin-leader-succession-layering` 🟡
**회장 승계 도메인 리팩토링**

- `AdminLeaderSuccessionController` — Repository 4종 제거. Service 에 `listRequests`, `getRequestDetail`, `listMemberHistory(clubId, pageable)` 추가
- `clubName(...)` / `toSummaryUserRef(...)` 의 건별 `findById` 제거 → `findAllById` 일괄 조회 + Map 인덱싱
- `AdminLabels.DELETED` import 로 중복 상수 제거

### PR 3-3 — `refactor/admin-promotion-layering` 🟡
**홍보 도메인 리팩토링**

- `AdminPromotionController` — Repository 2종 제거. Service 에 `listPromotions(filter, pageable)` 추가
- `AdminPromotionRequestController` — Repository 2종 제거. Service 에 `getRequestDetail`, `listRequests` 추가
- `AdminLabels.DELETED` 사용

### PR 3-4 — `refactor/admin-report-layering` 🟡
**신고 도메인 리팩토링 + N+1 제거**

- `AdminReportController` — Repository 3종 제거. Service 에 `getReports`, `getReportDetail` 추가
- `resolveTargetLabel` 의 건별 조회 → 대상 타입별 ID 묶음 일괄 조회 + Map 인덱싱
- `AdminLabels.DELETED` 사용

### PR 4 — `chore/notice-admin-test-displayname` 🔵
- `NoticeAdminAcceptanceTest` 의 한국어 `@DisplayName` 보강

---

## 5. 공통 리팩토링 패턴 (PR 3-1 ~ 3-4 공통)

```
[변경 전]
@RestController
class AdminXxxController(
    private val svc: XxxService,
    private val repoA: ARepository,   // 제거 대상
    private val repoB: BRepository,   // 제거 대상
) {
  fun list(...) = svc.list(...).map { row ->
      val a = repoA.findById(row.aId).orElse(...)   // N+1
      val b = repoB.findById(row.bId).orElse(...)   // N+1
      XxxResponse.from(row, a, b)
  }
}

[변경 후]
@RestController
class AdminXxxController(
    private val svc: XxxService,   // 단일 의존성
) {
  fun list(...): PageResponse<XxxResponse> =
      svc.listXxx(filter, pageable).map(XxxResponse::from)
}

class XxxService(
    private val repoA: ARepository,
    private val repoB: BRepository,
) {
  @Transactional(readOnly = true)
  fun listXxx(filter, pageable): Page<XxxListQuery> {
      val page = repo.search(filter, pageable)
      val aMap = repoA.findAllById(page.map { it.aId }.toSet()).associateBy { it.id }
      val bMap = repoB.findAllById(page.map { it.bId }.toSet()).associateBy { it.id }
      return page.map { XxxListQuery.of(it, aMap[it.aId], bMap[it.bId]) }
  }
}
```

- Service 메서드는 Query DTO(record) 반환 — 도메인 엔티티 직접 노출 금지
- `@Transactional(readOnly = true)` 명시
- Controller 는 Response 변환만 담당

---

## 6. 테스트 전략

- **PR 1**: 동시성 테스트 1건 (필수) + 기존 acceptance 테스트 유지
- **PR 2**: 각 컨트롤러에 "필드 누락 시 400" 케이스 1건씩
- **PR 3-1~4**: 기존 acceptance 테스트가 모두 통과하는 것을 회귀 보증으로 사용 (행위 변경 없음). 신규 테스트는 추가하지 않음 — 이 PR 들은 순수 내부 리팩토링
- **PR 4**: 테스트 변경 없음

---

## 7. 머지 순서 및 의존성

```
PR 1 (Critical) ─┐
PR 2 (@Valid)   ─┼─→ 독립 머지 가능
PR 4 (chore)    ─┘

PR 3-1 (공통 상수 신설) ── PR 3-2 ─┐
                          ── PR 3-3 ─┼─→ PR 3-1 이후 병렬 가능
                          ── PR 3-4 ─┘
```

PR 3-1 머지 후 3-2/3/4 는 충돌 없이 병렬 진행 가능. PR 1/2/4 는 PR 3 시리즈와 무관하게 진행.

---

## 8. 컨벤션 준수 self-check (PR 직전)

각 PR 머지 직전 확인:
1. 브랜치명 `{type}/{설명}` 규칙 일치 (이슈번호 미부여)
2. 커밋 메시지 `feat(backend): ...` Conventional Commits, Claude 어트리뷰션 라인 없음
3. PR 본문 — 🚀 작업 내용 / 🤔 고민 / 💬 리뷰 중점, 파일 나열 금지
4. `backend/CLAUDE.md` 의 DDD 레이어 / 트랜잭션 / 예외 규칙 위반 없음
5. Out of Scope 항목 미포함 확인
6. 시크릿/하드코딩 환경변수 없음
7. acceptance 테스트 전부 통과 (`./gradlew test`)
