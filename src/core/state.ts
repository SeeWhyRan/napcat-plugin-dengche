/**
 * 全局状态管理模块（单例模式）
 *
 * 封装插件的配置持久化和运行时状态，提供在项目任意位置访问
 * ctx、config、logger 等对象的能力，无需逐层传递参数。
 *
 * 使用方法：
 *   import { pluginState } from '../core/state';
 *   pluginState.config.enabled;       // 读取配置
 *   pluginState.ctx.logger.info(...); // 使用日志
 */

import fs from 'fs';
import path from 'path';
import type { NapCatPluginContext, PluginLogger } from 'napcat-types/napcat-onebot/network/plugin/types';
import { DEFAULT_CONFIG } from '../config';
import type { PluginConfig, GroupConfig, ShoutCarGroupConfig, ShoutCarKeywordRule, WaitBroadcastGroupConfig } from '../types';

// ==================== 配置清洗工具 ====================

function isObject(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * 配置清洗函数
 * 确保从文件读取的配置符合预期类型，防止运行时错误
 */
function sanitizeConfig(raw: unknown): PluginConfig {
    if (!isObject(raw)) return { ...DEFAULT_CONFIG, groupConfigs: {} };

    const out: PluginConfig = { ...DEFAULT_CONFIG, groupConfigs: {} };

    if (typeof raw.enabled === 'boolean') out.enabled = raw.enabled;
    if (typeof raw.debug === 'boolean') out.debug = raw.debug;
    if (typeof raw.commandPrefix === 'string') out.commandPrefix = raw.commandPrefix;
    if (typeof raw.cooldownSeconds === 'number') out.cooldownSeconds = raw.cooldownSeconds;
    if (typeof raw.waitTimeoutHours === 'number') out.waitTimeoutHours = raw.waitTimeoutHours;

    // 群配置清洗
    if (isObject(raw.groupConfigs)) {
        for (const [groupId, groupConfig] of Object.entries(raw.groupConfigs)) {
            if (isObject(groupConfig)) {
                const cfg: GroupConfig = {};
                if (typeof groupConfig.enabled === 'boolean') cfg.enabled = groupConfig.enabled;

                // 喊车配置清洗
                if (isObject(groupConfig.shoutCar)) {
                    const scRaw = groupConfig.shoutCar as Record<string, unknown>;
                    const sc: ShoutCarGroupConfig = {};
                    if (typeof scRaw.enabled === 'boolean') sc.enabled = scRaw.enabled;
                    if (typeof scRaw.cooldownSeconds === 'number') sc.cooldownSeconds = scRaw.cooldownSeconds;

                    // 新版：rules
                    if (Array.isArray(scRaw.rules)) {
                        const rules: ShoutCarKeywordRule[] = [];
                        for (const item of scRaw.rules) {
                            if (!isObject(item)) continue;
                            const r = item as Record<string, unknown>;
                            const keyword = typeof r.keyword === 'string' ? r.keyword.trim() : '';
                            if (!keyword) continue;
                            const rule: ShoutCarKeywordRule = { keyword };
                            if (typeof r.text === 'string') rule.text = r.text;
                            if (typeof r.atAllWhenAdmin === 'boolean') rule.atAllWhenAdmin = r.atAllWhenAdmin;
                            if (typeof r.atAllWhenMember === 'boolean') rule.atAllWhenMember = r.atAllWhenMember;
                            rules.push(rule);
                        }

                        // 去重（keyword 唯一，保留首次出现）
                        const seen = new Set<string>();
                        sc.rules = rules.filter((r) => {
                            if (seen.has(r.keyword)) return false;
                            seen.add(r.keyword);
                            return true;
                        });
                    }
                    cfg.shoutCar = sc;
                }

                // 等车广播配置清洗
                if (isObject((groupConfig as Record<string, unknown>).waitBroadcast)) {
                    const wbRaw = (groupConfig as Record<string, unknown>).waitBroadcast as Record<string, unknown>;
                    const wb: WaitBroadcastGroupConfig = {};
                    if (typeof wbRaw.enabled === 'boolean') wb.enabled = wbRaw.enabled;
                    if (typeof wbRaw.intervalSeconds === 'number') wb.intervalSeconds = wbRaw.intervalSeconds;
                    cfg.waitBroadcast = wb;
                }

                // TODO: 在这里添加你的群配置项清洗
                out.groupConfigs[groupId] = cfg;
            }
        }
    }

    // TODO: 在这里添加你的配置项清洗逻辑

    return out;
}

// ==================== 插件全局状态类 ====================

class PluginState {
    /** NapCat 插件上下文（init 后可用） */
    private _ctx: NapCatPluginContext | null = null;

    /** 插件配置 */
    config: PluginConfig = { ...DEFAULT_CONFIG };

    /** 插件启动时间戳 */
    startTime: number = 0;

    /** 机器人自身 QQ 号 */
    selfId: string = '';

    /** 活跃的定时器 Map: jobId -> NodeJS.Timeout */
    timers: Map<string, ReturnType<typeof setInterval>> = new Map();

    /** 运行时统计 */
    stats = {
        processed: 0,
        todayProcessed: 0,
        lastUpdateDay: new Date().toDateString(),
    };

    /** 获取上下文（确保已初始化） */
    get ctx(): NapCatPluginContext {
        if (!this._ctx) throw new Error('PluginState 尚未初始化，请先调用 init()');
        return this._ctx;
    }

    /** 获取日志器的快捷方式 */
    get logger(): PluginLogger {
        return this.ctx.logger;
    }

    // ==================== 生命周期 ====================

    /**
     * 初始化（在 plugin_init 中调用）
     */
    init(ctx: NapCatPluginContext): void {
        this._ctx = ctx;
        this.startTime = Date.now();
        this.loadConfig();
        this.ensureDataDir();
        this.fetchSelfId();
    }

    /**
     * 获取机器人自身 QQ 号（异步，init 时自动调用）
     */
    private async fetchSelfId(): Promise<void> {
        try {
            const res = await this.ctx.actions.call(
                'get_login_info', {}, this.ctx.adapterName, this.ctx.pluginManager.config
            ) as { user_id?: number | string };
            if (res?.user_id) {
                this.selfId = String(res.user_id);
                this.logger.debug("(｡·ω·｡) 机器人 QQ: " + this.selfId);
            }
        } catch (e) {
            this.logger.warn("(；′⌒`) 获取机器人 QQ 号失败:", e);
        }
    }

    /**
     * 清理（在 plugin_cleanup 中调用）
     */
    cleanup(): void {
        // 清理所有定时器
        for (const [jobId, timer] of this.timers) {
            clearInterval(timer);
            this.logger.debug(`(｡-ω-) 清理定时器: ${jobId}`);
        }
        this.timers.clear();
        this.saveConfig();
        this._ctx = null;
    }

    // ==================== 数据目录 ====================

    /** 确保数据目录存在 */
    private ensureDataDir(): void {
        const dataPath = this.ctx.dataPath;
        if (!fs.existsSync(dataPath)) {
            fs.mkdirSync(dataPath, { recursive: true });
        }
    }

    /** 获取数据文件完整路径 */
    getDataFilePath(filename: string): string {
        return path.join(this.ctx.dataPath, filename);
    }

    // ==================== 通用数据文件读写 ====================

    /**
     * 读取 JSON 数据文件
     * 常用于订阅数据、定时任务配置、推送历史等持久化数据
     * @param filename 数据文件名（如 'subscriptions.json'）
     * @param defaultValue 文件不存在或解析失败时的默认值
     */
    loadDataFile<T>(filename: string, defaultValue: T): T {
        const filePath = this.getDataFilePath(filename);
        try {
            if (fs.existsSync(filePath)) {
                return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            }
        } catch (e) {
            this.logger.warn("(；′⌒`) 读取数据文件 " + filename + " 失败:", e);
        }
        return defaultValue;
    }

    /**
     * 保存 JSON 数据文件
     * @param filename 数据文件名
     * @param data 要保存的数据
     */
    saveDataFile<T>(filename: string, data: T): void {
        const filePath = this.getDataFilePath(filename);
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        } catch (e) {
            this.logger.error("(╥﹏╥) 保存数据文件 " + filename + " 失败:", e);
        }
    }

    // ==================== 配置管理 ====================

    /**
     * 从磁盘加载配置
     */
    loadConfig(): void {
        const configPath = this.ctx.configPath;
        try {
            if (configPath && fs.existsSync(configPath)) {
                const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                this.config = sanitizeConfig(raw);
                // 加载统计信息
                if (isObject(raw) && isObject(raw.stats)) {
                    Object.assign(this.stats, raw.stats);
                }
                this.ctx.logger.debug('已加载本地配置');
            } else {
                this.config = { ...DEFAULT_CONFIG, groupConfigs: {} };
                this.saveConfig();
                this.ctx.logger.debug('配置文件不存在，已创建默认配置');
            }
        } catch (error) {
            this.ctx.logger.error('加载配置失败，使用默认配置:', error);
            this.config = { ...DEFAULT_CONFIG, groupConfigs: {} };
        }
    }

    /**
     * 保存配置到磁盘
     */
    saveConfig(): void {
        if (!this._ctx) return;
        const configPath = this._ctx.configPath;
        try {
            const configDir = path.dirname(configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            const data = { ...this.config, stats: this.stats };
            fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf-8');
        } catch (error) {
            this._ctx.logger.error('保存配置失败:', error);
        }
    }

    /**
     * 合并更新配置
     */
    updateConfig(partial: Partial<PluginConfig>): void {
        // 统一经过 sanitize，保证类型一致
        this.config = sanitizeConfig({ ...this.config, ...partial });
        this.saveConfig();
    }

    /**
     * 完整替换配置
     */
    replaceConfig(config: PluginConfig): void {
        this.config = sanitizeConfig(config);
        this.saveConfig();
    }

    /**
     * 更新指定群的配置
     */
    updateGroupConfig(groupId: string, config: Partial<GroupConfig>): void {
        this.config.groupConfigs[groupId] = {
            ...this.config.groupConfigs[groupId],
            ...config,
        };

        // 再次 sanitize 去重与修正
        this.config = sanitizeConfig(this.config);
        this.saveConfig();
    }

    /**
     * 检查群是否启用（默认启用，除非明确设置为 false）
     */
    isGroupEnabled(groupId: string): boolean {
        const gid = String(groupId);
        return this.config.groupConfigs?.[gid]?.enabled === true;
    }

    // ==================== 统计 ====================

    /**
     * 增加处理计数
     */
    incrementProcessed(): void {
        const today = new Date().toDateString();
        if (this.stats.lastUpdateDay !== today) {
            this.stats.todayProcessed = 0;
            this.stats.lastUpdateDay = today;
        }
        this.stats.todayProcessed++;
        this.stats.processed++;
    }

    // ==================== 工具方法 ====================

    /** 获取运行时长（毫秒） */
    getUptime(): number {
        return Date.now() - this.startTime;
    }

    /** 获取格式化的运行时长 */
    getUptimeFormatted(): string {
        const ms = this.getUptime();
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const h = Math.floor(m / 60);
        const d = Math.floor(h / 24);

        if (d > 0) return `${d}天${h % 24}小时`;
        if (h > 0) return `${h}小时${m % 60}分钟`;
        if (m > 0) return `${m}分钟${s % 60}秒`;
        return `${s}秒`;
    }
}

/** 导出全局单例 */
export const pluginState = new PluginState();
