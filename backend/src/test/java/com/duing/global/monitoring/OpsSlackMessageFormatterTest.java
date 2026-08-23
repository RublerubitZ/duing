package com.duing.global.monitoring;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.fee.entity.Bank;
import com.duing.domain.notification.event.FacilityBookingCancelledEvent;
import com.duing.domain.notification.event.FacilityBookingConflictEvent;
import com.duing.domain.notification.event.FacilityBookingRejectedEvent;
import com.duing.domain.notification.event.FacilityBookingSubmittedEvent;
import com.duing.domain.notification.event.RecruitmentOpenedEvent;
import com.duing.domain.user.entity.AdminUserAction;
import com.duing.domain.user.service.MoPollThrottle;
import com.duing.global.monitoring.event.AdminUserActionEvent;
import com.duing.global.monitoring.event.ClubClosedEvent;
import com.duing.global.monitoring.event.ClubCreatedEvent;
import com.duing.global.monitoring.event.ClubStatusChangedEvent;
import com.duing.global.monitoring.event.FeeAccountCreatedEvent;
import com.duing.global.monitoring.event.UserRegisteredEvent;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class OpsSlackMessageFormatterTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 8, 22, 23, 41);
    private static final Clock FIXED_CLOCK = Clock.fixed(NOW.atZone(SEOUL).toInstant(), SEOUL);

    private final MoPollThrottle moPollThrottle = new MoPollThrottle(1_000);
    private final OpsSlackMessageFormatter formatter =
            new OpsSlackMessageFormatter("production", moPollThrottle, FIXED_CLOCK);

    @Test
    @DisplayName("회원가입 메시지는 이름·학번·UserId·환경·KST 가입시간·Octomo 자체 집계 줄을 명시 필드로만 조립한다")
    void userRegisteredMessageContainsExplicitFieldsOnly() {
        moPollThrottle.reserveDailyQuota(NOW);
        moPollThrottle.reserveDailyQuota(NOW);

        String message = formatter.userRegistered(new UserRegisteredEvent(812L, "20231234", "홍길동", NOW));

        assertThat(message).isEqualTo(String.join("\n",
                "🟢 신규 회원 가입",
                "서비스: Duing",
                "이벤트: USER_REGISTERED",
                "이름: 홍길동",
                "학번: 20231234",
                "UserId: 812",
                "환경: production",
                "가입시간: 2026-08-22 23:41 KST",
                "Octomo 호출(자체 집계, 오늘): 2 / 1,000"));
        assertThat(message).doesNotContain("이메일", "email", "전화", "010-", "password", "token");
    }

    @Test
    @DisplayName("Octomo 자체 집계 줄은 천 단위 구분자로 표기한다")
    void octomoUsageUsesThousandsSeparator() {
        MoPollThrottle largeLimitThrottle = new MoPollThrottle(10_000);
        OpsSlackMessageFormatter largeLimitFormatter =
                new OpsSlackMessageFormatter("local", largeLimitThrottle, FIXED_CLOCK);

        String message = largeLimitFormatter.userRegistered(new UserRegisteredEvent(1L, "20230001", "김두잉", NOW));

        assertThat(message).contains("Octomo 호출(자체 집계, 오늘): 0 / 10,000").contains("환경: local");
    }

    @Test
    @DisplayName("관리자 조치 메시지는 조치 종류·대상 UserId·관리자 UserId 만 싣고 사유는 싣지 않는다")
    void adminUserActionMessage() {
        String message = formatter.adminUserAction(new AdminUserActionEvent(AdminUserAction.ACCOUNT_SUSPENDED, 812L, 3L));

        assertThat(message).isEqualTo(String.join("\n",
                "🛡️ 관리자 조치",
                "서비스: Duing",
                "이벤트: ADMIN_USER_ACTION",
                "조치: ACCOUNT_SUSPENDED",
                "대상 UserId: 812",
                "관리자 UserId: 3",
                "환경: production",
                "시간: 2026-08-22 23:41 KST"));
    }

    @Test
    @DisplayName("동아리 생성·상태 변경·폐쇄 메시지는 동아리명·ClubId·상태 전이·행위자 UserId 를 싣는다")
    void clubMessages() {
        assertThat(formatter.clubCreated(new ClubCreatedEvent(7L, "두잉개발회", 5L))).isEqualTo(String.join("\n",
                "🏛️ 동아리 생성", "서비스: Duing", "이벤트: CLUB_CREATED",
                "동아리: 두잉개발회", "ClubId: 7", "회장 UserId: 5",
                "환경: production", "시간: 2026-08-22 23:41 KST"));

        assertThat(formatter.clubStatusChanged(new ClubStatusChangedEvent(
                7L, "두잉개발회", ClubStatus.PENDING_APPROVAL, ClubStatus.ACTIVE, 3L)))
                .contains("🔄 동아리 상태 변경", "이벤트: CLUB_STATUS_CHANGED",
                        "상태: PENDING_APPROVAL → ACTIVE", "관리자 UserId: 3");

        assertThat(formatter.clubClosed(new ClubClosedEvent(7L, "두잉개발회", 3L)))
                .contains("⛔ 동아리 폐쇄", "이벤트: CLUB_CLOSED", "동아리: 두잉개발회", "ClubId: 7", "관리자 UserId: 3");
    }

    @Test
    @DisplayName("회비 계좌 등록 메시지는 은행 코드와 id 만 싣는다")
    void feeAccountCreatedMessage() {
        String message = formatter.feeAccountCreated(new FeeAccountCreatedEvent(7L, 21L, Bank.KB, 5L));

        assertThat(message).contains("🏦 회비 계좌 등록", "이벤트: FEE_ACCOUNT_CREATED",
                "ClubId: 7", "계좌Id: 21", "은행: KB", "등록자 UserId: 5");
    }

    @Test
    @DisplayName("모집 오픈 메시지는 동아리·모집 제목·마감일을 싣고, 마감일이 없으면 '상시' 로 표기한다")
    void recruitmentOpenedMessage() {
        assertThat(formatter.recruitmentOpened(new RecruitmentOpenedEvent(
                33L, 7L, "두잉개발회", "2학기 신입 모집", LocalDate.of(2026, 9, 10))))
                .contains("📣 모집 오픈", "이벤트: RECRUITMENT_OPENED", "동아리: 두잉개발회", "ClubId: 7",
                        "모집: 2학기 신입 모집", "RecruitmentId: 33", "마감: 2026-09-10");

        assertThat(formatter.recruitmentOpened(new RecruitmentOpenedEvent(34L, 7L, "두잉개발회", "상시 모집", null)))
                .contains("마감: 상시");
    }

    @Test
    @DisplayName("시설 예약 메시지는 BookingId·ClubId 만 싣고 자유 텍스트(취소 사유·충돌 상세)는 절대 싣지 않는다")
    void facilityBookingMessagesExcludeFreeText() {
        assertThat(formatter.facilityBookingSubmitted(new FacilityBookingSubmittedEvent(90L, 7L)))
                .contains("🏟️ 시설 예약 신청", "이벤트: FACILITY_BOOKING_SUBMITTED", "BookingId: 90", "ClubId: 7");

        String rejected = formatter.facilityBookingRejected(
                new FacilityBookingRejectedEvent(90L, 7L, 399L, "신청자 홍길동 서류 미비"));
        assertThat(rejected).contains("🏟️ 시설 예약 거절", "이벤트: FACILITY_BOOKING_REJECTED", "BookingId: 90", "ClubId: 7")
                .doesNotContain("홍길동", "서류 미비");

        String cancelled = formatter.facilityBookingCancelled(
                new FacilityBookingCancelledEvent(90L, 7L, 400L, "학생 홍길동 010-1234-5678 요청"));
        assertThat(cancelled).contains("🏟️ 시설 예약 취소(관리자)", "이벤트: FACILITY_BOOKING_CANCELLED", "BookingId: 90")
                .doesNotContain("홍길동", "010-1234-5678");

        String conflict = formatter.facilityBookingConflict(
                new FacilityBookingConflictEvent(90L, 7L, 401L, "타 동아리 김철수 중복"));
        assertThat(conflict).contains("⚠️ 시설 예약 충돌", "이벤트: FACILITY_BOOKING_CONFLICT", "BookingId: 90")
                .doesNotContain("김철수");
    }

    @Test
    @DisplayName("시간은 주입된 시계(Asia/Seoul) 기준으로 KST 로 표기한다 — UTC 시계를 넣어도 변환되지 않는 raw now 가 아니다")
    void timeUsesInjectedClock() {
        Clock utcMidnight = Clock.fixed(LocalDateTime.of(2026, 8, 22, 15, 0).toInstant(ZoneOffset.UTC), SEOUL);
        OpsSlackMessageFormatter seoulFormatter = new OpsSlackMessageFormatter("production", moPollThrottle, utcMidnight);

        assertThat(seoulFormatter.clubClosed(new ClubClosedEvent(1L, "x", 1L))).contains("시간: 2026-08-23 00:00 KST");
    }
}
