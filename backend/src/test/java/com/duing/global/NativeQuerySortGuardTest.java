package com.duing.global;

import static java.util.stream.Collectors.joining;
import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.club.entity.Club;
import java.io.IOException;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.stream.IntStream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.AnnotatedBeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.core.MethodParameter;
import org.springframework.core.ResolvableType;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.type.classreading.MetadataReader;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.core.type.filter.AssignableTypeFilter;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.JpaSort;
import org.springframework.data.jpa.repository.NativeQuery;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.RepositoryDefinition;
import org.springframework.data.repository.util.QueryExecutionConverters;
import org.springframework.util.ClassUtils;

/**
 * 네이티브 쿼리 리포지토리 메서드가 {@link Sort}·{@link Pageable} 을 받지 못하게 막는 가드(#1318).
 *
 * <p>CVE-2026-47834(Spring Data JPA 3.5.0~3.5.13): {@code @NativeQuery}·{@code @Query(nativeQuery = true)} 메서드가
 * {@code Sort}·{@code Pageable} 로 정렬을 받고 그 값이 신뢰할 수 없는 입력에서 오면, 조작한 정렬값으로 정렬 검증을
 * 우회해 데이터 특성을 추론할 수 있다. 3.5 줄은 OSS 지원이 끝나(2026-06-30) 수정판이 Enterprise 전용이라, 이 조합이
 * 생기는 순간 도달 가능해진다. 지금 develop 의 네이티브 쿼리 메서드에는 정렬 파라미터가 없다.
 *
 * <p>정렬이 필요하면 JPQL·QueryDSL 로 쓰거나(클라이언트 정렬값은 {@code SortWhitelist} 를 거친다) 네이티브 SQL 의
 * ORDER BY 를 고정한다.
 *
 * <p>판정은 Spring Data JPA 와 같은 병합 애노테이션 조회라 {@code @NativeQuery}(메타 애노테이션
 * {@code @Query(nativeQuery = true)})와 이를 감싼 합성 애노테이션도 잡는다. 파라미터 타입도 Spring Data 처럼
 * 리포지토리 기준으로 푼다 — 제네릭 상위 인터페이스의 타입 변수와 {@code Optional} 같은 래퍼 안의 타입까지 본다.
 * 클래스 메타데이터만 보므로 Spring 컨텍스트·Testcontainers 없이 돈다(전례: {@link ClocklessNowGuardTest}).
 *
 * <p>스캔은 조건({@code @Profile}·{@code @Conditional})을 평가하지 않아 어느 환경에서 켜지는 리포지토리든 본다. 스캔 경로는
 * 위반 없는 중첩 픽스처(정의·하위 인터페이스·프로파일)가 운영 스캔에 잡히는지로 고정하고, 판정은 위반 픽스처를 직접 넘겨
 * 확인한다. 스캔 픽스처에는 메서드를 두지 않는다 — 네이티브 쿼리가 있으면 운영 리포지토리를 못 찾아도 "하나도 찾지 못했다"
 * 단언이 픽스처 덕에 통과해 버린다.
 */
class NativeQuerySortGuardTest {

    private static final String BASE_PACKAGE = "com.duing";

    @Test
    @DisplayName("네이티브 쿼리 리포지토리 메서드는 Sort·Pageable 파라미터를 받지 않는다")
    void nativeQueryRepositoryMethodsDoNotAcceptSorting() {
        List<RepositoryMethod> nativeQueryMethods = nativeQueryMethods(repositoryInterfaces());

        assertThat(nativeQueryMethods)
                .as("리포지토리에서 네이티브 쿼리 메서드를 하나도 찾지 못했다 — 스캔이 깨진 채 통과하지 않게 한다")
                .isNotEmpty();
        assertThat(describeSortable(nativeQueryMethods))
                .as("네이티브 쿼리가 Sort·Pageable 을 받으면 CVE-2026-47834 가 도달 가능해진다(#1318, 3.5 줄 OSS 수정 없음). "
                        + "정렬은 JPQL·QueryDSL 로 하거나(클라이언트 정렬값은 SortWhitelist 를 거친다) ORDER BY 를 쿼리에 고정하고, "
                        + "페이징만 필요하면 LIMIT·OFFSET 을 바인딩 파라미터로 받는다")
                .isEmpty();
    }

