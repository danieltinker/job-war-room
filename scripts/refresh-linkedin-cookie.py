#!/usr/bin/env python3
"""
Refresh the war room's LinkedIn li_at cookie from your browser — no manual work.

Reads the li_at cookie straight out of your browser's cookie store (the same
session you already have open — no automated LinkedIn login, which would risk
the account) and pushes it into the war room's encrypted settings.

Setup (once):
    pip3 install browser-cookie3

Usage:
    WARROOM_URL=http://localhost:3000 \
    ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... \
    python3 scripts/refresh-linkedin-cookie.py

Credentials can also live in a .env file next to the repo root; see README.
Schedule daily with launchd (macOS) or cron — template in scripts/.
"""
import json
import os
import sys
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path


def load_dotenv() -> None:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"'))


def find_li_at() -> str | None:
    try:
        import browser_cookie3
    except ImportError:
        sys.exit("browser_cookie3 not installed — run: pip3 install browser-cookie3")

    loaders = [
        ("chrome", browser_cookie3.chrome),
        ("brave", getattr(browser_cookie3, "brave", None)),
        ("edge", getattr(browser_cookie3, "edge", None)),
        ("firefox", browser_cookie3.firefox),
        ("safari", getattr(browser_cookie3, "safari", None)),
    ]
    for name, loader in loaders:
        if loader is None:
            continue
        try:
            jar = loader(domain_name="linkedin.com")
            for cookie in jar:
                if cookie.name == "li_at" and cookie.value:
                    print(f"found li_at in {name}")
                    return cookie.value
        except Exception:
            continue  # browser not installed / locked — try the next one
    return None


def main() -> None:
    load_dotenv()
    base = os.environ.get("WARROOM_URL", "http://localhost:3000").rstrip("/")
    email = os.environ.get("ADMIN_EMAIL")
    password = os.environ.get("ADMIN_PASSWORD")
    if not email or not password:
        sys.exit("Set ADMIN_EMAIL and ADMIN_PASSWORD (env or .env)")

    li_at = find_li_at()
    if not li_at:
        sys.exit("li_at not found in any browser — are you logged in to linkedin.com?")

    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    login = urllib.request.Request(
        f"{base}/api/auth/login",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with opener.open(login) as res:
        if res.status != 200:
            sys.exit(f"war room login failed: HTTP {res.status}")

    update = urllib.request.Request(
        f"{base}/api/settings",
        data=json.dumps({"linkedin.li_at": li_at}).encode(),
        headers={"content-type": "application/json"},
        method="PUT",
    )
    with opener.open(update) as res:
        if res.status != 200:
            sys.exit(f"settings update failed: HTTP {res.status}")

    print("li_at refreshed in war room settings ✓")


if __name__ == "__main__":
    main()
