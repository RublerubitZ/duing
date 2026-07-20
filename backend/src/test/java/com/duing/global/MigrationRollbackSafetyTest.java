package com.duing.global;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 배포 실패 시 자동 롤백(deploy-backend.yml)으로 <b>구 이미지</b>가 다시 뜨는 상황에서도
 * INSERT 가 깨지지 않는지 검증한다.
 *
 * <p>Flyway 마이그레이션은 롤백되지 않으므로, 구 이미지는 "새 릴리스가 추가한 컬럼을 모르는 상태"로
 * 최신 스키마 위에서 동작한다. Hibernate 는 매핑에 없는 컬럼을 INSERT 문에 아예 포함시키지 않으므로,
 * 그 컬럼이 NOT NULL 이고 DEFAULT 가 없으면 not-null 위반으로 INSERT 만 실패한다 — 앱은 healthy 라
 * 해당 기능만 조용히 500 이 되는 형태다.
 *
 * <p>아래 재현 테스트는 그 구 이미지의 INSERT 를 네이티브 쿼리로 그대로 흉내낸다(문제의 컬럼을
 * 컬럼 목록에서 아예 제외). V90 이 DEFAULT 를 되살렸으므로 INSERT 는 성공하고 기본값이 채워진다.
 * V90 을 지우고 실행하면 세 테스트 모두 not-null 위반으로 실패한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class MigrationRollbackSafetyTest extends IntegrationTestBase {

    /**
     * 제약 강화(Contract)를 포함해 이미 배포된 마이그레이션. 이 목록 밖의 파일에서
     * DROP DEFAULT / SET NOT NULL 이 발견되면 가드 테스트가 실패한다.
     */
    private static final Set<String> CONSTRAINT_TIGHTENING_ALLOWLIST = Set.of(
            // 사용자 프로필 필수화. grade·college·major·phone·terms_agreed_at 은 빈 문자열 기본값이
            // 의미상 틀리고(phone 은 CHECK 제약·부분 UNIQUE 인덱스까지 걸려 있다) 롤백 대상 릴리스가
            // 아주 오래됐으므로 DEFAULT 를 두지 않는다.
            "V19__add_user_profile_columns.sql",
            // application.version DROP DEFAULT — V90 이 DEFAULT 0 을 되살려 중화했다.
            "V37__alter_application_add_version.sql",
            // leader_succession_request.version DROP DEFAULT — V90 이 DEFAULT 0 을 되살려 중화했다.
            "V39__alter_leader_succession_request_add_version.sql",
            // facility_booking.contact_phone DROP DEFAULT — V90 이 DEFAULT '' 를 되살려 중화했다.
            "V85__facility_booking_contact_phone.sql"
    );

    private static final String MIGRATION_DIRECTORY = "db/migration";

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ClubRepository clubRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private FacilityRepository facilityRepository;

    @Autowired
    private RecruitmentRepository recruitmentRepository;

    @Test
    @DisplayName("contact_phone 을 모르는 구 이미지가 시설 대관 신청을 INSERT 해도 실패하지 않고 빈 문자열이 채워진다")
    void facilityBookingInsertSucceedsWithoutContactPhoneColumn() {
        Club club = clubRepository.save(ClubFixture.academic("롤백안전동아리-" + sequence.getAndIncrement()));
        User applicant = userRepository.save(UserFixture.unique());
        // room_seq 는 UNIQUE 지만 IntegrationTestBase 가 매 테스트 전 facility 를 TRUNCATE 하므로 고정값이면 충분하다.
        Facility facility = facilityRepository.save(Facility.create(90001, "커뮤니티룸", "1503호", 0));

        // V85 이전 이미지의 INSERT 형태 — contact_phone 이 컬럼 목록에 존재하지 않는다.
        jdbcTemplate.update(
                "INSERT INTO facility_booking "
                        + "(facility_id, club_id, applicant_id, reservation_date, start_time, end_time, purpose) "
                        + "VALUES (?, ?, ?, ?, TIME '10:00', TIME '12:00', ?)",
                facility.getId(), club.getId(), applicant.getId(), LocalDate.now().plusDays(7), "정기 회의");

        String contactPhone = jdbcTemplate.queryForObject(
                "SELECT contact_phone FROM facility_booking WHERE club_id = ?", String.class, club.getId());
        assertThat(contactPhone).isEmpty();
    }

    @Test
    @DisplayName("version 을 모르는 구 이미지가 지원서를 INSERT 해도 실패하지 않고 0 이 채워진다")
    void applicationInsertSucceedsWithoutVersionColumn() {
        Club club = clubRepository.save(ClubFixture.academic("롤백안전동아리-" + sequence.getAndIncrement()));
        User applicant = userRepository.save(UserFixture.unique());
        Recruitment recruitment = recruitmentRepository.save(Recruitment.createWithOptions(
                club, "롤백 안전 모집", null, LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10,
                ApplicationMode.SELF, null, false, TargetRole.MEMBER, null, null, false));

        // V37 이전 이미지의 INSERT 형태 — version 이 컬럼 목록에 존재하지 않는다.
        jdbcTemplate.update(
                "INSERT INTO application (recruitment_id, user_id, answers) VALUES (?, ?, '[]'::jsonb)",
                recruitment.getId(), applicant.getId());

        Long version = jdbcTemplate.queryForObject(
                "SELECT version FROM application WHERE user_id = ?", Long.class, applicant.getId());
        assertThat(version).isZero();
    }

    @Test
    @DisplayName("version 을 모르는 구 이미지가 회장 승계 요청을 INSERT 해도 실패하지 않고 0 이 채워진다")
    void leaderSuccessionRequestInsertSucceedsWithoutVersionColumn() {
        Club club = clubRepository.save(ClubFixture.academic("롤백안전동아리-" + sequence.getAndIncrement()));
        User requester = userRepository.save(UserFixture.unique());

        // V39 이전 이미지의 INSERT 형태 — version 이 컬럼 목록에 존재하지 않는다.
        jdbcTemplate.update(
                "INSERT INTO leader_succession_request (club_id, requester_user_id, reason) VALUES (?, ?, ?)",
                club.getId(), requester.getId(), "회장 승계 사유");

        Long version = jdbcTemplate.queryForObject(
                "SELECT version FROM leader_succession_request WHERE club_id = ?", Long.class, club.getId());
        assertThat(version).isZero();
    }

    @Test
    @DisplayName("새 마이그레이션이 DROP DEFAULT·SET NOT NULL 로 제약을 강화하면 실패한다 — 자동 롤백 시 구 이미지의 INSERT 가 깨진다")
    void newMigrationsMustNotTightenColumnConstraints() throws IOException {
        List<String> unexpectedFiles = listMigrationFiles().stream()
                .filter(this::tightensColumnConstraint)
                .map(File::getName)
                .filter(fileName -> !CONSTRAINT_TIGHTENING_ALLOWLIST.contains(fileName))
                .sorted()
                .toList();

        assertThat(unexpectedFiles)
                .as("이 마이그레이션들이 컬럼 제약을 강화한다(DROP DEFAULT / SET NOT NULL). "
                        + "배포 실패 시 자동 롤백으로 구 이미지가 다시 뜨는데 Flyway 는 되돌아가지 않으므로, "
                        + "구 이미지가 모르는 NOT NULL 컬럼에 DEFAULT 가 없으면 해당 기능의 INSERT 만 조용히 500 이 된다. "
                        + "같은 릴리스에서는 컬럼 추가(Expand)까지만 하고, 제약 강화(Contract)는 구 이미지 재배포 "
                        + "가능성이 사라진 다음 릴리스에서 별도로 수행하라. "
                        + "의도적인 예외라면 CONSTRAINT_TIGHTENING_ALLOWLIST 에 근거와 함께 추가하라.")
                .isEmpty();
    }

    private List<File> listMigrationFiles() throws IOException {
        File[] migrationFiles = new ClassPathResource(MIGRATION_DIRECTORY).getFile()
                .listFiles((directory, fileName) -> fileName.endsWith(".sql"));
        // 디렉터리를 못 읽으면 스캔 결과가 빈 목록이 되어 가드가 조용히 무력화되므로 여기서 끊는다.
        assertThat(migrationFiles).as("마이그레이션 디렉터리를 읽지 못했다").isNotNull().isNotEmpty();
        return Arrays.asList(migrationFiles);
    }

    private boolean tightensColumnConstraint(File migrationFile) {
        try {
            // 주석(-- ...)은 제거하고 실행문만 본다. 롤백 안전 규칙을 설명하는 주석이
            // "DROP DEFAULT" 를 언급하는 것만으로 가드에 걸리면 안 된다(V90 이 그런 경우다).
            String executableSql = Files.readString(migrationFile.toPath(), StandardCharsets.UTF_8)
                    .replaceAll("--[^\n]*", "")
                    .toUpperCase();
            return executableSql.contains("DROP DEFAULT") || executableSql.contains("SET NOT NULL");
        } catch (IOException readFailure) {
            throw new IllegalStateException("마이그레이션 파일을 읽지 못했다: " + migrationFile.getName(), readFailure);
        }
    }
}
