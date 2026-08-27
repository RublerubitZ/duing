package com.duing.domain.facility;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.facility.crawler.SchoolFacilityClient;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.parser.FacilityListParser;
import com.duing.domain.facility.parser.ParsedFacility;
import com.duing.domain.facility.parser.ParsedReservation;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facility.service.FacilitySnapshotWriter;
import com.duing.domain.facility.service.FacilitySyncService;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import org.jsoup.nodes.Document;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * 크롤 문자열 길이 가드 회귀 테스트. 학교가 컬럼 길이를 넘는 값을 한 번만 내려도 INSERT 가 실패해
 * 해당 시설·월 크롤 트랜잭션이 통째로 롤백되고, 자가 치유가 없어 그 달 갱신이 영구 정지했다.
 * 엔티티 생성·갱신 시점 절단으로 롤백 없이 절단 저장되는 것과, 절단점이 서로게이트 쌍을 쪼개지
 * 않는 것을 실제 PostgreSQL 에 영속시켜 검증한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class FacilityCrawlTruncationIntegrationTest extends IntegrationTestBase {

    private static final int MAX_ORGANIZATION_NAME_LENGTH = 200;
    private static final int MAX_ROOM_NAME_LENGTH = 100;
    private static final int MAX_LOCATION_LENGTH = 100;
    /** 서로게이트 쌍 1개(2 char) — 절단점에 걸리면 쪼개져 깨진 문자가 된다. */
    private static final String EMOJI = "🎸";

    private static final YearMonth TARGET_MONTH = YearMonth.of(2026, 7);
    private static final LocalDateTime CRAWLED_AT = LocalDateTime.of(2026, 7, 20, 3, 0);

    @Autowired FacilityRepository facilityRepository;
    @Autowired FacilityReservationRepository reservationRepository;
    @Autowired FacilitySnapshotWriter snapshotWriter;
    @Autowired FacilitySyncService syncService;

    @MockitoBean SchoolFacilityClient schoolFacilityClient;
    @MockitoBean FacilityListParser facilityListParser;

    @BeforeEach
    void stubSchoolRoomList() {
        when(schoolFacilityClient.fetchRoomListHtml()).thenReturn(new Document("https://school.test"));
    }

    @Test
    @DisplayName("컬럼 길이를 넘는 단체명이 내려와도 크롤 트랜잭션이 롤백되지 않고 절단되어 저장된다")
    void truncatesOverLengthOrganizationName() {
        Facility facility = facilityRepository.save(Facility.create(4, "공동연습실(1)", "2105", 0));
        String overLengthName = "가".repeat(MAX_ORGANIZATION_NAME_LENGTH + 50);

        snapshotWriter.reconcileReservations(facility.getId(), List.of(TARGET_MONTH),
                Map.of(TARGET_MONTH, List.of(reservationWithOrganizationName(18134L, overLengthName))), CRAWLED_AT);

        List<FacilityReservation> persisted =
                reservationRepository.findByFacilityIdAndYearMonth(facility.getId(), TARGET_MONTH);
        assertThat(persisted).hasSize(1);
        assertThat(persisted.get(0).getOrganizationName())
                .hasSize(MAX_ORGANIZATION_NAME_LENGTH)
                .isEqualTo("가".repeat(MAX_ORGANIZATION_NAME_LENGTH));
    }

    @Test
    @DisplayName("단체명 절단점에 서로게이트 쌍이 걸리면 쌍을 쪼개지 않고 한 글자 앞에서 잘린다")
    void keepsSurrogatePairIntactInOrganizationName() {
        Facility facility = facilityRepository.save(Facility.create(5, "공동연습실(2)", "2106", 0));
        // 199 BMP + 서로게이트 쌍 → 절단점(index 199)이 high surrogate 에 정확히 걸린다.
        String surrogateBoundaryName = "가".repeat(MAX_ORGANIZATION_NAME_LENGTH - 1) + EMOJI;

        snapshotWriter.reconcileReservations(facility.getId(), List.of(TARGET_MONTH),
                Map.of(TARGET_MONTH, List.of(reservationWithOrganizationName(18135L, surrogateBoundaryName))),
                CRAWLED_AT);

        String persistedName = reservationRepository
                .findByFacilityIdAndYearMonth(facility.getId(), TARGET_MONTH)
                .get(0)
                .getOrganizationName();
        assertThat(persistedName).hasSize(MAX_ORGANIZATION_NAME_LENGTH - 1);
        assertThat(Character.isSurrogate(persistedName.charAt(persistedName.length() - 1))).isFalse();
    }

    @Test
    @DisplayName("신규 시설 생성 시 길이를 넘는 시설명과 위치가 절단되어 저장된다")
    void truncatesOverLengthRoomNameAndLocationOnCreate() {
        String overLengthRoomName = "실".repeat(MAX_ROOM_NAME_LENGTH + 30);
        String overLengthLocation = "동".repeat(MAX_LOCATION_LENGTH + 30);
        when(facilityListParser.parse(any()))
                .thenReturn(List.of(new ParsedFacility(7, overLengthRoomName, overLengthLocation, 0)));

        syncService.sync();

        Facility persisted = facilityRepository.findByRoomSeq(7).orElseThrow();
        assertThat(persisted.getRoomName()).hasSize(MAX_ROOM_NAME_LENGTH);
        assertThat(persisted.getLocation()).hasSize(MAX_LOCATION_LENGTH);
    }

    @Test
    @DisplayName("기존 시설 갱신(upsert) 경로에서도 길이를 넘는 시설명과 위치가 절단되어 저장된다")
    void truncatesOverLengthRoomNameAndLocationOnUpdate() {
        facilityRepository.save(Facility.create(8, "공동연습실(3)", "2107", 0));
        String overLengthRoomName = "실".repeat(MAX_ROOM_NAME_LENGTH + 30);
        String overLengthLocation = "동".repeat(MAX_LOCATION_LENGTH + 30);
        when(facilityListParser.parse(any()))
                .thenReturn(List.of(new ParsedFacility(8, overLengthRoomName, overLengthLocation, 1)));

        syncService.sync();

        Facility persisted = facilityRepository.findByRoomSeq(8).orElseThrow();
        assertThat(persisted.getRoomName()).hasSize(MAX_ROOM_NAME_LENGTH);
        assertThat(persisted.getLocation()).hasSize(MAX_LOCATION_LENGTH);
        assertThat(persisted.getSortOrder()).isEqualTo(1);
    }

    @Test
    @DisplayName("시설명 절단점에 서로게이트 쌍이 걸리면 쌍을 쪼개지 않고 한 글자 앞에서 잘린다")
    void keepsSurrogatePairIntactInRoomName() {
        String surrogateBoundaryRoomName = "실".repeat(MAX_ROOM_NAME_LENGTH - 1) + EMOJI;
        when(facilityListParser.parse(any()))
                .thenReturn(List.of(new ParsedFacility(9, surrogateBoundaryRoomName, "2108", 0)));

        syncService.sync();

        String persistedRoomName = facilityRepository.findByRoomSeq(9).orElseThrow().getRoomName();
        assertThat(persistedRoomName).hasSize(MAX_ROOM_NAME_LENGTH - 1);
        assertThat(Character.isSurrogate(persistedRoomName.charAt(persistedRoomName.length() - 1))).isFalse();
    }

    private ParsedReservation reservationWithOrganizationName(long scheduleSeq, String organizationName) {
        return new ParsedReservation(scheduleSeq, LocalDate.of(2026, 7, 1), LocalTime.of(19, 0),
                LocalTime.of(20, 0), organizationName, false);
    }
}
