package com.duing.domain.facilitysubmission.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitysubmission.exception.FacilitySubmissionException;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionItemRepository;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidateBooking;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidatesQuery;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidatesResult;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionSummaryCounts;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralFacilitySubmissionQueryService implements FacilitySubmissionQueryService {

    /** 후보 조회 상태 — REJECTED 는 운영 노이즈라 제외한다(스펙 §5.1). */
    private static final List<BookingStatus> CANDIDATE_STATUSES = List.of(
            BookingStatus.PENDING, BookingStatus.APPROVED, BookingStatus.CONFIRMED,
            BookingStatus.CONFLICT, BookingStatus.CANCELLED);
    private static final int MAX_PERIOD_DAYS = 31;

    private final FacilityBookingRepository bookingRepository;
    private final FacilitySubmissionItemRepository itemRepository;
    private final UserRepository userRepository;
    private final ClubRepository clubRepository;

    @Override
    public SubmissionCandidatesResult getCandidates(SubmissionCandidatesQuery query) {
        validatePeriod(query.startDate(), query.endDate());
        List<FacilityBooking> bookings = bookingRepository
                .findByFacilityIdAndReservationDateBetweenAndStatusIn(
                        query.facilityId(), query.startDate(), query.endDate(), CANDIDATE_STATUSES)
                .stream()
                .filter(booking -> query.clubId() == null || booking.getClubId().equals(query.clubId()))
                .sorted(Comparator.comparing(FacilityBooking::getReservationDate)
                        .thenComparing(FacilityBooking::getStartTime)
                        .thenComparing(FacilityBooking::getId))
                .toList();

        Map<Long, String> submissionNoByBookingId = activeSubmissionNos(bookings);
        Map<Long, String> clubNames = clubNames(bookings);
        Map<Long, String> userNames = userNames(bookings);

        List<SubmissionCandidateBooking> candidateBookings = bookings.stream()
                .map(booking -> toCandidate(booking, submissionNoByBookingId, clubNames, userNames))
                .toList();
        return new SubmissionCandidatesResult(summarize(candidateBookings), candidateBookings);
    }

    private void validatePeriod(LocalDate startDate, LocalDate endDate) {
        if (endDate.isBefore(startDate)
                || ChronoUnit.DAYS.between(startDate, endDate) + 1 > MAX_PERIOD_DAYS) {
            throw new FacilitySubmissionException.InvalidCandidatePeriodException();
        }
    }

    private Map<Long, String> activeSubmissionNos(List<FacilityBooking> bookings) {
        if (bookings.isEmpty()) {
            return Map.of();
        }
        return itemRepository.findActiveByBookingIdIn(
                        bookings.stream().map(FacilityBooking::getId).toList()).stream()
                .collect(Collectors.toMap(
                        FacilitySubmissionItemRepository.ActiveSubmissionProjection::getBookingId,
                        FacilitySubmissionItemRepository.ActiveSubmissionProjection::getSubmissionNo,
                        (first, second) -> first));
    }

    private Map<Long, String> clubNames(List<FacilityBooking> bookings) {
        List<Long> clubIds = bookings.stream().map(FacilityBooking::getClubId).distinct().toList();
        return clubRepository.findAllById(clubIds).stream()
                .collect(Collectors.toMap(Club::getId, Club::getName, (first, second) -> first));
    }

    private Map<Long, String> userNames(List<FacilityBooking> bookings) {
        List<Long> userIds = bookings.stream()
                .flatMap(booking -> Stream.of(booking.getApplicantId(), booking.getDecidedById()))
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        return userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, User::getName, (first, second) -> first));
    }

    private SubmissionCandidateBooking toCandidate(FacilityBooking booking,
            Map<Long, String> submissionNoByBookingId, Map<Long, String> clubNames, Map<Long, String> userNames) {
        boolean submitted = submissionNoByBookingId.containsKey(booking.getId());
        boolean selectable = booking.getStatus() == BookingStatus.APPROVED && !submitted;
        return new SubmissionCandidateBooking(
                booking.getId(), booking.getClubId(), clubNames.get(booking.getClubId()),
                userNames.get(booking.getApplicantId()), blankToNull(booking.getContactPhone()),
                booking.getReservationDate(), booking.getStartTime(), booking.getEndTime(),
                booking.getPurpose(), booking.getAttendeeCount(), booking.getStatus(),
                submitted, selectable, submissionNoByBookingId.get(booking.getId()),
                booking.getDecidedById() != null ? userNames.get(booking.getDecidedById()) : null,
                booking.getDecidedAt());
    }

    private SubmissionSummaryCounts summarize(List<SubmissionCandidateBooking> candidateBookings) {
        long approvedCount = candidateBookings.stream()
                .filter(candidate -> candidate.status() == BookingStatus.APPROVED).count();
        long awaitingCount = candidateBookings.stream()
                .filter(SubmissionCandidateBooking::selectable).count();
        long submittedCount = candidateBookings.stream()
                .filter(SubmissionCandidateBooking::submitted).count();
        long confirmedCount = candidateBookings.stream()
                .filter(candidate -> candidate.status() == BookingStatus.CONFIRMED).count();
        return new SubmissionSummaryCounts(approvedCount, awaitingCount, submittedCount, confirmedCount);
    }

    /** V85 하위호환 — 기존 행의 빈 연락처는 null 로 노출한다(관리자 상세 응답과 동일 규칙). */
    private String blankToNull(String text) {
        return (text == null || text.isBlank()) ? null : text;
    }
}
