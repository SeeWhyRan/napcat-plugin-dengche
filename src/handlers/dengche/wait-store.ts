import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from '../../core/state';
import type { WaitItem, WaitListData } from './wait-utils';
import { WAIT_LIST_FILE, pruneExpired } from './wait-utils';

export function loadWaitListData(): WaitListData {
    return pluginState.loadDataFile<WaitListData>(WAIT_LIST_FILE, { groups: {} });
}

export function saveWaitListData(data: WaitListData): void {
    pluginState.saveDataFile(WAIT_LIST_FILE, data);
}

/**
 * 获取发送者展示名（群名片优先，其次昵称）
 */
export function getSenderNickname(event: OB11Message): string {
    const sender = (event.sender as Record<string, unknown>) || {};
    const card = typeof sender.card === 'string' ? sender.card : '';
    const nickname = typeof sender.nickname === 'string' ? sender.nickname : '';
    return (card || nickname || String(event.user_id || '')).trim();
}

/**
 * 尝试获取指定群成员的展示名；失败返回 null（按“找不到群成员”处理）
 */
export async function tryGetGroupMemberDisplayName(
    ctx: NapCatPluginContext,
    groupId: string,
    userId: string,
): Promise<string | null> {
    try {
        const info = await ctx.actions.call(
            'get_group_member_info',
            { group_id: String(groupId), user_id: String(userId) },
            ctx.adapterName,
            ctx.pluginManager.config,
        ) as { nickname?: string; card?: string };
        const name = (info?.card || info?.nickname || '').trim();
        return name || String(userId);
    } catch {
        return null;
    }
}

/**
 * 针对某个群执行一次超时清理；如有变更会落盘
 */
export function pruneGroupWaitList(groupId: string): { data: WaitListData; list: WaitItem[] } {
    const data = loadWaitListData();
    const list0 = data.groups[groupId] || [];
    const pruned = pruneExpired(list0, pluginState.config.waitTimeoutHours ?? 6);
    if (pruned.removed > 0) {
        data.groups[groupId] = pruned.next;
        saveWaitListData(data);
        return { data, list: pruned.next };
    }
    return { data, list: list0 };
}
