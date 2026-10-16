package com.duing.domain.club.thumbnail.job;

import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.repository.ClubRepository.ClubLogoThumbnailBackfillRow;
import com.duing.domain.club.thumbnail.config.ClubLogoThumbnailAsyncConfig;
import com.duing.domain.club.thumbnail.service.ClubLogoThumbnailService;
import com.duing.domain.club.thumbnail.service.LogoThumbnailOutcome;
import com.duing.global.frontend.FrontendRevalidator;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 기존 로고의 썸네일 백필(스펙 §4.5) — 기동(ApplicationReadyEvent) 뒤 백그라운드 1회, 로고는 있는데 썸네일이 없는 동아리
 * (폐쇄 제외)를 id 순으로 하나씩 만든다. 기동 리스너는 readiness 전에 동기로 돌아(ClubMetricRefreshJob 전례) 실행기에
 * 넘기기만 하고, 처리는 썸네일 전용 단일 스레드 실행기에서 돈다 — 그동안 들어오는 로고 변경 생성은 그 큐에서 기다린다.
 *
 * <p>멱등: 썸네일이 생긴 동아리는 다음 기동의 대상이 아니다. 형식(WebP·EXIF 회전 등) 때문에 계속 건너뛰는 소수는 매 기동 INFO
 * 한 줄씩 남는다. 동아리 하나의 실패(스토리지 장애 등)는 WARN 으로 세고 다음으로 넘어간다 — 그 동아리는 다음 기동이 다시 집는다.
 * 다만 연속 {@value #MAX_CONSECUTIVE_FAILURES}회 실패면 저장소 장애로 보고 멈춘다(모든 동아리가 같은 식으로 실패해 동아리 수만큼
 * WARN·타임아웃을 반복할 뿐이다 — 값은 FrontendRevalidator 의 연속 실패 임계와 같다). 다음 기동이 다시 시작한다.
 *
 * <p>종료: 컨텍스트 종료가 시작되면(ContextClosedEvent) 플래그를 세워 두 루프(생성·재생성)가 다음 반복에서 멈춘다 — 실행기는
 * 진행 중 작업을 끝까지 기다리는 설정(waitForTasksToCompleteOnShutdown=true, 소멸 단계 2초)이라 인터럽트가 제때 오지 않는다.
 * 어떤 예외도 밖으로 내지 않는다.
 *
 * <p>끝에 썸네일이 새로 생긴 공개(ACTIVE) 동아리의 상세를 한 곳씩 순서대로 다시 만든다 — 트랜잭션 없는 스레드라 이벤트 대신
 * {@link FrontendRevalidator#revalidateWithoutAlert} 를 직접 부른다(ClubDetailDailyRevalidationJob 과 같은 방식). 생성 쪽도
 * {@code generateForBackfill} 이라 상세 변경 이벤트를 내지 않는다(이벤트로도 보내면 공개 동아리가 두 번, 비공개 동아리도 렌더되고
 * 재생성 큐(100)가 넘친다). 목록(/clubs)은 정각 재생성, 홈은 ISR 주기에 맡긴다.
 * {@code duing.club.logo-thumbnail.backfill.enabled=true} 에서만 등록된다(운영 기본 활성).
 */
@Slf4j
@Component
@ConditionalOnProperty(prefix = "duing.club.logo-thumbnail.backfill", name = "enabled", havingValue = "true")
public class ClubLogoThumbnailBackfillRunner {

    static final int MAX_CONSECUTIVE_FAILURES = 3;
    private static final String CLUB_DETAIL_PATH_PREFIX = "/clubs/";

    private final ClubRepository clubRepository;
    private final ClubLogoThumbnailService clubLogoThumbnailService;
    private final FrontendRevalidator frontendRevalidator;
    private final Executor executor;
    private volatile boolean stopRequested;

    public ClubLogoThumbnailBackfillRunner(
            ClubRepository clubRepository,
            ClubLogoThumbnailService clubLogoThumbnailService,
            FrontendRevalidator frontendRevalidator,
            @Qualifier(ClubLogoThumbnailAsyncConfig.EXECUTOR_BEAN_NAME) Executor executor) {
        this.clubRepository = clubRepository;
        this.clubLogoThumbnailService = clubLogoThumbnailService;
        this.frontendRevalidator = frontendRevalidator;
        this.executor = executor;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void startInBackground() {
        executor.execute(this::run);
    }

    /** 컨텍스트 종료 시작 — 진행 중 run() 이 다음 반복에서 멈춘다. */
    @EventListener(ContextClosedEvent.class)
    public void stopOnContextClose() {
        stopRequested = true;
    }

    private boolean shouldStop() {
        return stopRequested || Thread.currentThread().isInterrupted();
    }

    public void run() {
        List<ClubLogoThumbnailBackfillRow> targets;
        try {
            targets = clubRepository.findLogoThumbnailBackfillRows();
        } catch (RuntimeException lookupFailure) {
            // 새 코드의 로그는 WARN·예외 클래스명만(ERROR 는 Sentry 이벤트) — 다음 기동이 다시 시도한다.
            log.warn("[로고 썸네일 백필] 대상 조회 실패 — reason={}, 다음 기동에서 다시 시도", lookupFailure.getClass().getSimpleName());
            return;
        }
        log.info("[로고 썸네일 백필] 시작 — 대상 {}", targets.size());
        int generated = 0;
        int skipped = 0;
        int failed = 0;
        int consecutiveFailures = 0;
        List<Long> publicClubIdsToRevalidate = new ArrayList<>();
        for (int index = 0; index < targets.size(); index++) {
            if (shouldStop()) {
                log.warn("[로고 썸네일 백필] 종료 중 — 남은 {}곳 건너뜀", targets.size() - index);
                break;
            }
            ClubLogoThumbnailBackfillRow target = targets.get(index);
            try {
                LogoThumbnailOutcome outcome = clubLogoThumbnailService.generateForBackfill(target.getId(), target.getLogoUrl());
                consecutiveFailures = 0;
                if (outcome == LogoThumbnailOutcome.STORED) {
                    generated++;
                    if (target.getStatus().isPubliclyVisible()) {
                        publicClubIdsToRevalidate.add(target.getId());
                    }
                } else {
                    skipped++;
                }
            } catch (RuntimeException generationFailure) {
                failed++;
                consecutiveFailures++;
                // 예외 클래스명만 — URL·키는 남기지 않는다.
                log.warn("[로고 썸네일 백필] 실패 — clubId={}, reason={}",
                        target.getId(), generationFailure.getClass().getSimpleName());
                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                    log.warn("[로고 썸네일 백필] 연속 {}회 실패 — 중단(남은 {}곳은 다음 기동에서)",
                            consecutiveFailures, targets.size() - index - 1);
                    break;
                }
            }
        }
        int revalidated = 0;
        for (Long clubId : publicClubIdsToRevalidate) {
            if (shouldStop()) {
                log.warn("[로고 썸네일 백필] 종료 중 — 상세 재생성 남은 {}곳 건너뜀",
                        publicClubIdsToRevalidate.size() - revalidated);
                break;
            }
            frontendRevalidator.revalidateWithoutAlert(CLUB_DETAIL_PATH_PREFIX + clubId);
            revalidated++;
        }
        log.info("[로고 썸네일 백필] 완료 — 생성 {} · 건너뜀 {} · 실패 {} · 재생성 {}", generated, skipped, failed, revalidated);
    }
}
