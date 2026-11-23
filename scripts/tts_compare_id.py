"""Indonesian TTS comparison: the same text through the local engines, for listening side by side with Leda.

  python -I scripts/tts_compare_id.py --out <folder> [--text "..."] [--engines piper,mms]

Engines (models under ComfyUI/models/TTS):
  piper  Piper id_ID-news_tts-medium (ONNX, CPU). Code MIT; the voice's dataset license is unclear.
  mms    Meta MMS facebook/mms-tts-ind (VITS, transformers). CC-BY-NC-4.0: not for monetised content.
Chatterbox-TTS-Indonesian runs through ComfyUI (TTS-Audio-Suite), see scripts/chatterbox_id.mjs.
"""
import argparse
import os
import time
import wave

MODELS = os.environ.get("TTS_MODELS", r"C:\Projects\ComfyUI\ComfyUI\models\TTS")
DEFAULT = ("Pernah nggak, pendapatmu ditanya orang dewasa? Sahl bin Sa'd bercerita: Rasulullah shallallahu alaihi "
           "wasallam diberi minuman. Di kanan beliau ada seorang anak, di kiri para sahabat senior.")

p = argparse.ArgumentParser()
p.add_argument("--out", required=True)
p.add_argument("--text", default=DEFAULT)
p.add_argument("--engines", default="piper,mms")
a = p.parse_args()
os.makedirs(a.out, exist_ok=True)


def piper(text, path):
    from piper import PiperVoice
    voice = PiperVoice.load(os.path.join(MODELS, "piper", "id_ID-news_tts-medium.onnx"))
    with wave.open(path, "wb") as w:
        voice.synthesize_wav(text, w)


def mms(text, path):
    import numpy as np
    import soundfile as sf
    import torch
    from transformers import AutoTokenizer, VitsModel
    d = os.path.join(MODELS, "mms-tts-ind")
    model, tok = VitsModel.from_pretrained(d), AutoTokenizer.from_pretrained(d)
    torch.manual_seed(1)
    with torch.no_grad():
        wav = model(**tok(text, return_tensors="pt")).waveform[0].numpy()
    sf.write(path, np.asarray(wav, dtype="float32"), model.config.sampling_rate)


for name in a.engines.split(","):
    out = os.path.join(a.out, f"id_{name}.wav")
    t = time.time()
    try:
        {"piper": piper, "mms": mms}[name](a.text, out)
        print(f"{name}: {out} in {time.time() - t:.1f} s")
    except Exception as e:  # keep going with the other engines
        print(f"{name}: FAILED {type(e).__name__}: {e}")
