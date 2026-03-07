import { IconTerminal, IconInfo } from '../components/icons'

interface HelpPageProps {
    commandPrefix?: string
}

function Code({ children }: { children: string }) {
    return (
        <code className="px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-white/[0.06] border border-gray-200 dark:border-gray-800 text-[12px] font-mono text-gray-800 dark:text-gray-200">
            {children}
        </code>
    )
}

export default function HelpPage({ commandPrefix }: HelpPageProps) {
    const prefix = commandPrefix || '等车'

    return (
        <div className="space-y-6">
            <div className="card p-5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
                    <IconInfo size={16} className="text-gray-400" />
                    快速开始
                </h3>
                <div className="text-sm text-gray-700 dark:text-gray-300 leading-7">
                    <p>
                        本插件用于维护群聊“等车列表”，支持成员自助等车/跑路/发车，以及管理员强制维护。
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        提示：不同群可在“群与功能”页单独启用/禁用。
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="card p-5">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                        <IconTerminal size={16} className="text-gray-400" />
                        常用指令
                    </h3>
                    <div className="space-y-3">
                        <Item title="加入等车" desc={<span>发送 <Code>{prefix + ' 等车'}</Code> 加入列表。</span>} />
                        <Item title="退出等车" desc={<span>发送 <Code>{prefix + ' 跑路'}</Code> 从列表移除自己。</span>} />
                        <Item title="发车" desc={<span>发送 <Code>{prefix + ' 发车'}</Code> 清空当前列表并播报。</span>} />
                        <Item title="查看列表" desc={<span>发送 <Code>{prefix + ' 等车列表'}</Code> 查看当前等车人员。</span>} />
                    </div>
                </div>

                <div className="card p-5">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                        <IconTerminal size={16} className="text-gray-400" />
                        管理员操作
                    </h3>
                    <div className="space-y-3">
                        <Item title="强制增删" desc="管理员可通过插件内置命令对列表进行强制增删（以插件实际实现为准）。" />
                        <Item title="群开关" desc="群维度开关建议在“群与功能”里统一维护，避免误操作。" />
                        <Item title="喊车" desc="可为每个群配置关键词触发与是否 @全体，适合固定车队群。" />
                    </div>
                </div>
            </div>

            <div className="card p-5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                    <IconInfo size={16} className="text-gray-400" />
                    常见问题
                </h3>
                <div className="space-y-3">
                    <Faq q="指令没反应？" a="先检查“设置-启用插件”是否开启；再检查对应群是否启用；最后确认命令前缀是否与你输入一致。" />
                    <Faq q="群太多不好管理？" a="在“群与功能”页使用搜索与批量启用/禁用。建议先用白名单模式再逐步放开。" />
                    <Faq q="喊车 @全体 太频繁？" a="为该群设置触发冷却时间，并只允许管理员触发 @全体。" />
                </div>
            </div>
        </div>
    )
}

function Item({ title, desc }: { title: string; desc: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-4">
            <div>
                <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{title}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{desc}</div>
            </div>
        </div>
    )
}

function Faq({ q, a }: { q: string; a: string }) {
    return (
        <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-white/[0.03] px-4 py-3">
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{q}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-6">{a}</div>
        </div>
    )
}
