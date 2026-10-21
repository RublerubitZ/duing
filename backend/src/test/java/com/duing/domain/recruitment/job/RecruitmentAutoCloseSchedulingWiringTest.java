package com.duing.domain.recruitment.job;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.federation.config.FederationInquiryPurgeJobConfig;
import com.duing.domain.fee.job.MonthlyBillIssueJob;
import com.duing.domain.fee.job.OverdueBillJob;
import com.duing.domain.notification.job.DeadlineNotificationJob;
import com.duing.domain.notification.job.InterviewReminderJob;
import com.duing.domain.recruitment.config.RecruitmentAutoCloseJobConfig;
import com.duing.global.frontend.ClubDetailDailyRevalidationJob;
import com.duing.global.privacy.PiiRetentionJobConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;

/**
 * 모집 자동 마감 잡의 스케줄 자급 + 격리 회귀 테스트 (FederationInquiryPurgeSchedulingWiringTest 전례).
 * recruitment.auto-close 플래그만 켜도 RecruitmentAutoCloseJobConfig 가 스케줄러를 활성화하지만,
 * 다른 잡들은 자기 플래그로 격리돼 있어 함께 깨우지 않음을 검증한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "duing.recruitment.auto-close.enabled=true",
        "duing.notification.jobs.enabled=false",
        "duing.privacy.retention.enabled=false",
        "duing.fee.overdue.enabled=false",
        "duing.fee.auto-issue.enabled=false",
        "duing.federation-inquiry.purge.enabled=false"
})
class RecruitmentAutoCloseSchedulingWiringTest extends IntegrationTestBase {

    @Autowired
    private ApplicationContext applicationContext;

    @Test
    @DisplayName("recruitment.auto-close 만 켜도 스케줄 설정이 활성화되며 RecruitmentAutoCloseJob 은 등록되고, "
            + "비활성 PII·알림·회비·문의 파기·상세 재생성 잡은 함께 깨우지 않는다")
    void recruitmentAutoCloseSchedulesItselfWithoutWakingOtherJobs() {
        assertThat(applicationContext.getBeanNamesForType(RecruitmentAutoCloseJobConfig.class)).isNotEmpty();
        assertThat(applicationContext.getBeanNamesForType(RecruitmentAutoCloseJob.class)).isNotEmpty();
        assertThat(applicationContext.getBeanNamesForType(PiiRetentionJobConfig.class)).isEmpty();
        assertThat(applicationContext.getBeanNamesForType(FederationInquiryPurgeJobConfig.class)).isEmpty();
        assertThat(applicationContext.getBeanNamesForType(DeadlineNotificationJob.class)).isEmpty();
        assertThat(applicationContext.getBeanNamesForType(InterviewReminderJob.class)).isEmpty();
        assertThat(applicationContext.getBeanNamesForType(OverdueBillJob.class)).isEmpty();
        assertThat(applicationContext.getBeanNamesForType(MonthlyBillIssueJob.class)).isEmpty();
        assertThat(applicationContext.getBeanNamesForType(ClubDetailDailyRevalidationJob.class)).isEmpty();
    }
}
