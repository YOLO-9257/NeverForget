interface ApiEnvelope<T = any> {
    code: number;
    message: string;
    data?: T;
}

export function buildInternalUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined | null>
): string {
    const url = new URL(path, 'https://ai-tools.internal');

    if (query) {
        for (const [key, value] of Object.entries(query)) {
            if (value === undefined || value === null || value === '') {
                continue;
            }
            url.searchParams.set(key, String(value));
        }
    }

    return url.toString();
}

export function createJsonRequest(url: string, method: string, body?: unknown): Request {
    return new Request(url, {
        method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
}

export async function unwrapApiResponse<T = any>(response: Response): Promise<T> {
    const raw = await response.text();
    let payload: ApiEnvelope<T> | null = null;

    if (raw) {
        try {
            payload = JSON.parse(raw) as ApiEnvelope<T>;
        } catch {
            if (!response.ok) {
                throw new Error(`请求失败（HTTP ${response.status}）`);
            }
        }
    }

    if (!response.ok) {
        throw new Error(payload?.message || `请求失败（HTTP ${response.status}）`);
    }

    if (payload && payload.code !== 0) {
        throw new Error(payload.message || '请求失败');
    }

    return (payload?.data ?? undefined) as T;
}

export function toPositiveInt(value: unknown, fallback: number, max: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fallback;
    }

    if (value <= 0) {
        return fallback;
    }

    return Math.min(Math.floor(value), max);
}

export function isRecord(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

