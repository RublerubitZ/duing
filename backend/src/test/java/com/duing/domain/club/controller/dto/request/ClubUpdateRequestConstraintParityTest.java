package com.duing.domain.club.controller.dto.request;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import jakarta.validation.metadata.ConstraintDescriptor;
import jakarta.validation.metadata.ContainerElementTypeDescriptor;
import jakarta.validation.metadata.PropertyDescriptor;
import java.lang.reflect.Array;
import java.lang.reflect.RecordComponent;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Map;
import java.util.Set;
import java.util.StringJoiner;
import java.util.TreeSet;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * 리더 수정({@link UpdateClubRequest})과 총동연 수정({@link AdminUpdateClubRequest})은 같은 프로필 필드를 받는데
 * 두 record 가 제약을 각자 들고 있어, 한쪽만 완화·강화해도 컴파일은 통과하고 권한별 통과 기준만 조용히 갈라진다.
 * 값 상수는 {@link ClubProfileValidationRules} 로 모았지만 "상수를 실제로 양쪽에 붙였는지"는 컴파일러가 봐주지 않으므로,
 * 검증 메타데이터를 직접 비교해 고정한다. 메시지도 비교 대상이다 — 같은 규칙인데 문구가 갈리면 그것도 드리프트다.
 */
class ClubUpdateRequestConstraintParityTest {

    /** 두 요청이 공유하는 필드 중 검증 제약이 붙은 것 전부. */
    private static final Set<String> SHARED_CONSTRAINED_FIELDS = Set.of(
            "logoUrl", "coverUrl", "tags", "snsLinks", "faqs",
            "foundedYear", "cohortNumber", "location", "activityFrequency", "tagline",
            "highlights", "membershipFeeAmount", "feeNote", "projects", "department");

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void setUp() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void tearDown() {
        factory.close();
    }

    private static Stream<String> sharedFields() {
        return SHARED_CONSTRAINED_FIELDS.stream().sorted();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("sharedFields")
    @DisplayName("리더·총동연 프로필 수정 요청은 공유 필드의 검증 제약이 동일하다")
    void sharedFieldsCarryIdenticalConstraints(String fieldName) {
        String leaderConstraints = describeProperty(UpdateClubRequest.class, fieldName);
        String adminConstraints = describeProperty(AdminUpdateClubRequest.class, fieldName);

        assertThat(leaderConstraints)
                .as("%s 제약이 리더 요청과 총동연 요청에서 갈라졌다", fieldName)
                .isEqualTo(adminConstraints);
    }

    @Test
    @DisplayName("새로 추가된 공유 제약 필드는 동일성 검사 목록에 반드시 등록된다")
    void everySharedConstrainedFieldIsCovered() {
        // 한쪽에만 있는 필드(리더: useGeneration / 총동연: name·category·division·college·clearCollege)는
        // 애초에 교집합에 없어 제외된다. 제약 없는 공유 필드(description·activeDays·contactVisibility·feeCycle·
        // clearLogoImage·clearCoverImage)도 비교할 것이 없어 빠지지만, 나중에 제약이 붙으면 여기서 걸린다.
        Set<String> sharedConstrained = new TreeSet<>(constrainedComponentNames(UpdateClubRequest.class));
        sharedConstrained.retainAll(constrainedComponentNames(AdminUpdateClubRequest.class));

        assertThat(sharedConstrained)
                .as("공유 제약 필드가 늘거나 줄었다 — SHARED_CONSTRAINED_FIELDS 를 함께 갱신해야 한다")
                .isEqualTo(new TreeSet<>(SHARED_CONSTRAINED_FIELDS));
    }

    private static Set<String> constrainedComponentNames(Class<?> requestType) {
        Set<String> componentNames = Arrays.stream(requestType.getRecordComponents())
                .map(RecordComponent::getName)
                .collect(Collectors.toSet());

        return validator.getConstraintsForClass(requestType).getConstrainedProperties().stream()
                .map(PropertyDescriptor::getPropertyName)
                .filter(componentNames::contains)
                .collect(Collectors.toCollection(TreeSet::new));
    }

    /** 제약을 문자열로 정규화한다 — ConstraintDescriptor 는 값 동등성이 없어 직접 비교할 수 없다. */
    private static String describeProperty(Class<?> requestType, String fieldName) {
        PropertyDescriptor property = validator.getConstraintsForClass(requestType).getConstraintsForProperty(fieldName);
        if (property == null) {
            return "<제약 없음>";
        }
        return describeConstraints(property.getConstraintDescriptors())
                + describeContainerElements(property.getConstrainedContainerElementTypes());
    }

    private static String describeConstraints(Set<ConstraintDescriptor<?>> constraints) {
        return constraints.stream()
                .map(ClubUpdateRequestConstraintParityTest::describeConstraint)
                .sorted()
                .collect(Collectors.joining(", ", "[", "]"));
    }

    private static String describeConstraint(ConstraintDescriptor<?> constraint) {
        // groups/payload 는 어느 DTO 에서도 쓰지 않는 기본값 잡음이라 뺀다. message 는 비교 대상으로 남긴다.
        String attributes = constraint.getAttributes().entrySet().stream()
                .filter(attribute -> !attribute.getKey().equals("groups") && !attribute.getKey().equals("payload"))
                .sorted(Map.Entry.comparingByKey())
                .map(attribute -> attribute.getKey() + "=" + formatValue(attribute.getValue()))
                .collect(Collectors.joining(", "));

        return constraint.getAnnotation().annotationType().getSimpleName() + "(" + attributes + ")";
    }

    private static String describeContainerElements(Set<ContainerElementTypeDescriptor> containerElements) {
        if (containerElements.isEmpty()) {
            return "";
        }
        return containerElements.stream()
                .sorted(Comparator.comparing(ContainerElementTypeDescriptor::getTypeArgumentIndex))
                .map(element -> "요소[" + element.getTypeArgumentIndex() + "]"
                        + " cascaded=" + element.isCascaded()
                        + " " + describeConstraints(element.getConstraintDescriptors())
                        + describeContainerElements(element.getConstrainedContainerElementTypes()))
                .collect(Collectors.joining(", ", " {", "}"));
    }

    private static String formatValue(Object value) {
        if (value == null || !value.getClass().isArray()) {
            return String.valueOf(value);
        }
        StringJoiner elements = new StringJoiner(", ", "[", "]");
        for (int index = 0; index < Array.getLength(value); index++) {
            elements.add(formatValue(Array.get(value, index)));
        }
        return elements.toString();
    }
}
