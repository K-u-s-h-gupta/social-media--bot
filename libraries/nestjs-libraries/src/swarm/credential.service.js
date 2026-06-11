var CredentialService_1;
import { __awaiter, __decorate, __metadata } from "tslib";
import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { CredentialRepository } from './credential.repository';
import { createPlatformClient } from './platform-clients/client.factory';
const ALG = 'aes-256-gcm';
function getKey() {
    const raw = process.env.SWARM_ENCRYPTION_KEY || '';
    if (raw.length === 64)
        return Buffer.from(raw, 'hex');
    if (raw.length === 32)
        return Buffer.from(raw);
    // Auto-generate a deterministic key from the JWT_SECRET so deploys without
    // SWARM_ENCRYPTION_KEY still work (less secure, but functional).
    const fallback = process.env.JWT_SECRET || 'changeme-set-SWARM_ENCRYPTION_KEY';
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(fallback).digest();
}
export function encryptPassword(plain) {
    const key = getKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALG, key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}
export function decryptPassword(stored) {
    const [ivHex, tagHex, encHex] = stored.split(':');
    const key = getKey();
    const decipher = createDecipheriv(ALG, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex')).toString('utf8') + decipher.final('utf8');
}
let CredentialService = CredentialService_1 = class CredentialService {
    constructor(credentialRepository) {
        this.credentialRepository = credentialRepository;
        this.logger = new Logger(CredentialService_1.name);
    }
    addCredential(organizationId, platform, username, password, name) {
        return __awaiter(this, void 0, void 0, function* () {
            const existing = yield this.credentialRepository.findOne(organizationId, platform, username);
            if (existing) {
                throw new Error(`Credential already exists for ${platform}/${username}`);
            }
            const passwordEnc = encryptPassword(password);
            return this.credentialRepository.create({ organizationId, platform, username, passwordEnc, name });
        });
    }
    listCredentials(organizationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const creds = yield this.credentialRepository.findAll(organizationId);
            // Never return encrypted passwords to the API layer
            return creds.map((c) => ({
                id: c.id,
                platform: c.platform,
                username: c.username,
                name: c.name || null,
                enabled: c.enabled,
                lastLoginAt: c.lastLoginAt,
                loginError: c.loginError,
                sessionExpiry: c.sessionExpiry,
                createdAt: c.createdAt,
            }));
        });
    }
    updateCredentialName(id, organizationId, name) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.credentialRepository.updateName(id, organizationId, name);
        });
    }
    removeCredential(id, organizationId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.credentialRepository.delete(id, organizationId);
        });
    }
    toggleCredential(id, organizationId, enabled) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.credentialRepository.setEnabled(id, organizationId, enabled);
        });
    }
    /**
     * Returns a ready-to-use platform client with active session.
     * Restores session from DB if still valid, otherwise logs in fresh.
     */
    getClient(credentialId, organizationId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const cred = yield this.credentialRepository.findById(credentialId, organizationId);
            if (!cred)
                throw new Error(`Credential ${credentialId} not found`);
            if (!cred.enabled)
                throw new Error(`Credential ${credentialId} is disabled`);
            const client = createPlatformClient(cred.platform);
            // Try to reuse cached session
            if (cred.sessionToken && cred.sessionExpiry && cred.sessionExpiry > new Date()) {
                const session = {
                    token: cred.sessionToken,
                    extra: cred.sessionData || {},
                    expiresAt: cred.sessionExpiry.getTime(),
                    cookies: (_a = cred.sessionData) === null || _a === void 0 ? void 0 : _a.cookies,
                };
                client.restoreSession(session);
                this.logger.log(`Restored session for ${cred.platform}/${cred.username}`);
                return client;
            }
            // Need fresh login
            this.logger.log(`Logging in to ${cred.platform} as ${cred.username}`);
            try {
                const password = decryptPassword(cred.passwordEnc);
                const session = yield client.login(cred.username, password);
                const expiry = session.expiresAt
                    ? new Date(session.expiresAt)
                    : new Date(Date.now() + 24 * 60 * 60 * 1000);
                yield this.credentialRepository.updateSession(cred.id, session.token, expiry, Object.assign({ cookies: session.cookies }, session.extra), new Date(), null);
                this.logger.log(`Login successful for ${cred.platform}/${cred.username}`);
                return client;
            }
            catch (err) {
                yield this.credentialRepository.markLoginError(cred.id, err.message);
                throw err;
            }
        });
    }
    /**
     * Returns clients for ALL enabled credentials for a given organization + platform combo.
     */
    getClientsForPlatform(organizationId, platform) {
        return __awaiter(this, void 0, void 0, function* () {
            const creds = yield this.credentialRepository.findByPlatform(organizationId, platform);
            const results = [];
            for (const cred of creds) {
                try {
                    const client = yield this.getClient(cred.id, organizationId);
                    results.push({ id: cred.id, client });
                }
                catch (err) {
                    this.logger.warn(`Skipping ${cred.platform}/${cred.username}: ${err.message}`);
                }
            }
            return results;
        });
    }
    invalidateSession(credentialId) {
        return __awaiter(this, void 0, void 0, function* () {
            const cred = yield this.credentialRepository.findById(credentialId, '');
            if (cred) {
                yield this.credentialRepository.updateSession(cred.id, null, null, null, new Date());
            }
        });
    }
};
CredentialService = CredentialService_1 = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [CredentialRepository])
], CredentialService);
export { CredentialService };
//# sourceMappingURL=credential.service.js.map