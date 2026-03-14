import { useMemo, useState, useEffect, useCallback } from 'react'
import { noAuthFetch } from '../utils/api'
import { showToast } from '../hooks/useToast'
import type { GroupInfo } from '../types'
import { IconSearch, IconCheck, IconX, IconRefresh } from '../components/icons'

type RuleDraft = {
    keyword: string
    text: string
    atAllWhenAdmin: boolean
    atAllWhenMember: boolean
}

type ShoutCarDraft = {
    enabled: boolean
    cooldownSeconds: number
    rules: RuleDraft[]
}

type WaitBroadcastDraft = {
    enabled: boolean
    intervalSeconds: number
}

function normalizeRuleKeyword(s: string): string {
    return (s || '').trim()
}

function getRulesFromGroup(group: GroupInfo | undefined): RuleDraft[] {
    const sc = group?.shoutCar
    const rules = sc?.rules
    if (Array.isArray(rules) && rules.length > 0) {
        const out: RuleDraft[] = []
        const seen = new Set<string>()
        for (const r of rules) {
            const keyword = normalizeRuleKeyword((r as any)?.keyword)
            if (!keyword) continue
            if (seen.has(keyword)) continue
            seen.add(keyword)
            out.push({
                keyword,
                text: typeof (r as any)?.text === 'string' ? String((r as any).text) : '',
                atAllWhenAdmin: Boolean((r as any)?.atAllWhenAdmin),
                atAllWhenMember: Boolean((r as any)?.atAllWhenMember),
            })
        }
        return out
    }
    return []
}

function getRuleCount(group: GroupInfo): number {
    const fromRules = Array.isArray(group.shoutCar?.rules) ? group.shoutCar?.rules?.filter((r: any) => normalizeRuleKeyword(r?.keyword)).length : 0
    if (fromRules && fromRules > 0) return fromRules
    return 0
}

