# 교체·삭제된 업로드 객체 해제(RELEASED) 설계 — #1153 (#791 후속)

작성 2026-09-07. 선행: `docs/superpowers/specs/2026-09-03-orphan-upload-purge-design.md`(#791, PR #1143, develop eba12a92). 이 문서는 그 스펙의 §9 "교체된 이미지 누수" 를 다룬다. 이슈 #1153.

## 0. 이슈 요구 (구속)

- 수정으로 교체·비워진 로고·커버·배너·본문 이미지, 삭제된 공지·홍보·전체 행사·동아리 사진, 폐쇄된 동아리의 이미지는 더는 ACTIVE 로 남지 않고 파기 후보가 된다.
- 다른 곳에서 여전히 참조 중인 객체는 지우지 않는다(참조 스캔 안전망). 이 경우는 경고가 아니라 정상 흐름이다.
- 해제된 객체를 다시 연결하면(편집 되돌리기) 재활성화된다. 잡이 이미 claim 한 뒤면 기존과 같이 만료 400.
- 총동연 문의 첨부는 대상 아님(`FederationInquiryPurgeJob` 이 보관기간 뒤 파기).
- 도입 이전에 이미 교체·삭제된 객체의 일회성 정리는 범위 밖.

## 1. 현재 구조에서 확인한 사실

| 항목 | 사실 |
|---|---|
| 추적 상태 | `PENDING → ACTIVE`(attach) / `PENDING·PURGING → PURGING → PURGED`(잡). ACTIVE 는 종단(이 스펙 전까지) — 어떤 경로도 ACTIVE 를 후보로 되돌리지 않는다 |
| 후보 조회 | `findPurgeCandidates(status IN (PENDING, PURGING) AND uploaded_at < cutoff ORDER BY id, LIMIT 500)` |
| 참조 스캔 | `isReferenced(key)` native 1문장, 8개 저장 위치. **soft-delete 행도 참조로 센다**(보수적) |
| 교체 의미론 | Club·Promotion·GlobalEvent: clear 플래그 → null, 값 non-null → 교체, 둘 다 없음 → 유지. Notice(`update`): non-null → 교체. Notice(`applyClubScopedUpdate`): clear → `""`, non-null → 교체. 옛 값은 갱신 전 엔티티 getter 로만 얻을 수 있다 |
| 삭제 | 전부 soft-delete(`@SQLDelete deleted_at = NOW()`). **복구(undelete) 경로 없음**(facility·club_favorite 만 restore 가 있고 대상 밖) |
| 동아리 폐쇄 | `GeneralClubClosureService.close`: 홍보 `removeAllOnClubClosure` → … → `flush(); clear();` → `clubRepository.delete`. 사진(`club_photo`)은 폐쇄 시 건드리지 않는다 |
| 문의 첨부 | 교체·삭제 시 첨부 행 soft-delete → `FederationInquiryPurgeJob` 이 보관기간 뒤 스토리지 삭제 + 행 물리 삭제. `uploaded_object` 행은 ACTIVE 로 남지만 객체는 이미 없다(무해) |
| 홍보 요청 | 제안 배너는 요청 행에 영구 참조. 관리자가 같은 URL 을 홍보 배너로 재사용하는 흐름 존재(#791 스펙 §1.1) |
| 삭제 계약 | `FileStorageService.delete(url)`: 미존재 키도 true(멱등) |
| 운영 상태 | prod 는 1차 dry-run(`delete-enabled=false`) — 이 작업이 배포돼도 실삭제는 2차 전환 전까지 없다 |

## 2. 데이터 모델 — `V125__uploaded_object_released_at.sql`

```sql
ALTER TABLE uploaded_object ADD COLUMN IF NOT EXISTS released_at TIMESTAMP WITH TIME ZONE;
-- RELEASED 후보 스캔(status = RELEASED AND released_at < cutoff) 전용. PENDING 쪽은 기존 (status, uploaded_at) 인덱스.
CREATE INDEX IF NOT EXISTS idx_uploaded_object_status_released_at ON uploaded_object (status, released_at);
```

additive. `status` 는 VARCHAR(20) 라 새 값 `RELEASED` 에 DDL 이 필요 없다. **롤백 주의**: `released_at` 열은 구 코드가 무시하지만, `RELEASED` 값은 구 코드의 `@Enumerated(STRING)` 이 읽지 못한다 — 배포 뒤 교체·삭제가 한 번이라도 일어난 상태에서 구 버전으로 롤백하면 그 키를 다시 연결하는 요청(`findByStorageKeyForUpdate` 로드)이 enum 변환 예외로 500 이 된다(잡은 status IN 필터라 영향 없음). 롤백이 필요하면 먼저 `UPDATE uploaded_object SET status = 'ACTIVE', released_at = NULL WHERE status = 'RELEASED';` 를 실행한다.

### 2.1 상태 전이 (기존 + 추가)

```
PENDING  --activate-->            ACTIVE
RELEASED --activate-->            ACTIVE        (추가: 편집 되돌리기·재사용)
ACTIVE   --release-->             RELEASED      (추가: 교체·비우기·삭제, released_at = now)
PENDING|PURGING|RELEASED --markPurging--> PURGING   (RELEASED 추가)
PENDING|PURGING|RELEASED --restoreActive--> ACTIVE  (RELEASED 추가 — 잡의 안전망)
PURGING  --markPurged-->          PURGED
```

- `activate` 는 PENDING·RELEASED 에서만(“claim 된 행은 attach 가 되살리지 못한다” 계약 유지 — PURGING 은 여전히 불가). RELEASED→ACTIVE 시 `released_at = null`, `activated_at = now`. `restoreActive` 로 RELEASED→ACTIVE 될 때도 `released_at = null`(ACTIVE 행에 해제 시각이 남지 않게).
- `release` 는 ACTIVE 에서만. 그 외 상태에서의 호출은 서비스가 걸러 no-op(§3).
- `isPurgeCandidate` = PENDING·PURGING·RELEASED.
- 서비스 `activateKey` 의 switch 에 `RELEASED -> activate` 추가. PURGING·PURGED → 만료 400 그대로.

## 3. 서비스 — `UploadedObjectService`

```java
/** 교체·비우기: previous 가 자기 스토리지 키이고 current 와 다르면 previous 를 해제한다. */
public void releaseIfReplaced(String previousUrl, String currentUrl);
/** 본문 편집: 이전 본문의 자체 스토리지 URL 중 현재 본문에 없는 키를 해제한다(토큰화는 activateReferencedIn 과 동일). */
public void releaseRemovedFrom(String previousContent, String currentContent);
/** 삭제: 주어진 URL 을 전부 해제한다. null·빈값·외부 URL·추적 행 없음(레거시)은 건너뛴다. */
public void release(String... fileUrls);
```

- 셋 다 내부적으로 키를 `TreeSet` 정렬 후 `findByStorageKeyForUpdate` 잠금 조회 → 상태별: ACTIVE → `release(now)`, 그 외(PENDING·RELEASED·PURGING·PURGED) → no-op. 추적 행 없음 → no-op. RELEASED 에 다시 해제가 와도 no-op 이며 `released_at` 을 갱신하지 않는다(유예는 첫 해제 기준).
- `releaseIfReplaced` 의 "다르면" 은 **스토리지 키 기준**이다: `key(previous) != null && !key(previous).equals(key(current))`. 비우기가 `null`(Club·Promotion·GlobalEvent)이든 `""`(`Notice.applyClubScopedUpdate`)이든 `key(current) == null` 로 수렴해 해제된다.
- **RELEASED 는 "어떤 쓰기 경로가 이 키를 놓았다" 는 신호일 뿐 비참조 보장이 아니다.** 다른 엔티티(또는 같은 엔티티의 다른 필드)가 동시에 같은 키의 참조를 얻었을 수 있다 — 행 잠금은 순서만 정하지 참조 여부를 모른다. 삭제 여부의 최종 판정은 항상 잡의 참조 스캔(§4.1)이며, 해제 경로는 스캔을 대체하거나 생략시키지 않는다.
  - PENDING 에서 no-op 인 이유: 엔티티가 참조했는데 PENDING 이면 활성화 누락이다 — 잡의 안전망(참조 스캔)이 다루는 영역이지 해제가 덮어쓸 일이 아니다.
- 도메인 tx 안에서 호출한다(활성화와 동일) — 도메인 쓰기가 롤백되면 해제도 롤백. 호출 순서는 **activate → release**(새 값 먼저 확정). 같은 키가 새 값에도 있으면(예: 옛 커버 URL 을 본문에 붙여넣음) `releaseIfReplaced` 는 키 비교로 건너뛰지 못하는 경우가 있는데(커버↔본문 교차), 그 객체는 RELEASED 가 됐다가 잡의 참조 스캔이 ACTIVE 로 복구한다(§4.1 정상 흐름, INFO).
- 잠금 순서: 한 tx 가 activate 집합·release 집합을 각각 사전순으로 잠근다. 두 도메인 tx 가 같은 두 키를 서로 반대 역할로 동시에 다루는 경우(두 관리자가 같은 두 이미지를 맞바꿈)만 ABBA 가능 — PG 데드락 감지로 한쪽 실패, 재시도로 해결. 잡은 행 1개씩 짧은 tx 라 데드락 요소가 아니다(#791 스펙 §10 그대로).

### 3.1 해제 지점 전수 (purpose × 경로)

| purpose | 경로 | 해제 대상 |
|---|---|---|
| LOGO·COVER | `GeneralClubService.applyProfileUpdate` | 갱신 전 `club.getLogoUrl()/getCoverUrl()` vs 갱신 후 — `releaseIfReplaced` ×2. 활성화(기존, flush try/catch 뒤) 다음에 |
| LOGO·COVER·PHOTO | `GeneralClubClosureService.close` | `entityManager.clear()` 전에 로고·커버·`clubPhotoRepository.findByClubId`(`@SQLRestriction` 으로 살아 있는 사진만 — 이미 삭제된 사진은 삭제 시점에 해제됐거나 레거시) 의 storageKey 를 모아 두고, soft-delete 뒤 `release(...)`. 홍보 배너는 그 앞 `promotionService.removeAllOnClubClosure` 안에서 해제되며 뒤따르는 `flush()` 가 그 변경을 쓴다(clear 뒤로 옮기지 않는다) |
| PHOTO | `GeneralClubPhotoService.delete` | `photo.getStorageKey()`(값은 URL) — `clubPhotoRepository.delete` 뒤 `release` |
| NOTICE_COVER·NOTICE_BODY | `GeneralNoticeService.update` / `updateForClub` | 갱신 전 `getCoverImageUrl()`·`getContent()` 캡처 → 갱신 → 활성화(기존) → `releaseIfReplaced(prevCover, curCover)` + `releaseRemovedFrom(prevContent, curContent)` |
| NOTICE_COVER·NOTICE_BODY | `GeneralNoticeService.delete` / `deleteForClub` | `release(cover)` + `releaseRemovedFrom(content, null)` |
| PROMOTION_BANNER | `GeneralPromotionService.update` | `releaseIfReplaced(prevBanner, curBanner)` |
| PROMOTION_BANNER | `GeneralPromotionService.delete` / `removeAllOnClubClosure` | 삭제되는 각 홍보의 `getBannerImageUrl()` — `release` |
| GLOBAL_EVENT_COVER | `GeneralGlobalEventService.update` / `delete` | `releaseIfReplaced` / `release` |
| PROMOTION_REQUEST_BANNER | 없음 | 요청 행은 수정·삭제 경로가 없다 — 대상 아님 |
| FEDERATION_INQUIRY | 없음 | 자체 보관기간 파기 잡 — 대상 아님(§0) |

`GeneralClubPhotoService.updateCaption`·`reorder`, `Notice` 의 대상 동아리 갱신 등 이미지 필드를 건드리지 않는 경로는 손대지 않는다.

## 4. 파기 잡 — `UploadPurgeJob`

### 4.1 후보·처리

- 후보 조회는 **두 쿼리**로 나눈다: 기존 `findPurgeCandidates(PENDING·PURGING, uploaded_at < cutoff)` 를 먼저 최대 500건, 이어 `findReleasedCandidates(RELEASED, released_at < cutoff)` 를 **남은 한도(500 − 앞의 건수)** 만큼. 둘 다 `ORDER BY id`. 회당 총 상한 500 은 유지하고 PENDING(남용 콘텐츠 가능성이 있는 미연결 업로드)이 RELEASED 보다 우선한다. 나누는 이유: (1) 각 쿼리가 자기 인덱스(`(status, uploaded_at)`·`(status, released_at)`)를 그대로 탄다(OR 술어의 BitmapOr 의존 없음), (2) 표본 절단을 상태별로 판정할 수 있다(아래). 유예(window)는 같은 값(기본 24h) — 해제 직후 편집 되돌리기(RELEASED→ACTIVE)가 잡과 겹치지 않게 하는 완충.
- **dry-run 누적과 절단 판정**: dry-run 은 상태를 바꾸지 않으므로 RELEASED 후보는 교체·삭제가 일어날 때마다 단조 누적된다(PENDING 은 24h 뒤 정체). 기존 "표본이 절단됨" WARN(2차 전환 차단 조건)은 **PENDING·PURGING 쿼리가 500 건을 채운 경우에만** 낸다. RELEASED 쿼리가 남은 한도를 채운 경우는 별도 INFO("해제 후보가 한도를 채움 — 실삭제 전환 후 시간당 500건씩 정리됨")로 남기고 전환 판정에 넣지 않는다. 요약 로그에 후보 수를 `pendingCandidates`/`releasedCandidates` 로 나눠 남긴다. 전환 직후 누적 RELEASED 가 500/시 로 정리되는 것은 정상 동작이다.
- 참조 스캔 결과 참조가 남아 있을 때:
  - PENDING·PURGING(기존): 실삭제 모드 `restoreActive` + **WARN**(활성화 지점 누락 의심), dry-run **WARN** + `referencedInDryRun++` — 그대로.
  - **RELEASED(추가)**: 실삭제 모드 `restoreActive` + **INFO**("다른 참조가 남아 있어 ACTIVE 로 복구", `releasedStillReferenced++`), dry-run INFO 만(`releasedStillReferenced++`). 경고가 아닌 이유: 홍보 요청 제안 배너 재사용·본문 붙여넣기 등 정상 흐름이다. 2차 전환 판정("referenced=true WARN 0건")에 섞이지 않는다.
- claim·삭제·확정은 기존과 동일(`isPurgeCandidate` 가 RELEASED 를 포함하므로 술어 변경 없음). 참조 분기의 분류는 후보 스냅샷 상태로 한다 — RELEASED 가 claim 된 뒤 삭제가 실패해 PURGING 으로 남은 행은 다음 실행에서 PENDING 쪽(WARN)으로 분류되는데, 이중 실패의 드문 경우라 받아들인다.
- 요약 로그에 `releasedStillReferenced={}` 추가. 후보 로그(dry-run)엔 `status` 필드 추가 — PENDING 과 RELEASED 를 구분해 읽을 수 있게.

### 4.2 참조 스캔 — soft-delete 행 제외

`isReferenced` 를 다음 표대로 바꾼다. 원칙: **이 작업이 삭제 시 해제하는 테이블만** soft-delete 행을 참조에서 뺀다(복구 경로 없음 확인, §1). 그 밖은 그대로 보수적.

| 저장 위치 | 변경 |
|---|---|
| `club.logo_url/cover_url` | `deleted_at IS NULL` 추가 |
| `club_photo.storage_key` | `p.deleted_at IS NULL` + `JOIN club c … c.deleted_at IS NULL`(폐쇄된 동아리의 사진은 개별 soft-delete 되지 않으므로) |
| `notice.cover_image_url/content` | `deleted_at IS NULL` 추가 |
| `promotion.banner_image_url` | `deleted_at IS NULL` 추가 |
| `global_event.cover_image_url` | `deleted_at IS NULL` 추가 |
| `promotion_request.suggested_banner_image_url` | 변경 없음(삭제 경로 없음 — soft-delete 행이 있어도 참조로 센다) |
| `federation_inquiry_attachment.storage_key` | 변경 없음(soft-delete 행은 보관기간까지 첨부가 살아 있어야 한다) |

부수 효과: PENDING 객체를 참조하는 곳이 soft-delete 행뿐이면 이제 치유(ACTIVE) 대신 파기된다 — 엔티티가 지워졌으니 맞는 결과.

## 5. 설정

변경 없음. `duing.upload.purge.{enabled, delete-enabled, window}` 그대로. RELEASED 도 같은 window·같은 dry-run 게이트를 탄다.

## 6. 예외·응답

변경 없음. RELEASED 에 대한 attach 는 성공(재활성화), PURGING·PURGED 는 기존 `UploadExpiredException`(400).

## 7. 테스트

1. `UploadedObjectTest`: ACTIVE→RELEASED(released_at 기록), RELEASED→ACTIVE(activate, released_at null), RELEASED→PURGING, RELEASED→restoreActive, PENDING/PURGING/PURGED 에서 `release` 는 IllegalStateException, `isPurgeCandidate` 에 RELEASED 포함.
2. `UploadedObjectRepositoryTest`: (a) 기존 후보 조회는 RELEASED 를 돌려주지 않는다; (b) 참조 스캔 — soft-delete 된 notice/promotion/global_event/club/club_photo 는 비참조, 폐쇄(soft-delete)된 동아리의 살아 있는 사진은 비참조, soft-delete 된 문의 첨부·soft-delete 된 홍보 요청은 **여전히 참조**(변경 없음 가드); (c) `findReleasedCandidates` — RELEASED+released_at<cutoff 포함, released_at≥cutoff 제외, 옛 uploaded_at 인 RELEASED 라도 released_at 기준.
3. `UploadedObjectServiceTest`: `release` ACTIVE→RELEASED / PENDING·RELEASED·PURGING·PURGED·레거시 no-op / 외부 URL 무시; `releaseIfReplaced` 같은 키 no-op·다른 키 해제·previous null 무시·current null 과 current `""`(비우기) 해제·RELEASED 재해제 시 released_at 불변; `releaseRemovedFrom` 차집합·current null 전부; `activate` 가 RELEASED 를 ACTIVE 로.
4. 도메인 활성화 테스트 각 파일에 해제 케이스 추가(§3.1 전수): Club(로고 교체·커버 비우기·같은 URL 유지·폐쇄 시 로고·커버·사진), ClubPhoto(삭제), Notice(관리자·동아리 수정: 커버 교체·본문 이미지 제거·유지 이미지 ACTIVE 유지·**새 커버가 만료(PURGED)라 400 이면 옛 커버는 ACTIVE 그대로(해제가 tx 와 함께 롤백)**; 삭제 2경로), Promotion(수정·삭제·폐쇄 일괄), GlobalEvent(수정·삭제).
5. `UploadPurgeJobTest`: 25h 지난 RELEASED 파기 / 1h 지난 RELEASED 보존 / RELEASED+참조 잔존 → ACTIVE 복구·released_at null·WARN 없음(`OutputCapture`) / dry-run RELEASED 로그·WARN 없음 / 상한 500 이 두 상태를 합쳐 적용(PENDING 우선) / RELEASED 만으로 한도를 채우면 "표본이 절단됨" WARN 이 나지 않는다.
6. `UploadActivationPurgeConcurrencyTest`: 해제 뒤 유예 안 재활성화 → 잡이 지나가도 ACTIVE 유지; 잡이 RELEASED 를 claim 한 뒤 재활성화 → 만료 400·PURGED(기존 `purgeWinsWhenJobAlreadyClaimed` 와 같은 모양).

## 8. Out of Scope

- 도입 이전에 교체·삭제된 객체의 일회성 정리(reconciliation) — #791 §9 그대로.
- 총동연 문의 첨부(자체 잡), 홍보 요청 제안 배너(수정·삭제 경로 없음).
- `FederationInquiryPurgeJob` 이 지운 객체의 `uploaded_object` 행 정리(§1 문의 첨부 행 참조).
- 커버↔본문 교차 재사용 시 RELEASED→복구 왕복의 제거(정상 흐름으로 두고 잡이 복구).
- FE 변경, 설정 추가, Slack/Sentry 알림.
- `ClubPhoto.storageKey` 필드명 정정(값은 URL) — #791 §9 그대로.

## 9. 리스크 / 체크 포인트

- **최대 리스크 = 해제한 객체가 사실은 다른 곳에서 쓰이는 경우.** 방어: 잡의 참조 스캔이 지우기 전 마지막으로 확인하고 ACTIVE 로 복구한다(INFO). 스캔이 모르는 저장 위치가 생기면(purpose 추가 시 규칙 위반) 그 위치만 참조하는 해제 객체는 지워질 수 있다 — #791 과 같은 유지 규칙(`FilePurpose` javadoc)이 그대로 적용된다.
- soft-delete 제외로 안전망이 좁아지는 범위는 §4.2 표의 5개 테이블뿐이며 전부 복구 경로가 없다. 새로 restore 기능을 붙이는 쪽이 이 스캔을 되돌려야 한다 — 리포지토리 javadoc 에 명시.
- 배포: V125 additive(develop 의 V124 `club_active_days_widen`(#1151) 뒤 — 머지 직전 develop·개발 DB flyway_schema_history 를 다시 대조한다, #791 에서 재번호가 실제로 필요했던 함정), 구 코드와 공존. prod 는 dry-run 이라 RELEASED 도 로그만 남고 누적된다. 2차 전환 판정 조건은 변하지 않는다(WARN 은 여전히 PENDING·PURGING 참조 잔존과 PENDING·PURGING 표본 절단에만). 전환 직후 누적 RELEASED 가 시간당 500건씩 지워지는 것은 정상.
- 부하: RELEASED 는 교체·삭제 빈도만큼(하루 수십 건 이하 예상). 후보 상한·스캔 비용은 기존과 같은 자릿수.
- **롤백 절차**: 구 버전으로 되돌리기 전 §2 의 UPDATE 로 RELEASED 행을 ACTIVE 로 복귀시킨다(교체·삭제된 객체는 다음 배포 뒤 다시 해제되지 않으므로 그 사이 잔존은 감수).
