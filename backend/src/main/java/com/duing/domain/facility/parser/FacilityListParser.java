package com.duing.domain.facility.parser;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.stereotype.Component;

/**
 * 시설 탭 목록 HTML → List&lt;ParsedFacility&gt;. {@code li[id^=room_]} 만 읽는다.
 *
 * <p>위치 분리 규칙(§2.1): 이름 문자열의 마지막 괄호 그룹이 {@code \d+호?}(숫자+선택적 '호', 순수 숫자 포함)
 * 이면 location 으로 분리하고, 그 외(예: '자유광장(노천강당)')는 전체를 roomName 으로 둔다. 괄호가 없으면
 * location 은 null.
 */
@Slf4j
@Component
public class FacilityListParser {

    private static final String ROOM_ID_PREFIX = "room_";
    private static final Pattern TRAILING_PAREN = Pattern.compile("\\(([^()]*)\\)\\s*$");
    private static final Pattern LOCATION_CONTENT = Pattern.compile("\\d+호?");

    public List<ParsedFacility> parse(Document document) {
        List<ParsedFacility> result = new ArrayList<>();
        int sortOrder = 0;
        for (Element li : document.select("li[id^=" + ROOM_ID_PREFIX + "]")) {
            Integer roomSeq = parseRoomSeq(li.id());
            if (roomSeq == null) {
                continue; // room_ 뒤가 숫자가 아니면 시설 탭이 아님 — 스킵
            }
            String fullName = extractName(li);
            if (fullName.isBlank()) {
                continue;
            }
            ParsedFacility facility = split(roomSeq, fullName, sortOrder);
            result.add(facility);
            sortOrder++;
        }
        return result;
    }

    private Integer parseRoomSeq(String id) {
        String seqText = id.substring(ROOM_ID_PREFIX.length());
        try {
            return Integer.parseInt(seqText.trim());
        } catch (NumberFormatException notNumeric) {
            return null;
        }
    }

    private String extractName(Element li) {
        Element anchor = li.selectFirst("a");
        if (anchor != null && !anchor.text().isBlank()) {
            return anchor.text().trim();
        }
        Element heading = li.selectFirst("h3");
        return heading == null ? "" : heading.text().trim();
    }

    private ParsedFacility split(int roomSeq, String fullName, int sortOrder) {
        Matcher matcher = TRAILING_PAREN.matcher(fullName);
        if (matcher.find()) {
            String content = matcher.group(1).trim();
            if (LOCATION_CONTENT.matcher(content).matches()) {
                String roomName = fullName.substring(0, matcher.start()).trim();
                return new ParsedFacility(roomSeq, roomName, content, sortOrder);
            }
        }
        return new ParsedFacility(roomSeq, fullName, null, sortOrder);
    }
}
