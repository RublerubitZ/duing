package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.photo.repository.ClubPhotoRepository;
import com.duing.domain.club.photo.service.ClubPhotoService;
import com.duing.domain.club.photo.service.dto.command.CreateClubPhotoCommand;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.command.CreateClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubCommand;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.entity.UploadedObjectStatus;
import com.duing.global.file.repository.UploadedObjectRepository;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.lang.reflect.Field;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

/** 동아리 도메인의 업로드 활성화 지점(스펙 §3.4: LOGO·COVER·PHOTO) + 만료 업로드 400 HTTP 계약(§6). */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubUploadActivationTest extends IntegrationTestBase {

    private static final String STUB_PREFIX = "/files/stub/";

    @LocalServerPort int port;
    @Autowired ClubService clubService;
    @Autowired ClubPhotoService clubPhotoService;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubPhotoRepository clubPhotoRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;
    @Autowired UploadedObjectRepository uploadedObjectRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUpPort() {
        RestAssured.port = port;
    }

    private String seedPending(FilePurpose purpose) {
        String storageKey = purpose.directory() + "/" + sequence.incrementAndGet() + ".jpg";
        uploadedObjectRepository.save(UploadedObject.pending(storageKey, purpose, 1L, Instant.now()));
        return storageKey;
    }

    private String seedPurged(FilePurpose purpose) {
        String storageKey = purpose.directory() + "/" + sequence.incrementAndGet() + ".jpg";
        UploadedObject uploadedObject = UploadedObject.pending(storageKey, purpose, 1L, Instant.now());
        uploadedObject.markPurging();
        uploadedObject.markPurged(Instant.now());
        uploadedObjectRepository.save(uploadedObject);
        return storageKey;
    }

    private UploadedObjectStatus statusOf(String storageKey) {
        return uploadedObjectRepository.findByStorageKey(storageKey).orElseThrow().getStatus();
    }

    private Club saveActiveClub() throws Exception {
        Club club = Club.create("활성화클럽-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private UpdateClubCommand updateImages(Long clubId, Long requesterId, String logoUrl, String coverUrl) {
        return new UpdateClubCommand(
                clubId, requesterId,
                null, null, null, null, logoUrl, coverUrl,
                null, null, null,
                null, null, null, null, null, null, null,
                null, null, null, null,
                null, null, null, null, null, null, null);
    }

    @Test
    @DisplayName("총동연이 동아리를 등록하면 로고 업로드가 ACTIVE 가 된다")
    void adminCreateActivatesLogo() {
        User leader = userRepository.save(UserFixture.unique());
        String logoKey = seedPending(FilePurpose.LOGO);

        clubService.create(new CreateClubCommand("등록클럽-" + sequence.incrementAndGet(), ClubCategory.ACADEMIC,
                null, "설명", STUB_PREFIX + logoKey, leader.getId(), false, null, null));

        assertThat(statusOf(logoKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("운영진이 동아리 정보를 수정하면 로고·커버 업로드가 모두 ACTIVE 가 된다")
    void leaderUpdateActivatesLogoAndCover() throws Exception {
        User leader = userRepository.save(UserFixture.unique());
        Club club = saveActiveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        String logoKey = seedPending(FilePurpose.LOGO);
        String coverKey = seedPending(FilePurpose.COVER);

        clubService.update(updateImages(club.getId(), leader.getId(), STUB_PREFIX + logoKey, STUB_PREFIX + coverKey));

        assertThat(statusOf(logoKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        assertThat(statusOf(coverKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("총동연이 동아리 정보를 수정해도 같은 경로로 로고 업로드가 ACTIVE 가 된다")
    void adminUpdateActivatesLogo() throws Exception {
        Club club = saveActiveClub();
        String logoKey = seedPending(FilePurpose.LOGO);

        clubService.updateAsAdmin(updateImages(club.getId(), null, STUB_PREFIX + logoKey, null));

        assertThat(statusOf(logoKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("활동 사진을 등록하면 사진 업로드가 ACTIVE 가 된다")
    void photoCreateActivatesPhoto() throws Exception {
        User leader = userRepository.save(UserFixture.unique());
        Club club = saveActiveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        String photoKey = seedPending(FilePurpose.PHOTO);

        clubPhotoService.create(new CreateClubPhotoCommand(
                club.getId(), leader.getId(), STUB_PREFIX + photoKey, "캡션", 100, 100));

        assertThat(statusOf(photoKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
    }

    @Test
    @DisplayName("이미 파기된 업로드로 활동 사진을 등록하면 400 과 만료 안내 메시지를 받고 사진은 저장되지 않는다")
    void purgedUploadIsRejectedWithExpiredMessageOverHttp() throws Exception {
        User leader = userRepository.save(UserFixture.unique());
        Club club = saveActiveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        String purgedKey = seedPurged(FilePurpose.PHOTO);
        String token = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(ContentType.JSON)
                .body("""
                    { "storageKey": "%s", "caption": "만료", "width": 100, "height": 100 }
                    """.formatted(STUB_PREFIX + purgedKey))
            .when()
                .post("/api/v1/clubs/" + club.getId() + "/photos")
            .then()
                .statusCode(HttpStatus.BAD_REQUEST.value())
                .body("message", org.hamcrest.Matchers.equalTo("업로드한 이미지가 만료되었습니다. 다시 업로드해주세요."));

        assertThat(clubPhotoRepository.findByClubId(club.getId())).isEmpty();
        assertThat(statusOf(purgedKey)).isEqualTo(UploadedObjectStatus.PURGED);
    }
}
