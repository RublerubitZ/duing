package com.duing.domain.adminconsole.service;

import static com.duing.domain.adminconsole.service.WeeklyBriefingTestSupport.insideMoments;
import static com.duing.domain.adminconsole.service.WeeklyBriefingTestSupport.latestEndedWeek;
import static com.duing.domain.adminconsole.service.WeeklyBriefingTestSupport.outsideMoments;
import static com.duing.domain.adminconsole.service.WeeklyBriefingTestSupport.placeInstant;
import static com.duing.domain.adminconsole.service.WeeklyBriefingTestSupport.placeSystem;
import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.FeeBillFixture;
import com.duing.common.fixture.FeePolicyFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery.FeeActivity;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery.RecruitmentActivity;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.entity.Payment;
import com.duing.domain.fee.entity.PaymentMethod;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.repository.PaymentRepository;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeContentFormat;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.repository.NoticeRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.profilecheck.entity.ProfileCheckConfirmation;
import com.duing.domain.user.profilecheck.entity.Semester;
import com.duing.domain.user.profilecheck.repository.ProfileCheckConfirmationRepository;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class AdminWeeklyBriefingActivityIntegrationTest extends IntegrationTestBase {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    @Autowired AdminWeeklyBriefingQueryService adminWeeklyBriefingQueryService;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired NoticeRepository noticeRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired FeePolicyRepository feePolicyRepository;
    @Autowired FeeBillRepository feeBillRepository;
    @Autowired PaymentRepository paymentRepository;
    @Autowired ClubAuditEventRepository clubAuditEventRepository;
    @Autowired ProfileCheckConfirmationRepository profileCheckConfirmationRepository;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired Clock clock;

    private final AtomicLong sequence = new AtomicLong(1);
    private Long adminUserId;
    private LocalDate weekStart;
    private LocalDateTime weekFirstMoment;
    private LocalDateTime weekLastMoment;
    private LocalDateTime nextMondayMoment;
    private LocalDateTime previousSundayMoment;

    @BeforeEach
    void setUp() {
        adminUserId = userRepository.save(UserFixture.admin()).getId();
        weekStart = latestEndedWeek(clock);
        weekFirstMoment = insideMoments(weekStart).get(0);
        weekLastMoment = insideMoments(weekStart).get(1);
        nextMondayMoment = outsideMoments(weekStart).get(0);
        previousSundayMoment = outsideMoments(weekStart).get(1);
    }

    @Test
    @DisplayName("총동연 공지는 그 주에 쓴 소유 동아리 없는 공지만 센다 — 동아리 공지·지운 공지·경계 밖은 빠진다")
    void countsFederationNoticesOnly() {
        insideMoments(weekStart).forEach(moment -> placeSystem(jdbcTemplate, "notice", saveNotice(null).getId(), "created_at", moment));
        outsideMoments(weekStart).forEach(moment -> placeSystem(jdbcTemplate, "notice", saveNotice(null).getId(), "created_at", moment));
        placeSystem(jdbcTemplate, "notice", saveNotice(saveClub().getId()).getId(), "created_at", weekFirstMoment);
        Notice deleted = saveNotice(null);
        noticeRepository.delete(deleted);
        placeSystem(jdbcTemplate, "notice", deleted.getId(), "created_at", weekFirstMoment);

        assertThat(adminWeeklyBriefingQueryService.getWeeklyBriefing(weekStart).federationNoticeCount()).isEqualTo(2);
    }

    @Test
    @DisplayName("새로 등록한 모집은 그 주 등록만, 모집 기간이 끝난 모집은 종료일이 월~일인 모집만 센다 — 상시모집·지운 모집은 빠지고 마감 여부는 가리지 않는다")
    void countsCreatedAndEndedRecruitments() {
        insideMoments(weekStart).forEach(moment -> placeSystem(jdbcTemplate, "recruitment", saveRecruitment(null).getId(), "created_at", moment));
        outsideMoments(weekStart).forEach(moment -> placeSystem(jdbcTemplate, "recruitment", saveRecruitment(null).getId(), "created_at", moment));
        Recruitment deletedCreated = saveRecruitment(null);
        recruitmentRepository.delete(deletedCreated);
        placeSystem(jdbcTemplate, "recruitment", deletedCreated.getId(), "created_at", weekFirstMoment);
        // 기간 끝 — 월요일(안), 일요일·마감(안), 전 일요일(밖), 다음 월요일(밖), 지운 모집(밖). 이 모집들은 이번 주에 등록돼 등록 수에는 없다.
        saveRecruitment(weekStart);
        Recruitment closedOnSunday = Recruitment.create(saveClub(), "마감 모집", null, weekStart.minusDays(10), weekStart.plusDays(6), 10);
        closedOnSunday.close(weekStart.plusDays(6).atTime(18, 0));
        recruitmentRepository.save(closedOnSunday);
        saveRecruitment(weekStart.minusDays(1));
        saveRecruitment(weekStart.plusDays(7));
        recruitmentRepository.delete(saveRecruitment(weekStart.plusDays(3)));

        RecruitmentActivity recruitment = adminWeeklyBriefingQueryService.getWeeklyBriefing(weekStart).recruitment();

        assertThat(recruitment.createdCount()).isEqualTo(2);
        assertThat(recruitment.endedCount()).isEqualTo(2);
    }

    @Test
    @DisplayName("제출된 지원서는 그 주 제출만 센다 — 철회(삭제)·경계 밖은 빠진다")
    void countsSubmittedApplications() {
        Recruitment recruitment = saveRecruitment(null);
        insideMoments(weekStart).forEach(moment -> placeSystem(jdbcTemplate, "application", saveApplication(recruitment).getId(), "created_at", moment));
        outsideMoments(weekStart).forEach(moment -> placeSystem(jdbcTemplate, "application", saveApplication(recruitment).getId(), "created_at", moment));
        Application withdrawn = saveApplication(recruitment);
        applicationRepository.delete(withdrawn);
        placeSystem(jdbcTemplate, "application", withdrawn.getId(), "created_at", weekFirstMoment);

        assertThat(adminWeeklyBriefingQueryService.getWeeklyBriefing(weekStart).recruitment().applicationCount()).isEqualTo(2);
    }

    @Test
    @DisplayName("회비 — 청구는 취소·삭제를 빼고 세고 청구 동아리는 한 번씩, 납부 기록은 정정 여부와 무관하게 입력한 날로, 정정은 정정 시각으로 센다")
    void countsFeeActivity() {
        Club clubA = saveClub();
        Club clubB = saveClub();
        Club clubC = saveClub();
        FeePolicy policyA = feePolicyRepository.save(FeePolicyFixture.monthly(clubA.getId()));
        FeePolicy policyB = feePolicyRepository.save(FeePolicyFixture.monthly(clubB.getId()));
        FeePolicy policyC = feePolicyRepository.save(FeePolicyFixture.monthly(clubC.getId()));
        Club cancelledOnlyClub = saveClub();
        FeePolicy cancelledOnlyPolicy = feePolicyRepository.save(FeePolicyFixture.monthly(cancelledOnlyClub.getId()));
        FeeBill billA1 = saveBill(clubA, policyA, FeeStatus.PENDING, "2026-01", weekFirstMoment);
        FeeBill billA2 = saveBill(clubA, policyA, FeeStatus.PENDING, "2026-01", weekLastMoment);
        saveBill(clubA, policyA, FeeStatus.CANCELLED, "2026-01", weekFirstMoment);
        FeeBill billB1 = saveBill(clubB, policyB, FeeStatus.PENDING, "2026-01", weekFirstMoment);
        saveBill(clubC, policyC, FeeStatus.PENDING, "2026-01", nextMondayMoment);
        saveBill(clubC, policyC, FeeStatus.PENDING, "2026-03", previousSundayMoment);
        FeeBill deletedBill = saveBill(clubC, policyC, FeeStatus.PENDING, "2026-02", weekFirstMoment);
        feeBillRepository.delete(deletedBill);
        // 주 안 청구가 취소 하나뿐인 동아리 — 청구 동아리로 세지 않는다.
        saveBill(cancelledOnlyClub, cancelledOnlyPolicy, FeeStatus.CANCELLED, "2026-01", weekLastMoment);
        // 납부 — p1 안·정정 안, p2 안·유효, p3 밖·정정 안, p4 안·정정 밖
        savePayment(billA1, weekFirstMoment, weekFirstMoment);
        savePayment(billA2, weekLastMoment, null);
        savePayment(billB1, nextMondayMoment, weekLastMoment);
        savePayment(billB1, weekFirstMoment, nextMondayMoment);
        savePayment(billA2, previousSundayMoment, previousSundayMoment); // 입력·정정 모두 전 주 — 빠진다

        FeeActivity fee = adminWeeklyBriefingQueryService.getWeeklyBriefing(weekStart).fee();

        assertThat(fee.billCount()).isEqualTo(3);
        assertThat(fee.billedClubCount()).isEqualTo(2);
        assertThat(fee.paymentCount()).isEqualTo(3);
        assertThat(fee.voidedPaymentCount()).isEqualTo(2);
    }

    @Test
    @DisplayName("입금 계좌를 바꾸거나 지운 동아리는 계좌 수정·삭제 이벤트를 남긴 동아리를 한 번씩 센다 — 최초 등록·경계 밖은 빠진다")
    void countsAccountChangedClubs() {
        Club changedTwice = saveClub();
        saveAccountEvent(ClubAuditEventType.FEE_ACCOUNT_UPDATED, changedTwice, weekFirstMoment);
        saveAccountEvent(ClubAuditEventType.FEE_ACCOUNT_UPDATED, changedTwice, weekLastMoment);
        saveAccountEvent(ClubAuditEventType.FEE_ACCOUNT_DELETED, saveClub(), weekLastMoment);
        saveAccountEvent(ClubAuditEventType.FEE_ACCOUNT_REGISTERED, saveClub(), weekFirstMoment);
        saveAccountEvent(ClubAuditEventType.FEE_ACCOUNT_UPDATED, saveClub(), nextMondayMoment);
        saveAccountEvent(ClubAuditEventType.FEE_ACCOUNT_DELETED, saveClub(), previousSundayMoment);

        assertThat(adminWeeklyBriefingQueryService.getWeeklyBriefing(weekStart).fee().accountChangedClubCount()).isEqualTo(2);
    }

    @Test
    @DisplayName("학기 정보 확인 완료는 그 주 확인 기록 중 콘솔 대상자(정지·졸업생·탈퇴 제외) 것만 센다")
    void countsTargetProfileConfirmations() {
        confirm(userRepository.save(UserFixture.unique()), weekFirstMoment);
        confirm(userRepository.save(UserFixture.unique()), weekLastMoment);
        confirm(userRepository.save(UserFixture.unique()), nextMondayMoment);
        confirm(userRepository.save(UserFixture.unique()), previousSundayMoment);
        User graduated = UserFixture.unique();
        graduated.updateProfile(graduated.getName(), Grade.GRADUATED, null, null, UserFixture.PAST_GRADE_CHANGE);
        confirm(userRepository.save(graduated), weekFirstMoment);
        User suspended = UserFixture.unique();
        suspended.suspend();
        confirm(userRepository.save(suspended), weekFirstMoment);
        User withdrawn = userRepository.save(UserFixture.unique());
        confirm(withdrawn, weekFirstMoment);
        userRepository.delete(withdrawn);

        assertThat(adminWeeklyBriefingQueryService.getWeeklyBriefing(weekStart).profileCheckConfirmedCount()).isEqualTo(2);
    }

    private Notice saveNotice(Long owningClubId) {
        Notice notice = Notice.create("공지", "요약", "내용", "", null, NoticeCategory.GENERAL, List.of(),
                NoticeVisibility.PUBLIC, null, false, null, false, null, null, null, null, null,
                NoticeContentFormat.MARKDOWN, adminUserId);
        if (owningClubId != null) {
            notice.assignOwningClub(owningClubId);
        }
        return noticeRepository.save(notice);
    }

    /** 모집은 동아리당 OPEN 하나(uk_recruitment_club_active)라 모집마다 동아리를 만든다. endDate null 은 상시모집. */
    private Recruitment saveRecruitment(LocalDate endDate) {
        LocalDate startDate = endDate == null ? weekStart.minusDays(30) : endDate.minusDays(10);
        return recruitmentRepository.save(Recruitment.create(saveClub(), "모집" + sequence.incrementAndGet(), null,
                startDate, endDate, 10));
    }

    private Application saveApplication(Recruitment recruitment) {
        return applicationRepository.save(Application.submit(recruitment, userRepository.save(UserFixture.unique()), List.of()));
    }

    /** 청구는 (정책, 회원, 시작일) 이 겹치면 안 되므로(uk_fee_bill_idem) 회원을 늘 새로 만든다. */
    private FeeBill saveBill(Club club, FeePolicy policy, FeeStatus status, String period, LocalDateTime createdAt) {
        User member = userRepository.save(UserFixture.unique());
        FeeBill bill = feeBillRepository.save(FeeBillFixture.withStatus(club.getId(), member.getId(), policy.getId(), period, status));
        placeSystem(jdbcTemplate, "fee_bill", bill.getId(), "created_at", createdAt);
        return bill;
    }

    private void savePayment(FeeBill bill, LocalDateTime createdAt, LocalDateTime voidedAt) {
        Payment payment = Payment.record(bill.getId(), 10_000L, PaymentMethod.CASH, createdAt.atZone(SEOUL).toInstant(), adminUserId, null);
        if (voidedAt != null) {
            payment.voidPayment(adminUserId, "정정", Instant.now(clock));
        }
        Payment saved = paymentRepository.save(payment);
        placeSystem(jdbcTemplate, "payment", saved.getId(), "created_at", createdAt);
        if (voidedAt != null) {
            placeInstant(jdbcTemplate, "payment", saved.getId(), "voided_at", voidedAt);
        }
    }

    private void saveAccountEvent(ClubAuditEventType eventType, Club club, LocalDateTime createdAt) {
        ClubAuditEvent event = clubAuditEventRepository.save(ClubAuditEvent.feeAccount(eventType, club.getId(), adminUserId, null));
        placeSystem(jdbcTemplate, "club_audit_event", event.getId(), "created_at", createdAt);
    }

    private void confirm(User user, LocalDateTime confirmedAt) {
        profileCheckConfirmationRepository.save(
                ProfileCheckConfirmation.of(user.getId(), Semester.of(weekStart), confirmedAt.atZone(SEOUL).toInstant()));
    }

    private Club saveClub() {
        return clubRepository.save(ClubFixture.academic("주간활동동아리" + sequence.incrementAndGet()));
    }
}
