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
import java.time.LocalDate;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
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
 *
 * <p>같은 릴리스에서 Expand 와 Contract 를 섞는 새 마이그레이션을 막는 정적 가드는
 * {@link MigrationExpandContractGuardTest} 에 순수 JUnit 으로 분리되어 있다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class MigrationRollbackSafetyTest extends IntegrationTestBase {

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

}
