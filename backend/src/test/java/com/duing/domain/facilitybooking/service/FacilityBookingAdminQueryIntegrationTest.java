package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.BookingWindowFixture;
import com.duing.common.fixture.FacilityBookingFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.facility.entity.DataSource;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facility.service.FacilityCrawlService;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.repository.FacilityBookingStatusHistoryRepository;
import com.duing.domain.facilitybooking.service.FacilityBookingAdminQueryService.AdminBookingDetailResult;
import com.duing.domain.facilitybooking.service.FacilityBookingAdminQueryService.AdminBookingSummaryCounts;
import com.duing.domain.facilitybooking.service.FacilityBookingAdminQueryService.AdminBookingSummaryResult;
import com.duing.domain.facilitybooking.service.dto.command.CreateFacilityBookingCommand;
import com.duing.domain.facilitybooking.service.dto.query.AdminBookingSearchCondition;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * 관리자 큐·상세·대시보드 조회 서비스 통합 테스트.
 * 픽스처 헬퍼(saveUser/saveActiveClub/saveFacility/fixture/bookableDate/pendingBooking/sequence)는
 * 같은 패키지의 {@link FacilityBookingAdminServiceIntegrationTest} 코드를 그대로 복제한다(사이드 파일 패턴 일치).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class FacilityBookingAdminQueryIntegrationTest extends IntegrationTestBase {

    @Autowired FacilityBookingAdminQueryService queryService;
    @Autowired FacilityBookingAdminService adminService;
    @Autowired FacilityBookingService bookingService;
    @Autowired FacilityBookingRepository bookingRepository;
    @Autowired FacilityBookingStatusHistoryRepository historyRepository;
    @Autowired FacilityRepository facilityRepository;
    @Autowired FacilityReservationRepository facilityReservationRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;
    @Autowired Clock clock;

    // 온디맨드 크롤 차단 — 실제 학교 서버 HTTP 시도를 막는다(전례: FacilityAvailabilityAcceptanceTest).
    // 스냅샷이 없고 STALE_CACHE 를 반환하므로 getDetail 의 stale 은 true 로 내려간다.
    @MockitoBean FacilityCrawlService facilityCrawlService;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void stubCrawl() {
        given(facilityCrawlService.ensureFresh(any())).willReturn(DataSource.STALE_CACHE);
    }

    // ---------- fixtures (FacilityBookingAdminServiceIntegrationTest 와 동일) ----------

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L), name + unique, "hashed",
                UserRole.STUDENT, Grade.FRESHMAN, College.IT_ENGINEERING, "미설정",
                "010-0000-0000", LocalDateTime.now()));
    }

    private Club saveActiveClub(String name) throws Exception {
        Club club = Club.create(name + "-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        club.changeCentralClub(true); // 시설 예약 신청은 중앙동아리만 가능(설계 spec 2026-07-18)
        return clubRepository.save(club);
    }

    private Facility saveFacility() {
        return facilityRepository.save(Facility.create(
                (int) (sequence.getAndIncrement() % 100_000), "커뮤니티룸(1)", "1503호", 0));
    }

    private record Fixture(User leader, Club club, Facility facility) {}

    private Fixture fixture() throws Exception {
        User leader = saveUser("리더");
        Club club = saveActiveClub("대관동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        return new Fixture(leader, club, saveFacility());
    }

    private LocalDate bookableDate() {
        // 시각 무관 항상 신청 가능한 날짜(내일) — 롤링 창은 오늘을 포함하나 고정 슬롯 시각 타임밤을 피해 내일을 쓴다.
        return BookingWindowFixture.bookableDate();
    }

    private Long pendingBooking(Fixture fixture, LocalDate date, int startHour, int endHour) {
        return bookingService.create(new CreateFacilityBookingCommand(
                fixture.club().getId(), fixture.leader().getId(), fixture.facility().getId(),
                date, LocalTime.of(startHour, 0), LocalTime.of(endHour, 0), "정기 합주", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE)).bookingId();
    }

    /**
     * 특정 상태의 신청을 신청 검증(기간·EXCLUDE 우회) 없이 직접 만든다 — summary 카운트 분포 구성용.
     * PENDING 만든 뒤 도메인 전이 메서드로 목표 상태에 도달한다. APPROVED/CONFIRMED 는 EXCLUDE 제약이
     * 있으므로 호출부가 겹치지 않는 슬롯을 준다.
     */
    private void saveInStatus(Fixture fixture, Long adminId, LocalDate date, int startHour, int endHour,
                              BookingStatus target, LocalDateTime decidedAt) {
        FacilityBooking booking = FacilityBooking.request(
                fixture.facility().getId(), fixture.club().getId(), fixture.leader().getId(),
                date, LocalTime.of(startHour, 0), LocalTime.of(endHour, 0), "정기 합주", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE);
        switch (target) {
            case PENDING -> { }
            case APPROVED -> booking.approve(adminId, null, decidedAt);
            case CONFIRMED -> {
                booking.approve(adminId, null, decidedAt);
                booking.confirmManually(decidedAt);
            }
            case CONFLICT -> {
                booking.approve(adminId, null, decidedAt);
                booking.markConflict("충돌");
            }
            case REJECTED -> booking.reject(adminId, "거절", decidedAt);
            default -> throw new IllegalArgumentException("지원하지 않는 상태: " + target);
        }
        bookingRepository.save(booking);
    }

    // ---------- tests ----------

    @Test
    @DisplayName("큐는 상태·시설 필터와 페이지를 적용하고 APPROVED 에 경과일·충돌 의심 플래그를 파생한다")
    void queueFiltersAndDerivesFlags() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        String clubName = clubRepository.findById(fixture.club().getId()).orElseThrow().getName();

        // APPROVED 필터에서 제외되어야 하는 PENDING 2건
        pendingBooking(fixture, date, 9, 10);
        pendingBooking(fixture, date, 10, 11);

        // APPROVED 1건 — 승인 후 이름 불일치 점유행이 겹쳐 conflictSuspected true 가 되도록 승인 다음에 주입한다
        Long approved = pendingBooking(fixture, date, 18, 20);
        adminService.approve(admin.getId(), approved);
        facilityReservationRepository.save(FacilityReservation.create(
                fixture.facility().getId(), sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(19, 0), LocalTime.of(20, 0), "전혀다른단체", null, null, LocalDateTime.now()));

        Page<AdminBookingSummaryResult> queue = queryService.getQueue(
                new AdminBookingSearchCondition(BookingStatus.APPROVED, null, null, null),
                PageRequest.of(0, 10));

        assertThat(queue.getTotalElements()).isEqualTo(1); // PENDING 2건은 상태 필터로 제외
        AdminBookingSummaryResult row = queue.getContent().get(0);
        assertThat(row.bookingId()).isEqualTo(approved);
        assertThat(row.status()).isEqualTo(BookingStatus.APPROVED);
        assertThat(row.clubName()).isEqualTo(clubName);
        assertThat(row.roomName()).isEqualTo("커뮤니티룸(1)");
        assertThat(row.approvedWaitingDays()).isZero(); // 방금 승인 → 경과일 0
        assertThat(row.conflictSuspected()).isTrue();
        assertThat(row.contactPhone()).isEqualTo(FacilityBookingFixture.VALID_CONTACT_PHONE); // 관리자 큐 노출

        // 시설 필터: 일치 시설은 1건, 미일치 시설은 0건
        assertThat(queryService.getQueue(new AdminBookingSearchCondition(
                        BookingStatus.APPROVED, fixture.facility().getId(), null, null),
                PageRequest.of(0, 10)).getTotalElements()).isEqualTo(1);
        assertThat(queryService.getQueue(new AdminBookingSearchCondition(
                        BookingStatus.APPROVED, fixture.facility().getId() + 987_654L, null, null),
                PageRequest.of(0, 10)).getTotalElements()).isZero();

        // 기간 필터 경계(goe/loe — 포함): 예약일 == dateFrom == dateTo 는 포함, 하루라도 벗어나면 제외
        assertThat(queryService.getQueue(new AdminBookingSearchCondition(
                        BookingStatus.APPROVED, null, date, date),
                PageRequest.of(0, 10)).getTotalElements()).isEqualTo(1);
        assertThat(queryService.getQueue(new AdminBookingSearchCondition(
                        BookingStatus.APPROVED, null, date.plusDays(1), null),
                PageRequest.of(0, 10)).getTotalElements()).isZero();
        assertThat(queryService.getQueue(new AdminBookingSearchCondition(
                        BookingStatus.APPROVED, null, null, date.minusDays(1)),
                PageRequest.of(0, 10)).getTotalElements()).isZero();
    }

    @Test
    @DisplayName("정규화 일치 이름의 점유행이 겹치면 충돌 의심이 아니다 — 학교가 우리 예약을 등록한 정상 경로")
    void matchingNameOverlapIsNotConflictSuspected() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        String clubName = clubRepository.findById(fixture.club().getId()).orElseThrow().getName();

        Long approved = pendingBooking(fixture, date, 18, 20);
        adminService.approve(admin.getId(), approved);
        // 학교가 동아리명(공백 변형)으로 겹치는 점유행 등록 — 정규화 일치라 충돌 의심 아님
        facilityReservationRepository.save(FacilityReservation.create(
                fixture.facility().getId(), sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(18, 0), LocalTime.of(19, 0), " " + clubName + " ", null, null, LocalDateTime.now()));

        Page<AdminBookingSummaryResult> queue = queryService.getQueue(
                new AdminBookingSearchCondition(BookingStatus.APPROVED, null, null, null),
                PageRequest.of(0, 10));

        assertThat(queue.getContent().get(0).conflictSuspected()).isFalse();
    }

    @Test
    @DisplayName("PENDING 큐는 오래된 순(createdAt asc)으로 정렬한다 — §9.7 기본 뷰")
    void pendingQueueOrdersOldestFirst() throws Exception {
        Fixture fixture = fixture();
        LocalDate date = bookableDate();
        Long first = pendingBooking(fixture, date, 9, 10);   // 먼저 생성
        Long second = pendingBooking(fixture, date, 10, 11);  // 나중 생성

        Page<AdminBookingSummaryResult> queue = queryService.getQueue(
                new AdminBookingSearchCondition(BookingStatus.PENDING, null, null, null),
                PageRequest.of(0, 10));

        assertThat(queue.getContent()).extracting(AdminBookingSummaryResult::bookingId)
                .containsExactly(first, second); // 오래된 순
    }

    @Test
    @DisplayName("정규화 일치 이름 점유행이 부분만 덮으면 partiallyMatched true·conflictSuspected false 다")
    void partiallyMatchedWhenSameNameRowPartiallyCovers() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        String clubName = clubRepository.findById(fixture.club().getId()).orElseThrow().getName();

        Long approved = pendingBooking(fixture, date, 18, 20);
        adminService.approve(admin.getId(), approved);
        // 동아리명(공백 변형)으로 18~19 만 덮는 점유행 — 19~20 미커버라 자동 확정 불발, 부분 반영 표시 대상
        facilityReservationRepository.save(FacilityReservation.create(
                fixture.facility().getId(), sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(18, 0), LocalTime.of(19, 0), " " + clubName + " ", null, null, LocalDateTime.now()));

        AdminBookingSummaryResult row = queryService.getQueue(
                new AdminBookingSearchCondition(BookingStatus.APPROVED, null, null, null),
                PageRequest.of(0, 10)).getContent().get(0);

        assertThat(row.partiallyMatched()).isTrue();
        assertThat(row.conflictSuspected()).isFalse();
    }

    @Test
    @DisplayName("정규화 일치 이름 점유행이 전 슬롯을 단일 행으로 완전 커버하면 partiallyMatched false 다 — 자동 확정 판정 대상")
    void notPartiallyMatchedWhenFullyCoveredBySingleRow() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();
        String clubName = clubRepository.findById(fixture.club().getId()).orElseThrow().getName();

        Long approved = pendingBooking(fixture, date, 18, 19); // 단일 1시간 슬롯
        adminService.approve(admin.getId(), approved);
        // 동아리명(공백 변형)으로 18~19 전 슬롯을 단일 행으로 완전 커버 — 자동 확정 판정 대상이라 부분 반영이 아니다
        facilityReservationRepository.save(FacilityReservation.create(
                fixture.facility().getId(), sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(18, 0), LocalTime.of(19, 0), " " + clubName + " ", null, null, LocalDateTime.now()));

        AdminBookingSummaryResult row = queryService.getQueue(
                new AdminBookingSearchCondition(BookingStatus.APPROVED, null, null, null),
                PageRequest.of(0, 10)).getContent().get(0);

        assertThat(row.partiallyMatched()).isFalse();
        assertThat(row.conflictSuspected()).isFalse();
    }

    @Test
    @DisplayName("상세는 겹침 컨텍스트(SCHOOL·INTERNAL·PENDING 수)와 이력·stale 을 담는다")
    void detailCarriesOverlapContextHistoryAndStale() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        LocalDate date = bookableDate();

        // 타 동아리 신청을 먼저 PENDING 으로 만든다 — create 는 APPROVED/CONFIRMED 겹침을 차단하므로,
        // 겹치는 PENDING↔APPROVED 상태를 만들려면 승인은 대상·제3 PENDING 을 만든 뒤에 해야 한다.
        User otherLeader = saveUser("리더B");
        Club otherClub = saveActiveClub("경쟁동아리");
        clubMemberRepository.save(ClubMember.asLeader(otherClub, otherLeader));
        Long otherApproved = bookingService.create(new CreateFacilityBookingCommand(
                otherClub.getId(), otherLeader.getId(), fixture.facility().getId(),
                date, LocalTime.of(18, 0), LocalTime.of(20, 0), "회의", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE)).bookingId();
        String otherClubName = clubRepository.findById(otherClub.getId()).orElseThrow().getName();

        // 대상 PENDING (18-19) — otherApproved(18-20)·제3 PENDING(18-19)과 겹친다
        Long target = pendingBooking(fixture, date, 18, 19);

        // 겹치는 다른 PENDING (제3동아리) — overlappingPendingCount 1(자기 제외)
        User thirdLeader = saveUser("리더C");
        Club thirdClub = saveActiveClub("제3동아리");
        clubMemberRepository.save(ClubMember.asLeader(thirdClub, thirdLeader));
        bookingService.create(new CreateFacilityBookingCommand(
                thirdClub.getId(), thirdLeader.getId(), fixture.facility().getId(),
                date, LocalTime.of(18, 0), LocalTime.of(19, 0), "연습", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE));

        // 이제 타 동아리 승인 → 대상 PENDING 이 APPROVED 와 겹치는 상태(INTERNAL 컨텍스트 대상)
        adminService.approve(admin.getId(), otherApproved);

        // 점유행(SCHOOL) 겹침 — 신청/승인 검증을 우회해 직접 주입
        facilityReservationRepository.save(FacilityReservation.create(
                fixture.facility().getId(), sequence.getAndIncrement(), YearMonth.from(date), date,
                LocalTime.of(18, 0), LocalTime.of(19, 0), "문화팀", null, null, LocalDateTime.now()));

        AdminBookingDetailResult detail = queryService.getDetail(target);

        assertThat(detail.status()).isEqualTo(BookingStatus.PENDING);
        assertThat(detail.stale()).isTrue(); // ensureFresh 목이 STALE_CACHE
        assertThat(detail.overlappingPendingCount()).isEqualTo(1); // 제3동아리 PENDING(자기 제외)
        assertThat(detail.overlaps()).hasSize(2); // SCHOOL 1 + INTERNAL 1
        assertThat(detail.overlaps()).anySatisfy(context -> {
            assertThat(context.source()).isEqualTo("SCHOOL");
            assertThat(context.organization()).isEqualTo("문화팀");
        });
        assertThat(detail.overlaps()).anySatisfy(context -> {
            assertThat(context.source()).isEqualTo("INTERNAL");
            assertThat(context.organization()).isEqualTo(otherClubName);
        });
        assertThat(detail.history()).isNotEmpty(); // 생성 이력(null→PENDING)
        assertThat(detail.contactPhone()).isEqualTo(FacilityBookingFixture.VALID_CONTACT_PHONE); // 관리자 상세 노출
    }

    @Test
    @DisplayName("관리자 상세는 대표 연락처를 노출하고, V85 이전 기존 행(빈 값)은 null 로 폴백한다")
    void detailExposesContactPhoneAndFallsBackToNullForLegacyRow() throws Exception {
        Fixture fixture = fixture();
        LocalDate date = bookableDate();

        // 신규 신청(요청 검증 통과 값) → 관리자 상세에 그대로 노출
        Long fresh = pendingBooking(fixture, date, 9, 10);
        assertThat(queryService.getDetail(fresh).contactPhone())
                .isEqualTo(FacilityBookingFixture.VALID_CONTACT_PHONE);

        // V85 로 채워진 기존 행(빈 문자열)을 리포지토리로 직접 재현 → 상세에서 null 폴백
        FacilityBooking legacy = bookingRepository.save(FacilityBooking.request(
                fixture.facility().getId(), fixture.club().getId(), fixture.leader().getId(),
                date, LocalTime.of(11, 0), LocalTime.of(12, 0), "정기 합주", null, ""));

        assertThat(queryService.getDetail(legacy.getId()).contactPhone()).isNull();
    }

    @Test
    @DisplayName("summary 는 상태별 카운트를 정확히 센다")
    void summaryCountsByStatus() throws Exception {
        Fixture fixture = fixture();
        User admin = saveUser("총동연");
        LocalDate today = LocalDate.now(clock);
        LocalDateTime decidedFiveDaysAgo = LocalDateTime.now(clock).minusDays(5);
        LocalDateTime decidedTwoDaysAgo = LocalDateTime.now(clock).minusDays(2);

        // PENDING 2건(모두 오늘 생성) — pendingCount 2, todaySubmittedCount 2
        saveInStatus(fixture, admin.getId(), today, 14, 15, BookingStatus.PENDING, null);
        saveInStatus(fixture, admin.getId(), today, 15, 16, BookingStatus.PENDING, null);

        // APPROVED 2건 — 가장 오래된 결정 5일 전 → oldestApprovedWaitingDays 5
        saveInStatus(fixture, admin.getId(), today, 9, 10, BookingStatus.APPROVED, decidedFiveDaysAgo);
        saveInStatus(fixture, admin.getId(), today, 10, 11, BookingStatus.APPROVED, decidedTwoDaysAgo);

        // CONFLICT 1건
        saveInStatus(fixture, admin.getId(), today, 16, 17, BookingStatus.CONFLICT, decidedTwoDaysAgo);

        // CONFIRMED — 이달(오늘) 1건 + 다른 달 1건(월 필터로 제외돼야 함)
        saveInStatus(fixture, admin.getId(), today, 11, 12, BookingStatus.CONFIRMED, decidedTwoDaysAgo);
        saveInStatus(fixture, admin.getId(), today.minusMonths(2), 9, 10, BookingStatus.CONFIRMED, decidedTwoDaysAgo);

        // REJECTED 1건 — PENDING/APPROVED 카운트에 섞이지 않아야 함
        saveInStatus(fixture, admin.getId(), today, 17, 18, BookingStatus.REJECTED, decidedTwoDaysAgo);

        // 9~10 APPROVED 와 겹치는 이름 불일치 점유행 — 충돌 의심 1건을 만든다(10~11 APPROVED 는 미겹침)
        facilityReservationRepository.save(FacilityReservation.create(
                fixture.facility().getId(), sequence.getAndIncrement(), YearMonth.from(today), today,
                LocalTime.of(9, 0), LocalTime.of(10, 0), "전혀다른단체", null, null, LocalDateTime.now()));

        AdminBookingSummaryCounts summary = queryService.getSummary();

        assertThat(summary.pendingCount()).isEqualTo(2);
        // 오늘 접수는 상태 무관 — 이 테스트가 만든 8건(2 PENDING+2 APPROVED+1 CONFLICT+2 CONFIRMED+1 REJECTED)이
        // 모두 오늘(KST) 생성됐다. reservationDate 가 두 달 전인 CONFIRMED 도 "오늘 접수"엔 포함된다.
        assertThat(summary.todaySubmittedCount()).isEqualTo(8);
        assertThat(summary.oldestPendingWaitingDays()).isZero(); // PENDING 은 오늘 생성 → 경과일 0
        assertThat(summary.approvedWaitingCount()).isEqualTo(2);
        assertThat(summary.oldestApprovedWaitingDays()).isEqualTo(5);
        assertThat(summary.conflictCount()).isEqualTo(1);
        assertThat(summary.conflictSuspectedCount()).isEqualTo(1); // 이름 불일치 점유행 겹친 APPROVED 1건
        assertThat(summary.confirmedThisMonthCount()).isEqualTo(1);
    }
}
