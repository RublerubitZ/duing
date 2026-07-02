package com.duing.domain.facility.service;

import com.duing.domain.facility.crawler.SchoolFacilityClient;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.parser.FacilityListParser;
import com.duing.domain.facility.parser.ParsedFacility;
import com.duing.domain.facility.repository.FacilityRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.nodes.Document;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 시설 목록 동기화(1일 1회). 학교 탭 목록을 파싱해 DB 를 reconcile 한다: 신규 생성, 이름/위치/순서 변경 수정,
 * 아카이브 복구, 없어진 시설 아카이브(하드삭제 금지). archived_at 만 다루므로 findAll() 이 아카이브 포함
 * 전체를 반환하는 것에 의존한다(이 도메인은 @SQLRestriction 미사용).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FacilitySyncService {

    private final SchoolFacilityClient client;
    private final FacilityListParser listParser;
    private final FacilityRepository facilityRepository;
    private final Clock clock;

    @Transactional
    public void sync() {
        Document document = client.fetchRoomListHtml();
        List<ParsedFacility> parsed = listParser.parse(document);
        if (parsed.isEmpty()) {
            log.warn("시설 목록 동기화 스킵: 파싱 결과 0건(학교 응답 이상 가능)");
            return;
        }
        LocalDateTime now = LocalDateTime.now(clock);
        Set<Integer> seenRoomSeqs = new HashSet<>();
        int created = 0;
        int updated = 0;

        for (ParsedFacility item : parsed) {
            seenRoomSeqs.add(item.roomSeq());
            Optional<Facility> existing = facilityRepository.findByRoomSeq(item.roomSeq());
            if (existing.isEmpty()) {
                facilityRepository.save(
                        Facility.create(item.roomSeq(), item.roomName(), item.location(), item.sortOrder()));
                created++;
                continue;
            }
            Facility facility = existing.get();
            boolean changed = facility.updateDetails(item.roomName(), item.location(), item.sortOrder());
            if (facility.isArchived()) {
                facility.restore();
                changed = true;
            }
            if (changed) {
                updated++;
            }
        }

        int archived = 0;
        for (Facility facility : facilityRepository.findAll()) {
            if (!seenRoomSeqs.contains(facility.getRoomSeq()) && !facility.isArchived()) {
                facility.archive(now);
                archived++;
            }
        }
        log.info("Facility Sync 완료 created={} updated={} archived={} total={}",
                created, updated, archived, parsed.size());
    }
}
