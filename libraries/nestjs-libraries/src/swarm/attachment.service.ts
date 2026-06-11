import { BadRequestException, Injectable } from '@nestjs/common';
import { AttachmentRepository } from './attachment.repository';
import type { Express } from 'express';

export interface UploadedAttachment {
  id: string;
  name: string;
  url: string;
  path: string;
  mimeType: string;
  size: number;
  type: 'image' | 'video' | 'audio' | 'document' | 'other';
}

@Injectable()
export class AttachmentService {
  constructor(private readonly _attachmentRepository: AttachmentRepository) {}

  private sanitizeSegment(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]/g, '-');
  }

  private detectAttachmentType(mimeType: string, fileName: string): UploadedAttachment['type'] {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';

    const lowerName = fileName.toLowerCase();
    const isDocument =
      mimeType.includes('pdf') ||
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

  async uploadAttachment(
    orgId: string,
    file: Express.Multer.File,
  ): Promise<UploadedAttachment> {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    if (!file.originalname?.trim()) {
      throw new BadRequestException('File name is required');
    }
    if (!file.buffer?.length) {
      throw new BadRequestException('Uploaded file is empty');
    }

    const saved = await this._attachmentRepository.saveAttachment(
      orgId,
      file.originalname,
      file.buffer,
    );
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
  }

  async deleteAttachment(orgId: string, relativePath: string) {
    const normalizedPath = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const safeOrgId = this.sanitizeSegment(orgId || 'default-org');
    const allowedPrefix = `swarm/${safeOrgId}/`;

    if (!normalizedPath.startsWith(allowedPrefix)) {
      throw new BadRequestException('Invalid attachment path');
    }

    await this._attachmentRepository.deleteAttachment(normalizedPath);
  }
}
