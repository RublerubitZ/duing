package com.duing.domain.facilitysubmission.service.export;

public record ExportFile(String fileName, String contentType, byte[] content) {
}
