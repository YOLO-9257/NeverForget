/**
 * 轻量级 IMAP 客户端
 * @author zhangws
 * 
 * 专为 Cloudflare Workers 环境设计的极简 IMAP 实现
 * 仅支持核心命令：LOGIN, SELECT, SEARCH, FETCH, LOGOUT
 * 
 * 使用 Cloudflare Workers 的 TCP Socket API (connect)
 */

import { connect } from 'cloudflare:sockets';

/**
 * 邮件摘要信息
 */
export interface EmailSummary {
    uid: number;
    subject: string;
    from: string;
    date: string;
    content: string;
    preview: string;
    messageId?: string;
}

/**
 * IMAP 连接配置
 */
export interface ImapConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    tls: boolean;
}

/**
 * IMAP 客户端类
 */
export class ImapClient {
    private config: ImapConfig;
    private socket: any = null;
    private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
    private tagCounter = 0;
    private buffer = '';
    private encoder = new TextEncoder();
    private decoder = new TextDecoder();
    private connected = false;

    constructor(config: ImapConfig) {
        this.config = config;
    }

    /**
     * 生成唯一的命令标签
     */
    private nextTag(): string {
        return `A${String(++this.tagCounter).padStart(4, '0')}`;
    }

    /**
     * 连接到 IMAP 服务器
     */
    async connect(): Promise<void> {
        console.log(`[IMAP] 连接到 ${this.config.host}:${this.config.port} (TLS: ${this.config.tls})`);

        try {
            // 使用 Cloudflare Workers 的 connect API
            this.socket = connect(
                { hostname: this.config.host, port: this.config.port },
                { secureTransport: this.config.tls ? 'on' : 'off', allowHalfOpen: false }
            );

            this.reader = this.socket.readable.getReader();
            this.writer = this.socket.writable.getWriter();
            this.connected = true;

            // 读取服务器问候语
            const greeting = await this.readResponse();
            if (!greeting.includes('OK')) {
                throw new Error(`服务器拒绝连接: ${greeting}`);
            }

            console.log(`[IMAP] 连接成功，服务器问候: ${greeting.substring(0, 100)}...`);
        } catch (error) {
            console.error('[IMAP] 连接失败:', error);
            this.connected = false;
            throw error;
        }
    }

    /**
     * 发送命令并等待响应
     */
    private async sendCommand(command: string): Promise<string> {
        if (!this.writer || !this.connected) {
            throw new Error('未连接到服务器');
        }

        const tag = this.nextTag();
        const fullCommand = `${tag} ${command}\r\n`;

        // 发送命令（日志中隐藏密码）
        const logCommand = command.startsWith('LOGIN')
            ? command.replace(/LOGIN\s+\S+\s+\S+/, 'LOGIN *** ***')
            : command;
        console.log(`[IMAP] 发送: ${tag} ${logCommand}`);

        await this.writer.write(this.encoder.encode(fullCommand));

        // 读取响应直到收到对应标签的结束行
        return await this.readTaggedResponse(tag);
    }

    /**
     * 从 socket 读取数据
     */
    private async readChunk(): Promise<string> {
        if (!this.reader) {
            throw new Error('未连接到服务器');
        }

        const { value, done } = await this.reader.read();
        if (done) {
            throw new Error('连接已关闭');
        }

        return this.decoder.decode(value);
    }

    /**
     * 读取服务器响应（用于初始问候）
     */
    private async readResponse(): Promise<string> {
        const chunk = await this.readChunk();
        this.buffer += chunk;

        // 找到第一个完整行
        const lineEnd = this.buffer.indexOf('\r\n');
        if (lineEnd !== -1) {
            const line = this.buffer.substring(0, lineEnd);
            this.buffer = this.buffer.substring(lineEnd + 2);
            return line;
        }

        return this.buffer;
    }

