package com.duing.domain.promotion.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.promotion.entity.PromotionPalette;
import com.duing.domain.promotion.entity.PromotionRenderMode;
import com.duing.domain.promotion.service.dto.command.CreatePromotionCommand;
import com.duing.domain.promotion.service.dto.command.CreatePromotionRequestCommand;
import com.duing.domain.promotion.service.dto.command.UpdatePromotionCommand;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.entity.UploadedObjectStatus;
import com.duing.global.file.repository.UploadedObjectRepository;
import java.lang.reflect.Field;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

/** 홍보 도메인의 업로드 활성화 지점(스펙 §3.4: PROMOTION_BANNER 생성·수정, PROMOTION_REQUEST_BANNER 생성). */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class PromotionUploadActivationTest extends IntegrationTestBase {

    private static final String STUB_PREFIX = "/files/stub/";

    @Autowired PromotionService promotionService;
    @Autowired PromotionRequestService promotionRequestService;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;
    @Autowired UploadedObjectRepository uploadedObjectRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String seedPending(FilePurpose purpose) {
        String storageKey = purpose.directory() + "/" + sequence.incrementAndGet() + ".jpg";
        uploadedObjectRepository.save(UploadedObject.pending(storageKey, purpose, 1L, Instant.now()));
        return storageKey;
    }

    private UploadedObjectStatus statusOf(String storageKey) {
        return uploadedObjectRepository.findByStorageKey(storageKey).orElseThrow().getStatus();
    }

    private CreatePromotionCommand createBanner(String bannerUrl, Long adminId) {
        return new CreatePromotionCommand(null, "배너", bannerUrl, "https://example.com", true, 1, adminId,
                null, null, null, null, PromotionPalette.INK, null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null, null);
    }

    @Test
    @DisplayName("홍보를 만들면 배너 업로드가 ACTIVE 가 되고, 수정으로 배너를 바꾸면 새 배너 업로드가 ACTIVE 가 된다")
    void promotionCreateAndUpdateActivateBanner() {
        User admin = userRepository.save(UserFixture.admin());
        String createdKey = seedPending(FilePurpose.PROMOTION_BANNER);
        String replacedKey = seedPending(FilePurpose.PROMOTION_BANNER);

        Long promotionId = promotionService.create(createBanner(STUB_PREFIX + createdKey, admin.getId()));
        assertThat(statusOf(createdKey)).isEqualTo(UploadedObjectStatus.ACTIVE);

        promotionService.update(new UpdatePromotionCommand(promotionId, null, STUB_PREFIX + replacedKey, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null));
        assertThat(statusOf(replacedKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("동아리 운영진이 홍보 요청을 제출하면 제안 배너 업로드가 ACTIVE 가 된다")
    void promotionRequestCreateActivatesSuggestedBanner() throws Exception {
        User leader = userRepository.save(UserFixture.unique());
        Club club = Club.create("홍보요청클럽-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, null, "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        club = clubRepository.save(club);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        String bannerKey = seedPending(FilePurpose.PROMOTION_REQUEST_BANNER);

        promotionRequestService.create(new CreatePromotionRequestCommand(club.getId(), leader.getId(),
                "타이틀", "설명", STUB_PREFIX + bannerKey, "https://example.com"));

        assertThat(statusOf(bannerKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }
}
