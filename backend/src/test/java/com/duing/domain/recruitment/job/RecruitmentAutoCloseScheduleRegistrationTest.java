package com.duing.domain.recruitment.job;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.config.CronTask;
import org.springframework.scheduling.config.ScheduledTask;
import org.springframework.scheduling.config.ScheduledTaskHolder;

/**
 * 플래그를 켜면 매일 크론이 스케줄링 등록기({@code ScheduledTaskHolder})에 등록되는지 검증 — 빈이 떠 있어도 @Scheduled
 * 등록이 조용히 빠지면 기간 종료 모집이 무기한 열려 있는 무음 고장이 된다(ClubDetailDailyRevalidationScheduleRegistrationTest 관례).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "duing.recruitment.auto-close.enabled=true")
class RecruitmentAutoCloseScheduleRegistrationTest {

    @Autowired ApplicationContext applicationContext;

    @Test
    @DisplayName("모집 자동 마감을 켜면 매일 00:40 크론이 그 잡 메서드로 스케줄러에 등록된다")
    void dailyCronIsRegisteredOnScheduler() {
        Set<ScheduledTask> scheduledTasks = applicationContext.getBeansOfType(ScheduledTaskHolder.class)
                .values().stream()
                .flatMap(holder -> holder.getScheduledTasks().stream())
                .collect(Collectors.toSet());

        // 표현식만 보면 다른 잡의 같은 크론에도 거짓 통과한다 — 대상 메서드까지 "클래스명.메서드명" 으로 짚는다.
        String runTarget = RecruitmentAutoCloseJob.class.getName() + ".run";
        boolean dailyCronRegistered = scheduledTasks.stream()
                .anyMatch(scheduledTask -> scheduledTask.getTask() instanceof CronTask cronTask
                        && cronTask.getExpression().equals("0 40 0 * * *")
                        && cronTask.getRunnable().toString().equals(runTarget));

        assertThat(dailyCronRegistered)
                .as("RecruitmentAutoCloseJob 의 매일 00:40 크론이 등록되어야 한다. 등록된 태스크: %s",
                        scheduledTasks.stream().map(scheduledTask -> scheduledTask.getTask().toString()).toList())
                .isTrue();
    }

    @Test
    @DisplayName("모집 자동 마감 크론은 서버 시간대와 무관하게 한국 시간 기준으로 돈다")
    void cronRunsInSeoulTimeZone() throws NoSuchMethodException {
        Scheduled schedule = RecruitmentAutoCloseJob.class.getMethod("run").getAnnotation(Scheduled.class);

        assertThat(schedule.zone()).isEqualTo("Asia/Seoul");
    }
}
