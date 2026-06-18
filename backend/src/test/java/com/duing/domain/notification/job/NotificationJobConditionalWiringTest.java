package com.duing.domain.notification.job;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.fee.job.OverdueBillJob;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;

/**
 * 스케줄 잡 빈의 플래그 격리 회귀 테스트.
 * {@code @EnableScheduling} 은 전역이라, 다른 잡(여기선 회비 연체)의 설정으로 스케줄링이 켜진 상태에서도
 * 알림 잡들은 자기 플래그({@code duing.notification.jobs.enabled})가 꺼져 있으면 빈으로 등록되지 않아야 한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "duing.notification.jobs.enabled=false",
        // 다른 잡의 @EnableScheduling 을 켜 전역 스케줄링이 활성인 상태를 만든다(결합 시나리오 재현).
        "duing.fee.overdue.enabled=true"
})
class NotificationJobConditionalWiringTest extends IntegrationTestBase {

    @Autowired
    private ApplicationContext applicationContext;

    @Test
    @DisplayName("notification.jobs.enabled=false 면 다른 잡으로 전역 스케줄링이 켜져 있어도 알림 잡 빈은 등록되지 않는다")
    void notificationJobBeansAbsentWhenDisabledEvenIfSchedulingActive() {
        assertThat(applicationContext.getBeanNamesForType(DeadlineNotificationJob.class)).isEmpty();
        assertThat(applicationContext.getBeanNamesForType(InterviewReminderJob.class)).isEmpty();
        // 대조: 자기 플래그가 켜진 잡 빈은 등록되어 전역 스케줄링이 실제로 활성임을 확인한다.
        assertThat(applicationContext.getBeanNamesForType(OverdueBillJob.class)).isNotEmpty();
    }
}
