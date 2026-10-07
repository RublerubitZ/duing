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
import com.duing.global.monitoring.event.ClubInviteAutoApproveIssuedEvent;
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
 * 동아리명은 리스너가 id 로 조회해 넘기는 유일한 외부 값이다(이미 다른 이벤트가 싣는 필드).
 * 프론트 재생성 트리거 알림({@code FrontendRevalidator})과 트래픽 이상·일간 요약 알림({@code TrafficSurgeMonitor})만 이벤트 없이
 * 호출부가 명시 값(경로·횟수·사유 토큰 / 집계 수치)으로 부른다.
 *
 * <p>환경 라벨은 {@code sentry.environment} 를 재사용한다(prod=production, 로컬=local) — 환경 이름의 단일 출처.
 * 시간은 seoulClock(Asia/Seoul) 기준 KST — USER_REGISTERED 만 가입 트랜잭션의 시각(event.registeredAt)이고, 프론트 재생성
 * 트리거·트래픽 알림은 호출부의 판정(발송) 시각, 나머지는 리스너 수신 시각이다(비동기 지연은 ms 단위). Octomo 줄은 {@link MoPollThrottle#dailyUsage} 의 <b>자체 집계</b>다 —
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

    /** 초대 코드 값은 가입 자격 그 자체라 싣지 않는다. 만료는 seoulClock 벽시계라 환산 없이 KST 로 찍는다. */
    public String clubInviteAutoApproveIssued(ClubInviteAutoApproveIssuedEvent event) {
        return compose("⚠️ 자동승인 부원 초대 링크 발급", "CLUB_INVITE_AUTO_APPROVE_ISSUED",
                Arrays.asList(field("동아리", event.clubName()), field("ClubId", event.clubId()),
                        field("JoinCodeId", event.joinCodeId()), field("정원", event.maxUses()),
                        field("만료", KST_MINUTE.format(event.expiresAtKst()) + " KST"),
                        field("발급자 UserId", event.actorUserId())));
    }

    /** 동아리명은 이벤트에 없어 리스너가 조회해 넘긴다 — 폐쇄된 동아리면 null 이고 그 줄은 빠진다. */
    public String feeAccountCreated(FeeAccountCreatedEvent event, String clubName) {
        return compose("🏦 회비 계좌 등록", "FEE_ACCOUNT_CREATED",
                Arrays.asList(field("동아리", clubName), field("ClubId", event.clubId()),
                        field("계좌Id", event.feeAccountId()),
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

    public String facilityBookingSubmitted(FacilityBookingSubmittedEvent event, String clubName) {
        return compose("🏟️ 시설 예약 신청", "FACILITY_BOOKING_SUBMITTED",
                Arrays.asList(field("동아리", clubName), field("BookingId", event.bookingId()),
                        field("ClubId", event.clubId())));
    }

    /** reason(자유 텍스트)은 읽지 않는다. */
    public String facilityBookingRejected(FacilityBookingRejectedEvent event, String clubName) {
        return compose("🏟️ 시설 예약 거절", "FACILITY_BOOKING_REJECTED",
                Arrays.asList(field("동아리", clubName), field("BookingId", event.bookingId()),
                        field("ClubId", event.clubId())));
    }

    /** 관리자 취소만 이벤트가 있다(동아리 측 취소는 이벤트 미발행). reason(자유 텍스트)은 읽지 않는다. */
    public String facilityBookingCancelled(FacilityBookingCancelledEvent event, String clubName) {
        return compose("🏟️ 시설 예약 취소(관리자)", "FACILITY_BOOKING_CANCELLED",
                Arrays.asList(field("동아리", clubName), field("BookingId", event.bookingId()),
                        field("ClubId", event.clubId())));
    }

    /** detail(자유 텍스트)은 읽지 않는다. */
    public String facilityBookingConflict(FacilityBookingConflictEvent event, String clubName) {
        return compose("⚠️ 시설 예약 충돌", "FACILITY_BOOKING_CONFLICT",
                Arrays.asList(field("동아리", clubName), field("BookingId", event.bookingId()),
                        field("ClubId", event.clubId())));
    }

    /**
     * 정각 재생성 트리거 연속 실패 — 사유는 상태 코드·예외 클래스명 토큰이다(비밀값·URL·응답 본문 없음).
     * 사유별 조치는 런북 줄이 가리키는 문서에 둔다.
     */
    public String frontendRevalidationFailing(String path, int consecutiveFailures, String lastFailureReason) {
        return compose("⚠️ 프론트 재생성 트리거 연속 실패", "FRONTEND_REVALIDATION_FAILING",
                Arrays.asList(field("경로", path), field("연속 실패", consecutiveFailures + "회"),
                        field("마지막 사유", lastFailureReason)),
                "시간", LocalDateTime.now(clock), List.of("런북: deploy/MONITORING.md"));
    }

    public String frontendRevalidationRecovered(String path, int failuresBeforeRecovery) {
        return compose("✅ 프론트 재생성 트리거 복구", "FRONTEND_REVALIDATION_RECOVERED",
                Arrays.asList(field("경로", path), field("연속 실패", failuresBeforeRecovery + "회 뒤 성공")));
    }

    /**
     * api 트래픽 이상 — 분당 요청이나 분당 429 가 기준 이상인 집계가 이어졌다({@code TrafficSurgeMonitor}). 수치는 이번 이상
     * 구간의 최대치다. 집계 수치만 싣는다(IP·경로 없음). 정상 사용자 몰림일 수도 있어 확인 순서를 먼저 적는다.
     */
    public String trafficSurgeDetected(long peakRequestsPerMinute, long peakRejectionsPerMinute, int surgeRuns,
                                       long requestThreshold, long rejectionThreshold) {
        return compose("🚨 api 트래픽 이상 — 비상 모드 검토", "TRAFFIC_SURGE_DETECTED",
                Arrays.asList(
                        field("최대 분당 요청",
                                String.format(Locale.ROOT, "%,d (기준 %,d)", peakRequestsPerMinute, requestThreshold)),
                        field("최대 분당 429",
                                String.format(Locale.ROOT, "%,d (기준 %,d)", peakRejectionsPerMinute, rejectionThreshold)),
                        field("판정", "집계 " + surgeRuns + "회 연속 기준 이상")),
                "시간", LocalDateTime.now(clock),
                List.of("정상 사용자가 몰린 것(가두모집 등)일 수 있다 — 서버 부하·오류부터 확인",
                        "런북: deploy/MONITORING.md (공격이면 deploy/EDGE-EMERGENCY.md)"));
    }

    /** 수치는 이상 구간(감지 전 연속 이상 집계부터 정상화까지)의 최대치다. 지속 시간은 두 메시지의 시간 줄로 안다. */
    public String trafficSurgeRecovered(long peakRequestsPerMinute, long peakRejectionsPerMinute, int calmRuns) {
        return compose("✅ api 트래픽 정상화", "TRAFFIC_SURGE_RECOVERED",
                Arrays.asList(
                        field("이상 구간 최대 분당 요청", String.format(Locale.ROOT, "%,d", peakRequestsPerMinute)),
                        field("이상 구간 최대 분당 429", String.format(Locale.ROOT, "%,d", peakRejectionsPerMinute)),
                        field("판정", "집계 " + calmRuns + "회 연속 기준 미만")));
    }

    /**
     * api 트래픽 일간 요약 — 매일 09:00 KST 경계에서 직전 기간을 한 번 보낸다({@code TrafficSurgeMonitor}). 기준 조정 근거이자
     * 감지 잡 생존 신호다. 재기동으로 중간부터 셌으면 기간 줄에 표시한다. 집계 수치만 싣는다.
     */
    public String trafficDailySummary(TrafficDailySummary summary) {
        String period = KST_MINUTE.format(summary.periodStart()) + " ~ " + KST_MINUTE.format(summary.periodEnd()) + " KST"
                + (summary.startedAfterRestart() ? " (재기동 뒤부터)" : "");
        String peakRequests = String.format(Locale.ROOT, "%,d", summary.peakRequestsPerMinute())
                + (summary.peakRequestsAt() == null ? "" : " (" + KST_MINUTE.format(summary.peakRequestsAt()) + ")");
        return compose("📊 api 트래픽 일간 요약", "TRAFFIC_DAILY_SUMMARY",
                Arrays.asList(
                        field("기간", period),
                        field("총 요청", String.format(Locale.ROOT, "%,d (429 %,d)",
                                summary.totalRequests(), summary.totalRejections())),
                        field("최대 분당 요청", peakRequests),
                        field("최대 분당 429", String.format(Locale.ROOT, "%,d", summary.peakRejectionsPerMinute())),
                        field("이상 감지", summary.surgeAlerts() + "회"),
                        field("기준", String.format(Locale.ROOT, "분당 요청 %,d · 분당 429 %,d",
                                summary.requestThreshold(), summary.rejectionThreshold()))));
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
