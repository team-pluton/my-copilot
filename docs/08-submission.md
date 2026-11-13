# 1차 제출 묶음 — 11/15(일) 23:59 까지 `appdevchallenge@hyundai-partners.com`

공식 서식 기준(공식 홈페이지 `/guide/submission`, 2026-10-25 확인 — `docs/00-contest.md`).
**접수양식(DOCX)이 곧 기획서**다. 시연 영상·GitHub(소스+APK)는 선택이지만 **가산점**이다.
출품작은 **MY CO-PILOT**(오너 결정 2026-11-09). 쉼표 DRIVE 판 묶음은 master · 태그 `stable-commadrive-2026-11-09` 에 남아 있다.

## 보낼 것

| 무엇 | 파일 / 주소 | 상태 (2026-11-10) |
|---|---|---|
| 접수양식 01~04 — 필수 | `docs/submission/MY-CO-PILOT_접수양식_02작성.docx` | 02 작성 끝(스키마 검증 통과 · Word 렌더링 미확인) · **01·03·04 기입·서명은 오너** |
| 시연 영상 — 선택(가산점) | Pleos Connect Emulator 녹화(실제 SDK · 실제 API · 시연 데이터 구간 자막) | **1차 편집본** `docs/video/MY-CO-PILOT_demo_v1.mp4`(2분 31초 · 4.6MB, 2026-11-10) — 오너 검토 |
| GitHub 저장소 — 선택(가산점) | 소스 + `apk/플루톤_MY-CO-PILOT_release.apk` + README | **익명 처리 결정 전**(아래) |
| 숏폼 링크 — 선택(가산점 없음) | 양식 8번 | 게시 전 |

양식 02 를 고치면: `form-content.json` 수정 → `python -I scripts/submission/fill_form02.py "docs/submission/쉼표DRIVE_접수양식_02작성.docx" docs/submission/form-content.json "docs/submission/MY-CO-PILOT_접수양식_02작성.docx"`.
(기준 DOCX 는 쉼표 작성본이다 — 답변 칸의 서식 세 가지를 거기서 복제한다. 01·03·04 를 Word 에서 기입한 뒤에 다시 채우면 기입한 내용이 사라지니, **02 내용을 확정한 뒤에** 기입한다.)

## 🔴 GitHub 익명성 — 지금 저장소를 그대로 내면 안 된다

공식 규정: 02·링크·첨부에 실명·계정 정보를 넣지 않는다.

| 드러나는 곳 | 내용 |
|---|---|
| **커밋 기록 114개 전부** | 작성자 이름·이메일(계정명) — 파일을 고쳐도 기록에 남는다 |
| 저장소 주소 | 개인 계정 이름이 들어간 주소 |
| 파일 | `HANDOFF.md`(저장소 주소) · `src/app/layout.tsx`·`src/app/proposal/page.tsx`(배포 주소, 쉼표 판) 등 — `git grep` 으로 다시 확인 |
| 작업 문서 | `HANDOFF.md` · `CLAUDE.md` · `docs/my-copilot/REVIEW-*` 같은 내부 기록은 심사 자료로 읽히면 혼란을 준다 |

권고: **제출용 저장소를 따로 만든다** — 익명 조직/계정에 새 저장소 · 현재 `copilot-submit` 의 **파일 스냅샷만**(기록 없이) 한 커밋으로 · 작성자는 팀명 ·
내부 작업 문서(HANDOFF · CLAUDE · REVIEW-* 등)는 빼거나 그대로 두되 계정·주소를 지운다. 비공개로 두면 공지될 심사용 계정을 Collaborator 로 초대하고 마감 전 접근을 확인한다.
**오너 결정 · 계정 작업이 필요하다.** 원격 푸시는 오너 승인 없이 하지 않는다.

**준비됨(2026-11-10)**: `TEAM_NAME="플루톤" bash scripts/submission/make_snapshot.sh copilot-submit ../my-copilot-submit` — 파일만 · 커밋 1개 · 작성자 플루톤 · 내부 문서(HANDOFF · CLAUDE · REVIEW-* · 분석 · 양식 DOCX) 제외 · 계정명 · 이메일 · 로컬 경로 · 배포 주소 치환(`scrub_snapshot.py` — 지울 값을 실행 시 git 설정에서 만든다) · 남으면 실패. **만들어 둠**: `<local>/portfolio/my-copilot-submit`(파일 382개 · 텍스트 · 이진(PPTX · APK · PDF · 영상) 모두 계정 문자열 0건, 2026-11-10). 푸시는 하지 않았다.
> ⚠️ 정정: 같은 날 첫 판의 "검사 0건"은 틀렸다 — 검사 grep 이 비정상 종료한 것을 "없음"으로 읽었고, 스크립트 자체에 계정명이 적혀 있어 스냅샷에 실렸다. 지금 판에서 고쳤다.
**다시 만듦(2026-11-12, 오너 위임 결정)**: 같은 폴더에 `main`(= `copilot-submit` · APK `8d61383b`) + `arrive-ready-dev`(= `arrive-ready-v0` 스냅샷 · 양식 02 의 '판단 엔진 구현(개발 브랜치)'을 심사위원이 확인할 수 있게 · 출품 APK 에는 없음). 두 브랜치 모두 make_snapshot.sh 로 만든 뒤 `git fetch ../dev main:arrive-ready-dev` 로 합쳤다(공통 기록 없음). 푸시: `git push -u origin main arrive-ready-dev`.
점검한 것: APK 서명 인증서 `CN=Comma Drive, O=Comma Drive, C=KR`(개인 정보 없음) · PPT 작성자 PptxGenJS · 양식 DOCX 의 '마지막 수정자'는 **원본 양식에서 온 주최 측 이름**(우리 계정 아님 — 그래도 메일로 낼 때 Word 에서 문서 속성을 비우면 깔끔하다).

## 이메일

> **제목**: `[차량용 앱 개발 공모전] 플루톤_대표자명` (팀명 플루톤 · 대표자명은 01 참가신청서와 같게)
> (수정 제출이면 앞에 `[수정제출]` — 전체 자료와 서명한 동의서를 **다시 전부** 붙이고 팀원 전원 CC. 마지막 제출본이 최종)
>
> 안녕하세요. 현대자동차그룹 차량용 앱 개발 공모전에 접수양식과 개발 산출물을 제출합니다.
>
> - 앱명: MY CO-PILOT
> - 첨부: 접수양식(서명 포함) 1부 · 시연 영상 1부(있으면)
> - GitHub 저장소(소스 + release APK, apk/ 폴더): {제출용 저장소 주소}
>
> 감사합니다.

본문에도 개인정보는 01 참가신청서에 적은 것 이상 넣지 않는다.

## 보내기 전 확인

- [ ] 양식 01·03·04 기입·서명 · **02 에 실명·소속·연락처·계정이 없는지** 다시 본다
- [ ] Word 로 양식을 열어 02 칸·줄바꿈이 깨지지 않았는지
- [ ] 양식 7번 칸 — GitHub 주소 · 영상 링크 · 웹 시연 여부(오너 결정 D3)를 채우거나 "[제출 전 기재]" 를 지운다
- [ ] GitHub — 제출용 저장소 · 커밋 작성자 · 파일 속 계정·주소(`git grep`) · 심사 계정 접근
- [x] `apk/` 파일명 `플루톤_MY-CO-PILOT_release.apk` (팀명 플루톤, 2026-11-10)
- [ ] APK 를 새로 빌드했으면 `apk/` 에 다시 복사하고 에뮬레이터에 설치해 본다
- [ ] 영상 첨부 용량 — 메일 첨부 한도를 넘으면 링크로
