"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCurve25519KeyPair = generateCurve25519KeyPair;
exports.generateCurve25519SharedSecKey = generateCurve25519SharedSecKey;
exports.HKDF = HKDF;
exports.writeUInt64LE = writeUInt64LE;
exports.chacha20_poly1305_decryptAndVerify = chacha20_poly1305_decryptAndVerify;
exports.chacha20_poly1305_encryptAndSeal = chacha20_poly1305_encryptAndSeal;
exports.layerEncrypt = layerEncrypt;
exports.layerDecrypt = layerDecrypt;
const tslib_1 = require("tslib");
const assert_1 = tslib_1.__importDefault(require("assert"));
const crypto_1 = tslib_1.__importDefault(require("crypto"));
const futoin_hkdf_1 = tslib_1.__importDefault(require("futoin-hkdf"));
const tweetnacl_1 = tslib_1.__importDefault(require("tweetnacl"));

// Electron on Raspberry Pi often lacks native chacha20-poly1305; use @noble/ciphers then.
const HAS_NATIVE_CHACHA = crypto_1.default.getCiphers().includes("chacha20-poly1305");
let nobleChacha20poly1305 = null;
if (!HAS_NATIVE_CHACHA) {
    try {
        nobleChacha20poly1305 = require("@noble/ciphers/chacha.js").chacha20poly1305;
        console.info("[MMM-HomeKit] Using @noble/ciphers polyfill for chacha20-poly1305 (Electron/OpenSSL)");
    }
    catch (error) {
        assert_1.default.fail("The cipher 'chacha20-poly1305' is not supported with your current running nodejs version v" + process.version + ". " +
            "Install @noble/ciphers in MMM-HomeKit or use a Node build with OpenSSL chacha support.");
    }
}

/**
 * @group Cryptography
 */
function generateCurve25519KeyPair() {
    return tweetnacl_1.default.box.keyPair();
}
/**
 * @group Cryptography
 */
function generateCurve25519SharedSecKey(priKey, pubKey) {
    return tweetnacl_1.default.scalarMult(priKey, pubKey);
}
/**
 * @group Cryptography
 */
function HKDF(hashAlg, salt, ikm, info, size) {
    return (0, futoin_hkdf_1.default)(ikm, size, { hash: hashAlg, salt: salt, info: info });
}
const MAX_UINT32 = 0x00000000FFFFFFFF;
const MAX_INT53 = 0x001FFFFFFFFFFFFF;
function uintHighLow(number) {
    (0, assert_1.default)(number > -1 && number <= MAX_INT53, "number out of range");
    (0, assert_1.default)(Math.floor(number) === number, "number must be an integer");
    let high = 0;
    const signbit = number & 0xFFFFFFFF;
    const low = signbit < 0 ? (number & 0x7FFFFFFF) + 0x80000000 : signbit;
    if (number > MAX_UINT32) {
        high = (number - low) / (MAX_UINT32 + 1);
    }
    return [high, low];
}
/**
 * @group Utils
 */
function writeUInt64LE(number, buffer, offset = 0) {
    const hl = uintHighLow(number);
    buffer.writeUInt32LE(hl[1], offset);
    buffer.writeUInt32LE(hl[0], offset + 4);
}

function normalizeNonce(nonce) {
    if (nonce.length < 12) {
        return Buffer.concat([
            Buffer.alloc(12 - nonce.length, 0),
            nonce,
        ]);
    }
    return nonce;
}

//Security Layer Enc/Dec
/**
 * @group Cryptography
 */
function chacha20_poly1305_decryptAndVerify(key, nonce, aad, ciphertext, authTag) {
    nonce = normalizeNonce(nonce);
    if (!HAS_NATIVE_CHACHA) {
        const combined = Buffer.concat([ciphertext, authTag]);
        const decipher = nobleChacha20poly1305(key, nonce, aad || undefined);
        return Buffer.from(decipher.decrypt(combined));
    }
    const decipher = crypto_1.default.createDecipheriv("chacha20-poly1305", key, nonce, { authTagLength: 16 });
    if (aad) {
        decipher.setAAD(aad, { plaintextLength: ciphertext.length });
    }
    decipher.setAuthTag(authTag);
    const plaintext = decipher.update(ciphertext);
    decipher.final();
    return plaintext;
}
/**
 * @group Cryptography
 */
function chacha20_poly1305_encryptAndSeal(key, nonce, aad, plaintext) {
    nonce = normalizeNonce(nonce);
    if (!HAS_NATIVE_CHACHA) {
        const cipher = nobleChacha20poly1305(key, nonce, aad || undefined);
        const sealed = Buffer.from(cipher.encrypt(plaintext));
        return {
            ciphertext: sealed.subarray(0, sealed.length - 16),
            authTag: sealed.subarray(sealed.length - 16),
        };
    }
    const cipher = crypto_1.default.createCipheriv("chacha20-poly1305", key, nonce, { authTagLength: 16 });
    if (aad) {
        cipher.setAAD(aad, { plaintextLength: plaintext.length });
    }
    const ciphertext = cipher.update(plaintext);
    cipher.final();
    const authTag = cipher.getAuthTag();
    return {
        ciphertext: ciphertext,
        authTag: authTag,
    };
}
/**
 * @group Cryptography
 */
function layerEncrypt(data, encryption) {
    let result = Buffer.alloc(0);
    const total = data.length;
    for (let offset = 0; offset < total;) {
        const length = Math.min(total - offset, 0x400);
        const leLength = Buffer.alloc(2);
        leLength.writeUInt16LE(length, 0);
        const nonce = Buffer.alloc(8);
        writeUInt64LE(encryption.accessoryToControllerCount++, nonce, 0);
        const encrypted = chacha20_poly1305_encryptAndSeal(encryption.accessoryToControllerKey, nonce, leLength, data.slice(offset, offset + length));
        offset += length;
        result = Buffer.concat([result, leLength, encrypted.ciphertext, encrypted.authTag]);
    }
    return result;
}
/**
 * @group Cryptography
 */
function layerDecrypt(data, encryption) {
    let result = Buffer.alloc(0);
    const total = data.length;
    for (let offset = 0; offset < total;) {
        const leLength = data.slice(offset, offset + 2);
        offset += 2;
        const length = leLength.readUInt16LE(0);
        const ciphertext = data.slice(offset, offset + length);
        offset += length;
        const authTag = data.slice(offset, offset + 16);
        offset += 16;
        const nonce = Buffer.alloc(8);
        writeUInt64LE(encryption.controllerToAccessoryCount++, nonce, 0);
        const decrypted = chacha20_poly1305_decryptAndVerify(encryption.controllerToAccessoryKey, nonce, leLength, ciphertext, authTag);
        result = Buffer.concat([result, decrypted]);
    }
    return result;
}
