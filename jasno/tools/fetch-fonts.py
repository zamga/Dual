#!/usr/bin/env python3
"""Download Google Fonts (latin + latin-ext woff2 subsets) into shared/fonts and write
one self-hosted @font-face stylesheet per family. Run once; output is committed."""
import pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent / "shared" / "fonts"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
FAMILIES = {
    "mona-sans": "Mona+Sans:wdth,wght@75..125,200..900",
    "ibm-plex-mono": "IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400",
    "instrument-serif": "Instrument+Serif:ital@0;1",
    "geist": "Geist:wght@100..900",
    "geist-mono": "Geist+Mono:wght@100..900",
    "noto-serif-display": "Noto+Serif+Display:ital,wdth,wght@0,62.5..100,100..900;1,62.5..100,100..900",
    "schibsted-grotesk": "Schibsted+Grotesk:ital,wght@0,400..900;1,400..900",
    "big-shoulders-display": "Big+Shoulders+Display:wght@100..900",
    "jetbrains-mono": "JetBrains+Mono:ital,wght@0,100..800;1,100..800",
}
KEEP = {"latin", "latin-ext"}

def curl(url: str, out: pathlib.Path | None = None) -> str:
    cmd = ["curl", "-sSfL", "-A", UA, url]
    if out:
        subprocess.run(cmd + ["-o", str(out)], check=True)
        return ""
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout

def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    for slug, query in FAMILIES.items():
        css = curl(f"https://fonts.googleapis.com/css2?family={query}&display=swap")
        blocks = re.findall(r"/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*{[^}]+})", css)
        out_css = [f"/* {slug}: self-hosted from Google Fonts (SIL OFL 1.1). latin + latin-ext only. */"]
        n = 0
        for subset, block in blocks:
            if subset not in KEEP:
                continue
            style = re.search(r"font-style:\s*(\w+)", block).group(1)
            weight = re.search(r"font-weight:\s*([\d ]+);", block).group(1).strip().replace(" ", "-")
            url = re.search(r"url\((https://[^)]+\.woff2)\)", block).group(1)
            fname = f"{slug}-{style}-{weight}-{subset}.woff2"
            if not (ROOT / fname).exists():
                curl(url, ROOT / fname)
            out_css.append(f"/* {subset} */\n" + block.replace(url, fname))
            n += 1
        (ROOT / f"{slug}.css").write_text("\n".join(out_css) + "\n")
        print(f"{slug}: {n} faces")

if __name__ == "__main__":
    sys.exit(main())
