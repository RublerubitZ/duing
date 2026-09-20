package com.duing.domain.facilitybooking.service;

import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facilitybooking.controller.dto.response.AdminCrawlReservationGroupResponse;
import com.duing.domain.facilitybooking.controller.dto.response.AdminCrawlReservationGroupResponse.AdminCrawlReservation;
import com.duing.domain.facilitybooking.controller.dto.response.AdminCrawlReservationGroupResponse.GroupType;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.global.time.TimeMapper;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

/**
 * 어드민 크롤 예약 현황(설계 §3.6, 수정 1~4) — 읽기 전용 조립. 월 범위 행을 메모리 로드 후 주체/시설
 * 단위로 그룹핑하고 **그룹 단위로 페이징**한다(같은 주체가 페이지 간 분리되지 않게, 수정 4).
 * 근거: 크롤 데이터는 당월·익월 한정에 실측 월당 수백 행 — 전수 계산 허용(countConflictSuspected 전례).
 *
 * <p>분류(classification)는 가용성과 같은 단일 지점({@link FacilityAvailabilityPolicy})에서 파생해
 * /facilities 표기와 어긋날 수 없다. 매칭 동아리 표시는 정규화 정확 일치·충돌 포기(P5) — 충돌·미등록·
 * 기관·행사는 매칭 없음(EXTERNAL 주체)으로 표시하되 차단 여부와는 무관하다.
 */
@Service
@RequiredArgsConstructor
public class FacilityCrawlAdminQueryService {

    private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm");

    private final FacilityReservationRepository facilityReservationRepository;
    private final FacilityRepository facilityRepository;
    private final ClubRepository clubRepository;
    private final FacilityAvailabilityPolicy availabilityPolicy;
    private final OrganizationNameNormalizer normalizer;
    private final Clock clock;

    /** 정규화 키가 유일한 동아리(id·이름·플래그) — 충돌 키는 매칭 포기(P5)라 맵에서 제외된다. */
    private record MatchedClub(Long id, String name, boolean securedTarget) {}

    public Page<AdminCrawlReservationGroupResponse> getReservations(YearMonth requestedMonth, Long facilityId,
            AdminCrawlGroupBy groupBy, Pageable pageable) {
        YearMonth currentMonth = YearMonth.now(clock);
        YearMonth targetMonth = requestedMonth != null ? requestedMonth : currentMonth;
        if (!targetMonth.equals(currentMonth) && !targetMonth.equals(currentMonth.plusMonths(1))) {
            throw new FacilityBookingException.MonthOutOfBookingRangeException();
        }
        List<FacilityReservation> rows = facilityId != null
                ? facilityReservationRepository.findByFacilityIdAndYearMonth(facilityId, targetMonth)
                : facilityReservationRepository.findByYearMonth(targetMonth);
        if (rows.isEmpty()) {
            return new PageImpl<>(List.of(), pageable, 0);
        }

        Map<Long, Facility> facilities = facilityRepository.findAllById(
                        rows.stream().map(FacilityReservation::getFacilityId).distinct().toList()).stream()
                .collect(Collectors.toMap(Facility::getId, Function.identity()));
        // 동아리 이름 프로젝션은 요청당 1회만 스캔한다 — 매칭 맵과 확보 키를 같은 결과에서 파생(P2-05, egress 왕복 절감).
        List<ClubRepository.ClubSecuredNameProjection> clubNameRows = clubRepository.findSecuredTargetNameRows();
        Map<String, MatchedClub> matchedByKey = matchedClubsByNormalizedKey(clubNameRows);
        Set<String> securedKeys = availabilityPolicy.securedOrganizationKeys(clubNameRows);

        List<AdminCrawlReservation> reservations = rows.stream()
                .sorted(Comparator
                        .comparing((FacilityReservation row) -> facilitySortKey(facilities.get(row.getFacilityId())))
                        .thenComparing(FacilityReservation::getFacilityId)
                        .thenComparing(FacilityReservation::getReservationDate)
                        .thenComparing(FacilityReservation::getStartTime))
                .map(row -> toReservation(row, facilities, matchedByKey, securedKeys))
                .toList();

        List<AdminCrawlReservationGroupResponse> groups = switch (groupBy) {
            case CLUB -> groupBySubject(reservations, matchedByKey);
            case FACILITY -> groupByFacility(reservations);
            case FACILITY_DATE -> groupByFacilityDate(reservations);
        };

        int fromIndex = (int) Math.min(pageable.getOffset(), groups.size());
        int toIndex = Math.min(fromIndex + pageable.getPageSize(), groups.size());
        return new PageImpl<>(groups.subList(fromIndex, toIndex), pageable, groups.size());
    }

    private Map<String, MatchedClub> matchedClubsByNormalizedKey(
            List<ClubRepository.ClubSecuredNameProjection> clubNameRows) {
        Map<String, List<MatchedClub>> byKey = clubNameRows.stream()
                .map(row -> Map.entry(normalizer.normalize(row.getName()),
                        new MatchedClub(row.getId(), row.getName(), row.isFacilitySecuredTimeTarget())))
                .filter(entry -> !entry.getKey().isEmpty())
                .collect(Collectors.groupingBy(Map.Entry::getKey,
                        Collectors.mapping(Map.Entry::getValue, Collectors.toList())));
        return byKey.entrySet().stream()
                .filter(entry -> entry.getValue().size() == 1) // 충돌 키는 매칭 포기(P5)
                .collect(Collectors.toMap(Map.Entry::getKey, entry -> entry.getValue().get(0)));
    }

