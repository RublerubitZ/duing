package com.duing.global.frontend;

import com.duing.global.frontend.event.ClubPublicPageChangedEvent;
import com.duing.global.monitoring.event.ClubClosedEvent;
import com.duing.global.monitoring.event.ClubStatusChangedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 동아리 상세가 바뀐 커밋 뒤 프론트에 그 상세({@code /clubs/{id}}) 재생성을 요청한다(#1356) — 24시간 ISR 인 서버 HTML 에
 * 숨김·삭제·수정을 바로 반영한다. 브라우저는 원래 마운트 재요청으로 최신을 보므로 크롤러·JS 없는 첫 화면이 대상이다.
 *
 * <p>커밋 뒤(AFTER_COMMIT)에만 받아 롤백된 변경은 요청하지 않고, {@code @Async} 전용 실행기라 커밋한 요청 스레드를
 * 막지 않는다({@link FrontendRevalidationAsyncConfig}). 연속 실패 집계·Slack 알림 없이 보낸다 — 실패는 요청기의 WARN
 * 뿐이고, 상세는 자체 24시간 주기가 상한이다. 요청기는 던지지 않으므로 비동기 예외 핸들러(ERROR→Sentry)로 새지 않는다.
 *
 * <p>목록({@code /clubs})은 함께 부르지 않는다 — 정각 재생성이 1시간 안에 반영하고, 변경마다 목록까지 다시 만들면 정각
 * 정렬 흐름과 섞인다. 공개 여부로 거르지 않는다 — 비공개(승인 대기·거절) 동아리는 페이지가 같은 셸을 다시 그릴 뿐이라
 * 낭비가 렌더 1회이고, 상태 전이 요청이 유실됐을 때는 다음 변경이 바로잡는다.
 */
@Component
@RequiredArgsConstructor
public class ClubPublicPageRevalidationListener {

    private static final String CLUB_DETAIL_PATH_PREFIX = "/clubs/";

    private final FrontendRevalidator frontendRevalidator;

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
        frontendRevalidator.revalidateWithoutAlert(CLUB_DETAIL_PATH_PREFIX + clubId);
    }
}
