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
 * 아카이브 복구, 없어진 시설 아카이브(하드삭제 금지 — 한 번에 너무 많이 사라지면 부분 파싱으로 보고 보류).
 * archived_at 만 다루므로 findAll() 이 아카이브 포함 전체를 반환하는 것에 의존한다(이 도메인은 @SQLRestriction 미사용).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FacilitySyncService {

    /**
     * 부분 파싱으로 인한 대량 archive 방지(P2-12): 활성 시설의 30% 를 넘는 수가 한 번에 목록에서 사라지면 파서 결손으로
     * 판단하고 archive 단계만 건너뛴다(생성·수정·복구는 그대로 수행). 소규모 목록은 최소 1건 폐쇄를 항상 허용한다.
     * 근거: 관찰된 활성 시설 ~10개·하루 1회 sync → 허용 3 = 1~3건 폐쇄 허용, 4건 이상 차단.
     * 트레이드오프: 실제 대량 폐쇄(>30%)도 보류되어 다음 sync 마다 WARN 이 반복된다 — 개입 수단은 이 상수 변경뿐(운영 토글 없음).
     */
    static final double MAX_ARCHIVE_RATIO = 0.3;
    static final int MIN_ARCHIVE_ALLOWANCE = 1;

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
        // 허용 한도의 기준은 이번 sync 의 복구로 불어나기 전 활성 수 — 루프 이전에 측정한다. 같은 영속성 컨텍스트라
        // 루프의 findByRoomSeq 는 이 목록과 동일 인스턴스를 돌려주고, 신규 저장분은 seen 에 있어 archive 후보가 아니다.
        List<Facility> allFacilitiesBeforeSync = facilityRepository.findAll();
        long activeCountBefore = allFacilitiesBeforeSync.stream().filter(facility -> !facility.isArchived()).count();
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

        List<Facility> archiveCandidates = allFacilitiesBeforeSync.stream()
                .filter(facility -> !seenRoomSeqs.contains(facility.getRoomSeq()) && !facility.isArchived())
                .toList();
        int archiveAllowance = (int) Math.max(MIN_ARCHIVE_ALLOWANCE, Math.floor(activeCountBefore * MAX_ARCHIVE_RATIO));
        int archived = 0;
        if (archiveCandidates.size() > archiveAllowance) {
            log.warn("시설 archive 스킵: 활성 {} 중 {} 미인식 — 허용 {} 초과, 부분 파싱 의심",
                    activeCountBefore, archiveCandidates.size(), archiveAllowance);
        } else {
            for (Facility facility : archiveCandidates) {
                facility.archive(now);
            }
            archived = archiveCandidates.size();
        }
        log.info("Facility Sync 완료 created={} updated={} archived={} total={}",
                created, updated, archived, parsed.size());
    }
}
