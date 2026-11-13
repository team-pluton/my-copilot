"""간이 렌더러 — LibreOffice 가 없어 직접 그린다. 도형 채움 · 그림 · 글자(맑은 고딕 실제 폭)로 넘침을 잰다.
정확한 PowerPoint 렌더링이 아니다: 줄바꿈은 어절 단위(보수적), 줄 높이는 글자 크기 × 1.2."""
import sys, io
from pptx import Presentation
from pptx.util import Emu
from pptx.enum.dml import MSO_THEME_COLOR
from PIL import Image, ImageDraw, ImageFont

DPI = 100
THEME = {"TEXT_1": "0E1A24", "BACKGROUND_1": "FFFFFF", "TEXT_2": "33424F", "BACKGROUND_2": "EDF6F2",
         "ACCENT_1": "00A37A", "ACCENT_2": "FF7A45", "ACCENT_3": "3D5A80", "ACCENT_4": "9DB4C0", "ACCENT_5": "E0A21B", "ACCENT_6": "8A94A0",
         "DARK_1": "0E1A24", "LIGHT_1": "FFFFFF", "DARK_2": "33424F", "LIGHT_2": "EDF6F2"}
REG = "C:/Windows/Fonts/malgun.ttf"; BOLD = "C:/Windows/Fonts/malgunbd.ttf"
fonts = {}
def font(pt, bold):
    k = (round(pt * DPI / 72), bold)
    if k not in fonts: fonts[k] = ImageFont.truetype(BOLD if bold else REG, k[0])
    return fonts[k]
px = lambda emu: int(Emu(emu).inches * DPI)

def color_of(c, default=None):
    try:
        if c.type is None: return default
        if c.theme_color is not None and c.theme_color != MSO_THEME_COLOR.NOT_THEME_COLOR:
            return "#" + THEME.get(c.theme_color.name, "FF00FF")
        return "#" + str(c.rgb)
    except Exception:
        return default

# 플레이스홀더 기본 글자 크기(레이아웃 정의와 같게)
PH = {("TITLE_DARK", "title"): (54, True, "FFFFFF"), ("TITLE_DARK", "body"): (22, False, THEME["ACCENT_1"]),
      ("CONTENT", "title"): (30, True, THEME["TEXT_1"]), ("CLOSING_DARK", "title"): (36, True, "FFFFFF"),
      ("CLOSING_DARK", "body"): (20, False, THEME["ACCENT_1"])}

def wrap(text, f, width):
    lines = []
    for para in text.split("\n"):
        words, cur = para.split(" "), ""
        for w in words:
            cand = (cur + " " + w) if cur else w
            if f.getlength(cand) <= width: cur = cand; continue
            if cur: lines.append(cur)
            cur = w
            while f.getlength(cur) > width:  # 한 어절이 너무 길면 글자 단위
                i = len(cur)
                while i > 1 and f.getlength(cur[:i]) > width: i -= 1
                lines.append(cur[:i]); cur = cur[i:]
        lines.append(cur)
    return lines

def main(path, outprefix):
    prs = Presentation(path)
    W, H = px(prs.slide_width), px(prs.slide_height)
    problems = []
    for si, slide in enumerate(prs.slides, 1):
        lay = slide.slide_layout.name
        bg = "#0E1A24" if "DARK" in lay else "#FFFFFF"
        img = Image.new("RGB", (W, H), bg); d = ImageDraw.Draw(img)
        shapes = list(slide.slide_layout.shapes) + list(slide.shapes)
        for sh in shapes:
            if sh.is_placeholder and sh in slide.slide_layout.shapes: continue  # 레이아웃 플레이스홀더 자리 표시는 그리지 않는다
            x, y, w, h = px(sh.left or 0), px(sh.top or 0), px(sh.width or 0), px(sh.height or 0)
            if x < 0 or y < 0 or x + w > W + 1 or y + h > H + 1:
                problems.append(f"{si}: 화면 밖 {sh.name}")
            if sh.shape_type == 13:  # 그림
                im = Image.open(io.BytesIO(sh.image.blob)).convert("RGBA").resize((max(w, 1), max(h, 1)))
                img.paste(im, (x, y), im)
                continue
            try:
                fill = color_of(sh.fill.fore_color) if sh.fill.type == 1 else None
            except Exception:
                fill = None
            if fill:
                auto = getattr(sh, "auto_shape_type", None)
                name = str(auto) if auto else ""
                if "OVAL" in name: d.ellipse([x, y, x + w, y + h], fill=fill)
                elif "ROUNDED" in name: d.rounded_rectangle([x, y, x + w, y + h], radius=int(0.12 * DPI), fill=fill)
                else: d.rectangle([x, y, x + w, y + h], fill=fill)
            if not sh.has_text_frame or not sh.text_frame.text.strip(): continue
            tf = sh.text_frame
            ph = PH.get((lay, "title" if sh.is_placeholder and sh.placeholder_format.type in (1, 3) else "body")) if sh.is_placeholder else None
            inset_l = px(tf.margin_left) if tf.margin_left is not None else int(0.1 * DPI)
            inset_t = px(tf.margin_top) if tf.margin_top is not None else int(0.05 * DPI)
            if sh.is_placeholder: inset_l, inset_t = int(0.1 * DPI), int(0.05 * DPI)
            boxw = w - 2 * inset_l
            rendered = []
            for p in tf.paragraphs:
                text = "".join(r.text for r in p.runs)
                if not p.runs: text = p.text
                r0 = p.runs[0] if p.runs else None
                size = (r0.font.size.pt if r0 is not None and r0.font.size else None) or (ph[0] if ph else 14)
                bold = (r0.font.bold if r0 is not None and r0.font.bold is not None else (ph[1] if ph else False))
                col = (color_of(r0.font.color) if r0 is not None else None) or ("#" + ph[2] if ph else "#0E1A24")
                bullet = p._p.pPr is not None and p._p.pPr.find("{http://schemas.openxmlformats.org/drawingml/2006/main}buChar") is not None
                indent = int(0.3 * DPI) if bullet else 0
                f = font(size, bold)
                for ln in wrap(text, f, boxw - indent):
                    rendered.append((ln, f, col, size, indent, bullet))
                    bullet = False
            lh = lambda size: size * 1.2 * DPI / 72
            total = sum(lh(r[3]) for r in rendered) + inset_t * 2
            if total > h + 2:
                problems.append(f"{si}: 넘침 {sh.name} 필요 {total/DPI:.2f}in > 상자 {h/DPI:.2f}in :: {tf.text[:30]!r}")
            anchor = tf.vertical_anchor
            ty = y + inset_t
            if anchor is not None and int(anchor) == 3: ty = y + (h - total) / 2 + inset_t  # middle
            if anchor is not None and int(anchor) == 4: ty = y + h - total + inset_t        # bottom
            for ln, f, col, size, indent, bl in rendered:
                align = p.alignment
                tx = x + inset_l + indent
                if bl: d.text((tx - int(0.2 * DPI), ty), "•", font=f, fill=col)
                d.text((tx, ty), ln, font=f, fill=col)
                ty += lh(size)
        img.save(f"{outprefix}-{si:02d}.png")
    print("\n".join(problems) if problems else "넘침·화면 밖 없음")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