    /**
     * Escape special characters in string for RegExp
     */
    private escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * 读取带标签的响应
     */
    private async readTaggedResponse(tag: string): Promise<string> {
        let response = '';
        const timeout = 30000; // 30 秒超时 (因为获取完整内容可能较慢)
        const startTime = Date.now();

        while (true) {
            // 检查超时
            if (Date.now() - startTime > timeout) {
                throw new Error('读取响应超时');
            }

            // 检查缓冲区中是否有完整的行
            while (this.buffer.includes('\r\n')) {
                const lineEnd = this.buffer.indexOf('\r\n');
                const line = this.buffer.substring(0, lineEnd);

                // 注意：如果正在读取大的 BODY，可能包含换行，但不是命令结束
                // 这里的简单解析可能会有问题，但在简单 FETCH 场景下通常 OK
                // 严谨的解析需要解析 literal 长度 {123}

                this.buffer = this.buffer.substring(lineEnd + 2);

                response += line + '\r\n';

                // 检查是否是带标签的结束行
                if (line.startsWith(tag)) {
                    console.log(`[IMAP] 响应完成: ${line.substring(0, 80)}...`);
                    return response;
                }
            }

            // 读取更多数据
            const chunk = await this.readChunk();
            this.buffer += chunk;
        }
    }

    /**
     * 登录到 IMAP 服务器
     */
    async login(): Promise<void> {
        const response = await this.sendCommand(`LOGIN "${this.config.user}" "${this.config.password}"`);

        if (!response.includes('OK')) {
            throw new Error(`登录失败: ${response}`);
        }

        console.log('[IMAP] 登录成功');
    }

    /**
     * 选择邮箱（默认 INBOX）
     */
    async selectInbox(): Promise<{ exists: number; recent: number }> {
        const response = await this.sendCommand('SELECT INBOX');

        if (!response.includes('OK')) {
            throw new Error(`选择收件箱失败: ${response}`);
        }

        // 解析邮件数量
        const existsMatch = response.match(/\*\s+(\d+)\s+EXISTS/i);
        const recentMatch = response.match(/\*\s+(\d+)\s+RECENT/i);

        const result = {
            exists: existsMatch ? parseInt(existsMatch[1], 10) : 0,
            recent: recentMatch ? parseInt(recentMatch[1], 10) : 0,
        };

        console.log(`[IMAP] 收件箱: ${result.exists} 封邮件, ${result.recent} 封新邮件`);
        return result;
    }

    /**
     * 搜索未读邮件
     * @param sinceUid 从哪个 UID 开始搜索（可选）
     * @returns 未读邮件的 UID 列表
     */
    async searchUnseen(sinceUid?: number): Promise<number[]> {
        let command = 'UID SEARCH UNSEEN';
        if (sinceUid && sinceUid > 0) {
            command = `UID SEARCH UNSEEN UID ${sinceUid}:*`;
        }

        const response = await this.sendCommand(command);

        if (!response.includes('OK')) {
            throw new Error(`搜索失败: ${response}`);
        }

        // 解析搜索结果
        const searchLine = response.split('\r\n').find(line => line.startsWith('* SEARCH'));
        if (!searchLine) {
            return [];
        }

        const uids = searchLine
            .replace('* SEARCH', '')
            .trim()
            .split(/\s+/)
            .filter(s => s.length > 0)
            .map(s => parseInt(s, 10))
            .filter(n => !isNaN(n));

        console.log(`[IMAP] 找到 ${uids.length} 封未读邮件: ${uids.slice(0, 5).join(', ')}${uids.length > 5 ? '...' : ''}`);
        return uids;
    }



