# 업로드 고아 객체 정리 배치 — 추적 테이블 + 활성화 + dry-run 파기 잡 (확정 스펙)

develop `20e88253` 기준. GitHub 이슈 #791 의 "설계 방향(검토 완료)" 과 "구현 시 필수 보완" 을 그대로 전제로 삼고, 본문은 그 범위 안에서 구현 결정을 확정한다.

## 0. 이슈 확정 사항 (변경 불가 전제)

1. 업로드 추적 테이블 신설(Flyway, additive) — 업로드 시 `PENDING`, 엔티티 연결 시 `ACTIVE` 전환.
2. 스케줄러(1시간 주기)가 24시간 이상 `PENDING` 인 객체를 스토리지에서 삭제. 회당 삭제 상한 500.
3. 삭제 로그는 objectKey·uploadedAt·deletedAt·reason=ORPHAN_OBJECT 만 기록 — 파일명·파일 내용·개인정보 금지.
4. 개별 삭제 실패는 전체를 중단시키지 않고, `FileStorageService.delete()` 미확정(false) 시 행을 유지해 다음 주기 자동 재시도(FederationInquiryPurgeJob 패턴).
5. **활성화 ↔ 삭제 경쟁(TOCTOU)**: 조건부 갱신으로 승자를 정하고, 진 쪽(활성화)은 "만료된 업로드" 명확한 에러로 실패. 실스레드 동시성 테스트 포함.
6. **dry-run 2단계**: 1차 릴리스는 삭제 후보를 로그로만 기록, 오탐 없음 확인 후 실삭제 활성화. 실삭제 플래그 기본 꺼짐.
7. **레거시 grandfather**: 추적 테이블 도입 이전 객체는 신규 업로드만 추적하고 기존 객체는 건드리지 않는다.
8. **NOTICE_BODY 활성화**: 서버가 본문에서 자체 스토리지 URL 을 파싱해 활성화(FE 계약 변경 없음). purpose 9종 전부의 attach 지점을 누락 없이 커버.

## 1. 현 상태 (조사 결과 요약)

| 항목 | 위치 | 현 동작 |
|---|---|---|
| 업로드 API | `FileController.upload` | 레이트리밋(30/분·200/시) → 매직바이트 검증 → `fileStorageService.upload` → `FileUploadResponse(storageKey=url, url=url)`. **두 필드 모두 공개 URL** |
| 스토리지 키 | `S3FileStorageService` | `{purpose.directory()}/{UUID}.{ext}`, `Cache-Control: immutable`. `toStorageKey(url)` 은 자기 publicBaseUrl 프리픽스가 아니면 `null` |
| 삭제 계약 | `FileStorageService.delete(url)` | boolean = 유일한 성공 신호. 미존재 키도 `true`(멱등). 프리픽스 불일치·장애는 `false` |
| 기존 파기 배치 | `FederationInquiryPurgeJob` | 외부 호출은 트랜잭션 밖, 확정된 건만 짧은 tx 로 행 정리, 개별 실패 skip·다음 실행 재시도. 설정은 `config/`(Properties+PropertiesConfig+JobConfig 3분리) |
| 잡 설정 관례 | `application.yml` / `application-prod.yml` | base `enabled:false`, prod `${DUING_*_ENABLED:true}` 하드코딩 |
| 클럭 | `TimeConfig` | `Clock.system(Asia/Seoul)`. prod JVM 은 UTC |
| 시각 컬럼 전례 | `club_view_event`(V119) | `TIMESTAMP WITH TIME ZONE` + 엔티티 `OffsetDateTime`. 그 외 도메인은 `Instant` 필드 다수 |
| 테스트 스토리지 | `StubFileStorageService` | `file.storage.provider=stub`. URL 프리픽스 `/files/stub/`, `toStorageKey`/`toFileUrl` 대칭 |

### 1.1 purpose 9종 × attach 지점 (전수)

