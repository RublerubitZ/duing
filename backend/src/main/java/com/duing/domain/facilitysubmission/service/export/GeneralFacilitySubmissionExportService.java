package com.duing.domain.facilitysubmission.service.export;

import com.duing.domain.facilitysubmission.entity.FacilitySubmissionAudit;
import com.duing.domain.facilitysubmission.entity.SubmissionAuditAction;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionAuditRepository;
import com.duing.domain.facilitysubmission.service.dto.command.SubmissionActorContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class GeneralFacilitySubmissionExportService implements FacilitySubmissionExportService {

    private final SubmissionExportDataAssembler exportDataAssembler;
    private final CsvSubmissionWriter csvWriter;
    private final FacilitySubmissionAuditRepository auditRepository;

    // 다운로드 감사 기록이 포함된 조회 — readOnly 금지(전역 제약).
    @Override
    @Transactional
    public ExportFile export(Long batchId, ExportFormat format, SubmissionActorContext actor) {
        SubmissionExportData exportData = exportDataAssembler.assemble(batchId);
        byte[] content = switch (format) {
            case CSV -> csvWriter.write(exportData);
        };
        auditRepository.save(FacilitySubmissionAudit.of(batchId, SubmissionAuditAction.CSV_DOWNLOADED,
                actor.adminId(), actor.ipAddress(), actor.userAgent()));
        return new ExportFile(exportData.csvFileName(), "text/csv;charset=UTF-8", content);
    }
}
