package com.duing.domain.facilitysubmission.service.export;

import com.duing.domain.facilitysubmission.service.dto.command.SubmissionActorContext;

public interface SubmissionExportService {

    ExportFile export(Long batchId, ExportFormat format, SubmissionActorContext actor);
}
