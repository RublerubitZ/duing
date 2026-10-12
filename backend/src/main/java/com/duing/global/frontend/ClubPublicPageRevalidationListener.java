package com.duing.global.frontend;

import com.duing.global.frontend.event.ClubPublicPageChangedEvent;
import com.duing.global.monitoring.event.ClubClosedEvent;
import com.duing.global.monitoring.event.ClubStatusChangedEvent;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;
import java.util.function.BiConsumer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 동아리 상세가 바뀐 커밋 뒤 프론트에 그 상세({@code /clubs/{id}}) 재생성을 요청한다(#1356) — ISR 서버 HTML 에
 * 숨김·삭제·수정을 바로 반영한다. 브라우저는 원래 마운트 재요청으로 최신을 보므로 크롤러·JS 없는 첫 화면이 대상이다.
 *
 * <p>커밋 뒤(AFTER_COMMIT)에만 받아 롤백된 변경은 요청하지 않고, {@code @Async} 전용 실행기라 커밋한 요청 스레드를
 * 막지 않는다({@link FrontendRevalidationAsyncConfig}). 연속 실패 집계·Slack 알림 없이 보낸다 — 실패는 요청기의 WARN
 * 뿐이고, 상세는 프론트의 자체 재생성 주기가 상한이다. 요청기는 던지지 않으므로 비동기 예외 핸들러(ERROR→Sentry)로 새지
 * 않는다. 세 이벤트 모두 발행은 반드시 {@code @Transactional} 안에서 한다 — 밖이면 {@code fallbackExecution=false} 라
 * 로그 없이 버려진다(알림·카운터도 없어 드러나지 않는다).
 *
 * <p>같은 상세는 최소 간격(기본 60초)에 한 번만 요청한다 — 요청마다 Vercel 재생성(재검증 라우트·warm-up 렌더)이
 * 일어나므로, 운영진의 연속 수정이나 자동 저장 버그가 Hobby 의 월 CPU 한도를 태우지 않게 한다. 간격 안의 변경은 간격이
 * 끝나는 시각에 한 번 더 요청해 마지막 변경을 놓치지 않는다(이미 예약돼 있으면 그 실행이 그때의 최신으로 다시 그린다).
 * 상태 기록은 리스너와 예약 실행이 모두 같은 단일 스레드 실행기에서만 읽고 쓴다. 예약 실행이 실행기 포화로 버려지면
 * 예정 시각에서 간격이 지난 뒤의 변경이 다시 요청한다 — 그 사이 최신 반영은 그 주기가 상한이다.
 *
 * <p>목록({@code /clubs})은 함께 부르지 않는다 — 정각 재생성이 1시간 안에 반영하고, 변경마다 목록까지 다시 만들면 정각
 * 정렬 흐름과 섞인다. 공개 여부로 거르지 않는다 — 비공개(승인 대기·거절) 동아리는 페이지가 같은 셸을 다시 그릴 뿐이라
 * 낭비가 렌더 1회이고, 상태 전이 요청이 유실됐을 때는 다음 변경이 바로잡는다.
 */
@Component
public class ClubPublicPageRevalidationListener {

    private static final String CLUB_DETAIL_PATH_PREFIX = "/clubs/";

    private final FrontendRevalidator frontendRevalidator;
    private final Clock clock;
    private final Duration minInterval;
    private final BiConsumer<Duration, Runnable> delayedRunner;
    // 키는 한 번이라도 바뀐 동아리 수만큼(수백)이라 만료 없이 둔다.
    private final Map<String, Instant> lastRequestedAtByPath = new ConcurrentHashMap<>();
    private final Map<String, Instant> trailingRunAtByPath = new ConcurrentHashMap<>();

    /** {@code minInterval} 은 통합 테스트가 0 으로 꺼서 발행 지점마다 요청이 나가는지를 그대로 센다. */
    @Autowired
    public ClubPublicPageRevalidationListener(
            FrontendRevalidator frontendRevalidator,
            Clock clock,
            @Value("${duing.frontend.club-detail-min-interval:60s}") Duration minInterval,
            @Qualifier(FrontendRevalidationAsyncConfig.EXECUTOR_BEAN_NAME) Executor frontendRevalidationTaskExecutor) {
        this(frontendRevalidator, clock, minInterval, (delay, task) -> CompletableFuture
                .delayedExecutor(delay.toMillis(), TimeUnit.MILLISECONDS, frontendRevalidationTaskExecutor)
                .execute(task));
    }

    /** 테스트 이음매 — 지연 실행을 손으로 돌려 실제 대기 없이 순서를 고정한다. */
    ClubPublicPageRevalidationListener(FrontendRevalidator frontendRevalidator, Clock clock, Duration minInterval,
                                       BiConsumer<Duration, Runnable> delayedRunner) {
        this.frontendRevalidator = frontendRevalidator;
        this.clock = clock;
        this.minInterval = minInterval;
        this.delayedRunner = delayedRunner;
    }

    @Async(FrontendRevalidationAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onClubPublicPageChanged(ClubPublicPageChangedEvent event) {
        revalidateClubDetail(event.clubId());
    }

    /** 승인·거절·운영중단·재개 — 공개 여부가 바뀐다. 운영 이벤트 record 는 바꾸지 않고 그대로 구독한다. */
    @Async(FrontendRevalidationAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onClubStatusChanged(ClubStatusChangedEvent event) {
        revalidateClubDetail(event.clubId());
    }

    /** 폐쇄는 비공개(운영중단·거절) 상태에서만 시작돼 대개 같은 셸이지만, 앞선 상태 전이 요청이 유실됐다면 여기서 바로잡는다. */
    @Async(FrontendRevalidationAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onClubClosed(ClubClosedEvent event) {
        revalidateClubDetail(event.clubId());
    }

    private void revalidateClubDetail(Long clubId) {
        String path = CLUB_DETAIL_PATH_PREFIX + clubId;
        Instant now = clock.instant();
        Instant trailingRunAt = trailingRunAtByPath.get(path);
        if (trailingRunAt != null && now.isBefore(trailingRunAt.plus(minInterval))) {
            return;
        }
        Instant lastRequestedAt = lastRequestedAtByPath.get(path);
        if (lastRequestedAt == null || !now.isBefore(lastRequestedAt.plus(minInterval))) {
            requestNow(path);
            return;
        }
        Instant runAt = lastRequestedAt.plus(minInterval);
        trailingRunAtByPath.put(path, runAt);
        delayedRunner.accept(Duration.between(now, runAt), () -> requestNow(path));
    }

    private void requestNow(String path) {
        trailingRunAtByPath.remove(path);
        lastRequestedAtByPath.put(path, clock.instant());
        frontendRevalidator.revalidateWithoutAlert(path);
    }
}
