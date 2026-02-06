#!/usr/bin/env node
/**
 * 密码管理工具
 * 用于生成创建账号或重置密码的 SQL 语句
 * 
 * 用法:
 *   node scripts/password-tool.js create <username> <password>
 *   node scripts/password-tool.js reset <username> <password>
 * 
 * 示例:
 *   node scripts/password-tool.js create admin 123456
 *   node scripts/password-tool.js reset admin newpassword
 * 
 * @author zhangws
 */

const crypto = require('crypto');

// PBKDF2 参数 (与 src/utils/crypto.ts 保持一致)
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 32;  // 256 bits
const PBKDF2_DIGEST = 'sha256';
const SALT_LENGTH = 16;

/**
 * 使用 PBKDF2 生成密码哈希
 * @param {string} password 原始密码
 * @returns {Promise<{hash: string, salt: string}>}
 */
async function hashPassword(password) {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(SALT_LENGTH);
        crypto.pbkdf2(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST, (err, derivedKey) => {
            if (err) reject(err);
            resolve({
                hash: derivedKey.toString('hex'),
                salt: salt.toString('hex')
            });
        });
    });
}

/**
 * 生成随机 user_key
 * @returns {string}
 */
function generateUserKey() {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

/**
 * 主函数
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length < 3) {
        console.log(`
╔══════════════════════════════════════════════════════════════╗
║               NeverForget 密码管理工具                        ║
╠══════════════════════════════════════════════════════════════╣
║  用法:                                                        ║
║    node scripts/password-tool.js <命令> <用户名> <密码>        ║
║                                                              ║
║  命令:                                                        ║
║    create  - 生成创建新用户的 SQL                              ║
║    reset   - 生成重置密码的 SQL                                ║
║                                                              ║
║  示例:                                                        ║
║    node scripts/password-tool.js create admin 123456         ║
║    node scripts/password-tool.js reset admin newpassword     ║
╚══════════════════════════════════════════════════════════════╝
`);
        process.exit(1);
    }

    const [command, username, password] = args;

    if (!['create', 'reset'].includes(command)) {
        console.error('❌ 无效命令，请使用 create 或 reset');
        process.exit(1);
    }

    if (password.length < 6) {
        console.error('❌ 密码长度不能少于6位');
        process.exit(1);
    }

    console.log('\n🔐 正在生成密码哈希...\n');

    const { hash, salt } = await hashPassword(password);
    const userKey = generateUserKey();
    const now = Date.now();

    console.log('════════════════════════════════════════════════════════════════');
    console.log('📋 生成的加密数据:');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`  用户名:       ${username}`);
    console.log(`  密码:         ${password}`);
    console.log(`  Salt:         ${salt}`);
    console.log(`  Hash:         ${hash}`);
    if (command === 'create') {
        console.log(`  User Key:     ${userKey}`);
    }
    console.log('════════════════════════════════════════════════════════════════\n');

    if (command === 'create') {
        const sql = `INSERT INTO users (username, password_hash, salt, user_key, created_at) VALUES ('${username}', '${hash}', '${salt}', '${userKey}', ${now});`;

        console.log('📝 创建用户 SQL:');
        console.log('────────────────────────────────────────────────────────────────');
        console.log(sql);
        console.log('────────────────────────────────────────────────────────────────\n');

        console.log('🚀 执行命令 (本地开发):');
        console.log(`npx wrangler d1 execute never-forget-db --local --command "${sql}"`);
        console.log('\n🚀 执行命令 (远程生产):');
        console.log(`npx wrangler d1 execute never-forget-db --remote --command "${sql}"`);
    } else {
        const sql = `UPDATE users SET password_hash = '${hash}', salt = '${salt}' WHERE username = '${username}';`;

        console.log('📝 重置密码 SQL:');
        console.log('────────────────────────────────────────────────────────────────');
        console.log(sql);
        console.log('────────────────────────────────────────────────────────────────\n');

        console.log('🚀 执行命令 (本地开发):');
        console.log(`npx wrangler d1 execute never-forget-db --local --command "${sql}"`);
        console.log('\n🚀 执行命令 (远程生产):');
        console.log(`npx wrangler d1 execute never-forget-db --remote --command "${sql}"`);
    }

    console.log('\n✅ 完成！请复制上面的命令到终端执行。\n');
}

main().catch(console.error);
