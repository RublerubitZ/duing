package com.duing.global.privacy;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.fee.job.MonthlyBillIssueJob;
import com.duing.domain.fee.job.OverdueBillJob;
import com.duing.domain.notification.job.DeadlineNotificationJob;
import com.duing.domain.notification.job.InterviewReminderJob;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;

/**
 * PII 파기 잡의 스케줄 자급 + 격리 회귀 테스트.
 * privacy.retention 플래그만 켜도 PiiRetentionJobConfig 가 스케줄러를 활성화하지만,
 * 다른 잡들은 자기 플래그로 격리돼 있어 함께 깨우지 않음을 검증한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "duing.privacy.retention.enabled=true",
        "duing.notification.jobs.enabled=false",
        "duing.fee.overdue.enabled=false",
        "duing.fee.auto-issue.enabled=false"
})
class PrivacyRetentionSchedulingWiringTest extends IntegrationTestBase {

    @Autowired
    private ApplicationContext applicationContext;

    @Test
    @DisplayName("privacy.retention 만 켜도 스케줄 설정이 활성화되며 PiiRetentionJob 은 등록되고, 비활성 알림·회비 잡은 함께 깨우지 않는다")
    void privacyRetentionSchedulesItselfWithoutWakingOtherJobs() {
        // 자기 플래그만으로 스케줄러를 켜는 설정이 등록됐고, 파기 잡 빈도 존재한다.
        assertThat(applicationContext.getBeanNamesForType(PiiRetentionJobConfig.class)).isNotEmpty();
        assertThat(applicationContext.getBeanNamesForType(PiiRetentionJob.class)).isNotEmpty();
        // 전역 스케줄링이 켜졌어도 자기 플래그가 꺼진 잡들은 빈으로 등록되지 않는다.
        assertThat(applicationContext.getBeanNamesForType(DeadlineNotificationJob.class)).isEmpty();
        assertThat(applicationContext.getBeanNamesForType(InterviewReminderJob.class)).isEmpty();
        assertThat(applicationContext.getBeanNamesForType(OverdueBillJob.class)).isEmpty();
        assertThat(applicationContext.getBeanNamesForType(MonthlyBillIssueJob.class)).isEmpty();
    }
}
