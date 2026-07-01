package com.duing.domain.facility.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.duing.domain.facility.crawler.SchoolFacilityClient;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.parser.FacilityListParser;
import com.duing.domain.facility.parser.ParsedFacility;
import com.duing.domain.facility.repository.FacilityRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.jsoup.nodes.Document;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class FacilitySyncServiceTest {

    @Mock SchoolFacilityClient client;
    @Mock FacilityListParser listParser;
    @Mock FacilityRepository facilityRepository;

    FacilitySyncService service;
    final Clock clock = Clock.fixed(Instant.parse("2026-07-01T00:00:00Z"), ZoneId.of("Asia/Seoul"));

    @BeforeEach
    void setUp() {
        service = new FacilitySyncService(client, listParser, facilityRepository, clock);
        when(client.fetchRoomListHtml()).thenReturn(new Document("https://school.test"));
    }

    @Test
    @DisplayName("신규 room_seq 는 새 시설로 저장된다")
    void createsNewFacility() {
        when(listParser.parse(any())).thenReturn(List.of(new ParsedFacility(4, "공동연습실(1)", "2105", 0)));
        when(facilityRepository.findAll()).thenReturn(List.of());
        when(facilityRepository.findByRoomSeq(4)).thenReturn(Optional.empty());

        service.sync();

        org.mockito.Mockito.verify(facilityRepository).save(org.mockito.ArgumentMatchers.argThat(
                saved -> saved.getRoomSeq() == 4 && saved.getRoomName().equals("공동연습실(1)")));
    }

    @Test
    @DisplayName("기존 시설의 이름/위치가 바뀌면 수정되고 아카이브 상태면 복구된다")
    void updatesAndRestores() {
        Facility existing = Facility.create(4, "공동연습실(1)", "2105", 0);
        existing.archive(java.time.LocalDateTime.now(clock)); // 아카이브 상태
        when(facilityRepository.findByRoomSeq(4)).thenReturn(Optional.of(existing));
        when(facilityRepository.findAll()).thenReturn(List.of(existing));
        when(listParser.parse(any())).thenReturn(List.of(new ParsedFacility(4, "공동연습실(1)", "2105-1", 0)));

        service.sync();

        assertThat(existing.getLocation()).isEqualTo("2105-1");
        assertThat(existing.isArchived()).isFalse();
    }

    @Test
    @DisplayName("파싱 목록에 없어진 기존 시설은 archived_at 이 설정된다(하드삭제 금지)")
    void archivesRemoved() {
        Facility stale = Facility.create(99, "폐지시설", null, 0);
        when(facilityRepository.findAll()).thenReturn(List.of(stale));
        when(listParser.parse(any())).thenReturn(List.of(new ParsedFacility(4, "공동연습실(1)", "2105", 0)));
        when(facilityRepository.findByRoomSeq(4)).thenReturn(Optional.empty());

        service.sync();

        assertThat(stale.isArchived()).isTrue();
    }
}
