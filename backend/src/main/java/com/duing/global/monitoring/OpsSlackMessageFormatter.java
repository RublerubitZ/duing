package com.duing.global.monitoring;

import com.duing.domain.notification.event.FacilityBookingCancelledEvent;
import com.duing.domain.notification.event.FacilityBookingConflictEvent;
import com.duing.domain.notification.event.FacilityBookingRejectedEvent;
import com.duing.domain.notification.event.FacilityBookingSubmittedEvent;
import com.duing.domain.notification.event.RecruitmentOpenedEvent;
import com.duing.domain.user.service.MoPollThrottle;
import com.duing.global.monitoring.event.AdminUserActionEvent;
import com.duing.global.monitoring.event.ClubClosedEvent;
import com.duing.global.monitoring.event.ClubCreatedEvent;
import com.duing.global.monitoring.event.ClubStatusChangedEvent;
import com.duing.global.monitoring.event.FeeAccountCreatedEvent;
import com.duing.global.monitoring.event.UserRegisteredEvent;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 운영 이벤트 → Slack 평문 메시지. <b>이벤트 record 의 명시 필드만</b> 줄로 조립한다 — 요청 바디·헤더·
 * 자유 텍스트(사유·상세)는 어떤 메서드도 읽지 않는다. 골격: 헤더 / 서비스 / 이벤트 / 도메인 필드 / 환경 / 시간 (/ 부가줄).
 *
 * <p>환경 라벨은 {@code sentry.environment} 를 재사용한다(prod=production, 로컬=local) — 환경 이름의 단일 출처.
 * 시간은 seoulClock(Asia/Seoul) 기준 KST — USER_REGISTERED 만 가입 트랜잭션의 시각(event.registeredAt)이고 나머지는
 * 리스너 수신 시각이다(비동기 지연은 ms 단위). Octomo 줄은 {@link MoPollThrottle#dailyUsage} 의 <b>자체 집계</b>다 —
 * Octomo 는 잔여 쿼터 조회 API 를 제공하지 않는다(벤더 월 쿼터는 Octomo 마이페이지에서만 확인).
 */
@Component
public class OpsSlackMessageFormatter {

    private static final String SERVICE_NAME = "Duing";
    private static final DateTimeFormatter KST_MINUTE = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final String environment;
    private final MoPollThrottle moPollThrottle;
    private final Clock clock;

    public OpsSlackMessageFormatter(@Value("${sentry.environment:local}") String environment,
                                    MoPollThrottle moPollThrottle,
                                    Clock clock) {
        this.environment = environment;
        this.moPollThrottle = moPollThrottle;
        this.clock = clock;
    }

    public String userRegistered(UserRegisteredEvent event) {
        MoPollThrottle.DailyUsage octomoUsage = moPollThrottle.dailyUsage(LocalDateTime.now(clock));
        return compose("🟢 신규 회원 가입", "USER_REGISTERED",
                Arrays.asList(field("이름", event.name()), field("학번", event.studentId()), field("UserId", event.userId())),
                "가입시간", event.registeredAt(),
                List.of(String.format(Locale.ROOT, "Octomo 호출(자체 집계, 오늘): %,d / %,d",
                        octomoUsage.usedCalls(), octomoUsage.dailyLimit())));
    }

    public String clubCreated(ClubCreatedEvent event) {
        return compose("🏛️ 동아리 생성", "CLUB_CREATED",
                Arrays.asList(field("동아리", event.clubName()), field("ClubId", event.clubId()),
                        field("회장 UserId", event.leaderUserId())));
    }

    public String clubStatusChanged(ClubStatusChangedEvent event) {
        return compose("🔄 동아리 상태 변경", "CLUB_STATUS_CHANGED",
                Arrays.asList(field("동아리", event.clubName()), field("ClubId", event.clubId()),
                        field("상태", event.previousStatus() + " → " + event.nextStatus()),
                        field("관리자 UserId", event.actorUserId())));
    }

    public String clubClosed(ClubClosedEvent event) {
        return compose("⛔ 동아리 폐쇄", "CLUB_CLOSED",
                Arrays.asList(field("동아리", event.clubName()), field("ClubId", event.clubId()),
                        field("관리자 UserId", event.actorUserId())));
    }

    public String feeAccountCreated(FeeAccountCreatedEvent event) {
        return compose("🏦 회비 계좌 등록", "FEE_ACCOUNT_CREATED",
                Arrays.asList(field("ClubId", event.clubId()), field("계좌Id", event.feeAccountId()),
                        field("은행", event.bank() == null ? null : event.bank().name()),
                        field("등록자 UserId", event.actorUserId())));
    }

    public String adminUserAction(AdminUserActionEvent event) {
        return compose("🛡️ 관리자 조치", "ADMIN_USER_ACTION",
                Arrays.asList(field("조치", event.action()), field("대상 UserId", event.targetUserId()),
                        field("관리자 UserId", event.actorUserId())));
    }

    public String recruitmentOpened(RecruitmentOpenedEvent event) {
        return compose("📣 모집 오픈", "RECRUITMENT_OPENED",
                Arrays.asList(field("동아리", event.clubName()), field("ClubId", event.clubId()),
                        field("모집", event.recruitmentTitle()), field("RecruitmentId", event.recruitmentId()),
                        field("마감", event.endDate() == null ? "상시" : event.endDate().toString())));
    }

    public String facilityBookingSubmitted(FacilityBookingSubmittedEvent event) {
        return compose("🏟️ 시설 예약 신청", "FACILITY_BOOKING_SUBMITTED",
                Arrays.asList(field("BookingId", event.bookingId()), field("ClubId", event.clubId())));
    }

    /** reason(자유 텍스트)은 읽지 않는다. */
    public String facilityBookingRejected(FacilityBookingRejectedEvent event) {
        return compose("🏟️ 시설 예약 거절", "FACILITY_BOOKING_REJECTED",
                Arrays.asList(field("BookingId", event.bookingId()), field("ClubId", event.clubId())));
    }

    /** 관리자 취소만 이벤트가 있다(동아리 측 취소는 이벤트 미발행). reason(자유 텍스트)은 읽지 않는다. */
    public String facilityBookingCancelled(FacilityBookingCancelledEvent event) {
        return compose("🏟️ 시설 예약 취소(관리자)", "FACILITY_BOOKING_CANCELLED",
                Arrays.asList(field("BookingId", event.bookingId()), field("ClubId", event.clubId())));
    }

    /** detail(자유 텍스트)은 읽지 않는다. */
    public String facilityBookingConflict(FacilityBookingConflictEvent event) {
        return compose("⚠️ 시설 예약 충돌", "FACILITY_BOOKING_CONFLICT",
                Arrays.asList(field("BookingId", event.bookingId()), field("ClubId", event.clubId())));
    }

    private String compose(String header, String eventType, List<String> domainLines) {
        return compose(header, eventType, domainLines, "시간", LocalDateTime.now(clock), List.of());
    }

    private String compose(String header, String eventType, List<String> domainLines,
                           String timeLabel, LocalDateTime occurredAt, List<String> trailingLines) {
        List<String> lines = new ArrayList<>();
        lines.add(header);
        lines.add("서비스: " + SERVICE_NAME);
        lines.add("이벤트: " + eventType);
        domainLines.stream().filter(Objects::nonNull).forEach(lines::add);
        lines.add("환경: " + environment);
        lines.add(timeLabel + ": " + KST_MINUTE.format(occurredAt) + " KST");
        lines.addAll(trailingLines);
        return String.join("\n", lines);
    }

    /** 값이 없는 줄은 출력하지 않는다(스펙 §14) — null 을 돌려주고 compose 가 거른다. */
    private static String field(String label, Object value) {
        return value == null ? null : label + ": " + value;
    }
}