| purpose | 저장 필드 | 값 형식 | attach 지점 (전부 `@Transactional` 쓰기 메서드) |
|---|---|---|---|
| LOGO | `club.logo_url` | URL | `GeneralClubService.create` / `applyProfileUpdate`(update·updateAsAdmin 공통) |
| COVER | `club.cover_url` | URL | `GeneralClubService.applyProfileUpdate` |
| PHOTO | `club_photo.storage_key` | **URL**(FE 가 `uploaded.storageKey`=url 을 그대로 보냄) | `GeneralClubPhotoService.create` |
| NOTICE_COVER | `notice.cover_image_url` | URL | `GeneralNoticeService.create` / `update` / `createForClub` / `updateForClub` |
| NOTICE_BODY | `notice.content` 안의 `<img src>`(HTML) 또는 마크다운 | URL 포함 텍스트 | 위 4개 메서드에서 본문 파싱 |
| PROMOTION_BANNER | `promotion.banner_image_url` | URL | `GeneralPromotionService.create` / `update` |
| GLOBAL_EVENT_COVER | `global_event.cover_image_url` | URL | `GeneralGlobalEventService.create` / `update` |
| PROMOTION_REQUEST_BANNER | `promotion_request.suggested_banner_image_url` | URL | `GeneralPromotionRequestService.create` |
| FEDERATION_INQUIRY | `federation_inquiry_attachment.storage_key` | **키**(URL→키 변환 저장) | `GeneralFederationInquiryService.buildAttachments`(create·update 공통) |

`cashbook_entry.attachment_url` 은 엔티티 필드만 있고 쓰기 경로가 없는 미사용 컬럼 — 대상 아님.
관리자가 홍보 요청의 제안 배너 URL 을 홍보 배너로 재사용하는 흐름은 같은 키에 대한 활성화 재호출이라 멱등 처리된다(§3.2).

## 2. 데이터 모델 — `V122__create_uploaded_object.sql`

```sql
CREATE TABLE uploaded_object (
    id           BIGSERIAL PRIMARY KEY,
    storage_key  VARCHAR(500) NOT NULL,
    purpose      VARCHAR(40)  NOT NULL,
    uploader_id  BIGINT       NOT NULL,
    status       VARCHAR(20)  NOT NULL,          -- PENDING | ACTIVE | PURGING | PURGED
    uploaded_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    activated_at TIMESTAMP WITH TIME ZONE,
    purged_at    TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX uq_uploaded_object_storage_key ON uploaded_object (storage_key);
-- 파기 후보 스캔(status IN (PENDING, PURGING) AND uploaded_at < cutoff ORDER BY id) 전용
CREATE INDEX idx_uploaded_object_status_uploaded_at ON uploaded_object (status, uploaded_at);
ALTER TABLE uploaded_object ENABLE ROW LEVEL SECURITY;
```

- `storage_key` 는 공개 URL 이 아닌 **스토리지 키**(`FileStorageService.toStorageKey`)를 저장한다 — publicBaseUrl 이 바뀌어도 추적이 깨지지 않는다.
- `uploader_id` 는 FK 없는 id 슬롯(ClubViewEvent 전례) — 남용 계정 추적용. `users` 는 물리 삭제되지 않으므로 dangling 걱정 없음.
- 시각은 전부 `TIMESTAMPTZ` + 엔티티 `Instant`. cutoff 도 `Instant.now(clock).minus(window)` 로 계산해 KST 클럭·UTC JVM 사이 wall-clock 혼선을 원천 차단한다(FederationInquiryPurgeJob 의 `LocalDateTime` 비교와 달리 새 테이블이라 자유롭게 정한다).
- `BaseEntity` 를 상속하지 않는다(soft-delete·updated_at 불필요, 상태 전이는 명시 컬럼으로). `@SQLRestriction` 없음.
- 물리 삭제·DROP 없음(additive). 레거시 객체(테이블 도입 전 업로드)는 행이 없으므로 자동으로 대상에서 제외된다 — 이것이 §0-7 grandfather 의 구현이다.

