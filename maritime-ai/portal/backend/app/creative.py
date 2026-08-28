"""
Sagar Drishti creative studio — flyers/posters/social graphics as real images.

Flow: detect a creative request in chat → Sagar Drishti (Claude CLI) designs a
self-contained HTML flyer + caption → headless Chrome renders it to PNG →
the chat response carries the image + download links + ready-to-post caption.
"""
import json
import os
import re
import subprocess
import time
import uuid

from . import claude_cli, config

ASSETS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "generated_assets")
os.makedirs(ASSETS_DIR, exist_ok=True)

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

_CREATIVE_RE = re.compile(
    r"\b(flyer|poster|banner|pamphlet|leaflet|creative|infographic|invitation|"
    r"social media (post|image|graphic)|whatsapp (image|post|creative|graphic)|"
    r"graphic for|image (for|to share)|design (a|an|the))\b", re.I)


def is_creative_request(msg: str) -> bool:
    return bool(_CREATIVE_RE.search(msg or ""))


def _size_for(msg: str):
    m = (msg or "").lower()
    if any(k in m for k in ("story", "portrait", "reel", "status")):
        return 1080, 1350
    if any(k in m for k in ("a4", "print", "wall poster")):
        return 1240, 1754
    return 1080, 1080  # square — WhatsApp / Instagram / X


_SYSTEM = """You are Sagar Drishti's creative studio inside Sagar Drishti (Maritime AI Analytics). You design production-quality awareness creatives for port and terminal staff — HSE/PPE safety posters, spill-drill and near-miss reporting reminders, PSC-readiness checklists, berth-window/ETA discipline notices, garbage-segregation (MARPOL) how-tos — for print, WhatsApp and notice boards.

Return your output STRICTLY in this exact format, nothing before or after:
===HTML===
<one complete self-contained HTML document>
===CAPTION===
<the ready-to-post caption>
===END===

HTML rules:
- The <body> must have margin:0 and contain ONE root element exactly {W}px x {H}px — the artwork itself, filling the full canvas edge-to-edge (it will be screenshotted at that size).
- Inline CSS only. system-ui font stack only (Gujarati and Hindi text render fine in system fonts). NO external fonts, NO external images, NO JavaScript. Emoji are allowed and encouraged as icons.
- Rich, warm, maritime-campaign aesthetic: strong colour, generous hierarchy, big headline, clear sections, footer branding strip. It must look like a finished designer poster, not a webpage.
- Brand it: "Sagar Drishti · Maritime AI Analytics". Never mention Claude, AI engines, tools, files, or permissions.
- Audience-first language: English prominent, Gujarati supporting. Port-staff-facing tone — simple, direct, actionable.
- Statistics: use ONLY figures given in GROUNDING (if any) and only where they help the message. Never invent numbers.

CAPTION rules: bilingual (English first, Gujarati second), short lines, 3-5 ✅ points, a call to action (report every near miss, keep the berth window, don't wait), and hashtags (#SagarDrishti #PortSafety plus topic tags). Ready to paste into WhatsApp."""


def _parse(text):
    h = re.search(r"===HTML===\s*(.*?)\s*===CAPTION===", text, re.S)
    c = re.search(r"===CAPTION===\s*(.*?)\s*(?:===END===|$)", text, re.S)
    html = h.group(1).strip() if h else None
    caption = c.group(1).strip() if c else ""
    if html:
        html = re.sub(r"^```(?:html)?\s*|\s*```$", "", html.strip(), flags=re.S)
    return html, caption


def _render_png(html_path, png_path, w, h):
    cmd = [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
           "--force-device-scale-factor=2", f"--window-size={w},{h}",
           f"--screenshot={png_path}", f"file://{os.path.abspath(html_path)}"]
    subprocess.run(cmd, capture_output=True, timeout=60)
    return os.path.exists(png_path) and os.path.getsize(png_path) > 10000


_CREATIVE_LANG = {
    "hi": "\n\nLANGUAGE PRIORITY: make HINDI the primary language of the artwork and caption (English secondary).",
    "gu": "\n\nLANGUAGE PRIORITY: make GUJARATI the primary language of the artwork and caption (English secondary).",
}


def make_asset(msg: str, grounding: str = "", lang: str = "en"):
    """Generate a creative asset. Returns (reply_markdown, asset_dict|None)."""
    w, h = _size_for(msg)
    system = (_SYSTEM.replace("{W}", str(w)).replace("{H}", str(h))
              + _CREATIVE_LANG.get(lang, ""))
    prompt = f"Design request: {msg}\n\nGROUNDING (verified figures you may use):\n{grounding or '(none — design without statistics)'}"
    text = claude_cli.complete(prompt, system=system, timeout=300)
    html, caption = _parse(text)
    if not html:
        return None, None

    slug = re.sub(r"[^a-z0-9]+", "-", (msg or "creative").lower()).strip("-")[:40]
    uid = f"{slug}-{uuid.uuid4().hex[:6]}"
    html_path = os.path.join(ASSETS_DIR, f"{uid}.html")
    png_path = os.path.join(ASSETS_DIR, f"{uid}.png")
    with open(html_path, "w") as f:
        f.write(html)

    png_ok = False
    try:
        if os.path.exists(CHROME):
            png_ok = _render_png(html_path, png_path, w, h)
    except Exception:
        png_ok = False

    asset = {
        "title": msg[:80],
        "png_url": f"/api/assets/{uid}.png" if png_ok else None,
        "html_url": f"/api/assets/{uid}.html",
        "caption": caption,
        "width": w, "height": h,
        "created": time.strftime("%Y-%m-%d %H:%M"),
    }
    reply = (
        f"Here is your creative — rendered at {w}×{h}px, ready for WhatsApp and social media.\n\n"
        f"**How to use it:** download the image below and share it directly; the caption is "
        f"ready to paste alongside it. If you'd like a different size (portrait story, A4 wall "
        f"poster), a different language mix, or content changes — just ask."
    )
    if not png_ok:
        reply += "\n\n*The image renderer was unavailable, so the flyer is attached as an HTML file — open it in a browser and screenshot it.*"
    return reply, asset
