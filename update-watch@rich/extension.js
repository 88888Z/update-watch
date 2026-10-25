import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import Gettext from 'gettext';
import St from 'gi://St';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import Cairo from 'gi://cairo';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const _ = Gettext.gettext;

const UUID = 'update-watch@rich';
const SIZE = 18;
const TAU = Math.PI * 2;
const RED = [0.878, 0.106, 0.141];
const GREEN = [0.149, 0.635, 0.412];
const BLUE = [0.208, 0.518, 0.894];
const YELLOW = [0.961, 0.757, 0.067];
const ORANGE = [0.902, 0.318, 0.0];
const DARKTEXT = [0.13, 0.13, 0.13];

function statePath() {
    return GLib.build_filenamev([GLib.get_home_dir(), '.local', 'share', 'apt-watch-state']);
}

function parseState() {
    const out = {
        checked_epoch: 0, count: 0, top: '',
        security: 0, sec_top: '',
        status: '', fail_reason: '', fail_epoch: 0,
        phase: 'idle', pct: 0,
    };
    try {
        const [, bytes] = GLib.file_get_contents(statePath());
        const text = new TextDecoder().decode(bytes);
        for (const line of text.split('\n')) {
            const i = line.indexOf('=');
            if (i > 0) out[line.slice(0, i)] = line.slice(i + 1).trim();
        }
    } catch { }
    return out;
}

function humanDur(s) {
    if (s < 90) return _('just now');
    if (s < 5400) return `${Math.round(s / 60)} min`;
    if (s < 129600) return `${Math.round(s / 3600)} h`;
    return `${Math.round(s / 86400)} d`;
}

const Badge = GObject.registerClass(
class Badge extends St.DrawingArea {
    _init(params) {
        super._init(params);
        this._count = 0;
        this._security = 0;
        this._spinner = false;
        this._failed = false;
        this._stale = false;
        this._unknown = false;
        this._orangeAt = 25;
        this._pct = 0;
        this._angle = 0;
    }

    setSpinner(on, pct) {
        this._spinner = on;
        this._pct = pct || 0;
        this.queue_repaint();
    }

    bumpAngle() {
        this._angle = (this._angle + 0.45) % TAU;
        this.queue_repaint();
    }

    _severity() {
        if (this._security > 0) return RED;
        if (this._count >= this._orangeAt) return ORANGE;
        if (this._count > 0) return YELLOW;
        return GREEN;
    }

    vfunc_repaint() {
        const cr = this.get_context();
        const [width, height] = this.get_surface_size();
        const c = Math.min(width, height) / 2;
        let col = BLUE;
        let txt = [1, 1, 1];
        if (!this._spinner) {
            if (this._failed) col = RED;
            else if (this._unknown) col = [0.44, 0.46, 0.5];
            else col = this._severity();
            if (col === YELLOW) txt = DARKTEXT;
        }

        cr.setSourceRGB(col[0], col[1], col[2]);
        cr.arc(width / 2, height / 2, c - 1, 0, TAU);
        cr.fillPreserve();
        cr.setSourceRGBA(0, 0, 0, 0.20);
        cr.setLineWidth(1);
        cr.stroke();

        if (this._spinner) {
            cr.setLineWidth(2.4);
            cr.setLineCap(Cairo.LineCap.ROUND);
            cr.setSourceRGBA(1, 1, 1, 0.25);
            cr.arc(width / 2, height / 2, c - 3.4, 0, TAU);
            cr.stroke();
            if (this._pct > 0) {
                cr.setSourceRGB(1, 1, 1);
                cr.arc(width / 2, height / 2, c - 3.4, -Math.PI / 2, -Math.PI / 2 + TAU * this._pct / 100);
                cr.stroke();
            }
            cr.setSourceRGB(1, 1, 1);
            cr.arc(width / 2, height / 2, c - 3.4, -Math.PI / 2 + this._angle, -Math.PI / 2 + this._angle + Math.PI / 2);
            cr.stroke();
        } else if (this._failed) {
            cr.setSourceRGB(1, 1, 1);
            cr.setLineWidth(2.0);
            cr.setLineCap(Cairo.LineCap.ROUND);
            cr.moveTo(width / 2 - 4.0, height / 2 - 4.0);
            cr.lineTo(width / 2 + 4.0, height / 2 + 4.0);
            cr.moveTo(width / 2 + 4.0, height / 2 - 4.0);
            cr.lineTo(width / 2 - 4.0, height / 2 + 4.0);
            cr.stroke();
        } else if (this._unknown) {
            cr.setLineWidth(1.6);
            cr.setSourceRGBA(1, 1, 1, 0.75);
            cr.selectFontFace('Sans', Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD);
            cr.setFontSize(10);
            const e = cr.textExtents('?');
            cr.moveTo(width / 2 - e.width / 2 - e.xBearing, height / 2 - e.height / 2 - e.yBearing);
            cr.showText('?');
        } else {
            cr.setSourceRGB(txt[0], txt[1], txt[2]);
            const n = this._count;
            if (n > 0) {
                const label = n > 99 ? '99+' : String(n);
                const size = label.length > 2 ? 7 : (n > 9 ? 8 : 9.4);
                cr.selectFontFace('Sans', Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD);
                cr.setFontSize(size);
                const e = cr.textExtents(label);
                cr.moveTo(width / 2 - e.width / 2 - e.xBearing, height / 2 - e.height / 2 - e.yBearing);
                cr.showText(label);
            } else {
                cr.setLineWidth(1.8);
                cr.setLineCap(Cairo.LineCap.ROUND);
                cr.setLineJoin(Cairo.LineJoin.ROUND);
                cr.moveTo(width / 2 - 4.2, height / 2 + 0.4);
                cr.lineTo(width / 2 - 1.4, height / 2 + 3.2);
                cr.lineTo(width / 2 + 4.2, height / 2 - 3.4);
                cr.stroke();
            }
            if (this._stale) {
                cr.setDash([2.8, 2.4], 0);
                cr.setSourceRGBA(1, 1, 1, 0.85);
                cr.setLineWidth(1.5);
                cr.arc(width / 2, height / 2, c - 1.6, 0, TAU);
                cr.stroke();
                cr.setDash([], 0);
            }
        }
        cr.$dispose();
    }
});

