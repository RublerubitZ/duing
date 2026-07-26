package com.duing.domain.user.entity;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.user.repository.AdminUserActionLogRepository;
import com.duing.domain.user.repository.UserRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

/**
 * 이 레포에서 @CreatedDate 를 Instant 로 받는 첫 엔티티라 감사 채움을 회귀 테스트로 고정한다.
 * Spring Data 의 LocalDateTime→Instant 변환이 빠지면 created_at 에 명시적 NULL 이 들어가
 * (컬럼 DEFAULT NOW() 로도 구제되지 않는) NOT NULL 위반이 런타임에 터진다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class AdminUserActionLogPersistenceTest extends IntegrationTestBase {

    @Autowired UserRepository userRepository;
    @Autowired AdminUserActionLogRepository adminUserActionLogRepository;

    @Test
    @DisplayName("관리자 조치 로그를 저장하면 기록 시각이 저장 시점으로 자동 채워지고 DB 에서 그대로 재조회된다")
    void createdAtIsAuditFilledOnSave() {
        Long actorUserId = userRepository.save(UserFixture.admin()).getId();
        Long targetUserId = userRepository.save(UserFixture.unique()).getId();

        Instant beforeSave = Instant.now();
        AdminUserActionLog savedLog = adminUserActionLogRepository.save(AdminUserActionLog.of(
                actorUserId, targetUserId, AdminUserAction.ACCOUNT_SUSPENDED, "규정 위반 신고 누적"));
        Instant afterSave = Instant.now();

        // 절대 날짜를 박지 않고 저장 전후 시각으로 감싼다 — 미래 날짜 하드코딩은 언젠가 CI 를 깨뜨린다.
        assertThat(savedLog.getCreatedAt())
                .isNotNull()
                .isBetween(beforeSave.minusSeconds(1), afterSave.plusSeconds(1));

        // 영속성 컨텍스트가 아니라 DB 에 실제로 들어갔는지 확인한다(Postgres timestamptz 는 마이크로초 정밀도).
        AdminUserActionLog reloadedLog = adminUserActionLogRepository.findById(savedLog.getId()).orElseThrow();
        assertThat(reloadedLog.getCreatedAt()).isEqualTo(savedLog.getCreatedAt().truncatedTo(ChronoUnit.MICROS));
    }
}
