#!/usr/bin/env bash
# Update Watch — frictionless installer.
# Copies the extension to the user's extension store, compiles schemas,
# wires the *self-contained* checker, and enables it in the live session.
set -euo pipefail

EXT_UUID="update-watch@rich"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_SRC="$SRC_DIR/$EXT_UUID"
EXT_DST="$HOME/.local/share/gnome-shell/extensions/$EXT_UUID"
LEGACY_DIR="$SRC_DIR/legacy"
RELOAD=0
for arg in "$@"; do [ "$arg" = "--reload" ] && RELOAD=1; done

[ -d "$EXT_SRC" ] || { echo "error: $EXT_SRC not found" >&2; exit 1; }

echo "==> installing extension files"
mkdir -p "$(dirname "$EXT_DST")"
rm -rf "$EXT_DST"
cp -a "$EXT_SRC" "$EXT_DST"

echo "==> compiling schemas"
command -v glib-compile-schemas >/dev/null 2>&1 \
  && glib-compile-schemas "$EXT_DST/schemas" \
  || echo "warn: glib-compile-schemas not found (settings fall back to defaults)"

echo "==> fixing legacy external watchdog (if any)"
mkdir -p "$LEGACY_DIR"
if systemctl --user disable --now apt-watch.timer >/dev/null 2>&1; then
  echo "    stopped and disabled apt-watch.timer"
fi
for f in "$HOME/.config/systemd/user/apt-watch.service" \
         "$HOME/.config/systemd/user/apt-watch.timer" \
         "$HOME/.local/bin/apt-watch-notify" \
         "$HOME/.local/bin/apt-watch-check"; do
  if [ -e "$f" ]; then
    mv -f "$f" "$LEGACY_DIR/$(basename "$f")"
    echo "    absorbed into project: $f -> $LEGACY_DIR/"
  fi
done
systemctl --user daemon-reload >/dev/null 2>&1 || true

echo "==> session wiring"
bus="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/bus"
if [ -S "$bus" ]; then
  export XDG_RUNTIME_DIR DBUS_SESSION_BUS_ADDRESS="unix:path=$bus"
  gsettings set org.gnome.shell disable-user-extensions false
  python3 - <<'PY'
from gi.repository import Gio
s = Gio.Settings.new('org.gnome.shell')
v = s.get_strv('enabled-extensions')
if 'update-watch@rich' not in v:
    v.append('update-watch@rich'); s.set_strv('enabled-extensions', v)
PY
  gnome-extensions enable "$EXT_UUID" >/dev/null 2>&1 || true
fi

echo "==> done."
cat <<'EOF'
Look at your top bar now.   green tick = up to date
                           red count  = pending updates
                           blue wheel = check running
If nothing changed live, reload the shell once (X11 session only):
    killall -3 gnome-shell
EOF

if [ "$RELOAD" = "1" ]; then
  echo "==> reloading GNOME Shell"
  killall -3 gnome-shell
  sleep 6
  export XDG_RUNTIME_DIR DBUS_SESSION_BUS_ADDRESS
  gnome-extensions enable "$EXT_UUID" 2>/dev/null || true
  echo "    started"
fi