### 2.1 상태 전이

```
PENDING ──(attach: activate)──▶ ACTIVE                  (종단. 다시 PENDING 으로 돌아가지 않는다)
PENDING ──(job: claim)────────▶ PURGING ──(storage delete 확정)──▶ PURGED (종단)
PURGING ──(job 재실행: claim)──▶ PURGING                (삭제 미확정 재시도 — 멱등)
PENDING/PURGING ──(job: 참조 발견 = 안전망)──▶ ACTIVE  (§4.3)
```

엔티티 전이 메서드는 전제조건별로 분리한다 — 한 메서드가 두 전제조건을 겸하면 attach 활성화가 PURGING 을 되살려 §0-5 계약이 깨진다.

| 메서드 | 허용 선행 상태 | 결과 | 호출자 |
|---|---|---|---|
| `activate(Instant now)` | `PENDING` 만 | `ACTIVE`, `activatedAt=now` | `UploadedObjectService.activate`(attach). 그 외 상태 판정은 호출자가 먼저 한다(§3.2) |
| `restoreActive(Instant now)` | `PENDING` 또는 `PURGING` | `ACTIVE`, `activatedAt=now` | 잡의 참조 안전망 치유(§4.3) 전용 |
| `markPurging()` | `PENDING` 또는 `PURGING` | `PURGING` | 잡 claim(§4.1) 전용. PURGING→PURGING 은 재시도 멱등. 별도 시각 컬럼 없음 |
| `markPurged(Instant now)` | `PURGING` 만 | `PURGED`, `purgedAt=now` | 잡 삭제 확정 후(§4.1) 전용 |

허용되지 않는 상태에서 호출되면 `IllegalStateException`(프로그래밍 오류 — 호출자가 술어를 먼저 검사하므로 정상 경로에서 발생하지 않는다).

`PURGED` 행은 **삭제하지 않고 남긴다.** 행을 지우면 "만료된 업로드"(진짜 파기됨)와 "레거시"(행이 원래 없음)를 구분할 수 없어, 늦은 attach 가 존재하지 않는 객체 URL 을 조용히 저장하게 된다(깨진 이미지). 남겨두면 attach 가 명확한 400 으로 실패한다(§3.2). PURGED 행의 장기 정리는 Out of Scope(§9).

## 3. 업로드 기록 + 활성화 — `UploadedObjectService` (`global/file/`)

`@Service @Transactional`. 도메인 서비스가 인터페이스 없이 직접 주입한다(`FileUploadRateLimiter` 와 같은 global 컴포넌트 취급).

### 3.1 `recordUpload(String fileUrl, FilePurpose purpose, Long uploaderId)`

- `FileController.upload` 가 `fileStorageService.upload` 성공 직후 호출. 키 = `toStorageKey(url)`; `null` 이면(자기 스토리지 URL 이 아닌 경우 — 정상 구현에선 발생 불가) warn 후 skip.
- `UploadedObject.pending(key, purpose, uploaderId, now)` 저장. 컨트롤러는 트랜잭션이 없으므로 이 호출이 자체 tx.
- 순서는 "스토리지 업로드 → 행 저장". 행 저장(DB) 예외는 **삼키지 않고 전파**한다(500) — DB 가 죽었으면 다른 요청도 실패하므로 정직하게 드러내는 편이 낫다. 이 경우 객체는 미추적 고아로 남는다(레거시와 같은 상태, 현재와 동일). 반대 순서(행 저장 → 업로드)는 업로드 실패 시 객체 없는 PENDING 행이 남는데 delete 멱등(true)으로 무해하나, 응답 URL 을 못 받는 클라이언트 실패 경로가 더 잦으므로 전자를 택한다.

### 3.2 `activate(String... fileUrls)` — attach 지점 공통 진입

