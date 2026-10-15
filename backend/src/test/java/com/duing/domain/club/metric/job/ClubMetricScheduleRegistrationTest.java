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
 * 잡 크론이 스케줄링 등록기({@code ScheduledTaskHolder})에 등록되는지 검증 — 빈이 떠 있어도 @Scheduled 등록이 조용히
 * 누락되면 기동 1회 갱신 후 점수가 박제되는 무음 고장이 된다(QA 자정 실검증에서 실제 발견된 결함).
 *
 * <p>테스트 컨텍스트에서는 크론이 등록만 되고 실행되지 않는지도 여기서 지킨다(#1442). 이 컨텍스트가 캐시에 남아 정각
 * 크론을 실제로 돌리다 다른 테스트의 TRUNCATE 와 교착한 원 사례다. 별도 클래스로 두면 실행 순서에 따라 컨텍스트 캐시
 * 퇴거로 컨텍스트를 한 번 더 띄울 수 있으므로 같은 클래스에 둔다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "duing.club.metric.enabled=true")
class ClubMetricScheduleRegistrationTest {

    @Autowired ApplicationContext applicationContext;

    @Test
    @DisplayName("club.metric 활성 시 매시 정각 크론이 스케줄러에 등록된다")
    void hourlyCronIsRegisteredOnScheduler() {
        Set<ScheduledTask> scheduledTasks = scheduledTasks();

        // 표현식만 보면 다른 잡의 동일 크론에도 거짓 통과할 수 있어 대상 메서드까지 짚는다.
        // 러너블은 Spring 이 관측 래퍼로 감싸므로(instanceof ScheduledMethodRunnable 불가)
        // "클래스명.메서드명" toString 계약으로 매칭한다. 크론 zone 은 CronTrigger 가
        // 공개 API 로 노출하지 않아 표현식·대상 검증까지만 한다.
        String refreshTarget = ClubMetricRefreshJob.class.getName() + ".refresh";
        boolean hourlyCronRegistered = scheduledTasks.stream()
                .anyMatch(scheduledTask -> scheduledTask.getTask() instanceof CronTask cronTask
                        && cronTask.getExpression().equals("0 0 * * * *")
                        && cronTask.getRunnable().toString().equals(refreshTarget));

        assertThat(hourlyCronRegistered)
                .as("ClubMetricRefreshJob 의 매시 정각 크론이 등록되어야 한다. 등록된 태스크: %s",
                        scheduledTasks.stream().map(t -> t.getTask().toString()).toList())
                .isTrue();
    }

    @Test
    @DisplayName("테스트 컨텍스트에서는 크론이 등록만 되고 실행 예약은 없다")
    void cronIsRegisteredButNeverScheduledInTests() {
        Set<ScheduledTask> scheduledTasks = scheduledTasks();

        assertThat(scheduledTasks)
                .as("지표 잡 플래그를 켠 컨텍스트라 크론이 등록돼 있어야 한다 — 비어 있으면 이 단언은 아무것도 지키지 못한다")
                .isNotEmpty();
        assertThat(scheduledTasks)
                .as("테스트 스케줄러(TestcontainersConfiguration)는 실행을 예약하지 않아야 한다 — 다음 실행 시각이 있으면 "
                        + "캐시된 컨텍스트의 크론이 공유 DB 에서 다른 테스트의 TRUNCATE 와 교착한다(#1442)")
                .allSatisfy(scheduledTask -> assertThat(scheduledTask.nextExecution())
                        .as("다음 실행 시각이 있는 작업: %s", scheduledTask)
                        .isNull());
    }

    private Set<ScheduledTask> scheduledTasks() {
        return applicationContext.getBeansOfType(ScheduledTaskHolder.class)
                .values().stream()
                .flatMap(holder -> holder.getScheduledTasks().stream())
                .collect(Collectors.toSet());
    }
}
