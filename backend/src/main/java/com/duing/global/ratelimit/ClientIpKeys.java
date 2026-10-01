package com.duing.global.ratelimit;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.regex.Pattern;

/**
 * 클라이언트 IP 를 레이트리밋 키로 정규화한다 — IPv6 는 /64 접두로 묶는다.
 *
 * <p>IPv6 는 한 사용자가 자기 /64 안에서 주소를 사실상 무제한으로 바꿀 수 있어, 주소 전체를 키로 쓰면
 * 주소마다 새 창이 생겨 IP 창이 무력해진다. 그래서 앞 64비트만 남긴 한 가지 표기로 묶는다 — 압축·대소문자·
 * zone index 가 달라도 같은 /64 면 같은 키다. IPv4 는 그대로, IPv4-mapped IPv6 는 IPv4 주소로 바꾼다.
 *
 * <p>IP 리터럴이 아니거나 null·빈 값이면 받은 그대로 돌려준다. DNS 조회는 하지 않는다 — 허용 문자를 먼저
 * 검사하고, 대괄호로 감싼 리터럴만 {@link InetAddress#getByName} 에 넘긴다(JDK 는 대괄호 입력을 IPv6
 * 리터럴로만 해석하고, 아니면 조회 없이 예외를 던진다).
 *
 * <p>리미터 키에만 쓴다. 로그·감사에 남기는 IP 는 원본 그대로다.
 */
public final class ClientIpKeys {

    private static final Pattern IPV6_LITERAL_CHARS = Pattern.compile("[0-9A-Fa-f:.]+");
    private static final int PREFIX_BYTES = 8;

    private ClientIpKeys() {
    }

    public static String normalize(String clientIp) {
        if (clientIp == null) {
            return null;
        }
        int zoneStart = clientIp.indexOf('%');
        String literal = zoneStart < 0 ? clientIp : clientIp.substring(0, zoneStart);
        if (literal.indexOf(':') < 0 || !IPV6_LITERAL_CHARS.matcher(literal).matches()) {
            return clientIp;
        }
        try {
            InetAddress address = InetAddress.getByName("[" + literal + "]");
            if (address instanceof Inet4Address) {
                return address.getHostAddress();
            }
            byte[] prefix = address.getAddress();
            Arrays.fill(prefix, PREFIX_BYTES, prefix.length, (byte) 0);
            return InetAddress.getByAddress(prefix).getHostAddress() + "/64";
        } catch (UnknownHostException invalidLiteral) {
            return clientIp;
        }
    }
}
