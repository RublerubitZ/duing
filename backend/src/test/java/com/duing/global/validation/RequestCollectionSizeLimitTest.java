package com.duing.global.validation;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.club.controller.dto.request.ReorderClubPhotosRequest;
import com.duing.domain.club.controller.dto.request.ReorderClubPhotosRequest.PhotoOrderItem;
import com.duing.domain.club.controller.dto.request.ReorderHeroActivitiesRequest;
import com.duing.domain.club.controller.dto.request.ReorderHeroActivitiesRequest.HeroOrderItem;
import com.duing.domain.facilitysubmission.controller.dto.request.CreateSubmissionBatchRequest;
import com.duing.domain.federation.controller.dto.request.CreateFederationInquiryRequest;
import com.duing.domain.federation.controller.dto.request.UpdateFederationInquiryRequest;
import com.duing.domain.interview.controller.dto.request.CreateInterviewRoundRequest;
import com.duing.domain.interview.controller.dto.request.CreateInterviewSlotsRequest;
import com.duing.domain.interview.controller.dto.request.CreateInterviewSlotsRequest.SlotItem;
import com.duing.domain.interview.controller.dto.request.RespondInterviewAvailabilityRequest;
import com.duing.domain.notice.controller.dto.request.CreateNoticeRequest;
import com.duing.domain.notice.controller.dto.request.UpdateNoticeRequest;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.function.IntFunction;
import java.util.function.Predicate;
import java.util.stream.IntStream;
import java.util.stream.LongStream;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * 요청 리스트 개수 상한·첨부 주소 원소 길이 상한(#1322 F-5).
 *
 * <p>판정은 그 필드 경로의 위반만 본다 — 다른 구성 요소는 null 로 둬도 되고, 리스트 원소는 원소 제약을 통과하는 값으로 채운다.
 * 리스트 상한은 경로가 필드명과 같은 위반, 원소 상한은 {@code 필드명[} 로 시작하는 위반이다({@code 필드명} 접두로 고르면
 * {@code items[0].photoId} 같은 원소 위반까지 섞인다).
 */
class RequestCollectionSizeLimitTest {

    private static final LocalDateTime SLOT_START = LocalDateTime.of(2026, 3, 2, 10, 0);

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    private static Stream<SizeLimitCase> sizeLimitCases() {
        return Stream.of(
                listCase("CreateInterviewSlotsRequest.slots", "slots", 500,
                        "한 번에 만들 수 있는 면접 슬롯은 500개 이하입니다.",
                        count -> new CreateInterviewSlotsRequest(
                                Collections.nCopies(count, new SlotItem(SLOT_START, SLOT_START.plusMinutes(30), 1)))),
                listCase("CreateInterviewRoundRequest.applicationIds", "applicationIds", 500,
                        "한 번에 지정할 수 있는 지원 수는 500건 이하입니다.",
                        count -> new CreateInterviewRoundRequest("1차 면접", null, null, ids(count))),
                listCase("RespondInterviewAvailabilityRequest.slotIds", "slotIds", 500,
                        "선택할 수 있는 면접 시간은 500개 이하입니다.",
                        count -> new RespondInterviewAvailabilityRequest(ids(count), null, null)),
                listCase("CreateSubmissionBatchRequest.bookingIds", "bookingIds", 500,
                        "한 번에 제출할 수 있는 예약은 500건 이하입니다.",
                        count -> new CreateSubmissionBatchRequest(ids(count), null)),
                listCase("ReorderClubPhotosRequest.items", "items", 500,
                        "정렬 목록은 500개 이하여야 합니다.",
                        count -> new ReorderClubPhotosRequest(IntStream.range(0, count)
                                .mapToObj(index -> new PhotoOrderItem((long) index + 1, index))
                                .toList())),
                listCase("ReorderHeroActivitiesRequest.items", "items", 6,
                        "대표 활동은 6개 이하여야 합니다.",
                        // 원소 displayOrder 는 1~6 이어야 한다 — 7건째도 범위 안으로 돌린다.
                        count -> new ReorderHeroActivitiesRequest(IntStream.range(0, count)
                                .mapToObj(index -> new HeroOrderItem((long) index + 1, index % 6 + 1))
                                .toList())),
                listCase("CreateNoticeRequest.targetClubIds", "targetClubIds", 500,
                        "대상 동아리는 500개 이하여야 합니다.",
                        count -> new CreateNoticeRequest(null, null, null, null, null, null, null, null, null,
                                ids(count), false, null, false, null, null, null, null, null, null)),
                listCase("UpdateNoticeRequest.targetClubIds", "targetClubIds", 500,
                        "대상 동아리는 500개 이하여야 합니다.",
                        count -> new UpdateNoticeRequest(null, null, null, null, null, null, null, null, null, null,
                                ids(count), null, null, null, null, null, null, null, null, null, null, null)),
                elementCase("CreateFederationInquiryRequest.attachmentUrls 원소", "attachmentUrls", 500,
                        "첨부 주소는 500자 이하여야 합니다.",
                        length -> new CreateFederationInquiryRequest(null, null, List.of("a".repeat(length)))),
                elementCase("UpdateFederationInquiryRequest.attachmentUrls 원소", "attachmentUrls", 500,
                        "첨부 주소는 500자 이하여야 합니다.",
                        length -> new UpdateFederationInquiryRequest(null, null, List.of("a".repeat(length)))));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("sizeLimitCases")
    @DisplayName("상한 개수(원소는 상한 길이)는 그 필드 위반이 없다")
    void sizeAtLimitHasNoViolationOnField(SizeLimitCase sizeLimitCase) {
        assertThat(violationMessagesOnField(sizeLimitCase, sizeLimitCase.limit())).isEmpty();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("sizeLimitCases")
    @DisplayName("상한을 넘으면 그 필드에 안내 문구가 실린다")
    void sizeOverLimitCarriesMessageOnField(SizeLimitCase sizeLimitCase) {
        assertThat(violationMessagesOnField(sizeLimitCase, sizeLimitCase.limit() + 1))
                .containsExactly(sizeLimitCase.message());
    }

    private List<String> violationMessagesOnField(SizeLimitCase sizeLimitCase, int size) {
        return validator.validate(sizeLimitCase.requestOfSize().apply(size)).stream()
                .filter(violation -> sizeLimitCase.onField().test(violation.getPropertyPath().toString()))
                .map(ConstraintViolation::getMessage)
                .toList();
    }

    private static SizeLimitCase listCase(String name, String fieldName, int limit, String message,
                                          IntFunction<Object> requestOfCount) {
        return new SizeLimitCase(name, limit, message, propertyPath -> propertyPath.equals(fieldName), requestOfCount);
    }

    private static SizeLimitCase elementCase(String name, String fieldName, int limit, String message,
                                             IntFunction<Object> requestOfElementLength) {
        return new SizeLimitCase(name, limit, message,
                propertyPath -> propertyPath.startsWith(fieldName + "["), requestOfElementLength);
    }

    private static List<Long> ids(int count) {
        return LongStream.rangeClosed(1, count).boxed().toList();
    }

    private record SizeLimitCase(String name, int limit, String message, Predicate<String> onField,
                                 IntFunction<Object> requestOfSize) {

        @Override
        public String toString() {
            return name;
        }
    }
}
