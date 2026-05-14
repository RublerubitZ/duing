package com.duing;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

@EnableJpaAuditing
@SpringBootApplication
public class DuingApplication {

    public static void main(String[] args) {
        SpringApplication.run(DuingApplication.class, args);
    }
}
