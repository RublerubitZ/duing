# 업로드 해제(RELEASED) 회귀 테스트 2건 — #1158 (#1153 후속, 테스트 전용)

작성 2026-09-07. 선행: `docs/superpowers/specs/2026-09-07-upload-object-release-design.md`(#1153, PR #1157). 이슈 #1158. **프로덕션 코드 변경 없음** — 현재 RELEASED 수명주기 정책을 고정하는 회귀 테스트만 추가한다.

## 0. 요구 (구속)

1. 홍보 배너를 **비웠을 때**(`UpdatePromotionCommand.clearBannerImageUrl = true`) 기존 배너 업로드 객체가 ACTIVE → RELEASED 가 되는 직접 테스트.
2. 동아리 폐쇄 통합 테스트에 그 동아리의 **홍보 배너 업로드 객체 1건**을 포함해, 폐쇄 시 배너까지 RELEASED 로 전환되는 것을 실제 폐쇄 경로(`ClubClosureService.close` → `PromotionService.removeAllOnClubClosure`)로 검증.
3. 최소 변경. 기존 테스트 파일·헬퍼를 재사용하고 새 파일을 만들지 않는다.

## 1. 현재 상태에서 확인한 사실

| 항목 | 사실 |
|---|---|
| 홍보 비우기 의미론 | `Promotion.update`: `clearBannerImageUrl == TRUE` → `bannerImageUrl = null`(우선), 아니면 non-null 만 교체 |
| 홍보 해제 지점 | `GeneralPromotionService.update`: 갱신 전 배너 캡처 → `activate(command.bannerImageUrl())` → `releaseIfReplaced(previous, promotion.getBannerImageUrl())`. 키 비교라 current null = 해제 |
| 기존 홍보 테스트 | `PromotionUploadActivationTest.promotionUpdateAndDeleteReleaseBanners` 가 교체·삭제만 검증. 비우기 케이스는 전체 행사 테스트(`GlobalEventUploadActivationTest.updateClearAndDeleteReleaseCovers`)가 같은 코드 모양으로만 증명 |
| 폐쇄 경로 | `GeneralClubClosureService.close`: … → 3단계 `promotionService.removeAllOnClubClosure(clubId)`(`findAllByClubId` → `deleteAll` → `release(배너들)`) → … → `flush(); clear();` → club soft-delete → `release(로고·커버·사진)` |
| 기존 폐쇄 테스트 | `ClubUploadActivationTest.closureReleasesLogoCoverAndPhotos`: INACTIVE 동아리(리플렉션) + 로고(`seedActive`)·커버(`updateAsAdmin` 으로 활성화)·사진(리포지토리 저장) → `close` → 셋 RELEASED. 홍보는 만들지 않는다 |
| 홍보 생성 제약 | `validateSingleLinkTarget(linkUrl, noticeId, clubId)`: 셋 중 둘 이상이면 409 → 폐쇄용 홍보는 `clubId` 만, `linkUrl = null`. `clubRepository.findById(clubId)` 존재 필요(상태 무관) |
| 테스트 픽스처 | `PromotionUploadActivationTest.createBanner(bannerUrl, adminId)` 는 clubId null·linkUrl 지정. `clubClosureBulkRemovalReleasesBanners` 가 clubId 지정 `CreatePromotionCommand` 전문을 이미 갖고 있다 |

## 2. 설계

### 2.1 홍보 배너 비우기 (`PromotionUploadActivationTest`)

새 테스트 1건:

```java
    @Test
    @DisplayName("홍보 배너를 비우면(clearBannerImageUrl) 기존 배너 업로드가 RELEASED 가 된다")
    void promotionClearBannerReleasesUpload() {
        User admin = userRepository.save(UserFixture.admin());
        String bannerKey = seedPending(FilePurpose.PROMOTION_BANNER);
        Long promotionId = promotionService.create(createBanner(STUB_PREFIX + bannerKey, admin.getId()));
        assertThat(statusOf(bannerKey)).isEqualTo(UploadedObjectStatus.ACTIVE);

        promotionService.update(new UpdatePromotionCommand(promotionId, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null,
                true, null, null, null, null, null, null, null, null, null, null));

        assertThat(statusOf(bannerKey)).isEqualTo(UploadedObjectStatus.RELEASED);
    }
```

`UpdatePromotionCommand` 의 18번째 인자가 `clearBannerImageUrl` 이다(`promotionId, title, bannerImageUrl, linkUrl, clubId, active, displayOrder, clearClubId, tag, subtitle, ctaLabel, emoji, palette, renderMode, imageAltText, startAt, endAt, clearBannerImageUrl, …`). 다른 인자는 전부 null(유지) — `validateSingleLinkTarget(null, null, null)` 은 0건, `validateNoticeIsPublic(null)` 은 즉시 반환, `clubId == null` 이라 존재 검사도 생략되므로 `createBanner` 가 넣은 기존 `linkUrl`(`https://example.com`)과 충돌하지 않는다.

### 2.2 폐쇄 통합에 홍보 배너 포함 (`ClubUploadActivationTest`)

기존 `closureReleasesLogoCoverAndPhotos` 를 확장한다(새 테스트를 만들지 않는다 — "폐쇄 한 번에 네 종류가 함께 해제된다" 가 계약이다):

- import 추가(알파벳 순 — `com.duing.domain.clubmember.repository.ClubMemberRepository` 뒤, `com.duing.domain.user.entity.User` 앞): `com.duing.domain.promotion.entity.PromotionPalette` → `com.duing.domain.promotion.entity.PromotionRenderMode` → `com.duing.domain.promotion.service.PromotionService` → `com.duing.domain.promotion.service.dto.command.CreatePromotionCommand`.
- 필드 추가: `@Autowired PromotionService promotionService;`
- 테스트 본문: `saveClubWithStatus(...)` 뒤·`close` 앞에
  ```java
        String bannerKey = seedPending(FilePurpose.PROMOTION_BANNER);
        promotionService.create(new CreatePromotionCommand(club.getId(), "폐쇄 배너", STUB_PREFIX + bannerKey, null, true, 1,
                admin.getId(), null, null, null, null, PromotionPalette.INK, null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null, null));
        assertThat(statusOf(bannerKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
  ```
  `close` 뒤 단언에 `assertThat(statusOf(bannerKey)).isEqualTo(UploadedObjectStatus.RELEASED);` 추가.
- DisplayName 을 `"총동연이 동아리를 폐쇄하면 로고·커버·살아 있는 활동 사진·홍보 배너 업로드가 모두 RELEASED 가 된다"` 로 갱신.

이 확장이 고정하는 계약: 폐쇄 tx 안에서 홍보 일괄 제거의 해제가 `flush()/clear()` 앞에서 일어나도 커밋에 반영된다(폐쇄 서비스가 `flush()` 로 그 변경을 쓴다).

## 3. 검증

```
cd backend && ./gradlew test --tests "com.duing.domain.promotion.service.PromotionUploadActivationTest" --tests "com.duing.domain.club.service.ClubUploadActivationTest"
```
RED: 새 테스트·확장 단언은 현재 구현에서 **통과한다**(이미 구현된 정책의 회귀 가드) — 이 작업의 RED 는 "구현 결여" 가 아니라 "가드 부재" 이므로, 테스트 추가 뒤 곧바로 GREEN 이 정상이다. 대신 가드의 실효성은 실패 조건을 명시해 둔다: `GeneralPromotionService.update` 의 `releaseIfReplaced` 한 줄, 또는 `removeAllOnClubClosure` 의 `release` 한 줄을 지우면 각각 실패해야 한다(구현자가 로컬에서 한 번 지웠다 되돌려 확인하고, **지운 줄과 실패한 단언(테스트 메서드명·기대/실제 값)을 리포트에 적는다** — 커밋에는 포함하지 않는다).

## 4. Out of Scope

- 프로덕션 코드 변경 전부.
- 커버↔본문 교차 재사용 시 RELEASED→복구 왕복 제거(#1159, 후속 후보로 보류).
- 폐쇄 시 홍보 요청 제안 배너(삭제 경로 없음 — #1153 스펙 §3.1 대상 아님).
