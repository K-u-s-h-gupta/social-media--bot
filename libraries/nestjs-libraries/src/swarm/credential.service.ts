import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { CredentialRepository } from './credential.repository';
import { createPlatformClient, BasePlatformClient, SessionData } from './platform-clients/client.factory';

const ALG = 'aes-256-gcm';

function getKey(): Buffer {
  const raw = process.env.SWARM_ENCRYPTION_KEY || '';
  if (raw.length === 64) return Buffer.from(raw, 'hex');
  if (raw.length === 32) return Buffer.from(raw);
  // Auto-generate a deterministic key from the JWT_SECRET so deploys without
  // SWARM_ENCRYPTION_KEY still work (less secure, but functional).
  const fallback = process.env.JWT_SECRET || 'changeme-set-SWARM_ENCRYPTION_KEY';
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(fallback).digest();
}

export function encryptPassword(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptPassword(stored: string): string {
  const [ivHex, tagHex, encHex] = stored.split(':');
  const key = getKey();
  const decipher = createDecipheriv(ALG, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encHex, 'hex')).toString('utf8') + decipher.final('utf8');
}

@Injectable()
export class CredentialService {
  private readonly logger = new Logger(CredentialService.name);

  constructor(private readonly credentialRepository: CredentialRepository) {}

  async addCredential(
    organizationId: string,
    platform: string,
    username: string,
    password: string,
    name?: string,
  ) {
    const existing = await this.credentialRepository.findOne(organizationId, platform, username);
    if (existing) {
      throw new Error(`Credential already exists for ${platform}/${username}`);
    }
    const passwordEnc = encryptPassword(password);
    return this.credentialRepository.create({ organizationId, platform, username, passwordEnc, name });
  }

  async listCredentials(organizationId: string) {
    const creds = await this.credentialRepository.findAll(organizationId);
    // Never return encrypted passwords to the API layer
    return creds.map((c) => ({
      id: c.id,
      platform: c.platform,
      username: c.username,
      name: (c as any).name || null,
      enabled: c.enabled,
      lastLoginAt: c.lastLoginAt,
      loginError: c.loginError,
      sessionExpiry: c.sessionExpiry,
      createdAt: c.createdAt,
    }));
  }

  async updateCredentialName(id: string, organizationId: string, name: string) {
    return this.credentialRepository.updateName(id, organizationId, name);
  }

  async removeCredential(id: string, organizationId: string) {
    return this.credentialRepository.delete(id, organizationId);
  }

  async toggleCredential(id: string, organizationId: string, enabled: boolean) {
    return this.credentialRepository.setEnabled(id, organizationId, enabled);
  }

  /**
   * Returns a ready-to-use platform client with active session.
   * Restores session from DB if still valid, otherwise logs in fresh.
   */
  async getClient(credentialId: string, organizationId: string): Promise<BasePlatformClient> {
    const cred = await this.credentialRepository.findById(credentialId, organizationId);
    if (!cred) throw new Error(`Credential ${credentialId} not found`);
    if (!cred.enabled) throw new Error(`Credential ${credentialId} is disabled`);

    const client = createPlatformClient(cred.platform);

    // Try to reuse cached session
    if (cred.sessionToken && cred.sessionExpiry && cred.sessionExpiry > new Date()) {
      const session: SessionData = {
        token: cred.sessionToken,
        extra: (cred.sessionData as any) || {},
        expiresAt: cred.sessionExpiry.getTime(),
        cookies: (cred.sessionData as any)?.cookies,
      };
      client.restoreSession(session);
      this.logger.log(`Restored session for ${cred.platform}/${cred.username}`);
      return client;
    }

    // Need fresh login
    this.logger.log(`Logging in to ${cred.platform} as ${cred.username}`);
    try {
      const password = decryptPassword(cred.passwordEnc);
      const session = await client.login(cred.username, password);

      const expiry = session.expiresAt
        ? new Date(session.expiresAt)
        : new Date(Date.now() + 24 * 60 * 60 * 1000);

      await this.credentialRepository.updateSession(
        cred.id,
        session.token,
        expiry,
        { cookies: session.cookies, ...session.extra },
        new Date(),
        null,
      );

      this.logger.log(`Login successful for ${cred.platform}/${cred.username}`);
      return client;
    } catch (err: any) {
      await this.credentialRepository.markLoginError(cred.id, err.message);
      throw err;
    }
  }

  /**
   * Returns clients for ALL enabled credentials for a given organization + platform combo.
   */
  async getClientsForPlatform(organizationId: string, platform: string): Promise<{ id: string; client: BasePlatformClient }[]> {
    const creds = await this.credentialRepository.findByPlatform(organizationId, platform);
    const results: { id: string; client: BasePlatformClient }[] = [];
    for (const cred of creds) {
      try {
        const client = await this.getClient(cred.id, organizationId);
        results.push({ id: cred.id, client });
      } catch (err: any) {
        this.logger.warn(`Skipping ${cred.platform}/${cred.username}: ${err.message}`);
      }
    }
    return results;
  }

  async invalidateSession(credentialId: string) {
    const cred = await this.credentialRepository.findById(credentialId, '');
    if (cred) {
      await this.credentialRepository.updateSession(cred.id, null, null, null, new Date());
    }
  }
}
