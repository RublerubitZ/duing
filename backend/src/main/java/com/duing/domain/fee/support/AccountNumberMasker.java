package com.duing.domain.fee.support;

import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 계좌번호를 화면 노출용으로 마스킹한다. 어드민 화면은 모든 동아리 계좌를 보므로,
 * 서버에서 끝 4자리만 남기고 앞을 가려(****) 전체 계좌번호 평문이 클라이언트로 나가지 않게 한다.
 */
@Component
public class AccountNumberMasker {

    private static final int VISIBLE_TAIL = 4;
    private static final String MASK_PREFIX = "****";

    /**
     * 계좌번호에서 숫자만 추출해 끝 4자리만 노출한다(예: {@code 352-1234-5678-90 -> ****7890}).
     * 숫자가 4자리 이하이거나 입력이 비어 있으면 전체를 {@code ****} 로 가린다.
     */
    public String mask(String accountNumber) {
        if (!StringUtils.hasText(accountNumber)) {
            return MASK_PREFIX;
        }
        String digitsOnly = accountNumber.replaceAll("\\D", "");
        if (digitsOnly.length() <= VISIBLE_TAIL) {
            return MASK_PREFIX;
        }
        return MASK_PREFIX + digitsOnly.substring(digitsOnly.length() - VISIBLE_TAIL);
    }
}