export default function GroupsPage() {
    const [groups, setGroups] = useState<GroupInfo[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')

    const [selectAll, setSelectAll] = useState(false)
    const [selected, setSelected] = useState<Set<number>>(new Set())

    const [editingGroupId, setEditingGroupId] = useState<number | null>(null)
    const [editorOpenMobile, setEditorOpenMobile] = useState(false)
    const [saving, setSaving] = useState(false)

    const [groupEnabledDraft, setGroupEnabledDraft] = useState(false)
    const [shoutCarDraft, setShoutCarDraft] = useState<ShoutCarDraft>({
        enabled: false,
        cooldownSeconds: 0,
        rules: [],
    })

    const [waitBroadcastDraft, setWaitBroadcastDraft] = useState<WaitBroadcastDraft>({
        enabled: false,
        intervalSeconds: 600,
    })

    const fetchGroups = useCallback(async () => {
        setLoading(true)
        try {
            const res = await noAuthFetch<GroupInfo[]>('/groups')
            if (res.code === 0 && res.data) {
                setGroups(res.data)
            }
        } catch {
            showToast('获取群列表失败', 'error')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchGroups() }, [fetchGroups])

    const filtered = useMemo(() => {
        return groups
            .filter(g => {
                if (!search) return true
                const q = search.toLowerCase()
                return g.group_name?.toLowerCase().includes(q) || String(g.group_id).includes(q)
            })
            .sort((a, b) => {
                // 已启用优先 + 名称
                const ae = a.enabled ? 0 : 1
                const be = b.enabled ? 0 : 1
                if (ae !== be) return ae - be
                return (a.group_name || '').localeCompare(b.group_name || '')
            })
    }, [groups, search])

    const enabledCount = useMemo(() => groups.filter(g => g.enabled).length, [groups])

    const toggleSelect = (groupId: number) => {
        setSelected(prev => {
            const next = new Set(prev)
            if (next.has(groupId)) next.delete(groupId)
            else next.add(groupId)
            return next
        })
    }

    const toggleSelectAll = () => {
        if (selectAll) {
            setSelected(new Set())
        } else {
            setSelected(new Set(filtered.map(g => g.group_id)))
        }
        setSelectAll(!selectAll)
    }

    const bulkToggle = async (enabled: boolean) => {
        if (selected.size === 0) {
            showToast('请先选择群', 'warning')
            return
        }
        try {
            await noAuthFetch('/groups/bulk-config', {
                method: 'POST',
                body: JSON.stringify({ enabled, groupIds: Array.from(selected) }),
            })
            setGroups(prev => prev.map(g =>
                selected.has(g.group_id) ? { ...g, enabled } : g
            ))
            showToast(`已批量${enabled ? '启用' : '禁用'} ${selected.size} 个群`, 'success')
            setSelected(new Set())
            setSelectAll(false)
        } catch {
            showToast('批量操作失败', 'error')
        }
    }

    const openEditor = (groupId: number, mode: 'desktop' | 'mobile') => {
        const g = groups.find(x => x.group_id === groupId)
        setEditingGroupId(groupId)
        setGroupEnabledDraft(Boolean(g?.enabled))

        setShoutCarDraft({
            enabled: Boolean(g?.shoutCar?.enabled),
            cooldownSeconds: Number(g?.shoutCar?.cooldownSeconds) || 0,
            rules: getRulesFromGroup(g),
        })

        setWaitBroadcastDraft({
            enabled: Boolean((g as any)?.waitBroadcast?.enabled),
            intervalSeconds: Number((g as any)?.waitBroadcast?.intervalSeconds) || 600,
        })

        const shouldOpenDrawer = mode === 'mobile' || (typeof window !== 'undefined' && window.innerWidth < 1024)
        if (shouldOpenDrawer) setEditorOpenMobile(true)
    }

    const closeEditor = () => {
        setEditingGroupId(null)
        setEditorOpenMobile(false)
    }

    const saveEditor = async () => {
        if (editingGroupId === null) return
        if (saving) return

        const cleanedRules = shoutCarDraft.rules
            .map(r => ({
                keyword: normalizeRuleKeyword(r.keyword),
                text: (r.text || '').trim(),
                atAllWhenAdmin: Boolean(r.atAllWhenAdmin),
                atAllWhenMember: Boolean(r.atAllWhenMember),
            }))
            .filter(r => r.keyword)

        // keyword 去重：保留第一个
        const seen = new Set<string>()
        const uniqRules = cleanedRules.filter(r => {
            if (seen.has(r.keyword)) return false
            seen.add(r.keyword)
            return true
        })

        const payload = {
            enabled: groupEnabledDraft,
            shoutCar: {
                enabled: Boolean(shoutCarDraft.enabled),
                cooldownSeconds: Number(shoutCarDraft.cooldownSeconds) || 0,
                rules: uniqRules,
            },
            waitBroadcast: {
                enabled: Boolean(waitBroadcastDraft.enabled),
                intervalSeconds: Number(waitBroadcastDraft.intervalSeconds) || 0,
            },
        }

        setSaving(true)
        try {
            await noAuthFetch(`/groups/${editingGroupId}/config`, {
                method: 'POST',
                body: JSON.stringify(payload),
            })

            setGroups(prev => prev.map(g => {
                if (g.group_id !== editingGroupId) return g
                return {
                    ...g,
                    enabled: groupEnabledDraft,
                    shoutCar: {
                        ...(g.shoutCar || {}),
                        ...payload.shoutCar,
                    },
                    waitBroadcast: {
                        ...((g as any).waitBroadcast || {}),
                        ...(payload as any).waitBroadcast,
                    },
                }
            }))

            showToast('配置已保存', 'success')
            setEditorOpenMobile(false)
        } catch {
            showToast('保存失败', 'error')
        } finally {
            setSaving(false)
        }
    }

    const addRule = () => {
        setShoutCarDraft(d => ({
            ...d,
            rules: [
                ...(d.rules || []),
                { keyword: '', text: '', atAllWhenAdmin: false, atAllWhenMember: false },
            ],
        }))
    }

    const removeRule = (idx: number) => {
        setShoutCarDraft(d => ({
            ...d,
            rules: (d.rules || []).filter((_, i) => i !== idx),
        }))
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64 empty-state">
                <div className="flex flex-col items-center gap-3">
                    <div className="loading-spinner text-primary" />
                    <div className="text-gray-400 text-sm">加载群列表中...</div>
                </div>
            </div>
        )
    }

    const editingGroup = editingGroupId !== null ? groups.find(g => g.group_id === editingGroupId) : undefined

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 page-enter">
            {/* 左侧：群列表 */}
            <div className="lg:col-span-2 space-y-4">
                {/* 顶部工具栏 */}
                <div className="card p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="relative flex-1">
                            <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                className="input-field pl-9"
                                placeholder="搜索群名称或群号..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <button className="btn btn-ghost text-xs" onClick={fetchGroups}>
                                <IconRefresh size={13} />
                                刷新
                            </button>
                            {selected.size > 0 && (
                                <>
                                    <button className="btn btn-primary text-xs" onClick={() => bulkToggle(true)}>
                                        <IconCheck size={13} />
                                        批量启用 ({selected.size})
                                    </button>
                                    <button className="btn btn-danger text-xs" onClick={() => bulkToggle(false)}>
                                        <IconX size={13} />
                                        批量禁用 ({selected.size})
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="text-xs text-gray-400">
                            共 {groups.length} 个群，{enabledCount} 个已启用{search ? `，搜索到 ${filtered.length} 个` : ''}
                        </div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 select-none">
                            <input
                                type="checkbox"
                                checked={selectAll}
                                onChange={toggleSelectAll}
                                className="rounded border-gray-300 dark:border-gray-600"
                            />
                            全选（当前筛选）
                        </label>
                    </div>
                </div>

                {/* 群卡片列表 */}
                <div className="card p-2">
                    {filtered.length === 0 ? (
                        <div className="py-12 text-center empty-state">
                            <p className="text-gray-400 text-sm">{search ? '没有匹配的群' : '暂无群数据'}</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
                            {filtered.map((g) => {
                                const isActive = editingGroupId === g.group_id
                                const ruleCount = getRuleCount(g)
                                const shoutEnabled = Boolean(g.shoutCar?.enabled)
                                const cd = Number(g.shoutCar?.cooldownSeconds) || 0
                                return (
                                    <div
                                        key={g.group_id}
                                        className={
                                            `px-3 py-3 rounded-lg transition-colors ` +
                                            (isActive
                                                ? 'bg-brand-50 dark:bg-white/[0.03]'
                                                : 'hover:bg-gray-50/60 dark:hover:bg-white/[0.02]'
                                            )
                                        }
                                    >
                                        <div className="flex items-start gap-3">
                                            <input
                                                type="checkbox"
                                                checked={selected.has(g.group_id)}
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={() => toggleSelect(g.group_id)}
                                                className="mt-1 rounded border-gray-300 dark:border-gray-600"
                                            />

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div
                                                        className="min-w-0 flex-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-200 dark:focus:ring-white/10 rounded-md"
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => openEditor(g.group_id, 'desktop')}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') openEditor(g.group_id, 'desktop')
                                                        }}
                                                    >
                                                        <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                                            {g.group_name || '未知群'}
                                                        </div>
                                                        <div className="mt-1 text-[11px] text-gray-400 flex flex-wrap gap-x-3 gap-y-1">
                                                            <span className="font-mono">{g.group_id}</span>
                                                            <span>{g.member_count}/{g.max_member_count}</span>
                                                            <span>
                                                                喊车：{shoutEnabled ? '开' : '关'}
                                                                {ruleCount > 0 ? `（${ruleCount} 关键词）` : ''}
                                                                {cd > 0 ? ` | 冷却 ${cd}s` : ''}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                                        <button
                                                            type="button"
                                                            className={`btn text-xs !px-3 !py-1.5 ${shoutEnabled ? 'btn-primary' : 'btn-ghost'}`}
                                                            onClick={() => openEditor(g.group_id, 'desktop')}
                                                        >
                                                            配置
                                                        </button>
                                                        <label className="toggle">
                                                            <input
                                                                type="checkbox"
                                                                checked={g.enabled}
                                                                onChange={async () => {
                                                                    try {
                                                                        await noAuthFetch(`/groups/${g.group_id}/config`, {
                                                                            method: 'POST',
                                                                            body: JSON.stringify({ enabled: !g.enabled }),
                                                                        })
                                                                        setGroups(prev => prev.map(x => x.group_id === g.group_id ? { ...x, enabled: !g.enabled } : x))
                                                                    } catch {
                                                                        showToast('操作失败', 'error')
                                                                    }
                                                                }}
                                                            />
                                                            <div className="slider" />
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* 右侧：详情编辑（桌面） */}
            <div className="hidden lg:block lg:col-span-1">
                <div className="card p-4 sticky top-24">
                    {editingGroupId === null || !editingGroup ? (
                        <div className="space-y-2">
                            <div className="text-sm font-semibold text-gray-900 dark:text-white">选择一个群</div>
                            <div className="text-xs text-gray-400">
                                在左侧点击群条目进入配置。喊车支持多关键词，且同一群内 @全体 冷却共用。
                            </div>
                        </div>
                    ) : (
                        <GroupEditor
                            group={editingGroup}
                            groupEnabledDraft={groupEnabledDraft}
                            setGroupEnabledDraft={setGroupEnabledDraft}
                            shoutCarDraft={shoutCarDraft}
                            setShoutCarDraft={setShoutCarDraft}
                            waitBroadcastDraft={waitBroadcastDraft}
                            setWaitBroadcastDraft={setWaitBroadcastDraft}
                            addRule={addRule}
                            removeRule={removeRule}
                            saving={saving}
                            onClose={closeEditor}
                            onSave={saveEditor}
                        />
                    )}
                </div>
            </div>

            {/* 移动端：抽屉编辑 */}
            {editorOpenMobile && editingGroupId !== null && editingGroup && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setEditorOpenMobile(false)} />
                    <div className="absolute inset-y-0 right-0 w-full max-w-md bg-white dark:bg-[#18191C] border-l border-gray-200 dark:border-gray-800">
                        <div className="h-full flex flex-col">
                            <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">群 {editingGroupId} 配置</div>
                                    <div className="text-xs text-gray-400 mt-0.5 truncate">发送关键词触发；命令“/喊车关键词”可查看（仅管理员）</div>
                                </div>
                                <button className="btn btn-ghost text-xs" onClick={() => setEditorOpenMobile(false)}>关闭</button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 pb-24">
                                <GroupEditor
                                    group={editingGroup}
                                    groupEnabledDraft={groupEnabledDraft}
                                    setGroupEnabledDraft={setGroupEnabledDraft}
                                    shoutCarDraft={shoutCarDraft}
                                    setShoutCarDraft={setShoutCarDraft}
                                    waitBroadcastDraft={waitBroadcastDraft}
                                    setWaitBroadcastDraft={setWaitBroadcastDraft}
                                    addRule={addRule}
                                    removeRule={removeRule}
                                    saving={saving}
                                    onClose={() => setEditorOpenMobile(false)}
                                    onSave={saveEditor}
                                    compact
                                />
                            </div>

                            <div className="absolute bottom-0 right-0 w-full max-w-md px-4 py-3 bg-white/95 dark:bg-[#18191C]/95 border-t border-gray-200 dark:border-gray-800 backdrop-blur-sm">
                                <div className="flex items-center justify-end gap-2">
                                    <button className="btn btn-ghost text-xs" onClick={() => setEditorOpenMobile(false)}>取消</button>
                                    <button className="btn btn-primary text-xs" onClick={saveEditor} disabled={saving}>
                                        {saving ? '保存中...' : '保存'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function GroupEditor({
    group,
    groupEnabledDraft,
    setGroupEnabledDraft,
    shoutCarDraft,
    setShoutCarDraft,
    waitBroadcastDraft,
    setWaitBroadcastDraft,
    addRule,
    removeRule,
    saving,
    onClose,
    onSave,
    compact = false,
}: {
    group: GroupInfo
    groupEnabledDraft: boolean
    setGroupEnabledDraft: (v: boolean) => void
    shoutCarDraft: ShoutCarDraft
    setShoutCarDraft: React.Dispatch<React.SetStateAction<ShoutCarDraft>>
    waitBroadcastDraft: WaitBroadcastDraft
    setWaitBroadcastDraft: React.Dispatch<React.SetStateAction<WaitBroadcastDraft>>
    addRule: () => void
    removeRule: (idx: number) => void
    saving: boolean
    onClose: () => void
    onSave: () => void
    compact?: boolean
}) {
    const title = group.group_name || '未知群'

    return (
        <div className="space-y-4">
            <div className="space-y-1">
                <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">{title}</div>
                <div className="text-xs text-gray-400 flex flex-wrap gap-x-3 gap-y-1">
                    <span className="font-mono">{group.group_id}</span>
                    <span>{group.member_count}/{group.max_member_count}</span>
                </div>
            </div>

            {/* 群启用 */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-200">启用本群功能</div>
                    <div className="text-xs text-gray-400 mt-0.5">关闭后，本插件在该群不响应（含喊车与等车）</div>
                </div>
                <label className="toggle">
                    <input
                        type="checkbox"
                        checked={Boolean(groupEnabledDraft)}
                        onChange={(e) => setGroupEnabledDraft(e.target.checked)}
                    />
                    <div className="slider" />
                </label>
            </div>

            <div className="border-t border-gray-100 dark:border-gray-800 pt-4" />

            {/* 等车列表广播 */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-200">启用等车列表广播</div>
                        <div className="text-xs text-gray-400 mt-0.5">当本群等车列表有人时，按间隔在群里广播</div>
                    </div>
                    <label className="toggle">
                        <input
                            type="checkbox"
                            checked={Boolean(waitBroadcastDraft.enabled)}
                            onChange={(e) => setWaitBroadcastDraft(d => ({ ...d, enabled: e.target.checked }))}
                        />
                        <div className="slider" />
                    </label>
                </div>

                <div>
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">广播间隔（秒）</div>
                    <div className="text-xs text-gray-400 mb-2">建议 600；最小 30；0 表示不广播</div>
                    <input
                        className="input-field"
                        type="number"
                        value={String(waitBroadcastDraft.intervalSeconds ?? 600)}
                        onChange={(e) => setWaitBroadcastDraft(d => ({ ...d, intervalSeconds: Number(e.target.value) || 0 }))}
                    />
                </div>
            </div>

            <div className="border-t border-gray-100 dark:border-gray-800 pt-4" />

            {/* 喊车配置 */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-200">启用喊车</div>
                    <div className="text-xs text-gray-400 mt-0.5">开启后，发送关键词即可触发</div>
                </div>
                <label className="toggle">
                    <input
                        type="checkbox"
                        checked={Boolean(shoutCarDraft.enabled)}
                        onChange={(e) => setShoutCarDraft(d => ({ ...d, enabled: e.target.checked }))}
                    />
                    <div className="slider" />
                </label>
            </div>

            <div>
                <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">@全体 冷却 (秒)</div>
                <div className="text-xs text-gray-400 mb-2">同一群的多个关键词共用这一份冷却；0 表示不限制</div>
                <input
                    className="input-field"
                    type="number"
                    value={String(shoutCarDraft.cooldownSeconds ?? 0)}
                    onChange={(e) => setShoutCarDraft(d => ({ ...d, cooldownSeconds: Number(e.target.value) || 0 }))}
                />
            </div>

            <div>
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-200">关键词规则</div>
                        <div className="text-xs text-gray-400 mt-0.5">完全匹配触发；每条规则可配置文本与 @全体 策略</div>
                    </div>
                    <button className="btn btn-ghost text-xs" onClick={addRule}>添加</button>
                </div>

                {(shoutCarDraft.rules || []).length === 0 ? (
                    <div className="text-xs text-gray-400 bg-gray-50/60 dark:bg-white/[0.02] border border-gray-100 dark:border-gray-800 rounded-lg p-3">
                        暂无关键词规则。点击“添加”创建。
                    </div>
                ) : (
                    <div className="space-y-3">
                        {shoutCarDraft.rules.map((r, idx) => (
                            <div key={idx} className="border border-gray-100 dark:border-gray-800 rounded-lg p-3 bg-white dark:bg-[#1e1e20]">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-xs text-gray-400">规则 {idx + 1}</div>
                                    <button className="btn btn-ghost text-xs !px-3 !py-1.5" onClick={() => removeRule(idx)}>移除</button>
                                </div>

                                <div className="mt-2 grid grid-cols-1 gap-3">
                                    <div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">触发关键词</div>
                                        <input
                                            className="input-field"
                                            value={r.keyword}
                                            onChange={(e) => {
                                                const v = e.target.value
                                                setShoutCarDraft(d => {
                                                    const rules = [...(d.rules || [])]
                                                    rules[idx] = { ...rules[idx], keyword: v }
                                                    return { ...d, rules }
                                                })
                                            }}
                                            placeholder="例如 ymycc"
                                        />
                                    </div>

                                    <div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">触发后发送文本（可空）</div>
                                        <input
                                            className="input-field"
                                            value={r.text}
                                            onChange={(e) => {
                                                const v = e.target.value
                                                setShoutCarDraft(d => {
                                                    const rules = [...(d.rules || [])]
                                                    rules[idx] = { ...rules[idx], text: v }
                                                    return { ...d, rules }
                                                })
                                            }}
                                            placeholder="例如 星趴dd"
                                        />
                                    </div>

                                    <div className={"grid grid-cols-1 sm:grid-cols-2 gap-3 " + (compact ? '' : '')}>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="text-sm font-medium text-gray-800 dark:text-gray-200">管理员触发 @全体</div>
                                                <div className="text-xs text-gray-400 mt-0.5">群主/管理员发送该关键词时</div>
                                            </div>
                                            <label className="toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={Boolean(r.atAllWhenAdmin)}
                                                    onChange={(e) => {
                                                        const v = e.target.checked
                                                        setShoutCarDraft(d => {
                                                            const rules = [...(d.rules || [])]
                                                            rules[idx] = { ...rules[idx], atAllWhenAdmin: v }
                                                            return { ...d, rules }
                                                        })
                                                    }}
                                                />
                                                <div className="slider" />
                                            </label>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="text-sm font-medium text-gray-800 dark:text-gray-200">成员触发 @全体</div>
                                                <div className="text-xs text-gray-400 mt-0.5">普通成员发送该关键词时</div>
                                            </div>
                                            <label className="toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={Boolean(r.atAllWhenMember)}
                                                    onChange={(e) => {
                                                        const v = e.target.checked
                                                        setShoutCarDraft(d => {
                                                            const rules = [...(d.rules || [])]
                                                            rules[idx] = { ...rules[idx], atAllWhenMember: v }
                                                            return { ...d, rules }
                                                        })
                                                    }}
                                                />
                                                <div className="slider" />
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
                <button className="btn btn-ghost text-xs" onClick={onClose}>取消</button>
                <button className="btn btn-primary text-xs" onClick={onSave} disabled={saving}>
                    {saving ? '保存中...' : '保存'}
                </button>
            </div>
        </div>
    )
}