    @Test
    @DisplayName("Sort·Pageable 을 받는 네이티브 쿼리만 위반으로 잡고, 정렬 없는 네이티브 쿼리와 JPQL 페이징은 통과시킨다")
    void detectsOnlyNativeQueriesThatAcceptSorting() {
        List<String> violations = describeSortable(nativeQueryMethods(List.of(SortGuardFixture.class)));

        assertThat(violations).containsExactly(
                "SortGuardFixture#composedNativeWithSort(Sort)",
                "SortGuardFixture#genericNative(Pageable) — GenericSortGuardFixtureBase 에 선언",
                "SortGuardFixture#inheritedNativeWithPageable(Pageable) — SortGuardFixtureBase 에 선언",
                "SortGuardFixture#nativeWithJpaSort(JpaSort)",
                "SortGuardFixture#nativeWithOptionalSort(Optional<Sort>)",
                "SortGuardFixture#nativeWithPageRequest(PageRequest)",
                "SortGuardFixture#nativeWithPageable(Pageable)",
                "SortGuardFixture#nativeWithSort(Sort)");
    }

    @Test
    @DisplayName("리포지토리 스캔은 @RepositoryDefinition 정의·그 하위 인터페이스·프로파일이 붙은 리포지토리까지 찾는다")
    void scanFindsDefinitionsSubInterfacesAndProfiledRepositories() {
        assertThat(repositoryInterfaces()).contains(
                DefinedRepositoryScanFixture.class,
                InheritedDefinitionScanFixture.class,
                ProfiledRepositoryScanFixture.class);
    }

