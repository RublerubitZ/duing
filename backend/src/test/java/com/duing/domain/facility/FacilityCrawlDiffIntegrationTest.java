package com.duing.domain.facility;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.crawler.SchoolFacilityClient;
import com.duing.domain.facility.crawler.exception.FacilityClientException.FacilityFetchException;
import com.duing.domain.facility.entity.CrawlSource;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityMonthSnapshot;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facility.service.FacilityCrawlService;
import com.duing.domain.facilitybooking.service.CrawlRowType;
import com.duing.domain.facilitybooking.service.FacilityAvailabilityPolicy;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * 예약 크롤 차등 반영 회귀 테스트. 크롤은 10분마다 도는데 실제 예약 변경은 드물어, 과거 구조(월 전체
 * delete + 전건 insert)는 사용자가 없어도 매 주기 수백 건의 쓰기를 만들었다. 지금은 학교 자연키
 * schedule_seq 로 저장 행과 크롤 결과를 짝지어 실제 변경분만 쓴다.
 *
 * <p>"쓰기 0" 은 행의 id·updated_at·crawled_at 이 그대로인 것으로 검증한다 — INSERT 면 id 가 새로 생기고,
 * UPDATE 면 감사 필드(updated_at)와 crawled_at 이 갱신되며, DELETE 면 행이 사라지기 때문에 세 값이 모두
 * 보존되는 것은 어떤 쓰기 문장도 실행되지 않았다는 뜻이다. (학교 HTTP 만 stub 하고 파서·라이터·DB 는 실제다.)
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class FacilityCrawlDiffIntegrationTest extends IntegrationTestBase {

    private static final int ROOM_SEQ = 4;

    /** 꼬리 시간표기가 있는 행(전 구간 확장)과 없는 행(마커 유지)을 함께 둬 두 형태 모두 회귀에 포함한다. */
    private static final String BASELINE_PAYLOAD = """
            [{"schedule_seq":"18134","schedule_dept":"고정관념(9:00~20:00)",
              "schedule_date":"01","schedule_time":"19:00~20:00"},
             {"schedule_seq":"18135","schedule_dept":"동아리연합회",
              "schedule_date":"02","schedule_time":"10:00~11:00"}]
            """;

    @Autowired FacilityCrawlService crawlService;
    @Autowired FacilityRepository facilityRepository;
    @Autowired FacilityReservationRepository reservationRepository;
    @Autowired FacilityMonthSnapshotRepository snapshotRepository;
    @Autowired FacilityAvailabilityPolicy availabilityPolicy;
    @Autowired ClubRepository clubRepository;
    @MockitoBean SchoolFacilityClient schoolFacilityClient;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private Facility facility;
    private YearMonth targetMonth;

    @BeforeEach
    void createFacilityAndBaseline() {
        // 절대 날짜 하드코딩 금지 — 실행 시점의 현재월을 쓴다(스케줄러의 실제 대상 월과 같다).
        targetMonth = YearMonth.now(ZoneId.of("Asia/Seoul"));
        facility = facilityRepository.save(Facility.create(ROOM_SEQ, "공동연습실(1)", "2105", 0));
    }

    // ---------- helpers ----------

    /** 저장 행의 신원(id)·감사 필드·값 전체. equals 비교만으로 "쓰기가 있었는가"를 판정하기 위한 지문이다. */
    private record RowState(long scheduleSeq, Long id, LocalDateTime updatedAt, LocalDateTime crawledAt,
                            String organizationName, LocalTime startTime, LocalTime endTime) {}

    private List<RowState> storedRows() {
        return storedRows(targetMonth);
    }

    private List<RowState> storedRows(YearMonth yearMonth) {
        return reservationRepository.findByFacilityIdAndYearMonth(facility.getId(), yearMonth).stream()
                .map(row -> new RowState(row.getScheduleSeq(), row.getId(), row.getUpdatedAt(), row.getCrawledAt(),
                        row.getOrganizationName(), row.getStartTime(), row.getEndTime()))
                .sorted(Comparator.comparingLong(RowState::scheduleSeq))
                .toList();
    }

    private JsonNode payload(String json) {
        try {
            return objectMapper.readTree(json);
        } catch (JsonProcessingException malformedFixture) {
            throw new IllegalStateException("테스트 픽스처 JSON 이 잘못됐다", malformedFixture);
        }
    }

    private void schoolReturns(String json) {
        schoolReturns(targetMonth, json);
    }

    private void schoolReturns(YearMonth yearMonth, String json) {
        when(schoolFacilityClient.fetchReservations(eq(ROOM_SEQ), eq(yearMonth))).thenReturn(payload(json));
    }

    private void crawl() {
        crawlService.crawlAndReplace(List.of(targetMonth), CrawlSource.SCHEDULER);
    }

    /** 기준 상태를 만들고(최초 수집) 그 시점 지문을 돌려준다. */
    private List<RowState> crawlBaseline() {
        schoolReturns(BASELINE_PAYLOAD);
        crawl();
        List<RowState> baseline = storedRows();
        assertThat(baseline).hasSize(2);
        return baseline;
    }

    // ---------- cases ----------

    @Test
    @DisplayName("직전과 동일한 크롤 결과는 어떤 행도 새로 쓰지 않는다 — 신원·감사 필드·수집 시각이 모두 보존된다")
    void identicalCrawlWritesNothing() {
        List<RowState> baseline = crawlBaseline();

        crawl(); // 같은 응답으로 한 번 더

        assertThat(storedRows()).isEqualTo(baseline);
    }

    @Test
    @DisplayName("학교에 예약 1건이 추가되면 그 행만 새로 저장되고 기존 행은 손대지 않는다")
    void addedReservationInsertsOnlyThatRow() {
        List<RowState> baseline = crawlBaseline();

        schoolReturns("""
                [{"schedule_seq":"18134","schedule_dept":"고정관념(9:00~20:00)",
                  "schedule_date":"01","schedule_time":"19:00~20:00"},
                 {"schedule_seq":"18135","schedule_dept":"동아리연합회",
                  "schedule_date":"02","schedule_time":"10:00~11:00"},
                 {"schedule_seq":"18136","schedule_dept":"신규동아리",
                  "schedule_date":"03","schedule_time":"14:00~15:00"}]
                """);
        crawl();

        List<RowState> afterCrawl = storedRows();
        assertThat(afterCrawl).hasSize(3);
        assertThat(afterCrawl.subList(0, 2)).isEqualTo(baseline); // 기존 2건은 지문 그대로
        assertThat(afterCrawl.get(2).scheduleSeq()).isEqualTo(18136L);
        assertThat(afterCrawl.get(2).organizationName()).isEqualTo("신규동아리");
    }

    @Test
    @DisplayName("학교에서 예약 1건이 사라지면 그 행만 삭제되고 나머지 행은 손대지 않는다")
    void removedReservationDeletesOnlyThatRow() {
        List<RowState> baseline = crawlBaseline();

        schoolReturns("""
                [{"schedule_seq":"18134","schedule_dept":"고정관념(9:00~20:00)",
                  "schedule_date":"01","schedule_time":"19:00~20:00"}]
                """);
        crawl();

        assertThat(storedRows()).containsExactly(baseline.get(0));
    }

    @Test
    @DisplayName("예약 내용이 바뀌면 그 행만 갱신되고 행 신원(id)은 유지되며 나머지 행은 손대지 않는다")
    void changedReservationUpdatesOnlyThatRow() {
        List<RowState> baseline = crawlBaseline();

        // 18135 의 단체명과 시간대가 바뀌었다. 18134 는 그대로.
        schoolReturns("""
                [{"schedule_seq":"18134","schedule_dept":"고정관념(9:00~20:00)",
                  "schedule_date":"01","schedule_time":"19:00~20:00"},
                 {"schedule_seq":"18135","schedule_dept":"바뀐동아리",
                  "schedule_date":"02","schedule_time":"15:00~16:00"}]
                """);
        crawl();

        List<RowState> afterCrawl = storedRows();
        assertThat(afterCrawl.get(0)).isEqualTo(baseline.get(0)); // 변경 없는 행은 쓰이지 않았다
        RowState changed = afterCrawl.get(1);
        assertThat(changed.id()).isEqualTo(baseline.get(1).id()); // 재삽입이 아니라 제자리 갱신
        assertThat(changed.organizationName()).isEqualTo("바뀐동아리");
        assertThat(changed.startTime()).isEqualTo(LocalTime.of(15, 0));
        assertThat(changed.endTime()).isEqualTo(LocalTime.of(16, 0));
        assertThat(changed.crawledAt()).isAfter(baseline.get(1).crawledAt()); // 변경된 행만 세대 갱신
    }

    @Test
    @DisplayName("학교 응답의 순서만 뒤바뀐 경우는 변경이 아니므로 어떤 행도 새로 쓰지 않는다")
    void reorderedCrawlWritesNothing() {
        List<RowState> baseline = crawlBaseline();

        schoolReturns("""
                [{"schedule_seq":"18135","schedule_dept":"동아리연합회",
                  "schedule_date":"02","schedule_time":"10:00~11:00"},
                 {"schedule_seq":"18134","schedule_dept":"고정관념(9:00~20:00)",
                  "schedule_date":"01","schedule_time":"19:00~20:00"}]
                """);
        crawl();

        assertThat(storedRows()).isEqualTo(baseline);
    }

    @Test
    @DisplayName("공백·자릿수 표기만 다르고 정규화하면 같은 응답은 변경이 아니므로 어떤 행도 새로 쓰지 않는다")
    void normalizedEquivalentCrawlWritesNothing() {
        List<RowState> baseline = crawlBaseline();

        // 앞뒤 공백, 일자 0 패딩 차이, 시간 구분자 주변 공백 — 파서가 정규화하면 기준과 동일한 값이 된다.
        // 18135 는 운영시간 꼬리가 없어 reserved_* 가 null 인 채로 비교된다(null 비교 회귀).
        schoolReturns("""
                [{"schedule_seq":" 18134 ","schedule_dept":"  고정관념 (9:00~20:00)  ",
                  "schedule_date":" 1 ","schedule_time":" 19:00 ~ 20:00 "},
                 {"schedule_seq":"18135","schedule_dept":"  동아리연합회  ",
                  "schedule_date":" 02 ","schedule_time":"10:00~11:00 "}]
                """);
        crawl();

        assertThat(storedRows()).isEqualTo(baseline);
    }

    @Test
    @DisplayName("기본 확보 시간 대상 분류는 재크롤이 반복되어도 유지된다 — 분류는 저장값이 아니라 플래그 파생값이다")
    void securedClassificationSurvivesRecrawl() {
        Club securedClub = clubRepository.save(Club.create("고정관념", ClubCategory.OTHER, "분과", "설명", null));
        securedClub.changeFacilitySecuredTimeTarget(true);
        clubRepository.save(securedClub);
        crawlBaseline(); // 18134 = "고정관념(9:00~20:00)" 확장 행

        assertThat(availabilityPolicy.classify(storedRow(18134L), availabilityPolicy.securedOrganizationKeys()))
                .isEqualTo(CrawlRowType.BASIC_SECURED_TIME);

        crawl(); // 동일 응답 재크롤 — CRAWLED_RESERVATION 으로 초기화되면 안 된다

        assertThat(availabilityPolicy.classify(storedRow(18134L), availabilityPolicy.securedOrganizationKeys()))
                .isEqualTo(CrawlRowType.BASIC_SECURED_TIME);
        // 미매칭 행은 재크롤과 무관하게 CRAWLED_RESERVATION(차단 기본값)이다.
        assertThat(availabilityPolicy.classify(storedRow(18135L), availabilityPolicy.securedOrganizationKeys()))
                .isEqualTo(CrawlRowType.CRAWLED_RESERVATION);
    }

    private FacilityReservation storedRow(long scheduleSeq) {
        return reservationRepository.findByFacilityIdAndYearMonth(facility.getId(), targetMonth).stream()
                .filter(row -> row.getScheduleSeq() == scheduleSeq)
                .findFirst()
                .orElseThrow();
    }

    @Test
    @DisplayName("크롤이 실패하면 기존 예약 데이터를 그대로 유지하고 월 메타만 실패로 남긴다")
    void failedCrawlKeepsExistingRows() {
        List<RowState> baseline = crawlBaseline();

        when(schoolFacilityClient.fetchReservations(anyInt(), eq(targetMonth)))
                .thenThrow(new FacilityFetchException("5xx 소진"));
        crawl();

        assertThat(storedRows()).isEqualTo(baseline); // fail-safe: 빈 스냅샷으로 덮어쓰지 않는다
        FacilityMonthSnapshot snapshot = snapshotRepository.findByYearMonth(targetMonth).orElseThrow();
        assertThat(snapshot.getFetchStatus()).isEqualTo(FetchStatus.FAILED);
    }

    @Test
    @DisplayName("예약이 월 경계를 넘어 옮겨지면 옛 월의 행이 지워지고 새 월에 새로 저장된다 — schedule_seq 자기 충돌 없이")
    void reservationMovedAcrossMonthsIsDeletedThenReinserted() {
        List<RowState> baseline = crawlBaseline(); // 당월에 18134(1일)·18135(2일)
        YearMonth nextMonth = targetMonth.plusMonths(1);

        // 18134 가 당월에서 빠지고 익월로 옮겨진 상태(말일 예약이 다음 달로 연기되는 실사용 시나리오)를
        // 한 수집 세대에서 함께 본다. schedule_seq 는 전역 UNIQUE 라, 익월 INSERT 가 당월 DELETE 보다
        // 먼저 나가면 자기 자신과 충돌해 그 시설 트랜잭션이 통째로 롤백된다(fail-safe 라 조용히 매 주기 반복).
        schoolReturns(targetMonth, """
                [{"schedule_seq":"18135","schedule_dept":"동아리연합회",
                  "schedule_date":"02","schedule_time":"10:00~11:00"}]
                """);
        schoolReturns(nextMonth, """
                [{"schedule_seq":"18134","schedule_dept":"고정관념(9:00~20:00)",
                  "schedule_date":"03","schedule_time":"19:00~20:00"}]
                """);

        crawlService.crawlAndReplace(List.of(targetMonth, nextMonth), CrawlSource.SCHEDULER);

        // 옛 월: 옮겨간 행만 사라지고 남은 행은 쓰이지 않았다(지문 불변).
        assertThat(storedRows(targetMonth)).containsExactly(baseline.get(1));
        // 새 월: 같은 schedule_seq 가 신규 행으로 들어갔다(제자리 갱신이 아니라 신규 — 옛 행 id 와 다르다).
        List<RowState> movedRows = storedRows(nextMonth);
        assertThat(movedRows).hasSize(1);
        assertThat(movedRows.get(0).scheduleSeq()).isEqualTo(18134L);
        assertThat(movedRows.get(0).id()).isNotEqualTo(baseline.get(0).id());
        assertThat(movedRows.get(0).startTime()).isEqualTo(LocalTime.of(9, 0)); // 꼬리 전 구간 확장(전면 차단 정책)
        assertThat(movedRows.get(0).endTime()).isEqualTo(LocalTime.of(20, 0));
        // unique 충돌 롤백이 없었음의 증명 — 두 달 모두 SUCCESS 이고 시설이 세대 성공 집합에 들어 있다.
        for (YearMonth crawledMonth : List.of(targetMonth, nextMonth)) {
            FacilityMonthSnapshot monthSnapshot = snapshotRepository.findByYearMonth(crawledMonth).orElseThrow();
            assertThat(monthSnapshot.getFetchStatus()).isEqualTo(FetchStatus.SUCCESS);
            assertThat(monthSnapshot.isFacilitySynced(facility.getId())).isTrue();
        }
    }

    @Test
    @DisplayName("크롤 윈도우 밖 과거 월에 같은 schedule_seq 행이 남아 있어도 윈도우 안으로 옮겨온 예약이 충돌 없이 반영된다")
    void reservationMovedIntoWindowFromOutsideResolvesStaleRow() {
        // 크롤 윈도우는 당월·익월뿐이라 지지난달 행은 차등 비교 대상에 아예 들어오지 않는다.
        // 그 상태로 같은 schedule_seq 를 INSERT 하면 전역 UNIQUE 와 충돌해 이 시설 트랜잭션이 롤백되고,
        // fail-safe 라 조용히 매 주기 같은 충돌이 반복된다(수동 개입 전까지 수집·자동 확정 영구 정지).
        YearMonth outsideWindowMonth = targetMonth.minusMonths(2);
        FacilityReservation staleRow = reservationRepository.save(FacilityReservation.create(
                facility.getId(), 18134L, outsideWindowMonth, outsideWindowMonth.atDay(10),
                LocalTime.of(9, 0), LocalTime.of(10, 0), "고정관념",
                LocalDateTime.now().minusDays(30)));

        schoolReturns(BASELINE_PAYLOAD); // 같은 18134 가 당월 1일 예약으로 들어온다
        crawl();

        assertThat(reservationRepository.findById(staleRow.getId())).isEmpty(); // 잔존 행은 해소됐다
        List<RowState> afterCrawl = storedRows();
        assertThat(afterCrawl).hasSize(2);
        assertThat(afterCrawl.get(0).scheduleSeq()).isEqualTo(18134L);
        assertThat(afterCrawl.get(0).startTime()).isEqualTo(LocalTime.of(9, 0)); // 옮겨온 새 값(꼬리 전 구간 확장)으로 반영
        assertThat(reservationRepository.findByFacilityIdAndYearMonth(facility.getId(), outsideWindowMonth)).isEmpty();
        // unique 충돌 롤백이 없었음의 증명 — 월 메타가 SUCCESS 이고 시설이 세대 성공 집합에 들어 있다.
        FacilityMonthSnapshot snapshot = snapshotRepository.findByYearMonth(targetMonth).orElseThrow();
        assertThat(snapshot.getFetchStatus()).isEqualTo(FetchStatus.SUCCESS);
        assertThat(snapshot.isFacilitySynced(facility.getId())).isTrue();
    }

    @Test
    @DisplayName("수집에 성공한 시설은 그 세대의 성공 집합에 기록된다 — 자동 확정의 세대 결박 근거")
    void successfulCrawlRecordsFacilityInGeneration() {
        crawlBaseline();

        FacilityMonthSnapshot snapshot = snapshotRepository.findByYearMonth(targetMonth).orElseThrow();
        assertThat(snapshot.getFetchStatus()).isEqualTo(FetchStatus.SUCCESS);
        assertThat(snapshot.isFacilitySynced(facility.getId())).isTrue();
        assertThat(snapshot.isFacilitySynced(facility.getId() + 1)).isFalse();
    }
}
