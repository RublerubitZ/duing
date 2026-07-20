package com.duing.domain.facilitysubmission.service;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.entity.FacilityBookingStatusHistory;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitybooking.repository.FacilityBookingStatusHistoryRepository;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionAudit;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionBatch;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionItem;
import com.duing.domain.facilitysubmission.entity.SubmissionAuditAction;
import com.duing.domain.facilitysubmission.exception.FacilitySubmissionException;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionAuditRepository;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionBatchRepository;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionItemRepository;
import com.duing.domain.facilitysubmission.service.dto.command.CreateSubmissionBatchCommand;
import com.duing.domain.facilitysubmission.service.dto.command.SubmissionActorContext;
import com.duing.domain.facilitysubmission.service.dto.query.CompleteSubmissionBatchResult;
import com.duing.domain.facilitysubmission.service.dto.query.CreateSubmissionBatchResult;
import com.duing.domain.notification.event.FacilityBookingConfirmedEvent;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralFacilitySubmissionService implements FacilitySubmissionService {

    private final FacilityBookingRepository bookingRepository;
    private final FacilityBookingStatusHistoryRepository historyRepository;
    private final FacilitySubmissionBatchRepository batchRepository;
    private final FacilitySubmissionItemRepository itemRepository;
    private final FacilitySubmissionAuditRepository auditRepository;
    private final SubmissionNumberGenerator numberGenerator;
    private final SubmissionCompletionSummaryFormatter summaryFormatter;
    private final ApplicationEventPublisher eventPublisher;
    private final Clock clock;

    @Override
    @Transactional
    public CreateSubmissionBatchResult create(CreateSubmissionBatchCommand command, SubmissionActorContext actor) {
        List<Long> bookingIds = command.bookingIds().stream().distinct().sorted().toList();
        if (bookingIds.isEmpty()) {
            throw new FacilitySubmissionException.EmptyBookingSelectionException();
        }
        // ID 오름차순 행잠금(스펙 §4) — 겹치는 집합의 동시 생성이 반대 순서로 잠그는 데드락을 차단하고,
        // 잠금 하에서 아래 활성 EXISTS 검증을 직렬화한다(부분 유니크 인덱스 부재의 애플리케이션 보상).
        List<FacilityBooking> bookings = bookingRepository.findAllByIdInForUpdate(bookingIds);
        if (bookings.size() != bookingIds.size()) {
            throw new FacilitySubmissionException.SubmissionBookingNotFoundException();
        }
        Long facilityId = bookings.get(0).getFacilityId();
        if (bookings.stream().anyMatch(booking -> !booking.getFacilityId().equals(facilityId))) {
            throw new FacilitySubmissionException.MixedFacilityException();
        }
        if (bookings.stream().anyMatch(booking -> booking.getStatus() != BookingStatus.APPROVED)) {
            throw new FacilitySubmissionException.BookingNotApprovedException();
        }
        if (!itemRepository.findActiveByBookingIdIn(bookingIds).isEmpty()) {
            throw new FacilitySubmissionException.AlreadySubmittedBookingException();
        }

        LocalDateTime submittedAt = LocalDateTime.now(clock);
        String submissionNo = numberGenerator.nextNumber(submittedAt.toLocalDate());
        FacilitySubmissionBatch batch = batchRepository.save(FacilitySubmissionBatch.create(
                submissionNo, facilityId, actor.adminId(), submittedAt, blankToNull(command.memo())));
        itemRepository.saveAll(bookingIds.stream()
                .map(bookingId -> FacilitySubmissionItem.of(batch.getId(), bookingId))
                .toList());
        auditRepository.save(FacilitySubmissionAudit.of(batch.getId(), SubmissionAuditAction.CREATED,
                actor.adminId(), actor.ipAddress(), actor.userAgent()));
        return new CreateSubmissionBatchResult(batch.getId(), submissionNo, batch.getCsvFileName());
    }

    @Override
    @Transactional
    public void cancel(Long batchId, SubmissionActorContext actor) {
        // 행잠금(§4.2) — 완료 처리와의 동시 실행을 직렬화한다.
        FacilitySubmissionBatch batch = batchRepository.findByIdForUpdate(batchId)
                .orElseThrow(FacilitySubmissionException.BatchNotFoundException::new);
        batch.cancel(actor.adminId(), LocalDateTime.now(clock));
        auditRepository.save(FacilitySubmissionAudit.of(batchId, SubmissionAuditAction.CANCELLED,
                actor.adminId(), actor.ipAddress(), actor.userAgent()));
    }

    @Override
    @Transactional
    public CompleteSubmissionBatchResult complete(Long batchId, SubmissionActorContext actor) {
        // 행잠금(§4.3-1) — 완료/취소 동시 실행을 직렬화해 상태 가드가 잠금 하에서 평가되게 한다.
        FacilitySubmissionBatch batch = batchRepository.findByIdForUpdate(batchId)
                .orElseThrow(FacilitySubmissionException.BatchNotFoundException::new);
        LocalDateTime completedAt = LocalDateTime.now(clock);
        // 가드 선평가 — 기취소/기완료면 부작용 없이 즉시 거부
        batch.complete(actor.adminId(), completedAt);
        // item 은 bookingId 매핑용으로 유지한다 — 제외 판정 시 해당 item 에 skipped 를 남겨야
        // 완료된 배치가 예약을 영구히 붙잡는 락아웃(재승인 후 재제출 불가)이 생기지 않는다.
        Map<Long, FacilitySubmissionItem> itemsByBookingId = itemRepository.findByBatchIdOrderByIdAsc(batchId).stream()
                .collect(Collectors.toMap(FacilitySubmissionItem::getBookingId, item -> item,
                        (first, second) -> first));
        List<Long> bookingIds = itemsByBookingId.keySet().stream().sorted().toList();
        // 생성과 동일한 ID 정렬 행잠금(§4.3-2) — 생성·완료의 교차 실행도 booking 잠금에서 직렬화된다.
        List<FacilityBooking> bookings = bookingRepository.findAllByIdInForUpdate(bookingIds);

        List<CompleteSubmissionBatchResult.SkippedBooking> skippedBookings = new ArrayList<>();
        int confirmedCount = 0;
        for (FacilityBooking booking : bookings) {
            if (booking.getStatus() != BookingStatus.APPROVED) {
                skippedBookings.add(new CompleteSubmissionBatchResult.SkippedBooking(
                        booking.getId(), booking.getStatus(),
                        summaryFormatter.reasonLabel(booking.getStatus())));
                itemsByBookingId.get(booking.getId()).markSkipped(completedAt);
                continue;
            }
            // best-effort(§4.3-3) — 기존 수동 확정 경로 재사용(상태 머신 무변경), 이력·알림도 기존 계약 그대로.
            booking.confirmManually(completedAt);
            FacilityBookingStatusHistory confirmationHistory = historyRepository.save(
                    FacilityBookingStatusHistory.record(booking.getId(), BookingStatus.APPROVED,
                            BookingStatus.CONFIRMED, actor.adminId(),
                            "학교 제출 완료 — " + batch.getSubmissionNo(), null));
            eventPublisher.publishEvent(new FacilityBookingConfirmedEvent(
                    booking.getId(), booking.getClubId(), confirmationHistory.getId()));
            confirmedCount++;
        }

        auditRepository.save(FacilitySubmissionAudit.of(batchId, SubmissionAuditAction.COMPLETED,
                actor.adminId(), actor.ipAddress(), actor.userAgent(),
                summaryFormatter.summarize(bookings.size(), confirmedCount, skippedBookings)));
        return new CompleteSubmissionBatchResult(bookings.size(), confirmedCount, completedAt, skippedBookings);
    }

    private String blankToNull(String text) {
        return (text == null || text.isBlank()) ? null : text.trim();
    }
}
