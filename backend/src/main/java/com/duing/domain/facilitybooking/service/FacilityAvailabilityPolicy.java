package com.duing.domain.facilitybooking.service;

import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.FacilityReservation;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 크롤 행 판별 정책 — 판별 규칙은 이 컴포넌트 한 곳에만 존재한다(설계 §3.2). 가용성 계산·API·UI 는
 * 분류 결과(CrawlRowType)만 소비하며 저장 구조를 알지 못한다.
 *
 * <p>확보 시간 비차단 전환(2026-08-27): 크롤 행 중 CRAWLED_RESERVATION 분류만 차단 대상이고
 * BASIC_SECURED_TIME 분류(기본 확보 시간 대상 동아리의 물결 꼬리 행)는 차단에서 제외한다. 분류는
 * 물결 꼬리 저장 플래그(securedTail, V118) AND "기본 확보 시간 대상" 동아리
 * (club.facility_secured_time_target)와의 정규화 정확 일치 — 두 조건의 교집합에서 조회 시점에
 * 파생되며(P7·행 단위 정밀화), 동아리 플래그 변경이 기존 행에 즉시 반영된다.
 * 겹침 판정({@link #blockingOverlapping})도 이 클래스 소관이다.
 */
@Component
@RequiredArgsConstructor
public class FacilityAvailabilityPolicy {

    private final ClubRepository clubRepository;
    private final OrganizationNameNormalizer normalizer;

    /**
     * "기본 확보 시간 대상" 동아리의 정규화 이름 집합. 정규화 키가 2개 이상 동아리와 충돌하면(예:
     * "밴드부"와 "밴드부(중앙)") 어느 동아리의 예약인지 식별할 수 없어 매칭을 포기하고 제외한다(P5 —
     * 제외돼도 CRAWLED_RESERVATION 으로 차단은 유지되는 보수 방향). 요청·사이클당 1회 호출을 전제한다.
     */
    public Set<String> securedOrganizationKeys() {
        List<ClubRepository.ClubSecuredNameProjection> nameRows = clubRepository.findSecuredTargetNameRows();
        Map<String, Long> keyCounts = nameRows.stream()
                .map(row -> normalizer.normalize(row.getName()))
                .filter(key -> !key.isEmpty())
                .collect(Collectors.groupingBy(key -> key, Collectors.counting()));
        return nameRows.stream()
                .filter(ClubRepository.ClubSecuredNameProjection::isFacilitySecuredTimeTarget)
                .map(row -> normalizer.normalize(row.getName()))
                .filter(key -> !key.isEmpty() && keyCounts.get(key) == 1)
                .collect(Collectors.toUnmodifiableSet());
    }

    /**
     * 확보 시간 비차단 전환(2026-08-27) 이후 분류는 차단 판정의 분기점이다 — BASIC_SECURED_TIME 이면
     * {@link #blockingOverlapping} 이 차단에서 제외한다. 행 단위 정밀화: 물결 꼬리(securedTail) 행이면서
     * 확보 대상 동아리와 일치할 때만 확보 분류다 — 확보 동아리라도 무꼬리·하이픈 행은 실예약이라 차단 복귀.
     * 분류 실패(이름 충돌 P5·미등록·무꼬리)는 CRAWLED_RESERVATION 폴백이라 차단 유지 방향(fail-closed)이다.
     * securedOrganizationKeys 는 호출부가 요청당 1회 조회해 넘긴다.
     */
    public CrawlRowType classify(FacilityReservation reservation, Set<String> securedOrganizationKeys) {
        return reservation.isSecuredTail()
                && securedOrganizationKeys.contains(normalizer.normalize(reservation.getOrganizationName()))
                ? CrawlRowType.BASIC_SECURED_TIME
                : CrawlRowType.CRAWLED_RESERVATION;
    }

    /**
     * 차단 대상 크롤 행 중 지정 날짜의 [startTime, endTime) 반개구간과 겹치는 행만 남긴다.
     * 확보 시간 비차단 전환(2026-08-27): BASIC_SECURED_TIME 분류 행은 차단에서 제외한다 — 확보 대상
     * 동아리의 물결 꼬리 행만 비차단이고, 같은 동아리의 무꼬리·하이픈 실예약 행은 차단이다(행 단위 정밀화).
     * 신청 차단·승인 재검증·관리자 상세·부분반영·충돌의심은 "같은 규칙이어야 하는 쌍"(설계 §5.1↔§5.2)이라
     * 이 필터 하나를 공유한다 — 갈라지면 이중 대관 승인이 난다. 결과 성형(boolean/payload/컨텍스트 누적)은
     * 호출부 소관이므로 Stream 을 그대로 돌려준다.
     * 슬롯 자동확정의 닫힌 포함 판정(FacilityBookingMatchingService, start&lt;=slotStart &amp;&amp; end&gt;=slotEnd)은
     * 겹침이 아니라 이 필터에 흡수하면 안 된다 — 부분 겹침에도 자동확정이 걸리는 오확정이 된다.
     */
    public Stream<FacilityReservation> blockingOverlapping(Collection<FacilityReservation> rows,
            LocalDate date, LocalTime startTime, LocalTime endTime, Set<String> securedOrganizationKeys) {
        // 날짜·겹침 필터를 classify 앞에 둔다 — 정규화 호출을 겹침 행 수준으로 줄이는 순서 재배열(결과 불변).
        return rows.stream()
                .filter(row -> row.getReservationDate().equals(date))
                .filter(row -> row.getStartTime().isBefore(endTime) && row.getEndTime().isAfter(startTime))
                .filter(row -> classify(row, securedOrganizationKeys) == CrawlRowType.CRAWLED_RESERVATION);
    }

    /**
     * 차단 점유행({@link #blockingOverlapping}) 중 정규화 이름이 {@code normalizedClubName} 과 불일치하는 행이
     * 있는가 — "타 단체가 같은 슬롯을 실제로 점유 중"이라는 이중 대관 신호. 관리자 큐의 conflictSuspected 와
     * 자동 확정 보류(FacilityBookingMatchingService.verifyAndConfirm)가 공유하는 단일 판정이다(P2-02) —
     * 둘이 갈라지면 큐가 의심 표시하는 예약을 자동 CONFIRMED 로 닫아 신호가 소실된다. 확보 분류 행은 비차단이라
     * 타 단체 겹침으로 세지 않고, 확보 미지정 동아리의 물결 행은 CRAWLED 폴백이라 센다(차단 정책과 정합).
     * 날짜 필터는 blockingOverlapping 이 내장하므로 일 단위·월 단위 행 어느 입력이든 결과가 같다.
     */
    public boolean hasMismatchedOccupiedOverlap(Collection<FacilityReservation> rows, LocalDate date,
            LocalTime startTime, LocalTime endTime, String normalizedClubName,
            Set<String> securedOrganizationKeys) {
        return blockingOverlapping(rows, date, startTime, endTime, securedOrganizationKeys)
                .anyMatch(row -> !normalizer.normalize(row.getOrganizationName()).equals(normalizedClubName));
    }
}