    /**
     * 获取邮件摘要信息
     * @param uids 邮件 UID 列表
     * @param maxCount 最大获取数量
     */
    async fetchSummaries(uids: number[], maxCount: number = 5): Promise<EmailSummary[]> {
        if (uids.length === 0) {
            return [];
        }

        // 限制获取数量
        const targetUids = uids.slice(0, maxCount);
        const uidList = targetUids.join(',');

        // Limit the partial fetch size to avoid large downloads (e.g., 50KB limit for text bodies)
        // However, generic FETCH (BODY.PEEK[...]) doesn't easily support size limits in the command without complex partial syntax for every UID.
        // For simplicity in this lightweight client, we fetch full sections.

        // We fetch headers, BODY[1] (primary) and its MIME headers, and BODY[TEXT] (fallback).
        const headerFields = 'FROM SUBJECT DATE MESSAGE-ID CONTENT-TRANSFER-ENCODING CONTENT-TYPE';
        const response = await this.sendCommand(
            `UID FETCH ${uidList} (UID BODY.PEEK[HEADER.FIELDS (${headerFields})] BODY.PEEK[1] BODY.PEEK[1.MIME] BODY.PEEK[TEXT])`
        );

        if (!response.includes('OK')) {
            throw new Error(`获取邮件失败: ${response}`);
        }

        // 解析响应
        const summaries: EmailSummary[] = [];
        // IMAP FETCH 响应通常以 * N FETCH 开始
        const fetchBlocks = response.split(/\*\s+\d+\s+FETCH/).slice(1);

        for (const block of fetchBlocks) {
            try {
                const summary = this.parseFetchBlock(block);
                if (summary) {
                    summaries.push(summary);
                }
            } catch (e) {
                console.warn('[IMAP] 解析邮件块失败:', e);
            }
        }

        return summaries;
    }

    /**
     * Helper to extract body content for a specific section
     */
    private extractBodyContent(block: string, section: string): string | null {
        // Construct regex for the specific section
        const safeSection = this.escapeRegExp(section);
        // Regex logic:
        // 1. Literal: section \s* {digits} (Expanded to \s* to be permissive)
        // 2. Quoted: section \s* "content"
        const regex = new RegExp(`${safeSection}\\s*(?:\\{(\\d+)\\}\\r\\n|(?:"([^"]*)"))`, 'i');

        const match = block.match(regex);

        if (match) {
            if (match[1]) {
                // Literal format {length}
                const length = parseInt(match[1], 10);
                const matchString = match[0];
                const startIndex = (match.index || 0) + matchString.length;
                return block.substring(startIndex, startIndex + length);
            } else if (match[2]) {
                // Quoted format "content"
                return match[2];
            }
        }

        return null;
    }

    /**
     * 解析 FETCH 响应块
     */
    private parseFetchBlock(block: string): EmailSummary | null {
        // 提取 UID
        const uidMatch = block.match(/UID\s+(\d+)/i);
        if (!uidMatch) {
            return null;
        }
        const uid = parseInt(uidMatch[1], 10);

        // 1. 获取头部信息
        const headerFields = 'FROM SUBJECT DATE MESSAGE-ID CONTENT-TRANSFER-ENCODING CONTENT-TYPE';
        const headerSection = this.extractBodyContent(block, `BODY[HEADER.FIELDS (${headerFields})]`) || '';
        const headers = this.parseHeaders(headerSection);

        let from = headers['from'] || '未知发件人';
        let subject = headers['subject'] || '(无主题)';
        const date = headers['date'] || '';
        const messageId = headers['message-id'];

        // 解码 MIME 编码的头部
        from = this.decodeMimeHeader(from);
        subject = this.decodeMimeHeader(subject);

        // 2. 提取并解码正文内容
        let content = '';

        // 优先尝试 BODY[1] (Multipart Part 1)
        const body1 = this.extractBodyContent(block, 'BODY[1]');
        if (body1) {
            // 获取 BODY[1] 的 MIME 信息
            const mime1 = this.extractBodyContent(block, 'BODY[1.MIME]') || '';
            const headers1 = this.parseHeaders(mime1);

            const encoding = headers1['content-transfer-encoding'] || '7bit';
            const contentType = headers1['content-type'] || 'text/plain';
            const charset = this.parseCharset(contentType);

            content = this.decodeBody(body1, encoding, charset);

            // Heuristic cleanup: If decoding failed or wasn't triggered (e.g. missing QP header),
            // and content still looks like QP, try to fix it.
            if ((encoding === '7bit' || encoding === '8bit') && (content.includes('=3D') || content.includes('=\r\n'))) {
                try {
                    // Try decoding as QP
                    const fixed = this.decodeBody(body1, 'quoted-printable', charset);
                    if (fixed !== content && !fixed.includes('=3D')) {
                        console.log('[IMAP] Auto-detected QP content, fixing...');
                        content = fixed;
                    }
                } catch (e) {
                    // Ignore heuristic failure
                }
            }
        } else {
            // 回退: 尝试 BODY[TEXT] (Simple Message Body)
            const bodyText = this.extractBodyContent(block, 'BODY[TEXT]');
            if (bodyText) {
                // 使用 Top-Level Encoding
                const encoding = headers['content-transfer-encoding'] || '7bit';
                const contentType = headers['content-type'] || 'text/plain';
                const charset = this.parseCharset(contentType);

                content = this.decodeBody(bodyText, encoding, charset);

                // Same heuristic for fallback
                if ((encoding === '7bit' || encoding === '8bit') && (content.includes('=3D') || content.includes('=\r\n'))) {
                    try {
                        const fixed = this.decodeBody(bodyText, 'quoted-printable', charset);
                        if (fixed !== content && !fixed.includes('=3D')) {
                            console.log('[IMAP] Auto-detected QP content (fallback), fixing...');
                            content = fixed;
                        }
                    } catch (e) { /* ignore */ }
                }
            }
        }

        // 如果还是空的，赋值为空字符串
        if (!content) content = '';

        // 生成预览内容 (纯文本，去除 HTML)
        const preview = this.stripHtmlTags(content).substring(0, 200);

        return {
            uid,
            from,
            subject,
            date,
            content,
            preview,
            messageId
        };
    }

