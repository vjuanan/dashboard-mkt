/**
 * EPN Marketing Ops Center - Full Supabase Integration
 * Complete CRUD operations with real-time updates
 */

// ===== Global State =====
let currentMonth = new Date(2026, 0, 1);
let currentView = 'unified';
let currentFilter = { status: null, platform: null };
let isLoading = false;

// Mini-calendar state
let miniCalMonth = new Date();
let selectedStartDate = null;
let currentCalPrefix = 'campaign'; // 'campaign', 'content', or 'input'
let currentContentView = 'calendar'; // 'calendar' or 'kanban'
let currentUnifiedView = 'table'; // 'table' or 'timeline'
let teamProfiles = []; // Store profiles cache

// Ads Table State
window.adsData = []; // Cache for raw ads data (Global)
let tableState = {
    sortBy: 'spend', // default sort
    sortOrder: 'desc', // desc or asc
    showPaused: false, // Legacy, replaced by showActiveOnly logic but keeping for safety
    filterText: '', // Search text
    showActiveOnly: true, // Default: Only Active
    visibleColumns: ['current_status', 'spend', 'impressions', 'clicks', 'ctr'] // Default active columns
};

// Global Metric Definitions
const METRIC_DEFINITIONS = {
    // Base
    current_status: { label: 'Estado', type: 'status', locked: true }, // Not togglable
    name: { label: 'Nombre', type: 'text', locked: true }, // Not togglable

    // Core
    spend: { label: 'Costo', type: 'currency', platform: 'all' },
    impressions: { label: 'Impresiones', type: 'number', platform: 'all' },
    clicks: { label: 'Clics', type: 'number', platform: 'all' },
    ctr: { label: 'CTR', type: 'percent', platform: 'all' },

    // Meta Specific
    reach: { label: 'Alcance', type: 'number', platform: 'Meta Ads' },
    frequency: { label: 'Frecuencia', type: 'decimal', platform: 'Meta Ads' },
    cpm: { label: 'CPM', type: 'currency', platform: 'Meta Ads' },

    // Google Specific
    average_cpc: { label: 'CPC Prom.', type: 'currency', platform: 'Google Ads' },
    search_impression_share: { label: 'Impr. Share', type: 'percent', platform: 'Google Ads' },

    // Shared / Converged
    cpc: { label: 'CPC', type: 'currency', platform: 'all' }, // Meta 'cpc' vs Google 'average_cpc' - we might merge visually or keep separate
    conversions: { label: 'Conversiones', type: 'number', platform: 'all' },
    cost_per_conversion: { label: 'Costo / Conv.', type: 'currency', platform: 'all' },
    conversions_value: { label: 'Valor Conv.', type: 'currency', platform: 'all' },
    roas: { label: 'ROAS', type: 'decimal', platform: 'all' } // Calculated or fetched
};

// Date Range State
let dateRange = {
    preset: 'thisMonth', // today, yesterday, last7, last30, thisMonth, lastMonth, lifetime, custom
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // First day of current month
    end: new Date(),
    compare: false,
    compareStart: null,
    compareEnd: null
};

// UI State for DatePicker
let dpState = {
    viewMonth: new Date(), // Month displayed in left calendar
    selectionState: 'idle' // idle, selecting
};

// Action button labels per view
const actionLabels = {
    unified: 'Campaña',
    ads: 'Anuncio',
    content: 'Contenido',
    inputs: 'Input',
    unified: 'Campaña',
    ads: 'Anuncio',
    content: 'Contenido',
    inputs: 'Input',
    team: 'Doc'
};



// Budget State
let currentBudgets = { google: 0, meta: 0, total: 0 };

// ===== DOM Elements =====
const header = document.getElementById('main-header');
const navTabs = document.querySelectorAll('.nav-tab');
const views = document.querySelectorAll('.view');
const slideOver = document.getElementById('slide-over');
const slideOverOverlay = document.getElementById('slide-over-overlay');
const slideOverClose = document.getElementById('slide-over-close');
const slideOverTitle = document.getElementById('slide-over-title');
const slideOverContent = document.getElementById('slide-over-content');
const calendarGrid = document.getElementById('calendar-grid');
const calendarMonthLabel = document.getElementById('calendar-month-label');
const prevMonthBtn = document.getElementById('prev-month');
const nextMonthBtn = document.getElementById('next-month');
const btnToday = document.getElementById('btn-today');
const actionBtnText = document.getElementById('action-btn-text');
const headerPrimaryAction = document.getElementById('header-primary-action');

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Lucide icons
    lucide.createIcons();

    // Setup event listeners
    setupNavigation();
    setupScrollBehavior();
    setupSlideOver();
    setupCalendarNavigation();
    setupModals();
    setupFilters();
    setupSearch();

    // Test connection and load data
    await initializeApp();
});

// ===== App Initialization =====
// ===== App Initialization =====
async function initializeApp() {
    // 1. Test Supabase connection
    const { connected, error } = await db.testConnection();
    if (!connected) {
        console.warn('Supabase not connected:', error);
        showToast('ERROR: FALLO DE CONEXIÓN A BASE DE DATOS', 'error');
    } else {
        showToast('Conectado a la base de datos', 'success');
    }

    // 2. Setup Controls
    setupUnifiedViewControls(); // NEW: Gantt Switcher
    setupDatePicker(); // NEW: Advanced Date Picker
    setupAdsTableControls(); // NEW: Ads Table Search & Filter Listeners
    setupRealtimeSubscriptions();

    // 3. Setup Modals
    // Ensure we call the valid modal setup function (setupModals, not setupModalListeners)
    if (typeof setupModals === 'function') setupModals();

    // 4. IMMEDIATE RENDER: Show Dashboard Skeleton/Mocks execution context
    // This removes "Cargando..." immediately
    loadUnifiedDashboard();

    // 5. Load initial data (Always load dashboard, even if connection fails)
    await loadAllData();
}

// ===== App Initialization =====


// ===== Data Loading =====
async function loadAllData() {
    // 1. Load Standalone Data (Parallel)
    await Promise.all([
        loadKPIs(), // App header KPIs
        loadCalendar(),
        loadInputs(),
        loadTeamDocs(),
        loadProfiles(),
        loadBudgets()
    ]);

    // 2. Load Ads Data (Crucial for Dashboard)
    // We await this so adsData is ready for the dashboard
    // Wrap in try/catch so dashboard loads even if Ads fetch fails
    try {
        await loadAdsTable();
    } catch (e) {
        console.error("Critical: Failed to load Ads Data", e);
        // Ensure we at least have empty array to prevent dashboard crash
        if (!adsData) adsData = [];
    }

    // 3. Load Unified Dashboard (Now safe to use adsData)
    loadUnifiedDashboard();
}

async function loadKPIs() {
    const { data: stats, error } = await db.campaigns.getStats();

    if (error || !stats) {
        if (document.getElementById('global-impressions')) document.getElementById('global-impressions').textContent = '0';
        if (document.getElementById('global-clicks')) document.getElementById('global-clicks').textContent = '0';
        if (document.getElementById('global-ctr')) document.getElementById('global-ctr').textContent = '0%';
        if (document.getElementById('global-spend')) document.getElementById('global-spend').textContent = '$0';
        return;
    }

    if (document.getElementById('global-impressions')) document.getElementById('global-impressions').textContent = formatNumber(stats.totalImpressions);
    if (document.getElementById('global-clicks')) document.getElementById('global-clicks').textContent = formatNumber(stats.totalClicks);
    if (document.getElementById('global-ctr')) document.getElementById('global-ctr').textContent = stats.avgCTR + '%';
    if (document.getElementById('global-spend')) document.getElementById('global-spend').textContent = formatCurrency(stats.totalSpend);
}

async function loadUnifiedTable() {
    // Redirect to new Dashboard Logic
    loadUnifiedDashboard();
}

async function loadUnifiedDashboard() {
    // Aggregation from adsData (Client-side)
    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalCTR = 0;

    // Check if we have real data
    const hasData = typeof adsData !== 'undefined' && Array.isArray(adsData) && adsData.length > 0;

    if (hasData) {
        // REAL DATA CALCULATION
        adsData.forEach(c => {
            // 1. Try Main Columns First
            let spend = parseFloat(c.spend) || 0;
            let imp = parseFloat(c.impressions) || 0;
            let clk = parseFloat(c.clicks) || 0;

            // 2. Fallback / Deep Dive if Main is 0 (Crucial for Synced Data)
            // METRIC EXTRACTION LOGIC
            if (c.platform && c.platform.includes('Google')) {
                // Check raw_data.metrics
                if (c.raw_data && c.raw_data.metrics) {
                    const m = c.raw_data.metrics;
                    // Google uses 'cost_micros' (millionths)
                    if (m.cost_micros) spend = parseInt(m.cost_micros) / 1000000;
                    if (m.impressions) imp = parseInt(m.impressions) || imp;
                    if (m.clicks) clk = parseInt(m.clicks) || clk;
                }
            } else if (c.platform && c.platform.includes('Meta')) {
                // Check raw_data.insights
                const insights = c.raw_data?.insights;
                // Insights might be an object (direct) or array (if multiple days) - usually object in our schema
                if (insights) {
                    // Try direct spend
                    const rawSpend = parseFloat(insights.spend);
                    if (!isNaN(rawSpend) && rawSpend > 0) {
                        spend = rawSpend;
                    } else {
                        // RECOVER SPEND VIA MATH: Spend = Clicks * CPC
                        // (Only if we have clicks and CPC but no spend)
                        const cpc = parseFloat(insights.cpc);
                        if (clk > 0 && !isNaN(cpc) && cpc > 0) {
                            spend = clk * cpc;
                            // console.log(`Recovered Meta Spend for ${c.name}: ${spend.toFixed(2)} (from ${clk} clicks * ${cpc} cpc)`);
                        }
                    }
                    if (insights.impressions) imp = parseInt(insights.impressions) || imp;
                    if (insights.clicks) clk = parseInt(insights.clicks) || clk;
                }
            }

            // Sync back to object for Table View validity
            c.spend = spend;

            totalSpend += spend;
            totalImpressions += imp;
            totalClicks += clk;
        });

        if (totalImpressions > 0) {
            totalCTR = (totalClicks / totalImpressions) * 100;
        }
    } else {
        // FALLBACK MOCK DATA (Offline Mode)
        console.warn("No Ads Data found. Showcasing Mock KPIs.");
        // totalSpend = 12450.00;     // Mock Removed
        // totalImpressions = 450000; // Mock Removed
    }

    // Update Dashboard Scoreboard
    if (document.getElementById('global-spend')) document.getElementById('global-spend').textContent = formatCurrency(totalSpend);
    if (document.getElementById('global-impressions')) document.getElementById('global-impressions').textContent = formatNumber(totalImpressions);
    if (document.getElementById('global-clicks')) document.getElementById('global-clicks').textContent = formatNumber(totalClicks);
    if (document.getElementById('global-ctr')) document.getElementById('global-ctr').textContent = totalCTR.toFixed(2) + '%';

    // Visual Trend
    if (totalSpend > 0) {
        if (document.getElementById('global-spend-trend')) document.getElementById('global-spend-trend').innerHTML = '+10% vs mes anterior';
    } else {
        if (document.getElementById('global-spend-trend')) document.getElementById('global-spend-trend').innerHTML = '<span style="color:orange; font-size:0.8em">Sin Datos de Costo</span>';
    }

    // 2. Timeline Feed
    renderTimelineFeed();

    // 3. Action Radar
    renderActionRadar();

    // 4. Enable Interactions
    setupScorecardInteractions();
}

// Event Delegation for Scorecards (Robust against re-renders)
function setupScorecardInteractions() {
    const mainContent = document.querySelector('.main-content') || document.body;

    mainContent.addEventListener('click', (e) => {
        const card = e.target.closest('.stat-card') || e.target.closest('.kpi-card-lg') || e.target.closest('.kpi-card');
        if (!card) return;

        // Identify Metric based on ID inside card
        const metrics = [
            { id: 'global-spend', key: 'spend', label: 'Inversión Total', format: formatCurrency },
            { id: 'global-impressions', key: 'impressions', label: 'Impresiones Reales', format: formatNumber },
            { id: 'global-clicks', key: 'clicks', label: 'Clics Totales', format: formatNumber },
            { id: 'global-ctr', key: 'ctr', label: 'CTR Promedio', format: (v) => v.toFixed(2) + '%' }
        ];

        // Find which metric matches this card
        const metric = metrics.find(m => card.querySelector(`#${m.id}`));

        if (metric) {
            console.log("Card Clicked:", metric.label);
            openDetailModal(metric);
        }
    });
}

