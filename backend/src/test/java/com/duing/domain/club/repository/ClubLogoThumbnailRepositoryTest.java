package com.duing.domain.club.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository.ClubLogoThumbnailBackfillRow;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 로고 썸네일 컬럼의 DB 계약 — 조건부 반영(스펙 §4.3 3)·비우기(§4.3 1)·백필 대상 조회(§4.5), 그리고 엔티티 저장이 이 컬럼을
 * 쓰지 않는다는 것(updatable=false). 서버가 커밋 뒤 채우는 값이라 잠금 없이 읽은 동아리의 저장이 덮지 않아야 한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ClubLogoThumbnailRepositoryTest extends IntegrationTestBase {

    private static final String LOGO_A = "https://files.example.com/club/logo/a.png";
    private static final String LOGO_B = "https://files.example.com/club/logo/b.png";
    private static final String THUMBNAIL_A = "https://files.example.com/club/logo/a-thumb.png";
    private static final String THUMBNAIL_A_AGAIN = "https://files.example.com/club/logo/a2-thumb.png";

    @Autowired ClubRepository clubRepository;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired TransactionTemplate transactionTemplate;
    @Autowired PlatformTransactionManager platformTransactionManager;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Club saveClub(String logoUrl) {
        return clubRepository.save(Club.create("썸네일저장소-" + sequence.incrementAndGet(),
                ClubCategory.ACADEMIC, null, "설명", logoUrl));
    }

    // 폐쇄(soft-delete)된 행도 읽어야 해서 리포지토리(@SQLRestriction) 대신 SQL 로 본다.
    private String thumbnailUrlOf(Long clubId) {
        return jdbcTemplate.queryForObject("SELECT logo_thumbnail_url FROM club WHERE id = ?", String.class, clubId);
    }

    // UpdatePayload 27개 컴포넌트 — 15번째 tagline 만 채운다.
    private static Club.UpdatePayload taglineOnly(String tagline) {
        return new Club.UpdatePayload(null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                tagline, null, null, null, null, null, null, null, null, null, null, null, null);
    }

    @Test
    @DisplayName("조건부 반영은 생성에 쓴 원본이 현재 로고이고 썸네일이 비어 있을 때만 1건을 바꾸고, 현재 값 조회가 그 값을 돌려준다")
    void appliesWhenLogoUnchangedAndThumbnailEmpty() {
        Club club = saveClub(LOGO_A);

        int updated = clubRepository.setLogoThumbnailUrlIfLogoUnchanged(club.getId(), LOGO_A, THUMBNAIL_A);

        assertThat(updated).isEqualTo(1);
        assertThat(thumbnailUrlOf(club.getId())).isEqualTo(THUMBNAIL_A);
        assertThat(clubRepository.findLogoThumbnailUrlById(club.getId())).isEqualTo(THUMBNAIL_A);
    }

    @Test
    @DisplayName("그사이 로고가 바뀌었으면 조건부 반영은 0건이고 썸네일은 비어 있다")
    void doesNotApplyWhenLogoChangedMeanwhile() {
        Club club = saveClub(LOGO_B);

        int updated = clubRepository.setLogoThumbnailUrlIfLogoUnchanged(club.getId(), LOGO_A, THUMBNAIL_A);

        assertThat(updated).isZero();
        assertThat(thumbnailUrlOf(club.getId())).isNull();
        assertThat(clubRepository.findLogoThumbnailUrlById(club.getId())).isNull();
    }

    @Test
    @DisplayName("이미 썸네일이 있으면 두 번째 반영은 0건이고 먼저 반영된 값이 남는다")
    void doesNotOverwriteExistingThumbnail() {
        Club club = saveClub(LOGO_A);
        clubRepository.setLogoThumbnailUrlIfLogoUnchanged(club.getId(), LOGO_A, THUMBNAIL_A);

        int updated = clubRepository.setLogoThumbnailUrlIfLogoUnchanged(club.getId(), LOGO_A, THUMBNAIL_A_AGAIN);

        assertThat(updated).isZero();
        assertThat(thumbnailUrlOf(club.getId())).isEqualTo(THUMBNAIL_A);
    }

    @Test
    @DisplayName("폐쇄(soft-delete)된 동아리에는 조건부 반영이 0건이다")
    void doesNotApplyToDeletedClub() {
        Club club = saveClub(LOGO_A);
        clubRepository.delete(club);

        int updated = clubRepository.setLogoThumbnailUrlIfLogoUnchanged(club.getId(), LOGO_A, THUMBNAIL_A);

        assertThat(updated).isZero();
        assertThat(thumbnailUrlOf(club.getId())).isNull();
    }

    @Test
    @DisplayName("비우기는 썸네일을 NULL 로 만들고, 이미 비어 있어도 예외 없이 끝난다")
    void clearsThumbnail() {
        Club club = saveClub(LOGO_A);
        clubRepository.setLogoThumbnailUrlIfLogoUnchanged(club.getId(), LOGO_A, THUMBNAIL_A);

        clubRepository.clearLogoThumbnailUrl(club.getId());
        clubRepository.clearLogoThumbnailUrl(club.getId());

        assertThat(thumbnailUrlOf(club.getId())).isNull();
    }

    @Test
    @DisplayName("동아리를 읽은 뒤 커밋된 썸네일은 그 동아리의 다른 필드를 저장할 때 덮이지 않는다")
    void entitySaveDoesNotOverwriteThumbnailCommittedMeanwhile() {
        Club club = saveClub(LOGO_A);
        TransactionTemplate generationTransaction = new TransactionTemplate(platformTransactionManager);
        generationTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);

        transactionTemplate.executeWithoutResult(transactionStatus -> {
            Club loaded = clubRepository.findById(club.getId()).orElseThrow(); // 썸네일 NULL 스냅숏
            // 그사이 생성기가 별도 트랜잭션으로 썸네일을 반영하고 커밋한다.
            generationTransaction.executeWithoutResult(generationStatus ->
                    clubRepository.setLogoThumbnailUrlIfLogoUnchanged(club.getId(), LOGO_A, THUMBNAIL_A));
            loaded.update(taglineOnly("한줄소개 변경"));
        });

        assertThat(thumbnailUrlOf(club.getId())).isEqualTo(THUMBNAIL_A);
        assertThat(clubRepository.findById(club.getId()).orElseThrow().getTagline()).isEqualTo("한줄소개 변경");
    }

    @Test
    @DisplayName("백필 대상은 로고는 있고 썸네일이 없는 살아 있는 동아리만 id 오름차순으로, 상태와 함께 돌려준다")
    void backfillRowsAreLogoWithoutThumbnailOrderedById() {
        Club noLogo = saveClub(null);
        Club target = saveClub(LOGO_A);
        Club alreadyDone = saveClub(LOGO_B);
        clubRepository.setLogoThumbnailUrlIfLogoUnchanged(alreadyDone.getId(), LOGO_B, LOGO_B);
        Club deleted = saveClub(LOGO_A);
        clubRepository.delete(deleted);
        Club secondTarget = saveClub(LOGO_B);

        List<ClubLogoThumbnailBackfillRow> rows = clubRepository.findLogoThumbnailBackfillRows();

        assertThat(rows).extracting(ClubLogoThumbnailBackfillRow::getId)
                .containsExactly(target.getId(), secondTarget.getId());
        assertThat(rows.get(0).getLogoUrl()).isEqualTo(LOGO_A);
        assertThat(rows.get(0).getStatus()).isEqualTo(ClubStatus.PENDING_APPROVAL);
        assertThat(rows).extracting(ClubLogoThumbnailBackfillRow::getId)
                .doesNotContain(noLogo.getId(), alreadyDone.getId(), deleted.getId());
    }
}
