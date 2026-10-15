import { Global, Injectable, Module } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * File storage for receipt images and raw receipts. Local disk outside any web root
 * (REQ-SEC-03); swap this class for an S3/R2 implementation in production.
 */
@Injectable()
export class StorageService {
  private root = path.resolve(process.env.STORAGE_DIR || './storage');

  async put(folder: string, data: Buffer, ext: string): Promise<string> {
    const key = `${folder}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
    return key;
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error('Invalid storage key');
    return full;
  }
}

@Global()
@Module({ providers: [StorageService], exports: [StorageService] })
export class StorageModule {}
