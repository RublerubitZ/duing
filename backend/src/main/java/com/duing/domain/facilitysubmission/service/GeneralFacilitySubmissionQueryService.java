package com.duing.domain.facilitysubmission.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionAudit;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionBatch;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionItem;
import com.duing.domain.facilitysubmission.entity.SubmissionAuditAction;
import com.duing.domain.facilitysubmission.exception.FacilitySubmissionException;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionAuditRepository;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionBatchRepository;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionItemRepository;
import com.duing.domain.facilitysubmission.service.dto.command.SubmissionActorContext;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionAuditEntry;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionBatchDetailResult;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionBatchListItem;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionBatchSearchCondition;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidateBooking;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidatesQuery;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidatesResult;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionSummaryCounts;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.text.Collator;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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
    private final FacilitySubmissionBatchRepository batchRepository;
    private final FacilitySubmissionAuditRepository auditRepository;
    private final UserRepository userRepository;
    private final ClubRepository clubRepository;
    private final FacilityRepository facilityRepository;

    @Override
    public SubmissionCandidatesResult getCandidates(SubmissionCandidatesQuery query) {
        validatePeriod(query.startDate(), query.endDate());
        List<FacilityBooking> fetchedBookings = query.facilityId() != null
                ? bookingRepository.findByFacilityIdAndReservationDateBetweenAndStatusIn(
                        query.facilityId(), query.startDate(), query.endDate(), CANDIDATE_STATUSES)
                : bookingRepository.findByReservationDateBetweenAndStatusIn(
                        query.startDate(), query.endDate(), CANDIDATE_STATUSES);
        List<FacilityBooking> bookings = fetchedBookings.stream()
                .filter(booking -> query.clubId() == null || booking.getClubId().equals(query.clubId()))
                .sorted(Comparator.comparing(FacilityBooking::getReservationDate)
                        .thenComparing(FacilityBooking::getStartTime)
                        .thenComparing(FacilityBooking::getId))
                .toList();

        Map<Long, String> submissionNoByBookingId = activeSubmissionNos(bookings);
        Map<Long, String> clubNames = clubNames(bookings);
        Map<Long, String> userNames = userNames(bookings);
        Map<Long, String> facilityNames = bookingFacilityNames(bookings);

        List<SubmissionCandidateBooking> candidateBookings = bookings.stream()
                .map(booking -> toCandidate(booking, submissionNoByBookingId, clubNames, userNames, facilityNames))
                .toList();
        return new SubmissionCandidatesResult(summarize(candidateBookings), candidateBookings);
    }

    @Override
    public Page<SubmissionBatchListItem> getBatches(SubmissionBatchSearchCondition condition, Pageable pageable) {
        Page<FacilitySubmissionBatch> batchPage = batchRepository.search(condition, pageable);
        List<FacilitySubmissionBatch> batches = batchPage.getContent();
        Map<Long, Long> bookingCounts = bookingCounts(batches);
        Map<Long, String> facilityNames = facilityNames(batches);
        Map<Long, String> submitterNames = submitterNames(batches);
        Map<Long, List<Long>> clubIdsByBatchId = clubIdsByBatchId(batches);
        Map<Long, String> batchClubNames = clubNamesByIds(clubIdsByBatchId.values().stream()
                .flatMap(List::stream).distinct().toList());
        return batchPage.map(batch -> toListItem(batch,
                bookingCounts.getOrDefault(batch.getId(), 0L),
                facilityNames.get(batch.getFacilityId()),
                submitterNames.get(batch.getSubmittedById()),
                clubNameLabels(clubIdsByBatchId.getOrDefault(batch.getId(), List.of()), batchClubNames)));
    }

    // 감사 기록(VIEWED)이 포함된 조회 — 클래스 readOnly 를 쓰기 트랜잭션으로 오버라이드한다(전역 제약).
    @Override
    @Transactional
    public SubmissionBatchDetailResult getDetail(Long batchId, SubmissionActorContext actor) {
        FacilitySubmissionBatch batch = batchRepository.findById(batchId)
                .orElseThrow(FacilitySubmissionException.BatchNotFoundException::new);
        List<FacilitySubmissionItem> items = itemRepository.findByBatchIdOrderByIdAsc(batchId);
        List<Long> bookingIds = items.stream()
                .map(FacilitySubmissionItem::getBookingId)
                .toList();
        List<FacilityBooking> bookings = bookingRepository.findAllById(bookingIds).stream()
                .sorted(Comparator.comparing(FacilityBooking::getReservationDate)
                        .thenComparing(FacilityBooking::getStartTime)
                        .thenComparing(FacilityBooking::getId))
                .toList();
        // 상세의 submitted/submissionNo 는 "지금 어느 활성 제출에 묶여 있나"(후보 조회의 질문)가 아니라
        // 조회 중인 이 배치 기준이어야 한다 — 교차 배치를 물으면 스킵 후 다른 배치에 재제출된 예약이
        // 이 배치 상세에서 남의 제출번호를 달고 나와 감사 화면을 오독하게 만든다.
        Map<Long, String> submissionNoByBookingId = items.stream()
                .filter(item -> item.getSkippedAt() == null)
                .collect(Collectors.toMap(FacilitySubmissionItem::getBookingId,
                        item -> batch.getSubmissionNo()));
        Map<Long, String> clubNames = clubNames(bookings);
        Map<Long, String> userNames = userNames(bookings);
        Map<Long, String> facilityNames = bookingFacilityNames(bookings);
        List<SubmissionCandidateBooking> bookingRows = bookings.stream()
                .map(booking -> toCandidate(booking, submissionNoByBookingId, clubNames, userNames, facilityNames))
                .toList();
        SubmissionBatchListItem header = toListItem(batch, bookingIds.size(),
                facilityNames(List.of(batch)).get(batch.getFacilityId()),
                submitterNames(List.of(batch)).get(batch.getSubmittedById()),
                clubNameLabels(bookings.stream().map(FacilityBooking::getClubId).distinct().toList(), clubNames));
        auditRepository.save(FacilitySubmissionAudit.of(batchId, SubmissionAuditAction.VIEWED,
                actor.adminId(), actor.ipAddress(), actor.userAgent()));
        List<FacilitySubmissionAudit> auditRows = auditRepository.findByBatchIdOrderByIdAsc(batchId);
        Map<Long, String> auditAdminNames = auditAdminNames(auditRows);
        List<SubmissionAuditEntry> audits = auditRows.stream()
                .map(auditRow -> toAuditEntry(auditRow, auditAdminNames))
                .toList();
        return new SubmissionBatchDetailResult(header, bookingRows, audits);
    }

    private SubmissionBatchListItem toListItem(FacilitySubmissionBatch batch, long bookingCount,
            String facilityName, String submittedByName, List<String> clubNames) {
        return new SubmissionBatchListItem(batch.getId(), batch.getSubmissionNo(), batch.getFacilityId(),
                facilityName, bookingCount, clubNames, batch.getSubmittedAt(), submittedByName, batch.getMemo(),
                batch.isCancelled(), batch.getCancelledAt(),
                batch.isCompleted(), batch.getCompletedAt());
    }

    private Map<Long, List<Long>> clubIdsByBatchId(List<FacilitySubmissionBatch> batches) {
        if (batches.isEmpty()) {
            return Map.of();
        }
        return itemRepository.findClubIdsByBatchIdIn(
                        batches.stream().map(FacilitySubmissionBatch::getId).toList()).stream()
                .collect(Collectors.groupingBy(
                        FacilitySubmissionItemRepository.BatchClubProjection::getBatchId,
                        Collectors.mapping(
                                FacilitySubmissionItemRepository.BatchClubProjection::getClubId,
                                Collectors.toList())));
    }

    private Map<Long, String> clubNamesByIds(List<Long> clubIds) {
        return clubRepository.findAllById(clubIds).stream()
                .collect(Collectors.toMap(Club::getId, Club::getName, (first, second) -> first));
    }

    /** 삭제 동아리는 이름 결측 → "동아리 {id}" 폴백(FE 후보 화면 폴백과 동일 문구). 가나다순. */
    private List<String> clubNameLabels(List<Long> clubIds, Map<Long, String> clubNames) {
        Collator koreanCollator = Collator.getInstance(Locale.KOREAN);
        return clubIds.stream()
                .map(clubId -> clubNames.getOrDefault(clubId, "동아리 " + clubId))
                .sorted(koreanCollator::compare)
                .toList();
    }

    private Map<Long, Long> bookingCounts(List<FacilitySubmissionBatch> batches) {
        if (batches.isEmpty()) {
            return Map.of();
        }
        return itemRepository.countByBatchIdIn(batches.stream().map(FacilitySubmissionBatch::getId).toList())
                .stream()
                .collect(Collectors.toMap(
                        FacilitySubmissionItemRepository.BatchItemCountProjection::getBatchId,
                        FacilitySubmissionItemRepository.BatchItemCountProjection::getBookingCount,
                        (first, second) -> first));
    }

    private Map<Long, String> facilityNames(List<FacilitySubmissionBatch> batches) {
        List<Long> facilityIds = batches.stream().map(FacilitySubmissionBatch::getFacilityId).distinct().toList();
        return facilityRepository.findAllById(facilityIds).stream()
                .collect(Collectors.toMap(Facility::getId, Facility::getRoomName, (first, second) -> first));
    }

    private Map<Long, String> submitterNames(List<FacilitySubmissionBatch> batches) {
        List<Long> submitterIds = batches.stream().map(FacilitySubmissionBatch::getSubmittedById).distinct().toList();
        return userRepository.findAllById(submitterIds).stream()
                .collect(Collectors.toMap(User::getId, User::getName, (first, second) -> first));
    }

    private Map<Long, String> auditAdminNames(List<FacilitySubmissionAudit> auditRows) {
        return userRepository.findAllById(
                        auditRows.stream().map(FacilitySubmissionAudit::getAdminId).distinct().toList()).stream()
                .collect(Collectors.toMap(User::getId, User::getName, (first, second) -> first));
    }

    private SubmissionAuditEntry toAuditEntry(FacilitySubmissionAudit auditRow, Map<Long, String> auditAdminNames) {
        // createdAt 은 JPA 감사(JVM 기본 존 wall-clock) 원본 그대로 넘긴다 — 절대시각 환산은
        // 응답 경계(SubmissionAuditResponse.from 의 TimeMapper.systemWallClockToInstant)에서 수행한다.
        return new SubmissionAuditEntry(auditRow.getAction(), auditAdminNames.get(auditRow.getAdminId()),
                auditRow.getCreatedAt(), auditRow.getIpAddress(), auditRow.getDetail());
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
        return clubNamesByIds(bookings.stream().map(FacilityBooking::getClubId).distinct().toList());
    }

    private Map<Long, String> bookingFacilityNames(List<FacilityBooking> bookings) {
        List<Long> facilityIds = bookings.stream().map(FacilityBooking::getFacilityId).distinct().toList();
        return facilityRepository.findAllById(facilityIds).stream()
                .collect(Collectors.toMap(Facility::getId, Facility::getRoomName, (first, second) -> first));
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
            Map<Long, String> submissionNoByBookingId, Map<Long, String> clubNames, Map<Long, String> userNames,
            Map<Long, String> facilityNames) {
        boolean submitted = submissionNoByBookingId.containsKey(booking.getId());
        boolean selectable = booking.getStatus() == BookingStatus.APPROVED && !submitted;
        return new SubmissionCandidateBooking(
                booking.getId(), booking.getFacilityId(), facilityNames.get(booking.getFacilityId()),
                booking.getClubId(), clubNames.get(booking.getClubId()),
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
