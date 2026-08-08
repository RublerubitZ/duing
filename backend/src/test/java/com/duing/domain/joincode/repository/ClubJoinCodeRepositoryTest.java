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
import jakarta.persistence.EntityManager;
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
    @Autowired EntityManager entityManager;

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
    }

    @Test
    @DisplayName("부원 초대 링크는 귀속 모집이 없어도 코드로 조회된다")
    void findByCodeReturnsClubInvite() {
        String inviteCode = nextCode();
        clubJoinCodeRepository.save(ClubJoinCode.issueClubInvite(club, inviteCode, null, 40,
                LocalDateTime.now().plusHours(24), false, null));

        assertThat(clubJoinCodeRepository.findByCode(inviteCode))
                .as("모집 무귀속이 학생용 조회에서 걸러지면 초대 링크는 전부 404 가 된다").isPresent();
    }

    @Test
    @DisplayName("모집이 삭제된 가입 링크는 코드로 조회되지 않는다")
    void findByCodeExcludesDeadRecruitment() {
        // fail-closed(#869) 회귀 가드 — 모집 없는 링크를 통과시킨 뒤에도 죽은 모집의 링크는 404 여야 한다.
        String deadRecruitmentCode = nextCode();
        clubJoinCodeRepository.save(
                ClubJoinCode.issue(club, recruitment, deadRecruitmentCode, null, 40, 7, null));
        detachSavedCodes();
        recruitmentRepository.delete(recruitmentRepository.findById(recruitmentId).orElseThrow());
        recruitmentRepository.flush();   // @SQLDelete soft delete

        assertThat(clubJoinCodeRepository.findByCode(deadRecruitmentCode)).isEmpty();
    }

    @Test
    @DisplayName("동아리가 삭제된 부원 초대 링크는 코드로 조회되지 않는다")
    void findByCodeExcludesDeadClubInvite() {
        String deadClubInviteCode = nextCode();
        clubJoinCodeRepository.save(ClubJoinCode.issueClubInvite(club, deadClubInviteCode, null, 40,
                LocalDateTime.now().plusHours(24), false, null));
        detachSavedCodes();
        clubRepository.delete(clubRepository.findById(clubId).orElseThrow());
        clubRepository.flush();   // @SQLDelete soft delete

        assertThat(clubJoinCodeRepository.findByCode(deadClubInviteCode)).isEmpty();
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

    /**
     * 부모(동아리·모집)를 soft-delete 하기 전에 코드 행을 영속성 컨텍스트에서 내린다 —
     * 제거된 엔티티를 참조하는 코드 엔티티가 남아 있으면 flush 가 TransientObjectException 으로
     * 깨진다(ClubJoinCodeRepository 벌크 폐기 주석과 같은 함정).
     */
    private void detachSavedCodes() {
        clubJoinCodeRepository.flush();
        entityManager.clear();
    }

    private ClubJoinCode joinCode() {
        return ClubJoinCode.issue(club, recruitment, nextCode(), 1, 30, 7, null);
    }

    /** code 는 전역 unique 이고 이 테스트는 다른 클래스가 남긴 행과 같은 DB 를 쓰므로 고정 코드를 쓰지 않는다. */
    private String nextCode() {
        return String.format("%06d", sequence.getAndIncrement() % 1_000_000);
    }
}
