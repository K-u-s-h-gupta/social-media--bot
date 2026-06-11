import { __awaiter } from "tslib";
import { Logger } from '@nestjs/common';
export class BaseSubAgent {
    constructor(name, client, state, config) {
        this.name = name;
        this.client = client;
        this.state = state;
        this.config = config;
        this.running = false;
        this.paused = false;
        this.consecutiveErrors = 0;
        this.loopHandle = null;
        this.logger = new Logger(`SubAgent:${name}`);
    }
    start() {
        if (this.running)
            return;
        this.running = true;
        this.paused = false;
        this.logger.log('Starting');
        this.schedule();
    }
    pause() {
        this.paused = true;
        this.logger.log('Paused');
    }
    resume() {
        this.paused = false;
        this.logger.log('Resumed');
    }
    stop() {
        this.running = false;
        if (this.loopHandle) {
            clearTimeout(this.loopHandle);
            this.loopHandle = null;
        }
        this.logger.log('Stopped');
    }
    isRunning() { return this.running; }
    isPaused() { return this.paused; }
    schedule() {
        var _a;
        if (!this.running)
            return;
        const interval = (_a = this.config.intervalMs) !== null && _a !== void 0 ? _a : 60000;
        this.loopHandle = setTimeout(() => this.runOnce(), interval);
    }
    runOnce() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (!this.running)
                return;
            if (this.paused) {
                this.schedule();
                return;
            }
            if (!this.isActiveHour()) {
                this.logger.debug('Outside active hours — skipping');
                this.schedule();
                return;
            }
            try {
                const ok = yield this.tick();
                this.state.trackStat(this.name, ok);
                if (ok)
                    this.consecutiveErrors = 0;
                else
                    this.consecutiveErrors++;
            }
            catch (err) {
                this.logger.error(`tick() threw: ${err.message}`);
                this.state.trackStat(this.name, false);
                this.consecutiveErrors++;
            }
            const maxErrors = (_a = this.config.maxErrors) !== null && _a !== void 0 ? _a : 5;
            if (this.consecutiveErrors >= maxErrors) {
                this.logger.warn(`${maxErrors} consecutive errors — pausing for 10 minutes`);
                this.paused = true;
                setTimeout(() => {
                    this.consecutiveErrors = 0;
                    this.paused = false;
                    this.logger.log('Resuming after error cooldown');
                    this.schedule();
                }, 10 * 60000);
                return;
            }
            this.schedule();
        });
    }
    /** IST is UTC+5:30. Return true if current IST hour is within active window. */
    isActiveHour() {
        var _a, _b;
        const utcMs = Date.now();
        const istOffsetMs = 5.5 * 60 * 60 * 1000;
        const istHour = new Date(utcMs + istOffsetMs).getUTCHours();
        const start = (_a = this.config.activeHoursStart) !== null && _a !== void 0 ? _a : 6;
        const end = (_b = this.config.activeHoursEnd) !== null && _b !== void 0 ? _b : 23;
        return istHour >= start && istHour <= end;
    }
    /** Build a simple AI-style prompt response. Falls back to template if no AI. */
    buildContent(template, vars = {}) {
        let out = template;
        for (const [k, v] of Object.entries(vars)) {
            out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
        }
        return out;
    }
    /** Random delay between min and max ms */
    delay(minMs, maxMs) {
        const ms = minMs + Math.random() * (maxMs - minMs);
        return new Promise((r) => setTimeout(r, ms));
    }
}
//# sourceMappingURL=base.sub-agent.js.map