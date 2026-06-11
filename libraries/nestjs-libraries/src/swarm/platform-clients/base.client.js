/**
 * Base interface and shared types for all platform clients.
 * Each client logs in via credentials (no API keys) and exposes
 * typed methods that sub-agents call directly.
 */
export class BasePlatformClient {
    constructor(platform) {
        this.platform = platform;
        this.session = null;
    }
    /** Restore a previously saved session without re-logging in */
    restoreSession(session) {
        this.session = session;
    }
    isSessionValid() {
        if (!this.session)
            return false;
        if (this.session.expiresAt && this.session.expiresAt < Date.now())
            return false;
        return true;
    }
    headersWith(extra = {}) {
        return Object.assign({ 'Content-Type': 'application/json' }, extra);
    }
}
//# sourceMappingURL=base.client.js.map