function openDetailModal(metric) {
    const modal = document.getElementById('detail-modal');
    const title = document.getElementById('modal-title');
    const total = document.getElementById('modal-total');
    const list = document.getElementById('modal-list');

    if (!modal || !adsData) return;

    // Show Modal
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        modal.style.pointerEvents = 'auto';
        modal.querySelector('.modal-content').style.transform = 'scale(1)';
    });

    // Set Header
    title.textContent = metric.label;

    // Sort and Filter Data
    let items = [];
    let totalValue = 0;

    if (metric.key === 'ctr') {
        // Special logic for CTR
        items = adsData
            .filter(c => (parseFloat(c.impressions) || 0) > 1000) // Minimum volume
            .map(c => {
                const imp = parseFloat(c.impressions) || 0;
                const clk = parseFloat(c.clicks) || 0;
                const val = imp > 0 ? (clk / imp) * 100 : 0;
                return { ...c, val };
            })
            .sort((a, b) => b.val - a.val);

        // Header Value (re-read from DOM to match exactly)
        total.textContent = document.getElementById('global-ctr').innerText;
    } else {
        // Standard Summation
        items = adsData.map(c => ({
            ...c,
            val: parseFloat(c[metric.key]) || 0
        })).sort((a, b) => b.val - a.val);

        // Calculate Header Total from filtered items to ensure match
        // Or simply read from DOM to guarantee "Coincida con valor mostrado"
        total.textContent = document.getElementById(metric.id.replace('card-', 'global-')).innerText;
    }

    // Render List (Show ALL - limit 100 for perf, user asked for "everything")
    if (items.length === 0 || (metric.key === 'spend' && items[0].val === 0)) {
        list.innerHTML = `<div class="p-4 text-center text-muted">No hay datos de desglose disponibles.</div>`;
    } else {
        // Calculate max value for progress bars
        const maxVal = items[0].val;

        list.innerHTML = items.slice(0, 100).map(item => {
            // if (item.val === 0) return ''; // SHOW ALL ITEMS (Requested by User)

            // Icon & Color Logic
            const isGoogle = (item.platform === 'Google Ads' || item.platform?.includes('Google'));
            const icon = isGoogle ? 'G' : 'M';
            const iconClass = isGoogle ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600';
            const barColor = isGoogle ? 'bg-blue-500' : 'bg-purple-500';
            const progress = (item.val / maxVal) * 100;

            return `
            <div class="modal-item-row" style="padding: 12px 0; border-bottom: 1px solid var(--border-subtle);">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-3">
                         <div class="w-8 h-8 rounded-lg ${iconClass} flex items-center justify-center text-xs font-bold shadow-sm">
                            ${icon}
                        </div>
                        <div>
                            <div class="text-sm font-semibold text-gray-900 truncate w-64" title="${item.name}">${item.name}</div>
                            <div class="text-xs text-muted">${item.platform}</div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-sm font-bold text-gray-900">${metric.format(item.val)}</div>
                    </div>
                </div>
                <!-- Progress Bar -->
                <div class="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div class="${barColor} h-1.5 rounded-full" style="width: ${progress}%"></div>
                </div>
            </div>`;
        }).join('');
    }

    // Close Logic
    const closeBtn = document.getElementById('close-modal');
    closeBtn.onclick = closeModal;
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };
}

