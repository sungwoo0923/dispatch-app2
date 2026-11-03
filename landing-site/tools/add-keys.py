# 홈페이지 편집기용 — index.html <body> 안의 모든 요소에 data-k="eN" 고유 번호를 붙인다.
# 이미 번호가 있는 요소는 그대로 두고, 새로 생긴 요소에만 다음 번호를 준다(저장된 편집 내용이 어긋나지 않게).
# 사용: python3 landing-site/tools/add-keys.py
import re, os
p = os.path.join(os.path.dirname(__file__), "..", "index.html")
s = open(p, encoding="utf-8").read()
b0 = s.index("<body>") + len("<body>"); b1 = s.index("</body>")
body = s[b0:b1]
used = [int(m) for m in re.findall(r'data-k="e(\d+)"', body)]
n = max(used) if used else 0
SKIP_INSIDE = {"script", "style"}
out, pos = [], 0
in_skip = None; svg_depth = 0; sprite = False
VOID = {"img", "input", "br", "hr", "meta", "link", "source", "use", "path", "circle", "rect"}
for m in re.finditer(r"<!--.*?-->|<(/?)([a-zA-Z][a-zA-Z0-9]*)((?:\"[^\"]*\"|'[^']*'|[^'\">])*)>", body, re.S):
    if m.group(0).startswith("<!--"): continue
    close, tag, attrs = m.group(1), m.group(2).lower(), m.group(3)
    if in_skip:
        if close and tag == in_skip: in_skip = None
        continue
    if tag in SKIP_INSIDE and not close:
        in_skip = tag; continue
    if tag == "svg":
        if close: svg_depth -= 1;
        else:
            if svg_depth == 0 and 'aria-hidden="true"' in attrs and 'width="0"' in attrs: sprite = True
            svg_depth += 1
            if not sprite and svg_depth == 1 and "data-k=" not in attrs:
                n += 1; out.append(body[pos:m.start(3)] + f' data-k="e{n}"'); pos = m.start(3)
        if close and svg_depth == 0: sprite = False
        continue
    if close or svg_depth > 0: continue
    if "data-k=" in attrs: continue
    n += 1
    out.append(body[pos:m.start(3)] + f' data-k="e{n}"'); pos = m.start(3)
out.append(body[pos:])
s = s[:b0] + "".join(out) + s[b1:]
open(p, "w", encoding="utf-8").write(s)
print("keys up to", n)
