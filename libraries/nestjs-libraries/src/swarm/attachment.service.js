import { __awaiter, __decorate, __metadata } from "tslib";
import { BadRequestException, Injectable } from '@nestjs/common';
import { AttachmentRepository } from './attachment.repository';
let AttachmentService = class AttachmentService {
    constructor(_attachmentRepository) {
        this._attachmentRepository = _attachmentRepository;
    }
    sanitizeSegment(value) {
        return value.replace(/[^a-zA-Z0-9._-]/g, '-');
    }
    detectAttachmentType(mimeType, fileName) {
        if (mimeType.startsWith('image/'))
            return 'image';
        if (mimeType.startsWith('video/'))
            return 'video';
        if (mimeType.startsWith('audio/'))
            return 'audio';
        const lowerName = fileName.toLowerCase();
        const isDocument = mimeType.includes('pdf') ||
            mimeType.includes('msword') ||
            mimeType.includes('officedocument') ||
            mimeType.includes('text/') ||
            lowerName.endsWith('.pdf') ||
            lowerName.endsWith('.doc') ||
            lowerName.endsWith('.docx') ||
            lowerName.endsWith('.xls') ||
            lowerName.endsWith('.xlsx') ||
            lowerName.endsWith('.csv') ||
            lowerName.endsWith('.ppt') ||
            lowerName.endsWith('.pptx') ||
            lowerName.endsWith('.txt') ||
            lowerName.endsWith('.md');
        return isDocument ? 'document' : 'other';
    }
    uploadAttachment(orgId, file) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            if (!file) {
                throw new BadRequestException('File is required');
            }
            if (!((_a = file.originalname) === null || _a === void 0 ? void 0 : _a.trim())) {
                throw new BadRequestException('File name is required');
            }
            if (!((_b = file.buffer) === null || _b === void 0 ? void 0 : _b.length)) {
                throw new BadRequestException('Uploaded file is empty');
            }
            const saved = yield this._attachmentRepository.saveAttachment(orgId, file.originalname, file.buffer);
            const mimeType = file.mimetype || 'application/octet-stream';
            const attachmentType = this.detectAttachmentType(mimeType, file.originalname);
            return {
                id: saved.storedName,
                name: file.originalname,
                mimeType,
                path: saved.relativePath,
                size: file.size || file.buffer.length,
                type: attachmentType,
                url: `/uploads/${saved.relativePath}`,
            };
        });
    }
    deleteAttachment(orgId, relativePath) {
        return __awaiter(this, void 0, void 0, function* () {
            const normalizedPath = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
            const safeOrgId = this.sanitizeSegment(orgId || 'default-org');
            const allowedPrefix = `swarm/${safeOrgId}/`;
            if (!normalizedPath.startsWith(allowedPrefix)) {
                throw new BadRequestException('Invalid attachment path');
            }
            yield this._attachmentRepository.deleteAttachment(normalizedPath);
        });
    }
};
AttachmentService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [AttachmentRepository])
], AttachmentService);
export { AttachmentService };
//# sourceMappingURL=attachment.service.js.map