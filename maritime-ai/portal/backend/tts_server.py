"""
Clarity Neural TTS — local neural voices (Kokoro-82M), no cloud, no API key.

Runs as a small sidecar on 127.0.0.1:8020 under its own Python 3.11 venv
(Kokoro needs >=3.10; the main backend runs on 3.9 and proxies to this).

Languages: English ('a' pipeline) and Hindi ('h' pipeline, via espeak-ng).
Gujarati is not supported by Kokoro — the portal keeps browser TTS for it.
"""
import io
import threading

import numpy as np
import soundfile as sf
from fastapi import FastAPI, Response
from pydantic import BaseModel

app = FastAPI(title="Clarity Neural TTS")

VOICES = {
    ("en", "female"): ("a", "af_heart"),
    ("en", "male"): ("a", "am_michael"),
    ("hi", "female"): ("h", "hf_alpha"),
    ("hi", "male"): ("h", "hm_omega"),
}

_pipelines = {}
_lock = threading.Lock()


def get_pipeline(lang_code):
    with _lock:
        if lang_code not in _pipelines:
            from kokoro import KPipeline
            _pipelines[lang_code] = KPipeline(lang_code=lang_code)
        return _pipelines[lang_code]


class TTSIn(BaseModel):
    text: str
    lang: str = "en"      # en | hi
    gender: str = "female"


@app.get("/status")
def status():
    return {"ok": True, "langs": ["en", "hi"],
            "loaded": list(_pipelines.keys())}


@app.post("/tts")
def tts(body: TTSIn):
    key = (body.lang if body.lang in ("en", "hi") else "en",
           body.gender if body.gender in ("female", "male") else "female")
    lang_code, voice = VOICES[key]
    pipe = get_pipeline(lang_code)
    text = (body.text or "").strip()[:1200]
    if not text:
        return Response(status_code=400)
    chunks = []
    for _, _, audio in pipe(text, voice=voice):
        if audio is not None:
            chunks.append(audio)
    if not chunks:
        return Response(status_code=500)
    wav = np.concatenate(chunks)
    buf = io.BytesIO()
    sf.write(buf, wav, 24000, format="WAV")
    return Response(content=buf.getvalue(), media_type="audio/wav")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8020, log_level="warning")
