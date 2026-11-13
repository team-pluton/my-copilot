"""제출 스냅샷에서 계정명 · 이메일 · 로컬 경로 · 배포 주소를 지우고, 남았으면 실패한다.

지울 값은 이 파일에 적지 않는다 — 적으면 스냅샷에 그 계정명이 그대로 실린다(2026-11-10 첫 판에서 실제로 그랬다).
실행할 때 git 설정(user.name · user.email)과 로컬 경로에서 만든다.
사용: python -I scripts/submission/scrub_snapshot.py <스냅샷 폴더> <원본 저장소 루트>
"""
import os
import re
import subprocess
import sys


def git(root, key):
    r = subprocess.run(["git", "-C", root, "config", key], capture_output=True, text=True)
    return r.stdout.strip()


def text_files(out):
    for d, dirs, files in os.walk(out):
        if ".git" in dirs:
            dirs.remove(".git")
        for f in files:
            p = os.path.join(d, f)
            b = open(p, "rb").read()
            if b"\0" in b[:4096]:
                continue  # 이진 파일(APK · 이미지 · 영상)은 건너뛴다 — APK 서명 인증서는 따로 확인(CN=Comma Drive)
            try:
                yield p, b.decode("utf-8")
            except UnicodeDecodeError:
                continue


def main():
    out, root = sys.argv[1], os.path.abspath(sys.argv[2]).replace("\\", "/")
    home = (os.environ.get("USERPROFILE") or os.path.expanduser("~")).replace("\\", "/").rstrip("/")
    personal = os.path.dirname(os.path.dirname(root))  # 예: D:/<개인 폴더> — 저장소의 두 단계 위
    name, email = git(root, "user.name"), git(root, "user.email")
    words = {w for w in [name, email, email.split("@")[0], os.path.basename(home)] if len(w) >= 4}
    paths = [(root, "."), (personal + "/tools", "<tools>"), (personal, "<local>"), (home, "<home>")]
    url = re.compile(r"https?://[a-z0-9-]+\.vercel\.app[^\s)\"'`]*", re.I)
    bare = re.compile(r"[a-z0-9-]+\.vercel\.app", re.I)

    changed = 0
    for p, t in text_files(out):
        n = t
        for a, r in paths:
            for v in {a, a.replace("/", "\\"), a.lower(), a[:1].lower() + a[1:]}:
                if len(v) > 3:
                    n = n.replace(v, r)
        n = url.sub("http://localhost:3008", n)
        n = bare.sub("(웹 시연 주소 — 제출 시 기재)", n)
        for w in words:
            n = re.sub(re.escape(w), "<user>", n, flags=re.I)
        if n != t:
            with open(p, "w", encoding="utf-8", newline="") as f:
                f.write(n)
            changed += 1

    leak = re.compile("|".join([re.escape(w) for w in words] + [r"vercel\.app", re.escape(personal)]), re.I)
    bad = [(p, m.group()) for p, t in text_files(out) for m in [leak.search(t)] if m]
    print(f"치환 {changed}개 파일 · 검사 단어 {len(words)}개 · 남은 의심 {len(bad)}개")
    for p, w in bad[:20]:
        print("  ", p, "←", w)
    sys.exit(2 if bad else 0)


if __name__ == "__main__":
    main()
