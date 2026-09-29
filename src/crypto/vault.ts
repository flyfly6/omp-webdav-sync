import * as crypto from "node:crypto";

const MAGIC_HEADER = Buffer.from([0x4f, 0x4d, 0x50, 0x56]); // "OMPV"
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const PBKDF2_ROUNDS = 100_000;
const KEY_LENGTH = 32; // 256 bits

export class VaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultError";
  }
}

export function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ROUNDS, KEY_LENGTH, "sha256");
}

export function encryptVault(data: string | Buffer | Record<string, unknown>, password: string): Buffer {
  if (!password) {
    throw new VaultError("加密密码不能为空");
  }

  let plaintext: Buffer;
  if (typeof data === "string") {
    plaintext = Buffer.from(data, "utf-8");
  } else if (Buffer.isBuffer(data)) {
    plaintext = data;
  } else {
    plaintext = Buffer.from(JSON.stringify(data, null, 2), "utf-8");
  }

  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(password, salt);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(MAGIC_HEADER);

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([MAGIC_HEADER, salt, iv, tag, encrypted]);
}

export function decryptVault(encryptedBuffer: Buffer, password: string): string {
  if (!password) {
    throw new VaultError("解密密码不能为空");
  }

  const minLength = MAGIC_HEADER.length + SALT_LENGTH + IV_LENGTH + TAG_LENGTH;
  if (encryptedBuffer.length < minLength) {
    throw new VaultError("保险库数据损坏：文件长度不足");
  }

  const magic = encryptedBuffer.subarray(0, MAGIC_HEADER.length);
  if (!magic.equals(MAGIC_HEADER)) {
    throw new VaultError("无效的保险库文件格式：缺少 OMPV 标识头");
  }

  let offset = MAGIC_HEADER.length;
  const salt = encryptedBuffer.subarray(offset, offset + SALT_LENGTH);
  offset += SALT_LENGTH;

  const iv = encryptedBuffer.subarray(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;

  const tag = encryptedBuffer.subarray(offset, offset + TAG_LENGTH);
  offset += TAG_LENGTH;

  const ciphertext = encryptedBuffer.subarray(offset);

  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(MAGIC_HEADER);
  decipher.setAuthTag(tag);

  try {
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf-8");
  } catch {
    throw new VaultError("保险库解密失败：密码错误或数据已被篡改");
  }
}

export function decryptVaultJson<T = Record<string, unknown>>(encryptedBuffer: Buffer, password: string): T {
  const decryptedText = decryptVault(encryptedBuffer, password);
  try {
    return JSON.parse(decryptedText) as T;
  } catch {
    throw new VaultError("保险库内容解析失败：解密后的数据不是有效的 JSON");
  }
}
