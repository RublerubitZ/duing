package com.duing.domain.facilitybooking.repository;

import com.duing.domain.facilitybooking.entity.FacilityBookingPurposePreset;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FacilityBookingPurposePresetRepository
        extends JpaRepository<FacilityBookingPurposePreset, Long> {

    List<FacilityBookingPurposePreset> findByActiveTrueOrderBySortOrderAsc();
}
