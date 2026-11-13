/*
 * MY CO-PILOT — **Pleos Connect 차량용 앱 · 1차 출품작**(오너 결정 2026-11-09, 그 전에는 실험). 실행 대상은 Pleos Connect Emulator 와 지원 차량이다.
 * 출품 앱 :app 과 **다른 applicationId** 라 나란히 설치된다(개발 중에는 폰에도 깔아 화면만 본다 — 폰 실행은 차량 검증이 아니다).
 *
 * 복사본을 두지 않는다: 판단(core) · 출품 앱의 화면 부품(테마·버튼·카드·음성·시연 휴게소 데이터) · 리소스를
 * 전부 **소스 그대로** 컴파일한다. :app 의 파일은 하나도 고치지 않는다 — 출품 APK 가 이 모듈 때문에 바뀌면 안 된다.
 * namespace 를 :app 과 같게 둔 이유: 가져온 Theme.kt 가 app.commadrive.app.R(폰트)을 그대로 찾게.
 *
 *   ./gradlew :copilot:assembleDebug   → copilot/build/outputs/apk/debug/copilot-debug.apk
 *   ./gradlew :copilot:assembleRelease → 제출용. 서명은 :app 과 같은 방식 — android/keystore.properties(gitignore)가 있으면 그 키, 없으면 debug 키
 *                                        (심사위원이 클론해서 키 없이도 빌드할 수 있게)
 */
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "app.commadrive.app"
    compileSdk = 34
    // AAOS Car API(CarUxRestrictions · CarPropertyManager) — 차량에만 있는 플랫폼 라이브러리. 매니페스트에서 required=false 로 둔다
    useLibrary("android.car")

    defaultConfig {
        applicationId = "app.commadrive.copilot"
        minSdk = 28
        targetSdk = 34
        versionCode = 2
        versionName = "1.0.0"
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
    // 화면 캡처(문서용) — 기기 없이 JVM 에서 Compose 를 실제로 그린다. ./gradlew :copilot:testDebugUnitTest -Pshots=<폴더>
    testOptions { unitTests { isIncludeAndroidResources = true; all { it.systemProperty("shots.dir", (project.findProperty("shots") ?: "build/shots").toString()); it.systemProperty("copilot.noVehicle", "true") } } }

    sourceSets {
        getByName("main") {
            // copilot-adapters(읽기 전용 차량 신호)도 소스 그대로 — set 호출 금지 검사는 그 모듈의 verifyReadOnly 가 한다
            java.srcDirs("src/main/kotlin", "../app/src/main/kotlin", "../../core/src/main/kotlin", "../../adapters/src/main/kotlin", "../../copilot-adapters/src/main/kotlin")
            // 출품 앱 리소스(폰트·아이콘·색·테마)를 그대로 — 같은 이름을 여기서 다시 정의하면 병합이 깨지므로 앱 이름은 매니페스트에 적는다
            res.srcDirs("../app/src/main/res", "src/main/res")
        }
    }
}

dependencies {
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

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.13")
    testImplementation(platform("androidx.compose:compose-bom:2024.09.03"))
    testImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
