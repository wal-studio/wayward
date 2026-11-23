from pathlib import Path
import os
import re
import sys

args = [arg for arg in sys.argv[1:] if not arg.startswith("--")]
SOURCE = Path(args[0] if args else os.environ.get("WAYWARD_SOURCE_HTML", ""))
OUT = Path(args[1] if len(args) > 1 else "analysis_parts/role_map")
INCLUDE_LEGACY_SYMBOLS = "--include-legacy-symbols" in sys.argv
if not str(SOURCE) or not SOURCE.is_file():
    raise SystemExit("Provide an existing source HTML path as argv[1] or WAYWARD_SOURCE_HTML.")

ROLE_RULES = {
    "app": [r"application", r"bootstrap", r"initialize", r"mount", r"router", r"route"],
    "layout": [r"layout", r"pane", r"panel", r"sidebar", r"drawer", r"viewport", r"header", r"footer", r"portrait", r"landscape"],
    "mobile-status": [r"status", r"상태", r"energy", r"patience", r"gold", r"gauge", r"stamina", r"기력", r"인내", r"금화"],
    "movement": [r"map", r"지도", r"이동", r"위치", r"movement", r"direction", r"coordinate", r"tile"],
    "debug": [r"debug", r"toggle", r"wc2"],
    "screens": [r"screen", r"route", r"page", r"tab", r"story", r"choice", r"화면", r"이야기", r"선택"],
    "storage": [r"save", r"load", r"autosave", r"storage", r"import", r"export"],
}

LEGACY_SYMBOL_RULES = {
    "app": [r"^nce$", r"^Ihe$"],
    "layout": [r"^vle$", r"^zse$", r"^whe$", r"^The$"],
    "mobile-status": [r"^Pie$", r"^R3$"],
    "movement": [r"^jre$", r"^a5$"],
    "debug": [r"^She$"],
    "screens": [r"^Phe$", r"^zhe$", r"^Vhe$", r"^Khe$", r"^Jhe$", r"^Qhe$", r"^K5$"],
}
def find_body_end(text, open_index):
    depth = 0
    quote = None
    escape = False
    line_comment = False
    block_comment = False
    i = open_index
    while i < len(text):
        ch = text[i]
        nx = text[i + 1] if i + 1 < len(text) else ""
        if line_comment:
            if ch == "\n":
                line_comment = False
        elif block_comment:
            if ch == "*" and nx == "/":
                block_comment = False
                i += 1
        elif quote:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == quote:
                quote = None
        else:
            if ch in ("'", '"') or ord(ch) == 96:
                quote = ch
            elif ch == "/" and nx == "/":
                line_comment = True
                i += 1
            elif ch == "/" and nx == "*":
                block_comment = True
                i += 1
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return i + 1
        i += 1
    return None

raw = SOURCE.read_text(encoding="utf-8")
script_blocks = re.findall(r"<script\b[^>]*>(.*?)</script\s*>", raw, flags=re.I | re.S)
js = "\n".join(script_blocks)

found = []
for m in re.finditer(r"\bfunction\s+([A-Za-z_$][\w$]*)\s*\(", js):
    name = m.group(1)
    brace = js.find("{", m.end())
    if brace < 0:
        continue
    end = find_body_end(js, brace)
    if not end:
        continue
    body = js[m.start():end]
    line = js.count("\n", 0, m.start()) + 1
    found.append((name, line, len(body), body))

roles = {k: [] for k in ROLE_RULES}
roles["shared"] = []

for name, line, size, body in found:
    hay = name + " " + body[:12000]
    matched = []
    for role, rules in ROLE_RULES.items():
        if any(re.search(rule, hay, re.I) for rule in rules):
            matched.append(role)
    if INCLUDE_LEGACY_SYMBOLS:
        for role, rules in LEGACY_SYMBOL_RULES.items():
            if role not in matched and any(re.search(rule, name, re.I) for rule in rules):
                matched.append(role)
    if not matched:
        matched = ["shared"]
    for role in matched[:2]:
        roles[role].append((name, line, size))

OUT.mkdir(parents=True, exist_ok=True)
manifest = []
for role, rows in roles.items():
    rows.sort(key=lambda x: x[1])
    p = OUT / f"{role}.md"
    lines = [f"Role: {role}", "", f"Functions: {len(rows)}", ""]
    for name, line, size in rows:
        lines.append(f"- {name} — script line {line}, {size} chars")
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")
    manifest.append(f"- {role}: {len(rows)} functions")

(OUT / "README.md").write_text(
    "Generated semantic role map tied to the selected source and its run manifest. "
    "This directory is analysis output, not executable source or a permanent development baseline. "
    "Historical minified-symbol rules are included only when explicitly enabled.\n\n"
    + "\n".join(manifest) + "\n",
    encoding="utf-8",
)

print(f"source={SOURCE} functions={len(found)} legacy_symbol_rules={INCLUDE_LEGACY_SYMBOLS}")
print("\n".join(manifest))
