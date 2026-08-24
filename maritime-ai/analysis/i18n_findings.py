#!/usr/bin/env python3
"""Pre-translate the analysis findings (title + inference) into Hindi and
Gujarati via the local Claude CLI, for the portal's language switcher.
Output: analysis/out_mundra/findings_i18n.json  {"hi": {id: {title, inference}}, "gu": {...}}
"""
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out_mundra")

LANG_NAME = {"hi": "Hindi (Devanagari)", "gu": "Gujarati"}


def cli(prompt, system):
    env = {k: os.environ[k] for k in
           ("HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TZ", "PATH") if k in os.environ}
    env.update({"TERM": "dumb", "NO_COLOR": "1"})
    r = subprocess.run(["claude", "-p", "--model", "sonnet",
                        "--append-system-prompt", system, prompt],
                       capture_output=True, text=True, timeout=600, env=env,
                       stdin=subprocess.DEVNULL)
    return r.stdout.strip()


def main():
    findings = json.load(open(os.path.join(OUT, "findings.json")))["findings"]
    items = [{"id": f["id"], "title": f["title"], "inference": f["inference"]}
             for f in findings]
    result = {}
    for lang in ("hi", "gu"):
        system = (
            f"You are a professional translator for Mundra Port operations material. "
            f"Translate each finding's title and inference into {LANG_NAME[lang]} for "
            f"port officers. Keep maritime technical terms (berth, turnaround, "
            f"anchorage, PSC, detention, TEU, laytime, bunkering, MARPOL, ISPS) "
            f"transliterated in the target script as Indian port staff say them in "
            f"practice. Keep ALL numbers, percentages, terminal names, berth codes "
            f"and vessel names unchanged. Return ONLY a JSON object mapping "
            f"id → {{\"title\": ..., \"inference\": ...}}. No text outside the JSON.")
        text = cli(json.dumps(items, ensure_ascii=False), system)
        m = re.search(r"\{.*\}", text, re.S)
        result[lang] = json.loads(m.group(0)) if m else {}
        print(f"{lang}: {len(result[lang])} findings translated", flush=True)
    with open(os.path.join(OUT, "findings_i18n.json"), "w") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print("saved findings_i18n.json")


if __name__ == "__main__":
    main()
