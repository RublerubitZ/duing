package com.duing.domain.recruitment.job;

import com.duing.domain.recruitment.service.RecruitmentAutoCloseService;
import com.duing.global.jobrun.JobRunOutcome;
import com.duing.global.jobrun.JobRunRecorder;
import com.duing.global.jobrun.MonitoredJob;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 기간 종료 모집 자동 마감 — 매일 00:40(Asia/Seoul) 종료일 다음 날부터 7일이 지났고 남은 심사·면접이 없는 OPEN 모집을
 * 마감한다(조건은 {@link RecruitmentAutoCloseService}). {@code duing.recruitment.auto-close.enabled=true} 에서만 등록된다
 * (운영 기본 활성). 00:40 은 KST 날짜가 바뀐 직후라 그날 하루 화면이 일관되고, 같은 테이블을 만지는 잡·백업과 시각이 겹치지 않는다.
 *
 * <p>모집마다 서비스의 별도 트랜잭션으로 닫고, 한 모집의 실패는 WARN 만 남기고 다음 모집으로 넘어간다(다음 날 다시 판정).
 * 실패가 1건 이상이면 요약 줄도 INFO 대신 WARN 으로 남긴다(PiiRetentionJob 전례). 후보 조회 실패는 삼키지 않고
 * 스케줄러로 내보낸다(형제 잡 관례).
 * 마감마다 다른 동아리 경로라 상세 재생성 리스너의 최소 간격이 합쳐 주지 못하고 단일 스레드·큐 100 실행기에 쌓인다 — 넘친
 * 요청은 WARN 뒤 버려지지만 상세 표기는 만료-OPEN 과 CLOSED 가 같아 피해가 작다.
 * <p>끝날 때 총동연 홈 자동 작업 카드용 실행 기록을 남긴다(JobRunRecorder — 기록 실패는 잡에 영향 없음).
 */
@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(prefix = "duing.recruitment.auto-close", name = "enabled", havingValue = "true")
public class RecruitmentAutoCloseJob {

    /** 성공·실패 두 레벨이 같은 줄을 남기도록 포맷을 한 곳에 둔다 — 운영 grep 이 레벨에 따라 갈리지 않게. */
    private static final String SUMMARY_LOG_FORMAT = "RecruitmentAutoCloseJob done: candidates={}, closed={}, failed={}";

    private final RecruitmentAutoCloseService recruitmentAutoCloseService;
    private final Clock clock;
    private final JobRunRecorder jobRunRecorder;

    // 트랜잭션을 두지 않는다 — 두면 모집별 마감이 한 트랜잭션에 합류해 잠금 조회가 첫 조회라는 보장이 깨지고,
    // 한 모집의 실패가 전체를 롤백한다. 메서드 이름 run 은 RecruitmentAutoCloseScheduleRegistrationTest 가 확인한다.
    @Scheduled(cron = "0 40 0 * * *", zone = "Asia/Seoul")
    public void run() {
        Instant startedAt = Instant.now(clock);
        try {
            List<Long> candidateIds = recruitmentAutoCloseService.findCandidateIds();
            log.info("RecruitmentAutoCloseJob start: candidates={}", candidateIds.size());
            List<Long> closedIds = new ArrayList<>();
            int failedCount = 0;
            for (Long recruitmentId : candidateIds) {
                try {
                    if (recruitmentAutoCloseService.closeIfSettled(recruitmentId)) {
                        closedIds.add(recruitmentId);
                    }
                } catch (RuntimeException closeFailure) {
                    failedCount++;
                    log.warn("RecruitmentAutoCloseJob: 마감 실패 — 다음 날 다시 판정 recruitmentId={}",
                            recruitmentId, closeFailure);
                }
            }
            log.info("RecruitmentAutoCloseJob closed ids={}", closedIds);
            if (failedCount == 0) {
                log.info(SUMMARY_LOG_FORMAT, candidateIds.size(), closedIds.size(), failedCount);
            } else {
                log.warn(SUMMARY_LOG_FORMAT, candidateIds.size(), closedIds.size(), failedCount);
            }
            jobRunRecorder.record(MonitoredJob.RECRUITMENT_AUTO_CLOSE, startedAt,
                    JobRunOutcome.of(failedCount), closedIds.size(), failedCount);
        } catch (RuntimeException jobFailure) {
            // 후보 조회 실패는 삼키지 않고 스케줄러로 내보낸다(형제 잡 관례) — 실패만 기록하고 같은 예외를 다시 던진다.
            jobRunRecorder.record(MonitoredJob.RECRUITMENT_AUTO_CLOSE, startedAt, JobRunOutcome.FAILED, 0, 0);
            throw jobFailure;
        }
    }
}
