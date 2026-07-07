# FAQ 카테고리 삭제 + 일괄 이관 (P3-①) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** admin이 FAQ 카테고리를 삭제할 수 있게 한다 — 비어 있으면 즉시 soft delete, FAQ가 남아 있으면 `moveToCategoryId`로 일괄 이관 후 삭제(미지정 시 409). admin 카테고리 관리(생성·수정·순서)의 마지막 구멍을 봉합한다(스펙 §8 P3 "카테고리 삭제(+moveToCategoryId 일괄 이관)"). PR 2개(백엔드 PR15 → 프론트 PR16).

**Architecture (핵심 설계 결정):**

- **상태코드는 409로 통일** — 스펙 본문(§4 "행 잠금 후 FAQ 존재 검사"·§8 "FK RESTRICT+409")과 API 표(400)가 상충하는데, "사용 중이라 삭제 불가"는 선행조건 위반이므로 409가 리포 전례(FeePolicy `DeleteForbidden`·Recruitment `ApplicationsExist` — 모두 대안 안내 메시지 포함 409)와 일치한다. API 표 쪽을 사문화한다.
- **PESSIMISTIC_WRITE 행 잠금 — 스펙이 예약해둔 요구** — `FederationFaq.categoryId`는 의도적 Long 참조(연관관계 금지)이고 엔티티 주석이 "삭제 경합 잠금(PESSIMISTIC_WRITE)은 카테고리 삭제 기능 도입 시 함께 들어간다(스펙 §4)"로 못 박아뒀다. 소프트 삭제라 DB FK(NO ACTION)는 실질 방어가 아니므로:
  - 삭제 트랜잭션: 원본(이관 시 대상 포함) 카테고리 행을 `@Lock(PESSIMISTIC_WRITE)` 조회로 잠근 뒤 FAQ 존재 검사 → 이관 → soft delete.
  - **FAQ 생성/수정의 `requireCategory`도 잠금 조회로 강화** — 잠그지 않으면 "존재 검사 통과 → 삭제 커밋 → 고아 FAQ 삽입" 레이스가 남는다. 잠그면 두 시나리오 모두 수렴: 생성이 먼저면 삭제가 대기 후 FAQ를 보고 409, 삭제가 먼저면 생성이 대기 후 @SQLRestriction에 걸러진 빈 결과로 404. 카테고리는 ≤10행 소량 테이블이라 경합 비용 무시 가능.
  - **이관 시 두 행 잠금은 id 오름차순으로 획득** — A→B 삭제와 B→A 삭제가 동시에 돌 때의 교착 방지.
- **일괄 이관은 JPQL 벌크 UPDATE** — `@Modifying(flushAutomatically = true, clearAutomatically = true) UPDATE FederationFaq SET categoryId = :target WHERE categoryId = :source AND deletedAt IS NULL` (Recruitment.softDeleteByIds 전례). "JPQL 벌크 금지"는 @Version 낙관락을 우회하는 FederationInquiry 한정 규칙 — FederationFaq는 @Version이 없어 해당 없음(주석으로 근거 명시). JPQL은 관례대로 `deletedAt IS NULL`을 명시(암묵 @SQLRestriction 의존 금지).
- **soft-deleted FAQ는 이관하지 않는다** — 보이지 않는 행이고 복구 기능도 없으며, 삭제된 카테고리 참조는 이름 해석이 전부 null 허용(categoryNameMap 미포함 → null 직렬화)이라 안전. 문서화만.
- **정렬 영향 없음** — FAQ 정렬은 전역(sort_order)이라 이관해도 재배열 불필요. PUT order의 전체 집합 계약과도 무관.
- **삭제 후 이름 재사용은 이미 성립** — 이름 유니크가 partial index(`WHERE deleted_at IS NULL`)라 soft delete 후 같은 이름 생성 가능. 회귀 테스트로 잠근다.
- **마지막 카테고리 삭제 허용** — 비어 있으면 삭제 가능. 이후 FAQ 생성은 requireCategory 404로 자연 차단(admin이 카테고리부터 만들면 됨).

**레퍼런스:** `FederationFaqCategory`(@SQLDelete/@SQLRestriction), `V73` DDL(partial unique·FK NO ACTION), `GeneralFederationFaqService.createCategory/updateCategory/requireCategory`, `GeneralFeePolicyService.delete`(잠금→사용중 409→soft delete 전례), `RecruitmentRepository.softDeleteByIds`(@Modifying 벌크), `FederationFaqAdminAcceptanceTest`(카테고리 409·JsonPath intValue 관례), FE `FaqCategoryManager.tsx`(“삭제는 P2” 주석)·`MemberAssignModal`(선택지 Dialog 전례)·`AdminFaqListPage` 삭제 다이얼로그

---

## PR15 — backend (`feat/federation-faq-category-delete-api`)

### Task 1: 삭제 API + 이관 + 잠금

