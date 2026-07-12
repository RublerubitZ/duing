# 문의 본문·첨부·알림 파기 배치 (P3-②) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** 삭제된 총동연 1:1 문의의 PII를 보관기간 경과 후 파기한다 — 문의 제목/본문/종결사유·답변 본문은 placeholder로 비우고(행 보존), 첨부는 스토리지 객체와 행을 함께 제거하며, 문의 알림은 기존 30일 파기 잡을 prod에서 활성화해 소멸시킨다. 스펙 §4가 선기록한 "PiiRetentionJob 대상 하드코딩 — 신규 테이블 자동 미포함, P3 파기 배치 설계 시 notification 포함" 요구의 이행. PR 1개(백엔드 PR17, FE 없음).

**Architecture (핵심 설계 결정):**

- **파기 대상 = soft-delete 경과분만.** `federation_inquiry.deleted_at < cutoff`인 문의의 title/content/closed_reason + 그 문의에 딸린 답변 content + 첨부(행·스토리지 객체), 그리고 교체로 고아가 된 첨부(`attachment.deleted_at < cutoff`). **삭제되지 않은 ANSWERED/CLOSED 문의의 본문 잔존은 Out of Scope** — 스펙 §4의 "작성자 익명화+본문 잔존 비대칭은 운영 결정 문서에 명시" 요구대로 PR 본문에 비대칭을 명시하고 운영 결정(보관기간 정책 확정) 후 후속.
- **soft-delete 엔티티는 UPDATE 파기(행 보존), 첨부 행만 물리 DELETE.** 리포 규약(파기 잡의 물리 삭제 예외 = soft-delete 개념이 없거나 보관 가치가 없는 데이터 + javadoc 정당화 필수, email_verifications·notification 전례): 문의/답변은 감사 이력 보존을 위해 placeholder UPDATE(`(보관기간 경과로 파기된 문의입니다)` 등 — CHECK 제약 내 고정 문구, users 익명화 전례), 첨부 행은 스토리지 키가 유일한 가치라 **객체 삭제 성공 후 행 물리 DELETE**(실패 시 행 보존 → 다음 실행 재시도 — 멱등 재시도 큐 역할).
- **스토리지 삭제는 트랜잭션 밖 best-effort, 행 삭제는 개별 짧은 트랜잭션.** 외부(R2/로컬) 호출을 DB 트랜잭션 안에 두지 않는다(GeneralBankTransactionSyncService fetch-then-persist 전례). 첨부 파기는 per-item: `toFileUrl(storageKey)`(이 배치를 위해 준비된 훅 — javadoc 명시) → `fileStorageService.delete(url)` → 성공 시 행 DELETE. 문의/답변 scrub은 PII 잡처럼 네이티브 벌크 UPDATE 단일 트랜잭션(@SQLRestriction이 soft-delete 행을 가리므로 nativeQuery 필수 — PiiRetentionJob 전례).
- **멱등 가드 = placeholder 불일치 조건.** 신규 컬럼/마이그레이션 없이 `WHERE ... AND content <> :placeholder`(ApplicationRepository.scrubExpiredApplicationAnswers의 `answers <> '[]'::jsonb` 전례). 첨부는 행 삭제 자체가 멱등.
- **잡 구조 = PiiRetentionJob 패턴 완전 미러**: `domain/federation/job/FederationInquiryPurgeJob` — 빈 상시 등록 + 내부 `properties.enabled()` 런타임 가드 + window 0/음수 오설정 no-op 가드, `@ConfigurationProperties("duing.federation-inquiry.purge")` record(enabled, window 기본 P45D — 개인정보 처리방침 45일 준용, PII 잡과 동일), 자체 `@Configuration @EnableScheduling @ConditionalOnProperty` Config + 무조건 등록 Properties Config. 스케줄 `0 40 4 * * *` Asia/Seoul(PII 04:30·알림 파기 05:00 사이). seoulClock 주입.
- **notification은 중복 구현하지 않는다** — 문의 알림(dedupKey `FEDERATION_INQUIRY_*`)의 제목 잔존은 기존 `NotificationRetentionJob`(30일 물리 삭제)이 이미 커버하는 표면인데, **prod 프로파일에 retention 오버라이드가 없어 기본 false로 꺼져 있는 운영 갭**이 진짜 문제다. `application-prod.yml`에 `duing.notification.retention.enabled: ${DUING_NOTIFICATION_RETENTION_ENABLED:true}`를 다른 잡들과 동일한 하드코딩 관례(사일런트 결손 방지 주석 포함)로 추가한다. 신규 파기 잡의 prod 기본값도 같은 관례로 true.
- **트랜잭션 배치**: run()은 @Transactional 없이 — ① scrub 벌크 2건(문의·답변)은 TransactionTemplate 단일 짧은 트랜잭션, ② 첨부 per-item(외부 호출 → 성공 시 행 삭제)은 item별 처리(개별 실패는 warn 후 계속 — DeadlineNotificationJob 루프 전례), 완료 카운트 로깅(PII 잡 로깅 관례).

