import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import ToastContainer from './components/ToastContainer'
import StatusPage from './pages/StatusPage'
import ConfigPage from './pages/ConfigPage'
import GroupsPage from './pages/GroupsPage'
import HelpPage from './pages/HelpPage.tsx'
import { useStatus } from './hooks/useStatus'
import { useTheme } from './hooks/useTheme'

export type PageId = 'status' | 'config' | 'groups' | 'help'

const pageConfig: Record<PageId, { title: string; desc: string }> = {
    status: { title: '仪表盘', desc: '插件运行状态与数据概览' },
    config: { title: '设置', desc: '基础开关、命令与行为参数' },
    groups: { title: '群与功能', desc: '群启用开关与喊车配置' },
    help: { title: '使用说明', desc: '常用指令、使用建议与排障' },
}

function parseHashPage(hash: string): PageId {
    const raw = (hash || '').replace(/^#\/?/, '').trim()
    const page = raw.split('?')[0] as PageId
    if (page === 'status' || page === 'config' || page === 'groups' || page === 'help') return page
    return 'status'
}

function setHashPage(page: PageId) {
    const next = '#/' + page
    if (location.hash !== next) location.hash = next
}

function App() {
    const [currentPage, setCurrentPage] = useState<PageId>(() => parseHashPage(location.hash))
    const [isScrolled, setIsScrolled] = useState(false)
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const { status, fetchStatus } = useStatus()

    useTheme()

    useEffect(() => {
        fetchStatus()
        const interval = setInterval(fetchStatus, 5000)
        return () => clearInterval(interval)
    }, [fetchStatus])

    useEffect(() => {
        const onHashChange = () => setCurrentPage(parseHashPage(location.hash))
        window.addEventListener('hashchange', onHashChange)
        // 首次进入时，若 hash 不合法，纠正到默认页
        const parsed = parseHashPage(location.hash)
        if (parsed !== currentPage) setCurrentPage(parsed)
        if (!location.hash) setHashPage(parsed)
        return () => window.removeEventListener('hashchange', onHashChange)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleScroll = (e: React.UIEvent<HTMLElement>) => {
        setIsScrolled(e.currentTarget.scrollTop > 10)
    }

    const navigate = (page: PageId) => {
        setHashPage(page)
        setSidebarOpen(false)
        // hashchange 会同步 currentPage；这里也先更新一次，避免轻微延迟
        setCurrentPage(page)
    }

    const renderPage = () => {
        switch (currentPage) {
            case 'status': return <StatusPage status={status} onRefresh={fetchStatus} onNavigate={navigate} />
            case 'config': return <ConfigPage />
            case 'groups': return <GroupsPage />
            case 'help': return <HelpPage commandPrefix={status?.config?.commandPrefix} />
            default: return <StatusPage status={status} onRefresh={fetchStatus} onNavigate={navigate} />
        }
    }

    return (
        <div className="flex h-screen overflow-hidden bg-[#f8f9fa] dark:bg-[#18191C] text-gray-800 dark:text-gray-200 transition-colors duration-300">
            <ToastContainer />
            <Sidebar
                currentPage={currentPage}
                onPageChange={navigate}
                open={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
                pluginTitle={status?.pluginName || '等车'}
                pluginSubtitle="NapCat Plugin"
            />

            <div className="flex-1 flex flex-col overflow-hidden">
                <main className="flex-1 overflow-y-auto" onScroll={handleScroll}>
                    <Header
                        title={pageConfig[currentPage].title}
                        description={pageConfig[currentPage].desc}
                        isScrolled={isScrolled}
                        status={status}
                        currentPage={currentPage}
                        onOpenSidebar={() => setSidebarOpen(true)}
                    />
                    <div className="px-4 md:px-8 pb-10">
                        <div className="layout-container">
                            <div key={currentPage} className="page-enter">
                                {renderPage()}
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    )
}

export default App
