import test from "node:test";
import assert from "node:assert/strict";
import { encryptVault, decryptVault, decryptVaultJson, VaultError } from "../src/crypto/vault.js";

test("Vault: Encrypt and decrypt string roundtrip", () => {
  const secret = "my-super-secret-api-token-12345";
  const password = "master-password-strong";

  const encrypted = encryptVault(secret, password);
  assert.ok(encrypted.length > secret.length);

  const decrypted = decryptVault(encrypted, password);
  assert.equal(decrypted, secret);
});

test("Vault: Encrypt and decrypt JSON object roundtrip", () => {
  const payload = {
    apiKey: "sk-ant-12345",
    tokens: ["tok_1", "tok_2"],
    subConfig: { enabled: true, count: 42 },
  };
  const password = "vault-password-xyz";

  const encrypted = encryptVault(payload, password);
  const decrypted = decryptVaultJson<typeof payload>(encrypted, password);
  assert.deepEqual(decrypted, payload);
});

test("Vault: Decryption fails with wrong password", () => {
  const secret = "top-secret-notes";
  const password = "correct-password";
  const wrongPassword = "incorrect-password";

  const encrypted = encryptVault(secret, password);

  assert.throws(
    () => decryptVault(encrypted, wrongPassword),
    (err: unknown) => {
      assert.ok(err instanceof VaultError);
      assert.match(err.message, /解密失败/);
      return true;
    },
  );
});

test("Vault: Tamper detection on ciphertext fails decryption", () => {
  const secret = "uncompromised-content";
  const password = "password";

  const encrypted = encryptVault(secret, password);
  // Flip a byte in the ciphertext payload
  encrypted[encrypted.length - 1] ^= 0xff;

  assert.throws(
    () => decryptVault(encrypted, password),
    (err: unknown) => {
      assert.ok(err instanceof VaultError);
      return true;
    },
  );
});

test("Vault: Empty password throws VaultError", () => {
  assert.throws(
    () => encryptVault("data", ""),
    (err: unknown) => {
      assert.ok(err instanceof VaultError);
      return true;
    },
  );
});