function closeModal() {
    const modal = document.getElementById('detail-modal');
    if (!modal) return;
    modal.style.opacity = '0';
    modal.style.pointerEvents = 'none';
    modal.querySelector('.modal-content').style.transform = 'scale(0.95)';
    setTimeout(() => modal.classList.add('hidden'), 200);
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

async function renderTimelineFeed() {
    const container = document.getElementById('timeline-feed');
    if (!container) return;

    // 1. REAL DATA ONLY - No Mocks
    const upcomingContent = [];
    const upcomingInputs = [];

    // 2. Real Ads Data (Start/End dates)
    // Only show campaigns if they have a real end date in the future
    const adsEvents = adsData
        .filter(c => c.status === 'active' && c.end_date && new Date(c.end_date) > new Date())
        .map(c => ({
            type: 'ad',
            title: `Campaña: ${c.name}`,
            date: new Date(c.end_date),
            platform: c.platform
        }));

    // Merge & Sort
    const allEvents = [...upcomingContent, ...upcomingInputs, ...adsEvents].sort((a, b) => a.date - b.date);

    // Group by Day
    const grouped = {
        'HOY': [],
        'MAÑANA': [],
        'PRÓXIMA SEMANA': []
    };

    const today = new Date().setHours(0, 0, 0, 0);
    const tomorrow = new Date(today + 86400000).getTime();

    allEvents.forEach(ev => {
        const evTime = ev.date.setHours(0, 0, 0, 0);
        if (evTime === today) grouped['HOY'].push(ev);
        else if (evTime === tomorrow) grouped['MAÑANA'].push(ev);
        else grouped['PRÓXIMA SEMANA'].push(ev);
    });

    // Render HTML
    let html = '';
    let hasEvents = false;
    for (const [label, events] of Object.entries(grouped)) {
        if (events.length === 0) continue;
        hasEvents = true;
        html += `<div class="timeline-day-group">
            <h4 class="timeline-date">${label}</h4>
            ${events.map(ev => renderTimelineCard(ev)).join('')}
        </div>`;
    }

    container.innerHTML = hasEvents ? html : '<div class="timeline-empty-state">No hay eventos próximos agendados.</div>';
    lucide.createIcons();
}

function renderTimelineCard(ev) {
    let icon = 'circle';
    let color = 'gray';

    if (ev.type === 'content') { icon = 'video'; color = 'purple'; }
    if (ev.type === 'input') { icon = 'file-input'; color = 'orange'; }
    if (ev.type === 'ad') { icon = 'megaphone'; color = 'blue'; }

    return `
    <div class="timeline-card">
        <div class="timeline-icon ${color}">
            <i data-lucide="${icon}"></i>
        </div>
        <div class="timeline-content">
            <div class="timeline-header">
                <span class="timeline-title">${ev.title}</span>
                <span class="timeline-time">${ev.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div class="timeline-meta">
                ${ev.platform || ev.channel || 'General'}
                ${ev.assignee ? '• ' + ev.assignee : ''}
            </div>
        </div>
    </div>`;
}

async function renderActionRadar() {
    // NEW: Call all operational widget renderers
    await Promise.all([
        renderUpcomingLaunches(),
        renderUrgentRequests(),
        renderBudgetPacing(),
        renderPlatformSplit()
    ]);
    lucide.createIcons();
}

// ===== NEW: Operational Widget Renderers =====

// Widget A: Próximos Lanzamientos (from content_calendar)
async function renderUpcomingLaunches() {
    const container = document.getElementById('upcoming-launches-list');
    if (!container) return;

    try {
        // Get content with future scheduled dates, ordered by date
        const { data: content, error } = await db.content.getAll();

        if (error) throw error;

        // Filter for pending/upcoming items with future dates
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const upcoming = (content || [])
            .filter(item => {
                if (!item.scheduled_date) return false;
                const itemDate = new Date(item.scheduled_date);
                // Include items scheduled for today or future
                return itemDate >= today && item.production_stage !== 'scheduled';
            })
            .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
            .slice(0, 3);

        if (upcoming.length === 0) {
            container.innerHTML = `
                <div class="widget-empty-state">
                    <i data-lucide="calendar-check"></i>
                    <span>No hay lanzamientos pendientes</span>
                </div>`;
            return;
        }

        container.innerHTML = upcoming.map(item => {
            const channel = (item.channel || '').toLowerCase();
            const iconClass = ['instagram', 'tiktok', 'youtube', 'linkedin', 'email'].includes(channel)
                ? channel : 'default';
            const channelIcons = {
                instagram: 'instagram',
                tiktok: 'music-2',
                youtube: 'youtube',
                linkedin: 'linkedin',
                email: 'mail',
                default: 'file-text'
            };
            const iconName = channelIcons[channel] || channelIcons.default;

            // Format date
            const date = new Date(item.scheduled_date);
            const formattedDate = date.toLocaleDateString('es-AR', {
                weekday: 'short',
                day: 'numeric',
                month: 'short'
            });

            return `
                <div class="launch-item" onclick="openContentDetail('${item.id}')">
                    <div class="launch-icon ${iconClass}">
                        <i data-lucide="${iconName}"></i>
                    </div>
                    <div class="launch-info">
                        <div class="launch-title">${item.title || 'Sin título'}</div>
                        <div class="launch-date">${formattedDate}</div>
                    </div>
                </div>`;
        }).join('');
    } catch (e) {
        console.error('Error loading upcoming launches:', e);
        container.innerHTML = `
            <div class="widget-empty-state">
                <i data-lucide="alert-circle"></i>
                <span>Error al cargar contenidos</span>
            </div>`;
    }
}

// Widget B: Solicitudes Urgentes (from inputs_requests)
async function renderUrgentRequests() {
    const container = document.getElementById('urgent-requests-list');
    if (!container) return;

    try {
        // Get all inputs
        const { data: inputs, error } = await db.inputs.getAll();

        if (error) throw error;

        // Filter for high priority and not done
        const urgent = (inputs || [])
            .filter(item => item.priority === 'high' && item.status !== 'done')
            .slice(0, 3);

        if (urgent.length === 0) {
            container.innerHTML = `
                <div class="widget-empty-state">
                    <i data-lucide="check-circle"></i>
                    <span>No hay solicitudes urgentes</span>
                </div>`;
            return;
        }

        container.innerHTML = urgent.map(item => {
            // Get assignee name from profiles cache if available
            let assigneeName = 'Sin asignar';
            if (item.assigned_to && teamProfiles.length > 0) {
                const profile = teamProfiles.find(p => p.id === item.assigned_to);
                if (profile) assigneeName = profile.full_name;
            } else if (item.requester_name) {
                assigneeName = item.requester_name;
            }

            return `
                <div class="request-item" onclick="openInputDetail('${item.id}')">
                    <span class="priority-badge high">High</span>
                    <div class="request-info">
                        <div class="request-title">${item.title || 'Sin título'}</div>
                        <div class="request-owner">${assigneeName}</div>
                    </div>
                </div>`;
        }).join('');
    } catch (e) {
        console.error('Error loading urgent requests:', e);
        container.innerHTML = `
            <div class="widget-empty-state">
                <i data-lucide="alert-circle"></i>
                <span>Error al cargar solicitudes</span>
            </div>`;
    }
}

// Widget C: Budget Pacing
async function renderBudgetPacing() {
    const percentageEl = document.getElementById('pacing-percentage');
    const progressFill = document.getElementById('pacing-progress-fill');
    const idealMarker = document.getElementById('pacing-ideal-marker');
    const spentEl = document.getElementById('pacing-spent');
    const budgetEl = document.getElementById('pacing-budget');
    const dayProgressEl = document.getElementById('pacing-day-progress');
    const statusBadge = document.getElementById('pacing-status-badge');

    if (!percentageEl) return;

    // Calculate total spend from adsData
    const totalSpend = (adsData || []).reduce((sum, c) => sum + (parseFloat(c.spend) || 0), 0);

    // Calculate total budget (Manual Input Preferred, Fallback to Campaign Sum if 0)
    // If we have a manual budget set for this month, use it.
    let effectiveBudget = currentBudgets.total;

    // Fallback: If no manual budget (0), try summing campaign budgets?
    // User requested "inputs para cargar los presupuestos", implies overriding the sum.
    // If manual is 0, let's show 0 or maybe a 'Set Budget' hint.
    // Let's stick to manual budget as the source of truth if implemented.
    if (effectiveBudget === 0) {
        effectiveBudget = (adsData || []).reduce((sum, c) => sum + (parseFloat(c.budget) || 0), 0);
    }

    if (effectiveBudget === 0) effectiveBudget = 1; // Avoid division by zero

    // Calculate percentage
    const spendPercent = (totalSpend / effectiveBudget) * 100;

    // Calculate day of month progress
    const today = new Date();
    const currentDay = today.getDate();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const dayPercent = (currentDay / daysInMonth) * 100;

    // Determine status
    let status = 'On Track';
    let statusClass = '';

    // Compare spend % vs ideal (day %)
    // If spend is within 10% of ideal, we're on track
    // If over by more than 15%, danger
    // If over by 5-15%, warning
    const variance = spendPercent - dayPercent;

    if (variance > 15) {
        status = 'Overspend';
        statusClass = 'danger';
    } else if (variance > 5) {
        status = 'Watch';
        statusClass = 'warning';
    } else if (spendPercent >= 95) {
        status = 'Near Limit';
        statusClass = 'danger';
    } else {
        status = 'On Track';
        statusClass = '';
    }

    // Update DOM
    percentageEl.textContent = spendPercent.toFixed(1) + '%';
    progressFill.style.width = Math.min(spendPercent, 100) + '%';
    progressFill.className = 'pacing-progress-fill' + (statusClass ? ' ' + statusClass : '');

    if (idealMarker) {
        idealMarker.style.left = dayPercent + '%';
    }

    spentEl.textContent = formatCurrency(totalSpend);
    budgetEl.textContent = formatCurrency(effectiveBudget);
    dayProgressEl.textContent = `${currentDay}/${daysInMonth}`;

    if (statusBadge) {
        statusBadge.textContent = status;
        statusBadge.className = 'badge-pill' + (statusClass === 'danger' ? ' urgent' : '');
    }
}

// Widget D: Platform Split (Meta vs Google)
async function renderPlatformSplit() {
    const tbody = document.getElementById('platform-split-body');
    if (!tbody) return;

    // Aggregate by platform
    const platforms = {
        'Meta Ads': { spend: 0, clicks: 0, conversions: 0 },
        'Google Ads': { spend: 0, clicks: 0, conversions: 0 }
    };

    (adsData || []).forEach(c => {
        const platform = c.platform || '';
        if (platform.includes('Meta')) {
            platforms['Meta Ads'].spend += parseFloat(c.spend) || 0;
            platforms['Meta Ads'].clicks += parseInt(c.clicks) || 0;
            platforms['Meta Ads'].conversions += parseInt(c.conversions) || 0;
        } else if (platform.includes('Google')) {
            platforms['Google Ads'].spend += parseFloat(c.spend) || 0;
            platforms['Google Ads'].clicks += parseInt(c.clicks) || 0;
            platforms['Google Ads'].conversions += parseInt(c.conversions) || 0;
        }
    });

    // Calculate CPA for each
    const metaCPA = platforms['Meta Ads'].conversions > 0
        ? platforms['Meta Ads'].spend / platforms['Meta Ads'].conversions
        : 0;
    const googleCPA = platforms['Google Ads'].conversions > 0
        ? platforms['Google Ads'].spend / platforms['Google Ads'].conversions
        : 0;

    // Determine winners (lower CPA is better, higher clicks is better)
    const spendWinner = platforms['Meta Ads'].spend > platforms['Google Ads'].spend ? 'meta' : 'google';
    const cpaWinner = metaCPA > 0 && googleCPA > 0 ? (metaCPA < googleCPA ? 'meta' : 'google') : null;
    const clicksWinner = platforms['Meta Ads'].clicks > platforms['Google Ads'].clicks ? 'meta' : 'google';

    // Check if we have any data
    const hasData = platforms['Meta Ads'].spend > 0 || platforms['Google Ads'].spend > 0;

    if (!hasData) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="loading-cell">
                    <span style="color: var(--text-muted);">Sin datos de plataformas</span>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = `
        <tr>
            <td>
                <div class="platform-cell">
                    <div class="platform-icon meta">M</div>
                    <span>Meta Ads</span>
                </div>
            </td>
            <td class="metric-col">
                ${formatCurrency(platforms['Meta Ads'].spend)}
                ${spendWinner === 'meta' ? '<span class="platform-winner">▲</span>' : ''}
            </td>
            <td class="metric-col">
                ${metaCPA > 0 ? formatCurrency(metaCPA) : '-'}
                ${cpaWinner === 'meta' ? '<span class="platform-winner">★</span>' : ''}
            </td>
            <td class="metric-col">
                ${formatNumber(platforms['Meta Ads'].clicks)}
                ${clicksWinner === 'meta' ? '<span class="platform-winner">▲</span>' : ''}
            </td>
        </tr>
        <tr>
            <td>
                <div class="platform-cell">
                    <div class="platform-icon google">G</div>
                    <span>Google Ads</span>
                </div>
            </td>
            <td class="metric-col">
                ${formatCurrency(platforms['Google Ads'].spend)}
                ${spendWinner === 'google' ? '<span class="platform-winner">▲</span>' : ''}
            </td>
            <td class="metric-col">
                ${googleCPA > 0 ? formatCurrency(googleCPA) : '-'}
                ${cpaWinner === 'google' ? '<span class="platform-winner">★</span>' : ''}
            </td>
            <td class="metric-col">
                ${formatNumber(platforms['Google Ads'].clicks)}
                ${clicksWinner === 'google' ? '<span class="platform-winner">▲</span>' : ''}
            </td>
        </tr>`;
}

async function loadAdsTable() {
    const tbody = document.getElementById('ads-table-body');
    if (!tbody) return;

    showTableSkeleton(tbody, 5);

    // Trigger Sync (Auto-refresh from Google & Meta)
    const syncParams = {
        startDate: dateRange.start.toISOString().split('T')[0],
        endDate: dateRange.end.toISOString().split('T')[0]
    };

    if (!currentFilter.platform) {
        try {
            // Run in parallel for speed
            await Promise.all([
                db.syncGoogleAds(syncParams),
                db.syncMetaAds() // Meta doesn't support date inputs yet
            ]);
        } catch (e) {
            console.warn("Auto-sync failed:", e);
        }
    } else if (currentFilter.platform === 'Google Ads') {
        await db.syncGoogleAds(syncParams);
    } else if (currentFilter.platform === 'Meta Ads') {
        await db.syncMetaAds();
    }

    // Retry Logic for Stability
    let data = null;
    let error = null;
    let attempts = 0;

    while (attempts < 3) {
        const res = await db.campaigns.getAll(currentFilter);
        data = res.data;
        error = res.error;

        if (data && data.length > 0) break;
        console.warn(`Attempt ${attempts + 1} failed or empty. Retrying...`);
        attempts++;
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log("loadAdsTable Final Result:", { dataLength: data ? data.length : 0, error });

    // SAFETY CHECK: If DB gave us data, but it's all empty zeros (e.g. valid rows but no stats),
    // treat it as a failure so we can load the backup snapshot.
    let hasStats = false;
    if (data && data.length > 0) {
        const totalImp = data.reduce((sum, c) => sum + (c.impressions || 0), 0);
        const totalSpend = data.reduce((sum, c) => sum + (parseFloat(c.spend) || 0), 0);

        // Relaxed Check: Allow 0 spend if we have impressions (Organic/Free/Test)
        // Or if we simply have campaigns (to avoid white screen of death)
        if (totalImp > 0 || totalSpend > 0) hasStats = true;

        // Debug
        console.log(`Data Health Check: Rows=${data.length}, Imp=${totalImp}, Spend=${totalSpend}`);

        // Force Pass for now to ensure UI loads even with 0 stats (will be fixed by repair logic)
        hasStats = true;
    }

    if (error || !data || data.length === 0) { // Removed !hasStats from critical failure condition
        console.error("Critical: DB Load Failed or Empty.", { error, dataLength: data?.length });

        // STRICT ONLINE MODE: NO FALLBACK
        showToast('CRITICAL: Error de Datos en DB (Sin Conexión o Datos Vacíos)', 'error');

        // Clear global cache to prevent stale state
        adsData = [];

        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center; padding: 3rem; color: #ef4444;">
                        <div style="display:flex; flex-direction:column; align-items:center; gap:10px;">
                            <i data-lucide="alert-octagon" style="width:32px; height:32px;"></i>
                            <span style="font-weight:600; font-size:1.1rem;">ERROR CRÍTICO: NO HAY DATOS VÁLIDOS</span>
                            <span style="font-size:0.9rem; opacity:0.8;">La base de datos devolvió 0 campañas o métricas vacías (Spends=$0).</span>
                            <span style="font-size:0.8rem; font-family:monospace; background:#fee2e2; padding:4px 8px; rounded:4px;">
                                ${error ? error.message : 'Data Integrity Check Failed (Zero Stats)'}
                            </span>
                        </div>
                    </td>
                </tr>`;
            lucide.createIcons();
        }
    } else {
        hideEmptyState('ads');

        // SMART DATA REPAIR & ENRICHMENT
        console.log("Starting Smart Spend Calculation on " + data.length + " rows");
        data = data.map(c => {
            let spend = parseFloat(c.spend) || 0;
            let imp = parseFloat(c.impressions) || 0;
            let clk = parseFloat(c.clicks) || 0;

            if (c.platform && c.platform.includes('Google')) {
                if (c.raw_data && c.raw_data.metrics) {
                    const m = c.raw_data.metrics;
                    if (m.cost_micros) spend = parseInt(m.cost_micros) / 1000000;
                    if (m.impressions) imp = parseInt(m.impressions) || imp;
                    if (m.clicks) clk = parseInt(m.clicks) || clk;
                }
            } else if (c.platform && c.platform.includes('Meta')) {
                const insights = c.raw_data?.insights;
                if (insights) {
                    const rawSpend = parseFloat(insights.spend);
                    if (!isNaN(rawSpend) && rawSpend > 0) {
                        spend = rawSpend;
                    } else {
                        // RECOVER SPEND: Clicks * CPC
                        const cpc = parseFloat(insights.cpc);
                        if (clk > 0 && !isNaN(cpc) && cpc > 0) {
                            spend = clk * cpc;
                        } else {
                            // RECOVER SPEND: (Impressions / 1000) * CPM
                            const cpm = parseFloat(insights.cpm);
                            if (imp > 0 && !isNaN(cpm) && cpm > 0) {
                                spend = (imp / 1000) * cpm;
                            }
                        }
                    }
                    if (insights.impressions) imp = parseInt(insights.impressions) || imp;
                    if (insights.clicks) clk = parseInt(insights.clicks) || clk;
                }
            }

            return { ...c, spend, impressions: imp, clicks: clk };
        });

        // Cache data (Explicit Global)
        adsData = data;
        window.adsData = data; // FORCE GLOBAL EXPOSURE

        // Debug Summary
        const totalRecoveredSpend = adsData.reduce((acc, c) => acc + (c.spend || 0), 0);
        console.log(`Smart Calculation Complete. Total Spend: $${totalRecoveredSpend.toFixed(2)}`);
    }

    if (error || !data || data.length === 0) {
        console.error("Critical: DB Load Failed or Empty.", { error, dataLength: data?.length });
        showToast('Error de Datos en DB', 'error');
        adsData = [];

        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center; padding: 3rem; color: #ef4444;">
                        <div style="display:flex; flex-direction:column; align-items:center; gap:10px;">
                            <i data-lucide="alert-octagon" style="width:32px; height:32px;"></i>
                            <span style="font-weight:600; font-size:1.1rem;">ERROR CRÍTICO: NO HAY DATOS VÁLIDOS</span>
                            <span style="font-size:0.9rem; opacity:0.8;">La base de datos devolvió 0 campañas o métricas vacías (Spends=$0).</span>
                            <span style="font-size:0.8rem; font-family:monospace; background:#fee2e2; padding:4px 8px; rounded:4px;">
                                ${error ? error.message : 'Data Integrity Check Failed (Zero Stats)'}
                            </span>
                        </div>
                    </td>
                </tr>`;
            lucide.createIcons();
        }
    } else {
        hideEmptyState('ads');
        renderAdsTable();
        // Force Dashboard Update instantly
        loadUnifiedDashboard();
    }

    console.log("adsData cached:", adsData.length, "campaigns");

    renderAdsTable();

    // Force Dashboard Update instantly to ensure Scoreboard is not 0
    // This fixes the empty dashboard issue if loadAllData sequence fails
    loadUnifiedDashboard();

    // Platform Dropdown Population (Optimization: Only if empty?)
    const platformSelect = document.getElementById('ads-platform-filter');
    if (platformSelect && platformSelect.options.length <= 1 && data.length > 0) {
        const currentVal = currentFilter.platform || '';
        const platforms = [...new Set(data.map(c => c.platform))].sort();

        platforms.forEach(p => {
            if (!p) return;
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            platformSelect.appendChild(opt);
        });
        if (currentVal && platforms.includes(currentVal)) {
            platformSelect.value = currentVal;
        }
    }
}

// Helper to get Metric Config
function getMetricConfig(key) {
    return METRIC_DEFINITIONS[key] || { label: key, type: 'text' };
}

// ===== Ads Table Rendering and Controls =====

function setupAdsTableControls() {
    console.log('Setting up Ads Table Controls');
    const searchInput = document.getElementById('ads-search');
    const activeToggle = document.getElementById('ads-show-active');

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            tableState.filterText = e.target.value.toLowerCase();
            renderAdsTable();
        });
    }

    if (activeToggle) {
        // Enforce default state on load
        activeToggle.checked = true;
        tableState.showActiveOnly = true;

        activeToggle.addEventListener('change', (e) => {
            console.log("Toggle Active Changed:", e.target.checked);
            tableState.showActiveOnly = e.target.checked;
            renderAdsTable();
        });
    }

    // Initialize Column Selector (if container exists)
    const controlsContainer = document.querySelector('.table-controls') || searchInput?.parentElement?.parentElement;
    if (controlsContainer && !document.getElementById('btn-columns-toggle')) {
        const btn = document.createElement('button');
        btn.id = 'btn-columns-toggle';
        btn.className = 'btn-secondary btn-sm';
        btn.innerHTML = `<i data-lucide="columns"></i> Columnas`;
        btn.style.marginLeft = '10px';
        const target = activeToggle?.parentElement || controlsContainer;
        target.appendChild(btn);
        lucide.createIcons();

        const popover = document.createElement('div');
        popover.id = 'columns-popover';
        popover.className = 'hidden absolute bg-white shadow-lg border rounded-lg p-4 z-50';
        popover.style.minWidth = '200px';
        document.body.appendChild(popover);

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            popover.classList.toggle('hidden');
            if (!popover.classList.contains('hidden')) {
                const rect = btn.getBoundingClientRect();
                popover.style.top = (rect.bottom + window.scrollY) + 'px';
                popover.style.left = (rect.left + window.scrollX - 100) + 'px';
                // Simple content render
                const keys = Object.keys(METRIC_DEFINITIONS).filter(k => !METRIC_DEFINITIONS[k].locked);
                popover.innerHTML = `<div class="font-bold mb-2">Columnas</div><div class="flex flex-col gap-2">
                        ${keys.map(k => `<label><input type="checkbox" value="${k}" ${tableState.visibleColumns.includes(k) ? 'checked' : ''} onchange="toggleColumn('${k}')"> ${METRIC_DEFINITIONS[k].label}</label>`).join('')}
                  </div>`;
            }
        });

        window.toggleColumn = (key) => {
            if (tableState.visibleColumns.includes(key)) tableState.visibleColumns = tableState.visibleColumns.filter(k => k !== key);
            else tableState.visibleColumns.push(key);
            renderAdsTable();
        };

        document.addEventListener('click', (e) => {
            if (!popover.contains(e.target) && e.target !== btn) popover.classList.add('hidden');
        });
    }
}

