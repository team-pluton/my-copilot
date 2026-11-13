#!/usr/bin/env bash
# 공식 Pleos 공개 Maven 저장소에서 SDK 를 받아 adapters/ 가 컴파일할 수 있게 .sdk/ 에 푼다.
# 저장소·좌표는 공식 문서(Vehicle/project-setup)의 값이다. 받은 파일은 git 에 넣지 않는다(.gitignore).
# 필요: curl · unzip. 실행: bash scripts/fetch-pleos-sdk.sh
set -euo pipefail
cd "$(dirname "$0")/.."
R=https://nexus-playground.pleos.ai/repository/maven-releases/ai/pleos/playground
OUT=.sdk; mkdir -p "$OUT"
fetch() { # name version
  local n=$1 v=$2
  [ -f "$OUT/$n.jar" ] && return
  curl -fsSL -o "$OUT/$n.aar" "$R/$n/$v/$n-$v.aar"
  rm -rf "$OUT/tmp" && mkdir -p "$OUT/tmp" && unzip -q -o "$OUT/$n.aar" -d "$OUT/tmp"
  mv "$OUT/tmp/classes.jar" "$OUT/$n.jar" && rm -rf "$OUT/tmp" "$OUT/$n.aar"
  echo "  $n $v"
}
echo "Pleos SDK (2026-10-19 릴리즈):"
fetch NaviHelper 3.0.5
fetch navi-data 3.0.4
fetch navi-aidl 3.0.1
fetch Vehicle 2.3.2
# android.car.jar 는 copilot-adapters/ 가 쓴다 (AAOS CarUxRestrictions · CarPropertyManager) — 같은 platform zip 의 optional/ 에 있다
if [ ! -f "$OUT/android.jar" ] || [ ! -f "$OUT/android.car.jar" ]; then
  echo "android.jar · android.car.jar (platform 34):"
  curl -fsSL -o "$OUT/platform.zip" https://dl.google.com/android/repository/platform-34-ext12_r01.zip
  unzip -q -j -o "$OUT/platform.zip" "*/android.jar" "*/optional/android.car.jar" -d "$OUT" && rm -f "$OUT/platform.zip"
  echo "  android.jar · android.car.jar"
fi
ls -la "$OUT"
