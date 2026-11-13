"""MY CO-PILOT 시연 영상 1차 편집 — 에뮬레이터 녹화 2개 + 제목 카드 + 근거 등급 자막.
PIL 로 카드·자막 PNG 를 그리고 ffmpeg 로 합친다(한글 drawtext 이스케이프를 피하려고)."""
import subprocess, os, sys
from PIL import Image, ImageDraw, ImageFont

V = os.path.dirname(os.path.abspath(__file__))
FF = "<tools>/ffmpeg.exe"
B = "C:/Windows/Fonts/malgunbd.ttf"; R = "C:/Windows/Fonts/malgun.ttf"
INK, MINT, WHITE, GREY = (14, 26, 36), (0, 163, 122), (255, 255, 255), (170, 182, 192)
BADGE = {"에뮬": (0, 163, 122), "실 API": (61, 90, 128), "시연": (224, 162, 27), "미구현": (138, 148, 160), "개발 중": (110, 84, 160)}
W, H = 1920, 1080

def font(p, s): return ImageFont.truetype(p, s)

def card(name, lines, sub=None):
    im = Image.new("RGB", (W, H), INK); d = ImageDraw.Draw(im)
    y = 330
    for i, (text, size, col, bold) in enumerate(lines):
        f = font(B if bold else R, size)
        w = d.textlength(text, font=f)
        d.text(((W - w) / 2, y), text, font=f, fill=col); y += int(size * 1.6)
    if sub:
        f = font(R, 26); w = d.textlength(sub, font=f)
        d.text(((W - w) / 2, H - 110), sub, font=f, fill=GREY)
    p = os.path.join(V, name + ".png"); im.save(p); return p

