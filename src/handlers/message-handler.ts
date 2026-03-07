/**
 * 消息处理器（路由层）
 * 仅负责：基础过滤、前缀解析、参数分割、分发到具体业务 handler
 */

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from '../core/state';
import { handleDengcheCommand } from './dengche/dengche-handler';
import { handleShoutCarCommand, handleShoutCarTrigger } from './shoutcar/shoutcar-handler';

/**
 * 消息处理主函数
 */
export async function handleMessage(ctx: NapCatPluginContext, event: OB11Message): Promise<void> {
    try {
        const rawMessage = event.raw_message || '';
        const messageType = event.message_type;
        const groupId = event.group_id;
        const userId = event.user_id;

        pluginState.ctx.logger.debug(`收到消息: ${rawMessage} | 类型: ${messageType}`);

        // 本需求：所有命令仅在群聊中使用
        if (messageType !== 'group' || !groupId || !userId) return;

        const groupKey = String(groupId);
        const groupEnabled = pluginState.isGroupEnabled(groupKey);

        // 无前缀触发：喊车关键词（完全匹配）
        // 放在前缀判断之前，确保“发送关键词即可触发”生效
        if (groupEnabled) {
            const shoutTriggered = await handleShoutCarTrigger(ctx, event);
            if (shoutTriggered) return;
        }

        // 检查命令前缀
        const prefix = pluginState.config.commandPrefix || '/';
        if (!rawMessage.startsWith(prefix)) return;

        // 解析命令参数
        const content = rawMessage.slice(prefix.length).trim();
        if (!content) return;
        const args = content.split(/\s+/);

        // 分发：喊车命令
        if (groupEnabled) {
            const handledShout = await handleShoutCarCommand(ctx, event, args);
            if (handledShout) return;
        }

        // 分发：等车系统
        const handledDengche = await handleDengcheCommand(ctx, event, rawMessage, args);
        if (handledDengche) return;
    } catch (error) {
        pluginState.logger.error('处理消息时出错:', error);
    }
}
