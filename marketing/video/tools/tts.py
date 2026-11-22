#!/usr/bin/env python3
"""narration.json -> audio/<영상>-<번호>.flac (Gemini TTS).
GEMINI_API_KEY 환경변수가 필요해요(클라우드 작업환경에서는 프록시가 자동으로 넣어 줘요).
이미 만든 줄은 건너뛰어요. 다시 만들려면 해당 wav를 지우고 실행."""
import json, base64, os, subprocess, sys, urllib.request, hashlib
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
MODEL = os.environ.get("TTS_MODEL", "gemini-2.5-flash-preview-tts")
data = json.load(open(os.path.join(ROOT, "narration.json"), encoding="utf8"))
key = os.environ.get("GEMINI_API_KEY", "dummy")
out = os.path.join(ROOT, "audio"); os.makedirs(out, exist_ok=True)
only = sys.argv[1:]
for vid, spec in data.items():
    if vid.startswith("_") or (only and vid not in only): continue
    for i, line in enumerate(spec["lines"], 1):
        h = hashlib.md5((spec["voice"] + spec["style"] + line).encode()).hexdigest()[:8]
        wav = os.path.join(out, f"{vid}-{i:02d}.flac"); tag = wav + ".src"
        if os.path.exists(wav) and os.path.exists(tag) and open(tag).read() == h: continue
        body = {"contents": [{"parts": [{"text": f"{spec['style']}: {line}"}]}],
                "generationConfig": {"responseModalities": ["AUDIO"],
                  "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": spec["voice"]}}}}}
        req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
              data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": key})
        for attempt in range(4):
            try:
                d = json.load(urllib.request.urlopen(req, timeout=120)); break
            except Exception as e:
                print("retry", vid, i, e); import time; time.sleep(5 * (attempt + 1))
        pcm = base64.b64decode(d["candidates"][0]["content"]["parts"][0]["inlineData"]["data"])
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "-",
                        "-af", "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse",
                        "-ar", "24000", wav], input=pcm, check=True)
        open(tag, "w").write(h)
        print("ok", os.path.basename(wav))
# 길이 표
lens = {}
for f in sorted(os.listdir(out)):
    if f.endswith(".flac"):
        r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", os.path.join(out, f)], capture_output=True, text=True)
        lens[f[:-5]] = round(float(r.stdout), 2)
json.dump(lens, open(os.path.join(out, "durations.json"), "w"), indent=1)
print(json.dumps(lens, ensure_ascii=False))
