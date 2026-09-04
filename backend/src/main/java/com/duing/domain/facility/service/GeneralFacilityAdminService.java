package com.duing.domain.facility.service;

import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.exception.FacilityException;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.service.dto.command.UpdateFacilityBookingOpenDateCommand;
import java.time.Clock;
import java.time.LocalDate;
import java.time.Period;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class GeneralFacilityAdminService implements FacilityAdminService {

    private static final Period MAX_OPEN_DATE_HORIZON = Period.ofYears(1);

    private final FacilityRepository facilityRepository;
    private final Clock clock;

    @Override
    @Transactional(readOnly = true)
    public List<Facility> listActiveFacilities() {
        return facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc();
    }

    /** 오픈일 변이 지점 ① — 후속 감사/이력 테이블은 여기에 붙는다(no-op 은 기록하지 않는 전례 유지). */
    @Override
    @Transactional
    public void updateBookingOpenDate(UpdateFacilityBookingOpenDateCommand command) {
        LocalDate newBookingOpenDate = command.bookingOpenDate();
        assertWithinHorizon(newBookingOpenDate);
        Facility facility = facilityRepository.findById(command.facilityId())
                .orElseThrow(FacilityException.FacilityNotFoundException::new);
        if (Objects.equals(facility.getBookingOpenDate(), newBookingOpenDate)) {
            return;
        }
        facility.changeBookingOpenDate(newBookingOpenDate);
    }

    /** 오픈일 변이 지점 ② — 활성 시설 전체를 한 트랜잭션으로. 하나라도 실패하면 전부 롤백(부분 적용 없음). */
    @Override
    @Transactional
    public void updateAllBookingOpenDate(LocalDate bookingOpenDate) {
        assertWithinHorizon(bookingOpenDate);
        for (Facility facility : facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()) {
            if (!Objects.equals(facility.getBookingOpenDate(), bookingOpenDate)) {
                facility.changeBookingOpenDate(bookingOpenDate);
            }
        }
    }

    /** 과거는 허용한다(판정이 오늘로 clamp 된다). 오탈자로 수십 년 뒤를 저장해 시설이 사실상 닫히는 것만 막는다. */
    private void assertWithinHorizon(LocalDate bookingOpenDate) {
        if (bookingOpenDate != null && bookingOpenDate.isAfter(LocalDate.now(clock).plus(MAX_OPEN_DATE_HORIZON))) {
            throw new FacilityException.InvalidBookingOpenDateException();
        }
    }
}
