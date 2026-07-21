package com.duing.domain.facilitysubmission.service.export;

import com.duing.domain.facilitysubmission.service.dto.command.SubmissionActorContext;

public interface FacilitySubmissionExportService {

    ExportFile export(Long batchId, ExportFormat format, SubmissionActorContext actor);
}