각 URL 에 대해:
1. `null`/blank → skip. `toStorageKey(url) == null`(외부 URL·타 스토리지) → skip. 외부 URL 을 막는 것은 이 컴포넌트의 책임이 아니다(공지 커버는 별도 prefix 검증이 이미 있음).
2. `repository.findByStorageKeyForUpdate(key)` — **PESSIMISTIC_WRITE 잠금 조회, 이 tx 안에서 이 엔티티의 유일한 첫 조회**(잠금 조회 규약).
   - 없음 → 레거시(추적 이전 객체) → skip.
   - `ACTIVE` → 멱등 skip(재수정·재사용).
   - `PENDING` → `entity.activate(now)` (dirty → 도메인 tx 커밋 시 flush). 잠금은 도메인 tx 커밋까지 유지되어 그동안 잡의 claim 이 대기한다.
   - `PURGING`/`PURGED` → `FileException.UploadExpiredException` (400, "업로드한 이미지가 만료되었습니다. 다시 업로드해주세요.") → 도메인 tx 롤백. 활성화가 도메인 쓰기와 같은 tx 라서, 도메인 쓰기가 다른 이유로 롤백되면 활성화도 함께 롤백된다(객체는 PENDING 으로 남아 정상 파기 대상 — 올바른 결과).
3. 벌크 JPQL `UPDATE` 를 쓰지 않는다 — `@Modifying(clearAutomatically=true)` 는 호출 도메인 서비스의 영속성 컨텍스트를 비워 detach 사고를 내고, `clearAutomatically=false` 는 후속 조회가 stale 할 수 있다. 엔티티 잠금 조회 + 도메인 메서드가 두 함정을 모두 피한다.

### 3.3 `activateReferencedIn(String content)` — NOTICE_BODY

- `content == null` → skip(수정 시 본문 미변경).
- 포맷(HTML/MARKDOWN)을 파싱하지 않는다. 본문을 `[\s"'<>()\[\],;=]` 경계로 토큰화하고(마크다운 문장 끝의 `,`·`;`·`]` 가 URL 에 붙는 것과 따옴표 없는 `src=URL` 속성이 한 토큰이 되는 것을 막는다) 각 토큰에 `toStorageKey` 를 적용해 non-null 인 것만 `activate`. HTML `<img src="…">`·마크다운 `![](…)`·상대 경로(`/files/…` 로컬) 모두 같은 규칙으로 잡힌다. 외부 URL 은 `toStorageKey` 가 null 이라 자연 제외.
- 토큰은 **`TreeSet`(사전순)** 으로 모아 중복을 제거하고 **잠금 순서를 결정화**한다 — 같은 키 집합을 두 tx 가 서로 다른 순서로 잠그는 ABBA 데드락(같은 사용자의 중복 제출 등)을 0비용으로 없앤다. 문의 첨부 목록도 같은 이유로 `activate` 호출 전에 정렬한다(§3.4).

### 3.4 attach 지점 삽입 위치 (§1.1 의 전수)

각 메서드에서 **엔티티 쓰기 직후, 같은 tx 안에서** 호출한다(순서는 원자성에 영향 없음. 검증 예외가 활성화 예외보다 먼저 나도록 검증 뒤에 둔다).

| 메서드 | 호출 |
|---|---|
| `GeneralClubService.create` | `activate(command.logoUrl())` |
| `GeneralClubService.applyProfileUpdate` | `activate(command.logoUrl(), command.coverUrl())` — `clearLogoImage`/`clearCoverImage` 가 true 여도 URL 이 null 이면 skip 되므로 분기 불필요 |
| `GeneralClubPhotoService.create` | `activate(command.storageKey())` (값은 URL) |
| `GeneralNoticeService.create` / `update` / `createForClub` / `updateForClub` | `activate(command.coverImageUrl())` + `activateReferencedIn(command.content())` |
| `GeneralPromotionService.create` / `update` | `activate(command.bannerImageUrl())` |
| `GeneralPromotionRequestService.create` | `activate(command.suggestedBannerImageUrl())` |
| `GeneralGlobalEventService.create` / `update` | `activate(command.coverImageUrl())` |
| `GeneralFederationInquiryService.buildAttachments` | 루프 밖에서 `activate(attachmentUrls 를 정렬한 배열)` 1회 — create·update(replace) 둘 다 이 메서드를 지난다. 정렬은 잠금 순서 결정화(§3.3) |

