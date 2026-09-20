package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facilitybooking.controller.dto.response.AdminCrawlReservationGroupResponse;
import com.duing.domain.facilitybooking.controller.dto.response.AdminCrawlReservationGroupResponse.GroupType;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class FacilityCrawlAdminQueryServiceTest {

    @Mock FacilityReservationRepository facilityReservationRepository;
    @Mock FacilityRepository facilityRepository;
    @Mock ClubRepository clubRepository;

    final OrganizationNameNormalizer normalizer = new OrganizationNameNormalizer();
    final Clock clock = Clock.fixed(Instant.parse("2026-08-01T00:00:00Z"), ZoneId.of("Asia/Seoul"));
    FacilityCrawlAdminQueryService service;

    private record SecuredNameRow(Long id, String name, boolean secured)
            implements ClubRepository.ClubSecuredNameProjection {
        @Override public Long getId() { return id; }
        @Override public String getName() { return name; }
        @Override public boolean isFacilitySecuredTimeTarget() { return secured; }
    }

    @BeforeEach
    void setUp() {
        service = new FacilityCrawlAdminQueryService(facilityReservationRepository, facilityRepository, clubRepository,
                new FacilityAvailabilityPolicy(clubRepository, normalizer), normalizer, clock);
    }

    @Test
    @DisplayName("크롤 현황 조회는 동아리 이름 프로젝션을 요청당 1회만 조회하고 매칭 동아리 그룹·확보 대상·분류는 그대로 낸다")
    void queriesClubNameRowsOnceAndKeepsMatching() {
        YearMonth month = YearMonth.now(clock);
        LocalDate date = month.atDay(15);
        Facility facility = Facility.create(4, "공동연습실(1)", "2105", 0);
        ReflectionTestUtils.setField(facility, "id", 10L);
        FacilityReservation plainRow = FacilityReservation.create(10L, 100L, month, date,
                LocalTime.of(10, 0), LocalTime.of(12, 0), "고정관념", false, LocalDateTime.of(2026, 8, 1, 9, 0));
        when(facilityReservationRepository.findByYearMonth(month)).thenReturn(List.of(plainRow));
        when(facilityRepository.findAllById(any())).thenReturn(List.of(facility));
        when(clubRepository.findSecuredTargetNameRows()).thenReturn(List.of(
                new SecuredNameRow(7L, "고정관념", true),
                new SecuredNameRow(8L, "ABC동아리", false)));

        Page<AdminCrawlReservationGroupResponse> page =
                service.getReservations(month, null, AdminCrawlGroupBy.CLUB, PageRequest.of(0, 10));

        verify(clubRepository, times(1)).findSecuredTargetNameRows(); // 매칭 맵·확보 키를 한 번의 조회에서 함께 파생
        assertThat(page.getContent()).hasSize(1);
        AdminCrawlReservationGroupResponse group = page.getContent().get(0);
        assertThat(group.groupType()).isEqualTo(GroupType.CLUB);
        assertThat(group.clubId()).isEqualTo(7L);
        assertThat(group.facilitySecuredTimeTarget()).isTrue();
        // 무꼬리 실예약 행은 확보 대상 동아리라도 확보 표기가 아니다 — 분류 규칙은 그대로(행 단위 securedTail).
        assertThat(group.reservations().get(0).classification()).isEqualTo(CrawlRowType.CRAWLED_RESERVATION);
        assertThat(group.reservations().get(0).matchedClubName()).isEqualTo("고정관념");
    }
}
