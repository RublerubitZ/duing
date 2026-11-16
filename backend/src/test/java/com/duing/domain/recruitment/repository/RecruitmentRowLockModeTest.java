package com.duing.domain.recruitment.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 모집 행 잠금(findByIdForUpdate)의 PG 잠금 모드 가드 — 수정은 모집 행 → 폼 FOR UPDATE, 제출은 폼 FOR SHARE → 모집 KEY SHARE 로
 * 방향이 반대라 잠금이 FOR UPDATE 가 되면 교착이다. 'KEY SHARE 는 통과, SHARE 는 막힘'은 잠금이 정확히 FOR NO KEY UPDATE 일
 * 때만 성립한다(FOR SHARE 로 약해지면 SHARE 가 통과하고, FOR UPDATE 로 세지면 KEY SHARE 가 막힌다). Boot 4/Hibernate 7
 * 업그레이드 때 이 테스트가 먼저 깨져야 한다.
 * 동아리 폐쇄(GeneralClubClosureService)의 같은 전제(PESSIMISTIC_WRITE = FOR NO KEY UPDATE)도 이 테스트가 지킨다.
 * 모집 생성(club → 모집)과 강제 마감·삭제·가입 코드 발급(모집 → club KEY SHARE)이 교착하지 않는 전제(club 잠금 = FOR NO KEY UPDATE)도 이 테스트가 지킨다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class RecruitmentRowLockModeTest extends IntegrationTestBase {

    private static final String LOCK_NOT_AVAILABLE = "55P03";

    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired TransactionTemplate transactionTemplate;
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("모집 행 잠금은 지원 제출의 외래 키 확인(KEY SHARE)은 막지 않고 공유 잠금(SHARE)은 막는다 — 정확히 FOR NO KEY UPDATE 다")
    void rowLockIsExactlyForNoKeyUpdate() throws Exception {
        Club club = clubRepository.save(Club.create("잠금모드동아리", ClubCategory.ACADEMIC, "분과", "설명", null));
        Long recruitmentId = recruitmentRepository.save(Recruitment.create(club, "잠금모드모집", null,
                LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10)).getId();

        assertLockIsExactlyForNoKeyUpdate(() -> recruitmentRepository.findByIdForUpdate(recruitmentId).orElseThrow(),
                "recruitment", recruitmentId, "모집 행 잠금", () -> { });
    }

    @Test
    @DisplayName("모집 생성의 OPEN 모집 잠금 조회도 정확히 FOR NO KEY UPDATE 이고 club 행은 잠그지 않는다")
    void openRecruitmentLockIsExactlyForNoKeyUpdateAndLeavesClubUnlocked() throws Exception {
        Club club = clubRepository.save(Club.create("생성잠금동아리", ClubCategory.ACADEMIC, "분과", "설명", null));
        Long recruitmentId = recruitmentRepository.save(Recruitment.create(club, "생성잠금모집", null,
                LocalDate.now().minusDays(10), LocalDate.now().minusDays(3), 10)).getId();

        assertLockIsExactlyForNoKeyUpdate(
                () -> recruitmentRepository.findOpenByClubIdForUpdate(club.getId()).orElseThrow(),
                "recruitment", recruitmentId, "모집 행 잠금",
                // FOR UPDATE NOWAIT 는 그 행에 어떤 잠금이라도 있으면 막힌다 — 통과하면 새 조회가 club 행을 잠그지 않은 것이다.
                () -> assertThat(jdbcTemplate.queryForObject(
                        "SELECT id FROM club WHERE id = ? FOR UPDATE NOWAIT", Long.class, club.getId()))
                        .as("OPEN 모집 잠금 조회는 club 행을 잠그지 않는다(조인하면 잠금이 club 행까지 번진다)")
                        .isEqualTo(club.getId()));
    }

    @Test
    @DisplayName("동아리 행 잠금은 외래 키 확인(KEY SHARE)은 막지 않고 공유 잠금(SHARE)은 막는다 — 정확히 FOR NO KEY UPDATE 다")
    void clubRowLockIsExactlyForNoKeyUpdate() throws Exception {
        Club club = clubRepository.save(Club.create("동아리잠금동아리", ClubCategory.ACADEMIC, "분과", "설명", null));

        assertLockIsExactlyForNoKeyUpdate(() -> clubRepository.findByIdForUpdate(club.getId()).orElseThrow(),
                "club", club.getId(), "동아리 행 잠금", () -> { });
    }

    /**
     * 다른 연결에서 잠금을 쥔 채 그 행에 KEY SHARE 는 통과하고 SHARE 는 55P03 으로 막히는지 본다.
     * whileHeld 는 잠금을 쥔 동안(풀기 전에) 돈다 — 풀린 뒤에 돌면 늘 통과해 아무것도 가리지 못한다.
     */
    private void assertLockIsExactlyForNoKeyUpdate(Runnable acquireLock, String tableName, Long rowId,
                                                   String lockName, Runnable whileHeld) throws Exception {
        CountDownLatch lockHeld = new CountDownLatch(1);
        CountDownLatch mayRelease = new CountDownLatch(1);
        ExecutorService executor = Executors.newSingleThreadExecutor();

        try {
            // 다른 연결에서 잠금을 쥔 채 붙잡는다 — 아래 JdbcTemplate 질의는 트랜잭션 밖이라 별도 연결을 쓴다.
            Future<?> holding = executor.submit(() -> transactionTemplate.executeWithoutResult(transaction -> {
                acquireLock.run();
                lockHeld.countDown();
                awaitQuietly(mayRelease);
            }));
            assertThat(lockHeld.await(10, TimeUnit.SECONDS)).as(lockName + "을 획득").isTrue();

            assertThat(jdbcTemplate.queryForObject(
                    "SELECT id FROM " + tableName + " WHERE id = ? FOR KEY SHARE NOWAIT", Long.class, rowId))
                    .as("외래 키 확인 잠금(KEY SHARE)은 " + lockName + "과 호환된다")
                    .isEqualTo(rowId);
            // SHARE 가 막혀야 잠금이 실제로 쥐어져 있고 FOR SHARE 보다 세다 — 이 확인이 없으면 잠금이 빠지거나 약해져도 위 단언이 통과한다.
            assertThatThrownBy(() -> jdbcTemplate.queryForObject(
                    "SELECT id FROM " + tableName + " WHERE id = ? FOR SHARE NOWAIT", Long.class, rowId))
                    .as("공유 잠금(SHARE)은 " + lockName + "에 막힌다")
                    .isInstanceOf(DataAccessException.class)
                    .rootCause()
                    .isInstanceOfSatisfying(SQLException.class,
                            sqlException -> assertThat(sqlException.getSQLState()).isEqualTo(LOCK_NOT_AVAILABLE));
            whileHeld.run();

            mayRelease.countDown();
            holding.get(30, TimeUnit.SECONDS);
        } finally {
            mayRelease.countDown();
            executor.shutdownNow();
        }
    }

    private static void awaitQuietly(CountDownLatch latch) {
        try {
            latch.await(20, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(interrupted);
        }
    }
}