`ClubPhoto` 의 값은 URL 이지만 필드명이 storageKey 인 기존 불일치는 이 스펙에서 손대지 않는다(§9).

## 4. 파기 잡 — `UploadPurgeJob` (`global/file/purge/`)

`@Scheduled(cron = "0 20 * * * *", zone = "Asia/Seoul")` — 매시 :20(정각의 ClubMetricRefreshJob 과 분산). 상수 `BATCH_LIMIT = 500`.

### 4.1 실행 흐름

```
run():
  enabled=false → return
  window ≤ 0 → error 로그 후 return (오설정 안전장치, FederationInquiryPurgeJob 전례)
  cutoff = Instant.now(clock).minus(window)
  candidates = repository.findPurgeCandidates(cutoff, PageRequest.of(0, 500))
      -- status IN (PENDING, PURGING) AND uploadedAt < cutoff ORDER BY id ASC
  for candidate in candidates:
      referenced = repository.isReferenced(candidate.storageKey)          -- §4.3
      if !deleteEnabled:                                                     -- dry-run
          log INFO  "[업로드 고아 정리][dry-run] key=… purpose=… uploadedAt=… referenced=…"
          if referenced: log WARN "활성화 지점 누락 의심"
          counters; continue
      if referenced:
          tx { findByIdForUpdate → status∈{PENDING,PURGING} 이면 entity.restoreActive(now) }  -- 안전망 치유(§2.1)
          log WARN "참조가 남아 있어 삭제하지 않고 ACTIVE 로 치유 — 활성화 지점 누락 의심: key=… purpose=…"
          healed++; continue
      claimed = tx { findByIdForUpdate → status∈{PENDING,PURGING} 이면 entity.markPurging(), true; else false }
      if !claimed: activatedMeanwhile++; continue                            -- 그 사이 attach 가 이겼다
      confirmed = deleteFromStorage(toFileUrl(key))                          -- tx 밖. false·예외 모두 미확정
      if confirmed:
          tx { findByIdForUpdate → status==PURGING 이면 entity.markPurged(now) }
          log INFO "[업로드 고아 정리] objectKey=… uploadedAt=… deletedAt=… reason=ORPHAN_OBJECT"
          purged++
      else:
          deleteFailed++                                                     -- PURGING 유지 → 다음 실행 재시도
  log INFO 요약: mode(dry-run|delete), candidates, purged, healed, activatedMeanwhile, deleteFailed, cutoff
```

- 외부 호출(스토리지 delete)은 트랜잭션 밖. DB 갱신은 건당 짧은 `TransactionTemplate` tx.
- **경쟁 정리**: claim 은 `findByIdForUpdate` 로 행을 잠근 뒤 상태 술어를 본다. 활성화(§3.2)가 먼저 잠갔다면 claim 은 도메인 tx 커밋까지 대기했다가 `ACTIVE` 를 보고 skip. claim 이 먼저 커밋됐다면 활성화는 `PURGING` 을 보고 400. 어느 순서든 "삭제된 객체를 가리키는 ACTIVE" 는 생기지 않는다.
- claim 후 크래시 → `PURGING` 으로 남음 → 다음 실행이 `status IN (PENDING, PURGING)` 으로 다시 집어 delete(멱등)를 재시도한다. 별도 복구 경로 불필요.
- 후보 조회는 잡 시작 시 1회(500건 스냅샷). 루프 중 상태가 바뀐 행은 claim 술어가 걸러낸다.
- **중복 실행 가드(이슈 테스트 5)**: 별도 가드를 두지 않는다. Spring 스케줄러는 기본 단일 스레드라 한 인스턴스에서 크론이 겹치지 않고, 겹치더라도(다중 인스턴스·수동 호출) claim 이 잠금+상태 술어로 직렬화되고 스토리지 delete 는 멱등이라 결과가 같다. §8-4 의 "2회 실행 멱등" 테스트가 이 성질을 잠근다.

