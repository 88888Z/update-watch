#!/usr/bin/env bash
# Package the extension as an installable Archive (.shell-extension.zip)
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
mkdir -p dist
rm -rf dist/*.zip
zip -qr "dist/update-watch@rich.shell-extension.zip" update-watch@rich \
  -x "update-watch@rich/screenshots/*"
ls -la dist/
echo "install it with:  gnome-extensions install dist/update-watch@rich.shell-extension.zip"
