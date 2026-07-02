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
 * 스코프하므로 여기서는 ②날짜 ③단체 ④인접(prev.end == next.start)만 검사한다.
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
                result.set(result.size() - 1,
                        new MergedSlot(last.date(), last.start(), reservation.endTime(), last.organization()));
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
                && last.end().equals(next.startTime());
    }
}
