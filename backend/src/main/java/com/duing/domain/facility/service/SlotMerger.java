package com.duing.domain.facility.service;

import com.duing.domain.facility.parser.ParsedReservation;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import org.springframework.stereotype.Component;

/**
 * 한 시설의 예약 슬롯을 연속 병합하는 순수 함수(§6.1). 조건 ①(같은 시설)은 호출부가 시설별로
 * 스코프하므로 여기서는 ②날짜 ③단체 ④인접·겹침(prev.end &gt;= next.start)만 검사한다.
 * 겹침 병합은 하이픈 실예약 범위 확장(ReservationParser) 이후 같은 구간의 마커 행 여러 개가
 * 동일 [start, end) 로 중복 저장되는 경우를 한 건으로 접기 위한 확장이다 — 인접 병합의 상위집합.
 */
@Component
public class SlotMerger {

    /** 병합된 슬롯(조회 시점 상태는 상위에서 계산). */
    public record MergedSlot(LocalDate date, LocalTime start, LocalTime end, String organization) {}

    private static final Comparator<ParsedReservation> ORDER =
            Comparator.comparing(ParsedReservation::reservationDate)
                    .thenComparing(ParsedReservation::startTime);

    public List<MergedSlot> merge(List<ParsedReservation> reservations) {
        List<MergedSlot> result = new ArrayList<>();
        List<ParsedReservation> sorted = reservations.stream().sorted(ORDER).toList();
        for (ParsedReservation reservation : sorted) {
            MergedSlot last = result.isEmpty() ? null : result.get(result.size() - 1);
            if (last != null && isMergeable(last, reservation)) {
                // 겹침 병합 시 앞 구간이 더 길 수 있으므로 끝은 둘 중 늦은 쪽을 취한다.
                LocalTime mergedEnd = reservation.endTime().isAfter(last.end())
                        ? reservation.endTime() : last.end();
                result.set(result.size() - 1,
                        new MergedSlot(last.date(), last.start(), mergedEnd, last.organization()));
            } else {
                result.add(new MergedSlot(reservation.reservationDate(), reservation.startTime(),
                        reservation.endTime(), reservation.organizationName()));
            }
        }
        return result;
    }

    private boolean isMergeable(MergedSlot last, ParsedReservation next) {
        return last.date().equals(next.reservationDate())
                && Objects.equals(last.organization(), next.organizationName())
                && !last.end().isBefore(next.startTime());
    }
}
