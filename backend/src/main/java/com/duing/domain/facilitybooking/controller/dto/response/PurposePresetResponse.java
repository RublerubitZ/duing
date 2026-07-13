package com.duing.domain.facilitybooking.controller.dto.response;

import com.duing.domain.facilitybooking.entity.FacilityBookingPurposePreset;

public record PurposePresetResponse(Long id, String label) {
    public static PurposePresetResponse from(FacilityBookingPurposePreset preset) {
        return new PurposePresetResponse(preset.getId(), preset.getLabel());
    }
}
