import type { OB11Message, OB11PostSendMsg } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from '../../core/state';
import { isAdmin } from '../utils/permission';
import { sendReply } from '../utils/messaging';
import { buildAtMessage, parseAtUserId, parseNumericIndex, renderWaitList } from './wait-utils';
import { getSenderNickname, pruneGroupWaitList, saveWaitListData, tryGetGroupMemberDisplayName } from './wait-store';
import { getWaitBroadcastIntervalSeconds, startOrRestartWaitBroadcast } from '../../services/wait-broadcast-service';

/**
 * 处理等车相关命令
 * 返回 true 表示已处理并应停止后续分发
 */
export async function handleDengcheCommand(
    ctx: NapCatPluginContext,
    event: OB11Message,
    rawMessage: string,
    args: string[],
): Promise<boolean> {
    const messageType = event.message_type;
    const groupId = event.group_id;
    const userId = event.user_id;

    if (messageType !== 'group' || !groupId || !userId) return false;

    const cmd = args[0] || '';
    const groupKey = String(groupId);

    // 读取并清理超时（每次命令前）
    const { data } = pruneGroupWaitList(groupKey);

    const groupEnabled = pluginState.isGroupEnabled(groupKey);

    const prefix = pluginState.config.commandPrefix || '/';

    // 关闭情况下除了“等车 开/关/帮助”“等车帮助”“等车广播(管理员)”外其他都不触发
    if (!groupEnabled) {
        if (cmd !== '等车' && cmd !== '等车帮助' && cmd !== '等车广播') return false;
        if (cmd === '等车') {
            const sub = args[1] || '';
            if (sub !== '开' && sub !== '关' && sub !== '帮助') return false;
        }
    }

    const getList = () => (data.groups[groupKey] || []);
    const setList = (next: typeof data.groups[string]) => {
        data.groups[groupKey] = next;
        saveWaitListData(data);
    };

    // ==================== 帮助命令（成员可用） ====================
    if (cmd === '等车帮助' || (cmd === '等车' && (args[1] || '') === '帮助')) {
        const lines: string[] = [];
        lines.push('等车指令帮助：');
        lines.push('（说明：以下命令均需加命令前缀，默认“/”，可在配置中修改）');
        lines.push('');
        lines.push('成员常用：');
        lines.push(`- 加入等车：${prefix}等车`);
        lines.push(`- 退出等车：${prefix}跑路`);
        lines.push(`- 查看列表：${prefix}等车列表`);
        lines.push(`- 发车并清空：${prefix}发车`);
        lines.push('');
        lines.push('管理员：');
        lines.push(`- 开启本群：${prefix}等车 开`);
        lines.push(`- 关闭本群：${prefix}等车 关`);
        lines.push(`- 开启广播：${prefix}等车广播 开`);
        lines.push(`- 关闭广播：${prefix}等车广播 关`);
        lines.push(`- 设置广播间隔（秒）：${prefix}等车广播 间隔 600`);
        lines.push(`- 强制删除：${prefix}等车列表删除 1（序号从 1 开始）`);
        lines.push(`- 强制添加：${prefix}等车列表添加 123456 或 ${prefix}等车列表添加 @某人`);
        lines.push('');
        lines.push(`当前群状态：${groupEnabled ? '已开启' : '已关闭'}`);

        await sendReply(ctx, event, lines.join('\n'));
        pluginState.incrementProcessed();
        return true;
    }

    // ==================== 管理员：等车广播配置 ====================
    if (cmd === '等车广播') {
        if (!isAdmin(event)) {
            await sendReply(ctx, event, '×失败！只有管理员才能执行此操作');
            return true;
        }

        const sub = args[1] || '';
        if (sub === '开' || sub === '关') {
            const enable = sub === '开';
            const prev = pluginState.config.groupConfigs?.[groupKey] || {};
            pluginState.updateGroupConfig(groupKey, {
                ...prev,
                waitBroadcast: {
                    ...(prev as any).waitBroadcast,
                    enabled: enable,
                },
            });

            // 重启定时器
            startOrRestartWaitBroadcast(ctx, groupKey);
            const interval = getWaitBroadcastIntervalSeconds(groupKey);
            await sendReply(ctx, event, enable ? `√已开启等车广播（间隔 ${interval}s）` : '√已关闭等车广播');
            pluginState.incrementProcessed();
            return true;
        }

        if (sub === '间隔') {
            const secRaw = args[2];
            const sec = secRaw ? Number(secRaw) : NaN;
            if (!Number.isFinite(sec) || sec <= 0) {
                await sendReply(ctx, event, '×失败！请提供合法的秒数，例如：/等车广播 间隔 600');
                return true;
            }

            const prev = pluginState.config.groupConfigs?.[groupKey] || {};
            pluginState.updateGroupConfig(groupKey, {
                ...prev,
                waitBroadcast: {
                    ...(prev as any).waitBroadcast,
                    intervalSeconds: sec,
                },
            });

            // 重启定时器（应用新间隔）
            startOrRestartWaitBroadcast(ctx, groupKey);
            const interval = getWaitBroadcastIntervalSeconds(groupKey);
            await sendReply(ctx, event, `√已设置等车广播间隔为 ${interval}s`);
            pluginState.incrementProcessed();
            return true;
        }

        await sendReply(ctx, event, [
            '等车广播命令：',
            `- 开启：${prefix}等车广播 开`,
            `- 关闭：${prefix}等车广播 关`,
            `- 间隔：${prefix}等车广播 间隔 600（单位：秒）`,
        ].join('\n'));
        return true;
    }

    // ==================== 成员命令 ====================
    if (cmd === '等车') {
        const sub = args[1] || '';

        // 管理员子命令：等车 开/关
        if (sub === '开' || sub === '关') {
            if (!isAdmin(event)) {
                await sendReply(ctx, event, '×失败！只有管理员才能执行此操作');
                return true;
            }
            const enable = sub === '开';
            pluginState.updateGroupConfig(groupKey, { enabled: enable });
            await sendReply(ctx, event, enable ? '√已开启群组车功能' : '√已关闭群组车功能');
            pluginState.incrementProcessed();
            return true;
        }

        // 加入等车列表
        const list = getList();
        const uid = String(userId);
        const existingIndex = list.findIndex((it) => it.userId === uid);
        const nickname = getSenderNickname(event);
        const now = Date.now();

        if (existingIndex >= 0) {
            const existing = list[existingIndex];
            list.splice(existingIndex, 1);
            list.push({ ...existing, nickname: nickname || existing.nickname, joinedAt: now });
        } else {
            list.push({ userId: uid, nickname, joinedAt: now });
        }

        setList(list);
        await sendReply(ctx, event, ['√已添加到等车列表', renderWaitList(list)].join('\n'));
        pluginState.incrementProcessed();
        return true;
    }

    if (cmd === '跑路') {
        const list = getList();
        const uid = String(userId);
        const next = list.filter((it) => it.userId !== uid);
        if (next.length !== list.length) {
            setList(next);
        }
        await sendReply(ctx, event, ['√已离开等车列表', renderWaitList(next)].join('\n'));
        pluginState.incrementProcessed();
        return true;
    }

    if (cmd === '等车列表') {
        const list = getList();
        await sendReply(ctx, event, renderWaitList(list));
        pluginState.incrementProcessed();
        return true;
    }

    if (cmd === '发车') {
        const list = getList();
        if (list.length === 0) {
            await sendReply(ctx, event, '等车人数：0人');
            return true;
        }

        const msg: OB11PostSendMsg['message'] = [];
        for (const it of list) {
            (msg as Array<{ type: string; data: Record<string, unknown> }>).push(...(buildAtMessage(it.userId) as any));
            (msg as Array<{ type: string; data: Record<string, unknown> }>).push({ type: 'text', data: { text: ' ' } });
        }
        (msg as Array<{ type: string; data: Record<string, unknown> }>).push({ type: 'text', data: { text: '来不及解释了，快上车！' } });

        setList([]);
        await sendReply(ctx, event, msg);
        pluginState.incrementProcessed();
        return true;
    }

    // ==================== 管理员命令 ====================
    if (cmd === '等车列表删除') {
        if (!isAdmin(event)) {
            await sendReply(ctx, event, '×失败！只有管理员才能执行此操作');
            return true;
        }
        const idx1 = parseNumericIndex(args[1]);
        if (!idx1) {
            await sendReply(ctx, event, '×失败！请提供要删除的序号');
            return true;
        }

        const list = getList();
        const idx0 = idx1 - 1;
        if (idx0 < 0 || idx0 >= list.length) {
            await sendReply(ctx, event, `×失败！序号${idx1} 不存在！`);
            return true;
        }

        const removed = list[idx0];
        list.splice(idx0, 1);
        setList(list);

        const name = removed.nickname || removed.userId;
        await sendReply(ctx, event, [`√已强制${name}跑路`, renderWaitList(list)].join('\n'));
        pluginState.incrementProcessed();
        return true;
    }

    if (cmd === '等车列表添加') {
        if (!isAdmin(event)) {
            await sendReply(ctx, event, '×失败！只有管理员才能执行此操作');
            return true;
        }

        const atUserId = parseAtUserId(rawMessage);
        const qqArg = args[1] && /^\d+$/.test(args[1]) ? args[1] : null;
        const targetUserId = atUserId || qqArg;
        if (!targetUserId) {
            await sendReply(ctx, event, '×失败！原因（如：找不到qq号为xx的成员）');
            return true;
        }

        const displayName = await tryGetGroupMemberDisplayName(ctx, groupKey, String(targetUserId));
        if (!displayName) {
            await sendReply(ctx, event, `×失败！原因（如：找不到qq号为${String(targetUserId)}的成员）`);
            return true;
        }

        const list = getList();
        const exists = list.some((it) => it.userId === String(targetUserId));
        const now = Date.now();
        if (!exists) {
            list.push({ userId: String(targetUserId), nickname: displayName, joinedAt: now });
        } else {
            const i = list.findIndex((it) => it.userId === String(targetUserId));
            if (i >= 0) {
                const it = list[i];
                list.splice(i, 1);
                list.push({ ...it, nickname: displayName || it.nickname, joinedAt: now });
            }
        }

        setList(list);
        await sendReply(ctx, event, [`√已强制${displayName}等车`, renderWaitList(list)].join('\n'));
        pluginState.incrementProcessed();
        return true;
    }

    return false;
}
