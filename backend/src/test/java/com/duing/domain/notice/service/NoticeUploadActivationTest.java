package com.duing.domain.notice.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeContentFormat;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.service.dto.command.CreateClubNoticeCommand;
import com.duing.domain.notice.service.dto.command.CreateNoticeCommand;
import com.duing.domain.notice.service.dto.command.UpdateClubNoticeCommand;
import com.duing.domain.notice.service.dto.command.UpdateNoticeCommand;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.entity.UploadedObjectStatus;
import com.duing.global.file.repository.UploadedObjectRepository;
import java.lang.reflect.Field;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

/** 공지 도메인의 업로드 활성화 지점(스펙 §3.4: NOTICE_COVER·NOTICE_BODY × 관리자/동아리 생성·수정 4경로). */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class NoticeUploadActivationTest extends IntegrationTestBase {

    private static final String STUB_PREFIX = "/files/stub/";

    @Autowired NoticeService noticeService;
    @Autowired ClubRepository clubRepository;
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

    private String bodyWith(String storageKey) {
        return "<p>본문</p><img src=\"" + STUB_PREFIX + storageKey + "\" alt=\"\">";
    }

    private Club saveActiveClub() throws Exception {
        Club club = Club.create("공지클럽-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, null, "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private CreateNoticeCommand adminCreate(String coverUrl, String content, Long authorId) {
        return new CreateNoticeCommand("제목", "요약", content, coverUrl, null,
                NoticeCategory.GENERAL, List.of(), NoticeVisibility.PUBLIC, null, List.of(),
                false, null, false, null, null, null, null, null, NoticeContentFormat.HTML, authorId);
    }

    @Test
    @DisplayName("관리자가 공지를 만들면 커버와 본문 이미지 업로드가 모두 ACTIVE 가 된다")
    void adminCreateActivatesCoverAndBodyImages() {
        User admin = userRepository.save(UserFixture.admin());
        String coverKey = seedPending(FilePurpose.NOTICE_COVER);
        String bodyKey = seedPending(FilePurpose.NOTICE_BODY);

        noticeService.create(adminCreate(STUB_PREFIX + coverKey, bodyWith(bodyKey), admin.getId()));

        assertThat(statusOf(coverKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(statusOf(bodyKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("관리자가 공지를 수정하면 새 커버와 새 본문 이미지 업로드가 ACTIVE 가 된다")
    void adminUpdateActivatesNewCoverAndBodyImages() {
        User admin = userRepository.save(UserFixture.admin());
        Long noticeId = noticeService.create(adminCreate("", "<p>초기</p>", admin.getId()));
        String coverKey = seedPending(FilePurpose.NOTICE_COVER);
        String bodyKey = seedPending(FilePurpose.NOTICE_BODY);

        noticeService.update(new UpdateNoticeCommand(noticeId, null, null, bodyWith(bodyKey), STUB_PREFIX + coverKey,
                null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null));

        assertThat(statusOf(coverKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(statusOf(bodyKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("동아리 공지를 만들면 커버와 본문 이미지 업로드가 ACTIVE 가 된다")
    void clubCreateActivatesCoverAndBodyImages() throws Exception {
        User author = userRepository.save(UserFixture.unique());
        Club club = saveActiveClub();
        String coverKey = seedPending(FilePurpose.NOTICE_COVER);
        String bodyKey = seedPending(FilePurpose.NOTICE_BODY);

        noticeService.createForClub(new CreateClubNoticeCommand(club.getId(), author.getId(),
                "동아리 공지", "요약", bodyWith(bodyKey), STUB_PREFIX + coverKey, false, null));

        assertThat(statusOf(coverKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(statusOf(bodyKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("동아리 공지를 수정하면 새 커버와 새 본문 이미지 업로드가 ACTIVE 가 된다")
    void clubUpdateActivatesNewCoverAndBodyImages() throws Exception {
        User author = userRepository.save(UserFixture.unique());
        Club club = saveActiveClub();
        Long noticeId = noticeService.createForClub(new CreateClubNoticeCommand(club.getId(), author.getId(),
                "동아리 공지", "요약", "<p>초기</p>", null, false, null));
        String coverKey = seedPending(FilePurpose.NOTICE_COVER);
        String bodyKey = seedPending(FilePurpose.NOTICE_BODY);

        noticeService.updateForClub(new UpdateClubNoticeCommand(club.getId(), noticeId,
                null, null, bodyWith(bodyKey), STUB_PREFIX + coverKey, null, null, null));

        assertThat(statusOf(coverKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(statusOf(bodyKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }
}
