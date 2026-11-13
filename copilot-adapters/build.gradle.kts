/*
 * copilot-adapters — MY CO-PILOT 의 차량 신호 어댑터 (실험, 출품 APK 에 들어가지 않는다). 읽기 전용이 기본이고 제어는 PleosCabinControl 한 파일뿐.
 *
 * adapters/ 와 같은 방식이다: 실물 SDK jar 에 대고 컴파일만 해서 "시그니처가 맞다" 를 증명한다.
 * 실행(콜백이 실제로 오는가)은 Pleos Connect 에뮬레이터에서. android/ 앱은 이 모듈을 포함하지 않는다 —
 * 출품작(쉼표 DRIVE v3.1)을 흔들지 않으려고 따로 둔다 (오너 결정 2026-10-26, docs/my-copilot/MIGRATION.md).
 *
 *   bash scripts/fetch-pleos-sdk.sh && cd copilot-adapters && gradle compileKotlin
 */
plugins {
    kotlin("jvm") version "2.1.20"
}

repositories {
    mavenCentral()
}

val sdk = rootDir.resolve("../.sdk")

dependencies {
    // AAOS Car API(android.car.jar) — CarUxRestrictions · CarPropertyManager(속도·기어·주차 브레이크). platform 34 의 optional 라이브러리
    compileOnly(files(sdk.resolve("android.jar"), sdk.resolve("android.car.jar")))
    compileOnly(files(sdk.resolve("Vehicle.jar")))
    // 원탭 다음 이동(PleosNaviRoute) — NaviHelper 3.0.5 실물 jar 로 컴파일만(adapters/ 와 같은 파일)
    compileOnly(files(sdk.resolve("NaviHelper.jar"), sdk.resolve("navi-data.jar"), sdk.resolve("navi-aidl.jar")))
}

// 여정 신호 타입·해석 규칙(SignalMapping)은 core/ 의 것을 그대로 쓴다
sourceSets {
    main {
        kotlin.srcDir("../core/src/main/kotlin")
    }
}

/**
 * 읽기 전용 검사 — 이 모듈 소스에 차량을 바꾸는 호출(set…)이 들어오면 빌드를 멈춘다.
 * 예외는 PleosCabinControl.kt(실내 제어)와 PleosNaviRoute.kt(내비 경로 요청 — 원탭 다음 이동, 2026-11-03) 둘 — 2026-10-29 Pleos Connect Emulator 에서 CONTROL_CAR_CLIMATE·CONTROL_CAR_SEATS 가 protectionLevel normal
 * (서드파티 선언만으로 허용)임을 확인한 뒤 만들었다. 조회 어댑터에 set 이 섞이는 것은 계속 막는다. 실차 허용은 미확인.
 */
val verifyReadOnly by tasks.registering {
    val src = fileTree("src/main/kotlin")
    inputs.files(src)
    doLast {
        val bad = Regex("""\.set(Hvac|Door|Seat|Light|GloveBox|Cabin|Reading)\w*\(|\.(requestRoute|requestRouteWithWaypoints|cancelRoute|addWaypoint|removeWaypoint)\(""")
        val hits = src.files.filter { it.name != "PleosCabinControl.kt" && it.name != "PleosNaviRoute.kt" && it.name != "PleosNaviWaypoint.kt" }.flatMap { f -> f.readLines().mapIndexedNotNull { i, line -> if (bad.containsMatchIn(line)) "${f.name}:${i + 1}: ${line.trim()}" else null } }
        if (hits.isNotEmpty()) throw GradleException("읽기 전용 모듈에 제어 호출이 있습니다:\n" + hits.joinToString("\n"))
    }
}
tasks.named("compileKotlin") { dependsOn(verifyReadOnly) }
