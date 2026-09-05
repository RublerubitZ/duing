package com.duing.global.file.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.photo.entity.ClubPhoto;
import com.duing.domain.club.photo.repository.ClubPhotoRepository;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.entity.FederationInquiryAttachment;
import com.duing.domain.federation.repository.FederationInquiryAttachmentRepository;
import com.duing.domain.federation.repository.FederationInquiryRepository;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeContentFormat;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.repository.NoticeRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.entity.UploadedObjectStatus;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class UploadedObjectRepositoryTest extends IntegrationTestBase {

    @Autowired UploadedObjectRepository uploadedObjectRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubPhotoRepository clubPhotoRepository;
    @Autowired NoticeRepository noticeRepository;
    @Autowired FederationInquiryRepository federationInquiryRepository;
    @Autowired FederationInquiryAttachmentRepository federationInquiryAttachmentRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());
    private final Instant now = Instant.now();

    private UploadedObject save(String storageKey, UploadedObjectStatus status, Instant uploadedAt) {
        UploadedObject uploadedObject = UploadedObject.pending(storageKey, FilePurpose.LOGO, 1L, uploadedAt);
        if (status == UploadedObjectStatus.ACTIVE) uploadedObject.activate(uploadedAt);
        if (status == UploadedObjectStatus.PURGING) uploadedObject.markPurging();
        if (status == UploadedObjectStatus.PURGED) { uploadedObject.markPurging(); uploadedObject.markPurged(uploadedAt); }
        return uploadedObjectRepository.save(uploadedObject);
    }

    private String uniqueKey(String directory) {
        return directory + "/" + sequence.incrementAndGet() + ".jpg";
    }

    @Test
    @DisplayName("파기 후보 조회는 cutoff 이전에 업로드된 PENDING·PURGING 만 id 오름차순으로, 요청한 상한까지 돌려준다")
    void findsPurgeCandidatesByStatusCutoffOrderAndLimit() {
        Instant old = now.minus(25, ChronoUnit.HOURS);
        Instant recent = now.minus(1, ChronoUnit.HOURS);
        UploadedObject oldPending = save(uniqueKey("club/logo"), UploadedObjectStatus.PENDING, old);
        UploadedObject oldPurging = save(uniqueKey("club/logo"), UploadedObjectStatus.PURGING, old);
        save(uniqueKey("club/logo"), UploadedObjectStatus.ACTIVE, old);
        save(uniqueKey("club/logo"), UploadedObjectStatus.PURGED, old);
        save(uniqueKey("club/logo"), UploadedObjectStatus.PENDING, recent);
        UploadedObject thirdOld = save(uniqueKey("club/logo"), UploadedObjectStatus.PENDING, old);

        Instant cutoff = now.minus(24, ChronoUnit.HOURS);
        List<UploadedObject> all = uploadedObjectRepository.findPurgeCandidates(
                List.of(UploadedObjectStatus.PENDING, UploadedObjectStatus.PURGING), cutoff, PageRequest.of(0, 500));
        List<UploadedObject> limited = uploadedObjectRepository.findPurgeCandidates(
                List.of(UploadedObjectStatus.PENDING, UploadedObjectStatus.PURGING), cutoff, PageRequest.of(0, 2));

        assertThat(all).extracting(UploadedObject::getId)
                .containsExactly(oldPending.getId(), oldPurging.getId(), thirdOld.getId());
        assertThat(limited).extracting(UploadedObject::getId)
                .containsExactly(oldPending.getId(), oldPurging.getId());
    }

    @Test
    @DisplayName("참조 스캔은 동아리 로고·커버 URL 이 키로 끝나면 참조 있음으로 판정한다")
    void detectsClubLogoAndCoverReference() {
        String logoKey = uniqueKey("club/logo");
        String coverKey = uniqueKey("club/cover");
        Club club = Club.create("참조클럽-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, null, "설명",
                "https://files.example.com/" + logoKey);
        club.update(new Club.UpdatePayload(null, null, null, null, null, "https://files.example.com/" + coverKey,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null));
        clubRepository.save(club);

        assertThat(uploadedObjectRepository.isReferenced(logoKey)).isTrue();
        assertThat(uploadedObjectRepository.isReferenced(coverKey)).isTrue();
        assertThat(uploadedObjectRepository.isReferenced(uniqueKey("club/logo"))).isFalse();
    }

    @Test
    @DisplayName("참조 스캔은 동아리 사진의 storage_key(URL 또는 키)와 공지 본문 안의 URL 을 잡는다")
    void detectsClubPhotoAndNoticeBodyReference() {
        Club club = clubRepository.save(Club.create("사진클럽-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, null, "설명", null));
        String photoUrlKey = uniqueKey("club/photo");
        String photoRawKey = uniqueKey("club/photo");
        clubPhotoRepository.save(ClubPhoto.create(club, "/files/stub/" + photoUrlKey, null, null, null, 0));
        clubPhotoRepository.save(ClubPhoto.create(club, photoRawKey, null, null, null, 1));

        String bodyKey = uniqueKey("notice/body");
        Long authorId = userRepository.save(UserFixture.unique()).getId(); // notice.author_id 는 users FK
        // 본문 이미지는 절대 URL 로 넣는다 — NoticeHtmlSanitizer(jsoup)가 img src 를 http(s) 로만 허용해
        // 상대경로는 저장 시점에 통째로 제거된다. 실제 저장 본문도 업로드 응답의 절대 URL 이다.
        noticeRepository.save(Notice.create("제목", "요약",
                "<p>본문</p><img src=\"https://files.example.com/" + bodyKey + "\" alt=\"\"><p>끝</p>",
                "", null, NoticeCategory.GENERAL, List.of(), NoticeVisibility.PUBLIC, null,
                false, null, false, null, null, null, null, null, NoticeContentFormat.HTML, authorId));

        assertThat(uploadedObjectRepository.isReferenced(photoUrlKey)).isTrue();
        assertThat(uploadedObjectRepository.isReferenced(photoRawKey)).isTrue();
        assertThat(uploadedObjectRepository.isReferenced(bodyKey)).isTrue();
    }

    @Test
    @DisplayName("참조 스캔은 문의 첨부의 storage_key 정확 일치를 잡는다")
    void detectsFederationInquiryAttachmentReference() {
        Long authorId = userRepository.save(UserFixture.unique()).getId(); // federation_inquiry.author_id 는 users FK
        FederationInquiry inquiry = federationInquiryRepository.save(FederationInquiry.create(authorId, "제목", "내용"));
        String attachmentKey = uniqueKey("federation/inquiry");
        federationInquiryAttachmentRepository.save(FederationInquiryAttachment.create(
                inquiry, attachmentKey, "첨부 이미지 1", "image/jpeg", 1024L, 0));

        assertThat(uploadedObjectRepository.isReferenced(attachmentKey)).isTrue();
    }
}
