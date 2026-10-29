package com.duing.domain.adminconsole.job;

import com.duing.domain.adminconsole.service.AdminPendingCountsQueryService;
import com.duing.domain.adminconsole.service.AdminPendingSnapshotRecorder;
import com.duing.domain.adminconsole.service.dto.query.AdminPendingCountsQuery;
import java.time.Clock;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 총동연 홈 처리 대기 추이의 하루치 기록 — 매일 00:01(Asia/Seoul) KST 어제 날짜로 그 순간의 남은 대기 건수를 남긴다.
 * {@code duing.admin.pending-snapshot.enabled=true} 에서만 등록된다(운영 기본 활성). 00:01 은 KST 날짜가 바뀐 직후라
 * "어제 하루 끝" 값이고, 다른 매일 자정 잡(00:05·00:10·00:20·00:40)과 시각이 겹치지 않는다. 00:00 에 함께 도는 잡
 * (ClubMetricRefreshJob·InterviewReminderJob 매시 정각, FacilityCrawlScheduler 10분마다 — 크롤은 수 분 걸릴 수 있다)이
 * 길어져도 스케줄러 풀이 4스레드라 밀리지 않는다.
 *
 * <p>읽기(대기 건수 계산)와 쓰기(기록)를 트랜잭션 없이 차례로 부른다 — 읽기 전용 서비스를 쓰기 트랜잭션 안에서 부르지
 * 않는다. 같은 날짜가 이미 있으면 첫 기록이 남는다. 실패는 삼키지 않고 스케줄러로 내보낸다(형제 잡 관례) — 그날은
 * 화면에 "기록 없음"으로 남고, 다음 날에는 그날 것만 기록된다. 00:01 을 걸친 배포·재시작도 결과가 같아 그날은 채우지
 * 않는다 — 기동 때 따라잡지 않는 것은 늦은 시각의 값이 "하루 끝" 값으로 저장되기 때문이다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(prefix = "duing.admin.pending-snapshot", name = "enabled", havingValue = "true")
public class AdminPendingSnapshotJob {

    private final AdminPendingCountsQueryService adminPendingCountsQueryService;
    private final AdminPendingSnapshotRecorder adminPendingSnapshotRecorder;
    private final Clock clock;

    // 메서드 이름 run 은 AdminPendingSnapshotScheduleRegistrationTest 가 확인한다.
    @Scheduled(cron = "0 1 0 * * *", zone = "Asia/Seoul")
    public void run() {
        // clock 은 seoulClock 이라 JVM 기본 존(prod UTC)과 무관하게 KST 어제다.
        LocalDate snapshotDate = LocalDate.now(clock).minusDays(1);
        AdminPendingCountsQuery pendingCounts = adminPendingCountsQueryService.getPendingCounts();
        boolean inserted = adminPendingSnapshotRecorder.record(snapshotDate, pendingCounts);
        log.info("AdminPendingSnapshotJob done: date={}, total={}, inserted={}",
                snapshotDate, pendingCounts.totalPendingCount(), inserted);
    }
}
