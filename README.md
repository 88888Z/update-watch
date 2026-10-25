# Update Watch

A **decide-yourself** update indicator for GNOME Shell — a small, hand-drawn
badge on the top bar that tells you the *state of your system* and nothing more.
Metadata checks only. **Nothing ever downloads or installs without your click.**

```
        green tick        yellow count        orange count        red count
        up to date        few pending (1–24)  backlog (25+)      SECURITY pending
             ●                ㉎                  ㉎                  ㉎
        "current"         "shipped stuff"     "backlog building"  "act today"
```

**Severity ladder** (painted, not themed — looks identical everywhere):

| color  | meaning                                              |
|--------|------------------------------------------------------|
| green  | up to date                                           |
| yellow | 1–24 normal updates                                  |
| orange | 25+ pending (a backlog is building)                  |
| red    | at least one **security** update — highest priority  |

Security origin is detected from `apt-get -s dist-upgrade` (`-s` = simulate,
can never change your system) — any package landing from a `*-security`
pocket turns the badge red regardless of total count. The menu shows the
pending list and the security subset separately.

## Why

Most "update checkers" either nag you, do things behind your back, or bury the
one bit you care about — *has my system drifted?* — under an app you must keep opening.

Update Watch is one small line of truth in the panel:

- **Green** — nothing pending. The most satisfying tick in the world.
- **Red count** — updates exist. Your move. Pulse optional.
- **Spinning wheel** — a check is running *right now*; you see the progress arc
  fill through real phases (metadata refresh → package list → write).
- Clicking **Check now** runs a metadata-only refresh (`pkcon refresh`) and
  parses `apt list --upgradable`. Nothing more, nothing secretly.
- Clicking the menu item **Open GNOME Software** drops you in the Updates view
  where *you* still decide what happens.

No network calls of its own. No telemetry. No background daemons.
One file, one process, zero moving parts outside the shell.

## Install

### The one way that matters
```bash
git clone --depth 1 https://github.com/88888Z/update-watch.git update-watch
cd update-watch && ./install.sh
```

Look at your top bar. That's it.

