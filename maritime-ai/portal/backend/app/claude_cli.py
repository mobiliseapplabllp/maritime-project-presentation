"""
Local Claude Code CLI provider — OAuth-authenticated `claude -p` subprocess.

Mirrors the tender-radar `claude_cli` provider: no API key needed, uses the
operator's `claude login` session. The system prompt is prepended to the user
prompt (the CLI has no stable --system flag); large prompts go via a temp file
+ @path Read reference; the subprocess runs with a minimal env allowlist so no
stray env var flips the CLI into API-auth mode (HOME carries the OAuth token at
$HOME/.claude/.credentials.json).
"""
import os
import shlex
import shutil
import subprocess
import tempfile

from . import config

_ARGV_PROMPT_LIMIT = 32 * 1024
_ENV_ALLOWLIST = ("HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TZ", "PATH")


def available() -> bool:
    """True if the claude binary resolves on PATH."""
    return shutil.which(config.CLAUDE_BINARY) is not None


def _clean_env() -> dict:
    env = {k: os.environ[k] for k in _ENV_ALLOWLIST if k in os.environ}
    env["TERM"] = "xterm-256color"
    env["NO_COLOR"] = "1"
    env["FORCE_COLOR"] = "0"
    if not env.get("PATH"):
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
    if config.CLAUDE_HOME.strip():
        env["HOME"] = config.CLAUDE_HOME.strip()
    if not env.get("HOME"):
        try:
            import pwd
            env["HOME"] = pwd.getpwuid(os.getuid()).pw_dir
        except Exception:
            pass
    return env


def complete(prompt: str, *, system: str = "", timeout: int = None, model: str = None,
             web: bool = False) -> str:
    """Run `claude -p` and return the assistant text. Raises on failure.

    web=True allows the CLI's WebSearch/WebFetch tools — used ONLY by the
    market-intelligence research agent. The grounded analysis paths must stay
    web=False so port-operations numbers are never mixed with live internet text.
    """
    binary = config.CLAUDE_BINARY
    timeout_s = timeout or config.CLAUDE_TIMEOUT_S
    use_model = (model or config.CLAUDE_MODEL).strip()
    full_prompt = prompt if not system else f"{system}\n\n---\n\n{prompt}"

    temp_path = None
    # web runs: never use the @file indirection (it needs the Read tool, which web
    # runs deliberately disallow); research prompts are small, argv is fine.
    use_temp = len(full_prompt.encode("utf-8")) > _ARGV_PROMPT_LIMIT and not web
    if use_temp:
        try:
            prompt_dir = os.path.join(os.getcwd(), ".claude_prompts")
            os.makedirs(prompt_dir, exist_ok=True)
            fd, temp_path = tempfile.mkstemp(suffix=".txt", prefix="sagar_prompt_",
                                             dir=prompt_dir, text=True)
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(full_prompt)
            rel = os.path.relpath(temp_path, os.getcwd())
            wrapper = (f"Read @{rel} and execute the instructions inside it exactly as if "
                       f"the file's contents had been typed directly to you here. Output ONLY "
                       f"the response the instructions ask for — do not echo the input or "
                       f"describe what you read.")
            args = [binary, "-p", wrapper]
        except Exception:
            args = [binary, "-p", full_prompt]
            temp_path = None
    else:
        args = [binary, "-p", full_prompt]

    run_cwd = None
    if use_model:
        args += ["--model", use_model]
    if web:
        # web runs process UNTRUSTED page content (indirect prompt injection), so they
        # get web tools ONLY — no file/shell tools — and an empty isolated working dir.
        args += ["--allowedTools", "WebSearch,WebFetch",
                 "--disallowedTools", "Bash,Read,Write,Edit,Glob,Grep,Task,NotebookEdit"]
        run_cwd = os.path.join(tempfile.gettempdir(), "sagar_web_research_cwd")
        try:
            os.makedirs(run_cwd, exist_ok=True)
        except Exception:
            run_cwd = None
    if config.CLAUDE_EXTRA_ARGS.strip():
        try:
            args += shlex.split(config.CLAUDE_EXTRA_ARGS)
        except ValueError:
            pass

    try:
        r = subprocess.run(args, stdin=subprocess.DEVNULL, capture_output=True,
                           text=True, timeout=timeout_s, check=False, env=_clean_env(),
                           cwd=run_cwd)
    except subprocess.TimeoutExpired as e:
        raise RuntimeError(f"Claude CLI timed out after {timeout_s}s") from e
    except FileNotFoundError as e:
        raise RuntimeError(f"Claude CLI binary not found: {binary!r}") from e
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
            except Exception:
                pass

    if r.returncode != 0:
        stderr = (r.stderr or "").strip()
        stdout = (r.stdout or "").strip()
        detail = " | ".join(p for p in (f"stderr: {stderr[:400]}" if stderr else "",
                                        f"stdout: {stdout[:400]}" if stdout else "") if p)
        raise RuntimeError(f"Claude CLI exited {r.returncode}: {detail or '(no output)'}")

    out = (r.stdout or "").strip()
    if not out:
        raise RuntimeError("Claude CLI returned empty output")
    return out
