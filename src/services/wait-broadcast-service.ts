import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from '../core/state';
import { pruneGroupWaitList } from '../handlers/dengche/wait-store';
import { renderWaitList } from '../handlers/dengche/wait-utils';
import { sendGroupMessage } from '../handlers/utils/messaging';

const TIMER_KEY_PREFIX = 'waitBroadcast:';

function clampIntervalSeconds(v: unknown): number {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) return 0;
    // 最低 30 秒，避免误配刷屏
    if (n > 0 && n < 30) return 30;
    // 最高 24 小时
    if (n > 24 * 60 * 60) return 24 * 60 * 60;
    return Math.floor(n);
}

export function getWaitBroadcastIntervalSeconds(groupId: string): number {
    const cfg = pluginState.config.groupConfigs?.[String(groupId)]?.waitBroadcast;
    const s = clampIntervalSeconds(cfg?.intervalSeconds);
    // 默认 10 分钟（600s）
    return s > 0 ? s : 600;
}

export function isWaitBroadcastEnabled(groupId: string): boolean {
    const cfg = pluginState.config.groupConfigs?.[String(groupId)]?.waitBroadcast;
    return cfg?.enabled === true;
}

export function startOrRestartWaitBroadcast(ctx: NapCatPluginContext, groupId: string): void {
    const groupKey = String(groupId);
    const jobId = `${TIMER_KEY_PREFIX}${groupKey}`;

    // 先停旧的
    const existing = pluginState.timers.get(jobId);
    if (existing) {
        clearInterval(existing);
        pluginState.timers.delete(jobId);
    }

    const intervalSeconds = getWaitBroadcastIntervalSeconds(groupKey);
    const intervalMs = intervalSeconds * 1000;

    // 即使当前未启用，也启动一个守护定时器：方便管理员稍后开启无需重载
    const timer = setInterval(async () => {
        try {
            // 仅在插件与群启用时工作
            if (!pluginState.config.enabled) return;
            if (!pluginState.isGroupEnabled(groupKey)) return;
            if (!isWaitBroadcastEnabled(groupKey)) return;

            const { list } = pruneGroupWaitList(groupKey);
            if (!list || list.length === 0) return;

            const lines: string[] = [];
            lines.push(`【等车列表】`);
            lines.push(renderWaitList(list));
            lines.push('【说明】');
            lines.push('发送“/等车”加入列表');
            lines.push('发送“/跑路”离开列表');
            lines.push('发送“/发车”帮喊列表里的人');

            await sendGroupMessage(ctx, groupKey, lines.join('\n'));
        } catch (e) {
            pluginState.logger.warn('(；′⌒`) 等车广播执行失败:', e);
        }
    }, intervalMs);

    pluginState.timers.set(jobId, timer);
    pluginState.logger.debug(`已启动等车广播定时器: ${groupKey} | 间隔 ${intervalSeconds}s`);
}

export function stopWaitBroadcast(groupId: string): void {
    const groupKey = String(groupId);
    const jobId = `${TIMER_KEY_PREFIX}${groupKey}`;
    const existing = pluginState.timers.get(jobId);
    if (existing) {
        clearInterval(existing);
        pluginState.timers.delete(jobId);
        pluginState.logger.debug(`已停止等车广播定时器: ${groupKey}`);
    }
}

/**
 * 初始化所有群的等车广播定时器
 * 在 plugin_init 时调用一次即可
 */
export function initWaitBroadcastTimers(ctx: NapCatPluginContext): void {
    const groups = pluginState.config.groupConfigs || {};
    for (const groupId of Object.keys(groups)) {
        startOrRestartWaitBroadcast(ctx, groupId);
    }
}
