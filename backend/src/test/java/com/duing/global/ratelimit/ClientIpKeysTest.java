package com.duing.global.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class ClientIpKeysTest {

    private static final String SLASH_64_KEY = "2001:db8:abcd:12:0:0:0:0/64";

    @Test
    @DisplayName("IPv4 주소는 그대로 키가 된다")
    void ipv4IsKeptAsIs() {
        assertThat(ClientIpKeys.normalize("203.0.113.7")).isEqualTo("203.0.113.7");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "2001:db8:abcd:12::1",
            "2001:0DB8:ABCD:0012:FFFF:0000:0000:FFFF",
            "2001:db8:abcd:12:aBcD:1:2:3",
            "2001:db8:abcd:12:0:0:0:0"
    })
    @DisplayName("같은 /64 의 IPv6 주소는 압축·대소문자가 달라도 같은 /64 키가 된다")
    void ipv6InSameSlash64SharesOneKey(String clientIp) {
        assertThat(ClientIpKeys.normalize(clientIp)).isEqualTo(SLASH_64_KEY);
    }

    @Test
    @DisplayName("/64 가 다르면 뒤 64비트가 같아도 다른 키가 된다")
    void differentSlash64GetsDifferentKey() {
        assertThat(ClientIpKeys.normalize("2001:db8:abcd:13::1")).isNotEqualTo(SLASH_64_KEY);
    }

    @ParameterizedTest
    @ValueSource(strings = {"::ffff:1.2.3.4", "::FFFF:102:304", "0:0:0:0:0:ffff:1.2.3.4"})
    @DisplayName("IPv4-mapped IPv6 주소는 IPv4 주소 키가 된다")
    void ipv4MappedIpv6BecomesIpv4(String clientIp) {
        assertThat(ClientIpKeys.normalize(clientIp)).isEqualTo("1.2.3.4");
    }

    @Test
    @DisplayName("IPv6 루프백은 압축 표기와 톰캣의 풀어 쓴 표기가 같은 /64 키가 된다")
    void ipv6LoopbackSharesKeyAcrossNotations() {
        assertThat(ClientIpKeys.normalize("::1")).isEqualTo("0:0:0:0:0:0:0:0/64");
        assertThat(ClientIpKeys.normalize("0:0:0:0:0:0:0:1")).isEqualTo("0:0:0:0:0:0:0:0/64");
    }

    @ParameterizedTest
    @ValueSource(strings = {"fe80::1%en0", "fe80::abcd%1", "FE80:0:0:0:1:2:3:4%eth0"})
    @DisplayName("zone index 는 떼고 /64 키로 묶는다")
    void zoneIndexIsDropped(String clientIp) {
        assertThat(ClientIpKeys.normalize(clientIp)).isEqualTo("fe80:0:0:0:0:0:0:0/64");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {
            "unknown",
            "localhost",
            "not:an:ip",
            "2001:db8::1::2",
            "[2001:db8::1]",
            "1.2.3.4:8080",
            "2001:db8:abcd:12::1 "
    })
    @DisplayName("IP 리터럴이 아니거나 null·빈 값이면 받은 그대로 돌려준다")
    void nonLiteralIsReturnedAsIs(String clientIp) {
        assertThat(ClientIpKeys.normalize(clientIp)).isEqualTo(clientIp);
    }
}
