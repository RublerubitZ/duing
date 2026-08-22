package com.duing.global.monitoring;

import com.duing.domain.notification.event.FacilityBookingCancelledEvent;
import com.duing.domain.notification.event.FacilityBookingConflictEvent;
import com.duing.domain.notification.event.FacilityBookingRejectedEvent;
import com.duing.domain.notification.event.FacilityBookingSubmittedEvent;
import com.duing.domain.notification.event.RecruitmentOpenedEvent;
import com.duing.global.monitoring.event.AdminUserActionEvent;
import com.duing.global.monitoring.event.ClubClosedEvent;
import com.duing.global.monitoring.event.ClubCreatedEvent;
import com.duing.global.monitoring.event.ClubStatusChangedEvent;
import com.duing.global.monitoring.event.FeeAccountCreatedEvent;
import com.duing.global.monitoring.event.UserRegisteredEvent;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 운영 이벤트 → Slack. 커밋 후(AFTER_COMMIT)에만 수신하므로 롤백된 트랜잭션의 이벤트는 절대 오지 않고,
 * {@code @Async(monitoringTaskExecutor)} 라 발행한 요청 스레드와 분리된다. 각 메서드는 예외를 전파하지 않는다 —
 * 기본 AsyncUncaughtExceptionHandler 가 ERROR(=Sentry) 로 남기는 경로를 타지 않게 여기서 신호만 남긴다.
 *
 * <p>기존 알림 도메인 이벤트(모집 오픈·시설 예약)는 새 record 없이 그대로 구독한다 — 발행 지점·필드 불변.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OpsSlackListener {

    private final OpsSlackMessageFormatter formatter;
    private final SlackNotifier slackNotifier;

    @Async(MonitoringAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onUserRegistered(UserRegisteredEvent event) {
        notify("USER_REGISTERED", () -> formatter.userRegistered(event));
    }

    @Async(MonitoringAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onClubCreated(ClubCreatedEvent event) {
        notify("CLUB_CREATED", () -> formatter.clubCreated(event));
    }

    @Async(MonitoringAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onClubStatusChanged(ClubStatusChangedEvent event) {
        notify("CLUB_STATUS_CHANGED", () -> formatter.clubStatusChanged(event));
    }

    @Async(MonitoringAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onClubClosed(ClubClosedEvent event) {
        notify("CLUB_CLOSED", () -> formatter.clubClosed(event));
    }

    @Async(MonitoringAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onFeeAccountCreated(FeeAccountCreatedEvent event) {
        notify("FEE_ACCOUNT_CREATED", () -> formatter.feeAccountCreated(event));
    }

    @Async(MonitoringAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onAdminUserAction(AdminUserActionEvent event) {
        notify("ADMIN_USER_ACTION", () -> formatter.adminUserAction(event));
    }

    @Async(MonitoringAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onRecruitmentOpened(RecruitmentOpenedEvent event) {
        notify("RECRUITMENT_OPENED", () -> formatter.recruitmentOpened(event));
    }

    @Async(MonitoringAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onFacilityBookingSubmitted(FacilityBookingSubmittedEvent event) {
        notify("FACILITY_BOOKING_SUBMITTED", () -> formatter.facilityBookingSubmitted(event));
    }

    @Async(MonitoringAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onFacilityBookingRejected(FacilityBookingRejectedEvent event) {
        notify("FACILITY_BOOKING_REJECTED", () -> formatter.facilityBookingRejected(event));
    }

    @Async(MonitoringAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onFacilityBookingCancelled(FacilityBookingCancelledEvent event) {
        notify("FACILITY_BOOKING_CANCELLED", () -> formatter.facilityBookingCancelled(event));
    }

    @Async(MonitoringAsyncConfig.EXECUTOR_BEAN_NAME)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onFacilityBookingConflict(FacilityBookingConflictEvent event) {
        notify("FACILITY_BOOKING_CONFLICT", () -> formatter.facilityBookingConflict(event));
    }

    private void notify(String eventType, Supplier<String> messageSupplier) {
        try {
            slackNotifier.send(messageSupplier.get());
        } catch (RuntimeException failure) {
            // 예외 메시지에 PII·URL 이 섞일 수 있어 클래스명만 남긴다.
            log.error("Slack 운영 알림 처리 실패 — event={}, reason={}", eventType, failure.getClass().getSimpleName());
        }
    }
}