### 4.2 로그 정책 (§0-3)

- 개별 삭제: `objectKey`, `uploadedAt`, `deletedAt`, `reason=ORPHAN_OBJECT` 만. 파일명·내용·uploaderId 는 로그에 남기지 않는다(uploaderId 는 DB 행에만).
- dry-run 후보 로그도 같은 필드 + `purpose` + `referenced`. 운영자는 이 로그로 (a) 후보 수 추세, (b) `referenced=true` 건수 = 활성화 지점 누락 여부를 본다. **일주일간 `referenced=true` 0건이 실삭제 전환 조건**이다.

### 4.3 참조 스캔 안전망 — `UploadedObjectRepository.isReferenced(storageKey)`

native `SELECT EXISTS(...) OR EXISTS(...) …` 1문장으로 §1.1 의 8개 저장 위치를 전부 본다:

```sql
SELECT EXISTS (SELECT 1 FROM club WHERE logo_url LIKE '%/' || :key OR cover_url LIKE '%/' || :key)
    OR EXISTS (SELECT 1 FROM club_photo WHERE storage_key LIKE '%/' || :key OR storage_key = :key)
    OR EXISTS (SELECT 1 FROM notice WHERE cover_image_url LIKE '%/' || :key OR content LIKE '%/' || :key || '%')
    OR EXISTS (SELECT 1 FROM promotion WHERE banner_image_url LIKE '%/' || :key)
    OR EXISTS (SELECT 1 FROM promotion_request WHERE suggested_banner_image_url LIKE '%/' || :key)
    OR EXISTS (SELECT 1 FROM global_event WHERE cover_image_url LIKE '%/' || :key)
    OR EXISTS (SELECT 1 FROM federation_inquiry_attachment WHERE storage_key = :key)
```

- soft-delete 된 행(`deleted_at IS NOT NULL`)도 참조로 센다 — 보수적. 삭제된 동아리의 로고를 지우는 것은 이 스펙의 목표가 아니다(§9).
- 키는 `{directory}/{UUID}.{ext}` 라 `%`·`_` 가 없어 LIKE 이스케이프 불필요(주석으로 고정). `'%/' || key` 접미 일치는 URL 컬럼의 base 가 무엇이든 맞춘다.
- 후보(≤500/시)에 대해서만 실행하므로 접미 LIKE 의 seq scan 비용은 무시할 수준. `ponytail:` 주석으로 상한을 적는다(후보가 항상 500 을 채우면 전용 참조 테이블로).
- 이 안전망의 역할은 **활성화 지점 누락을 데이터 손실이 아니라 WARN 로그로 바꾸는 것**이다. 새 purpose 가 추가되면 §3.4 와 이 쿼리를 함께 갱신해야 한다(FilePurpose javadoc 에 명시).

## 5. 설정 — `duing.upload.purge`

`UploadPurgeProperties(boolean enabled, boolean deleteEnabled, @NotNull Duration window)` (`@Validated @ConfigurationProperties`). 등록·스케줄링 활성화는 문의 파기 잡과 동일한 3분리:
`UploadPurgePropertiesConfig`(무조건 `@EnableConfigurationProperties`) / `UploadPurgeJobConfig`(`@EnableScheduling` + `@ConditionalOnProperty(enabled=true)`).

| 키 | base `application.yml` | `application-prod.yml` | env |
|---|---|---|---|
| `enabled` | `false` | `true` (다른 잡과 같은 하드코딩 관례) | `DUING_UPLOAD_PURGE_ENABLED` |
| `delete-enabled` | `false` | **`false`** (1차 릴리스 = dry-run) | `DUING_UPLOAD_PURGE_DELETE_ENABLED` |
| `window` | `PT24H` | 상속 | `DUING_UPLOAD_PURGE_WINDOW` |

