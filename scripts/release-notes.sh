#!/usr/bin/env bash
# Prints the CHANGELOG.md section for one version (without its heading), for use as release notes.
# Usage: scripts/release-notes.sh 0.1.0
set -euo pipefail

version="${1:?usage: release-notes.sh <version, e.g. 0.1.0>}"
version="${version#v}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

notes="$(awk -v v="$version" '
  /^## / {
    if (found) exit
    if (index($0, "## [" v "]") == 1) { found = 1; next }
  }
  found && /^\[[^]]+\]: / { next }
  found { print }
' "$root/CHANGELOG.md")"

# Relative links do not resolve on a release page; point them at the tagged files.
notes="$(printf '%s\n' "$notes" | sed "s|](DECISIONS.md|](https://github.com/kkauper/kinetic-ui/blob/v$version/DECISIONS.md|g")"

# Trim leading and trailing blank lines.
notes="$(printf '%s\n' "$notes" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}' | sed '/./,$!d')"

if [ -z "$notes" ]; then
  echo "error: no section for version $version in CHANGELOG.md" >&2
  exit 1
fi
printf '%s\n' "$notes"