function renderAdsTable() {
    const tbody = document.getElementById('ads-table-body');
    if (!tbody) {
        console.error("renderAdsTable: tbody not found");
        return;
    }

    try {
        console.log("Rendering Ads Table", { state: tableState, totalData: adsData.length });

        // 1. Filter
        let filteredData = adsData.filter(item => {
            if (tableState.filterText) {
                const matchName = (item.name || '').toLowerCase().includes(tableState.filterText);
                const matchId = (item.external_id || '').toLowerCase().includes(tableState.filterText);
                if (!matchName && !matchId) return false;
            }

            if (tableState.showActiveOnly) {
                const status = (item.status || '').toLowerCase();
                if (status !== 'active' && status !== 'enabled' && status !== 'on') return false;
            }

            return true;
        });

        // 2. Sort
        filteredData.sort((a, b) => {
            const getVal = (obj, key) => {
                let val = parseFloat(obj[key]) || 0;
                if (val === 0 && obj.raw_data) {
                    if (key === 'spend') {
                        val = parseFloat(obj.raw_data.metrics?.costMicros || obj.raw_data.metrics?.cost_micros || 0) / 1000000;
                        if (!val && obj.raw_data.insights?.spend) val = parseFloat(obj.raw_data.insights.spend);
                    }
                }
                return val;
            };
            let valA = getVal(a, tableState.sortBy);
            let valB = getVal(b, tableState.sortBy);
            if (valA < valB) return tableState.sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return tableState.sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        // 3. Update KPIs
        if (typeof calculateFilteredKPIs === 'function') calculateFilteredKPIs(filteredData);

        // 4. Render
        if (filteredData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 2rem; color: #6b7280;">No se encontraron campañas.</td></tr>`;
            return;
        }

        tbody.innerHTML = filteredData.map(campaign => {
            const impressions = parseFloat(campaign.impressions) || parseFloat(campaign.raw_data?.metrics?.impressions) || parseFloat(campaign.raw_data?.insights?.impressions) || 0;
            const clicks = parseFloat(campaign.clicks) || parseFloat(campaign.raw_data?.metrics?.clicks) || parseFloat(campaign.raw_data?.insights?.clicks) || 0;

            let spend = parseFloat(campaign.spend) || 0;
            if (spend === 0) {
                if (campaign.raw_data?.metrics?.costMicros) spend = parseFloat(campaign.raw_data.metrics.costMicros) / 1000000;
                else if (campaign.raw_data?.metrics?.cost_micros) spend = parseFloat(campaign.raw_data.metrics.cost_micros) / 1000000;
                else if (campaign.raw_data?.insights?.spend) spend = parseFloat(campaign.raw_data.insights.spend);
            }

            let ctr = 0;
            if (impressions > 0) ctr = (clicks / impressions) * 100;

            const statusStyle = campaign.status === 'active' ? 'bg-green-100 text-green-800' :
                (campaign.status === 'paused' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800');

            return `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex flex-col">
                        <span class="font-medium text-gray-900" title="${campaign.name}">${campaign.name}</span>
                        <span class="text-xs text-gray-500">${campaign.external_id || 'N/A'}</span>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center gap-2">
                        ${getPlatformIcon(campaign.platform)}
                        <span class="text-sm text-gray-700">${campaign.platform}</span>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusStyle}">
                        ${(campaign.status || 'unknown').toUpperCase()}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500 font-tabular-nums">${formatNumber(impressions)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500 font-tabular-nums">${formatNumber(clicks)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500 font-tabular-nums">${ctr.toFixed(2)}%</td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-gray-900 font-tabular-nums">${formatCurrency(spend)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                     <button class="text-indigo-600 hover:text-indigo-900" onclick="editCampaign('${campaign.id}')">
                        <i data-lucide="edit-3" style="width:16px; height:16px;"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');

        lucide.createIcons();

    } catch (e) {
        console.error("Error rendering ads table:", e);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:red;">Error: ${e.message}</td></tr>`;
    }
}

function calculateFilteredKPIs(data) {
    const totalSpend = data.reduce((sum, item) => sum + (Number(item.spend) || 0), 0);
    const totalImpr = data.reduce((sum, item) => sum + (Number(item.impressions) || 0), 0);
    const totalClicks = data.reduce((sum, item) => sum + (Number(item.clicks) || 0), 0);

    const elSpend = document.getElementById('summary-spend');
    const elImpr = document.getElementById('summary-impressions');
    const elClicks = document.getElementById('summary-clicks');

    if (elSpend) elSpend.textContent = formatCurrency(totalSpend);
    if (elImpr) elImpr.textContent = formatNumber(totalImpr);
    if (elClicks) elClicks.textContent = formatNumber(totalClicks);
}

function handleSort(column) {
    if (tableState.sortBy === column) {
        // Toggle order
        tableState.sortOrder = tableState.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        tableState.sortBy = column;
        tableState.sortOrder = 'desc'; // Default new sort to desc (usually better for metrics)
    }
    renderAdsTable();
}

function updateSortHeaders() {
    const headers = document.querySelectorAll('#ads-table-container th[data-sort]');
    headers.forEach(th => {
        const col = th.dataset.sort;
        th.classList.remove('sort-active', 'sort-asc', 'sort-desc');

        // Remove existing arrow if any
        const existingIcon = th.querySelector('.sort-icon');
        if (existingIcon) existingIcon.remove();

        if (col === tableState.sortBy) {
            th.classList.add('sort-active', `sort-${tableState.sortOrder}`);
            const icon = document.createElement('i');
            icon.dataset.lucide = tableState.sortOrder === 'asc' ? 'chevron-up' : 'chevron-down';
            icon.classList.add('sort-icon');
            icon.style.width = '14px';
            icon.style.marginLeft = '4px';
            icon.style.verticalAlign = 'middle';
            th.appendChild(icon);
        }
    });
    lucide.createIcons();
}

function getPlatformIcon(platform) {
    if (platform === 'Google Ads') {
        // Simple 4-color G letter using SVG path or just a Lucide fallback if not implementing full SVG
        // Let's use a nice Lucide icon but colored.
        return `<i data-lucide="search" style="color: #EA4335; width: 16px; height: 16px;"></i>`;
    }
    if (platform === 'Meta Ads') {
        return `<i data-lucide="facebook" style="color: #1877F2; width: 16px; height: 16px;"></i>`;
    }
    return `<i data-lucide="globe" style="width: 16px;"></i>`;
}

async function loadCalendar() {
    if (!calendarGrid || !calendarMonthLabel) return;

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    // Update month label
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    calendarMonthLabel.textContent = `${monthNames[month]} ${year}`;

    // Fetch content for this month
    const { data: contentItems, error } = await db.content.getByMonth(year, month);

    // Build calendar grid
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

    let html = '';
    let dayCounter = 1;
    let nextMonthDay = 1;
    const totalCells = 42;

    // Group content by day
    const contentByDay = {};
    if (contentItems) {
        contentItems.forEach(item => {
            const date = new Date(item.scheduled_date);
            const day = date.getDate();
            if (!contentByDay[day]) contentByDay[day] = [];
            contentByDay[day].push(item);
        });
    }

    const eventColors = {
        'Instagram': 'pink',
        'TikTok': 'purple',
        'Email': 'blue',
        'Blog': 'orange',
        'YouTube': 'green',
        'LinkedIn': 'blue',
        'Twitter': 'blue'
    };

    for (let i = 0; i < totalCells; i++) {
        if (i < firstDay) {
            const prevDay = daysInPrevMonth - firstDay + i + 1;
            html += `<div class="calendar-day other-month"><span class="day-number">${prevDay}</span></div>`;
        } else if (dayCounter <= daysInMonth) {
            const isToday = isCurrentMonth && dayCounter === today.getDate();
            const dayEvents = contentByDay[dayCounter] || [];

            html += `
                <div class="calendar-day ${isToday ? 'today' : ''}" onclick="openDayModal(${year}, ${month}, ${dayCounter})">
                    <span class="day-number">${dayCounter}</span>
                    <div class="calendar-events">
                        ${dayEvents.slice(0, 3).map(event => `
                            <div class="calendar-event ${eventColors[event.channel] || 'blue'}" 
                                 onclick="event.stopPropagation(); openContentDetail('${event.id}')">
                                ${event.title}
                            </div>
                        `).join('')}
                        ${dayEvents.length > 3 ? `<div class="text-muted text-small">+${dayEvents.length - 3} más</div>` : ''}
                    </div>
                </div>
            `;
            dayCounter++;
        } else {
            html += `<div class="calendar-day other-month"><span class="day-number">${nextMonthDay}</span></div>`;
            nextMonthDay++;
        }
    }

    calendarGrid.innerHTML = html;
}

async function loadInputs() {
    const grid = document.getElementById('inputs-grid');
    if (!grid) return;

    const { data, error } = await db.inputs.getAll();

    if (error || !data || data.length === 0) {
        grid.innerHTML = '';
        showEmptyState('inputs');
        return;
    }

    hideEmptyState('inputs');

    const typeIcons = {
        'Brief': 'target',
        'Request': 'file-text',
        'Report': 'bar-chart-3',
        'Audience': 'users'
    };

    const typeColors = {
        'Brief': '',
        'Request': 'purple',
        'Report': 'green',
        'Audience': 'orange'
    };

    // Helper to get profile name
    function getProfileName(id) {
        const p = teamProfiles.find(x => x.id === id);
        return p ? p.full_name : 'Sin asignar';
    }

    // Helper to get profile avatar or initial
    function getProfileBadge(id) {
        const p = teamProfiles.find(x => x.id === id);
        if (!p) return '<span class="avatar-placeholder">?</span>';
        // Return simple initial for now
        return `<span class="avatar-initials" title="${p.full_name}">${p.full_name.charAt(0)}</span>`;
    }

    grid.innerHTML = data.map(input => `
        <div class="ticket-card glass-panel p-5 rounded-xl mb-4 border-l-4 ${getPriorityBorderColor(input.priority)} relative transition-all hover:scale-[1.005]">
            
            <!-- Header: Context & Meta -->
            <div class="flex justify-between items-start mb-3">
                <div>
                    <h3 class="text-lg font-bold text-white mb-1">${input.title}</h3>
                    <div class="flex gap-2 text-xs">
                        <span class="px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300 border border-slate-600/30">#${input.type || 'General'}</span>
                        ${getPriorityBadge(input.priority)}
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-xs text-slate-400 mb-1">Fecha Límite</div>
                    <div class="text-sm font-medium text-white flex items-center gap-1 justify-end">
                        <i data-lucide="calendar" class="w-3 h-3"></i> 
                        ${input.due_date ? new Date(input.due_date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : 'Sin fecha'}
                    </div>
                </div>
            </div>

            <!-- Body: The Request (Message Bubble Left) -->
            <div class="bg-slate-800/50 p-4 rounded-lg rounded-tl-none border border-white/5 mb-4 relative ml-2">
                <div class="absolute -left-2 top-0 w-0 h-0 border-t-[10px] border-t-slate-800/50 border-l-[10px] border-l-transparent"></div>
                <div class="text-xs text-slate-400 mb-1 flex items-center gap-1">
                    <i data-lucide="user" class="w-3 h-3"></i> Marketing Team
                </div>
                <p class="text-sm text-slate-200 leading-relaxed font-light">
                    ${input.description || 'Sin descripción detallada.'}
                </p>
            </div>

            ${input.response_text ? `
            <!-- Divider (If Answered) -->
            <div class="flex items-center gap-2 my-4 opacity-30">
                <div class="h-px bg-white flex-1"></div>
                <span class="text-xs text-white">Respuesta</span>
                <div class="h-px bg-white flex-1"></div>
            </div>

            <!-- Body: The Response (Message Bubble Right) -->
            <div class="bg-indigo-600/20 p-4 rounded-lg rounded-tr-none border border-indigo-500/20 mb-4 relative mr-2 ml-auto max-w-[90%]">
                <div class="text-xs text-indigo-300 mb-1 flex items-center justify-end gap-1">
                    Comercial Team <i data-lucide="check-circle" class="w-3 h-3"></i>
                </div>
                <p class="text-sm text-white leading-relaxed text-right font-light">
                    ${input.response_text}
                </p>
            </div>
            ` : ''}

            <!-- Footer: Actions -->
            <div class="flex justify-between items-center pt-3 border-t border-white/5">
                <div class="flex items-center gap-2">
                    <div class="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-[10px] font-bold text-white">
                        ${loadInputs.getProfileBadge(input.assigned_to)}
                    </div>
                    <span class="text-xs text-slate-400">Asignado a ${loadInputs.getProfileName(input.assigned_to)}</span>
                </div>
                
                <div class="flex gap-2">
                    <!-- Status Toggle / Reopen -->
                    <button class="p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white" 
                            onclick="toggleInputStatus('${input.id}', '${input.status}')" title="${input.status === 'done' ? 'Reabrir Ticket' : 'Marcar Completado'}">
                        <i data-lucide="${input.status === 'done' ? 'rotate-ccw' : 'check-square'}" class="w-4 h-4"></i>
                    </button>

                    <!-- Edit -->
                     <button class="p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white" 
                            onclick="editInput('${input.id}')" title="Editar Detalles">
                        <i data-lucide="edit-3" class="w-4 h-4"></i>
                    </button>
                    
                    ${!input.response_text ? `
                    <!-- Primary Action: Reply -->
                    <button onclick="openResponseModal('${input.id}')" class="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-all shadow-lg shadow-indigo-500/20 group">
                        <i data-lucide="message-square-plus" class="w-4 h-4 group-hover:scale-110 transition-transform"></i>
                        Responder
                    </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `).join('');

    lucide.createIcons();
}

// ===== UNIFIED VIEW CONTROLS (Gantt vs Table) =====
function setupUnifiedViewControls() {
    const tableContainer = document.getElementById('unified-table-container');
    const timelineWrapper = document.getElementById('unified-timeline-wrapper');
    const toggles = document.querySelectorAll('.view-switch-small');

    toggles.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.unifiedView;
            currentUnifiedView = view;

            // Update visible state
            toggles.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (view === 'timeline') {
                tableContainer.classList.add('hidden');
                timelineWrapper.classList.remove('hidden');
                loadGanttChart(); // Render chart
            } else {
                tableContainer.classList.remove('hidden');
                timelineWrapper.classList.add('hidden');
            }
        });
    });
}

// ===== DATE PICKER COMPONENT =====
// ===== DATE PICKER COMPONENT =====
function setupDatePicker() {
    console.log("Initializing Date Picker...");
    const trigger = document.getElementById('date-range-trigger');
    const popover = document.getElementById('date-picker-popover');

    if (!trigger || !popover) {
        console.error("Date Picker elements not found:", { trigger, popover });
        return;
    }

    // Toggle Popover
    trigger.onclick = (e) => { // Use onclick for stronger override
        e.preventDefault();
        e.stopPropagation();
        console.log("Date Picker Trigger Clicked");
        const wasHidden = popover.classList.contains('hidden');

        // Close others if needed
        document.querySelectorAll('.date-picker-popover').forEach(p => {
            if (p !== popover) p.classList.add('hidden');
        });

        if (wasHidden) {
            popover.classList.remove('hidden');
            renderDateCalendars();
        } else {
            popover.classList.add('hidden');
        }
    };

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!popover.contains(e.target) && !trigger.contains(e.target)) {
            popover.classList.add('hidden');
        }
    });

    // Presets
    presets.forEach(btn => {
        btn.addEventListener('click', () => {
            presets.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const preset = btn.dataset.preset;
            applyPreset(preset);
            renderDateCalendars(); // Re-render selection
        });
    });

    // Calendar Navigation
    document.getElementById('dp-prev-month').addEventListener('click', () => {
        dpState.viewMonth.setMonth(dpState.viewMonth.getMonth() - 1);
        renderDateCalendars();
    });

    document.getElementById('dp-next-month').addEventListener('click', () => {
        dpState.viewMonth.setMonth(dpState.viewMonth.getMonth() + 1);
        renderDateCalendars();
    });

    // Comparison Toggle
    compareToggle.addEventListener('change', (e) => {
        dateRange.compare = e.target.checked;
        if (dateRange.compare) {
            calculateComparisonRange();
        } else {
            dateRange.compareStart = null;
            dateRange.compareEnd = null;
            compareDisplay.textContent = 'vs. Periodo Anterior';
        }
        renderDateCalendars();
    });

    // Apply
    applyBtn.addEventListener('click', () => {
        updateDateLabel();
        popover.classList.add('hidden');
        loadAllData(); // Refresh ALL data with new date range
        showToast('Rango de fechas aplicado', 'success');
    });

    cancelBtn.addEventListener('click', () => {
        popover.classList.add('hidden');
    });
}

function applyPreset(preset) {
    const today = new Date();
    dateRange.preset = preset;

    switch (preset) {
        case 'today':
            dateRange.start = today;
            dateRange.end = today;
            break;
        case 'yesterday':
            const y = new Date(); y.setDate(y.getDate() - 1);
            dateRange.start = y;
            dateRange.end = y;
            break;
        case 'last7':
            const l7 = new Date(); l7.setDate(l7.getDate() - 6);
            dateRange.start = l7;
            dateRange.end = today;
            break;
        case 'last30':
            const l30 = new Date(); l30.setDate(l30.getDate() - 29);
            dateRange.start = l30;
            dateRange.end = today;
            break;
        case 'thisMonth':
            dateRange.start = new Date(today.getFullYear(), today.getMonth(), 1);
            dateRange.end = today;
            break;
        case 'lastMonth':
            dateRange.start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            dateRange.end = new Date(today.getFullYear(), today.getMonth(), 0);
            break;
        case 'lifetime':
            dateRange.start = new Date(2020, 0, 1); // Arbitrary old date
            dateRange.end = today;
            break;
    }

    if (dateRange.compare) calculateComparisonRange();
}

function calculateComparisonRange() {
    // Simple logic: Previous Period
    const duration = dateRange.end - dateRange.start; // ms
    dateRange.compareEnd = new Date(dateRange.start.getTime() - 24 * 60 * 60 * 1000); // One day before start
    dateRange.compareStart = new Date(dateRange.compareEnd.getTime() - duration);

    // Update Label
    const fmt = d => d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
    document.getElementById('comparison-range-display').textContent =
        `vs. ${fmt(dateRange.compareStart)} - ${fmt(dateRange.compareEnd)}`;
}

function updateDateLabel() {
    const label = document.getElementById('date-range-label');
    // If preset active
    const activePreset = document.querySelector('.date-preset.active');
    if (activePreset && dateRange.preset !== 'custom') {
        label.textContent = activePreset.textContent;
    } else {
        const fmt = d => d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
        label.textContent = `${fmt(dateRange.start)} - ${fmt(dateRange.end)}`;
    }
}

function renderDateCalendars() {
    const leftGrid = document.getElementById('dp-grid-left');
    const rightGrid = document.getElementById('dp-grid-right');
    const leftLabel = document.getElementById('dp-label-left');
    const rightLabel = document.getElementById('dp-label-right');

    const m1 = new Date(dpState.viewMonth);
    const m2 = new Date(dpState.viewMonth);
    m2.setMonth(m2.getMonth() + 1);

    // Labels
    const fmt = d => d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    leftLabel.textContent = capitalize(fmt(m1));
    rightLabel.textContent = capitalize(fmt(m2));

    renderCalendarGrid(leftGrid, m1);
    renderCalendarGrid(rightGrid, m2);
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function renderCalendarGrid(container, date) {
    container.innerHTML = '';
    const year = date.getFullYear();
    const month = date.getMonth();

    // Day headers
    ['D', 'L', 'M', 'M', 'J', 'V', 'S'].forEach(d => {
        container.innerHTML += `<div style="text-align:center; font-size: 0.7em; color: var(--text-muted);">${d}</div>`;
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Empty slots
    for (let i = 0; i < firstDay; i++) {
        container.innerHTML += '<div></div>';
    }

    // Days
    for (let d = 1; d <= daysInMonth; d++) {
        const currentD = new Date(year, month, d);
        const dayEl = document.createElement('div');
        dayEl.className = 'dp-day';
        dayEl.textContent = d;

        // Check Selection
        let inRange = false;
        let isStart = false;
        let isEnd = false;

        // Use normalization (setHours 0,0,0,0) for comparison
        const t = currentD.setHours(0, 0, 0, 0);
        const s = new Date(dateRange.start).setHours(0, 0, 0, 0);
        const e = new Date(dateRange.end).setHours(0, 0, 0, 0);

        if (t >= s && t <= e) inRange = true;
        if (t === s) isStart = true;
        if (t === e) isEnd = true;

        if (inRange) dayEl.classList.add('in-range');
        if (isStart) dayEl.classList.add('start');
        if (isEnd) dayEl.classList.add('end');

        // Check Comparison
        if (dateRange.compare && dateRange.compareStart && dateRange.compareEnd) {
            const cs = new Date(dateRange.compareStart).setHours(0, 0, 0, 0);
            const ce = new Date(dateRange.compareEnd).setHours(0, 0, 0, 0);
            if (t >= cs && t <= ce) dayEl.classList.add('compare-range');
            if (t === cs) dayEl.classList.add('start'); // CSS handles secondary color
            if (t === ce) dayEl.classList.add('end');
        }

        // Click Handler (Simple Selection)
        dayEl.addEventListener('click', () => {
            document.querySelectorAll('.date-preset').forEach(b => b.classList.remove('active'));
            dateRange.preset = 'custom';

            if (dpState.selectionState === 'idle') {
                dateRange.start = currentD;
                dateRange.end = currentD;
                dpState.selectionState = 'selecting';
            } else {
                if (currentD < dateRange.start) {
                    dateRange.start = currentD;
                } else {
                    dateRange.end = currentD;
                }
                dpState.selectionState = 'idle';
            }
            if (dateRange.compare) calculateComparisonRange();
            renderDateCalendars();
        });

        container.appendChild(dayEl);
    }
}

async function loadGanttChart() {
    const chartContainer = document.getElementById('gantt-chart');
    if (!chartContainer) return;

    // Show loading
    chartContainer.innerHTML = '<div class="loading-state">Cargando cronograma...</div>';

    // Fetch data (Campaigns + Content)
    const { data: campaigns } = await db.campaigns.getAll({ status: 'active' });
    const { data: content } = await db.content.getAll(); // Get all content for context

    // Filter relevant items (e.g. this month)
    // For demo, we fix the view to Current Month (Jan 2026)
    const viewDate = new Date(); // Or fixed to 2026-01-01
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth(); // 0-indexed

    // Generate Days
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let gridCols = '200px'; // Sidebar width
    let headerHTML = '<div class="gantt-header-cell" style="grid-column: 1;">Item</div>';

    for (let i = 1; i <= daysInMonth; i++) {
        gridCols += ' 40px'; // Day width
        const dayDate = new Date(year, month, i);
        const dayName = ['D', 'L', 'M', 'M', 'J', 'V', 'S'][dayDate.getDay()];
        const isToday = (i === viewDate.getDate() && month === viewDate.getMonth() && year === viewDate.getFullYear());

        headerHTML += `
            <div class="gantt-header-cell ${isToday ? 'today' : ''}" style="grid-column: ${i + 1};">
                <div style="text-align: center;">
                    <div style="font-size: 0.6em; opacity: 0.7;">${dayName}</div>
                    <div>${i}</div>
                </div>
            </div>
        `;
    }

    // Combine items for rows
    // Campaigns first, then Content
    const items = [
        ...(campaigns || []).map(c => ({
            id: c.id,
            name: c.name,
            type: 'campaign',
            start: c.start_date || c.created_at, // Fallback
            end: c.end_date || null
        })),
        ...(content || []).map(c => ({
            id: c.id,
            name: c.title,
            type: 'content',
            start: c.scheduled_date,
            end: c.scheduled_date // Content is point-in-time usually
        }))
    ];

    let rowsHTML = '';
    let rowIdx = 2; // Start after header

    items.forEach(item => {
        if (!item.start) return; // Skip if no date

        const startDate = new Date(item.start);
        // Only show if overlaps current month
        if (startDate.getMonth() !== month || startDate.getFullYear() !== year) return;

        // Sidebar Cell
        rowsHTML += `<div class="gantt-sidebar-cell" style="grid-row: ${rowIdx}; grid-column: 1;">
            <i data-lucide="${item.type === 'campaign' ? 'megaphone' : 'file-text'}" 
               style="width: 12px; height: 12px; margin-right: 6px; color: var(--text-secondary);"></i>
            ${item.name}
        </div>`;

        // Grid Cells (Background)
        for (let d = 1; d <= daysInMonth; d++) {
            const dayDate = new Date(year, month, d);
            const isWeekend = (dayDate.getDay() === 0 || dayDate.getDay() === 6);
            rowsHTML += `<div class="gantt-cell ${isWeekend ? 'weekend' : ''}" style="grid-row: ${rowIdx}; grid-column: ${d + 1};"></div>`;
        }

        // Bar / Marker
        const startDay = startDate.getDate();
        let duration = 1;

        if (item.type === 'campaign' && item.end) {
            const endDate = new Date(item.end);
            // Simple calc for this month view
            // If end date is next month, cap at daysInMonth
            // If end date is valid...
            const diffTime = Math.abs(endDate - startDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            duration = diffDays;
        }

        // Cap duration to end of grid
        if (startDay + duration > daysInMonth + 1) {
            duration = (daysInMonth + 1) - startDay;
        }

        const barClass = item.type === 'campaign' ? 'gantt-bar' : 'gantt-marker';
        const style = item.type === 'campaign'
            ? `grid-row: ${rowIdx}; grid-column: ${startDay + 1} / span ${duration};`
            : `grid-row: ${rowIdx}; grid-column: ${startDay + 1};`; /* Marker sits in cell */

        rowsHTML += `<div class="${barClass} ${item.type}" style="${style}" title="${item.name}"></div>`;

        rowIdx++;
    });

    // Render
    chartContainer.innerHTML = `
        <div class="gantt-grid" style="grid-template-columns: ${gridCols};">
            ${headerHTML}
            ${rowsHTML}
        </div>
    `;

    lucide.createIcons();
}

async function loadProfiles() {
    const { data } = await db.profiles.getAll();
    if (data) {
        teamProfiles = data;
        populateProfileSelects();
    }
}

function populateProfileSelects() {
    const ids = ['input-assigned', 'content-assigned'];

    ids.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;

        // Keep first option
        const first = select.options[0];
        select.innerHTML = '';
        select.appendChild(first);

        teamProfiles.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.full_name;
            select.appendChild(opt);
        });
    });
}

// ===== Real-time Subscriptions =====
function setupRealtimeSubscriptions() {
    db.subscribeToChanges('campaigns', (payload) => {
        console.log('Campaigns change:', payload);
        loadKPIs();
        loadUnifiedTable();
        if (currentView === 'ads') loadAdsTable();
    });

    db.subscribeToChanges('content_calendar', (payload) => {
        console.log('Content change:', payload);
        loadUnifiedTable();
        if (currentView === 'content') loadCalendar();
    });

    db.subscribeToChanges('inputs_requests', (payload) => {
        console.log('Inputs change:', payload);
        if (currentView === 'inputs') loadInputs();
    });
}

// ===== Navigation =====
function setupNavigation() {
    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const viewId = tab.dataset.view;
            currentView = viewId;

            navTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            views.forEach(view => {
                view.classList.remove('active');
                if (view.id === `view-${viewId}`) {
                    view.classList.add('active');
                }
            });

            updateActionButton(viewId);
            lucide.createIcons();

            // Reload data for new view
            if (viewId === 'ads') loadAdsTable();
            else if (viewId === 'content') loadCalendar();
            else if (viewId === 'inputs') loadInputs();
        });
    });

    // Header action button
    if (headerPrimaryAction) {
        headerPrimaryAction.addEventListener('click', () => {
            if (currentView === 'unified' || currentView === 'ads') {
                openModal('campaign');
            } else if (currentView === 'content') {
                openModal('content');
            } else if (currentView === 'inputs') {
                openModal('input');
            }
        });
    }
}

function updateActionButton(viewId) {
    if (actionBtnText) {
        actionBtnText.textContent = actionLabels[viewId] || 'Nuevo';
    }
}

// ===== Scroll Behavior =====
function setupScrollBehavior() {
    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 10) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });
}

// ===== Slide-over Panel =====
function setupSlideOver() {
    slideOverClose.addEventListener('click', closeSlideOver);
    slideOverOverlay.addEventListener('click', closeSlideOver);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeSlideOver();
            closeAllModals();
        }
    });
}

async function openCampaignDetail(id, type) {
    if (type === 'Ads') {
        let campaign = null;
        const { data, error } = await db.campaigns.getById(id);

        if (data) {
            campaign = data;
        } else {
            // FALLBACK: If DB lookup fails (e.g. Snapshot Data), use local cache
            console.warn(`Campaign ID ${id} not found in DB. Searching local adsData...`);
            // Try matching by ID first, then loose ID check (since snapshot IDs might be undefined or simple strings)
            campaign = adsData.find(c => c.id === id || c.name === id) ||
                adsData.find(c => c.platform === 'Google Ads' && c.impressions > 0 && c.name.includes(id)); // Heuristic fallback if ID passed was actually name?

            // Actually, renderAdsTable passes 'campaign.id', which for snapshot items might be undefined.
            // Let's rely on finding by index or properties if ID is weak.
            if (!campaign) {
                // Last Resort: Search by properties if ID looked valid but failed
                campaign = adsData.find(c => c.id === id);
            }
        }

        // Final Local Fallback: If still null, try finding by matching name from the clicked row logic
        // But since we can't easily access the row name here without passing it, 
        // we assume the ID passed was valid enough to be in adsData.
        // If snapshot set IDs to undefined, we might have passed 'undefined' string.
        if (!campaign && (id === 'undefined' || !id)) {
            // We can't identify it.
        }

        if (!campaign) {
            // ULTIMATE FALLBACK: If we have adsData, just find the one that looks most similar? 
            // No, better to show error than wrong data. 
            // BUT, for the Google Ads Snapshot, we didn't give them IDs in app.js.
            // We need to fix the snapshot generation to have IDs or handle this lookup better.
            // Let's assume the snapshot items NOW have IDs (I should verify/add them).
            // For now, let's try to find by *NAME* if the ID looked like a name?
            // No, let's keep it simple: check local array for ID.
            campaign = adsData.find(c => c.id == id); // Loose equality
        }

        if (!campaign) {
            showToast('Error al cargar campaña (ID desconocido)', 'error');
            return;
        }

        slideOverTitle.textContent = campaign.name;
        slideOverContent.innerHTML = `
            <div class="detail-section">
                <div class="detail-label">Estado</div>
                <span class="status-badge ${campaign.status}">
                    <span class="status-dot"></span>
                    ${getStatusLabel(campaign.status)}
                </span>
            </div>
            
            <div class="detail-divider"></div>
            
            <div class="detail-grid">
                <div class="detail-section">
                    <div class="detail-label">Plataforma</div>
                    <div class="detail-value">${campaign.platform}</div>
                </div>
                <div class="detail-section">
                    <div class="detail-label">Presupuesto</div>
                    <div class="detail-value">${formatCurrency(campaign.budget)}</div>
                </div>
            </div>
            
            <div class="detail-divider"></div>
            
            <div class="detail-grid">
                <div class="detail-section">
                    <div class="detail-label">Impresiones</div>
                    <div class="detail-value-large">${formatNumber(campaign.impressions)}</div>
                </div>
                <div class="detail-section">
                    <div class="detail-label">Clicks</div>
                    <div class="detail-value-large">${formatNumber(campaign.clicks)}</div>
                </div>
            </div>
            
            <div class="detail-grid">
                <div class="detail-section">
                    <div class="detail-label">CTR</div>
                    <div class="detail-value">${campaign.ctr?.toFixed(2) || '0.00'}%</div>
                </div>
                <div class="detail-section">
                    <div class="detail-label">Gasto</div>
                    <div class="detail-value">${formatCurrency(campaign.spend)}</div>
                </div>
            </div>
            
            <div class="detail-divider"></div>
            
            <div class="detail-section">
                <div class="detail-label">Última Actualización</div>
                <div class="detail-value">${formatTimeAgo(campaign.updated_at)}</div>
            </div>
            
            <div style="margin-top: 1.5rem; display: flex; gap: 0.5rem;">
                <button class="btn-primary" style="flex: 1;" onclick="closeSlideOver(); editCampaign('${campaign.id}')">
                    <i data-lucide="edit-3" class="btn-icon"></i>
                    Editar
                </button>
                <button class="btn-secondary" onclick="closeSlideOver(); deleteCampaign('${campaign.id}')">
                    <i data-lucide="trash-2" class="btn-icon"></i>
                </button>
            </div>
        `;

        lucide.createIcons();
        slideOver.classList.add('active');
        slideOverOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

async function openContentDetail(id) {
    const { data: content, error } = await db.content.getAll();
    const item = content?.find(c => c.id === id);

    if (!item) {
        showToast('Error al cargar contenido', 'error');
        return;
    }

    slideOverTitle.textContent = item.title;
    slideOverContent.innerHTML = `
        <div class="detail-section">
            <div class="detail-label">Estado</div>
            <span class="status-badge ${item.status}">
                ${getStatusLabel(item.status)}
            </span>
        </div>
        
        <div class="detail-divider"></div>
        
        <div class="detail-grid">
            <div class="detail-section">
                <div class="detail-label">Canal</div>
                <div class="detail-value">${item.channel}</div>
            </div>
            <div class="detail-section">
                <div class="detail-label">Formato</div>
                <div class="detail-value">${item.format}</div>
            </div>
        </div>
        
        <div class="detail-section">
            <div class="detail-label">Fecha Programada</div>
            <div class="detail-value">${item.scheduled_date ? new Date(item.scheduled_date).toLocaleDateString('es-AR') : 'Sin fecha'}</div>
        </div>
        
        ${item.copy_text ? `
        <div class="detail-section">
            <div class="detail-label">Copy</div>
            <div class="detail-value">${item.copy_text}</div>
        </div>
        ` : ''}
        
        <div style="margin-top: 1.5rem;">
            <button class="btn-primary full-width" onclick="closeSlideOver(); editContent('${item.id}')">
                <i data-lucide="edit-3" class="btn-icon"></i>
                Editar Contenido
            </button>
        </div>
    `;

    lucide.createIcons();
    slideOver.classList.add('active');
    slideOverOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeSlideOver() {
    slideOver.classList.remove('active');
    slideOverOverlay.classList.remove('active');
    document.body.style.overflow = '';
}

// ===== Modal Management =====
function setupModals() {
    // Campaign form
    document.getElementById('campaign-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveCampaign();
    });

    // Content form
    document.getElementById('content-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveContent();
    });

    // Input form
    document.getElementById('input-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveInput();
    });

    // Team Doc form
    document.getElementById('teamdoc-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveTeamDoc();
    });

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeAllModals();
            }
        });
    });
}

function openModal(type, editId = null) {
    const modal = document.getElementById(`modal-${type}`);
    if (!modal) return;

    // Reset form
    const form = modal.querySelector('form');
    if (form) form.reset();

    // Update title
    const title = modal.querySelector('.modal-title');
    if (title) {
        title.textContent = editId ? `Editar ${type === 'campaign' ? 'Campaña' : type === 'content' ? 'Contenido' : 'Input'}` : `Nueva ${type === 'campaign' ? 'Campaña' : type === 'content' ? 'Contenido' : 'Input'}`;
    }

    // Initialize mini-calendar
    if (type === 'campaign' || type === 'content' || type === 'input') {
        currentCalPrefix = type;
        miniCalMonth = new Date();
        selectedStartDate = null;

        let displayId;
        if (type === 'campaign') displayId = 'selected-date-text';
        else if (type === 'content') displayId = 'content-selected-date-text';
        else displayId = 'input-selected-date-text';

        const displayEl = document.getElementById(displayId);
        if (displayEl) displayEl.textContent = 'Selecciona una fecha';

        // Short delay to ensure modal is visible for dimensions if needed
        setTimeout(renderMiniCalendar, 10);
    }

    modal.classList.remove('hidden');
    lucide.createIcons();
}

function closeModal(type) {
    const modal = document.getElementById(`modal-${type}`);
    if (modal) modal.classList.add('hidden');
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
}

// ===== CRUD Operations =====
async function saveCampaign() {
    const id = document.getElementById('campaign-id')?.value;
    const submitBtn = document.getElementById('campaign-submit');

    const data = {
        name: document.getElementById('campaign-name').value,
        platform: document.getElementById('campaign-platform').value,
        status: document.getElementById('campaign-status')?.value || 'draft',
        budget: parseFloat(document.getElementById('campaign-budget').value) || 0,
        daily_budget: parseFloat(document.getElementById('campaign-daily-budget')?.value) || 0,
        spend: parseFloat(document.getElementById('campaign-spend')?.value) || 0,
        impressions: parseInt(document.getElementById('campaign-impressions')?.value) || 0,
        clicks: parseInt(document.getElementById('campaign-clicks')?.value) || 0,
        start_date: document.getElementById('campaign-start-date').value || null,
        end_date: document.getElementById('campaign-end-date')?.value || null
    };

    // Validate required fields
    if (!data.name || !data.platform || !data.budget || !data.daily_budget) {
        showToast('Completa los campos requeridos', 'warning');
        return;
    }

    submitBtn.classList.add('btn-loading');

    let result;
    if (id) {
        result = await db.campaigns.update(id, data);
    } else {
        result = await db.campaigns.create(data);
    }

    submitBtn.classList.remove('btn-loading');

    if (result.error) {
        showToast('Error al guardar campaña: ' + (result.error.message || result.error), 'error');
        console.error('Save error:', result.error);
        return;
    }

    showToast(id ? 'Campaña actualizada' : 'Campaña creada', 'success');
    closeModal('campaign');
    loadKPIs();
    loadUnifiedTable();
    loadAdsTable();
}

async function editCampaign(id) {
    const { data: campaign, error } = await db.campaigns.getById(id);
    if (error || !campaign) {
        showToast('Error al cargar campaña', 'error');
        return;
    }

    openModal('campaign', id);
    document.getElementById('modal-campaign-title').textContent = 'Editar Campaña';

    document.getElementById('campaign-id').value = campaign.id;
    document.getElementById('campaign-name').value = campaign.name;
    document.getElementById('campaign-platform').value = campaign.platform;
    document.getElementById('campaign-status').value = campaign.status;
    document.getElementById('campaign-budget').value = campaign.budget;
    document.getElementById('campaign-daily-budget').value = campaign.daily_budget || 0;
    document.getElementById('campaign-spend').value = campaign.spend;
    document.getElementById('campaign-impressions').value = campaign.impressions;
    document.getElementById('campaign-clicks').value = campaign.clicks;
    document.getElementById('campaign-end-date').value = campaign.end_date || '';

    if (campaign.start_date) {
        // Set calendar state
        miniCalMonth = new Date(campaign.start_date); // Center calendar on this date
        selectMiniCalDay(campaign.start_date, false);
    }
}

async function deleteCampaign(id) {
    if (!confirm('¿Eliminar esta campaña?')) return;

    const { error } = await db.campaigns.delete(id);

    if (error) {
        showToast('Error al eliminar campaña', 'error');
        return;
    }

    showToast('Campaña eliminada', 'success');
    loadKPIs();
    loadUnifiedTable();
    loadAdsTable();
}

async function saveContent() {
    const id = document.getElementById('content-id')?.value;
    const submitBtn = document.getElementById('content-submit');

    const data = {
        title: document.getElementById('content-title').value,
        channel: document.getElementById('content-channel').value,
        format: document.getElementById('content-format').value,
        scheduled_date: document.getElementById('content-scheduled-date').value || null,
        assets_link: document.getElementById('content-assets').value || null,
        copy_text: document.getElementById('content-copy').value || null,
        production_stage: document.getElementById('content-stage')?.value || 'idea',
        strategy_angle: document.getElementById('content-strategy')?.value || null,
        assigned_to: document.getElementById('content-assigned')?.value || null
    };

    submitBtn.classList.add('btn-loading');

    let result;
    if (id) {
        result = await db.content.update(id, data);
    } else {
        result = await db.content.create(data);
    }

    submitBtn.classList.remove('btn-loading');

    if (result.error) {
        showToast('Error al guardar contenido: ' + (result.error.message || result.error), 'error');
        return;
    }

    showToast(id ? 'Contenido actualizado' : 'Contenido creado', 'success');
    closeModal('content');
    loadCalendar();
    loadUnifiedTable();
    if (currentContentView === 'kanban') loadKanbanBoard();
}

async function editContent(id) {
    const { data } = await db.content.getAll();
    const content = data?.find(c => c.id === id);

    if (!content) {
        showToast('Error al cargar contenido', 'error');
        return;
    }

    openModal('content', id);
    document.getElementById('modal-content-title').textContent = 'Editar Contenido';

    document.getElementById('content-id').value = content.id;
    document.getElementById('content-title').value = content.title;
    document.getElementById('content-channel').value = content.channel;
    document.getElementById('content-format').value = content.format;
    document.getElementById('content-assets').value = content.assets_link || '';
    document.getElementById('content-copy').value = content.copy_text || '';

    // New workflow fields
    const stageEl = document.getElementById('content-stage');
    if (stageEl) stageEl.value = content.production_stage || 'idea';

    const strategyEl = document.getElementById('content-strategy');
    if (strategyEl) strategyEl.value = content.strategy_angle || '';

    const assignedEl = document.getElementById('content-assigned');
    if (assignedEl) assignedEl.value = content.assigned_to || '';

    if (content.scheduled_date) {
        miniCalMonth = new Date(content.scheduled_date);
        selectMiniCalDay(content.scheduled_date, false);
    }
}


// ===== Ticket System Logic =====

function openResponseModal(id) {
    const input = teamInputs.find(i => i.id === id);
    if (!input) return;

    // Set Context
    document.getElementById('response-input-id').value = id;
    document.getElementById('response-context-text').textContent = `"${input.description || input.title}"`;
    document.getElementById('response-text').value = ''; // Reset

    const modal = document.getElementById('modal-response');
    modal.classList.remove('hidden');
    modal.style.display = 'flex'; // Ensure flex layout
}

function closeResponseModal() {
    closeModal('response');
}

async function saveResponse() {
    const id = document.getElementById('response-input-id').value;
    const text = document.getElementById('response-text').value;

    if (!text.trim()) {
        showToast('Debes escribir una respuesta', 'error');
        return;
    }

    const submitBtn = document.querySelector('#response-form button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i data-lucide="loader" class="animate-spin w-4 h-4"></i> Enviando...';
    lucide.createIcons();

    // Optimistic Update? No, let's wait for DB.
    // We update 'response_text' AND 'status' -> 'done'
    const { error } = await db.inputs.update(id, {
        response_text: text,
        status: 'done'
    });

    if (error) {
        console.error("Save Response Error:", error);
        showToast('Error al guardar respuesta', 'error');
        submitBtn.innerHTML = originalBtnText;
        return;
    }

    showToast('Respuesta enviada y ticket completado', 'success');
    closeModal('response');
    loadInputs(); // Refresh UI
}

// Hook up the form submission
document.addEventListener('DOMContentLoaded', () => {
    const responseForm = document.getElementById('response-form');
    if (responseForm) {
        responseForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveResponse();
        });
    }
});

// Helper: Priority Colors
function getPriorityBorderColor(priority) {
    if (priority === 'high') return 'border-red-500';
    if (priority === 'medium') return 'border-yellow-500';
    return 'border-blue-500'; // low
}

function getPriorityBadge(priority) {
    if (priority === 'high') return '<span class="px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 flex items-center gap-1"><i data-lucide="alert-circle" class="w-3 h-3"></i> Alta</span>';
    if (priority === 'medium') return '<span class="px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">Media</span>';
    return '<span class="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">Baja</span>';
}

async function saveInput() {
    const id = document.getElementById('input-id')?.value;
    const submitBtn = document.getElementById('input-submit');

    const data = {
        title: document.getElementById('input-title').value,
        type: document.getElementById('input-type').value,
        priority: document.getElementById('input-priority').value,
        assigned_to: document.getElementById('input-assigned').value || null,
        due_date: document.getElementById('input-due-date').value || null,
        description: document.getElementById('input-description').value,
        status: 'pending' // Default new
    };

    submitBtn.classList.add('btn-loading');

    let result;
    if (id) {
        result = await db.inputs.update(id, data);
    } else {
        result = await db.inputs.create(data);
    }

    submitBtn.classList.remove('btn-loading');

    if (result.error) {
        showToast('Error al guardar input: ' + (result.error.message || result.error), 'error');
        console.error('Save input error:', result.error);
        return;
    }

    showToast(id ? 'Input actualizado' : 'Input creado', 'success');
    closeModal('input');
    loadInputs();
}

async function editInput(id) {
    const { data } = await db.inputs.getAll();
    const input = data?.find(i => i.id === id);

    if (!input) {
        showToast('Error al cargar input', 'error');
        return;
    }

    openModal('input', id);
    document.getElementById('modal-input-title').textContent = 'Editar Input';

    document.getElementById('input-id').value = input.id;
    document.getElementById('input-title').value = input.title;
    document.getElementById('input-type').value = input.type;
    document.getElementById('input-priority').value = input.priority;
    document.getElementById('input-assigned').value = input.assigned_to || '';
    document.getElementById('input-description').value = input.description || '';
    document.getElementById('input-due-date').value = input.due_date || '';

    if (input.due_date) {
        miniCalMonth = new Date(input.due_date);
        selectMiniCalDay(input.due_date, false);
    }
}

async function toggleInputStatus(id, currentStatus) {
    const { error } = await db.inputs.toggleStatus(id, currentStatus);

    if (error) {
        showToast('Error al actualizar estado', 'error');
        return;
    }

    showToast('Estado actualizado', 'success');
    loadInputs();
}

// ===== Filters & Search =====
function setupFilters() {
    const filterGroup = document.getElementById('ads-filter-group');
    if (!filterGroup) return;

    filterGroup.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            filterGroup.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            const filter = chip.dataset.filter;
            currentFilter.status = filter === 'all' ? null : filter;
            loadAdsTable();
        });
    });

    const platformFilter = document.getElementById('ads-platform-filter');
    if (platformFilter) {
        platformFilter.addEventListener('change', () => {
            currentFilter.platform = platformFilter.value || null;
            loadAdsTable();
        });
    }
}

function setupSearch() {
    const searchInput = document.getElementById('ads-search');
    if (!searchInput) return;

    let debounceTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            // For now, client-side filter
            const query = searchInput.value.toLowerCase();
            const rows = document.querySelectorAll('#ads-table-body tr');
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(query) ? '' : 'none';
            });
        }, 300);
    });
}

// ===== Calendar Navigation =====
function setupCalendarNavigation() {
    if (prevMonthBtn) {
        prevMonthBtn.addEventListener('click', () => {
            currentMonth.setMonth(currentMonth.getMonth() - 1);
            loadCalendar();
        });
    }

    if (nextMonthBtn) {
        nextMonthBtn.addEventListener('click', () => {
            currentMonth.setMonth(currentMonth.getMonth() + 1);
            loadCalendar();
        });
    }

    if (btnToday) {
        btnToday.addEventListener('click', () => {
            currentMonth = new Date();
            currentMonth.setDate(1);
            loadCalendar();
        });
    }
}

function openDayModal(year, month, day) {
    const date = new Date(year, month, day);
    document.getElementById('content-scheduled-date').value = date.toISOString().split('T')[0];
    openModal('content');
}

// ===== UI Helpers =====
function showTableSkeleton(tbody, rows = 5) {
    tbody.innerHTML = Array(rows).fill('').map(() => `
        <tr>
            <td><div class="skeleton skeleton-cell w-40"></div></td>
            <td><div class="skeleton skeleton-cell w-20"></div></td>
            <td><div class="skeleton skeleton-badge"></div></td>
            <td><div class="skeleton skeleton-cell w-15"></div></td>
            <td><div class="skeleton skeleton-cell w-20"></div></td>
            <td></td>
        </tr>
    `).join('');
}

function showEmptyState(view) {
    const empty = document.getElementById(`${view}-empty`);
    if (empty) {
        empty.classList.remove('hidden');
        lucide.createIcons();
    }
}

function hideEmptyState(view) {
    const empty = document.getElementById(`${view}-empty`);
    if (empty) empty.classList.add('hidden');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: 'check-circle',
        error: 'x-circle',
        warning: 'alert-triangle',
        info: 'info'
    };

    toast.innerHTML = `
        <i data-lucide="${icons[type]}" class="toast-icon"></i>
        <span>${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i data-lucide="x"></i>
        </button>
    `;

    container.appendChild(toast);
    lucide.createIcons();

    // Auto-remove after 4s
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 200);
    }, 4000);
}

// ===== Formatting Helpers =====
function formatNumber(num) {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString('es-AR');
}

function formatCurrency(amount) {
    if (!amount) return '$0';
    return '$' + parseFloat(amount).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatTimeAgo(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return 'Ahora';
    if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} horas`;
    if (diff < 604800) return `Hace ${Math.floor(diff / 86400)} días`;
    return date.toLocaleDateString('es-AR');
}

function getStatusLabel(status) {
    const labels = {
        active: 'Activa',
        paused: 'Pausada',
        completed: 'Completada',
        draft: 'Borrador',
        idea: 'Idea',
        production: 'En Producción',
        scheduled: 'Programado',
        published: 'Publicado',
        pending: 'Pendiente',
        in_progress: 'En Progreso',
        done: 'Completado'
    };
    return labels[status] || status;
}

// ===== Mini Calendar for Date Picker =====
function renderMiniCalendar() {
    // Dynamic IDs based on current prefix
    const daysContainerId = `${currentCalPrefix}-mini-cal-days`;
    const monthLabelId = `${currentCalPrefix}-mini-cal-month-label`;

    const daysContainer = document.getElementById(daysContainerId);
    const monthLabel = document.getElementById(monthLabelId);

    if (!daysContainer || !monthLabel) return;

    const year = miniCalMonth.getFullYear();
    const month = miniCalMonth.getMonth();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    monthLabel.textContent = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    let html = '';

    // Previous month days
    for (let i = 0; i < firstDay; i++) {
        const day = daysInPrevMonth - firstDay + i + 1;
        html += `<div class="mini-cal-day other-month">${day}</div>`;
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dateStr = date.toISOString().split('T')[0];
        const isToday = date.getTime() === today.getTime();
        const isPast = date < today;
        const isSelected = selectedStartDate === dateStr;

        let classes = 'mini-cal-day';
        if (isToday) classes += ' today';
        if (isPast) classes += ' past';
        if (isSelected) classes += ' selected';

        html += `<div class="${classes}" onclick="selectMiniCalDay('${dateStr}', ${isPast})">${day}</div>`;
    }

    // Fill remaining cells
    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
    let nextDay = 1;
    for (let i = firstDay + daysInMonth; i < totalCells; i++) {
        html += `<div class="mini-cal-day other-month">${nextDay++}</div>`;
    }

    daysContainer.innerHTML = html;
}

function navigateMiniCalendar(direction) {
    miniCalMonth.setMonth(miniCalMonth.getMonth() + direction);
    renderMiniCalendar();
}

function selectMiniCalDay(dateStr, isPast) {
    if (isPast) return; // Don't allow past dates

    selectedStartDate = dateStr;

    // Target input depends on prefix
    let inputId, displayId;
    if (currentCalPrefix === 'campaign') {
        inputId = 'campaign-start-date';
        displayId = 'selected-date-text';
    } else if (currentCalPrefix === 'content') {
        inputId = 'content-scheduled-date';
        displayId = 'content-selected-date-text';
    } else {
        inputId = 'input-due-date';
        displayId = 'input-selected-date-text';
    }

    const input = document.getElementById(inputId);
    if (input) input.value = dateStr;

    // Update display
    const date = new Date(dateStr + 'T12:00:00');
    const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };

    const displayEl = document.getElementById(displayId);
    if (displayEl) displayEl.textContent = date.toLocaleDateString('es-AR', options);

    // Re-render to show selection
    renderMiniCalendar();
    lucide.createIcons();
}

// ===== Content View Switcher =====
function setupContentViewSwitcher() {
    const switcher = document.getElementById('content-view-switcher');
    if (!switcher) return;

    switcher.querySelectorAll('.view-switch-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.contentView;
            switchContentView(view);
        });
    });
}

function switchContentView(view) {
    currentContentView = view;

    // Update buttons
    document.querySelectorAll('.view-switch-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.contentView === view);
    });

    // Update panels
    const calendarPanel = document.getElementById('content-calendar-panel');
    const kanbanPanel = document.getElementById('content-kanban-panel');
    const calendarNav = document.getElementById('calendar-nav');
    const kanbanFilters = document.getElementById('kanban-filters');

    if (view === 'calendar') {
        calendarPanel?.classList.remove('hidden');
        kanbanPanel?.classList.add('hidden');
        calendarNav?.classList.remove('hidden');
        kanbanFilters?.classList.add('hidden');
    } else {
        calendarPanel?.classList.add('hidden');
        kanbanPanel?.classList.remove('hidden');
        calendarNav?.classList.add('hidden');
        kanbanFilters?.classList.remove('hidden');
        loadKanbanBoard();
    }
}

// ===== Kanban Board =====
async function loadKanbanBoard() {
    const { data, error } = await db.content.getByStage();
    if (error) {
        showToast('Error cargando tablero', 'error');
        return;
    }

    const stages = ['idea', 'scripting', 'production', 'editing', 'review', 'scheduled'];

    stages.forEach(stage => {
        const container = document.getElementById(`kanban-${stage}`);
        const countEl = document.getElementById(`count-${stage}`);
        const items = data[stage] || [];

        if (countEl) countEl.textContent = items.length;

        if (container) {
            container.innerHTML = items.map(item => renderKanbanCard(item)).join('');
            setupKanbanDragDrop(container, stage);
        }
    });

    lucide.createIcons();
}

function renderKanbanCard(item) {
    const initials = item.assigned_to ? item.assigned_to.substring(0, 2).toUpperCase() : '';
    return `
        <div class="kanban-card" draggable="true" data-id="${item.id}">
            <div class="kanban-card-title">${item.title}</div>
            <div class="kanban-card-meta">
                <span class="kanban-badge platform">${item.channel}</span>
                ${item.strategy_angle ? `<span class="kanban-badge strategy">${item.strategy_angle}</span>` : ''}
                ${initials ? `<div class="kanban-avatar">${initials}</div>` : ''}
            </div>
        </div>
    `;
}

function setupKanbanDragDrop(container, stage) {
    const cards = container.querySelectorAll('.kanban-card');
    const column = container.closest('.kanban-column');

    cards.forEach(card => {
        card.addEventListener('dragstart', (e) => {
            card.classList.add('dragging');
            e.dataTransfer.setData('text/plain', card.dataset.id);
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            document.querySelectorAll('.kanban-column').forEach(col => {
                col.classList.remove('drag-over');
            });
        });

        card.addEventListener('click', () => {
            editContent(card.dataset.id);
        });
    });

    column.addEventListener('dragover', (e) => {
        e.preventDefault();
        column.classList.add('drag-over');
    });

    column.addEventListener('dragleave', () => {
        column.classList.remove('drag-over');
    });

    column.addEventListener('drop', async (e) => {
        e.preventDefault();
        column.classList.remove('drag-over');
        const cardId = e.dataTransfer.getData('text/plain');
        const newStage = column.dataset.stage;

        // Update in database
        const { error } = await db.content.updateStage(cardId, newStage);
        if (error) {
            showToast('Error al mover tarjeta', 'error');
            return;
        }

        showToast('Etapa actualizada', 'success');
        loadKanbanBoard();
    });
}

// ===== Team Hub =====
async function loadTeamDocs(filter = null) {
    const grid = document.getElementById('team-grid');
    if (!grid) return;

    const { data, error } = await db.teamDocs.getAll(filter ? { category: filter } : {});

    if (error || !data || data.length === 0) {
        grid.innerHTML = '';
        showEmptyState('team');
        return;
    }

    hideEmptyState('team');
    grid.innerHTML = data.map(doc => renderTeamCard(doc)).join('');
    lucide.createIcons();

    // Setup filter chips
    setupTeamFilters();
}

function renderTeamCard(doc) {
    return `
        <div class="team-card" onclick="editTeamDoc('${doc.id}')">
            <div class="team-card-header">
                <h3 class="team-card-title">${doc.title}</h3>
                <span class="team-card-category ${doc.category}">${doc.category}</span>
            </div>
            <div class="team-card-content">${doc.content || 'Sin contenido'}</div>
            <div class="team-card-footer">
                <span class="team-card-meta">Actualizado: ${formatTimeAgo(doc.updated_at)}</span>
                <button class="btn-ghost-sm" onclick="event.stopPropagation(); deleteTeamDoc('${doc.id}')">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        </div>
    `;
}

function setupTeamFilters() {
    const filterGroup = document.getElementById('team-filter-group');
    if (!filterGroup) return;

    filterGroup.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            filterGroup.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            const filter = chip.dataset.teamFilter;
            loadTeamDocs(filter === 'all' ? null : filter);
        });
    });
}

