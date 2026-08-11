package com.duing.domain.club.metric.job;

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
 * 잡 크론이 실제 스케줄러에 등록되는지 검증 — 빈이 떠 있어도 @Scheduled 등록이 조용히 누락되면
 * 기동 1회 갱신 후 점수가 박제되는 무음 고장이 된다(QA 자정 실검증에서 실제 발견된 결함).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "duing.club.metric.enabled=true")
class ClubMetricScheduleRegistrationTest {

    @Autowired ApplicationContext applicationContext;

    @Test
    @DisplayName("club.metric 활성 시 매시 정각 크론이 스케줄러에 등록된다")
    void hourlyCronIsRegisteredOnScheduler() {
        Set<ScheduledTask> scheduledTasks = applicationContext.getBeansOfType(ScheduledTaskHolder.class)
                .values().stream()
                .flatMap(holder -> holder.getScheduledTasks().stream())
                .collect(Collectors.toSet());

        boolean hourlyCronRegistered = scheduledTasks.stream()
                .anyMatch(scheduledTask -> scheduledTask.getTask() instanceof CronTask cronTask
                        && cronTask.getExpression().equals("0 0 * * * *"));

        assertThat(hourlyCronRegistered)
                .as("ClubMetricRefreshJob 의 매시 정각 크론이 등록되어야 한다. 등록된 태스크: %s",
                        scheduledTasks.stream().map(t -> t.getTask().toString()).toList())
                .isTrue();
    }
}
