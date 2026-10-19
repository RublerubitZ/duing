package com.duing.domain.user.profilecheck.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.profilecheck.entity.ProfileCheckConfirmation;
import com.duing.domain.user.profilecheck.entity.ProfileCheckSetting;
import com.duing.domain.user.profilecheck.entity.Semester;
import com.duing.domain.user.repository.UserRepository;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ProfileCheckPersistenceTest extends IntegrationTestBase {

    @Autowired
    private ProfileCheckSettingRepository settingRepository;

    @Autowired
    private ProfileCheckConfirmationRepository confirmationRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private TransactionTemplate transactionTemplate;

    @Test
    @DisplayName("설정 행 선삽입은 처음 한 번만 기본 문구·꺼짐 상태로 행을 만들고, 다시 불러도 기존 값을 바꾸지 않는다")
    void insertIfAbsentCreatesDefaultRowOnce() {
        User firstAdmin = userRepository.save(UserFixture.admin());
        User secondAdmin = userRepository.save(UserFixture.admin());

        transactionTemplate.executeWithoutResult(status -> settingRepository.insertIfAbsent(
                ProfileCheckSetting.SINGLETON_ID, ProfileCheckSetting.DEFAULT_TITLE,
                ProfileCheckSetting.DEFAULT_MESSAGE, firstAdmin.getId()));
        transactionTemplate.executeWithoutResult(status -> settingRepository.insertIfAbsent(
                ProfileCheckSetting.SINGLETON_ID, "다른 제목", "다른 문구", secondAdmin.getId()));

        ProfileCheckSetting setting = settingRepository.findById(ProfileCheckSetting.SINGLETON_ID).orElseThrow();
        assertThat(settingRepository.count()).isEqualTo(1);
        assertThat(setting.isEnabled()).isFalse();
        assertThat(setting.recordedSemester()).isEmpty();
        assertThat(setting.getTitle()).isEqualTo("새 학기, 내 정보를 확인해 주세요.");
        assertThat(setting.getMessage()).startsWith("새 학기가 시작되었습니다!\n\n현재 등록된 학년과");
        assertThat(setting.getCreatedBy()).isEqualTo(firstAdmin.getId());
        assertThat(setting.getUpdatedBy()).isEqualTo(firstAdmin.getId());
        assertThat(setting.getCreatedAt()).isNotNull();
    }

    @Test
    @DisplayName("행잠금 조회는 선삽입된 설정 행을 찾는다")
    void findByIdForUpdateFindsInsertedRow() {
        User admin = userRepository.save(UserFixture.admin());

        Optional<ProfileCheckSetting> locked = transactionTemplate.execute(status -> {
            settingRepository.insertIfAbsent(ProfileCheckSetting.SINGLETON_ID, ProfileCheckSetting.DEFAULT_TITLE,
                    ProfileCheckSetting.DEFAULT_MESSAGE, admin.getId());
            return settingRepository.findByIdForUpdate(ProfileCheckSetting.SINGLETON_ID);
        });

        assertThat(locked).isPresent();
        assertThat(locked.get().getTitle()).isEqualTo(ProfileCheckSetting.DEFAULT_TITLE);
        assertThat(locked.get().isEnabled()).isFalse();
    }

    @Test
    @DisplayName("설정 행은 id 1 하나뿐이다 — 다른 id 로 넣으면 DB 가 거부한다")
    void secondSettingRowIsRejected() {
        User admin = userRepository.save(UserFixture.admin());

        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO profile_check_setting
                    (id, enabled, title, message, created_by, updated_by, created_at, updated_at)
                VALUES (2, FALSE, '제목', '문구', ?, ?, now(), now())
                """, admin.getId(), admin.getId()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("켜진 설정에는 학기가 있어야 한다 — 학기 없이 켜진 행은 DB 가 거부한다")
    void enabledSettingRequiresSemester() {
        User admin = userRepository.save(UserFixture.admin());

        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO profile_check_setting
                    (id, enabled, title, message, created_by, updated_by, created_at, updated_at)
                VALUES (1, TRUE, '제목', '문구', ?, ?, now(), now())
                """, admin.getId(), admin.getId()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("같은 사용자·같은 학기 확인 기록을 두 번 넣으면 DB 가 거부한다")
    void duplicateConfirmationIsRejectedByDatabase() {
        User student = userRepository.save(UserFixture.unique());
        Semester semester = new Semester(2027, Semester.FIRST_TERM);
        confirmationRepository.saveAndFlush(
                ProfileCheckConfirmation.of(student.getId(), semester, Instant.parse("2027-03-02T00:00:00Z")));

        assertThatThrownBy(() -> confirmationRepository.saveAndFlush(
                ProfileCheckConfirmation.of(student.getId(), semester, Instant.parse("2027-03-03T00:00:00Z"))))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("같은 사용자라도 학기가 다르면 확인 기록을 따로 남긴다")
    void confirmationsAreKeptPerSemester() {
        User student = userRepository.save(UserFixture.unique());

        confirmationRepository.saveAndFlush(ProfileCheckConfirmation.of(student.getId(),
                new Semester(2026, Semester.SECOND_TERM), Instant.parse("2026-09-02T00:00:00Z")));
        confirmationRepository.saveAndFlush(ProfileCheckConfirmation.of(student.getId(),
                new Semester(2027, Semester.FIRST_TERM), Instant.parse("2027-03-02T00:00:00Z")));

        assertThat(confirmationRepository.count()).isEqualTo(2);
    }
}
