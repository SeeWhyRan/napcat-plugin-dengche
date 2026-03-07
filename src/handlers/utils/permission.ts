import type { OB11Message } from 'napcat-types/napcat-onebot';

/**
 * 检查群聊中是否有管理员权限
 * 私聊消息默认返回 true（本插件主逻辑仅处理群聊，但工具保持通用性）
 */
export function isAdmin(event: OB11Message): boolean {
    if (event.message_type !== 'group') return true;
    const role = (event.sender as Record<string, unknown>)?.role;
    return role === 'admin' || role === 'owner';
}
