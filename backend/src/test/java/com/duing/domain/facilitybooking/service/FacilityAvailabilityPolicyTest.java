package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.FacilityReservation;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FacilityAvailabilityPolicyTest {

    private final ClubRepository clubRepository = mock(ClubRepository.class);
    private final FacilityAvailabilityPolicy policy =
            new FacilityAvailabilityPolicy(clubRepository, new OrganizationNameNormalizer());

    private record SecuredNameRow(String name, boolean secured)
            implements ClubRepository.ClubSecuredNameProjection {
        @Override
        public Long getId() {
            return (long) name.hashCode(); // 정책은 id 를 쓰지 않는다 — 프로젝션 계약 충족용
        }

        @Override
        public String getName() {
            return name;
        }

        @Override
        public boolean isFacilitySecuredTimeTarget() {
            return secured;
        }
    }

    private FacilityReservation crawlRow(LocalDate date, LocalTime startTime, LocalTime endTime,
                                         String organization) {
        return FacilityReservation.create(1L, 100L, YearMonth.from(date), date,
                startTime, endTime, organization, false, LocalDateTime.of(2026, 1, 15, 8, 0));
    }

    @Test
    @DisplayName("기본 확보 시간 대상 동아리와 정규화 정확 일치하는 행만 BASIC_SECURED_TIME 이고 나머지는 전부 CRAWLED_RESERVATION 이다")
    void classifiesOnlyExactSecuredMatches() {
        when(clubRepository.findSecuredTargetNameRows()).thenReturn(List.of(
                new SecuredNameRow("고정관념", true),
                new SecuredNameRow("ABC동아리", false),
                new SecuredNameRow("ABC동아리2", false)));
        Set<String> securedKeys = policy.securedOrganizationKeys();
        LocalDate date = LocalDate.of(2026, 1, 15);

        assertThat(policy.classify(crawlRow(date, LocalTime.of(10, 0), LocalTime.of(17, 0), "고정관념"), securedKeys))
                .isEqualTo(CrawlRowType.BASIC_SECURED_TIME);
        // 공백·끝 괄호 차이는 정규화로 흡수된다(기존 매칭 정책 재사용).
        assertThat(policy.classify(crawlRow(date, LocalTime.of(10, 0), LocalTime.of(17, 0), "고정 관념"), securedKeys))
                .isEqualTo(CrawlRowType.BASIC_SECURED_TIME);
        // 플래그 OFF 등록 동아리·학교 기관/행사/부서·미등록 단체는 전부 CRAWLED_RESERVATION(이쪽만 차단).
        assertThat(policy.classify(crawlRow(date, LocalTime.of(10, 0), LocalTime.of(17, 0), "ABC동아리"), securedKeys))
                .isEqualTo(CrawlRowType.CRAWLED_RESERVATION);
        assertThat(policy.classify(crawlRow(date, LocalTime.of(10, 0), LocalTime.of(17, 0), "학생생활상담센터"), securedKeys))
                .isEqualTo(CrawlRowType.CRAWLED_RESERVATION);
        assertThat(policy.classify(crawlRow(date, LocalTime.of(10, 0), LocalTime.of(15, 0), "헌혈 행사"), securedKeys))
                .isEqualTo(CrawlRowType.CRAWLED_RESERVATION);
        assertThat(policy.classify(crawlRow(date, LocalTime.of(9, 0), LocalTime.of(18, 0), "장학복지팀"), securedKeys))
                .isEqualTo(CrawlRowType.CRAWLED_RESERVATION);
        // 부분 문자열 매칭 금지 — "고정관념2" 는 "고정관념" 과 다른 주체다.
        assertThat(policy.classify(crawlRow(date, LocalTime.of(10, 0), LocalTime.of(17, 0), "고정관념2"), securedKeys))
                .isEqualTo(CrawlRowType.CRAWLED_RESERVATION);
    }

    @Test
    @DisplayName("정규화 키가 다른 동아리와 충돌하는 기본 확보 대상은 매칭을 포기해 CRAWLED_RESERVATION 으로 유지된다")
    void collidingNormalizedKeysAreExcludedFromSecuredSet() {
        // "밴드부"(ON)와 "밴드 부"(OFF)는 정규화 후 같은 키로 붕괴한다 — 어느 동아리 예약인지 식별 불가.
        when(clubRepository.findSecuredTargetNameRows()).thenReturn(List.of(
                new SecuredNameRow("밴드부", true),
                new SecuredNameRow("밴드 부", false)));

        Set<String> securedKeys = policy.securedOrganizationKeys();

        assertThat(securedKeys).isEmpty();
        assertThat(policy.classify(
                crawlRow(LocalDate.of(2026, 1, 15), LocalTime.of(10, 0), LocalTime.of(12, 0), "밴드부"), securedKeys))
                .isEqualTo(CrawlRowType.CRAWLED_RESERVATION);
    }

    @Test
    @DisplayName("플래그 토글은 재크롤 없이 같은 크롤 행의 분류를 즉시 바꾼다 — 분류는 저장값이 아니라 파생값이다")
    void flagToggleReclassifiesExistingRowsImmediately() {
        FacilityReservation storedRow = crawlRow(LocalDate.of(2026, 1, 15),
                LocalTime.of(10, 0), LocalTime.of(17, 0), "고정관념");

        when(clubRepository.findSecuredTargetNameRows())
                .thenReturn(List.of(new SecuredNameRow("고정관념", false)));
        assertThat(policy.classify(storedRow, policy.securedOrganizationKeys()))
                .isEqualTo(CrawlRowType.CRAWLED_RESERVATION);

        // OFF → ON: 크롤이 다시 돌지 않아도 동일 행이 즉시 BASIC_SECURED_TIME 으로 파생된다.
        when(clubRepository.findSecuredTargetNameRows())
                .thenReturn(List.of(new SecuredNameRow("고정관념", true)));
        assertThat(policy.classify(storedRow, policy.securedOrganizationKeys()))
                .isEqualTo(CrawlRowType.BASIC_SECURED_TIME);

        // ON → OFF: 즉시 CRAWLED_RESERVATION 복귀.
        when(clubRepository.findSecuredTargetNameRows())
                .thenReturn(List.of(new SecuredNameRow("고정관념", false)));
        assertThat(policy.classify(storedRow, policy.securedOrganizationKeys()))
                .isEqualTo(CrawlRowType.CRAWLED_RESERVATION);
    }

    @Test
    @DisplayName("확보 행은 실범위와 무관하게 차단 결과에 없고, 분류는 저장된 실범위 행 그대로 파생된다")
    void securedRangeFollowsActualCrawledInterval() {
        when(clubRepository.findSecuredTargetNameRows())
                .thenReturn(List.of(new SecuredNameRow("고정관념", true)));
        Set<String> securedKeys = policy.securedOrganizationKeys();
        LocalDate date = LocalDate.of(2026, 1, 15);

        FacilityReservation before = crawlRow(date, LocalTime.of(10, 0), LocalTime.of(17, 0), "고정관념");
        FacilityReservation after = crawlRow(date, LocalTime.of(13, 0), LocalTime.of(15, 0), "고정관념");

        // 확보 시간은 고정 시간이 아니다 — 재크롤로 범위가 바뀌어도 분류는 저장 행의 실범위 기준으로 파생된다.
        assertThat(policy.classify(before, securedKeys)).isEqualTo(CrawlRowType.BASIC_SECURED_TIME);
        assertThat(policy.classify(after, securedKeys)).isEqualTo(CrawlRowType.BASIC_SECURED_TIME);
        // 확보 시간 비차단 전환(2026-08-27): 확보 분류 행은 어떤 범위로 겹쳐도 차단 결과에 나타나지 않는다.
        assertThat(policy.blockingOverlapping(List.of(before), date,
                LocalTime.of(16, 0), LocalTime.of(17, 0), securedKeys).toList()).isEmpty();
        assertThat(policy.blockingOverlapping(List.of(after), date,
                LocalTime.of(13, 0), LocalTime.of(15, 0), securedKeys).toList()).isEmpty();
    }

    @Test
    @DisplayName("blockingOverlapping 은 확보 분류 행을 차단에서 제외하고 크롤 실예약 행만 겹침 판정한다 — 경계 접촉·다른 날짜도 제외")
    void blockingOverlappingExcludesSecuredRowsAndKeepsCrawledRows() {
        when(clubRepository.findSecuredTargetNameRows())
                .thenReturn(List.of(new SecuredNameRow("고정관념", true)));
        Set<String> securedKeys = policy.securedOrganizationKeys();
        LocalDate date = LocalDate.of(2026, 1, 15);
        FacilityReservation crawled = crawlRow(date, LocalTime.of(9, 0), LocalTime.of(10, 0), "학생생활상담센터");
        // 확보 대상 동아리의 행은 비차단이다(확보 시간 비차단 전환, 2026-08-27).
        FacilityReservation secured = crawlRow(date, LocalTime.of(9, 0), LocalTime.of(20, 0), "고정관념");
        // [10:00, 11:00) 는 조회 구간 [9:30, 10:00) 과 경계 접촉일 뿐 겹침이 아니다(반개구간).
        FacilityReservation adjacent = crawlRow(date, LocalTime.of(10, 0), LocalTime.of(11, 0), "동아리연합회");
        FacilityReservation otherDate = crawlRow(date.plusDays(1), LocalTime.of(9, 0), LocalTime.of(10, 0), "밴드부");

        List<FacilityReservation> result = policy.blockingOverlapping(
                        List.of(crawled, secured, adjacent, otherDate),
                        date, LocalTime.of(9, 30), LocalTime.of(10, 0), securedKeys)
                .toList();

        assertThat(result).containsExactly(crawled);
    }

    @Test
    @DisplayName("정규화 키 충돌로 확보 집합에서 제외된 동아리의 행은 CRAWLED 폴백이라 차단이 유지된다")
    void collidingSecuredKeyFallsBackToBlocking() {
        // "밴드부"(ON)와 "밴드 부"(OFF)는 정규화 후 같은 키 — P5 매칭 포기 → CRAWLED_RESERVATION 폴백(차단 유지).
        when(clubRepository.findSecuredTargetNameRows()).thenReturn(List.of(
                new SecuredNameRow("밴드부", true),
                new SecuredNameRow("밴드 부", false)));
        Set<String> securedKeys = policy.securedOrganizationKeys();
        LocalDate date = LocalDate.of(2026, 1, 15);
        FacilityReservation colliding = crawlRow(date, LocalTime.of(10, 0), LocalTime.of(12, 0), "밴드부");

        assertThat(policy.blockingOverlapping(List.of(colliding), date,
                LocalTime.of(10, 0), LocalTime.of(11, 0), securedKeys).toList()).containsExactly(colliding);
    }
}
