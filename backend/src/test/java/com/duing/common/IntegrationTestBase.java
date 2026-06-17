package com.duing.common;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 통합 테스트 공통 기반 클래스.
 *
 * <p>각 테스트 메서드 전에 DB 의 모든 도메인 테이블을 TRUNCATE 해 테스트 간 데이터 오염을 방지한다.
 * RestAssured 컨트롤러 테스트처럼 @Transactional rollback 이 불가능한 HTTP 레벨 테스트에 사용한다.
 *
 * <p>TRUNCATE 순서: 자식 테이블(FK 참조) → 부모 테이블 순으로 나열해 외래키 제약 위반을 방지한다.
 * RESTART IDENTITY 로 PK 시퀀스도 초기화해 테스트 간 id 유출을 없앤다.
 */
public abstract class IntegrationTestBase {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void cleanDatabase() {
        // CASCADE 옵션으로 FK 순서 불문 일괄 TRUNCATE.
        // RESTART IDENTITY: PK 시퀀스 초기화 → 테스트 간 id 누출 방지.
        jdbcTemplate.execute(
                "TRUNCATE TABLE " +
                "fee_bill, " +
                "fee_policy, " +
                "fee_account, " +
                "interview_schedule, " +
                "interview_availability, " +
                "interview_slot, " +
                "interview_round_member, " +
                "interview_round, " +
                "application_evaluation, " +
                "application_status_history, " +
                "application, " +
                "application_draft, " +
                "recruitment_form, " +
                "club_member, " +
                "club_member_history, " +
                "club_favorite, " +
                "recruitment, " +
                "club_photo, " +
                "club_event, " +
                "global_event, " +
                "notice_broadcast_read, " +
                "notice_broadcast, " +
                "notice_target_club, " +
                "notice, " +
                "notification, " +
                "report, " +
                "leader_succession_request, " +
                "recertification_request, " +
                "recertification_round, " +
                "promotion, " +
                "promotion_request, " +
                "email_verifications, " +
                "club, " +
                "users " +
                "RESTART IDENTITY CASCADE"
        );
    }
}
