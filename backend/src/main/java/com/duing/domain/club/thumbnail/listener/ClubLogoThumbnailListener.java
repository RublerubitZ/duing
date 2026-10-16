package com.duing.domain.club.thumbnail.listener;

import com.duing.domain.club.thumbnail.config.ClubLogoThumbnailAsyncConfig;
import com.duing.domain.club.thumbnail.event.ClubLogoChangedEvent;
import com.duing.domain.club.thumbnail.service.ClubLogoThumbnailService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 로고가 바뀐 커밋 뒤 전용 실행기에서 썸네일을 만든다(스펙 §4.3) — 요청 스레드·응답을 늦추지 않고, 발행 tx 가 롤백되면 오지 않는다.
 * 예외는 전파하지 않는다 — 기본 AsyncUncaughtExceptionHandler 가 ERROR(=Sentry) 로 남기는 경로를 타지 않게 여기서 WARN 으로
 * 끝낸다(OpsSlackListener 관례). 실패한 썸네일은 비어 있는 채라 다음 기동의 백필이 다시 만든다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ClubLogoThumbnailListener {

    private final ClubLogoThumbnailService clubLogoThumbnailService;

    @Async(ClubLogoThumbnailAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onClubLogoChanged(ClubLogoChangedEvent event) {
        try {
            clubLogoThumbnailService.generateAfterLogoChange(event.clubId(), event.logoUrl(), event.changedByUserId());
        } catch (RuntimeException failure) {
            // 예외 클래스명만 — URL·키는 남기지 않는다.
            log.warn("[로고 썸네일] 생성 실패 — clubId={}, reason={}", event.clubId(), failure.getClass().getSimpleName());
        }
    }
}
