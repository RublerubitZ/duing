package com.duing.domain.facilitysubmission.service;

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
import com.duing.domain.facilitysubmission.service.dto.command.CreateSubmissionBatchCommand;
import com.duing.domain.facilitysubmission.service.dto.command.SubmissionActorContext;
import com.duing.domain.facilitysubmission.service.dto.query.CreateSubmissionBatchResult;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralFacilitySubmissionService implements FacilitySubmissionService {

    private final FacilityBookingRepository bookingRepository;
    private final FacilitySubmissionBatchRepository batchRepository;
    private final FacilitySubmissionItemRepository itemRepository;
    private final FacilitySubmissionAuditRepository auditRepository;
    private final SubmissionNumberGenerator numberGenerator;
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
        FacilitySubmissionBatch batch = batchRepository.findById(batchId)
                .orElseThrow(FacilitySubmissionException.BatchNotFoundException::new);
        batch.cancel(actor.adminId(), LocalDateTime.now(clock));
        auditRepository.save(FacilitySubmissionAudit.of(batchId, SubmissionAuditAction.CANCELLED,
                actor.adminId(), actor.ipAddress(), actor.userAgent()));
    }

    private String blankToNull(String text) {
        return (text == null || text.isBlank()) ? null : text.trim();
    }
}
