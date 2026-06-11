var AttachmentRepository_1;
import { __awaiter, __decorate } from "tslib";
import { Injectable } from '@nestjs/common';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { basename, extname, join, resolve } from 'path';
import { randomUUID } from 'crypto';
let AttachmentRepository = AttachmentRepository_1 = class AttachmentRepository {
    getUploadRoot() {
        return resolve(process.env.UPLOAD_DIRECTORY || AttachmentRepository_1.DEFAULT_UPLOAD_DIRECTORY);
    }
    sanitizeSegment(value) {
        return value.replace(/[^a-zA-Z0-9._-]/g, '-');
    }
    sanitizeFileName(fileName) {
        const base = basename(fileName);
        const extension = extname(base).slice(0, 20);
        const nameWithoutExtension = base.slice(0, Math.max(base.length - extension.length, 1));
        const safeName = this.sanitizeSegment(nameWithoutExtension).slice(0, 80) || 'file';
        const safeExt = this.sanitizeSegment(extension) || '';
        return `${safeName}${safeExt}`;
    }
    saveAttachment(orgId, originalName, buffer) {
        return __awaiter(this, void 0, void 0, function* () {
            const safeOrgId = this.sanitizeSegment(orgId || 'default-org');
            const dateFolder = new Date().toISOString().slice(0, 10);
            const relativeDirectory = join('swarm', safeOrgId, dateFolder);
            const absoluteDirectory = join(this.getUploadRoot(), relativeDirectory);
            yield mkdir(absoluteDirectory, { recursive: true });
            const storedName = `${randomUUID()}-${this.sanitizeFileName(originalName)}`;
            const absoluteFilePath = join(absoluteDirectory, storedName);
            yield writeFile(absoluteFilePath, buffer);
            return {
                relativePath: join(relativeDirectory, storedName).replace(/\\/g, '/'),
                storedName,
            };
        });
    }
    deleteAttachment(relativePath) {
        return __awaiter(this, void 0, void 0, function* () {
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
            yield unlink(absoluteFilePath);
            return true;
        });
    }
};
AttachmentRepository.DEFAULT_UPLOAD_DIRECTORY = 'uploads';
AttachmentRepository = AttachmentRepository_1 = __decorate([
    Injectable()
], AttachmentRepository);
export { AttachmentRepository };
//# sourceMappingURL=attachment.repository.js.map