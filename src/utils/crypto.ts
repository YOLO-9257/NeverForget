/**
 * 简单的 AES-GCM 加密工具
 * 用于加密存储敏感信息（如邮箱密码）
 */

// 将字符串转换为 Uint8Array
function str2buf(str: string): Uint8Array {
    return new TextEncoder().encode(str);
}

// 将 Uint8Array 转换为字符串
function buf2str(buf: ArrayBuffer): string {
    return new TextDecoder().decode(buf);
}

// 将 buffer 转为 hex 字符串
function buf2hex(buf: ArrayBuffer | ArrayBufferView): string {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf as ArrayBuffer);
    return [...bytes]
        .map(x => x.toString(16).padStart(2, '0'))
        .join('');
}

// 将 hex 字符串转为 buffer
function hex2buf(hex: string): Uint8Array {
    const bytes = new Uint8Array(Math.ceil(hex.length / 2));
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}

// 从密钥字符串生成 CryptoKey
// 为了简化，即使提供的 key 长度不够，我们也会通过 hash 扩展
async function importKey(secret: string): Promise<CryptoKey> {
    const keyData = await crypto.subtle.digest('SHA-256', str2buf(secret));
    return await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * 加密密码
 * @param password 原始密码
 * @param secret 密钥 (来自环境变量)
 * @returns 格式: iv_hex:ciphertext_hex
 */
export async function encryptPassword(password: string, secret: string): Promise<string> {
    if (!password || !secret) return password;

    const key = await importKey(secret);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const content = str2buf(password);

    const encrypted = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv
        },
        key,
        content
    );

    return `${buf2hex(iv)}:${buf2hex(encrypted)}`;
}

/**
 * 解密密码
 * @param token 加密后的字符串 (iv_hex:ciphertext_hex)
 * @param secret 密钥
 * @returns 原始密码
 */
export async function decryptPassword(token: string, secret: string): Promise<string> {
    if (!token || !secret || !token.includes(':')) return token;

    try {
        const [ivHex, cipherHex] = token.split(':');
        const key = await importKey(secret);
        const iv = hex2buf(ivHex);
        const cipher = hex2buf(cipherHex);

        const decrypted = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            cipher
        );

        return buf2str(decrypted);
    } catch (e) {
        console.error('解密失败:', e);
        return ''; // 解密失败返空
    }
}

// ==========================================
// Base64 URL Helpers
// ==========================================

function base64UrlEncode(str: string): string {
    const utf8Bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < utf8Bytes.length; i++) {
        binary += String.fromCharCode(utf8Bytes[i]);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) {
        str += '=';
    }
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

// ==========================================
// Password Hashing (PBKDF2)
// ==========================================

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        str2buf(password),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
    );

    // Derive 256 bits (32 bytes)
    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        256
    );

    return {
        hash: buf2hex(derivedBits),
        salt: buf2hex(salt)
    };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
    const saltBuf = hex2buf(salt);
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        str2buf(password),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: saltBuf,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        256
    );

    const derivedHash = buf2hex(derivedBits);
    return derivedHash === hash;
}

// ==========================================
// JWT (HS256)
// ==========================================

const DEFAULT_JWT_SECRET = 'never-forget-default-secret-change-me-please';

async function getJwtKey(secret: string = DEFAULT_JWT_SECRET): Promise<CryptoKey> {
    return await crypto.subtle.importKey(
        'raw',
        str2buf(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify']
    );
}

export async function signJwt(payload: any, secret?: string): Promise<string> {
    const header = { alg: 'HS256', typ: 'JWT' };

    // Ensure exp
    const finalPayload = {
        ...payload,
        exp: payload.exp || Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(finalPayload));
    const data = `${encodedHeader}.${encodedPayload}`;

    const key = await getJwtKey(secret);
    const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        str2buf(data)
    );

    return `${data}.${arrayBufferToBase64Url(signature)}`;
}

export async function verifyJwt(token: string, secret?: string): Promise<any | null> {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        const [headerPart, payloadPart, signaturePart] = parts;
        const data = `${headerPart}.${payloadPart}`;

        const key = await getJwtKey(secret);
        const signature = await crypto.subtle.sign(
            'HMAC',
            key,
            str2buf(data)
        );

        const calculatedSig = arrayBufferToBase64Url(signature);
        if (calculatedSig !== signaturePart) return null;

        const payload = JSON.parse(base64UrlDecode(payloadPart));
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            return null; // Expired
        }

        return payload;
    } catch (e) {
        return null;
    }
}

// ==========================================
// HMAC SHA256 (Base64)
// ==========================================

export async function hmacSha256Base64(message: string, secret: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        'raw',
        str2buf(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        str2buf(message)
    );

    // Convert to Base64
    let binary = '';
    const bytes = new Uint8Array(signature);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
