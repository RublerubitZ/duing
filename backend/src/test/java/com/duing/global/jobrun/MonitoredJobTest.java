package com.duing.global.jobrun;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.facility.scheduler.FacilityCrawlScheduler;
import com.duing.domain.facilitybooking.scheduler.FacilityBookingMatchingScheduler;
import com.duing.domain.federation.config.FederationInquiryPurgeJobConfig;
import com.duing.domain.federation.job.FederationInquiryPurgeJob;
import com.duing.domain.notification.job.ApplicationPendingReminderJob;
import com.duing.domain.recruitment.job.RecruitmentAutoCloseJob;
import java.lang.reflect.Method;
import java.time.Duration;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.support.CronExpression;

/** MonitoredJob 의 설정 이름·판정 값이 실제 잡과 어긋나지 않게 고정한다(플래그 이름이 바뀌면 "꺼짐" 판정이 조용히 틀어진다). */
class MonitoredJobTest {

    /** 작업마다 켜는 조건(@ConditionalOnProperty)이 붙은 클래스 — 문의 파기는 잡이 아니라 잡 설정 클래스에 붙어 있다. */
    private static final Map<MonitoredJob, Class<?>> CONDITION_HOLDERS = Map.of(
            MonitoredJob.RECRUITMENT_AUTO_CLOSE, RecruitmentAutoCloseJob.class,
            MonitoredJob.APPLICATION_PENDING_REMINDER, ApplicationPendingReminderJob.class,
            MonitoredJob.FACILITY_RESERVATION_CRAWL, FacilityCrawlScheduler.class,
            MonitoredJob.FACILITY_BOOKING_MATCHING, FacilityBookingMatchingScheduler.class,
            MonitoredJob.FEDERATION_INQUIRY_PURGE, FederationInquiryPurgeJobConfig.class);

    /** 작업마다 기록하는 @Scheduled 메서드. */
    private static final Map<MonitoredJob, Method> SCHEDULED_METHODS = Map.of(
            MonitoredJob.RECRUITMENT_AUTO_CLOSE, scheduledMethod(RecruitmentAutoCloseJob.class, "run"),
            MonitoredJob.APPLICATION_PENDING_REMINDER, scheduledMethod(ApplicationPendingReminderJob.class, "run"),
            MonitoredJob.FACILITY_RESERVATION_CRAWL, scheduledMethod(FacilityCrawlScheduler.class, "runReservationCrawl"),
            MonitoredJob.FACILITY_BOOKING_MATCHING, scheduledMethod(FacilityBookingMatchingScheduler.class, "runScheduled"),
            MonitoredJob.FEDERATION_INQUIRY_PURGE, scheduledMethod(FederationInquiryPurgeJob.class, "run"));

    private static Method scheduledMethod(Class<?> jobClass, String methodName) {
        try {
            return jobClass.getDeclaredMethod(methodName);
        } catch (NoSuchMethodException missingMethod) {
            throw new IllegalStateException(jobClass.getSimpleName() + "#" + methodName + " 이 없다", missingMethod);
        }
    }

    @Test
    @DisplayName("모든 작업 키의 켜는 설정 이름이 그 잡의 @ConditionalOnProperty(havingValue=true) 와 같다")
    void enabledPropertyMatchesJobCondition() {
        assertThat(CONDITION_HOLDERS).containsOnlyKeys(MonitoredJob.values());
        for (MonitoredJob job : MonitoredJob.values()) {
            ConditionalOnProperty condition = CONDITION_HOLDERS.get(job).getAnnotation(ConditionalOnProperty.class);
            assertThat(condition).as(job.name()).isNotNull();
            assertThat(condition.prefix() + "." + condition.name()[0]).as(job.name()).isEqualTo(job.getEnabledProperty());
            assertThat(condition.havingValue()).as(job.name()).isEqualTo("true");
        }
    }

    @Test
    @DisplayName("크론 주기가 늦음 기준(maxGap)보다 짧고, 주기 × 경고 연속 수가 그 안에 들어간다 — 정상 운영에서 늦음이 뜨지 않는다")
    void cronIntervalFitsWithinMaxGap() {
        assertThat(SCHEDULED_METHODS).containsOnlyKeys(MonitoredJob.values());
        for (MonitoredJob job : MonitoredJob.values()) {
            Scheduled scheduled = SCHEDULED_METHODS.get(job).getAnnotation(Scheduled.class);
            assertThat(scheduled).as(job.name()).isNotNull();
            CronExpression cron = CronExpression.parse(scheduled.cron());
            ZonedDateTime base = ZonedDateTime.of(2026, 10, 30, 12, 0, 0, 0, ZoneId.of(scheduled.zone()));
            ZonedDateTime firstFire = cron.next(base);
            ZonedDateTime secondFire = cron.next(firstFire);
            Duration interval = Duration.between(firstFire, secondFire);

            assertThat(interval).as(job.name()).isLessThan(job.getMaxGap());
            assertThat(interval.multipliedBy(job.getWarnAfterRuns())).as(job.name())
                    .isLessThanOrEqualTo(job.getMaxGap());
        }
    }
}
