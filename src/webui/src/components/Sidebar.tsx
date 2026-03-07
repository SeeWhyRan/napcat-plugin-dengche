import type { PageId } from '../App'
import { IconDashboard, IconSettings, IconGroup, IconGithub, IconPlugin, IconSun, IconBook } from './icons'

interface SidebarProps {
    currentPage: PageId
    onPageChange: (page: PageId) => void
    open?: boolean
    onClose?: () => void
    pluginTitle?: string
    pluginSubtitle?: string
}

const menuItems: { id: PageId; label: string; icon: React.ReactNode }[] = [
    { id: 'status', label: '仪表盘', icon: <IconDashboard size={18} /> },
    { id: 'config', label: '设置', icon: <IconSettings size={18} /> },
    { id: 'groups', label: '群与功能', icon: <IconGroup size={18} /> },
    { id: 'help', label: '使用说明', icon: <IconBook size={18} /> },
]

export default function Sidebar({ currentPage, onPageChange, open = false, onClose, pluginTitle, pluginSubtitle }: SidebarProps) {
    return (
        <>
            {/* Mobile overlay */}
            <div
                className={`fixed inset-0 z-40 bg-black/40 md:hidden transition-opacity ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            />

            <aside
                className={`
                    sidebar-shell z-50
                    w-72 md:w-60 flex-shrink-0 bg-white dark:bg-[#1a1b1d]
                    border-r border-gray-200 dark:border-gray-800 flex flex-col
                    fixed md:static inset-y-0 left-0
                    transition-transform duration-300 ease-out
                    ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                `}
            >
                {/* Logo */}
                <div className="px-5 py-6 flex items-center gap-3">
                    <div className="sidebar-logo w-9 h-9 flex items-center justify-center bg-brand-500 rounded-xl text-white shadow-sm">
                        <IconPlugin size={18} />
                    </div>
                    <div className="min-w-0">
                        <h1 className="font-bold text-sm leading-tight text-gray-900 dark:text-white truncate">{pluginTitle || 'Plugin'}</h1>
                        <p className="text-[10px] text-gray-400 font-medium tracking-wider truncate">{pluginSubtitle || 'WEBUI'}</p>
                    </div>
                </div>

                {/* Nav */}
                <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto nav-stagger">
                    {menuItems.map((item) => (
                        <div
                            key={item.id}
                            className={`sidebar-item ${currentPage === item.id ? 'active' : ''}`}
                            onClick={() => onPageChange(item.id)}
                        >
                            <span className="sidebar-icon">{item.icon}</span>
                            <span className="truncate">{item.label}</span>
                        </div>
                    ))}
                </nav>

                {/* Footer */}
                <div className="px-3 pb-2">
                    <a
                        href="https://github.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="sidebar-item no-underline"
                    >
                        <IconGithub size={18} />
                        <span>反馈问题</span>
                    </a>
                </div>

                <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800">
                    <div className="flex items-center justify-center w-full py-2 rounded-lg text-gray-500 bg-gray-50 dark:bg-gray-800/50 cursor-default text-xs gap-2">
                        <IconSun size={14} className="opacity-60" />
                        <span>跟随系统主题</span>
                    </div>
                </div>
            </aside>
        </>
    )
}
