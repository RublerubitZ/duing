package com.duing.domain.federation.service;

import com.duing.domain.federation.repository.FederationFaqSearchMissRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Locale;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

/**
 * 총동연 FAQ 공개 검색 무결과(0건) 키워드를 별도 트랜잭션에서 집계 기록한다.
 *
 * <p><b>왜 컨트롤러에서 호출하는가</b>: 호출부인 {@link GeneralFederationFaqService} 는 클래스 레벨
 * {@code @Transactional(readOnly = true)} 다. 그 트랜잭션 안에서 이 기록을 시도하면 readOnly 함정
 * ({@code readonly_tx_readthrough_trap} 참고) 뿐 아니라, 바깥 readOnly 트랜잭션이 커넥션 하나를 쥔 채
 * 이 기록용 REQUIRES_NEW 트랜잭션이 두 번째 커넥션을 요구하는 이중 점유가 생긴다. 무결과 검색이
 * 커넥션 풀 크기만큼 동시에 몰리면 전원이 두 번째 커넥션을 기다리며 지연되므로(비로그인 공개 API의
 * 지연성 DoS 표면), 검색 서비스가 readOnly 트랜잭션을 커밋하고 커넥션을 반납한 뒤인 컨트롤러 계층에서
 * 이 레코더를 호출한다.
 *
 * <p><b>왜 {@code @Transactional} 대신 {@link TransactionTemplate} 인가</b>: 어노테이션 방식은 커밋
 * 시점 예외가 프록시 밖(호출부)으로 새어나가므로 호출부가 별도 try/catch 를 갖춰야 한다. 이 메서드는
 * {@link TransactionTemplate#executeWithoutResult} 호출 자체를 감싸 커밋 실패까지 이 메서드 안에서
 * 흡수한다. 또한 어노테이션은 프록시 경유 호출에만 적용되므로 자기호출(self-invocation)로 우회되는
 * 문제가 원천적으로 없다.
 *
 * <p><b>REQUIRES_NEW 는 백스톱</b>: 지금은 호출부가 트랜잭션 밖(컨트롤러)이라 새 트랜잭션을 그냥 열어도
 * 되지만, propagation 을 REQUIRES_NEW 로 명시해둬 미래에 누군가 이 메서드를 트랜잭션(특히 readOnly)
 * 안에서 호출하더라도 항상 독립된 쓰기 트랜잭션이 보장되도록 한다.
 *
 * <p><b>검색 가용성 불변식</b>: 기록 실패는 절대 검색 응답을 깨지 않는다(신호 유실 < 검색 가용성).
 * 정규화·길이 검증 실패는 조용히 무시하고, 트랜잭션 실행 중 예외는 warn 로그만 남기고 삼킨다.
 *
 * <p><b>IP 레이트리밋</b>: 같은 키워드 반복은 UNIQUE + ON CONFLICT 가 카운트 증가로 흡수하지만,
 * 서로 다른 랜덤 키워드를 대량 생성하면 고유 키워드 수만큼 행이 늘어난다. 그 축만
 * {@link FederationFaqSearchMissRateLimiter} 로 캡한다 — 위 불변식 때문에 429 를 던지지 않고 기록만
 * 건너뛴다(근거는 리미터 Javadoc). 리밋은 <b>실제로 기록될 요청</b>에만 적용해야 하므로 판정 순서를
 * {@code resultCount → 정규화·길이 → 리미터 → 트랜잭션} 으로 고정한다: 결과가 있는 검색이나 keyword
 * 없는 목록 조회가 창을 소모하면 정상 사용자가 자기 예산을 태워 무결과 기록이 조용히 멈춘다.
 *
 * <p>ponytail: IP 레이트리밋만 적용 — 분산 IP 공격으로 행이 계속 늘어 상한이 필요해지면 그때 추가한다.
 * (행 상한 SQL 은 도달 시 진짜 새 키워드가 조용히 유실되는 실패 모드가 있어 지금은 두지 않는다.)
 */
@Slf4j
@Component
public class FederationFaqSearchMissRecorder {

    private static final int MAX_KEYWORD_LENGTH = 100;

    private final FederationFaqSearchMissRepository searchMissRepository;
    private final FederationFaqSearchMissRateLimiter searchMissRateLimiter;
    private final Clock clock;
    private final TransactionTemplate transactionTemplate;

    public FederationFaqSearchMissRecorder(
            FederationFaqSearchMissRepository searchMissRepository,
            FederationFaqSearchMissRateLimiter searchMissRateLimiter,
            Clock clock,
            PlatformTransactionManager platformTransactionManager) {
        this.searchMissRepository = searchMissRepository;
        this.searchMissRateLimiter = searchMissRateLimiter;
        this.clock = clock;
        this.transactionTemplate = new TransactionTemplate(platformTransactionManager);
        this.transactionTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    // resultCount가 0이 아니면 기록하지 않는다. keyword 정규화(trim → 연속 공백 압축 → lower) 후
    // blank이거나 100자를 넘으면 역시 기록하지 않는다. 그 둘을 통과해 실제로 기록될 요청만 IP 창을
    // 소모하며, 창을 넘긴 요청은 예외 없이 기록만 건너뛴다. 트랜잭션 실행 중 예외는 여기서 흡수해
    // 호출부(컨트롤러)의 응답 흐름에 영향을 주지 않는다.
    public void recordIfMissed(String searchedKeyword, long resultCount, String clientIp) {
        if (resultCount != 0) {
            return;
        }
        String normalizedKeyword = normalize(searchedKeyword);
        if (!StringUtils.hasText(normalizedKeyword) || normalizedKeyword.length() > MAX_KEYWORD_LENGTH) {
            return;
        }
        if (!searchMissRateLimiter.allowAndRecord(clientIp, LocalDateTime.now(clock))) {
            return;
        }
        try {
            transactionTemplate.executeWithoutResult(status -> searchMissRepository.upsertByKeyword(normalizedKeyword));
        } catch (Exception recordingFailure) {
            log.warn("FAQ 무결과 검색어 기록 실패 - keyword={}", searchedKeyword, recordingFailure);
        }
    }

    // strip + 연속 공백 1개 압축 + lower — 대소문자·공백 변형이 한 행으로 모이도록 정규화한다.
    // 유니코드 공백(NBSP 등 \p{Z}) 포함 — FederationFaqSearchCondition의 정규화와 동일한 형태를 유지해야 한다.
    private String normalize(String rawKeyword) {
        if (rawKeyword == null) {
            return "";
        }
        return rawKeyword.strip().replaceAll("[\\s\\p{Z}]+", " ").toLowerCase(Locale.ROOT);
    }
}
