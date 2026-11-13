/*
 * adapters — core/ 의 Port 를 **실제 Pleos SDK** 로 구현한다.
 *
 * 이 모듈의 목적은 "우리 어댑터가 실제 SDK 시그니처에 맞는가" 를 컴파일러로 증명하는 것이다.
 * SDK 는 공식 공개 Maven 저장소에서 scripts/fetch-pleos-sdk.sh 가 .sdk/ 에 받는다 (compileOnly).
 * 실행(경유지가 실제로 추가되는가)은 Pleos Connect 에뮬레이터에서 — 이 모듈은 거기까지 가지 않는다.
 *
 * 순수 JVM 모듈로 컴파일만 한다: Android 앱 모듈이 생기면 이 소스를 그대로 옮긴다.
 *   bash scripts/fetch-pleos-sdk.sh && cd adapters && gradle compileKotlin
 */
plugins {
    kotlin("jvm") version "2.1.20"
}

repositories {
    mavenCentral()
}

val sdk = rootDir.resolve("../.sdk")

dependencies {
    compileOnly(files(sdk.resolve("android.jar")))
    compileOnly(files(sdk.resolve("NaviHelper.jar"), sdk.resolve("navi-data.jar"), sdk.resolve("navi-aidl.jar"), sdk.resolve("Vehicle.jar")))
    // SDK 가 끌고 오는 것 (NaviHelper POM: kotlinx-coroutines-android 1.6.3 · navi-data: kotlinx-serialization)
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.1")
    compileOnly("org.jetbrains.kotlinx:kotlinx-serialization-core:1.6.3")
}

// core/ 의 도메인·Port 를 같이 컴파일한다 (core 는 Android 를 모른다)
sourceSets {
    main {
        kotlin.srcDir("../core/src/main/kotlin")
    }
}