If your session predates the extension (or the badge doesn't show yet),
one reload finishes it on X11 sessions:
```bash
./install.sh --reload   # or: killall -3 gnome-shell
```

### Package install (GNOME-native)
```bash
make pack          # -> dist/update-watch@rich.shell-extension.zip
gnome-extensions install dist/update-watch@rich.shell-extension.zip
```

### Uninstall
```bash
make uninstall
```
The installer absorbs and archives any legacy external watchdog (systemd
timer, bash scripts) into `legacy/` automatically. The uninstaller removes
only the extension — it never touches packages, package lists, or apt state.

## Supported sessions

- GNOME Shell **45 – 49** (tested on 48.7, Wayland *or* X11 sessions)
- Debian/Ubuntu-ish distros with `apt` + PackageKit (the checker shells out to
  `pkcon refresh` and `apt list --upgradable`)

## What it does internally

```
 heartbeat (10s)
    │
    ├─ phase == checking (external producer)?  → adopt spinner, unstick on orphan
    ├─ fresh enough / disabled auto-check?     → paint (tick | count | pulse)
    └─ due for a check?                        → runCheck()
                                                │
             ┌──────────────────────────────────┘
             ▼
      pkcon refresh (async Subprocess)        pct ladder: 10 → 78 → 96
             │                                written to state file, polled
             ▼                                by the heartbeat every 400 ms?
      apt list --upgradable (async, stdout)   displayed arc proportional
             │
             ▼
      write final state + notify (optional) + completion pop
```

- **State file**: `~/.local/share/apt-watch-state` — small `key=value` text.
  Power users can `cat` it; other tools may read it; the extension is
  single-writer and tolerant of foreign writers (orphaned `checking` phases get
  unstuck automatically).
- **Cancellables**: a disable/reload mid-check kills the subprocess cleanly;
  late callbacks are fenced by a teardown flag.
- **Settings** (right-click the badge → Preferences, or
  `gnome-extensions prefs update-watch@rich`):
  | key                | default | meaning                                  |
  |--------------------|---------|------------------------------------------|
  | `auto-check`       | true    | run metadata refresh periodically        |
  | `interval-minutes` | 240     | refresh cadence (30–1440)                |
  | `notify`           | true    | desktop notification when updates appear |
  | `pulse`            | true    | breathe the red badge while pending      |

## The truth protocol (v5)

The badge is a **certificate viewer**, not a guess:

- **green tick** — exists *only* after a fully verified successful check
  (metadata refresh returned success **and** the apt scan parse produced a
  well-formed result). No other path paints green. Ever.
- **spinning blue wheel with progress arc** — a check is in flight (all real
  phases; the arc is honest, phase-stepped, never fake).
- **red circle with white ✕** — the *last attempt failed* (no connection,
  timeout, broken repo, unparseable output — anything but a verified success).
  The menu names the exact reason. It stays until a new check actually
  succeeds; the previous best-verified data is kept *and labelled* as
  "last verified".
- **grey circle with ?** — never verified since install (no certificate yet).
- **dashed ring** — the certificate of the current data has *expired*:
  the check that produced it is older than your configured "certificate
  window". The data shown is labelled stale; if auto-check is on the next
  heartbeat re-verifies within seconds.

Nothing is hardcoded. Via Preferences:

| setting                 | default | meaning                                            |
|-------------------------|---------|----------------------------------------------------|
| auto-check              | true    | heartbeat re-verification                          |
| certificate window      | 240 min | success stays valid only this long (30 m – 24 h)   |
| per-step deadline       | 120 s   | each step must finish inside it, else honest fail  |
| attempts per check      | 2       | retries with backoff, then the cross               |
| delay between retries   | 30 s    | backoff knob                                       |
| orange threshold        | 25      | severity ladder split (security always red)        |
| notify on updates       | true    | failures never notify — the badge *is* the truth   |
| pulse                   | true    | breathing while pending                            |

Old state files (pre-v5, no `status` key) are treated as **not verified yet**
and get re-certified by the first heartbeat — honesty migrates forward.

## Design notes (what makes it SOTA)

- **Hand-drawn glyphs** — the badge is painted with Cairo (`vfunc_repaint`),
  so it looks identical on every theme, icon set, and desktop accent color.
  No bitmap sprites, no theme hijacking.
- **Async everything** — `Subprocess.wait_check_async` /
  `communicate_utf8_async`: zero blocking of the compositor, zero jank.
- **Honest progress** — the progress arc moves in real phase steps, never a
  fake smooth sweep, never lying about being done.
- **Single self-contained folder** — no systemd units, no $PATH scripts, no
  root, no post-install daemon to babysit.
- **Hibernate-proof** — cadence is threshold-based on `checked_epoch`,
  so suspends, screen locks, and sleep deadlines simply delay, not break it.
- **gettext-ready** — user-visible strings route through `Gettext`.

## FAQ

**Does it install updates?** Never. There is no code path that installs,
upgrades, holds, or removes packages.

**Is the red badge a warning?** It's an *invitation*: updates exist, choose
your moment.

**What if a check fails (offline, broken repo)?** The checker still writes a
new "last checked" stamp (that's an honest statement — it tried) and stays
silent. Your badge goes green after a successful run with zero pending rows.

**Wayland?** Works; the badge appears after relogin (extensions scan dirs at
session start on Wayland). On X11 the `--reload` path lets you see it instantly.

**Porting to another machine/disk (e.g. a second OS)?** The project is
self-contained: `git clone` on that OS, run `./install.sh`. That's the whole
porting contract.

## Contributing

1. Fork, branch, nail down one idea per PR.
2. `make lint` (eslint, gjs rules) — clean diffs over clever diffs.
3. Test on your session, then bump `version` in `metadata.json`.

## License

MIT — see [LICENSE](LICENSE). Use it, fork it, ship it to the moon.

---

*Built the hacker way: read the shell's own source (`barLevel.js`,
`pointerA11yTimeout.js`) to learn the true `St.DrawingArea` API instead of
guessing, then painted it.*
