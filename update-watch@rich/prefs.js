import { ExtensionPreferences } from 'resource:///org/gnome/shell/extensions/extensionPreferences.js';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

const SCHEMA = 'org.gnome.shell.extensions.update-watch';

export default class UpdateWatchPrefs extends ExtensionPreferences {
    getPreferences(win) {
        const settings = this.getSettings(SCHEMA);

        const page = new Adw.PreferencesPage();
        win.add(page);

        const about = new Adw.PreferencesGroup({
            title: 'Update Watch',
            description: 'The badge is a certificate: green only after a verified successful check.',
        });
        page.add(about);

        const checking = new Adw.PreferencesGroup({ title: 'Checking' });
        page.add(checking);
        const autoRow = new Adw.SwitchRow({
            title: 'Refresh metadata automatically',
            subtitle: 'Keeps the certificate current while you work.',
        });
        checking.add(autoRow);

        const interval = this._spin('Certificate window',
            'A check stays valid only this long. After it, the badge shows a dashed stamp until a new check succeeds.',
            30, 1440, 15, 60);
        checking.add(interval);
        this._bindUint(settings, 'interval-minutes', interval);

        const reliability = new Adw.PreferencesGroup({
            title: 'Reliability',
            description: 'Failures, timeouts and unknowns are shown honestly — never guessed away.',
        });
        page.add(reliability);
        const timeout = this._spin('Per-step deadline',
            'Each step must finish within this time or the check is declared failed.',
            10, 600, 10, 30);
        reliability.add(timeout);
        this._bindUint(settings, 'timeout-seconds', timeout);

        const attempts = this._spin('Attempts per check',
            'Total tries, including the first. Set to 1 for a single honest try.',
            1, 5, 1, 5);
        reliability.add(attempts);
        this._bindUint(settings, 'retry-attempts', attempts);

        const delay = this._spin('Delay between retries',
            'Backoff between consecutive attempts.',
            5, 300, 5, 30);
        reliability.add(delay);
        this._bindUint(settings, 'retry-delay-seconds', delay);

        const severity = new Adw.PreferencesGroup({ title: 'Severity ladder' });
        page.add(severity);
        const backlog = this._spin('Orange at this many pending',
            'Yellow below, orange at or above; any security update always turns red.',
            5, 200, 5, 25);
        severity.add(backlog);
        this._bindUint(settings, 'backlog-count', backlog);

        const feedback = new Adw.PreferencesGroup({ title: 'Feedback' });
        page.add(feedback);
        const notifyRow = new Adw.SwitchRow({
            title: 'Desktop notification on new updates',
            subtitle: 'A quiet reminder — never a nag.',
        });
        feedback.add(notifyRow);
        const pulseRow = new Adw.SwitchRow({
            title: 'Pulse the badge when updates wait',
            subtitle: 'Disable if the breathing is too loud on your setup.',
        });
        feedback.add(pulseRow);

        settings.bind('auto-check', autoRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('notify', notifyRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('pulse', pulseRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    }

    _spin(title, subtitle, lower, upper, step, page) {
        return new Adw.SpinRow({
            title,
            subtitle,
            adjustment: new Gtk.Adjustment({ lower, upper, step_increment: step, page_increment: page }),
        });
    }

    _bindUint(settings, key, row) {
        row.value = settings.get_uint(key);
        settings.connect(`changed::${key}`, () => { row.value = settings.get_uint(key); });
        row.connect('notify::value', () => {
            const v = Math.round(row.value);
            if (v !== settings.get_uint(key)) settings.set_uint(key, v);
        });
    }
}
