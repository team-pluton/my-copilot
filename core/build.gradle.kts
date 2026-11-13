/*
 * core — 순수 Kotlin(JVM) 모듈. Android 를 모른다.
 *
 * 혼자서도 돈다: 이 폴더에서 `gradle test` (JDK 17+ · Gradle 8.x 필요. 이 PC 에는 2026-10-24 현재 JDK 가 없어
 * 아직 한 번도 컴파일하지 않았다 — HANDOFF). 나중에 Android 앱 모듈이 생기면 `settings.gradle.kts` 의
 * include 로 끌어간다.
 */
plugins {
    kotlin("jvm") version "2.1.20"
}

group = "app.commadrive"
version = "0.2.0"

repositories {
    mavenCentral()
}

dependencies {
    testImplementation(kotlin("test"))
}

kotlin {
    jvmToolchain(17)
}

tasks.test {
    useJUnitPlatform()
    testLogging { events("passed", "failed", "skipped") }
}