- [ ] `FederationFaqCategoryRepository`: `@Lock(LockModeType.PESSIMISTIC_WRITE)` `@Query("select c from FederationFaqCategory c where c.id = :categoryId and c.deletedAt is null")` `findByIdForUpdate(Long categoryId)` (FeePolicyRepository 전례)
- [ ] `FederationFaqRepository`: `existsByCategoryId(Long categoryId)` 파생 쿼리(@SQLRestriction이 삭제 FAQ 제외) + `@Modifying(flushAutomatically = true, clearAutomatically = true)` JPQL `reassignCategory(Long sourceCategoryId, Long targetCategoryId)` — WHERE에 `deletedAt is null` 명시
- [ ] 예외 2종(`FederationFaqException` inner): `FederationFaqCategoryInUseException`(409, "FAQ가 있는 카테고리는 삭제할 수 없습니다. 이관할 카테고리를 지정해 주세요." — 대안 안내 패턴) / `InvalidCategoryMoveTargetException`(400, "이관 대상은 삭제하려는 카테고리와 달라야 합니다.")
- [ ] command: `DeleteFederationFaqCategoryCommand(Long categoryId, Long moveToCategoryId)` record
- [ ] `FederationFaqService.deleteCategory(command)` + `GeneralFederationFaqService` 구현(@Transactional 오버라이드):
  1. moveToCategoryId 제공 && categoryId.equals(moveToCategoryId) → 400 (잠금 전 선검증)
  2. 잠금 획득 — 이관 시 두 id를 오름차순 정렬해 `findByIdForUpdate` 순차 호출(교착 방지 주석), 각각 없으면 404 `FederationFaqCategoryNotFoundException`(원본/대상 구분 없이 기존 404 재사용)
  3. 이관 미지정: `existsByCategoryId` → true면 409
  4. 이관 지정: `reassignCategory(source, target)` 벌크
  5. `categoryRepository.delete(category)` soft delete
- [ ] `requireCategory` 강화: `existsById` → `findByIdForUpdate(...).orElseThrow(404)` (레이스 봉합 근거 주석 — 엔티티 주석의 예약 이행)
- [ ] `AdminFederationFaqApi` + `AdminFederationFaqController`: `@DeleteMapping("/admin/federation/faq-categories/{categoryId}")` + `@RequestParam(required = false) Long moveToCategoryId` → 204. @Operation description에 이관 규칙·409/400/404 계약 명시
- [ ] 인수 테스트 (FederationFaqAdminAcceptanceTest에 추가):
  ① 빈 카테고리 삭제 → 204 + 공개 카테고리 목록에서 미노출
  ② FAQ 있는 카테고리를 이관 없이 삭제 → 409
  ③ FAQ 2개+ 있는 카테고리를 moveToCategoryId와 함께 삭제 → 204 + FAQ들의 categoryId 일괄 변경(repository extracting/allMatch 단언) + admin 목록 categoryName 반영 + 원본 카테고리 미노출
  ④ moveToCategoryId == categoryId → 400
  ⑤ 존재하지 않는(또는 삭제된) moveToCategoryId → 404
  ⑥ 존재하지 않는 카테고리 삭제 → 404
  ⑦ 삭제된 카테고리의 이름으로 새 카테고리 생성 → 201 (partial unique 회귀 잠금)
  ⑧ STUDENT 토큰 삭제 시도 → 403
  ⑨ soft-deleted FAQ만 남은 카테고리는 빈 것으로 취급되어 이관 없이 삭제된다 (FAQ 삭제 후 카테고리 삭제 → 204)
- [ ] 전체 `./gradlew test` green → Commit `feat(backend): FAQ 카테고리 삭제 API (일괄 이관·행 잠금)`

### Task 2 (게이트): spec 리뷰 + duing-code-reviewer + codex adversarial(동시성 잠금·벌크 이관 정합·권한 — 필수 트리거) → 반영 → push → PR15

## PR16 — web (`feat/federation-faq-category-delete-web`) — PR15 머지 후

### Task 3: 삭제 버튼 + 이관 다이얼로그

- [ ] 데이터 레이어: types `DeleteFederationFaqCategoryParams`? — client `admin.federationFaqCategories.remove(categoryId, moveToCategoryId?)`(FAQ remove 네이밍 전례) + `useAdminFederationFaqCategoryDeleteMutation`(루트 키 invalidate 관례) + index export
- [ ] `FaqCategoryManager` 각 행에 삭제 버튼(휴지통/× — 위아래 이동 버튼 옆, aria-label "카테고리 삭제") → 새 `FaqCategoryDeleteDialog`(MemberAssignModal 전례로 Dialog 직접 조립): 라디오/select — "이관하지 않고 삭제"(기본) + 다른 카테고리 목록. 확인 시 mutation, 409면 다이얼로그 내 에러("FAQ가 있어 이관할 카테고리를 지정해야 해요") 표시 후 재선택 유도. 파일 상단 "삭제는 P2" 낡은 주석 제거
- [ ] 테스트: 삭제 버튼 노출·다이얼로그 열림·이관 없이 확인 시 mutation 인자·이관 선택 시 인자·409 에러 표시 (+기존 mock 팩토리에 새 훅 추가 필수)
- [ ] 검증 4종 + FE 리뷰 + codex → push → PR16

## Out of Scope
- 카테고리 복구, FAQ '삭제 포함 보기' 토글, 드래그 정렬, 카테고리별 FAQ 개수 사전 표시(다이얼로그에서 409 반응형으로 충분 — 개수 API 추가는 YAGNI)

## Self-Review
- 스펙 §4가 예약한 잠금 설계를 이행하면서 FAQ 생성 경로(requireCategory)까지 같은 트랜잭션 원칙으로 묶어 고아 참조 레이스를 구조적으로 제거 — 잠금 순서 규칙(id 오름차순)으로 교착도 차단.
- 400/404/409의 구분: 자기 자신 이관=400(요청 자체가 모순), 원본/대상 부재=404, 사용 중=409(선행조건) — 리포 전례와 정합.
- 벌크 UPDATE 허용 근거(@Version 부재)를 주석으로 남겨 "JPQL 벌크 금지" 규칙과의 충돌 오해를 예방.
