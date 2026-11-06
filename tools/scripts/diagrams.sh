#!/usr/bin/env bash
# Renders the D2 diagrams in docs/diagrams/ to SVG in docs/assets/, once in the
# light palette and once in the dark one, and checks that the committed SVGs
# are current. D2 is pinned here so every machine and CI draws the same picture.
set -euo pipefail

D2_VERSION=v0.9.0
# From the release's SHA256SUMS.
declare -A D2_SHA256=(
  [linux-amd64]=5669ddc46b99e942cc96078f4a4e36d5e62103348f4c05179ede27802fdd87a9
  [linux-arm64]=ac2c028697199479acb321db1e3d68caee9f2ba492ed73caa3cd13f3829bf913
  [macos-amd64]=cad39576a480d6bb02ea142fef1726647914b0d2da51ccc9b30b660a2b1babf0
  [macos-arm64]=eaf6c0c143e56dd9fa97bfb6df25ea9c1ebce40245f056a0768cf1a6c15d3064
)
SOURCES=docs/diagrams
ASSETS=docs/assets
# Layer spacing for the ELK layout, tighter than D2's default.
D2_FLAGS=(--elk-nodeNodeBetweenLayers=40 --elk-edgeNodeBetweenLayers=24)
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

usage() {
  echo 'Usage: make diagrams [check|setup]'
  exit 2
}

platform() {
  local os arch
  case "$(uname -s)" in
    Linux) os=linux ;;
    Darwin) os=macos ;;
    *) echo "No pinned D2 build for $(uname -s)." >&2; exit 1 ;;
  esac
  case "$(uname -m)" in
    x86_64 | amd64) arch=amd64 ;;
    aarch64 | arm64) arch=arm64 ;;
    *) echo "No pinned D2 build for $(uname -m)." >&2; exit 1 ;;
  esac
  echo "$os-$arch"
}

# Downloads the pinned release, checks it against its checksum and installs the
# binary into $1 (default ~/.local/bin).
install_d2() {
  local dest="${1:-$HOME/.local/bin}" target tmp="$TMP/install"
  target="$(platform)"
  mkdir -p "$tmp"
  curl -fsSL --retry 3 -o "$tmp/d2.tar.gz" \
    "https://github.com/terrastruct/d2/releases/download/$D2_VERSION/d2-$D2_VERSION-$target.tar.gz"
  if command -v sha256sum > /dev/null; then
    echo "${D2_SHA256[$target]}  $tmp/d2.tar.gz" | sha256sum --check --quiet
  else
    echo "${D2_SHA256[$target]}  $tmp/d2.tar.gz" | shasum -a 256 --check --quiet
  fi
  tar -xzf "$tmp/d2.tar.gz" -C "$tmp"
  mkdir -p "$dest"
  install -m 0755 "$tmp/d2-$D2_VERSION/bin/d2" "$dest/d2"
  echo "Installed D2 $D2_VERSION in $dest"
}

require_d2() {
  if ! command -v d2 > /dev/null; then
    echo "D2 is not installed: run 'make diagrams setup'." >&2
    exit 1
  fi
  if [[ "$(d2 --version)" != "$D2_VERSION" ]]; then
    echo "D2 is $(d2 --version), but the diagrams are drawn with $D2_VERSION: run 'make diagrams setup'." >&2
    exit 1
  fi
}

# Renders every diagram into $1, as <name>.svg and <name>-dark.svg.
render() {
  local out="$1" work="$TMP/work" source name
  mkdir -p "$out" "$work/dark"
  cp "$SOURCES"/*.d2 "$work/dark/"
  cp "$SOURCES/palette-dark.d2" "$work/dark/palette.d2"
  for source in "$SOURCES"/*.d2; do
    name="$(basename "$source" .d2)"
    case "$name" in palette | palette-dark | classes) continue ;; esac
    d2 "${D2_FLAGS[@]}" "$source" "$out/diagram-$name.svg" 2> "$work/log" || { cat "$work/log" >&2; exit 1; }
    d2 "${D2_FLAGS[@]}" "$work/dark/$name.d2" "$out/diagram-$name-dark.svg" 2> "$work/log" || { cat "$work/log" >&2; exit 1; }
    echo "Rendered $out/diagram-$name.svg and its dark version"
  done
}

check() {
  local out="$TMP/check" status=0 file
  render "$out" > /dev/null
  for file in "$out"/*.svg; do
    if ! cmp --quiet "$file" "$ASSETS/$(basename "$file")"; then
      echo "$ASSETS/$(basename "$file") is out of date: run 'make diagrams' and commit the result." >&2
      status=1
    fi
  done
  for file in "$ASSETS"/diagram-*.svg; do
    [[ -e "$file" ]] || continue
    if [[ ! -e "$out/$(basename "$file")" ]]; then
      echo "$file has no source in $SOURCES/: delete it or restore its source." >&2
      status=1
    fi
  done
  return "$status"
}

case "${1:-render}" in
  render) require_d2; render "$ASSETS" ;;
  check) require_d2; check ;;
  setup) install_d2 "${2:-}" ;;
  *) usage ;;
esac