const UpdateWatch = GObject.registerClass(
class UpdateWatch extends PanelMenu.Button {
    _init(settings) {
        super._init(0.0, _('Update Watch'), false);
        this._settings = settings;
        this._busy = false;
        this._pulsing = false;
        this._proc = null;
        this._deadline = null;
        this._retryTimer = null;
        this._torn = false;
        this._enabledAt = Date.now();

        this._box = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
        this._badge = new Badge({ width: SIZE, height: SIZE });
        this._box.add_child(this._badge);
        this.add_child(this._box);

        this._checkedItem = new PopupMenu.PopupMenuItem(_('Not checked yet'), { reactive: false });
        this._pendingItem = new PopupMenu.PopupMenuItem(_('Up to date'), { reactive: false });
        this._securityItem = new PopupMenu.PopupMenuItem('', { reactive: false });
        this._failItem = new PopupMenu.PopupMenuItem('', { reactive: false });
        this.menu.addMenuItem(this._checkedItem);
        this.menu.addMenuItem(this._pendingItem);
        this.menu.addMenuItem(this._securityItem);
        this.menu.addMenuItem(this._failItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._checkItem = new PopupMenu.PopupMenuItem(_('Check now (metadata only — no downloads)'));
        this._checkItem.connect('activate', () => this._runCheck(true));
        this.menu.addMenuItem(this._checkItem);

        const open = new PopupMenu.PopupMenuItem(_('Open GNOME Software'));
        open.connect('activate', () => {
            const app = Gio.DesktopAppInfo.new('org.gnome.Software.desktop');
            if (app) app.launch([], null);
        });
        this.menu.addMenuItem(open);

        ['auto-check', 'interval-minutes', 'timeout-seconds', 'retry-attempts',
         'retry-delay-seconds', 'backlog-count', 'pulse', 'notify'].forEach(k =>
            this._settings.connect(`changed::${k}`, () => { this._onSetting(); }));
        this._onSetting();

        this._spinTick = null;
        this._fast = null;
        this._beat = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 10, () => this._heartbeat());
        this._heartbeat();
    }

    _onSetting() {
        this._badge._orangeAt = this._settings.get_uint('backlog-count');
        if (!this._settings.get_boolean('pulse') && this._pulsing) {
            this._pulsing = false;
            this._badge.remove_all_transitions();
            this._badge.opacity = 255;
        }
        this._badge.queue_repaint();
    }

    _intervalSecs() { return Math.max(60, this._settings.get_uint('interval-minutes') * 60); }

    _stopTimers() {
        if (this._spinTick) { GLib.Source.remove(this._spinTick); this._spinTick = null; }
        if (this._fast) { GLib.Source.remove(this._fast); this._fast = null; }
        this._clearDeadline();
        if (this._retryTimer) { GLib.Source.remove(this._retryTimer); this._retryTimer = null; }
    }

    _clearDeadline() {
        if (this._deadline) { GLib.Source.remove(this._deadline); this._deadline = null; }
    }

    _heartbeat() {
        if (this._torn) return GLib.SOURCE_REMOVE;
        const st = parseState();
        const ts = parseInt(st.checked_epoch) || 0;
        const now = Math.floor(Date.now() / 1000);
        const window = this._intervalSecs();

        if (st.phase === 'checking' && !this._busy)
            this._wrapWrite({ phase: 'idle', pct: 0 });

        if (this._busy) {
            this._badge._pct = parseInt(st.pct) || this._badge._pct;
            this._badge.queue_repaint();
        } else {
            const auto = this._settings.get_boolean('auto-check');
            const legacy = ts > 0 && st.status === '';
            const failed = st.status === 'failed';
            const stale = ts > 0 && now - ts >= window;
            const failEpoch = parseInt(st.fail_epoch) || 0;
            const grace = this._settings.get_uint('retry-delay-seconds') *
                          this._settings.get_uint('retry-attempts') + 60;

            let due = false;
            if (!ts) due = Date.now() - this._enabledAt > 8000;
            else if (legacy) due = (now - ts) > 60;
            else if (failed) due = (now - failEpoch) > grace;
            else due = stale;

            if (auto && due) {
                this._runCheck(false);
            } else {
                this._paintFinal(st, stale, failed);
            }
        }
        return GLib.SOURCE_CONTINUE;
    }

    _paintFinal(st, stale, failed) {
        const ts = parseInt(st.checked_epoch) || 0;
        const now = Math.floor(Date.now() / 1000);
        const window = this._intervalSecs();
        const n = parseInt(st.count) || 0;
        const sec = parseInt(st.security) || 0;

        this._badge._count = n;
        this._badge._security = sec;
        this._badge._failed = failed;
        this._badge._stale = !failed && ts > 0 && (now - ts >= window);
        this._badge._unknown = ts === 0;

        if (failed) {
            const fe = parseInt(st.fail_epoch) || 0;
            this._checkedItem.label.text = `${_('Last attempt failed')} (${st.fail_reason || _('unknown reason')})` +
                (fe ? `, ${humanDur(now - fe)} ago` : '');
            const back = ts > 0 ? `— ${_('last verified data')}: ${humanDur(now - ts)} old` : `— ${_('nothing verified yet')}`;
            this._failItem.label.text = back;
        } else if (ts === 0) {
            this._checkedItem.label.text = `${_('No successful check yet')} — ${_('use "Check now"')}`;
            this._failItem.label.text = '';
        } else {
            const t = GLib.DateTime.new_from_unix_local(ts).format('%H:%M');
            this._checkedItem.label.text = `${_('Last checked')}: ${humanDur(now - ts)} ago (${t})` +
                (this._badge._stale ? ` — ${_('certificate expired')}` : '');
            this._failItem.label.text = '';
        }

        if (!failed) {
            if (n > 0) {
                const tops = (st.top || '').split(', ').filter(Boolean).slice(0, 5).join(', ');
                this._pendingItem.label.text = `${_('Pending updates')} (${n}): ${tops}`;
                const secTops = (st.sec_top || '').split(', ').filter(Boolean).slice(0, 3).join(', ');
                this._securityItem.label.text = sec > 0
                    ? `⚠ ${sec} ${_('security updates')}${secTops ? `: ${secTops}` : ''}`
                    : _('Security: none');
                if (this._settings.get_boolean('pulse') && !this._pulsing) {
                    this._pulsing = true;
                    this._badge.ease({ opacity: 0.45, duration: 1400, mode: Clutter.AnimationMode.EASE_IN_OUT_SINE, repeat_count: -1, auto_reverse: true });
                }
            } else {
                this._pendingItem.label.text = _('Up to date — nothing pending');
                this._securityItem.label.text = '';
                if (this._pulsing) this._pulseOff();
            }
        } else {
            this._pulseOff();
            if (n > 0) {
                this._pendingItem.label.text = `${_('Pending updates (last verified)')} (${n}), ${_('security')}: ${sec}`;
            } else {
                this._pendingItem.label.text = _('No verified data yet');
            }
            this._securityItem.label.text = '';
        }
        this._badge.queue_repaint();
    }

    _pulseOff() {
        if (this._pulsing) {
            this._pulsing = false;
            this._badge.remove_all_transitions();
            this._badge.opacity = 255;
        }
    }

    _runCheck(manual) {
        if (this._busy || this._torn) return;
        if (!manual && !this._settings.get_boolean('auto-check')) return;
        this._busy = true;
        this._pulseOff();
        this._checkItem.setSensitive(false);
        this._wrapWrite({ phase: 'checking', pct: 10 });
        this._badge.set_pivot_point(0.5, 0.5);
        this._badge.setSpinner(true, 10);
        if (!this._spinTick)
            this._spinTick = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => { this._badge.bumpAngle(); return GLib.SOURCE_CONTINUE; });
        if (!this._fast)
            this._fast = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
                if (this._torn || !this._busy) return GLib.SOURCE_REMOVE;
                const st = parseState();
                this._badge._pct = parseInt(st.pct) || this._badge._pct;
                this._badge.queue_repaint();
                return GLib.SOURCE_CONTINUE;
            });
        this._attempt(1);
    }

    _timeoutSecs() { return Math.max(10, this._settings.get_uint('timeout-seconds')); }

    _armDeadline(cb) {
        this._clearDeadline();
        this._deadline = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this._timeoutSecs(), () => {
            this._deadline = null;
            cb();
            return GLib.SOURCE_REMOVE;
        });
    }

    _attempt(n) {
        if (this._torn) return;
        this._wrapWrite({ pct: 10 });
        try {
            const proc = Gio.Subprocess.new(
                ['pkcon', 'refresh'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
            this._proc = proc;
            this._armDeadline(() => {
                try { proc.force_exit(); } catch { }
                this._proc = null;
                this._fail(`timeout (${this._timeoutSecs()}s per step)`, n, true);
            });
            proc.communicate_utf8_async(null, null, (p, res) => {
                let out = '', err = '';
                try { [, out, err] = p.communicate_utf8_finish(res) ?? [true, '', '']; } catch { }
                this._clearDeadline();
                this._proc = null;
                if (this._torn) return;
                const ok = p.get_exit_status() === 0;
                if (!ok) {
                    const tail = (err || out || '').trim().split('\n').filter(Boolean).pop() || '';
                    this._fail(tail ? `${tail}` : 'pkcon refresh failed', n, true);
                    return;
                }
                this._wrapWrite({ pct: 78 });
                this._runScan(n);
            });
        } catch {
            this._proc = null;
            this._fail('pkcon is not available', n, true);
        }
    }

    _runScan(n) {
        if (this._torn) return;
        try {
            const proc = Gio.Subprocess.new(
                ['bash', '-c', "apt list --upgradable 2>/dev/null; printf '===SEC===\\n'; apt-get -s dist-upgrade 2>/dev/null | grep '^Inst'"],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
            this._proc = proc;
            this._armDeadline(() => {
                try { proc.force_exit(); } catch { }
                this._freshFail(n, 'apt scan timed out');
            });
            proc.communicate_utf8_async(null, null, (p, res) => {
                let out = '', err = '';
                try { [, out, err] = p.communicate_utf8_finish(res) ?? [true, '', '']; } catch { }
                this._clearDeadline();
                this._proc = null;
                if (this._torn) return;
                if (!out.includes('===SEC===')) {
                    this._fail(err.trim() ? `apt scan failed: ${err.split('\n')[0]}` : 'apt scan produced no output', n, true);
                    return;
                }
                const idx = out.indexOf('===SEC===');
                const upPart = out.slice(0, idx);
                const secPart = out.slice(idx + 9);
                const rows = upPart.split('\n').filter(l => l.includes('/')).map(l => l.split('/')[0]);
                const secRows = [];
                for (const line of secPart.split('\n')) {
                    const m = line.match(/^Inst\s+(\S+)\s.*\(([^)]*)\)/);
                    if (m && /\bsecurity\b/.test(m[2]) && !secRows.includes(m[1]))
                        secRows.push(m[1]);
                }
                this._certify(rows, secRows);
            });
        } catch {
            this._proc = null;
            this._freshFail(n, 'apt scan could not start');
        }
    }

    _freshFail(n, reason) {
        if (this._torn) return;
        this._fail(reason, n, true);
    }

    _certify(rows, secRows) {
        this._clearDeadline();
        const tops = rows.slice(0, 5).join(', ');
        const secTops = secRows.slice(0, 3).join(', ');
        this._wrapWrite({
            phase: 'idle',
            pct: 0,
            status: 'ok',
            fail_reason: '',
            checked_epoch: Math.floor(Date.now() / 1000),
            count: String(rows.length),
            top: tops,
            security: String(secRows.length),
            sec_top: secTops,
        });
        this._endCheck();
        this._badge.setSpinner(false, 0);
        this._badge.scale_x = this._badge.scale_y = 1.25;
        this._badge.ease({ scale_x: 1.0, scale_y: 1.0, duration: 240, mode: Clutter.AnimationMode.EASE_OUT_CUBIC });
        if (rows.length > 0 && this._settings.get_boolean('notify')) {
            try {
                const head = secRows.length > 0
                    ? `${_('Updates pending')}: ${rows.length} — ${_('includes')} ${secRows.length} ${_('security')}`
                    : `${_('Updates pending your confirmation')}: ${rows.length}`;
                Main.notify(head,
                    `${_('Open GNOME Software to review and install')} (${rows.slice(0, 3).join(', ')}). ${_('Nothing downloads or installs without your click.')}`);
            } catch { }
        }
        this._paintFinal(parseState(), false, false);
    }

    _fail(reason, attemptNo, allowRetry) {
        const attempts = Math.max(1, this._settings.get_uint('retry-attempts'));
        const delay = Math.max(5, this._settings.get_uint('retry-delay-seconds'));
        if (allowRetry && attemptNo < attempts && !this._torn) {
            this._wrapWrite({ fail_reason: reason, fail_epoch: Math.floor(Date.now() / 1000), pct: 5 });
            this._retryTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, delay, () => {
                this._retryTimer = null;
                if (!this._torn && this._busy) this._attempt(attemptNo + 1);
                return GLib.SOURCE_REMOVE;
            });
            return;
        }
        this._wrapWrite({
            phase: 'idle',
            pct: 0,
            status: 'failed',
            fail_reason: reason,
            fail_epoch: Math.floor(Date.now() / 1000),
        });
        this._endCheck();
        this._badge.setSpinner(false, 0);
        this._badge.scale_x = this._badge.scale_y = 1.25;
        this._badge.ease({ scale_x: 1.0, scale_y: 1.0, duration: 240, mode: Clutter.AnimationMode.EASE_OUT_CUBIC });
        this._paintFinal(parseState(), false, true);
    }

    _endCheck() {
        this._stopTimers();
        this._busy = false;
        this._checkItem.setSensitive(true);
    }

    _wrapWrite(updateObj) {
        const merged = parseState();
        for (const [k, v] of Object.entries(updateObj)) merged[k] = v;
        GLib.file_set_contents(statePath(), Object.entries(merged).map(([k, v]) => `${k}=${v}`).join('\n'));
    }

    destroy() {
        this._torn = true;
        this._stopTimers();
        if (this._beat) { GLib.Source.remove(this._beat); this._beat = null; }
        this._pulseOff();
        if (this._proc) { try { this._proc.force_exit(); } catch { } this._proc = null; }
        super.destroy();
    }
});

export default class UpdateWatchExtension extends Extension {
    enable() {
        try {
            this._menuButton = new UpdateWatch(this.getSettings());
            Main.panel.addToStatusArea('update-watch', this._menuButton, 1, 'right');
        } catch (e) {
            console.error(`[${UUID}] enable failed: ${e}`);
            throw e;
        }
    }

    disable() {
        if (this._menuButton) { this._menuButton.destroy(); this._menuButton = null; }
    }
}
