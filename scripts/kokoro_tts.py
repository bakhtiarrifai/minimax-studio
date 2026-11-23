"""Local text-to-speech with Kokoro-82M (ONNX), for content other than the Indonesian series (which uses Google TTS Leda).

Kokoro has no Indonesian voice: English (a/b voices), plus Japanese, Mandarin, Spanish, French, Hindi, Italian and
Portuguese. Runs on the CPU in ComfyUI's Python; models in ComfyUI/models/tts/kokoro (kokoro-v1.0.onnx,
voices-v1.0.bin from github.com/thewh1teagle/kokoro-onnx, model by hexgrad, Apache-2.0).

  python -I scripts/kokoro_tts.py --text "Hello there." --out hello.wav [--voice af_heart] [--speed 1.0] [--lang en-us]
  python -I scripts/kokoro_tts.py --list-voices
"""
import argparse
import os
import sys
import time

MODELS = os.environ.get("KOKORO_MODELS", r"C:\Projects\ComfyUI\ComfyUI\models\tts\kokoro")

p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
p.add_argument("--text")
p.add_argument("--file", help="read the text from this UTF-8 file")
p.add_argument("--out", default="kokoro.wav")
p.add_argument("--voice", default="af_heart")
p.add_argument("--speed", type=float, default=1.0)
p.add_argument("--lang", default="en-us")
p.add_argument("--list-voices", action="store_true")
a = p.parse_args()

import soundfile as sf
from kokoro_onnx import Kokoro

k = Kokoro(os.path.join(MODELS, "kokoro-v1.0.onnx"), os.path.join(MODELS, "voices-v1.0.bin"))
if a.list_voices:
    print(" ".join(sorted(k.get_voices())))
    sys.exit(0)
text = open(a.file, encoding="utf-8").read() if a.file else a.text
if not text:
    sys.exit("give --text or --file")
t = time.time()
samples, rate = k.create(text, voice=a.voice, speed=a.speed, lang=a.lang)
sf.write(a.out, samples, rate)
print(f"saved {a.out}: {len(samples) / rate:.1f} s at {rate} Hz, voice {a.voice}, in {time.time() - t:.1f} s")
