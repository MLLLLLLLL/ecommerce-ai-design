import { deflateRawSync } from 'node:zlib';

export interface ZipEntry {
  name: string;
  data: Buffer;
}

const ZIP_SIGNATURES = {
  localFile: 0x04034b50,
  centralDirectory: 0x02014b50,
  endOfCentralDirectory: 0x06054b50,
} as const;

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uniqueEntryName(name: string, usedNames: Set<string>): string {
  const safeName = name.replace(/^.*[\\/]/, '') || 'resource';
  const extensionIndex = safeName.lastIndexOf('.');
  const stem = extensionIndex > 0 ? safeName.slice(0, extensionIndex) : safeName;
  const extension = extensionIndex > 0 ? safeName.slice(extensionIndex) : '';
  let candidate = safeName;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = `${stem} (${suffix})${extension}`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

/** 创建包含 UTF-8 文件名的 ZIP，图片已压缩时自动改用无压缩存储。 */
export function createZipArchive(entries: ZipEntry[]): Buffer {
  const localRecords: Buffer[] = [];
  const centralRecords: Buffer[] = [];
  const usedNames = new Set<string>();
  let offset = 0;

  for (const entry of entries) {
    const name = uniqueEntryName(entry.name, usedNames);
    const nameBuffer = Buffer.from(name, 'utf8');
    const crc = crc32(entry.data);
    const compressed = deflateRawSync(entry.data);
    const method = compressed.length < entry.data.length ? 8 : 0;
    const payload = method === 8 ? compressed : entry.data;

    const localHeader = Buffer.alloc(30 + nameBuffer.length);
    localHeader.writeUInt32LE(ZIP_SIGNATURES.localFile, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    nameBuffer.copy(localHeader, 30);
    localRecords.push(localHeader, payload);

    const centralHeader = Buffer.alloc(46 + nameBuffer.length);
    centralHeader.writeUInt32LE(ZIP_SIGNATURES.centralDirectory, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    nameBuffer.copy(centralHeader, 46);
    centralRecords.push(centralHeader);

    offset += localHeader.length + payload.length;
  }

  const centralDirectory = Buffer.concat(centralRecords);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(ZIP_SIGNATURES.endOfCentralDirectory, 0);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16);

  return Buffer.concat([...localRecords, centralDirectory, endRecord]);
}