    /**
     * Parse headers from a header block (Robust implementation)
     */
    private parseHeaders(headerText: string): Record<string, string> {
        const headers: Record<string, string> = {};
        if (!headerText) return headers;

        // Normalize newlines to \n for easier processing
        const cleanText = headerText.replace(/\r\n/g, '\n');
        const lines = cleanText.split('\n');

        let currentKey = '';

        for (const line of lines) {
            // Check for continuation line (starts with whitespace)
            if (currentKey && /^\s/.test(line)) {
                headers[currentKey] += ' ' + line.trim();
                continue;
            }

            // Check for new header "Key: Value"
            const match = line.match(/^([\w-]+):\s*(.*)$/i);
            if (match) {
                currentKey = match[1].toLowerCase();
                headers[currentKey] = match[2].trim();
            } else if (!line.trim()) {
                // Empty line usually means end of headers, but we iterate all just in case
                currentKey = '';
            }
        }

        return headers;
    }

    /**
     * Parse charset from Content-Type
     */
    private parseCharset(contentType: string): string {
        const match = contentType.match(/charset=["']?([\w-]+)["']?/i);
        return match ? match[1] : 'utf-8';
    }

    /**
     * Decode body content based on encoding and charset
     */
    private decodeBody(content: string, encoding: string, charset: string): string {
        try {
            encoding = encoding.toLowerCase().trim();
            let buffer: Uint8Array;

            if (encoding === 'base64') {
                // Base64 ignore whitespace
                const clean = content.replace(/\s/g, '');
                const binary = atob(clean);
                buffer = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
            } else if (encoding === 'quoted-printable') {
                // QP Decoding
                // 1. Remove soft breaks (=\r\n)
                let decodedStr = content.replace(/=\r?\n/g, '');
                // 2. Decode =XX
                decodedStr = decodedStr.replace(/=([0-9A-Fa-f]{2})/g, (m, hex) =>
                    String.fromCharCode(parseInt(hex, 16))
                );
                // Convert binary string to bytes
                buffer = new Uint8Array(decodedStr.length);
                for (let i = 0; i < decodedStr.length; i++) buffer[i] = decodedStr.charCodeAt(i);
            } else {
                // 7bit/8bit/binary -> Treat as raw bytes
                buffer = new Uint8Array(content.length);
                for (let i = 0; i < content.length; i++) buffer[i] = content.charCodeAt(i);
            }

            // Decode Charset
            const normalizedCharset = charset.toLowerCase().trim();
            if (normalizedCharset === 'utf8') {
                return new TextDecoder('utf-8').decode(buffer);
            } else {
                try {
                    return new TextDecoder(charset).decode(buffer);
                } catch {
                    // Fallback to utf-8 if charset not supported
                    return new TextDecoder('utf-8').decode(buffer);
                }
            }
        } catch (e) {
            console.warn('[IMAP] Body decode failed:', e);
            return content;
        }
    }

    /**
     * 简单移除正文中的 HTML 标签
     */
    private stripHtmlTags(text: string): string {
        return text
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/[\r\n]+/g, ' ')
            .trim();
    }

    /**
     * 解码 MIME 编码的邮件头部
     * 支持 =?charset?encoding?text?= 格式
     */
    private decodeMimeHeader(text: string): string {
        if (!text.includes('=?')) {
            return text;
        }

        // 匹配 MIME 编码的模式
        const mimePattern = /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g;

        return text.replace(mimePattern, (match, charset, encoding, encodedText) => {
            try {
                if (encoding.toUpperCase() === 'B') {
                    // Base64 编码
                    const decoded = atob(encodedText);
                    return this.decodeCharset(decoded, charset);
                } else if (encoding.toUpperCase() === 'Q') {
                    // Quoted-Printable 编码
                    const decoded = encodedText
                        .replace(/_/g, ' ')
                        .replace(/=([0-9A-Fa-f]{2})/g, (m: string, hex: string) =>
                            String.fromCharCode(parseInt(hex, 16))
                        );
                    return this.decodeCharset(decoded, charset);
                }
            } catch (e) {
                console.warn('[IMAP] MIME 解码失败:', e);
            }
            return match;
        });
    }

    /**
     * 根据字符集解码字符串
     */
    private decodeCharset(text: string, charset: string): string {
        try {
            // 对于 UTF-8，直接使用 TextDecoder
            const normalizedCharset = charset.toLowerCase().replace('-', '');
            if (normalizedCharset === 'utf8') {
                // 将字符串转为字节数组再解码
                const bytes = new Uint8Array(text.split('').map(c => c.charCodeAt(0)));
                return new TextDecoder('utf-8').decode(bytes);
            }
            // 对于其他字符集，尝试使用 TextDecoder
            const bytes = new Uint8Array(text.split('').map(c => c.charCodeAt(0)));
            return new TextDecoder(charset).decode(bytes);
        } catch (e) {
            // 如果解码失败，返回原始文本
            return text;
        }
    }

    /**
     * 登出并关闭连接
     */
    async logout(): Promise<void> {
        try {
            if (this.connected) {
                await this.sendCommand('LOGOUT');
            }
        } catch (e) {
            console.warn('[IMAP] 登出时发生错误:', e);
        } finally {
            await this.close();
        }
    }

    /**
     * 关闭连接
     */
    async close(): Promise<void> {
        this.connected = false;

        try {
            if (this.reader) {
                await this.reader.cancel();
                this.reader = null;
            }
            if (this.writer) {
                await this.writer.close();
                this.writer = null;
            }
            if (this.socket) {
                await this.socket.close();
                this.socket = null;
            }
        } catch (e) {
            console.warn('[IMAP] 关闭连接时发生错误:', e);
        }

        console.log('[IMAP] 连接已关闭');
    }

    /**
     * 检查连接是否存活
     */
    isConnected(): boolean {
        return this.connected;
    }
}

/**
 * 便捷函数：拉取新邮件
 * @param config IMAP 配置
 * @param sinceUid 从哪个 UID 开始（可选）
 * @param maxCount 最大邮件数量
 */
export async function fetchNewEmails(
    config: ImapConfig,
    sinceUid?: number,
    maxCount: number = 5
): Promise<{ emails: EmailSummary[]; maxUid: number; error?: string }> {
    const client = new ImapClient(config);

    try {
        // 连接并登录
        await client.connect();
        await client.login();

        // 选择收件箱
        await client.selectInbox();

        // 搜索未读邮件
        const uids = await client.searchUnseen(sinceUid);

        if (uids.length === 0) {
            return { emails: [], maxUid: sinceUid || 0 };
        }

        // 获取邮件摘要
        const emails = await client.fetchSummaries(uids, maxCount);

        // 计算最大 UID（用于下次同步）
        const maxUid = Math.max(...uids, sinceUid || 0);

        return { emails, maxUid };
    } catch (error) {
        console.error('[IMAP] 拉取邮件失败:', error);
        return {
            emails: [],
            maxUid: sinceUid || 0,
            error: error instanceof Error ? error.message : '未知错误',
        };
    } finally {
        await client.logout();
    }
}
