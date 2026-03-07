import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from '../../core/state';
import { isAdmin } from '../utils/permission';
import { sendReply } from '../utils/messaging';
import type { ShoutCarKeywordRule } from '../../types';

interface ShoutCarRuntimeData {
    /** groupId -> last @all timestamp(ms) */
    lastAtAllTs: Record<string, number>;
}

const SHOUT_CAR_STATE_FILE = 'shout_car_state.json';

function loadRuntimeData(): ShoutCarRuntimeData {
    return pluginState.loadDataFile<ShoutCarRuntimeData>(SHOUT_CAR_STATE_FILE, { lastAtAllTs: {} });
}

function saveRuntimeData(data: ShoutCarRuntimeData): void {
    pluginState.saveDataFile(SHOUT_CAR_STATE_FILE, data);
}

function normalizeKeyword(s: string): string {
    return s.trim();
}

function normalizeRules(rules: ShoutCarKeywordRule[] | undefined): ShoutCarKeywordRule[] {
    if (!Array.isArray(rules)) return [];
    const out: ShoutCarKeywordRule[] = [];
    const seen = new Set<string>();
    for (const r of rules) {
        if (!r || typeof r !== 'object') continue;
        const keyword = typeof r.keyword === 'string' ? normalizeKeyword(r.keyword) : '';
        if (!keyword) continue;
        if (seen.has(keyword)) continue;
        seen.add(keyword);
        out.push({
            keyword,
            text: typeof r.text === 'string' ? r.text : '',
            atAllWhenAdmin: Boolean(r.atAllWhenAdmin),
            atAllWhenMember: Boolean(r.atAllWhenMember),
        });
    }
    return out;
}

function getShoutCarConfig(groupId: string) {
    const gc = pluginState.config.groupConfigs?.[groupId];
    const sc = gc?.shoutCar;

    // 新版 rules
    const rules = normalizeRules(sc?.rules as ShoutCarKeywordRule[] | undefined);

    return {
        enabled: Boolean(sc?.enabled),
        cooldownSeconds: typeof sc?.cooldownSeconds === 'number' ? sc.cooldownSeconds : 0,
        rules,
    };
}

function buildAtAllMessage(): unknown {
    // napcat-types 可能缺少 at=all 的类型定义，这里用 unknown 断言绕过。
    return [{ type: 'at', data: { qq: 'all' } }];
}

function canSendAtAll(groupId: string, cooldownSeconds: number): { ok: boolean; remainingSeconds: number } {
    if (!Number.isFinite(cooldownSeconds) || cooldownSeconds <= 0) return { ok: true, remainingSeconds: 0 };

    const data = loadRuntimeData();
    const last = data.lastAtAllTs[groupId] || 0;
    const now = Date.now();
    const remainingMs = last + cooldownSeconds * 1000 - now;
    if (remainingMs <= 0) return { ok: true, remainingSeconds: 0 };
    return { ok: false, remainingSeconds: Math.ceil(remainingMs / 1000) };
}

function markAtAllSent(groupId: string): void {
    const data = loadRuntimeData();
    data.lastAtAllTs[groupId] = Date.now();
    saveRuntimeData(data);
}

/**
 * 喊车命令：/喊车关键词
 * - 仅群主/管理员可用
 * - 展示本群当前触发关键词（以及是否启用等关键信息）
 */
export async function handleShoutCarCommand(
    ctx: NapCatPluginContext,
    event: OB11Message,
    args: string[],
): Promise<boolean> {
    if (event.message_type !== 'group' || !event.group_id) return false;

    const cmd = args[0] || '';
    if (cmd !== '喊车关键词') return false;

    if (!isAdmin(event)) {
        await sendReply(ctx, event, '×失败！只有管理员才能执行此操作');
        return true;
    }

    const groupId = String(event.group_id);
    const sc = getShoutCarConfig(groupId);

    const lines: string[] = [];
    lines.push('本群喊车配置：');
    lines.push(`- 是否开启：${sc.enabled ? '是' : '否'}`);
    lines.push(`- 触发冷却：${sc.cooldownSeconds || 0}s`);

    if (!sc.rules || sc.rules.length === 0) {
        lines.push('- 关键词规则：（未设置）');
    } else {
        lines.push(`- 关键词规则（${sc.rules.length} 条）：`);
        sc.rules.forEach((r, idx) => {
            lines.push(`  ${idx + 1}. 关键词：${r.keyword}`);
            lines.push(`     文本：${r.text ? r.text : '（空）'}`);
            lines.push(`     管理员触发@全体：${r.atAllWhenAdmin ? '是' : '否'}`);
            lines.push(`     成员触发@全体：${r.atAllWhenMember ? '是' : '否'}`);
        });
    }

    await sendReply(ctx, event, lines.join('\n'));
    pluginState.incrementProcessed();
    return true;
}

/**
 * 喊车触发：当群消息 raw_message == keyword 时
 * - 先发送 text
 * - 再按身份与冷却决定是否发送 @全体
 */
export async function handleShoutCarTrigger(
    ctx: NapCatPluginContext,
    event: OB11Message,
): Promise<boolean> {
    if (event.message_type !== 'group' || !event.group_id) return false;

    const groupId = String(event.group_id);
    const sc = getShoutCarConfig(groupId);
    if (!sc.enabled) return false;
    if (!sc.rules || sc.rules.length === 0) return false;

    const raw = (event.raw_message || '').trim();
    if (!raw) return false;

    // 触发关键词：完全匹配（任意规则）
    const matched = sc.rules.find((r) => raw === r.keyword);
    if (!matched) return false;

    // 先发文字内容（允许为空；为空则不发）
    if (matched.text) {
        await sendReply(ctx, event, matched.text);
    }

    const admin = isAdmin(event);
    const shouldAtAll = admin ? Boolean(matched.atAllWhenAdmin) : Boolean(matched.atAllWhenMember);
    if (!shouldAtAll) {
        pluginState.incrementProcessed();
        return true;
    }

    const cd = canSendAtAll(groupId, sc.cooldownSeconds);
    if (!cd.ok) {
        // 冷却中：不再发送 @全体
        pluginState.incrementProcessed();
        return true;
    }

    const atAll = buildAtAllMessage() as any;
    await sendReply(ctx, event, atAll);
    markAtAllSent(groupId);

    pluginState.incrementProcessed();
    return true;
}
