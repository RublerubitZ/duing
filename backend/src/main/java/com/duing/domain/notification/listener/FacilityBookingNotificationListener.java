package com.duing.domain.notification.listener;

import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.event.FacilityBookingApprovedEvent;
import com.duing.domain.notification.event.FacilityBookingCancelledEvent;
import com.duing.domain.notification.event.FacilityBookingConfirmedEvent;
import com.duing.domain.notification.event.FacilityBookingConflictEvent;
import com.duing.domain.notification.event.FacilityBookingSubmittedEvent;
import com.duing.domain.notification.event.FacilityBookingRejectedEvent;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 시설 예약 상태 전이 알림(스펙 §7.6 이행, 2026-07-17 감사 후속 — 불리한 전이의 pull-only 공백 해소).
 * 타입별 파일 분리 전례와 달리 6개 이벤트를 한 클래스로 묶는다 — 수신자·문안만 다른 동형 처리라
 * 문안 조립(시설명·일시)·수신자 루프 헬퍼를 공유하는 편이 복제 6벌보다 낫다.
 * 표시용 조회(예약·시설명)는 AFTER_COMMIT 후 리스너가 수행해 발행부(전이 트랜잭션)를 오염시키지 않는다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class FacilityBookingNotificationListener {

    private static final int BODY_MAX_LENGTH = 300;
    private static final String ADMIN_LINK = "/admin/facility-bookings";

    private final NotificationService notificationService;
    private final UserRepository userRepository;
    private final ClubMemberRepository clubMemberRepository;
    private final ClubRepository clubRepository;
    private final FacilityBookingRepository facilityBookingRepository;
    private final FacilityRepository facilityRepository;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleSubmitted(FacilityBookingSubmittedEvent event) {
        FacilityBooking booking = findBookingOrWarn(event.bookingId(), "SUBMITTED");
        if (booking == null) {
            return;
        }
        String body = clubName(event.clubId()) + " · " + bookingLabel(booking);
        notifyAdmins(NotificationType.FACILITY_BOOKING_SUBMITTED, "새 시설 예약 신청이 접수됐어요", body,
                event.bookingId(), "FACILITY_BOOKING_SUBMITTED:b=" + event.bookingId());
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleApproved(FacilityBookingApprovedEvent event) {
        FacilityBooking booking = findBookingOrWarn(event.bookingId(), "APPROVED");
        if (booking == null) {
            return;
        }
        notifyOfficers(event.clubId(), NotificationType.FACILITY_BOOKING_APPROVED,
                "시설 예약이 승인됐어요", bookingLabel(booking) + " — 학교 반영 후 자동 확정돼요.",
                event.bookingId(), dedupKey("APPROVED", event.bookingId(), event.historyId()));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleRejected(FacilityBookingRejectedEvent event) {
        FacilityBooking booking = findBookingOrWarn(event.bookingId(), "REJECTED");
        if (booking == null) {
            return;
        }
        notifyOfficers(event.clubId(), NotificationType.FACILITY_BOOKING_REJECTED,
                "시설 예약이 거절됐어요", bookingLabel(booking) + " — 사유: " + event.reason(),
                event.bookingId(), dedupKey("REJECTED", event.bookingId(), event.historyId()));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleConfirmed(FacilityBookingConfirmedEvent event) {
        FacilityBooking booking = findBookingOrWarn(event.bookingId(), "CONFIRMED");
        if (booking == null) {
            return;
        }
        notifyOfficers(event.clubId(), NotificationType.FACILITY_BOOKING_CONFIRMED,
                "시설 예약이 확정됐어요", bookingLabel(booking) + " — 학교 반영이 확인됐어요.",
                event.bookingId(), dedupKey("CONFIRMED", event.bookingId(), event.historyId()));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleConflict(FacilityBookingConflictEvent event) {
        FacilityBooking booking = findBookingOrWarn(event.bookingId(), "CONFLICT");
        if (booking == null) {
            return;
        }
        String label = bookingLabel(booking);
        String key = dedupKey("CONFLICT", event.bookingId(), event.historyId());
        notifyOfficers(event.clubId(), NotificationType.FACILITY_BOOKING_CONFLICT,
                "시설 예약이 학교 일정과 충돌했어요", label + " — " + event.detail(),
                event.bookingId(), key);
        notifyAdmins(NotificationType.FACILITY_BOOKING_CONFLICT, "예약 충돌 처리가 필요해요",
                clubName(event.clubId()) + " · " + label + " — " + event.detail(),
                event.bookingId(), key);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleCancelled(FacilityBookingCancelledEvent event) {
        FacilityBooking booking = findBookingOrWarn(event.bookingId(), "CANCELLED");
        if (booking == null) {
            return;
        }
        notifyOfficers(event.clubId(), NotificationType.FACILITY_BOOKING_CANCELLED,
                "시설 예약이 취소됐어요", bookingLabel(booking) + " — 사유: " + event.reason(),
                event.bookingId(), dedupKey("CANCELLED", event.bookingId(), event.historyId()));
    }

    // ---------- helpers ----------

    /** historyId 로 전이 인스턴스 단위 dedup — CONFLICT→재승인 같은 재전이도 억제 없이 알린다(FederationAnswered 전례). */
    private static String dedupKey(String eventName, Long bookingId, Long historyId) {
        return "FACILITY_BOOKING_" + eventName + ":b=" + bookingId + ":h=" + historyId;
    }

    private FacilityBooking findBookingOrWarn(Long bookingId, String eventName) {
        return facilityBookingRepository.findById(bookingId).orElseGet(() -> {
            log.warn("FACILITY_BOOKING_{} 알림 스킵: 예약 없음 bookingId={}", eventName, bookingId);
            return null;
        });
    }

    /** "{시설명} M월 d일 HH:mm~HH:mm" — 시설이 조회되지 않으면 시설명 없이 일시만. */
    private String bookingLabel(FacilityBooking booking) {
        String roomName = facilityRepository.findById(booking.getFacilityId())
                .map(facility -> facility.getRoomName() + " ")
                .orElse("");
        return "%s%d월 %d일 %02d:%02d~%02d:%02d".formatted(roomName,
                booking.getReservationDate().getMonthValue(), booking.getReservationDate().getDayOfMonth(),
                booking.getStartTime().getHour(), booking.getStartTime().getMinute(),
                booking.getEndTime().getHour(), booking.getEndTime().getMinute());
    }

    private String clubName(Long clubId) {
        return clubRepository.findById(clubId).map(club -> club.getName()).orElse("(삭제된 동아리)");
    }

    private void notifyOfficers(Long clubId, NotificationType type, String title, String body,
            Long bookingId, String dedupKey) {
        String linkUrl = "/manage/clubs/" + clubId + "/facility-bookings";
        for (Long officerUserId : clubMemberRepository.findOfficerUserIdsByClubIdIn(List.of(clubId))) {
            createQuietly(officerUserId, type, title, body, linkUrl, bookingId, dedupKey);
        }
    }

    /** 총동연(ADMIN)은 극소수 — createIfAbsent loop 로 충분(FederationInquiryReceived 전례). */
    private void notifyAdmins(NotificationType type, String title, String body,
            Long bookingId, String dedupKey) {
        userRepository.findAllByRole(UserRole.ADMIN).forEach(admin ->
                createQuietly(admin.getId(), type, title, body, ADMIN_LINK, bookingId, dedupKey));
    }

    private void createQuietly(Long userId, NotificationType type, String title, String body,
            String linkUrl, Long bookingId, String dedupKey) {
        try {
            notificationService.createIfAbsent(new CreateNotificationCommand(
                    userId, type, title, truncateBody(body), linkUrl,
                    Map.of("bookingId", bookingId), dedupKey));
        } catch (Exception failure) {
            log.warn("{} 알림 실패: userId={}, bookingId={}", type, userId, bookingId, failure);
        }
    }

    /** body 컬럼 300자 제한 — 거절·취소 사유(최대 500자)가 초과시키지 않게 절단한다. */
    private static String truncateBody(String body) {
        return body.length() <= BODY_MAX_LENGTH ? body : body.substring(0, BODY_MAX_LENGTH - 1) + "…";
    }
}
