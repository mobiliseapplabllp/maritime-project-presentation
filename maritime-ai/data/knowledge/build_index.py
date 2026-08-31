#!/usr/bin/env python3
"""
RAG index builder — extract text, chunk, persist the retrieval index.

  docs/ + manifest.json  →  index/chunks.json (+ optional embeddings.npz)

- Text extraction: PyMuPDF (fitz) for PDFs, plain read for .txt
- Chunking: ~1600 chars with 200-char overlap, page-tracked
- The portal's retrieval is Claude-CLI-native (BM25 keyword index built
  in-process from chunks.json + Clarity AI query expansion) — EMBEDDINGS ARE
  OPTIONAL. If a local Ollama server happens to be running, vectors are also
  written for future use; if not, the chunk index alone is fully sufficient.
"""
import json
import os
import re
import time
import urllib.request

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.join(HERE, "docs")
IDX = os.path.join(HERE, "index")
os.makedirs(IDX, exist_ok=True)

OLLAMA = "http://localhost:11434"
EMBED_MODEL = "nomic-embed-text"
CHUNK_CHARS = 1600
OVERLAP = 200
MAX_PAGES_PER_DOC = 120   # giant survey reports: index the front matter + key findings
MAX_CHUNKS_PER_DOC = 220


def embed(text):
    # nomic-embed-text requires task prefixes for retrieval quality
    body = json.dumps({"model": EMBED_MODEL,
                       "prompt": "search_document: " + text[:8000]}).encode()
    req = urllib.request.Request(f"{OLLAMA}/api/embeddings", data=body,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())["embedding"]


def pdf_pages(path):
    import fitz
    doc = fitz.open(path)
    pages = []
    for i, page in enumerate(doc, 1):
        if i > MAX_PAGES_PER_DOC:
            break
        t = page.get_text("text")
        t = re.sub(r"[ \t]+", " ", t)
        t = re.sub(r"\n{3,}", "\n\n", t).strip()
        if t:
            pages.append((i, t))
    doc.close()
    return pages


def chunk_pages(pages):
    """Yield (page, chunk_text) — merge small pages, split large ones."""
    buf, buf_page = "", None
    for pno, text in pages:
        if buf_page is None:
            buf_page = pno
        buf += ("\n\n" if buf else "") + text
        while len(buf) >= CHUNK_CHARS:
            yield (buf_page, buf[:CHUNK_CHARS])
            buf = buf[CHUNK_CHARS - OVERLAP:]
            buf_page = pno
    if buf.strip():
        yield (buf_page or 1, buf)


def ollama_up():
    try:
        with urllib.request.urlopen(f"{OLLAMA}/api/tags", timeout=3) as r:
            return EMBED_MODEL.split(":")[0] in r.read().decode()
    except Exception:
        return False


def main():
    manifest = json.load(open(os.path.join(HERE, "manifest.json")))
    chunks, vectors = [], []
    t0 = time.time()
    skipped = []
    do_embed = ollama_up()
    print(f"embeddings: {'ON (ollama detected)' if do_embed else 'OFF (chunks-only index — sufficient for the portal)'}", flush=True)
    for d in manifest:
        path = os.path.join(DOCS, d["id"])
        if not os.path.exists(path):
            continue
        try:
            if path.endswith(".pdf"):
                pages = pdf_pages(path)
            else:
                with open(path, encoding="utf-8", errors="ignore") as f:
                    pages = [(1, f.read())]
        except Exception as e:
            skipped.append((d["id"], str(e)[:60]))
            continue
        total_text = sum(len(t) for _, t in pages)
        if total_text < 200:  # scanned/image-only PDF
            skipped.append((d["id"], f"no extractable text ({total_text} chars)"))
            continue
        # weak anchor-text titles ("View", "Download") → derive from page 1
        title = d["title"]
        if len(title) < 6 or title.lower() in ("view", "download", "click here", "pdf"):
            first = re.sub(r"\s+", " ", pages[0][1])[:100].strip()
            title = first or os.path.basename(d["id"])
            d = {**d, "title": title}
        n_before = len(chunks)
        for page, text in chunk_pages(pages):
            if len(chunks) - n_before >= MAX_CHUNKS_PER_DOC:
                break
            if len(text.strip()) < 80:
                continue
            if do_embed:
                try:
                    vectors.append(embed(text))
                except Exception as e:
                    skipped.append((d["id"], f"embed fail p{page}: {str(e)[:40]}"))
                    break
            chunks.append({"doc": d["id"], "title": d["title"], "url": d["url"],
                           "source": d["source"], "category": d["category"],
                           "page": page, "text": text.strip()})
        print(f"  {d['id'][:60]:62s} +{len(chunks)-n_before:4d} chunks "
              f"({len(chunks)} total, {time.time()-t0:.0f}s)", flush=True)

    if do_embed and vectors:
        X = np.array(vectors, dtype=np.float32)
        X /= (np.linalg.norm(X, axis=1, keepdims=True) + 1e-9)  # L2-normalise
        np.savez_compressed(os.path.join(IDX, "embeddings.npz"), X=X)
    with open(os.path.join(IDX, "chunks.json"), "w") as f:
        json.dump(chunks, f)
    with open(os.path.join(IDX, "meta.json"), "w") as f:
        json.dump({"retrieval": "bm25+claude-cli-expansion",
                   "embeddings": bool(do_embed and vectors),
                   "chunks": len(chunks),
                   "docs": len({c['doc'] for c in chunks}),
                   "built": time.strftime("%Y-%m-%d %H:%M"),
                   "skipped": skipped}, f, indent=1)
    print(f"\nINDEX DONE: {len(chunks)} chunks from "
          f"{len({c['doc'] for c in chunks})} docs in {time.time()-t0:.0f}s; "
          f"skipped {len(skipped)}", flush=True)


if __name__ == "__main__":
    main()
