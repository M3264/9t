import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import ts from "typescript";

test("mobile envelopes bind device, direction, and request; Java and Node interoperate", async () => {
  const dir = await mkdtemp(join(tmpdir(), "9t-wire-"));
  try {
    const source = await readFile(
      new URL("../lib/server/mobile-crypto.ts", import.meta.url),
      "utf8",
    );
    await writeFile(
      join(dir, "crypto.mjs"),
      ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    );
    const { seal, unseal } = await import(join(dir, "crypto.mjs"));
    const key = randomBytes(32).toString("base64"),
      aad = "9t:v1:instance:device:request",
      payload = { content: "hello 📱\nnew line" };
    const encrypted = seal(key, aad, payload);
    assert.deepEqual(unseal(key, aad, encrypted), payload);
    assert.throws(() =>
      unseal(key, aad.replace("request", "response"), encrypted),
    );
    assert.throws(() =>
      unseal(key, aad.replace("instance", "evil"), encrypted),
    );
    assert.throws(() =>
      unseal(randomBytes(32).toString("base64"), aad, encrypted),
    );
    const tampered = Buffer.from(encrypted.data, "base64");
    tampered[0] ^= 1;
    assert.throws(() =>
      unseal(key, aad, { ...encrypted, data: tampered.toString("base64") }),
    );
    const java = `import xyz.kennyy.ninet.Wire;import javax.crypto.Cipher;import java.nio.charset.StandardCharsets;
public class Interop { public static void main(String[] args) throws Exception {
byte[] text=Wire.crypt(Cipher.DECRYPT_MODE,Wire.decode(args[0]),Wire.decode(args[1]),args[2],Wire.decode(args[3]));
byte[] iv=Wire.randomIv();System.out.println(Wire.b64(iv));System.out.println(Wire.b64(Wire.crypt(Cipher.ENCRYPT_MODE,Wire.decode(args[0]),iv,args[2],text)));
}}`;
    await writeFile(join(dir, "Interop.java"), java);
    execFileSync("javac", [
      "-d",
      dir,
      new URL(
        "../android/app/src/main/java/xyz/kennyy/ninet/Wire.java",
        import.meta.url,
      ).pathname,
      join(dir, "Interop.java"),
    ]);
    const [iv, data] = execFileSync(
      "java",
      ["-cp", dir, "Interop", key, encrypted.iv, aad, encrypted.data],
      { encoding: "utf8" },
    )
      .trim()
      .split("\n");
    assert.deepEqual(unseal(key, aad, { iv, data }), payload);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
