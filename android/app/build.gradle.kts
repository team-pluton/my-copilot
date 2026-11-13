import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

/*
 * release 서명 키는 저장소에 넣지 않는다. android/keystore.properties(gitignore)가 있으면 그걸로 서명하고,
 * 없으면 debug 키로 서명한 release 를 만든다 — 심사위원이 클론해서 바로 빌드할 수 있게.
 */
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "app.commadrive.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "app.commadrive"
        // 공식 개발 환경 요구사항: Android API 28 이상 (공모전 /guide/development)
        minSdk = 28
        targetSdk = 34
        versionCode = 1
        versionName = "0.9.0"
    }

    signingConfigs {
        create("release") {
            if (keystoreProps.isNotEmpty()) {
                storeFile = file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // 축소는 끈다 — SDK 의 AIDL·직렬화 클래스를 R8 이 지우면 차에서만 터진다. 크기보다 안 깨지는 것이 먼저
            isMinifyEnabled = false
            signingConfig = if (keystoreProps.isNotEmpty()) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true }

    sourceSets {
        getByName("main") {
            // 판단 규칙(core)과 실제 SDK 어댑터(adapters)를 그대로 — 웹 시연·JVM 테스트와 같은 코드
            java.srcDirs("src/main/kotlin", "../../core/src/main/kotlin", "../../adapters/src/main/kotlin")
        }
    }
}

dependencies {
    // Pleos Connect SDK — 공식 문서의 좌표 그대로 (2026-10-19 릴리즈)
    implementation("ai.pleos.playground:Vehicle:2.3.2")
    implementation("ai.pleos.playground:NaviHelper:3.0.5")
    implementation("ai.pleos.playground:TextToSpeech:3.3.1")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.6")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.6")
    implementation(platform("androidx.compose:compose-bom:2024.09.03"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
}
