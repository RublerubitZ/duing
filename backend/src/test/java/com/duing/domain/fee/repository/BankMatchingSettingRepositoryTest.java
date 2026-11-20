package com.duing.domain.fee.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.fee.entity.BankMatchingSetting;
import java.sql.Timestamp;
import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 마지막 동기화 시각의 DB 계약 — 조건부 기록(켜진 설정에만·값을 뒤로 돌리지 않음·updated_at 불변)과 자동매칭을 끄면 비우기.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class BankMatchingSettingRepositoryTest extends IntegrationTestBase {

    private static final Instant SYNCED_AT = Instant.parse("2026-06-15T01:00:00Z");

    @Autowired
    private BankMatchingSettingRepository bankMatchingSettingRepository;

    @Autowired
    private ClubRepository clubRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    // @Modifying 쿼리는 활성 트랜잭션을 요구한다(TransactionRequiredException) — 동기화의 적재 트랜잭션처럼 템플릿 안에서 부른다.
    @Autowired
    private TransactionTemplate transactionTemplate;

    private Long saveSetting(boolean active) {
        Long clubId = clubRepository.save(ClubFixture.academic("동기화기억동아리")).getId();
        BankMatchingSetting setting = BankMatchingSetting.of(clubId);
        if (active) {
            setting.activate();
        }
        bankMatchingSettingRepository.save(setting);
        return clubId;
    }

    private int recordLastSyncedAt(Long clubId, Instant syncedAt) {
        return transactionTemplate.execute(status -> bankMatchingSettingRepository.recordLastSyncedAt(clubId, syncedAt));
    }

    private Instant lastSyncedAtOf(Long clubId) {
        return bankMatchingSettingRepository.findByClubId(clubId).orElseThrow().getLastSyncedAt();
    }

    private Timestamp updatedAtOf(Long clubId) {
        return jdbcTemplate.queryForObject(
                "SELECT updated_at FROM bank_matching_setting WHERE club_id = ?", Timestamp.class, clubId);
    }

    @Test
    @DisplayName("자동매칭이 켜진 설정에 처음 기록하면 1건이 바뀌고, 설정 변경이 아니라 updated_at 은 그대로다")
    void recordsOnActiveSettingWithoutTouchingUpdatedAt() {
        Long clubId = saveSetting(true);
        Timestamp updatedAtBefore = updatedAtOf(clubId);

        int updated = recordLastSyncedAt(clubId, SYNCED_AT);

        assertThat(updated).isEqualTo(1);
        assertThat(lastSyncedAtOf(clubId)).isEqualTo(SYNCED_AT);
        assertThat(updatedAtOf(clubId)).isEqualTo(updatedAtBefore);
    }

    @Test
    @DisplayName("기록된 시각보다 이르거나 같은 시각으로는 덮지 않고, 늦은 시각만 덮는다")
    void neverMovesBackward() {
        Long clubId = saveSetting(true);
        recordLastSyncedAt(clubId, SYNCED_AT);

        assertThat(recordLastSyncedAt(clubId, SYNCED_AT.minusSeconds(60))).isZero();
        assertThat(recordLastSyncedAt(clubId, SYNCED_AT)).isZero();
        assertThat(lastSyncedAtOf(clubId)).isEqualTo(SYNCED_AT);

        assertThat(recordLastSyncedAt(clubId, SYNCED_AT.plusSeconds(60))).isEqualTo(1);
        assertThat(lastSyncedAtOf(clubId)).isEqualTo(SYNCED_AT.plusSeconds(60));
    }

    @Test
    @DisplayName("자동매칭이 꺼진 설정에는 기록되지 않는다")
    void doesNotRecordOnInactiveSetting() {
        Long clubId = saveSetting(false);

        assertThat(recordLastSyncedAt(clubId, SYNCED_AT)).isZero();
        assertThat(lastSyncedAtOf(clubId)).isNull();
    }

    @Test
    @DisplayName("자동매칭을 끄면 기억한 마지막 동기화 시각이 비워진다")
    void deactivateClearsLastSyncedAt() {
        Long clubId = saveSetting(true);
        recordLastSyncedAt(clubId, SYNCED_AT);

        transactionTemplate.executeWithoutResult(status ->
                bankMatchingSettingRepository.findByClubId(clubId).orElseThrow().deactivate());

        assertThat(lastSyncedAtOf(clubId)).isNull();
    }
}
