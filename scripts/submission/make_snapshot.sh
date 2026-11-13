#!/usr/bin/env bash
# 제출용 익명 스냅샷 — 커밋 기록 없이 파일만, 작성자는 팀명 한 커밋. **원격 푸시는 하지 않는다**(오너가 직접).
# 왜: 공모전 규정상 02·링크·첨부에 실명·계정이 드러나면 안 되는데, 이 저장소의 커밋 기록 전부에 계정명·이메일이 있다.
#
# 사용: TEAM_NAME="팀명" bash scripts/submission/make_snapshot.sh <브랜치> <출력 폴더>
#   예: TEAM_NAME="CO-PILOT" bash scripts/submission/make_snapshot.sh v7-journey-os ../my-copilot-submit
# 출력 폴더가 이미 있으면 멈춘다(덮어쓰지 않는다).
set -euo pipefail
BRANCH="${1:?브랜치}"; OUT="${2:?출력 폴더}"; TEAM="${TEAM_NAME:?TEAM_NAME 환경변수(팀명)}"
[ -e "$OUT" ] && { echo "이미 있음: $OUT"; exit 1; }
ROOT="$(git rev-parse --show-toplevel)"
mkdir -p "$OUT"
git -C "$ROOT" archive "$BRANCH" | tar -x -C "$OUT"

# 내부 작업 기록 — 심사 자료로 읽히면 혼란을 주거나 계정·경로가 들어 있다
rm -rf "$OUT/HANDOFF.md" "$OUT/CLAUDE.md" "$OUT/AGENTS.md" "$OUT/.claude" \
       "$OUT"/docs/my-copilot/REVIEW-*.md "$OUT"/docs/11-status-*.md "$OUT"/docs/12-analysis-*.md \
       "$OUT"/docs/submission/*.docx \
       "$OUT"/public/proposal.pdf \
       "$OUT"/docs/presentation/MY-CO-PILOT_1차시안*   # 양식은 메일로 낸다(원본 양식 문서 속성에 주최 측 담당자 이름). 1차 시안 덱 · public/proposal.pdf(쉼표 DRIVE 기획서)는 지금 제품 정의와 다른 옛 판 — 원본은 저장소에 그대로 둔다(2026-11-13)

# 계정명 · 이메일 · 로컬 경로 · 배포 주소 지우기 + 검사 — 지울 값은 실행할 때 git 설정과 경로에서 만든다(이 파일에 적지 않는다)
# 남은 것이 있거나 검사 자체가 실패하면 멈춘다(첫 판은 grep 이 비정상 종료한 것을 '없음'으로 읽었다)
python -I "$ROOT/scripts/submission/scrub_snapshot.py" "$OUT" "$ROOT" || { echo "❌ 계정·경로가 남았거나 검사가 실패했다 — 위 줄을 고친 뒤 다시"; exit 2; }

cd "$OUT"
git init -q -b main
git add -A
GIT_AUTHOR_NAME="$TEAM" GIT_AUTHOR_EMAIL="team@users.noreply.invalid" \
GIT_COMMITTER_NAME="$TEAM" GIT_COMMITTER_EMAIL="team@users.noreply.invalid" \
  git -c commit.gpgsign=false commit -q -m "MY CO-PILOT — 차량용 앱 개발 공모전 2026 제출본"
echo "✅ $OUT — 커밋 1개 · 작성자 $TEAM · 파일 $(git ls-files | wc -l)개"
echo "다음(오너): 익명 계정에 저장소 만들기 → 원격 추가 → 푸시 → 심사 계정 접근 확인"