def caption(name, text, badges):
    im = Image.new("RGBA", (W, 130), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([40, 10, W - 40, 120], radius=18, fill=(14, 26, 36, 225))
    x = 70
    for b in badges:
        f = font(B, 26); tw = d.textlength(b, font=f)
        d.rounded_rectangle([x, 45, x + tw + 28, 87], radius=12, fill=BADGE[b] + (255,))
        d.text((x + 14, 48), b, font=f, fill=WHITE); x += tw + 44
    d.text((x + 6, 40), text, font=font(B, 34), fill=WHITE)
    p = os.path.join(V, name + ".png"); im.save(p); return p

LEGEND = "[에뮬] Pleos Connect Emulator 실측 · [실 API] 외부 API 실호출 · [시연] 시연 데이터·모의 주행 · [개발 중] 개발 브랜치(출품 앱 미포함) · [미구현] 계획"
cards = [
    (card("c1", [("MY CO-PILOT", 96, WHITE, True), ("목적지를 알려주는 차에서, 목적을 달성하도록 돕는 차로.", 46, MINT, True)], LEGEND), 5),
    (card("c2", [("도착했다고 이동이 끝난 것은 아닙니다", 64, WHITE, True), ("시간 · 주차 · 다음 구간 — 여러 앱을 오가던 일을", 40, GREY, False), ("결정 하나 · 승인 하나로, 반영 결과까지 확인합니다", 40, MINT, True)]), 5),
    (card("c3", [("장면 1", 40, MINT, True), ("목표를 끝까지 기억 — 아이 픽업 후 귀가", 60, WHITE, True), ("모든 동력원 · Pleos Connect Emulator 화면 그대로", 34, GREY, False)]), 3),
    (card("c4", [("장면 2", 40, MINT, True), ("여러 서비스를 한 결정으로 — 가족 장거리", 60, WHITE, True), ("전기차 특화 · 차량 배터리 + 내비 + 공공 충전소 실시간 상태", 34, GREY, False)]), 3),
    (card("c5", [("다음 · ARRIVE READY  [개발 중]", 54, WHITE, True), ("\u201c이 주차장에 세우면 약속 시간에 방문을 마칠 수 있나\u201d", 42, MINT, True),
                 ("서울 시영 주차장 실시간 대수 [실 API] + 주차장별 내비 소요 시간 [에뮬] → 추천 하나", 32, GREY, False),
                 ("승인 → 기존 경로 교체 확인 → 내비 목적지 반영 → 다시 읽어 확인 [에뮬]", 32, GREY, False),
                 ("개발 브랜치에서 확인 — 이번 출품 앱에는 넣지 않았습니다 · 조작 감소는 측정 전", 32, GREY, False)]), 8),
    (card("c6", [("적게 판단하고, 적게 조작해도", 60, WHITE, True), ("원하는 일을 끝내도록", 60, MINT, True), ("MY CO-PILOT · Journey OS", 34, GREY, False)]), 4),
]

S1 = [  # (시작, 끝, 문장, 배지) — scene1 원본 시각(2026-11-13 다시 녹화 · E33 수정본 debug)
    (0, 6, "운전자와 이번 이동의 목적을 한 번 고릅니다", ["에뮬"]),
    (6, 14, "저장된 취향과 지금 차량 값을 비교해 다른 것만 · 읽지 못한 값은 '지금 값을 읽지 못함'", ["에뮬"]),
    (14, 20, "승인 한 번 → 시트 열선 설정 → 차량 값을 다시 읽어 '적용 확인'", ["에뮬"]),
    (20, 25, "주행·도착 전환은 개발용 모의 주행 — 이 에뮬레이터에는 속도 신호가 없습니다", ["시연"]),
    (25, 32, "주행 중에는 한 줄 상태만 — 비교·설정은 정차 후에", ["시연"]),
    (32, 43, "학원에 도착해도 이동은 끝나지 않았습니다 — 귀가 일정을 기억합니다", ["에뮬"]),
    (43, 51, "기다리는 동안 한 번만 묻습니다: 방문을 마치셨나요?", ["에뮬"]),
    (51, 56, "'집으로 안내 시작' 한 번", ["에뮬"]),
    (56, 72, "Pleos 내비가 저장된 집으로 경로를 시작합니다 (NaviHelper requestRoute)", ["에뮬"]),
    (72, 84, "내비 목적지를 다시 읽어 확인 — '귀가 경로 확인됨'", ["에뮬"]),
]
S2_CUTS = [(0, 20), (30, 56)]  # 결정 카드 대기 구간을 줄인다
S2 = [  # 편집 후 시각
    (0, 8, "탑승 조합을 고르면 도착 후 대기까지 센 에너지로 '서야 하나'를 먼저 판단합니다", ["에뮬"]),
    (8, 20, "배터리 + 내비 + 공공 충전소 실시간 상태 → 추천 하나 · 대안 둘 (휴게소 시설은 시연 데이터)", ["에뮬", "실 API", "시연"]),
    (20, 36, "승인하면 내비 경유지로 요청 — 경로는 승인 뒤에만 바뀝니다", ["에뮬"]),
    (36, 46, "경유지 목록을 다시 읽어 확인 — '경유지에 있어요'", ["에뮬"]),
]

def run(args):
    r = subprocess.run([FF, "-v", "error", "-y"] + args, capture_output=True, text=True)
    if r.returncode: print(r.stderr[-2000:]); sys.exit(1)

def overlay_scene(src, out, caps, cuts=None):
    pre = os.path.join(V, out + "_base.mp4")
    if cuts:
        parts = "".join(f"[0:v]trim={a}:{b},setpts=PTS-STARTPTS[p{i}];" for i, (a, b) in enumerate(cuts))
        fc = parts + "".join(f"[p{i}]" for i in range(len(cuts))) + f"concat=n={len(cuts)}:v=1:a=0,fps=30[v]"
    else:
        fc = "[0:v]fps=30[v]"
    run(["-i", src, "-filter_complex", fc, "-map", "[v]", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", pre])
    ins = ["-i", pre]; fc = ""; last = "0:v"
    for i, (a, b, text, badges) in enumerate(caps):
        ins += ["-i", caption(f"{out}_cap{i}", text, badges)]
        fc += f"[{last}][{i+1}:v]overlay=0:{H-150}:enable='between(t,{a},{b})'[o{i}];"; last = f"o{i}"
    run(ins + ["-filter_complex", fc.rstrip(";"), "-map", f"[{last}]", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30", os.path.join(V, out + ".mp4")])

def card_clip(png, sec, out):
    run(["-loop", "1", "-t", str(sec), "-i", png, "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "20", os.path.join(V, out + ".mp4")])

overlay_scene(os.path.join(V, "scene1.mp4"), "s1c", S1)
overlay_scene(os.path.join(V, "scene2.mp4"), "s2c", S2, S2_CUTS)
order = []
for i, (png, sec) in enumerate(cards): card_clip(png, sec, f"card{i+1}")
order = ["card1", "card2", "card3", "s1c", "card4", "s2c", "card5", "card6"]
with open(os.path.join(V, "list.txt"), "w", encoding="utf-8") as f:
    for o in order: f.write(f"file '{os.path.join(V, o + '.mp4').replace(os.sep, '/')}'\n")
run(["-f", "concat", "-safe", "0", "-i", os.path.join(V, "list.txt"), "-c", "copy", os.path.join(V, "MY-CO-PILOT_demo_v1.mp4")])
print("ok")
