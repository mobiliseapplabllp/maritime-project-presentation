"""
RAG retrieval for "talk to the documents" — Claude-CLI-native, no Ollama.

Retrieval = BM25 keyword index over the chunked document library (pure
numpy/python, built in-process from index/chunks.json) + Sagar Drishti (Claude
CLI) query expansion: the user's question is rewritten into search terms by
the same engine that answers, so paraphrased questions still find the right
passages. No embedding service is required at query time.
"""
import json
import math
import os
import re
import threading

import numpy as np

from . import claude_cli, config

KNOW = os.path.join(config.PROJECT_ROOT, "data", "knowledge")
IDX = os.path.join(KNOW, "index")

_LOCK = threading.Lock()
_STATE = {"loaded": False, "chunks": None, "meta": None,
          "postings": None, "doclen": None, "avgdl": None, "N": 0}

_STOP = {"the", "and", "for", "what", "how", "who", "whom", "which", "should",
         "does", "are", "was", "were", "with", "about", "into", "from", "that",
         "this", "their", "there", "when", "where", "why", "can", "could",
         "would", "each", "per", "any", "all", "has", "have", "had", "not",
         "but", "you", "your", "its", "than", "then", "them", "they", "will",
         "may", "must", "one", "two", "also", "such", "these", "those", "been"}

_K1, _B = 1.5, 0.75


def _tokens(text):
    return [t for t in re.findall(r"[a-z0-9]+", text.lower())
            if len(t) >= 3 and t not in _STOP]


def _load():
    with _LOCK:
        if _STATE["loaded"] and _STATE["chunks"] is not None:
            return
        try:
            chunks = json.load(open(os.path.join(IDX, "chunks.json")))
            try:
                meta = json.load(open(os.path.join(IDX, "meta.json")))
            except Exception:
                meta = {}
            # build BM25 postings: token -> (row_ids, term_freqs)
            tmp = {}
            doclen = np.zeros(len(chunks), dtype=np.float32)
            for i, c in enumerate(chunks):
                toks = _tokens(c["text"])
                # field boost: the document title's terms count 4× — a chunk from
                # a specific manual title should win a generic query
                title_toks = _tokens(c.get("title", "")) * 4
                doclen[i] = len(toks) + len(title_toks)
                counts = {}
                for t in toks + title_toks:
                    counts[t] = counts.get(t, 0) + 1
                for t, n in counts.items():
                    tmp.setdefault(t, ([], []))
                    tmp[t][0].append(i)
                    tmp[t][1].append(n)
            postings = {t: (np.array(rows, dtype=np.int32),
                            np.array(tfs, dtype=np.float32))
                        for t, (rows, tfs) in tmp.items()}
            _STATE.update(loaded=True, chunks=chunks, meta=meta,
                          postings=postings, doclen=doclen,
                          avgdl=float(doclen.mean() or 1.0), N=len(chunks))
        except Exception:
            # don't cache failure — retry on next call (index may still be building)
            _STATE.update(loaded=False, chunks=None, meta=None,
                          postings=None, doclen=None, avgdl=None, N=0)


def reload_index():
    with _LOCK:
        _STATE["loaded"] = False
    _load()


def available():
    _load()
    return bool(_STATE["chunks"])


def status():
    _load()
    meta = _STATE["meta"] or {}
    manifest_path = os.path.join(KNOW, "manifest.json")
    n_docs = 0
    if os.path.exists(manifest_path):
        try:
            n_docs = len(json.load(open(manifest_path)))
        except Exception:
            pass
    return {"available": available(),
            "retrieval": "on-machine keyword index (BM25) + Sagar Drishti query expansion",
            "chunks": _STATE["N"] or meta.get("chunks"),
            "indexed_docs": meta.get("docs"), "library_docs": n_docs,
            "built": meta.get("built")}


def _expand_query(query):
    """Ask the Sagar Drishti engine (Claude CLI) for retrieval keywords.
    Returns [] on any failure — retrieval then runs on the raw query alone."""
    if not claude_cli.available():
        return []
    prompt = (
        "You expand search queries for retrieval over Mundra Port documents "
        "(marine circulars, PSC/FSI inspection procedures, HSE and spill-response SOPs, "
        "tariff schedules, berthing policies, MARPOL/ISPS guidance, concession papers). "
        "For the query below, return ONLY a JSON array of 8-14 single "
        "keywords (lowercase; include exact acronyms, synonyms, and the official "
        "maritime terms an Indian port document would use; include key Gujarati "
        "or Hindi terms in Latin script only if very common). No explanations.\n\n"
        f"Query: {query}")
    try:
        text = claude_cli.complete(prompt, model="haiku", timeout=45).strip()
        m = re.search(r"\[.*\]", text, re.S)
        terms = json.loads(m.group(0)) if m else []
        out = []
        for t in terms:
            out.extend(_tokens(str(t)))
        return list(dict.fromkeys(out))[:16]
    except Exception:
        return []


def _bm25(terms_weighted):
    """Score all chunks for {term: weight}; returns a score vector."""
    N, avgdl = _STATE["N"], _STATE["avgdl"]
    doclen = _STATE["doclen"]
    scores = np.zeros(N, dtype=np.float32)
    for t, w in terms_weighted.items():
        p = _STATE["postings"].get(t)
        if p is None:
            continue
        rows, tf = p
        df = len(rows)
        idf = math.log(1 + (N - df + 0.5) / (df + 0.5))
        denom = tf + _K1 * (1 - _B + _B * doclen[rows] / avgdl)
        scores[rows] += w * idf * (tf * (_K1 + 1)) / denom
    return scores


def search(query, k=6):
    """Top-k chunks: BM25 over (original terms ×2 + Sagar-Drishti-expanded terms)."""
    _load()
    if not _STATE["chunks"]:
        return []
    terms = {}
    for t in _tokens(query):
        terms[t] = 2.0  # the user's own words dominate
    for t in _expand_query(query):
        terms.setdefault(t, 1.0)
    if not terms:
        return []
    scores = _bm25(terms)
    top = np.argsort(-scores)[: k * 4]
    out, per_doc = [], {}
    for i in top:
        if scores[int(i)] <= 0:
            break
        c = _STATE["chunks"][int(i)]
        if per_doc.get(c["doc"], 0) >= 2:  # max 2 chunks per document
            continue
        per_doc[c["doc"]] = per_doc.get(c["doc"], 0) + 1
        out.append({**c, "score": round(float(scores[int(i)]), 2)})
        if len(out) >= k:
            break
    return out
