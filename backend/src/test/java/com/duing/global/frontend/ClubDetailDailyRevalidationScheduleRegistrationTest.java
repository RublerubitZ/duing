package com.duing.global.frontend;

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
import org.springframework.scheduling.config.CronTask;
import org.springframework.scheduling.config.ScheduledTask;
import org.springframework.scheduling.config.ScheduledTaskHolder;

/**
 * 플래그를 켜면 매일 크론이 실제 스케줄러에 등록되는지 검증 — 빈이 떠 있어도 @Scheduled 등록이 조용히 빠지면 상세가
 * 프론트 자체 재생성 주기까지 묵는 무음 고장이 된다(ClubMetricScheduleRegistrationTest 관례).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "duing.frontend.club-detail-daily.enabled=true")
class ClubDetailDailyRevalidationScheduleRegistrationTest {

    @Autowired ApplicationContext applicationContext;

    @Test
    @DisplayName("상세 매일 재생성을 켜면 매일 00:05 크론이 그 잡 메서드로 스케줄러에 등록된다")
    void dailyCronIsRegisteredOnScheduler() {
        Set<ScheduledTask> scheduledTasks = applicationContext.getBeansOfType(ScheduledTaskHolder.class)
                .values().stream()
                .flatMap(holder -> holder.getScheduledTasks().stream())
                .collect(Collectors.toSet());

        // 표현식만 보면 다른 잡의 같은 크론에도 거짓 통과한다 — 대상 메서드까지 "클래스명.메서드명" 으로 짚는다.
        String refreshTarget = ClubDetailDailyRevalidationJob.class.getName() + ".refresh";
        boolean dailyCronRegistered = scheduledTasks.stream()
                .anyMatch(scheduledTask -> scheduledTask.getTask() instanceof CronTask cronTask
                        && cronTask.getExpression().equals("0 5 0 * * *")
                        && cronTask.getRunnable().toString().equals(refreshTarget));

        assertThat(dailyCronRegistered)
                .as("ClubDetailDailyRevalidationJob 의 매일 00:05 크론이 등록되어야 한다. 등록된 태스크: %s",
                        scheduledTasks.stream().map(scheduledTask -> scheduledTask.getTask().toString()).toList())
                .isTrue();
    }
}