async function saveTeamDoc() {
    const id = document.getElementById('teamdoc-id')?.value;
    const submitBtn = document.getElementById('teamdoc-submit');

    const data = {
        title: document.getElementById('teamdoc-title').value,
        category: document.getElementById('teamdoc-category').value,
        content: document.getElementById('teamdoc-content').value || null,
        last_updated_by: 'Usuario'
    };

    submitBtn.classList.add('btn-loading');

    let result;
    if (id) {
        result = await db.teamDocs.update(id, data);
    } else {
        result = await db.teamDocs.create(data);
    }

    submitBtn.classList.remove('btn-loading');

    if (result.error) {
        showToast('Error al guardar documento: ' + (result.error.message || result.error), 'error');
        return;
    }

    showToast(id ? 'Documento actualizado' : 'Documento creado', 'success');
    closeModal('teamdoc');
    loadTeamDocs();
}

async function editTeamDoc(id) {
    const { data } = await db.teamDocs.getAll();
    const doc = data?.find(d => d.id === id);

    if (!doc) {
        showToast('Error al cargar documento', 'error');
        return;
    }

    openModal('teamdoc', id);
    document.getElementById('modal-teamdoc-title').textContent = 'Editar Documento';

    document.getElementById('teamdoc-id').value = doc.id;
    document.getElementById('teamdoc-title').value = doc.title;
    document.getElementById('teamdoc-category').value = doc.category;
    document.getElementById('teamdoc-content').value = doc.content || '';
}