**레퍼런스:** `PiiRetentionJob`(+Config/Properties/Test — 구조 전체 미러 대상), `ApplicationRepository.scrubExpiredApplicationAnswers`(멱등 scrub), `EmailVerificationRepository.deleteExpiredVerifications`(파기 잡 물리 DELETE 예외 전례), `NotificationRetentionJob`(+prod yml 갭), `FileStorageService.toFileUrl/delete`(준비된 훅·best-effort 의미론), `GeneralFederationInquiryService.replaceAttachments`("고아 객체 정리는 후속 파기 배치 몫" 주석 — 이 배치가 그 후속), 잡 테스트 관례(JdbcTemplate 백데이트·상대날짜·플래그 off 수동 생성 no-op·멱등 2회 실행·wiring 테스트)

---

## PR17 — backend (`feat/federation-inquiry-purge-job`)

### Task 1: 파기 잡 + prod 알림 파기 활성화

- [ ] `FederationInquiryPurgeProperties` record(enabled, @NotNull Period window) — prefix `duing.federation-inquiry.purge`, base yml `${DUING_FEDERATION_INQUIRY_PURGE_ENABLED:false}`/`${DUING_FEDERATION_INQUIRY_PURGE_WINDOW:P45D}`(45일 근거 주석), prod yml enabled 기본 true(관례 주석)
- [ ] Config 2개: PropertiesConfig(무조건 등록 — PII 전례 주석) + PurgeJobConfig(@EnableScheduling + @ConditionalOnProperty)
- [ ] 리포지토리 네이티브 쿼리 (전부 @Modifying(clearAutomatically = true), soft-delete 행 접근이라 nativeQuery 필수 주석):
  - `FederationInquiryRepository.scrubExpiredDeletedInquiries(cutoff, placeholderTitle, placeholderContent)` — `UPDATE federation_inquiry SET title=:pt, content=:pc, closed_reason=NULL WHERE deleted_at < :cutoff AND content <> :pc` (int 반환)
  - `FederationInquiryAnswerRepository.scrubAnswersOfExpiredInquiries(cutoff, placeholder)` — `UPDATE federation_inquiry_answer a SET content=:p FROM federation_inquiry i WHERE a.inquiry_id=i.id AND i.deleted_at < :cutoff AND a.content <> :p` (답변 자체 deleted_at 무관 — 문의가 파기되면 답변도)
  - `FederationInquiryAttachmentRepository.findPurgeTargets(cutoff)` — 네이티브 SELECT (id, storage_key): `attachment.deleted_at < :cutoff`(교체 고아) OR `inquiry.deleted_at < :cutoff`(파기 문의의 첨부, 행 live 포함) — 인터페이스 projection 또는 Object[] 
  - `FederationInquiryAttachmentRepository.hardDeleteById(id)` — 네이티브 DELETE, javadoc 정당화(파기 잡 한정 예외: 스토리지 객체 제거 후 키만 남은 행은 보관 가치 없음, email_verifications 전례)
