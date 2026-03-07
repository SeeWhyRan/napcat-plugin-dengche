/**
 * 类型定义文件
 * 定义插件内部使用的接口和类型
 *
 * 注意：OneBot 相关类型（OB11Message, OB11PostSendMsg 等）
 * 以及插件框架类型（NapCatPluginContext, PluginModule 等）
 * 均来自 napcat-types 包，无需在此重复定义。
 */

// ==================== 插件配置 ====================

/**
 * 插件主配置接口
 * 在此定义你的插件所需的所有配置项
 */
export interface PluginConfig {
    /** 全局开关：是否启用插件功能 */
    enabled: boolean;
    /** 调试模式：启用后输出详细日志 */
    debug: boolean;
    /** 触发命令前缀，默认为 / */
    commandPrefix: string;
    /** 同一命令请求冷却时间（秒），0 表示不限制 */
    cooldownSeconds: number;

    /** 等车列表自动移除超时（小时） */
    waitTimeoutHours: number;
    /** 按群的单独配置 */
    groupConfigs: Record<string, GroupConfig>;
    // TODO: 在这里添加你的插件配置项
}

/**
 * 喊车（@全体组队）群配置
 */
export interface ShoutCarGroupConfig {
    /** 是否启用本群喊车功能 */
    enabled?: boolean;

    /**
     * 触发冷却（秒）：仅用于控制 @全体 的发送频率
     * 说明：同一群的多个关键词共用这一份冷却。
     */
    cooldownSeconds?: number;

    /** 关键词规则列表（推荐使用） */
    rules?: ShoutCarKeywordRule[];
}

/**
 * 喊车关键词规则
 * - 每条规则有自己的 keyword / text / @全体策略
 * - 冷却为群级别（见 ShoutCarGroupConfig.cooldownSeconds）
 */
export interface ShoutCarKeywordRule {
    /** 触发关键词（完全匹配） */
    keyword: string;
    /** 触发后发送的文字内容（可选） */
    text?: string;
    /** 群主/管理员触发时是否 @全体成员 */
    atAllWhenAdmin?: boolean;
    /** 普通成员触发时是否 @全体成员 */
    atAllWhenMember?: boolean;
}

/**
 * 群配置
 */
export interface GroupConfig {
    /** 是否启用此群的功能 */
    enabled?: boolean;
    /** 喊车（@全体组队）配置 */
    shoutCar?: ShoutCarGroupConfig;
    // TODO: 在这里添加群级别的配置项
}

// ==================== API 响应 ====================

/**
 * 统一 API 响应格式
 */
export interface ApiResponse<T = unknown> {
    /** 状态码，0 表示成功，-1 表示失败 */
    code: number;
    /** 错误信息（仅错误时返回） */
    message?: string;
    /** 响应数据（仅成功时返回） */
    data?: T;
}