`delete-enabled` 의 prod `false` 는 "운영 잡은 기본 활성" 관례의 의도적 예외이므로 prod yml 주석에 "1차 릴리스 = dry-run(후보 로그만). 일주일간 `referenced=true` 0건 확인 후 2차 릴리스에서 `true` 로 전환" 을 적는다. 2차 릴리스는 그 기본값을 `true` 로 바꾸는 1줄 PR 이다(env 로도 즉시 전환 가능). 회귀가 보이면 env 로 다시 끈다 — 잡 자체는 계속 돌며 dry-run 로그만 남긴다.

## 6. 예외 계약

`FileException.UploadExpiredException` — `400 BAD_REQUEST`, 메시지 `"업로드한 이미지가 만료되었습니다. 다시 업로드해주세요."`. `code` 없음(FE 분기 요구 없음 — 메시지가 그대로 폼 에러로 표시된다). 어느 attach 경로에서 나든 같은 예외·같은 메시지.

## 7. 프론트엔드

변경 없음. 업로드 응답·attach 요청 계약 불변. 만료 400 은 각 폼의 기존 서버 에러 표시 경로로 노출된다. `NoticeRichEditor` 의 `TODO(orphan-image-gc)` 주석은 이 PR 에서 제거하지 않는다(FE 파일 무변경 원칙; 후속 정리).

## 8. 테스트 (전부 실PG Testcontainers, `IntegrationTestBase`)

1. `FileApiTest` 추가: 업로드 성공 시 `uploaded_object` 에 `PENDING` 행(storage_key=응답 URL 의 키, purpose, uploader_id) 1건. 검증 실패(형식·크기) 시 행 0건.
2. `UploadedObjectServiceTest`: PENDING→ACTIVE / ACTIVE 멱등 / 미추적 키 no-op / 외부 URL no-op / PURGING·PURGED → `UploadExpiredException` / `activateReferencedIn` HTML·마크다운·중복 URL·외부 URL 혼합 / null 본문 no-op / 도메인 tx 롤백 시 활성화도 롤백(TransactionTemplate 안에서 activate 후 `setRollbackOnly`).
3. `UploadActivationAttachPointsTest`: §3.4 표의 **모든 메서드**를 실제 서비스 호출로 태워 상태가 ACTIVE 가 되는지 확인(클럽 create·update(로고+커버)·사진 create·공지 create/update/createForClub/updateForClub(커버+본문)·홍보 create/update·홍보요청 create·행사 create/update·문의 create/update). 각 케이스는 stub 스토리지 URL 로 PENDING 행을 먼저 시드한다. 그리고 RestAssured 로 한 경로(사진 등록 POST)에서 PURGED 키 → 400 + 메시지 계약을 잠근다.
4. `UploadPurgeJobTest` (`@MockitoBean FileStorageService`, FederationInquiryPurgeJobTest 패턴):
   - dry-run(기본): 25h PENDING 이 있어도 delete 미호출·상태 불변. 참조 있는 후보도 불변.
   - delete-enabled: 25h PENDING → PURGED + `delete(toFileUrl(key))` 1회 / 1h PENDING 불변 / 오래된 ACTIVE 불변.
   - 참조 있는 25h PENDING(club.logo_url 로 시드) → ACTIVE 로 치유, delete 미호출.
   - delete `false` → PURGING 유지, 다음 실행에서 재시도·PURGED. delete 예외 → 동일. 나머지 후보는 계속 처리(ORDER BY id 로 순서 고정).
   - 2회 실행 멱등(두 번째 실행 delete 미호출).
   - 상한: 502건 시드 → 1회 500건, 2회 2건.
   - `enabled=false` no-op / `window=PT0S` no-op.
   - 이슈 테스트 4 "이미 삭제된 객체 처리 멱등성" 은 별도 케이스가 아니다 — S3/Local 구현 계약상 미존재 키 `delete` 가 `true` 이므로 정상 경로(mock `delete→true`)와 동형이다. 테스트 주석으로 이 근거를 남긴다.