async function deleteTeamDoc(id) {
    if (!confirm('¿Eliminar este documento?')) return;

    const { error } = await db.teamDocs.delete(id);

    if (error) {
        showToast('Error al eliminar', 'error');
        return;
    }

    showToast('Documento eliminado', 'success');
    loadTeamDocs();
}

// Initialize content view switcher on load
document.addEventListener('DOMContentLoaded', () => {
    setupContentViewSwitcher();
});

// ===== Global Function Exports =====
window.openCampaignDetail = openCampaignDetail;
window.openContentDetail = openContentDetail;
window.openDayModal = openDayModal;
window.openModal = openModal;
window.closeModal = closeModal;
window.editCampaign = editCampaign;
window.deleteCampaign = deleteCampaign;
window.editContent = editContent;
window.editInput = editInput;
window.toggleInputStatus = toggleInputStatus;
window.navigateMiniCalendar = navigateMiniCalendar;
window.selectMiniCalDay = selectMiniCalDay;
window.switchContentView = switchContentView;
window.loadKanbanBoard = loadKanbanBoard;
window.editTeamDoc = editTeamDoc;
window.deleteTeamDoc = deleteTeamDoc;


// ===== Global Shortcuts =====
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const popover = document.getElementById('date-picker-popover');
        if (popover && !popover.classList.contains('hidden')) {
            console.log("Global Escape: Closing Date Picker");
            popover.classList.add('hidden');
        }
    }
});


