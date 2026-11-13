/*
 * 쉼표 DRIVE — Pleos Connect 차량용 앱 (Android).
 *
 * 판단 규칙은 저장소의 core/(순수 Kotlin)를, 실제 SDK 연결은 adapters/ 를 **소스 그대로** 컴파일한다.
 * 웹 시연(src/lib/core)과 같은 규칙이 차 안에서도 같은 답을 내야 하기 때문이다 — 복사본을 두면 언젠가 어긋난다.
 */
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // Pleos Connect SDK 공식 공개 저장소 (document.pleos.ai · Vehicle/project-setup)
        maven("https://nexus-playground.pleos.ai/repository/maven-releases/")
    }
}

rootProject.name = "comma-drive"
include(":app")
// MY CO-PILOT 실험 앱 — :app(출품)과 별도 applicationId. :app 의 소스·리소스를 그대로 컴파일하고 고치지 않는다
include(":copilot")
include(":gateprobe") // 개발 전용 — ARRIVE READY 관문 시험(제출 안 함)
