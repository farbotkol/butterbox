#!/usr/bin/env bash
# Set native GitHub Issue Types for Butterbox. Requires gh CLI auth with Issues write.
# Dry-run by default. Pass --apply to update. Never changes PRs or issue labels.
set -euo pipefail
repo="farbotkol/butterbox"
apply=false
if [[ "${1:-}" == "--apply" ]]; then apply=true; elif [[ $# -ne 0 ]]; then echo "Usage: $0 [--apply]" >&2; exit 2; fi
command -v gh >/dev/null || { echo "GitHub CLI (gh) is required" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }
gh auth status >/dev/null
types="$(gh api "repos/$repo/issue-types" --jq '.[].name')"
has_type() { printf '%s\n' "$types" | grep -Fixq "$1"; }
has_type Epic || { echo "Native Epic issue type is not enabled on $repo. Stop." >&2; exit 1; }
echo "Enabled types:"
printf '%s\n' "$types"
echo "Mode: $([[ "$apply" == true ]] && echo APPLY || echo DRY-RUN)"
count=0
skipped=0
# GitHub API paginates; gh --paginate fetches open and closed.
while IFS=$'\t' read -r number title current_type; do
  [[ -n "$number" ]] || continue
  target=""
  if (( number >= 143 && number <= 161 )) && [[ "$title" == "[EPIC]"* ]]; then
    target="Epic"
  elif [[ "$title" == "[HISTORICAL][BB-"* || "$title" == "[BB-"* || "$title" == "BB-FORECAST-001"* ]]; then
    target="Feature"
  elif [[ "$title" == "Fix oversized"* || "$title" == "Hide dashboard"* || "$title" == "Consolidate Venue settings"* ]]; then
    target="Bug"
  else
    target="Task"
  fi
  if ! has_type "$target"; then
    echo "SKIP #$number ($target not enabled): $title"
    skipped=$((skipped + 1))
    continue
  fi
  if [[ "$current_type" == "$target" ]]; then continue; fi
  printf '%s #%-4s %-8s %s\n' "$([[ "$apply" == true ]] && echo SET || echo WOULD-SET)" "$number" "$target" "$title"
  if [[ "$apply" == true ]]; then
    gh api --method PATCH "repos/$repo/issues/$number" -f "type=$target" >/dev/null
    actual="$(gh api "repos/$repo/issues/$number" --jq '.type.name // ""')"
    [[ "$actual" == "$target" ]] || { echo "Verification failed for #$number: $actual" >&2; exit 1; }
  fi
  count=$((count + 1))
done < <(gh api --paginate "repos/$repo/issues?state=all&per_page=100" --jq '.[] | select(.pull_request == null) | [.number, .title, (.type.name // "")] | @tsv')
echo "Changes $([[ "$apply" == true ]] && echo applied || echo proposed): $count; skipped because type absent: $skipped"
echo "No GitHub Project or native sub-issue relationship changes are made."
