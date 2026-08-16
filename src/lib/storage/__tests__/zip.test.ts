import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createZipArchive } from '@/lib/storage/zip';

describe('createZipArchive', () => {
  it('保留 UTF-8 文件名并处理重复文件名', () => {
    const archive = createZipArchive([
      { name: '商品图.png', data: Buffer.from('first') },
      { name: '商品图.png', data: Buffer.from('second') },
    ]);
    const names: string[] = [];
    const contents: string[] = [];
    let offset = 0;

    while (archive.readUInt32LE(offset) === 0x04034b50) {
      const method = archive.readUInt16LE(offset + 8);
      const compressedSize = archive.readUInt32LE(offset + 18);
      const nameLength = archive.readUInt16LE(offset + 26);
      const extraLength = archive.readUInt16LE(offset + 28);
      const nameStart = offset + 30;
      const dataStart = nameStart + nameLength + extraLength;
      const payload = archive.subarray(dataStart, dataStart + compressedSize);
      names.push(archive.subarray(nameStart, nameStart + nameLength).toString('utf8'));
      contents.push((method === 8 ? inflateRawSync(payload) : payload).toString('utf8'));
      offset = dataStart + compressedSize;
    }

    expect(names).toEqual(['商品图.png', '商品图 (2).png']);
    expect(contents).toEqual(['first', 'second']);
    expect(archive.readUInt32LE(offset)).toBe(0x02014b50);
  });
});
