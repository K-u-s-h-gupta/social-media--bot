import { Injectable } from '@nestjs/common';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { basename, extname, join, resolve } from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class AttachmentRepository {
  private static readonly DEFAULT_UPLOAD_DIRECTORY = 'uploads';

  private getUploadRoot() {
    return resolve(
      process.env.UPLOAD_DIRECTORY || AttachmentRepository.DEFAULT_UPLOAD_DIRECTORY,
    );
  }

  private sanitizeSegment(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]/g, '-');
  }

  private sanitizeFileName(fileName: string) {
    const base = basename(fileName);
    const extension = extname(base).slice(0, 20);
    const nameWithoutExtension = base.slice(0, Math.max(base.length - extension.length, 1));
    const safeName = this.sanitizeSegment(nameWithoutExtension).slice(0, 80) || 'file';
    const safeExt = this.sanitizeSegment(extension) || '';
    return `${safeName}${safeExt}`;
  }

  async saveAttachment(
    orgId: string,
    originalName: string,
    buffer: Buffer,
  ): Promise<{ relativePath: string; storedName: string }> {
    const safeOrgId = this.sanitizeSegment(orgId || 'default-org');
    const dateFolder = new Date().toISOString().slice(0, 10);
    const relativeDirectory = join('swarm', safeOrgId, dateFolder);
    const absoluteDirectory = join(this.getUploadRoot(), relativeDirectory);

    await mkdir(absoluteDirectory, { recursive: true });

    const storedName = `${randomUUID()}-${this.sanitizeFileName(originalName)}`;
    const absoluteFilePath = join(absoluteDirectory, storedName);
    await writeFile(absoluteFilePath, buffer);

    return {
      relativePath: join(relativeDirectory, storedName).replace(/\\/g, '/'),
      storedName,
    };
  }

  async deleteAttachment(relativePath: string): Promise<boolean> {
    const normalizedRelativePath = relativePath
      .replace(/\\/g, '/')
      .replace(/^\/+/, '');
    const absoluteRoot = this.getUploadRoot();
    const absoluteFilePath = resolve(absoluteRoot, normalizedRelativePath);

    if (!absoluteFilePath.startsWith(absoluteRoot)) {
      return false;
    }
    if (!existsSync(absoluteFilePath)) {
      return false;
    }

    await unlink(absoluteFilePath);
    return true;
  }
}
