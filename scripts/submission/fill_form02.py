"""접수양식 02(앱 프로젝트 소개) 채우기 — docs/submission/form-content.json → DOCX.

공식 양식의 구조·문항·다른 장(01·03·04)은 건드리지 않는다. 문항 문단("1. 앱 한 줄 소개" …) 바로 뒤의
답변 칸(<w:tc>) 안의 문단만 갈아 끼운다. 서식은 기준 DOCX 의 답변 칸에 있던 세 모양을 복제한다:
  "## 제목" → 소제목(굵게·남색) · "- 글" → 글머리("· " + 들여쓰기) · 그 밖 → 본문.  **굵게** 는 굵은 run, `코드` 는 따옴표 없이 글자만.

  python -I scripts/submission/fill_form02.py <기준.docx> <form-content.json> <출력.docx>

기준 DOCX 는 이미 한 번 채워진 작성본(답변 칸에 세 모양이 다 있는 것)이어야 한다.
"""
import json
import re
import sys
import zipfile
from xml.sax.saxutils import escape

QUESTIONS = ["1. 앱 한 줄 소개", "2. 기획 배경", "3. 앱 주요 기능", "4. 주요 사용 시나리오",
             "5. 개발 계획", "6. 기대효과", "7. 참고자료", "8. 숏폼 링크"]
OLD_NAME = "쉼표 DRIVE (COMMA DRIVE)"

PARA = re.compile(r"<w:p[ >].*?</w:p>", re.S)
TEXT = re.compile(r"<w:t[^>]*>([^<]*)</w:t>")


def text_of(p: str) -> str:
    return "".join(TEXT.findall(p))


def runs(md: str, base_rpr: str) -> str:
    """**굵게** 를 굵은 run 으로. base_rpr 은 <w:rPr>…</w:rPr> 의 안쪽."""
    out = []
    for i, part in enumerate(re.split(r"\*\*", md)):
        if not part:
            continue
        part = part.replace("`", "")
        rpr = base_rpr + ("<w:b/><w:bCs/>" if i % 2 == 1 and "<w:b/>" not in base_rpr else "")
        out.append(f'<w:r><w:rPr>{rpr}</w:rPr><w:t xml:space="preserve">{escape(part)}</w:t></w:r>')
    return "".join(out)


def main(base_path: str, content_path: str, out_path: str) -> None:
    content = json.load(open(content_path, encoding="utf-8"))
    sections = content["sections"]
    assert len(sections) == len(QUESTIONS), "form-content.json 의 절 수가 양식 문항 수와 다르다"

    zin = zipfile.ZipFile(base_path)
    xml = zin.read("word/document.xml").decode("utf-8")

    # 세 모양의 문단 속성(pPr)을 기준 답변 칸에서 가져온다 — 2번 칸의 첫 소제목·본문·글머리
    paras = list(PARA.finditer(xml))
    def ppr(p):  # <w:pPr>…</w:pPr>
        m = re.search(r"<w:pPr>.*?</w:pPr>", p, re.S)
        return m.group(0) if m else ""
    heading = body = bullet = None
    q2 = next(i for i, m in enumerate(paras) if text_of(m.group(0)).startswith(QUESTIONS[1]))
    for m in paras[q2 + 1:]:
        p = m.group(0)
        if heading is None and 'w:color w:val="16324F"' in p and "<w:ind" not in p:
            heading = ppr(p)
        elif bullet is None and text_of(p).startswith("· "):
            bullet = ppr(p)
        elif body is None and "<w:ind" not in p and "16324F" not in p and text_of(p).strip():
            body = ppr(p)
        if heading and body and bullet:
            break
    assert heading and body and bullet, "기준 DOCX 에서 세 문단 모양을 찾지 못했다"
    lang = '<w:lang w:eastAsia="ko-KR"/>'

    def render(lines):
        out = []
        for line in lines:
            if line.startswith("## "):
                out.append(f"<w:p>{heading}{runs(line[3:], '<w:b/><w:bCs/><w:color w:val=\"16324F\"/>' + lang)}</w:p>")
            elif line.startswith("- "):
                out.append(f"<w:p>{bullet}<w:r><w:rPr>{lang}</w:rPr><w:t xml:space=\"preserve\">· </w:t></w:r>{runs(line[2:], lang)}</w:p>")
            else:
                out.append(f"<w:p>{body}{runs(line, lang)}</w:p>")
        return "".join(out)

    # 뒤에서부터 바꿔야 앞쪽 위치가 흔들리지 않는다
    for qi in range(len(QUESTIONS) - 1, -1, -1):
        paras = list(PARA.finditer(xml))
        q = next(m for m in paras if text_of(m.group(0)).replace(" ", "").startswith(QUESTIONS[qi].replace(" ", "")))
        tc_start = min(i for i in (xml.find("<w:tc>", q.end()), xml.find("<w:tc ", q.end())) if i >= 0)
        tc_end = xml.find("</w:tc>", tc_start)
        cell = xml[tc_start:tc_end]
        assert "<w:tbl" not in cell, f"{QUESTIONS[qi]} 칸 안에 표가 있다 — 이 도구는 다루지 않는다"
        head_end = cell.find("</w:tcPr>")
        head_end = head_end + len("</w:tcPr>") if head_end >= 0 else cell.find(">") + 1
        xml = xml[:tc_start] + cell[:head_end] + render(sections[qi]) + xml[tc_end:]

    # 앱 이름(01 · 02 · 04 세 곳)
    name = content["appName"]
    n_old = xml.count(OLD_NAME)
    xml = xml.replace(OLD_NAME, escape(name))

    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            if item.is_dir():
                continue
            data = xml.encode("utf-8") if item.filename == "word/document.xml" else zin.read(item.filename)
            zout.writestr(item, data)
    print(f"채움: 문항 {len(QUESTIONS)}칸 · 앱 이름 {n_old}곳 → {name} · {out_path}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