5. `UploadActivationPurgeConcurrencyTest` (실스레드 + `CountDownLatch` startGate, `@RepeatedTest`): 25h PENDING 1건에 대해 T1=`activate` (TransactionTemplate), T2=`job.run()`(delete-enabled, mock delete→true). 순서 무관 불변식: `(ACTIVE ∧ delete 0회 ∧ T1 정상)` xor `(PURGED ∧ delete 1회 ∧ T1 UploadExpiredException)`. 결정적 케이스 2개 추가: (a) 먼저 PURGING 으로 만든 뒤 activate → 예외, (b) 먼저 ACTIVE 로 만든 뒤 run → delete 미호출.
6. `UploadPurgeSchedulingWiringTest`: `duing.upload.purge.enabled=true` 만으로 JobConfig·Job 빈 등록, 다른 잡 미기동.

## 9. Out of Scope (이번 스펙에서 다루지 않는 것)

- **교체된 이미지 누수**: 수정으로 옛 로고·커버·배너·본문 이미지가 빠져도 ACTIVE 로 남는다. 공지·동아리 삭제 후에도 마찬가지. 별개 누수 — 필요 시 별도 이슈.
- **레거시 객체 일회성 정리(reconciliation)** 및 버킷 리스팅 기반 스캔.
- **PURGED 행의 장기 정리**(행은 작고 증가 속도가 느리다 — 필요해지면 N일 후 삭제 1줄 추가).
- **purpose ↔ attach 지점 정합 검증**(예: PHOTO 로 올린 객체를 LOGO 로 쓰는 것을 막지 않는다). 키 단위 활성화만 한다.
- **R2 인프라**(비밀 첨부 프리픽스 차단·프라이빗 버킷·nosniff 엣지 룰) — 코드 밖.
- **FE 변경**(만료 에러 전용 UX, 편집기 TODO 정리, `ClubPhoto.storageKey` 필드명 정정).
- `cashbook_entry.attachment_url`(미사용 컬럼) 정리.
- 잡 실행 결과의 Slack/Sentry 알림(로그로 충분. 필요 시 후속).

## 10. 리스크 / 체크 포인트

- **최대 리스크 = 활성화 지점 누락으로 실사용 객체 삭제.** 3중 방어: (1) §1.1 전수 표 + `UploadActivationAttachPointsTest` 로 코드 레벨 고정, (2) 1차 릴리스 dry-run 로그의 `referenced=true` 0건 확인, (3) 실삭제 전환 후에도 §4.3 안전망이 참조 객체를 치유·WARN.
- 활성화 잠금은 도메인 tx 길이만큼 유지된다 — 잡의 claim 이 그 시간만큼 대기할 뿐 데드락 요소는 없다(활성화는 uploaded_object 만 잠그고 도메인 행은 그 전에 이미 잠겼거나 잠그지 않는다. 잡은 uploaded_object 만 잠근다).
- `activate` 의 잠금 조회 이전에 같은 tx 에서 `UploadedObject` 를 무잠금으로 읽는 코드가 생기면 잠금이 stale 인스턴스를 돌려준다(잠금 조회 규약). 서비스 외부에서 `UploadedObjectRepository` 를 읽지 않는다 — 주입 지점은 `UploadedObjectService`·잡·테스트뿐.
- 배포 순서: V122 은 additive 라 구 이미지와 공존. 잡은 prod 기본 dry-run 이므로 첫 릴리스에서 스토리지 삭제는 절대 일어나지 않는다.
- 부하: 매시 후보 ≤500 × (EXISTS 1문장 + 잠금 tx ≤2 + 스토리지 DELETE 1). 평시 후보는 수 건 수준으로 예상.
