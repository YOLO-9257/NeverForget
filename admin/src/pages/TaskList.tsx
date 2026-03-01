import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { reminderApi } from '../api';
import type { Reminder } from '../types';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Tabs, TabsList, TabsTrigger, StatusBadge, getScheduleTypeLabel, formatScheduleTime, Button } from '../components/shared';
import styles from './TaskList.module.css';

// 格式化下次触发时间（本地工具函数，依赖 date-fns）
function formatNextTrigger(timestamp: number | null): string {
    if (!timestamp) return '-';

    try {
        const date = new Date(timestamp);
        return format(date, 'MM/dd HH:mm', { locale: zhCN });
    } catch {
        return '-';
    }
}

export function TaskList() {
    const navigate = useNavigate();
    const [tasks, setTasks] = useState<Reminder[]>([]);
    const [loading, setLoading] = useState(true);
    const [batchLoading, setBatchLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [searchInput, setSearchInput] = useState('');
    const [searchKeyword, setSearchKeyword] = useState('');
    const [sortBy, setSortBy] = useState<'created_at' | 'updated_at' | 'next_trigger_at' | 'trigger_count' | 'title' | 'status'>('created_at');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const pageSize = 10;

    const loadTasks = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const res = await reminderApi.list({
                status: statusFilter === 'all' ? undefined : statusFilter,
                type: typeFilter === 'all' ? undefined : typeFilter,
                keyword: searchKeyword || undefined,
                sortBy,
                sortOrder,
                limit: pageSize,
                offset: page * pageSize,
            });

            if (res.data) {
                setTasks(res.data.items || []);
                setTotal(res.data.total);
                setSelectedIds(prev => {
                    const validIds = new Set((res.data?.items || []).map((task) => task.id));
                    return new Set([...prev].filter((id) => validIds.has(id)));
                });
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载失败');
        } finally {
            setLoading(false);
        }
    }, [statusFilter, typeFilter, searchKeyword, sortBy, sortOrder, page, pageSize]);

    useEffect(() => {
        void loadTasks();
    }, [loadTasks]);

    // 删除任务
    const handleDelete = async (task: Reminder) => {
        if (task.type === 'email_sync') {
            alert('这是一个邮箱同步任务，请在"邮箱中心"管理或删除对应的邮箱账户。');
            return;
        }
        if (!confirm(`确定要删除任务 "${task.title}" 吗？此操作不可恢复。`)) {
            return;
        }

        try {
            await reminderApi.delete(task.id);
            void loadTasks();
        } catch (err) {
            alert(err instanceof Error ? err.message : '删除失败');
        }
    };

    // 暂停/恢复任务
    const handleToggleStatus = async (task: Reminder) => {
        const newStatus = task.status === 'active' ? 'paused' : 'active';
        try {
            await reminderApi.update(task.id, { status: newStatus });
            void loadTasks();
        } catch (err) {
            alert(err instanceof Error ? err.message : '操作失败');
        }
    };

    // 立即触发任务
    const handleTrigger = async (task: Reminder) => {
        if (!confirm(`确定要立即发送任务 "${task.title}" 吗？此操作不会影响下次定时执行。`)) {
            return;
        }

        try {
            await reminderApi.trigger(task.id);
            alert('发送成功！请检查微信消息。');
        } catch (err) {
            alert(err instanceof Error ? err.message : '发送失败');
        }
    };

    const handleSearch = () => {
        setPage(0);
        setSearchKeyword(searchInput.trim());
    };

    const handleClearSearch = () => {
        setSearchInput('');
        setSearchKeyword('');
        setPage(0);
    };

    const toggleSelectAll = () => {
        if (tasks.length === 0) {
            return;
        }
        const allSelected = tasks.every((task) => selectedIds.has(task.id));
        if (allSelected) {
            setSelectedIds(new Set());
            return;
        }
        setSelectedIds(new Set(tasks.map((task) => task.id)));
    };

    const toggleSelectTask = (taskId: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(taskId)) {
                next.delete(taskId);
            } else {
                next.add(taskId);
            }
            return next;
        });
    };

    const runBatchAction = async (actionName: string, job: (task: Reminder) => Promise<void>, opts?: { skipEmailSync?: boolean }) => {
        const selectedTasks = tasks.filter((task) => selectedIds.has(task.id));
        if (selectedTasks.length === 0) {
            return;
        }

        const executableTasks = opts?.skipEmailSync
            ? selectedTasks.filter((task) => task.type !== 'email_sync')
            : selectedTasks;

        if (executableTasks.length === 0) {
            alert('所选任务均不支持该批量操作');
            return;
        }

        setBatchLoading(true);
        try {
            const results = await Promise.allSettled(executableTasks.map((task) => job(task)));
            const successCount = results.filter((item) => item.status === 'fulfilled').length;
            const failCount = results.length - successCount;

            if (failCount > 0) {
                alert(`${actionName}完成：成功 ${successCount} 项，失败 ${failCount} 项`);
            }
            setSelectedIds(new Set());
            await loadTasks();
        } finally {
            setBatchLoading(false);
        }
    };

    const handleBatchPause = async () => {
        if (!confirm(`确定暂停选中的 ${selectedIds.size} 个任务吗？`)) {
            return;
        }
        await runBatchAction('批量暂停', async (task) => {
            await reminderApi.update(task.id, { status: 'paused' });
        }, { skipEmailSync: true });
    };

    const handleBatchResume = async () => {
        if (!confirm(`确定恢复选中的 ${selectedIds.size} 个任务吗？`)) {
            return;
        }
        await runBatchAction('批量恢复', async (task) => {
            await reminderApi.update(task.id, { status: 'active' });
        }, { skipEmailSync: true });
    };

    const handleBatchDelete = async () => {
        if (!confirm(`确定删除选中的 ${selectedIds.size} 个任务吗？该操作不可恢复。`)) {
            return;
        }
        await runBatchAction('批量删除', async (task) => {
            await reminderApi.delete(task.id);
        }, { skipEmailSync: true });
    };

    const allSelected = tasks.length > 0 && tasks.every((task) => selectedIds.has(task.id));

    return (
        <div>
            {/* 页面标题 */}
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>任务列表</h1>
                    <p className={styles.pageSubtitle}>管理所有定时提醒任务</p>
                </div>
                <Button
                    variant="primary"
                    onClick={() => navigate('/create')}
                    leftIcon="➕"
                >
                    创建任务
                </Button>
            </div>

            {/* 筛选选项卡 */}
            <div className={styles.filterContainer}>
                {/* 状态筛选 */}
                <Tabs
                    value={statusFilter}
                    onValueChange={(val) => { setStatusFilter(val); setPage(0); }}
                    className={styles.statusTabs}
                    variant="pills"
                >
                    <TabsList>
                        <TabsTrigger value="all">全部</TabsTrigger>
                        <TabsTrigger value="active">运行中</TabsTrigger>
                        <TabsTrigger value="paused">已暂停</TabsTrigger>
                        <TabsTrigger value="completed">已完成</TabsTrigger>
                    </TabsList>
                </Tabs>

                {/* 类型筛选 */}
                <Tabs
                    value={typeFilter}
                    onValueChange={(val) => { setTypeFilter(val); setPage(0); }}
                    className={styles.typeTabs}
                    variant="pills"
                >
                    <TabsList>
                        <TabsTrigger value="all">全部类型</TabsTrigger>
                        <TabsTrigger value="reminder">定时任务</TabsTrigger>
                        <TabsTrigger value="email_sync">邮件任务</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* 搜索与排序 */}
            <div className={styles.toolbar}>
                <div className={styles.searchGroup}>
                    <input
                        className={`form-input ${styles.searchInput}`}
                        placeholder="搜索标题或内容"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleSearch();
                            }
                        }}
                    />
                    <Button variant="secondary" onClick={handleSearch}>
                        搜索
                    </Button>
                    {(searchKeyword || searchInput) && (
                        <Button variant="ghost" onClick={handleClearSearch}>
                            清除
                        </Button>
                    )}
                </div>
                <div className={styles.sortGroup}>
                    <select
                        className={`form-select ${styles.sortSelect}`}
                        value={sortBy}
                        onChange={(e) => {
                            setSortBy(e.target.value as typeof sortBy);
                            setPage(0);
                        }}
                    >
                        <option value="created_at">按创建时间</option>
                        <option value="updated_at">按更新时间</option>
                        <option value="next_trigger_at">按下次触发</option>
                        <option value="trigger_count">按执行次数</option>
                        <option value="title">按标题</option>
                        <option value="status">按状态</option>
                    </select>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
                            setPage(0);
                        }}
                    >
                        {sortOrder === 'desc' ? '降序' : '升序'}
                    </Button>
                </div>
            </div>

            {/* 任务列表 */}
            <div className="card">
                {loading ? (
                    <div className="loading">
                        <div className="spinner" />
                    </div>
                ) : error ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">❌</div>
                        <div className="empty-state-title">加载失败</div>
                        <div className="empty-state-text">{error}</div>
                        <Button variant="primary" onClick={loadTasks}>
                            重试
                        </Button>
                    </div>
                ) : tasks.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">📋</div>
                        <div className="empty-state-title">暂无任务</div>
                        <div className="empty-state-text">
                            {statusFilter === 'all' && typeFilter === 'all'
                                ? '还没有创建任何定时任务'
                                : `没有${typeFilter === 'all' ? '' : typeFilter === 'reminder' ? '定时' : '邮件'}${statusFilter === 'all' ? '' : statusFilter === 'active' ? '运行中' : statusFilter === 'paused' ? '已暂停' : '已完成'}的任务`}
                        </div>
                        <Button
                            variant="primary"
                            onClick={() => navigate('/create')}
                        >
                            创建第一个任务
                        </Button>
                    </div>
                ) : (
                    <>
                        {selectedIds.size > 0 && (
                            <div className={styles.batchToolbar}>
                                <div className={styles.batchInfo}>已选择 {selectedIds.size} 个任务</div>
                                <div className={styles.batchActions}>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        loading={batchLoading}
                                        onClick={handleBatchPause}
                                    >
                                        批量暂停
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        loading={batchLoading}
                                        onClick={handleBatchResume}
                                    >
                                        批量恢复
                                    </Button>
                                    <Button
                                        variant="danger"
                                        size="sm"
                                        loading={batchLoading}
                                        onClick={handleBatchDelete}
                                    >
                                        批量删除
                                    </Button>
                                </div>
                            </div>
                        )}

                        <div className="table-container">
                            <table className={styles.taskListTable}>
                                <thead>
                                    <tr>
                                        <th className={styles.selectColumn}>
                                            <input
                                                type="checkbox"
                                                checked={allSelected}
                                                onChange={toggleSelectAll}
                                                aria-label="全选当前页"
                                            />
                                        </th>
                                        <th>任务内容</th>
                                        <th>调度规则</th>
                                        <th>运行状态</th>
                                        <th style={{ textAlign: 'right' }}>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tasks.map((task) => (
                                        <tr key={task.id}>
                                            <td className={styles.selectColumn}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(task.id)}
                                                    onChange={() => toggleSelectTask(task.id)}
                                                    aria-label={`选择任务 ${task.title}`}
                                                />
                                            </td>
                                            {/* 1. 任务内容列 */}
                                            <td className={styles.taskInfoCell}>
                                                <div className={styles.taskHeader}>
                                                    <div
                                                        className={styles.taskTitleLink}
                                                        onClick={() => navigate(`/tasks/${task.id}`)}
                                                        role="button"
                                                        tabIndex={0}
                                                        title="点击查看详情"
                                                    >
                                                        {task.title}
                                                    </div>
                                                    {task.type === 'email_sync' ? (
                                                        <span className={`badge ${styles.emailSyncBadge}`} title="邮箱同步任务">
                                                            📧 同步
                                                        </span>
                                                    ) : (
                                                        <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)' }}>
                                                            {getScheduleTypeLabel(task.schedule_type)}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className={styles.taskContentPreview}>
                                                    {task.content}
                                                </div>
                                            </td>

                                            {/* 2. 调度规则列 */}
                                            <td className={styles.scheduleCell}>
                                                <div className={styles.scheduleMain}>
                                                    <span title="执行规则">🕒 {formatScheduleTime(task)}</span>
                                                </div>
                                                <div className={styles.scheduleSub}>
                                                    <span>下次: {formatNextTrigger(task.next_trigger_at)}</span>
                                                </div>
                                            </td>

                                            {/* 3. 运行状态列 */}
                                            <td className={styles.statusCell}>
                                                <div className={styles.statusRow}>
                                                    <StatusBadge status={task.status} />
                                                </div>
                                                <div className={styles.statCount}>
                                                    已执行 {task.trigger_count} 次
                                                    {task.ack_required && (
                                                        <span
                                                            className={`${styles.ackIndicator} ${
                                                                task.ack_status === 'pending'
                                                                    ? styles.ackPending
                                                                    : task.ack_status === 'completed'
                                                                        ? styles.ackCompleted
                                                                        : styles.ackDefault
                                                            }`}
                                                            style={{ marginLeft: 8, display: 'inline-flex' }}
                                                        >
                                                            🔥 {task.ack_status === 'pending'
                                                                ? '待确认'
                                                                : task.ack_status === 'completed'
                                                                    ? '已确认'
                                                                    : '未执行'}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* 4. 操作列 */}
                                            <td className={styles.actionsCell}>
                                                <div className={styles.actionsWrapper}>
                                                    {task.type === 'email_sync' ? (
                                                        <button
                                                            className={styles.actionBtn}
                                                            onClick={() => navigate('/email')}
                                                            title="在邮箱中心管理"
                                                        >
                                                            ⚙️
                                                        </button>
                                                    ) : (
                                                        <button
                                                            className={styles.actionBtn}
                                                            onClick={() => navigate(`/tasks/${task.id}/edit`)}
                                                            title="编辑任务"
                                                        >
                                                            ✏️
                                                        </button>
                                                    )}

                                                    {task.status !== 'completed' && (
                                                        <button
                                                            className={styles.actionBtn}
                                                            title={task.title + (task.status === 'active' ? ' (运行中)' : ' (已暂停)') + ' - 点击' + (task.status === 'active' ? '暂停' : '恢复')}
                                                            onClick={() => {
                                                                if (task.type === 'email_sync') {
                                                                    alert('请在邮箱中心管理同步状态');
                                                                    return;
                                                                }
                                                                handleToggleStatus(task);
                                                            }}
                                                        >
                                                            {task.status === 'active' ? '⏸' : '▶️'}
                                                        </button>
                                                    )}

                                                    <button
                                                        className={`${styles.actionBtn} ${styles.triggerBtn}`}
                                                        title="立即发送 (测试)"
                                                        onClick={() => handleTrigger(task)}
                                                    >
                                                        🚀
                                                    </button>

                                                    <button
                                                        className={`${styles.actionBtn} ${styles.deleteBtn}`}
                                                        title="删除任务"
                                                        onClick={() => handleDelete(task)}
                                                        disabled={task.type === 'email_sync'}
                                                        style={task.type === 'email_sync' ? { opacity: 0.3, cursor: 'not-allowed' } : {}}
                                                    >
                                                        🗑
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* 分页 */}
                        {total > pageSize && (
                            <div className={styles.pagination}>
                                <div className={styles.paginationInfo}>
                                    共 {total} 条记录，第 {page + 1} / {Math.ceil(total / pageSize)} 页
                                </div>
                                <div className={styles.paginationButtons}>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled={page === 0}
                                        onClick={() => setPage((p) => p - 1)}
                                    >
                                        上一页
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled={(page + 1) * pageSize >= total}
                                        onClick={() => setPage((p) => p + 1)}
                                    >
                                        下一页
                                    </Button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
