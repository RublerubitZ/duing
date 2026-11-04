package com.duing.domain.adminconsole.job;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.adminconsole.config.AdminPendingSnapshotJobConfig;
import com.duing.domain.fee.job.OverdueBillJob;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;

/**
 * 플래그 격리 회귀 테스트(NotificationJobConditionalWiringTest 전례) — 다른 잡이 전역 스케줄링을 켠 상태에서도
 * 자기 플래그가 꺼져 있으면 잡·설정 빈이 등록되지 않아야 한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "duing.admin.pending-snapshot.enabled=false",
        "duing.fee.overdue.enabled=true"
})
class AdminPendingSnapshotJobConditionalWiringTest extends IntegrationTestBase {

    @Autowired ApplicationContext applicationContext;

    @Test
    @DisplayName("처리 대기 기록 플래그가 꺼져 있으면 다른 잡으로 전역 스케줄링이 켜져 있어도 잡·설정 빈은 등록되지 않는다")
    void snapshotJobBeansAbsentWhenDisabledEvenIfSchedulingActive() {
        assertThat(applicationContext.getBeanNamesForType(AdminPendingSnapshotJob.class)).isEmpty();
        assertThat(applicationContext.getBeanNamesForType(AdminPendingSnapshotJobConfig.class)).isEmpty();
        // 대조: 자기 플래그가 켜진 잡 빈은 등록되어 전역 스케줄링이 실제로 활성임을 확인한다.
        assertThat(applicationContext.getBeanNamesForType(OverdueBillJob.class)).isNotEmpty();
    }
}