    /**
     * {@code com.duing} 아래 Spring Data 리포지토리 인터페이스 — {@link Repository} 상속과 {@link RepositoryDefinition}
     * 정의(그 정의를 상속한 하위 인터페이스 포함)를 모두 본다. 기본 스캐너는 인터페이스를 후보에서 거르므로 허용으로
     * 바꾼다(Spring Data 의 자체 스캐너는 공개 API 가 아니다). 조건을 평가하지 않아 프로파일·조건이 붙은 리포지토리도 본다.
     */
    private static List<Class<?>> repositoryInterfaces() {
        AssignableTypeFilter repositoryType = new AssignableTypeFilter(Repository.class);
        AnnotationTypeFilter repositoryDefinition = new AnnotationTypeFilter(RepositoryDefinition.class, true, true);
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false) {
            @Override
            protected boolean isCandidateComponent(MetadataReader metadataReader) throws IOException {
                // 조건(@Profile·@Conditional)을 평가하지 않는다 — 어느 환경에서 켜지는 리포지토리든 본다.
                return repositoryType.match(metadataReader, getMetadataReaderFactory())
                        || repositoryDefinition.match(metadataReader, getMetadataReaderFactory());
            }

            @Override
            protected boolean isCandidateComponent(AnnotatedBeanDefinition beanDefinition) {
                return beanDefinition.getMetadata().isInterface() && beanDefinition.getMetadata().isIndependent();
            }
        };
        scanner.addIncludeFilter(repositoryType);
        scanner.addIncludeFilter(repositoryDefinition);
        return scanner.findCandidateComponents(BASE_PACKAGE).stream()
                .<Class<?>>map(beanDefinition -> ClassUtils.resolveClassName(beanDefinition.getBeanClassName(), null))
                .toList();
    }

    /** 네이티브 쿼리 메서드 — 상위 인터페이스 선언 포함, 리포지토리마다 따로 본다(타입 변수가 리포지토리에서 풀리므로). */
    private static List<RepositoryMethod> nativeQueryMethods(Collection<Class<?>> repositoryTypes) {
        List<RepositoryMethod> nativeQueryMethods = new ArrayList<>();
        for (Class<?> repositoryType : repositoryTypes) {
            for (Method method : repositoryType.getMethods()) {
                Query query = AnnotatedElementUtils.findMergedAnnotation(method, Query.class);
                if (query != null && query.nativeQuery()) {
                    nativeQueryMethods.add(new RepositoryMethod(repositoryType, method));
                }
            }
        }
        return nativeQueryMethods;
    }

    /**
     * Sort·Pageable 을 받는 메서드를 {@code 리포지토리#메서드(파라미터 타입)} 로(상속받은 선언이면 끝에
     * {@code — <선언 인터페이스> 에 선언}) — 정렬해 실패 메시지를 결정적으로.
     */
    private static List<String> describeSortable(Collection<RepositoryMethod> nativeQueryMethods) {
        return nativeQueryMethods.stream()
                .filter(RepositoryMethod::acceptsSorting)
                .map(RepositoryMethod::describe)
                .distinct()
                .sorted()
                .toList();
    }

    /** 리포지토리 타입 기준으로 본 메서드 — 상위 인터페이스의 타입 변수는 이 리포지토리에서 풀린다(Spring Data 와 같다). */
    private record RepositoryMethod(Class<?> repositoryType, Method method) {

        List<ResolvableType> parameterTypes() {
            return IntStream.range(0, method.getParameterCount())
                    .mapToObj(index -> ResolvableType.forMethodParameter(
                            new MethodParameter(method, index).withContainingClass(repositoryType)))
                    .toList();
        }

        /** Spring Data 가 동적 정렬을 적용하는 파라미터 — {@code Optional} 같은 래퍼는 벗기고, 하위 타입도 포함한다. */
        boolean acceptsSorting() {
            return parameterTypes().stream().anyMatch(parameterType -> {
                Class<?> sortCarrier = QueryExecutionConverters.supportsUnwrapping(parameterType.toClass())
                        ? parameterType.getGeneric(0).toClass()
                        : parameterType.toClass();
                return Sort.class.isAssignableFrom(sortCarrier) || Pageable.class.isAssignableFrom(sortCarrier);
            });
        }

        String describe() {
            Class<?> declaringType = method.getDeclaringClass();
            return repositoryType.getSimpleName() + "#" + method.getName() + parameterTypes().stream()
                    // 패키지를 떼어 짧게: java.util.Optional<org.springframework.data.domain.Sort> → Optional<Sort>
                    .map(parameterType -> parameterType.toString().replaceAll("[\\w.]+\\.(\\w+)", "$1"))
                    .collect(joining(", ", "(", ")"))
                    // 상속받은 선언이면 실제로 고칠 인터페이스를 붙인다
                    + (declaringType == repositoryType ? "" : " — " + declaringType.getSimpleName() + " 에 선언");
        }
    }

    /** 판별력 확인용 상위 인터페이스 — 상속된 네이티브 메서드도 잡아야 한다. */
    interface SortGuardFixtureBase {

        @Query(value = "SELECT * FROM club", nativeQuery = true)
        List<Object> inheritedNativeWithPageable(Pageable pageable);
    }

    /** 판별력 확인용 제네릭 상위 인터페이스 — 타입 변수가 리포지토리에서 {@code Pageable} 로 풀리면 잡아야 한다. */
    interface GenericSortGuardFixtureBase<P> {

        @Query(value = "SELECT * FROM club", nativeQuery = true)
        List<Object> genericNative(P parameter);
    }

    /**
     * 판별력 확인용 — {@link Repository} 를 상속하지 않아 운영 리포지토리 스캔에는 걸리지 않는다. 스캔은 테스트 클래스까지
     * 보고 중첩 인터페이스는 암묵 static 이라, 상속시키면 운영 리포지토리 테스트가 이 픽스처 때문에 실패한다.
     */
    interface SortGuardFixture extends SortGuardFixtureBase, GenericSortGuardFixtureBase<Pageable> {

        @Query(value = "SELECT * FROM club", nativeQuery = true)
        List<Object> nativeWithPageable(Pageable pageable);

        @NativeQuery("SELECT * FROM club")
        List<Object> nativeWithSort(Sort sort);

        @NativeQuery("SELECT * FROM club")
        List<Object> nativeWithOptionalSort(Optional<Sort> sort);

        @FixtureNativeQuery
        List<Object> composedNativeWithSort(Sort sort);

        @NativeQuery("SELECT * FROM club")
        List<Object> nativeWithPageRequest(PageRequest pageRequest);

        @NativeQuery("SELECT * FROM club")
        List<Object> nativeWithJpaSort(JpaSort sort);

        @Query(value = "SELECT * FROM club ORDER BY id", nativeQuery = true)
        List<Object> nativeWithoutSort(Long clubId);

        @Query("SELECT club FROM Club club")
        List<Object> jpqlWithPageable(Pageable pageable);
    }

    /** 판별력 확인용 합성 애노테이션 — {@code @NativeQuery} 를 메타 애노테이션으로 단다. */
    @Retention(RetentionPolicy.RUNTIME)
    @Target(ElementType.METHOD)
    @NativeQuery("SELECT * FROM club")
    @interface FixtureNativeQuery {
    }

    /** 스캔 경로 고정 — {@code @RepositoryDefinition} 정의를 찾는다. 중첩이라 Spring Data 는 빈으로 등록하지 않는다. */
    @RepositoryDefinition(domainClass = Club.class, idClass = Long.class)
    interface DefinedRepositoryScanFixture {
    }

    /** 스캔 경로 고정 — 정의를 상속한 하위 인터페이스도 찾는다. 중첩이라 Spring Data 는 빈으로 등록하지 않는다. */
    interface InheritedDefinitionScanFixture extends DefinedRepositoryScanFixture {
    }

    /** 스캔 경로 고정 — 켜지지 않는 프로파일이 붙어도 찾는다(조건 미평가). 중첩이라 Spring Data 는 빈으로 등록하지 않는다. */
    @Profile("native-query-sort-guard-never")
    @RepositoryDefinition(domainClass = Club.class, idClass = Long.class)
    interface ProfiledRepositoryScanFixture {
    }
}
