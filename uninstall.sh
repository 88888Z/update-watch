#!/usr/bin/env bash
# Update Watch — clean removal. Leaves installed packages and apt data untouched.
set -euo pipefail
EXT_UUID="update-watch@rich"
EXT_DST="$HOME/.local/share/gnome-shell/extensions/$EXT_UUID"

bus="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/bus"
if [ -S "$bus" ]; then
  export XDG_RUNTIME_DIR DBUS_SESSION_BUS_ADDRESS="unix:path=$bus"
  gnome-extensions disable "$EXT_UUID" >/dev/null 2>&1 || true
  python3 - <<'PY'
from gi.repository import Gio
s = Gio.Settings.new('org.gnome.shell')
v = s.get_strv('enabled-extensions')
v = [e for e in v if e != 'update-watch@rich']
s.set_strv('enabled-extensions', v)
PY
fi
rm -rf "$EXT_DST"
echo "removed. reload the shell if you still see the badge: killall -3 gnome-shell"
