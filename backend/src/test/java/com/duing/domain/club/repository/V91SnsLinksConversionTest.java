package com.duing.domain.club.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubSnsLink;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * V91 마이그레이션의 sns_links 변환(구버전 X/YOUTUBE/WEB → OTHER + label)이
 * DB 레벨에서 정확히 동작하고, 변환 결과를 신코드가 정상 역직렬화하는지 검증한다.
 *
 * <p>변환 SQL 은 마이그레이션 원문 파일에서 그대로 추출해 실행한다 — 테스트가 SQL 을 복제하지 않아 드리프트하지 않는다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class V91SnsLinksConversionTest extends IntegrationTestBase {

    // V91 이 변환 대상으로 삼는 구버전(2키) sns_links — platform/url 만 있고 label 이 없다.
    private static final String LEGACY_SNS_LINKS =
            "[{\"platform\":\"X\",\"url\":\"https://x.com/doing\"},"
            + "{\"platform\":\"YOUTUBE\",\"url\":\"https://youtube.com/@doing\"},"
            + "{\"platform\":\"WEB\",\"url\":\"https://doing.club\"},"
            + "{\"platform\":\"INSTAGRAM\",\"url\":\"https://instagram.com/doing\"}]";

    private static final Path MIGRATION_FILE =
            Path.of("src/main/resources/db/migration/V91__club_profile_redesign.sql");

    @Autowired ClubRepository clubRepository;
    @Autowired JdbcTemplate jdbcTemplate;
    @PersistenceContext EntityManager entityManager;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("구버전 SNS 플랫폼(X·YOUTUBE·WEB)은 OTHER + 라벨로 변환되고 INSTAGRAM 과 배열 순서는 보존된다")
    void legacyPlatformsAreConvertedToOtherWithLabel() {
        Long clubId = seedClubWithLegacySnsLinks();

        runMigrationSnsConversion();

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT jsonb_array_length(sns_links) AS len, "
                + "sns_links->0->>'platform' AS p0, sns_links->0->>'label' AS l0, "
                + "sns_links->1->>'platform' AS p1, sns_links->1->>'label' AS l1, "
                + "sns_links->2->>'platform' AS p2, sns_links->2->>'label' AS l2, "
                + "sns_links->3->>'platform' AS p3, sns_links->3->>'label' AS l3, "
                + "sns_links->3->>'url' AS u3 "
                + "FROM club WHERE id = ?", clubId);

        assertThat(((Number) row.get("len")).intValue()).isEqualTo(4);
        assertThat(row.get("p0")).isEqualTo("OTHER");
        assertThat(row.get("l0")).isEqualTo("X");
        assertThat(row.get("p1")).isEqualTo("OTHER");
        assertThat(row.get("l1")).isEqualTo("YouTube");
        assertThat(row.get("p2")).isEqualTo("OTHER");
        assertThat(row.get("l2")).isEqualTo("Website");
        assertThat(row.get("p3")).isEqualTo("INSTAGRAM");
        assertThat(row.get("l3")).isNull();
        assertThat(row.get("u3")).isEqualTo("https://instagram.com/doing");
    }

    @Test
    @DisplayName("변환된 sns_links 를 엔티티로 다시 로드하면 신코드가 라벨까지 정상 역직렬화한다")
    void convertedSnsLinksDeserializeThroughEntity() {
        Long clubId = seedClubWithLegacySnsLinks();

        runMigrationSnsConversion();

        entityManager.clear();
        Club reloaded = clubRepository.findById(clubId).orElseThrow();
        List<ClubSnsLink> links = reloaded.getSnsLinks();

        assertThat(links).hasSize(4);
        assertThat(links.get(0).platform()).isEqualTo("OTHER");
        assertThat(links.get(0).label()).isEqualTo("X");
        assertThat(links.get(1).platform()).isEqualTo("OTHER");
        assertThat(links.get(1).label()).isEqualTo("YouTube");
        assertThat(links.get(2).platform()).isEqualTo("OTHER");
        assertThat(links.get(2).label()).isEqualTo("Website");
        assertThat(links.get(3).platform()).isEqualTo("INSTAGRAM");
        assertThat(links.get(3).label()).isNull();
    }

    @Test
    @DisplayName("변환 UPDATE 를 다시 실행해도 이미 변환된 sns_links 는 그대로 유지된다")
    void conversionIsIdempotent() {
        Long clubId = seedClubWithLegacySnsLinks();

        runMigrationSnsConversion();
        String afterFirstRun = jdbcTemplate.queryForObject(
                "SELECT sns_links::text FROM club WHERE id = ?", String.class, clubId);

        runMigrationSnsConversion();
        String afterSecondRun = jdbcTemplate.queryForObject(
                "SELECT sns_links::text FROM club WHERE id = ?", String.class, clubId);

        assertThat(afterSecondRun).isEqualTo(afterFirstRun);
    }

    private Long seedClubWithLegacySnsLinks() {
        String uniqueName = "V91변환대상-" + sequence.getAndIncrement();
        Club seededClub = clubRepository.saveAndFlush(
                Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", "https://logo"));
        jdbcTemplate.update(
                "UPDATE club SET sns_links = ?::jsonb WHERE id = ?", LEGACY_SNS_LINKS, seededClub.getId());
        return seededClub.getId();
    }

    /** V91 마이그레이션 원문에서 sns_links 변환 UPDATE 문을 그대로 추출해 실행한다(SQL 드리프트 방지). */
    private void runMigrationSnsConversion() {
        String migrationSql;
        try {
            migrationSql = Files.readString(MIGRATION_FILE);
        } catch (IOException fileReadFailure) {
            throw new IllegalStateException("V91 마이그레이션 파일을 읽을 수 없습니다.", fileReadFailure);
        }
        int updateStart = migrationSql.indexOf("UPDATE club");
        assertThat(updateStart).as("V91 에 UPDATE club 문이 존재해야 한다").isGreaterThanOrEqualTo(0);
        jdbcTemplate.update(migrationSql.substring(updateStart));
    }
}
