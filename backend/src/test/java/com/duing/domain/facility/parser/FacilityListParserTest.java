package com.duing.domain.facility.parser;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FacilityListParserTest {

    private final FacilityListParser parser = new FacilityListParser();

    private Document loadFixture() throws IOException {
        try (InputStream in = getClass().getResourceAsStream("/facility/room_detail.html")) {
            String html = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            return Jsoup.parse(html);
        }
    }

    @Test
    @DisplayName("실측 HTML 에서 10개 시설을 room_seq·이름·위치로 파싱한다(불연속 room_seq 포함)")
    void parsesTenFacilities() throws IOException {
        List<ParsedFacility> facilities = parser.parse(loadFixture());

        assertThat(facilities).hasSize(10);
        assertThat(facilities).extracting(ParsedFacility::roomSeq)
                .containsExactly(1, 2, 3, 4, 6, 22, 41, 82, 102, 143);
    }

    @Test
    @DisplayName("room_seq 4 는 공동연습실(1)/2105 로, 커뮤니티룸(1) 은 1503호 로 위치가 분리된다")
    void splitsRoomNameAndLocation() throws IOException {
        Map<Integer, ParsedFacility> byRoomSeq = parser.parse(loadFixture()).stream()
                .collect(Collectors.toMap(ParsedFacility::roomSeq, Function.identity()));

        assertThat(byRoomSeq.get(4).roomName()).isEqualTo("공동연습실(1)");
        assertThat(byRoomSeq.get(4).location()).isEqualTo("2105");
        assertThat(byRoomSeq.get(1).roomName()).isEqualTo("커뮤니티룸(1)");
        assertThat(byRoomSeq.get(1).location()).isEqualTo("1503호");
        // sortOrder 는 탭 순서(첫 탭 = 0)
        assertThat(byRoomSeq.get(1).sortOrder()).isZero();
    }

    @Test
    @DisplayName("위치가 없는 시설(빛광장)은 location=null 이고 자유광장(노천강당)은 괄호를 분리하지 않는다")
    void nullLocationAndNoSplitForNonNumericParen() throws IOException {
        Map<Integer, ParsedFacility> byRoomSeq = parser.parse(loadFixture()).stream()
                .collect(Collectors.toMap(ParsedFacility::roomSeq, Function.identity()));

        assertThat(byRoomSeq.get(22).roomName()).isEqualTo("빛광장");
        assertThat(byRoomSeq.get(22).location()).isNull();
        assertThat(byRoomSeq.get(41).roomName()).isEqualTo("자유광장(노천강당)");
        assertThat(byRoomSeq.get(41).location()).isNull();
        // room_82/102 는 공동연습실(2)/(4) — 실측 매핑(번호가 room_seq 순서와 불일치) 고정
        assertThat(byRoomSeq.get(82).roomName()).isEqualTo("공동연습실(2)");
        assertThat(byRoomSeq.get(82).location()).isEqualTo("2107");
        assertThat(byRoomSeq.get(102).roomName()).isEqualTo("공동연습실(4)");
        assertThat(byRoomSeq.get(102).location()).isEqualTo("1506호");
    }
}
