import sys
from PIL import Image
OUT = __import__("os").path.join(__import__("os").path.dirname(__file__), "../../landing-site/img/")
for pair in sys.argv[1:]:
    src, name = pair.split(":")
    im = Image.open(src).convert("RGB")
    w = 2000 if im.width > 1500 else 780
    if im.width > w: im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    im.save(OUT + name + ".jpg", "JPEG", quality=84, optimize=True, progressive=True)
    print(name, im.size)
