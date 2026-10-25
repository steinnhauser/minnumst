#!/usr/bin/env python3
"""Release one component of the monorepo.

    release.py bump <component> [--increment MAJOR|MINOR|PATCH] [--dry-run]
        Work out the next version from the Conventional Commits that touched
        the component since its last tag, update its manifest and CHANGELOG.md,
        commit and tag. Never pushes.

    release.py verify <tag> --notes <file>
        Used by CI on a pushed tag: check the tag against the manifest and main,
        print step outputs and write the tag's changelog section to <file>.

Standard library only, so CI can run it with the runner's python3.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tomllib
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Component:
    manifest: str
    # Paths whose changes ship in this component's release.
    paths: tuple[str, ...]
    image: str = ""
    dockerfile: str = ""
    # Keep in step with tools/compose/local.override.yml.
    build_args: dict[str, str] = field(default_factory=dict)
    description: str = ""


FRONTEND = (
    "packages/api-client",
    "packages/static-server",
    "docker/frontend.Dockerfile",
)
FRONTEND += ("package.json", "package-lock.json", "tsconfig.base.json")
COMPONENTS = {
    "api": Component(
        manifest="api/pyproject.toml",
        paths=("api", "docker/api.Dockerfile", "pyproject.toml", "uv.lock"),
        image="minnumst-api",
        dockerfile="docker/api.Dockerfile",
        description="Minnumst API: people and append-only story revisions",
    ),
    "web": Component(
        manifest="web/package.json",
        paths=("web", *FRONTEND),
        image="minnumst-web",
        dockerfile="docker/frontend.Dockerfile",
        build_args={"APP": "web", "SERVICE_NAME": "minnumst-public"},
        description="Minnumst public archive",
    ),
    "admin": Component(
        manifest="admin/package.json",
        paths=("admin", *FRONTEND),
        image="minnumst-admin",
        dockerfile="docker/frontend.Dockerfile",
        build_args={
            "APP": "admin",
            "SERVICE_NAME": "minnumst-admin",
            "RUNTIME_CONFIG_KEYS": "VITE_API_URL DEBUG",
        },
        description="Minnumst editorial desk",
    ),
    "deploy": Component(manifest="deploy/pyproject.toml", paths=("deploy",)),
}

COMMIT = re.compile(
    r"^(?P<type>\w+)(?:\((?P<scope>[^)]*)\))?(?P<bang>!)?: (?P<desc>.+)$"
)
# Listed in release notes; only feat, fix and perf (and breaking changes) bump.
SECTIONS = {
    "feat": "Feat",
    "fix": "Fix",
    "perf": "Perf",
    "refactor": "Refactor",
    "build": "Build",
}
INCREMENTS = ("PATCH", "MINOR", "MAJOR")


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=True, capture_output=True, text=True
    ).stdout.strip()


def fail(message: str) -> None:
    sys.exit(f"release: {message}")


def read_version(component: Component) -> str:
    path = ROOT / component.manifest
    if path.suffix == ".json":
        return json.loads(path.read_text())["version"]
    return tomllib.loads(path.read_text())["project"]["version"]


def last_tag(name: str) -> str:
    tags = git("tag", "--list", f"{name}-*", "--sort=-v:refname").splitlines()
    return tags[0] if tags else ""


def commits_since(name: str, tag: str) -> list[dict[str, str]]:
    """Conventional Commits since `tag` that touched the component."""
    span = f"{tag}..HEAD" if tag else "HEAD"
    log = git("log", "--format=%s%x1f%b%x1e", span, "--", *COMPONENTS[name].paths)
    commits = []
    for entry in filter(None, (item.strip() for item in log.split("\x1e"))):
        subject, _, body = entry.partition("\x1f")
        match = COMMIT.match(subject)
        if not match:
            continue
        scope = match["scope"] or ""
        # A commit scoped to another component only touched shared files here.
        if scope in COMPONENTS and scope != name:
            continue
        breaking = bool(match["bang"]) or "BREAKING CHANGE:" in body
        commits.append(
            {"type": match["type"], "desc": match["desc"], "breaking": breaking}
        )
    return commits


def increment_for(commits: list[dict[str, str]]) -> str:
    if any(commit["breaking"] for commit in commits):
        return "MAJOR"
    if any(commit["type"] == "feat" for commit in commits):
        return "MINOR"
    if any(commit["type"] in ("fix", "perf") for commit in commits):
        return "PATCH"
    return ""


def next_version(current: str, increment: str) -> str:
    major, minor, patch = (int(part) for part in current.split("."))
    if increment == "MAJOR" and major == 0:
        increment = "MINOR"  # Breaking changes bump the minor version before 1.0.
    if increment == "MAJOR":
        return f"{major + 1}.0.0"
    if increment == "MINOR":
        return f"{major}.{minor + 1}.0"
    return f"{major}.{minor}.{patch + 1}"


def changelog_section(version: str, commits: list[dict[str, str]]) -> str:
    lines = [f"## {version} ({date.today().isoformat()})", ""]
    breaking = [commit["desc"] for commit in commits if commit["breaking"]]
    groups = [("BREAKING CHANGES", breaking)] + [
        (title, [c["desc"] for c in commits if c["type"] == kind])
        for kind, title in SECTIONS.items()
    ]
    for title, items in groups:
        if items:
            lines += [f"### {title}", "", *(f"- {item}" for item in items), ""]
    if len(lines) == 2:
        lines += ["- Maintenance release.", ""]
    return "\n".join(lines) + "\n"


def write_version(name: str, version: str) -> list[str]:
    """Update the manifest (and lockfile, and the API spec); return changed files."""
    if name in ("web", "admin"):
        subprocess.run(
            ["npm", "version", version, "--workspace", name, "--no-git-tag-version"],
            cwd=ROOT,
            check=True,
            capture_output=True,
        )
        return [COMPONENTS[name].manifest, "package-lock.json"]
    package = tomllib.loads((ROOT / COMPONENTS[name].manifest).read_text())
    run = ["uv", "version", "--package", package["project"]["name"], version]
    subprocess.run(run, cwd=ROOT, check=True, capture_output=True)
    if name != "api":
        return [COMPONENTS[name].manifest, "uv.lock"]
    generate = ["uv", "run", "--locked", "--all-packages", "python"]
    generate.append("api/scripts/generate_openapi.py")
    subprocess.run(generate, cwd=ROOT, check=True, capture_output=True)
    return [COMPONENTS[name].manifest, "uv.lock", "api/openapi.json"]


def bump(name: str, increment: str, dry_run: bool) -> None:
    tag = last_tag(name)
    current = read_version(COMPONENTS[name])
    commits = commits_since(name, tag)
    increment = increment or increment_for(commits)
    if not increment:
        fail(f"no feat, fix or perf commits for {name} since {tag or 'the start'}")
    version = next_version(current, increment)
    section = changelog_section(version, commits)
    print(f"{name}: {current} -> {version} ({increment}, {len(commits)} commits)\n")
    print(section)
    if dry_run:
        return

    if git("status", "--porcelain"):
        fail("the working tree has uncommitted changes")
    if git("branch", "--show-current") != "main":
        fail("releases are cut from main")
    git("fetch", "--quiet", "origin", "main")
    try:
        # Ahead is fine (e.g. several releases before one push); behind is not.
        git("merge-base", "--is-ancestor", "origin/main", "HEAD")
    except subprocess.CalledProcessError:
        fail("main is behind origin/main; pull first")

    changed = write_version(name, version)
    changelog = ROOT / name / "CHANGELOG.md"
    text = changelog.read_text()
    first = text.find("\n## ")
    head, rest = (text, "") if first == -1 else (text[: first + 1], text[first + 1 :])
    changelog.write_text(f"{head}\n{section}\n{rest}".replace("\n\n\n", "\n\n"))
    git("add", *changed, f"{name}/CHANGELOG.md")
    git("commit", "--quiet", "--message", f"chore(release): {name} {version}")
    git("tag", "--annotate", f"{name}-{version}", "--message", f"{name} {version}")
    print(f"Tagged {name}-{version}. Publish the commit and tag together with:")
    print(f"  git push --atomic origin main {name}-{version}")


def verify(tag: str, notes: Path) -> None:
    name, _, version = tag.partition("-")
    component = COMPONENTS.get(name)
    if component is None or not re.fullmatch(r"\d+\.\d+\.\d+", version):
        fail(f"{tag} is not <component>-<major>.<minor>.<patch>")
    if read_version(component) != version:
        fail(f"{tag} does not match {component.manifest} ({read_version(component)})")
    git("fetch", "--quiet", "origin", "main")
    try:
        git("merge-base", "--is-ancestor", "HEAD", "origin/main")
    except subprocess.CalledProcessError:
        fail(f"{tag} is not on main")

    changelog = (ROOT / name / "CHANGELOG.md").read_text()
    match = re.search(
        rf"^## {re.escape(version)} .*?\n(.*?)(?=^## |\Z)", changelog, re.M | re.S
    )
    if not match:
        fail(f"{name}/CHANGELOG.md has no section for {version}")
    notes.write_text(match[1].strip() + "\n")

    print(f"title={name} {version}")
    print(f"version={version}")
    print(f"minor={version.rsplit('.', 1)[0]}")
    print(f"image={component.image}")
    print(f"dockerfile={component.dockerfile}")
    print(f"description={component.description}")
    args = "\n".join(f"{key}={value}" for key, value in component.build_args.items())
    print(f"build_args<<EOF\n{args}\nEOF")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    commands = parser.add_subparsers(dest="command", required=True)
    bump_parser = commands.add_parser("bump")
    bump_parser.add_argument("component", choices=COMPONENTS)
    bump_parser.add_argument("--increment", choices=INCREMENTS, default="")
    bump_parser.add_argument("--dry-run", action="store_true")
    verify_parser = commands.add_parser("verify")
    verify_parser.add_argument("tag")
    verify_parser.add_argument("--notes", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "bump":
        bump(args.component, args.increment, args.dry_run)
    else:
        verify(args.tag, args.notes)


if __name__ == "__main__":
    main()