- [ ] `FederationInquiryPurgeJob`: `@Scheduled(cron="0 40 4 * * *", zone="Asia/Seoul")` run() — enabled/window 가드 → TransactionTemplate로 scrub 2건 → 첨부 타깃 조회 후 per-item(toFileUrl → delete best-effort → 성공 시 hardDeleteById, 실패는 warn+skip → 다음 실행 재시도) → 카운트 로깅. placeholder 상수는 잡에 정의(제목 "(파기된 문의)", 본문/답변 "(보관기간 경과로 파기되었습니다)" — CHECK 제약 확인)
- [ ] `application-prod.yml`: notification retention enabled 기본 true 추가(누락 갭 봉합 — 주석에 근거)
- [ ] 테스트 (PiiRetentionJobTest 패턴 미러, `@SpringBootTest(properties = {enabled=true, window=P45D})` + IntegrationTestBase + JdbcTemplate 백데이트·상대날짜):
  ① 46일 전 삭제 문의 → scrub(제목·본문·종결사유 NULL) + 답변 scrub + 첨부 행 삭제·스토리지 delete 호출 / 10일 전 삭제 문의 → 무변경 (경계 쌍)
  ② 삭제 안 된 문의는 window 경과와 무관하게 무변경 (Out of Scope 계약 잠금)
  ③ 멱등: 2회 실행 시 두 번째는 무변경(scrub 카운트 0)
  ④ 교체 고아 첨부(문의 live, attachment.deleted_at 경과) → 객체·행 파기
  ⑤ 스토리지 delete 실패(mock 예외) → 행 보존(다음 실행 재시도) + 잡은 계속 진행
  ⑥ 플래그 off 수동 생성 no-op / window ZERO no-op (PII 전례)
  ⑦ wiring: purge 플래그만 켜면 잡 빈 등록 + 타 잡 빈 부재 (PrivacyRetentionSchedulingWiringTest 전례)
  — FileStorageService는 @MockitoBean(외부 경계 — 호출 인자·실패 시나리오 제어), 검증은 JdbcTemplate raw SQL(@SQLRestriction 우회)
- [ ] 전체 `./gradlew test` green → Commit `feat(backend): 문의 본문·첨부 파기 배치 (45일·prod 알림 파기 활성화)`

### Task 2 (게이트): spec 리뷰 + duing-code-reviewer + codex adversarial(파기 대상 정확성·멱등·외부 호출 경계·물리 삭제 정당성 — 데이터무결성 필수 트리거) → 반영 → push → PR17

## Out of Scope
- 미삭제 ANSWERED/CLOSED 문의의 본문 파기(보관기간 운영 결정 후 — 비대칭을 PR 본문에 명시), 클럽 사진 등 타 도메인 스토리지 고아 정리(ClubPhoto "Phase 5" 주석 별도), notification 파기 로직 신규 구현(기존 잡 활성화로 갈음), deleted_at 스캔 인덱스(소량 테이블 YAGNI)

## Self-Review
- 스펙 §4 선기록(신규 테이블 자동 미포함 → 전용 배치, notification 포함) 이행 — notification은 기존 잡의 prod 활성화가 스펙 의도(제목 잔존 소멸)를 더 적은 코드로 충족.
- 물리 DELETE는 첨부 행 한정 + 객체 삭제 성공 조건 + javadoc 정당화 — CLAUDE.md 금지 규약의 확립된 예외 경로.
- 실패 재시도: 스토리지 삭제 실패 시 행이 남아 다음 실행이 자연 재시도 — 별도 재시도 큐 불요.
- prod 기본 true는 "prod 잡 기본 활성 함정" 메모리에 기록된 의도된 관례(사일런트 결손 방지)와 일치 — PR 본문에 명시해 배포 시 인지시킴.