    private AdminCrawlReservation toReservation(FacilityReservation row, Map<Long, Facility> facilities,
            Map<String, MatchedClub> matchedByKey, Set<String> securedKeys) {
        Facility facility = facilities.get(row.getFacilityId());
        MatchedClub matched = matchedByKey.get(normalizer.normalize(row.getOrganizationName()));
        return new AdminCrawlReservation(
                row.getId(),
                row.getFacilityId(),
                facility != null ? facility.getRoomName() : null,
                row.getOrganizationName(),
                row.getReservationDate(),
                TIME_FORMAT.format(row.getStartTime()),
                TIME_FORMAT.format(row.getEndTime()),
                availabilityPolicy.classify(row, securedKeys),
                matched != null ? matched.id() : null,
                matched != null ? matched.name() : null,
                TimeMapper.seoulWallClockToInstant(row.getCrawledAt()));
    }

    /** 동아리별(기본): 매칭 동아리 그룹(이름순) 먼저, 미매칭 주체 그룹(표기순) 뒤 — 비동아리 주체 누락 금지(수정 2). */
    private List<AdminCrawlReservationGroupResponse> groupBySubject(List<AdminCrawlReservation> reservations,
            Map<String, MatchedClub> matchedByKey) {
        Map<String, List<AdminCrawlReservation>> bySubjectKey = new LinkedHashMap<>();
        for (AdminCrawlReservation reservation : reservations) {
            // 미매칭 주체는 정규화 단체명 단위로 묶는다(공백 표기 차이 병합). 정규화가 빈 문자열이면 원문으로 폴백.
            String subjectKey = reservation.matchedClubId() != null
                    ? "club:" + reservation.matchedClubId()
                    : externalSubjectKey(reservation.organizationName());
            bySubjectKey.computeIfAbsent(subjectKey, ignored -> new ArrayList<>()).add(reservation);
        }
        List<AdminCrawlReservationGroupResponse> clubGroups = new ArrayList<>();
        List<AdminCrawlReservationGroupResponse> externalGroups = new ArrayList<>();
        for (List<AdminCrawlReservation> groupRows : bySubjectKey.values()) {
            AdminCrawlReservation first = groupRows.get(0);
            if (first.matchedClubId() != null) {
                MatchedClub matched = matchedByKey.get(normalizer.normalize(first.organizationName()));
                clubGroups.add(new AdminCrawlReservationGroupResponse(GroupType.CLUB, first.matchedClubId(),
                        matched != null && matched.securedTarget(), null, null, first.matchedClubName(), groupRows));
            } else {
                externalGroups.add(new AdminCrawlReservationGroupResponse(GroupType.EXTERNAL, null, null,
                        null, null, first.organizationName(), groupRows));
            }
        }
        clubGroups.sort(Comparator.comparing(AdminCrawlReservationGroupResponse::title));
        externalGroups.sort(Comparator.comparing(AdminCrawlReservationGroupResponse::title));
        List<AdminCrawlReservationGroupResponse> ordered = new ArrayList<>(clubGroups);
        ordered.addAll(externalGroups);
        return ordered;
    }

    private String externalSubjectKey(String organizationName) {
        String normalizedKey = normalizer.normalize(organizationName);
        return normalizedKey.isEmpty() ? "external-raw:" + organizationName : "external:" + normalizedKey;
    }

    /** 시설별: 입력이 이미 시설 sortOrder→일자→시작시각 정렬이라 그룹·행 순서가 함께 보장된다. */
    private List<AdminCrawlReservationGroupResponse> groupByFacility(List<AdminCrawlReservation> reservations) {
        Map<Long, List<AdminCrawlReservation>> byFacility = reservations.stream()
                .collect(Collectors.groupingBy(AdminCrawlReservation::facilityId,
                        LinkedHashMap::new, Collectors.toList()));
        return byFacility.values().stream()
                .map(groupRows -> new AdminCrawlReservationGroupResponse(GroupType.FACILITY, null, null,
                        groupRows.get(0).facilityId(), null, groupRows.get(0).facilityName(), groupRows))
                .toList();
    }

    /** 시설+날짜별(기존 방식): 평면 열람 순서를 (시설, 일자) 그룹 헤더로 유지한다. */
    private List<AdminCrawlReservationGroupResponse> groupByFacilityDate(List<AdminCrawlReservation> reservations) {
        record FacilityDateKey(Long facilityId, LocalDate date) {}
        Map<FacilityDateKey, List<AdminCrawlReservation>> byFacilityDate = reservations.stream()
                .collect(Collectors.groupingBy(
                        reservation -> new FacilityDateKey(reservation.facilityId(), reservation.reservationDate()),
                        LinkedHashMap::new, Collectors.toList()));
        return byFacilityDate.values().stream()
                .map(groupRows -> new AdminCrawlReservationGroupResponse(GroupType.FACILITY_DATE, null, null,
                        groupRows.get(0).facilityId(), groupRows.get(0).reservationDate(),
                        groupRows.get(0).facilityName(), groupRows))
                .toList();
    }

    private int facilitySortKey(Facility facility) {
        return facility == null || facility.getSortOrder() == null ? Integer.MAX_VALUE : facility.getSortOrder();
    }
}
