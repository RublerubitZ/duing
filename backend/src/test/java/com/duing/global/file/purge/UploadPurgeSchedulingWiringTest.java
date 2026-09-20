package com.duing.global.file.purge;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.federation.config.FederationInquiryPurgeJobConfig;
import com.duing.domain.fee.job.MonthlyBillIssueJob;
import com.duing.domain.fee.job.OverdueBillJob;
import com.duing.domain.notification.job.DeadlineNotificationJob;
import com.duing.global.privacy.PiiRetentionJobConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;

/** 업로드 정리 잡의 스케줄 자급 + 격리 회귀 테스트(FederationInquiryPurgeSchedulingWiringTest 전례). */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "duing.upload.purge.enabled=true",
        "duing.federation-inquiry.purge.enabled=false",
        "duing.notification.jobs.enabled=false",
        "duing.privacy.retention.enabled=false",
        "duing.fee.overdue.enabled=false",
        "duing.fee.auto-issue.enabled=false"
})
class UploadPurgeSchedulingWiringTest extends IntegrationTestBase {

    @Autowired
    private ApplicationContext applicationContext;

    @Test
    @DisplayName("upload.purge 만 켜도 스케줄 설정이 활성화되며 UploadPurgeJob 은 등록되고, 비활성 문의 파기·PII·알림·회비 잡은 함께 깨우지 않는다")
    void uploadPurgeSchedulesItselfWithoutWakingOtherJobs() {
        assertThat(applicationContext.getBeanNamesForType(UploadPurgeJobConfig.class)).isNotEmpty();
        assertThat(applicationContext.getBeanNamesForType(UploadPurgeJob.class)).isNotEmpty();
        assertThat(applicationContext.getBeanNamesForType(FederationInquiryPurgeJobConfig.class)).isEmpty();
        assertThat(applicationContext.getBeanNamesForType(PiiRetentionJobConfig.class)).isEmpty();
        assertThat(applicationContext.getBeanNamesForType(DeadlineNotificationJob.class)).isEmpty();
        assertThat(applicationContext.getBeanNamesForType(OverdueBillJob.class)).isEmpty();
        assertThat(applicationContext.getBeanNamesForType(MonthlyBillIssueJob.class)).isEmpty();
    }
}
