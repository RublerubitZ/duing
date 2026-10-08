package com.duing.global.frontend;

import com.duing.domain.recruitment.repository.RecruitmentRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 동아리 상세 매일 재생성 — 매일 00:05(Asia/Seoul) 진행 중이거나 최근(어제·그제) 마감한 모집이 있는 동아리의
 * 상세({@code /clubs/{id}}) 재생성을 요청한다. 상세 서버 HTML 의 모집 표기(시작일 도래·마감 다음 날)는 쓰기 없이
 * 날짜만으로, 지원자 수는 커밋 이벤트를 내지 않는 지원서 제출·철회로 바뀌어 둘 다 커밋 이벤트 리스너
 * ({@link ClubPublicPageRevalidationListener})가 잡지 못한다 — 이 잡이 그 변화를 하루 안에 반영해 프론트가 상세 재생성
 * 주기를 길게 둘 수 있게 한다. 00:05 는 KST 날짜가 바뀐 직후이고 00:00 정각 {@code /clubs} 잡과 겹치지 않는다.
 *
 * <p>요청은 이 스케줄러 스레드에서 한 곳씩 순서대로 보낸다 — 대상이 모집철에 100곳을 넘을 수 있어 리스너
 * 실행기(큐 100)에 한꺼번에 넣으면 버려진다. 한 곳에 2~3초(warm-up 대기 1초 포함)라 165곳이어도 10분 안이고 스케줄러
 * 풀은 4개다. 프론트가 매번 타임아웃 한도까지 끌면 최악은 한 곳에 약 24초(연결 3 + 읽기 10 + 대기 1 + 읽기 10), 165곳에
 * 약 1시간이다 — 그래도 DB 커넥션을 잡지 않고 풀이 4개라 다른 잡은 길어야 몇 분 밀리며, 지연에 민감한 잡도 없다. 대상
 * 조회는 트랜잭션 없이 한다 — 요청을 보내는 동안 DB 커넥션을 잡지 않는다. 실패는 요청기의 WARN 만 남기고(연속 실패 집계
 * 없음) 다음 날 다시 돈다. 종료 중 인터럽트면 남은 동아리를 건너뛴다 — 지우기만 하고 다시 그리지 않는 요청을 줄인다.
 * 어떤 예외도 스케줄러로 내보내지 않는다. {@code duing.frontend.club-detail-daily.enabled=true} 에서만 등록되고(운영
 * 기본 활성), 요청 자체는 비밀값이 있어야 나간다({@link FrontendRevalidator}).
 */
@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(prefix = "duing.frontend.club-detail-daily", name = "enabled", havingValue = "true")
public class ClubDetailDailyRevalidationJob {

    private static final String CLUB_DETAIL_PATH_PREFIX = "/clubs/";

    private final RecruitmentRepository recruitmentRepository;
    private final FrontendRevalidator frontendRevalidator;
    private final Clock clock;

    // 메서드 이름 refresh 는 ClubDetailDailyRevalidationScheduleRegistrationTest 가 크론 등록 대상으로 확인한다.
    @Scheduled(cron = "0 5 0 * * *", zone = "Asia/Seoul")
    public void refresh() {
        try {
            List<Long> clubIds =
                    recruitmentRepository.findClubIdsWithOngoingOrJustEndedRecruitment(LocalDate.now(clock));
            log.info("ClubDetailDailyRevalidationJob start: targets={}", clubIds.size());
            for (int requestedCount = 0; requestedCount < clubIds.size(); requestedCount++) {
                if (Thread.currentThread().isInterrupted()) {
                    log.warn("ClubDetailDailyRevalidationJob: 종료 중 — 남은 {}곳 건너뜀",
                            clubIds.size() - requestedCount);
                    return;
                }
                frontendRevalidator.revalidateWithoutAlert(CLUB_DETAIL_PATH_PREFIX + clubIds.get(requestedCount));
            }
            log.info("ClubDetailDailyRevalidationJob done: targets={}", clubIds.size());
        } catch (RuntimeException refreshError) {
            log.error("ClubDetailDailyRevalidationJob: 실패 — 남은 상세는 다음 날 다시 돈다", refreshError);
        }
    }
}
