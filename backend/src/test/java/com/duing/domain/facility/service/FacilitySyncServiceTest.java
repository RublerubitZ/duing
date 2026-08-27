package com.duing.domain.facility.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.duing.domain.facility.crawler.SchoolFacilityClient;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.parser.FacilityListParser;
import com.duing.domain.facility.parser.ParsedFacility;
import com.duing.domain.facility.repository.FacilityRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.IntStream;
import org.jsoup.nodes.Document;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.LoggerFactory;

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

    @Test
    @DisplayName("파싱 결과가 0건이면 전체 실패로 보고 저장소를 건드리지 않고 종료한다")
    void skipsEntirelyWhenNothingParsed() {
        when(listParser.parse(any())).thenReturn(List.of());

        service.sync();

        verifyNoInteractions(facilityRepository);
    }

    @Test
    @DisplayName("활성 시설 10개 중 1개만 목록에서 사라지면 허용 범위 안이라 그 1개는 아카이브된다")
    void archivesSmallDecreaseWithinAllowance() {
        List<Facility> activeFacilities = activeFacilities(10);
        List<Facility> recognized = activeFacilities.subList(0, 9);
        when(facilityRepository.findAll()).thenReturn(activeFacilities);
        stubExisting(recognized);
        when(listParser.parse(any())).thenReturn(parsedFrom(recognized));

        service.sync();

        assertThat(activeFacilities.get(9).isArchived()).isTrue();
        assertThat(recognized).noneMatch(Facility::isArchived);
    }

    @Test
    @DisplayName("활성 시설 3개 중 1개가 사라지면 비율상 0건이지만 최소 허용 1건으로 아카이브된다")
    void minimumAllowancePermitsOneArchiveOnSmallList() {
        List<Facility> activeFacilities = activeFacilities(3);
        List<Facility> recognized = activeFacilities.subList(0, 2);
        when(facilityRepository.findAll()).thenReturn(activeFacilities);
        stubExisting(recognized);
        when(listParser.parse(any())).thenReturn(parsedFrom(recognized));

        service.sync();

        assertThat(activeFacilities.get(2).isArchived()).isTrue();
    }

    @Test
    @DisplayName("활성 시설 10개 중 4개가 한 번에 사라지면 부분 파싱으로 보고 아카이브만 건너뛰며 생성·수정·복구는 수행한다")
    void skipsArchiveOnMassDisappearanceButStillCreatesUpdatesRestores() {
        List<Facility> activeFacilities = activeFacilities(10);
        List<Facility> recognized = activeFacilities.subList(0, 6);
        List<Facility> unrecognized = activeFacilities.subList(6, 10);
        Facility archivedBefore = Facility.create(11, "복구대상", "2201", 10);
        archivedBefore.archive(LocalDateTime.now(clock));
        List<Facility> allFacilities = new ArrayList<>(activeFacilities);
        allFacilities.add(archivedBefore);
        when(facilityRepository.findAll()).thenReturn(allFacilities);
        stubExisting(recognized);
        stubExisting(List.of(archivedBefore));
        when(facilityRepository.findByRoomSeq(12)).thenReturn(Optional.empty());

        List<ParsedFacility> parsed = new ArrayList<>();
        parsed.add(new ParsedFacility(1, "공동연습실(1)", "2105-1", 1)); // 위치 변경 → 수정
        parsed.addAll(parsedFrom(recognized.subList(1, 6)));
        parsed.add(parsedFrom(archivedBefore)); // 아카이브 상태 재등장 → 복구
        parsed.add(new ParsedFacility(12, "신규시설", "2301", 11)); // 신규 → 생성
        when(listParser.parse(any())).thenReturn(parsed);

        Logger syncLogger = (Logger) LoggerFactory.getLogger(FacilitySyncService.class);
        ListAppender<ILoggingEvent> logAppender = new ListAppender<>();
        logAppender.start();
        syncLogger.addAppender(logAppender);
        try {
            service.sync();
        } finally {
            syncLogger.detachAppender(logAppender);
        }

        assertThat(unrecognized).noneMatch(Facility::isArchived);
        assertThat(activeFacilities.get(0).getLocation()).isEqualTo("2105-1");
        assertThat(archivedBefore.isArchived()).isFalse();
        verify(facilityRepository).save(argThat(saved -> saved.getRoomSeq() == 12));
        assertThat(logAppender.list)
                .filteredOn(logEvent -> logEvent.getLevel() == Level.WARN)
                .map(ILoggingEvent::getFormattedMessage)
                .anyMatch(message -> message.contains("활성 10 중 4 미인식") && message.contains("허용 3"));
    }

    @Test
    @DisplayName("허용 한도는 이번 동기화의 복구로 불어나기 전 활성 수로 계산한다")
    void allowanceUsesActiveCountBeforeRestores() {
        // 활성 3(허용 1) + 아카이브 4 가 전부 재등장. 복구 후 활성 7 로 세면 허용 2 가 되어 사라진 2건이 아카이브돼 버린다.
        List<Facility> activeFacilities = activeFacilities(3);
        List<Facility> reappearing = IntStream.rangeClosed(11, 14)
                .mapToObj(roomSeq -> {
                    Facility archivedFacility = Facility.create(roomSeq, "복구(" + roomSeq + ")", null, roomSeq);
                    archivedFacility.archive(LocalDateTime.now(clock));
                    return archivedFacility;
                })
                .toList();
        List<Facility> allFacilities = new ArrayList<>(activeFacilities);
        allFacilities.addAll(reappearing);
        when(facilityRepository.findAll()).thenReturn(allFacilities);
        stubExisting(List.of(activeFacilities.get(0)));
        stubExisting(reappearing);
        List<ParsedFacility> parsed = new ArrayList<>(parsedFrom(List.of(activeFacilities.get(0))));
        parsed.addAll(parsedFrom(reappearing));
        when(listParser.parse(any())).thenReturn(parsed);

        service.sync();

        assertThat(activeFacilities.subList(1, 3)).noneMatch(Facility::isArchived);
        assertThat(reappearing).noneMatch(Facility::isArchived);
    }

    /** roomSeq 1..count 의 활성 시설. */
    private static List<Facility> activeFacilities(int count) {
        return IntStream.rangeClosed(1, count)
                .mapToObj(roomSeq -> Facility.create(roomSeq, "공동연습실(" + roomSeq + ")", "2105", roomSeq))
                .toList();
    }

    /** 저장된 값 그대로의 파싱 결과(변경 없음). */
    private static List<ParsedFacility> parsedFrom(List<Facility> facilities) {
        return facilities.stream().map(FacilitySyncServiceTest::parsedFrom).toList();
    }

    private static ParsedFacility parsedFrom(Facility facility) {
        return new ParsedFacility(
                facility.getRoomSeq(), facility.getRoomName(), facility.getLocation(), facility.getSortOrder());
    }

    private void stubExisting(List<Facility> facilities) {
        for (Facility facility : facilities) {
            when(facilityRepository.findByRoomSeq(facility.getRoomSeq())).thenReturn(Optional.of(facility));
        }
    }
}
