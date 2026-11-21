#!/usr/bin/env bash
# Publish this folder to GitHub Pages in one step.
#
#   ./deploy.sh                      -> github.com/<you>/who-comes-to-mind
#   ./deploy.sh my-repo-name         -> github.com/<you>/my-repo-name
#
# Needs: git and the GitHub CLI (Fedora: sudo dnf install gh), logged in once with `gh auth login`.
# Run it again after editing files: it commits and pushes the changes, and Pages updates in ~1 minute.
set -euo pipefail
cd "$(dirname "$0")"

REPO="${1:-who-comes-to-mind}"
OWNER="$(gh api user --jq .login)"

if grep -q '\[12-character DataPipe ID\]' config.js; then
  echo "NOTE: DATAPIPE_EXPERIMENT_ID in config.js is still a placeholder."
  echo "      The live link will show 'not open yet' until you set it (?debug=1 still works)."
fi

if [ ! -d .git ]; then
  git init -q -b main
fi
git add -A
git commit -q -m "Update experiment" || echo "(nothing new to commit)"

if ! gh repo view "$OWNER/$REPO" >/dev/null 2>&1; then
  # GitHub Pages is free for public repositories. The code (including the debrief) will be public.
  gh repo create "$OWNER/$REPO" --public --source=. --remote=origin --push \
    --description "Who Comes to Mind First? jsPsych experiment (Computational Cognition Lab, Krea University)"
  gh api -X POST "repos/$OWNER/$REPO/pages" -f "source[branch]=main" -f "source[path]=/" >/dev/null
else
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$OWNER/$REPO.git"
  git push -u origin main
fi

URL="https://$OWNER.github.io/$REPO/"
echo
echo "Published. The first build takes 1-2 minutes."
echo "  Participant link : $URL"
echo "  Pilot / test link: ${URL}?debug=1&group=4   (saves to your own computer, not OSF)"
