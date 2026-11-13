/*
 * 개발 전용 관문 시험 앱 — ARRIVE READY Gate B·C(requestTrip · requestRoute 를 임의 좌표로) 를 에뮬레이터에서 확인한다.
 * 출품 APK(:copilot)를 건드리지 않으려고 따로 둔다. 제출 · 배포하지 않는다(debug 빌드만).
 */
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.commadrive.gateprobe"
    compileSdk = 34
    defaultConfig {
        applicationId = "app.commadrive.gateprobe"
        minSdk = 28
        targetSdk = 34
        versionCode = 1
        versionName = "dev"
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("ai.pleos.playground:NaviHelper:3.0.5")
}
