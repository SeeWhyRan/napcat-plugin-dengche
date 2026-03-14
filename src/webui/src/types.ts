/** WebUI 前端类型定义 */

export interface PluginStatus {
    pluginName: string
    uptime: number
    uptimeFormatted: string
    config: PluginConfig
    stats: {
        processed: number
        todayProcessed: number
        lastUpdateDay: string
    }
}

export interface PluginConfig {
    enabled: boolean
    debug: boolean
    commandPrefix: string
    cooldownSeconds: number
    waitTimeoutHours?: number
    groupConfigs?: Record<string, GroupConfig>
    // TODO: 在这里添加你的插件配置项类型
}

export interface GroupConfig {
    enabled?: boolean
    shoutCar?: {
        enabled?: boolean
        cooldownSeconds?: number

        /** 新版：多关键词规则 */
        rules?: Array<{
            keyword: string
            text?: string
            atAllWhenAdmin?: boolean
            atAllWhenMember?: boolean
        }>
    }

    waitBroadcast?: {
        enabled?: boolean
        intervalSeconds?: number
    }
}

export interface GroupInfo {
    group_id: number
    group_name: string
    member_count: number
    max_member_count: number
    enabled: boolean
    shoutCar?: GroupConfig['shoutCar']
    waitBroadcast?: GroupConfig['waitBroadcast']
    /** 定时推送时间（如 '08:30'），null 表示未设置（模板默认不使用，按需扩展） */
    scheduleTime?: string | null
}

export interface ApiResponse<T = unknown> {
    code: number
    data?: T
    message?: string
}
