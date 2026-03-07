import type { OB11PostSendMsg } from 'napcat-types/napcat-onebot';

export interface WaitItem {
    userId: string;
    nickname: string;
    joinedAt: number; // ms
}

export interface WaitListData {
    /** groupId -> list */
    groups: Record<string, WaitItem[]>;
}

export const WAIT_LIST_FILE = 'wait_list.json';

export function formatDateTime(tsMs: number): string {
    const d = new Date(tsMs);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}-${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function pruneExpired(list: WaitItem[], timeoutHours: number): { next: WaitItem[]; removed: number } {
    const hours = Number.isFinite(timeoutHours) && timeoutHours > 0 ? timeoutHours : 6;
    const expireMs = hours * 60 * 60 * 1000;
    const now = Date.now();
    const next = list.filter((it) => now - it.joinedAt <= expireMs);
    return { next, removed: list.length - next.length };
}

export function renderWaitList(list: WaitItem[]): string {
    const lines: string[] = [];
    lines.push(`等车人数：${list.length}人`);
    list.forEach((it, idx) => {
        lines.push(`${idx + 1}. ${it.nickname}：${it.userId}（${formatDateTime(it.joinedAt)}）`);
    });
    return lines.join('\n');
}

export function parseAtUserId(rawMessage: string): string | null {
    // OneBot CQ 码: [CQ:at,qq=123]
    const m = rawMessage.match(/\[CQ:at,qq=(\d+)\]/);
    return m?.[1] || null;
}

export function parseNumericIndex(s: string | undefined): number | null {
    if (!s) return null;
    const n = Number(s);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
}

export function buildAtMessage(userId: string): OB11PostSendMsg['message'] {
    // napcat-types 某些版本的消息段类型联合中未包含 'at'，但 OneBot11 实际支持。
    // 这里使用类型断言，避免因依赖类型缺失导致的编译报错。
    return [{ type: 'at', data: { qq: String(userId) } }] as unknown as OB11PostSendMsg['message'];
}