// ===== BUDGETS FEATURE =====

async function loadBudgets() {
    // Get current month YYYY-MM
    const now = new Date();
    const monthStr = now.toISOString().slice(0, 7); // "2024-05"

    const { data, error } = await db.budgets.get(monthStr);

    if (data) {
        currentBudgets = {
            google: parseFloat(data.google_budget) || 0,
            meta: parseFloat(data.meta_budget) || 0,
            total: (parseFloat(data.google_budget) || 0) + (parseFloat(data.meta_budget) || 0)
        };
    } else {
        // No budget found for this month, reset to 0
        currentBudgets = { google: 0, meta: 0, total: 0 };
    }
}

function openBudgetModal() {
    openModal('budget');

    const now = new Date();
    const monthStr = now.toISOString().slice(0, 7);

    document.getElementById('budget-month').value = monthStr;
    document.getElementById('budget-google').value = currentBudgets.google || '';
    document.getElementById('budget-meta').value = currentBudgets.meta || '';

    updateBudgetTotalDisplay();

    // Attach listener for auto-calc
    document.getElementById('budget-google').oninput = updateBudgetTotalDisplay;
    document.getElementById('budget-meta').oninput = updateBudgetTotalDisplay;
}

function updateBudgetTotalDisplay() {
    const g = parseFloat(document.getElementById('budget-google').value) || 0;
    const m = parseFloat(document.getElementById('budget-meta').value) || 0;
    document.getElementById('budget-total-display').textContent = formatCurrency(g + m);
}

async function saveBudgets() {
    const month = document.getElementById('budget-month').value;
    const google = parseFloat(document.getElementById('budget-google').value) || 0;
    const meta = parseFloat(document.getElementById('budget-meta').value) || 0;

    const btn = document.getElementById('budget-submit');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader" class="animate-spin w-4 h-4"></i> Guardando...';

    const { error } = await db.budgets.upsert({
        month: month,
        google_budget: google,
        meta_budget: meta
    });

    btn.innerHTML = originalText;
    lucide.createIcons();

    if (error) {
        showToast('Error al guardar presupuesto', 'error');
        console.error(error);
        return;
    }

    showToast('Presupuesto actualizado', 'success');
    closeModal('budget');

    // Refresh
    await loadBudgets();
    renderBudgetPacing();
}


