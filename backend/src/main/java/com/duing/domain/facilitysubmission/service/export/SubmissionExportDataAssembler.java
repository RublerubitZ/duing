package com.duing.domain.facilitysubmission.service.export;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionBatch;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionItem;
import com.duing.domain.facilitysubmission.exception.FacilitySubmissionException;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionBatchRepository;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionItemRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** Batch(취소 포함)·소속 예약·이름들을 모아 포맷 중립 데이터로 조립한다(스펙 §6). */
@Component
@RequiredArgsConstructor
public class SubmissionExportDataAssembler {

    private final FacilitySubmissionBatchRepository batchRepository;
    private final FacilitySubmissionItemRepository itemRepository;
    private final FacilityBookingRepository bookingRepository;
    private final FacilityRepository facilityRepository;
    private final ClubRepository clubRepository;
    private final UserRepository userRepository;

    public SubmissionExportData assemble(Long batchId) {
        FacilitySubmissionBatch batch = batchRepository.findById(batchId)
                .orElseThrow(FacilitySubmissionException.BatchNotFoundException::new);
        String facilityName = facilityRepository.findById(batch.getFacilityId())
                .map(Facility::getRoomName)
                .orElse(null);
        List<Long> bookingIds = itemRepository.findByBatchIdOrderByIdAsc(batchId).stream()
                .map(FacilitySubmissionItem::getBookingId)
                .toList();
        List<FacilityBooking> bookings = bookingRepository.findAllById(bookingIds).stream()
                .sorted(Comparator.comparing(FacilityBooking::getReservationDate)
                        .thenComparing(FacilityBooking::getStartTime)
                        .thenComparing(FacilityBooking::getId))
                .toList();
        Map<Long, String> clubNames = clubRepository.findAllById(
                        bookings.stream().map(FacilityBooking::getClubId).distinct().toList()).stream()
                .collect(Collectors.toMap(Club::getId, Club::getName, (first, second) -> first));
        Map<Long, String> userNames = userRepository.findAllById(bookings.stream()
                        .flatMap(booking -> Stream.of(booking.getApplicantId(), booking.getDecidedById()))
                        .filter(Objects::nonNull)
                        .distinct()
                        .toList()).stream()
                .collect(Collectors.toMap(User::getId, User::getName, (first, second) -> first));

        List<SubmissionExportRow> rows = bookings.stream()
                .map(booking -> new SubmissionExportRow(
                        booking.getReservationDate(), booking.getStartTime(), booking.getEndTime(),
                        clubNames.get(booking.getClubId()), userNames.get(booking.getApplicantId()),
                        blankToNull(booking.getContactPhone()), booking.getAttendeeCount(),
                        booking.getPurpose(),
                        booking.getDecidedById() != null ? userNames.get(booking.getDecidedById()) : null,
                        booking.getDecidedAt()))
                .toList();
        return new SubmissionExportData(batch.getSubmissionNo(), facilityName, batch.getMemo(),
                batch.getCsvFileName(), rows);
    }

    private String blankToNull(String text) {
        return (text == null || text.isBlank()) ? null : text;
    }
}
