package com.duing.domain.interview.repository;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * V49 라운드 중심 interview_* 테이블의 DB 제약을 검증하는 스키마 통합 테스트.
 *
 * <p>JdbcTemplate 으로 SQL 을 직접 실행하고 위반 예외를 확인한다.
 * FK 제약을 우회하기 위해 테스트 직전 {@code SET session_replication_role = 'replica'} 를 실행한다.
 * PostgreSQL 에서 이 설정은 FK 트리거를 비활성화하지만 CHECK/UNIQUE 제약은 정상 동작한다.
 *
 * <p>잔존 커밋 데이터(@SpringBootTest RANDOM_PORT 테스트들이 남긴 행)와의 ID 충돌을 피하기 위해
 * BIGSERIAL 시퀀스가 도달할 수 없는 큰 고정 ID 를 테스트별로 분리해 사용한다.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class InterviewRoundSchemaTest {

    // 잔존 커밋 데이터(@SpringBootTest RANDOM_PORT 테스트들이 남긴 행)와의 ID 충돌을 피하기 위해
    // BIGSERIAL 시퀀스가 도달할 수 없는 큰 고정 ID 를 테스트별로 분리해 사용한다.
    private static final long ROUND_STATUS_ID_BASE = 910_000L;
    private static final long DRAFT_UNIQUE_ID_BASE = 920_000L;
    private static final long DRAFT_COEXIST_ID_BASE = 930_000L;
    private static final long MEMBER_DUP_ID_BASE = 940_000L;
    private static final long MEMBER_STATUS_ID_BASE = 950_000L;
    private static final long SLOT_TIME_ID_BASE = 960_000L;
    private static final long SLOT_CAPACITY_ID_BASE = 970_000L;
    private static final long SCHEDULE_UNIQUE_ID_BASE = 980_000L;
    private static final long AVAILABILITY_DUP_ID_BASE = 990_000L;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private void bypassForeignKeys() {
        jdbcTemplate.execute("SET session_replication_role = 'replica'");
    }

    @Test
    @DisplayName("interview_round.status 가 5개 상태 외 값이면 CHECK 위반이 발생한다")
    void rejectsInvalidRoundStatus() {
        bypassForeignKeys();

        assertThatThrownBy(() ->
                jdbcTemplate.execute("""
                        INSERT INTO interview_round
                            (recruitment_id, title, status, request_sequence, version, created_at, updated_at)
                        VALUES (%d, '1차 면접', 'INVALID_STATUS', 0, 0, now(), now())
                        """.formatted(ROUND_STATUS_ID_BASE)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("같은 모집에 DRAFT 라운드를 두 개 만들면 partial unique 위반이 발생한다")
    void rejectsSecondDraftRoundPerRecruitment() {
        bypassForeignKeys();

        jdbcTemplate.execute("""
                INSERT INTO interview_round
                    (recruitment_id, title, status, request_sequence, version, created_at, updated_at)
                VALUES (%d, '1차 면접', 'DRAFT', 0, 0, now(), now())
                """.formatted(DRAFT_UNIQUE_ID_BASE));

        assertThatThrownBy(() ->
                jdbcTemplate.execute("""
                        INSERT INTO interview_round
                            (recruitment_id, title, status, request_sequence, version, created_at, updated_at)
                        VALUES (%d, '2차 면접', 'DRAFT', 0, 0, now(), now())
                        """.formatted(DRAFT_UNIQUE_ID_BASE)))
                .isInstanceOf(DataAccessException.class);
    }

    @Test
    @DisplayName("같은 모집이라도 DRAFT 가 아닌 라운드와 DRAFT 라운드는 공존할 수 있다")
    void allowsDraftAfterNonDraftRound() {
        bypassForeignKeys();

        jdbcTemplate.execute("""
                INSERT INTO interview_round
                    (recruitment_id, title, status, request_sequence, version, created_at, updated_at)
                VALUES (%d, '1차 면접', 'SCHEDULED', 1, 0, now(), now())
                """.formatted(DRAFT_COEXIST_ID_BASE));
        jdbcTemplate.execute("""
                INSERT INTO interview_round
                    (recruitment_id, title, status, request_sequence, version, created_at, updated_at)
                VALUES (%d, '2차 면접', 'DRAFT', 0, 0, now(), now())
                """.formatted(DRAFT_COEXIST_ID_BASE));
        // 예외 없이 통과하면 성공
    }

    @Test
    @DisplayName("interview_round_member 는 같은 라운드에 같은 지원서를 중복 등록할 수 없다")
    void rejectsDuplicateMemberInRound() {
        bypassForeignKeys();

        jdbcTemplate.execute("""
                INSERT INTO interview_round_member
                    (round_id, application_id, status, created_at, updated_at)
                VALUES (%d, %d, 'INVITED', now(), now())
                """.formatted(MEMBER_DUP_ID_BASE, MEMBER_DUP_ID_BASE));

        assertThatThrownBy(() ->
                jdbcTemplate.execute("""
                        INSERT INTO interview_round_member
                            (round_id, application_id, status, created_at, updated_at)
                        VALUES (%d, %d, 'RESPONDED', now(), now())
                        """.formatted(MEMBER_DUP_ID_BASE, MEMBER_DUP_ID_BASE)))
                .isInstanceOf(DataAccessException.class);
    }

    @Test
    @DisplayName("interview_round_member.status 가 5개 상태 외 값이면 CHECK 위반이 발생한다")
    void rejectsInvalidMemberStatus() {
        bypassForeignKeys();

        assertThatThrownBy(() ->
                jdbcTemplate.execute("""
                        INSERT INTO interview_round_member
                            (round_id, application_id, status, created_at, updated_at)
                        VALUES (%d, %d, 'NO_RESPONSE', now(), now())
                        """.formatted(MEMBER_STATUS_ID_BASE, MEMBER_STATUS_ID_BASE)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("interview_slot 의 end_time 이 start_time 이전이면 CHECK 위반이 발생한다")
    void rejectsSlotWithEndTimeBeforeStartTime() {
        bypassForeignKeys();

        assertThatThrownBy(() ->
                jdbcTemplate.execute("""
                        INSERT INTO interview_slot
                            (round_id, start_time, end_time, capacity, created_at, updated_at)
                        VALUES (%d, now() + interval '1 hour', now(), 5, now(), now())
                        """.formatted(SLOT_TIME_ID_BASE)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("interview_slot.capacity 가 0 이하이면 CHECK 위반이 발생한다")
    void rejectsSlotWithNonPositiveCapacity() {
        bypassForeignKeys();

        assertThatThrownBy(() ->
                jdbcTemplate.execute("""
                        INSERT INTO interview_slot
                            (round_id, start_time, end_time, capacity, created_at, updated_at)
                        VALUES (%d, now(), now() + interval '1 hour', 0, now(), now())
                        """.formatted(SLOT_CAPACITY_ID_BASE)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("interview_schedule 은 같은 라운드의 같은 지원서에 활성 일정을 두 개 만들 수 없고, soft delete 후 재생성은 허용한다")
    void schedulePerRoundPartialUnique() {
        bypassForeignKeys();

        jdbcTemplate.execute("""
                INSERT INTO interview_schedule
                    (round_id, application_id, slot_id, status, assigned_at, created_at, updated_at)
                VALUES (%d, %d, %d, 'ASSIGNED', now(), now(), now())
                """.formatted(SCHEDULE_UNIQUE_ID_BASE, SCHEDULE_UNIQUE_ID_BASE, SCHEDULE_UNIQUE_ID_BASE));

        // PostgreSQL 은 트랜잭션 안에서 제약 위반이 나면 트랜잭션이 abort 되므로 (25P02),
        // 위반 검증 후에도 같은 트랜잭션에서 후속 검증을 잇기 위해 SAVEPOINT 로 격리한다.
        jdbcTemplate.execute("SAVEPOINT before_duplicate_schedule");
        assertThatThrownBy(() ->
                jdbcTemplate.execute("""
                        INSERT INTO interview_schedule
                            (round_id, application_id, slot_id, status, assigned_at, created_at, updated_at)
                        VALUES (%d, %d, %d, 'ASSIGNED', now(), now(), now())
                        """.formatted(SCHEDULE_UNIQUE_ID_BASE, SCHEDULE_UNIQUE_ID_BASE, SCHEDULE_UNIQUE_ID_BASE + 1)))
                .isInstanceOf(DataAccessException.class);
        jdbcTemplate.execute("ROLLBACK TO SAVEPOINT before_duplicate_schedule");

        // 자동배정 재실행 경로: 기존 행 soft delete 후 재생성 허용 (스펙 §6.2)
        jdbcTemplate.execute("UPDATE interview_schedule SET deleted_at = now() WHERE round_id = %d".formatted(SCHEDULE_UNIQUE_ID_BASE));
        jdbcTemplate.execute("""
                INSERT INTO interview_schedule
                    (round_id, application_id, slot_id, status, assigned_at, created_at, updated_at)
                VALUES (%d, %d, %d, 'ASSIGNED', now(), now(), now())
                """.formatted(SCHEDULE_UNIQUE_ID_BASE, SCHEDULE_UNIQUE_ID_BASE, SCHEDULE_UNIQUE_ID_BASE + 1));
    }

    @Test
    @DisplayName("interview_availability 는 같은 지원서가 같은 슬롯을 중복 선택할 수 없다")
    void rejectsDuplicateAvailability() {
        bypassForeignKeys();

        jdbcTemplate.execute("""
                INSERT INTO interview_availability
                    (round_id, application_id, slot_id, created_at, updated_at)
                VALUES (%d, %d, %d, now(), now())
                """.formatted(AVAILABILITY_DUP_ID_BASE, AVAILABILITY_DUP_ID_BASE, AVAILABILITY_DUP_ID_BASE));

        assertThatThrownBy(() ->
                jdbcTemplate.execute("""
                        INSERT INTO interview_availability
                            (round_id, application_id, slot_id, created_at, updated_at)
                        VALUES (%d, %d, %d, now(), now())
                        """.formatted(AVAILABILITY_DUP_ID_BASE, AVAILABILITY_DUP_ID_BASE, AVAILABILITY_DUP_ID_BASE)))
                .isInstanceOf(DataAccessException.class);
    }
}
