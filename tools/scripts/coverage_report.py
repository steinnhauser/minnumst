#!/usr/bin/env python3
"""Summarise the coverage reports of `make test` as a Markdown table.

Reads coverage/api.json (pytest-cov) and coverage/frontends/coverage-summary.json
(Vitest). Prints the table, or with --readme writes it between the coverage
markers in README.md; --check fails if README.md's table is out of date.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
API_REPORT = ROOT / "coverage" / "api.json"
FRONTEND_REPORT = ROOT / "coverage" / "frontends" / "coverage-summary.json"
README = ROOT / "README.md"
START = "<!-- coverage:start -->"
END = "<!-- coverage:end -->"

# Rows in table order: the README label and the folder its Vitest files are in.
FRONTENDS = [
    ("`web/`", "web/"),
    ("`admin/`", "admin/"),
    ("`packages/`", "packages/"),
]
METRICS = ["lines", "statements", "branches", "functions"]


def percent(covered: int, total: int) -> str:
    if total == 0:
        return "—"
    # Round down, so 99.96% never shows as 100.0%.
    return f"{int(covered * 1000 / total) / 10:.1f}%"


def api_row() -> list[str]:
    totals = json.loads(API_REPORT.read_text())["totals"]
    statements = percent(totals["covered_lines"], totals["num_statements"])
    branches = percent(totals.get("covered_branches", 0), totals.get("num_branches", 0))
    # coverage.py counts statements, which are also its lines; it has no
    # function metric.
    return ["`api/`", statements, statements, branches, "—"]


def frontend_rows() -> list[list[str]]:
    files = json.loads(FRONTEND_REPORT.read_text())
    rows = []
    for label, folder in FRONTENDS:
        entries = [
            entry
            for path, entry in files.items()
            if path != "total"
            and Path(path).relative_to(ROOT).as_posix().startswith(folder)
        ]
        if not entries:
            raise SystemExit(f"No coverage entries for {folder} in {FRONTEND_REPORT}")
        rows.append(
            [label]
            + [
                percent(
                    sum(entry[metric]["covered"] for entry in entries),
                    sum(entry[metric]["total"] for entry in entries),
                )
                for metric in METRICS
            ]
        )
    return rows


def table() -> str:
    header = ["Component", "Lines", "Statements", "Branches", "Functions"]
    lines = ["| " + " | ".join(header) + " |", "|" + " --- |" * len(header)]
    for row in [api_row(), *frontend_rows()]:
        lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines)


def readme_with(content: str) -> str:
    readme = README.read_text()
    before, start, rest = readme.partition(START)
    _, end, after = rest.partition(END)
    if not start or not end:
        raise SystemExit(f"README.md needs the {START} and {END} markers.")
    return f"{before}{START}\n\n{content}\n\n{END}{after}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--readme", action="store_true", help="update README.md")
    mode.add_argument("--check", action="store_true", help="fail if README.md is stale")
    args = parser.parse_args()

    content = table()
    if args.readme:
        README.write_text(readme_with(content))
    elif args.check:
        if README.read_text() != readme_with(content):
            sys.exit("README.md's coverage table is stale: run `make coverage-readme`.")
    else:
        print(content)


if __name__ == "__main__":
    main()
