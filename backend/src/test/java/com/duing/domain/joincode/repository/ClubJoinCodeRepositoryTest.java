package com.duing.domain.joincode.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * 후속 PR(코드 확인·승인 차감)이 소비하는 조회 계약의 스모크.
 * 특히 {@code findWithLockById} 는 PESSIMISTIC_WRITE 라 트랜잭션 밖에서 호출하면 실패하므로,
 * 잠금 쿼리가 실제로 실행되는지(JPQL 파싱 + FOR UPDATE 발행)를 여기서 잠근다.
 *
 * <p>링크 2종의 형태 불변식(V107)은 엔티티 팩토리로는 어길 수 없으므로, DB CHECK 가 실제로
 * 걸려 있는지는 {@link JdbcTemplate} 네이티브 INSERT 로 확인한다. 클래스 레벨 {@code @Transactional}
 * 안에서 PostgreSQL 은 첫 제약 위반 뒤 트랜잭션을 abort 하므로 위반 INSERT 는 테스트당 1회만 넣는다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class ClubJoinCodeRepositoryTest {

    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Club club;
    private Recruitment recruitment;
    private Long clubId;
    private Long recruitmentId;

    @BeforeEach
    void saveClubAndRecruitment() {
        club = clubRepository.save(Club.create("가입코드레포-" + sequence.getAndIncrement(),
                ClubCategory.ACADEMIC, "분과", "설명", null));
        recruitment = recruitmentRepository.save(Recruitment.createWithOptions(club,
                "외부 폼 모집", "내용", LocalDate.now().minusDays(1), LocalDate.now().plusDays(14), 10,
                ApplicationMode.EXTERNAL, "https://forms.example.com/duing", false,
                TargetRole.MEMBER, null, null, false));
        clubId = club.getId();
        recruitmentId = recruitment.getId();
    }

    @Test
    @DisplayName("코드 문자열과 비관적 쓰기 잠금으로 가입 코드를 조회할 수 있다")
    void findByCodeAndFindWithLockById() {
        ClubJoinCode saved = clubJoinCodeRepository.save(joinCode());

        assertThat(clubJoinCodeRepository.findByCode(saved.getCode()))
                .as("코드 문자열 조회").isPresent()
                .get().extracting(ClubJoinCode::getId).isEqualTo(saved.getId());
        assertThat(clubJoinCodeRepository.findByCode("ZZZZZZ"))
                .as("없는 코드는 빈 결과").isEmpty();

        assertThat(clubJoinCodeRepository.findWithLockById(saved.getId()))
                .as("잠금 조회(FOR UPDATE)").isPresent()
                .get().extracting(ClubJoinCode::getCode).isEqualTo(saved.getCode());
    }

    @Test
    @DisplayName("모집에 귀속되지 않은 부원 초대 링크도 저장하고 코드로 다시 찾을 수 있다")
    void saveAndFindClubInviteCode() {
        ClubJoinCode saved = clubJoinCodeRepository.save(ClubJoinCode.issueClubInvite(club,
                nextCode(), 12, 40, LocalDateTime.now().plusDays(7), true, null));
        clubJoinCodeRepository.flush();

        assertThat(clubJoinCodeRepository.findById(saved.getId()))
                .as("모집 없는 행도 저장된다 — recruitment_id NOT NULL 해제(V107)").isPresent()
                .get().satisfies(found -> {
                    assertThat(found.isClubInvite()).isTrue();
                    assertThat(found.isAutoApprove()).isTrue();
                    assertThat(found.getInviteExpiresAt()).isNotNull();
                });
        assertThat(clubJoinCodeRepository.findByCode(saved.getCode()))
                .as("모집 조인이 걸린 학생용 조회에는 초대 링크가 잡히지 않는다(구 이미지 fail-closed)").isEmpty();
    }

    @Test
    @DisplayName("최대 인원이 150을 초과하는 가입 링크 행은 DB 가 거부한다")
    void maxUsesCheckRejectsOver150() {
        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO club_join_code (club_id, recruitment_id, code, max_uses, used_count, join_window_days) "
                        + "VALUES (?, ?, ?, 151, 0, 7)", clubId, recruitmentId, nextCode()))
                .hasMessageContaining("club_join_code_max_uses_check");
    }

    @Test
    @DisplayName("모집이 없는데 절대 만료도 없는 가입 링크 행은 DB 가 거부한다")
    void linkShapeCheckRejectsInviteWithoutExpiry() {
        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO club_join_code (club_id, code, max_uses, used_count, join_window_days) "
                        + "VALUES (?, ?, 40, 0, 0)", clubId, nextCode()))
                .hasMessageContaining("ck_club_join_code_link_shape");
    }

    @Test
    @DisplayName("모집에 귀속됐는데 절대 만료를 가진 가입 링크 행은 DB 가 거부한다")
    void linkShapeCheckRejectsRecruitmentWithExpiry() {
        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO club_join_code (club_id, recruitment_id, code, max_uses, used_count, join_window_days, invite_expires_at) "
                        + "VALUES (?, ?, ?, 40, 0, 7, NOW())", clubId, recruitmentId, nextCode()))
                .hasMessageContaining("ck_club_join_code_link_shape");
    }

    private ClubJoinCode joinCode() {
        return ClubJoinCode.issue(club, recruitment, nextCode(), 1, 30, 7, null);
    }

    /** code 는 전역 unique 이고 이 테스트는 다른 클래스가 남긴 행과 같은 DB 를 쓰므로 고정 코드를 쓰지 않는다. */
    private String nextCode() {
        return String.format("%06d", sequence.getAndIncrement() % 1_000_000);
    }
}
