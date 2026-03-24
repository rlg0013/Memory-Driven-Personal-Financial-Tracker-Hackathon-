const API_URL = 'http://127.0.0.1:8080';
const CATEGORY_COLORS = {
    food_delivery: '#ff6b6b', groceries: '#feca57', shopping: '#6c5ce7',
    entertainment: '#fd79a8', emi: '#00cec9', travel: '#e17055',
    fitness: '#00b894', utilities: '#0984e3', healthcare: '#a29bfe',
    income: '#55efc4', other: '#636e72',
};
const CATEGORY_ICONS = {
    food_delivery: '🍕', groceries: '🛒', shopping: '🛍️',
    entertainment: '🎬', emi: '🏦', travel: '✈️',
    fitness: '💪', utilities: '💡', healthcare: '🏥',
    income: '💰', other: '📦',
};

const formatCurrency = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

let chartInstances = {};
let allTransactions = [];

// ─── Navigation ───
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        const sectionId = 'section-' + link.dataset.section;
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.getElementById(sectionId).classList.add('active');
    });
});

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
    checkHealth();
    loadDashboard('2026-01');
    fetchPatterns();
    loadTransactions();
    loadInsightsCharts();
});

document.getElementById('month-select').addEventListener('change', (e) => { loadDashboard(e.target.value); });

// ─── Health ───
async function checkHealth() {
    const dot = document.querySelector('.status-dot');
    const text = document.getElementById('api-status-text');
    try {
        const res = await fetch(`${API_URL}/`);
        const data = await res.json();
        dot.classList.add('connected');
        text.innerText = data.mem_brain === 'connected' ? 'Mem-Brain Online' : 'API Connected';
    } catch (e) { text.innerText = 'Backend Offline'; }
}

// ─── Dashboard ───
async function loadDashboard(month) {
    try {
        const res = await fetch(`${API_URL}/summary/${month}`);
        if (!res.ok) return;
        const d = await res.json();

        document.getElementById('stat-income').innerText = formatCurrency(d.total_income || 0);
        document.getElementById('stat-spent').innerText = formatCurrency(d.total_spent || 0);
        document.getElementById('stat-net').innerText = formatCurrency(d.net || 0);
        document.getElementById('stat-count').innerText = d.transaction_count || '0';

        renderCategoryCharts(d.by_category || {});
        renderCategoryCards(d.by_category || {}, d.total_spent || 0);
    } catch (e) { console.error('Dashboard load error', e); }
}

function renderCategoryCharts(byCategory) {
    const labels = Object.keys(byCategory).map(k => k.replace('_', ' ').toUpperCase());
    const values = Object.values(byCategory);
    const colors = Object.keys(byCategory).map(k => CATEGORY_COLORS[k] || '#636e72');

    // Donut
    if (chartInstances.donut) chartInstances.donut.destroy();
    chartInstances.donut = new Chart(document.getElementById('categoryChart'), {
        type: 'doughnut',
        data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0, hoverOffset: 8 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: { position: 'right', labels: { color: '#8395a7', font: { size: 12 }, padding: 14, usePointStyle: true, pointStyleWidth: 10 } },
                tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${formatCurrency(ctx.raw)}` } }
            }
        }
    });

    // Bar
    if (chartInstances.bar) chartInstances.bar.destroy();
    chartInstances.bar = new Chart(document.getElementById('barChart'), {
        type: 'bar',
        data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 6, barThickness: 28 }] },
        options: {
            responsive: true, maintainAspectRatio: false, indexAxis: 'y',
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => formatCurrency(ctx.raw) } } },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8395a7', callback: v => '₹' + (v/1000) + 'k' } },
                y: { grid: { display: false }, ticks: { color: '#f1f2f6', font: { size: 12 } } }
            }
        }
    });
}

function renderCategoryCards(byCategory, totalSpent) {
    const container = document.getElementById('category-cards');
    if (Object.keys(byCategory).length === 0) {
        container.innerHTML = '<div class="loader">No category data yet.</div>';
        return;
    }
    container.innerHTML = Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, amt]) => {
            const pct = totalSpent > 0 ? (amt / totalSpent * 100).toFixed(1) : 0;
            const color = CATEGORY_COLORS[cat] || '#636e72';
            const icon = CATEGORY_ICONS[cat] || '📦';
            return `<div class="cat-card fade-in">
                <div class="cat-name">${icon} ${cat.replace('_', ' ')}</div>
                <div class="cat-amount" style="color:${color}">${formatCurrency(amt)}</div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${pct}% of spending</div>
                <div class="cat-bar"><div class="cat-bar-fill" style="width:${pct}%;background:${color}"></div></div>
            </div>`;
        }).join('');
}

// ─── Insights ───
async function fetchPatterns() {
    const container = document.getElementById('patterns-content');
    container.innerHTML = '<div class="loader"><i class="fa-solid fa-spinner fa-spin"></i> Analyzing memory graph...</div>';
    try {
        const res = await fetch(`${API_URL}/patterns`);
        if (!res.ok) throw new Error('API Error ' + res.status);
        const data = await res.json();
        let text = data.insights || JSON.stringify(data);
        let html = text.replace(/\n\n/g, '</p><p>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
        container.innerHTML = `<p>${html}</p>`;
    } catch (e) {
        container.innerHTML = `<div class="loader" style="color:var(--danger)">Failed to load insights: ${e.message}</div>`;
    }
}

async function loadInsightsCharts() {
    try {
        const [jan, feb] = await Promise.all([
            fetch(`${API_URL}/summary/2026-01`).then(r => r.json()),
            fetch(`${API_URL}/summary/2026-02`).then(r => r.json())
        ]);

        // Top spending
        const topContainer = document.getElementById('top-spending-content');
        const allCats = { ...(jan.by_category || {}), ...(feb.by_category || {}) };
        const sorted = Object.entries(allCats).sort((a, b) => b[1] - a[1]).slice(0, 5);
        topContainer.innerHTML = sorted.map(([cat, amt], i) => {
            const icon = CATEGORY_ICONS[cat] || '📦';
            const color = CATEGORY_COLORS[cat] || '#636e72';
            return `<div style="display:flex;align-items:center;gap:12px;padding:8px 0;${i < sorted.length - 1 ? 'border-bottom:1px solid var(--border)' : ''}">
                <span style="font-size:20px">${icon}</span>
                <span style="flex:1;color:var(--text-main);font-weight:500">${cat.replace('_', ' ').toUpperCase()}</span>
                <span style="color:${color};font-weight:700">${formatCurrency(amt)}</span>
            </div>`;
        }).join('');

        // Comparison bar chart
        const janCats = Object.keys(jan.by_category || {});
        const febCats = Object.keys(feb.by_category || {});
        const allLabels = [...new Set([...janCats, ...febCats])].map(k => k.replace('_', ' '));
        const allKeys = [...new Set([...janCats, ...febCats])];
        const janValues = allKeys.map(k => (jan.by_category || {})[k] || 0);
        const febValues = allKeys.map(k => (feb.by_category || {})[k] || 0);

        if (chartInstances.compare) chartInstances.compare.destroy();
        chartInstances.compare = new Chart(document.getElementById('compareChart'), {
            type: 'bar',
            data: {
                labels: allLabels.map(l => l.toUpperCase()),
                datasets: [
                    { label: 'Jan', data: janValues, backgroundColor: '#6c5ce7', borderRadius: 4, barThickness: 14 },
                    { label: 'Feb', data: febValues, backgroundColor: '#00cec9', borderRadius: 4, barThickness: 14 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#8395a7', font: { size: 11 } } }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${formatCurrency(ctx.raw)}` } } },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#8395a7', font: { size: 10 } } },
                    y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8395a7', callback: v => '₹' + (v/1000) + 'k' } }
                }
            }
        });

        // Timeline (spending by day)
        const allTx = await fetch(`${API_URL}/search`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'all transactions', k: 50 })
        }).then(r => r.json()).catch(() => ({ result: '' }));

        // Build timeline from local transaction data
        const dailySpend = {};
        allTransactions.forEach(tx => {
            if (tx.type === 'debit') {
                dailySpend[tx.date] = (dailySpend[tx.date] || 0) + tx.amount;
            }
        });
        const sortedDays = Object.keys(dailySpend).sort();
        if (chartInstances.timeline) chartInstances.timeline.destroy();
        if (sortedDays.length > 0) {
            chartInstances.timeline = new Chart(document.getElementById('timelineChart'), {
                type: 'line',
                data: {
                    labels: sortedDays.map(d => d.slice(5)),
                    datasets: [{
                        label: 'Daily Spend',
                        data: sortedDays.map(d => dailySpend[d]),
                        borderColor: '#6c5ce7', backgroundColor: 'rgba(108,92,231,0.1)',
                        fill: true, tension: 0.35, pointRadius: 5, pointBackgroundColor: '#6c5ce7',
                        pointBorderColor: '#181b23', pointBorderWidth: 2
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => formatCurrency(ctx.raw) } } },
                    scales: {
                        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8395a7', font: { size: 11 } } },
                        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8395a7', callback: v => '₹' + (v/1000) + 'k' } }
                    }
                }
            });
        }

    } catch (e) { console.error('Insights chart error', e); }
}

// ─── Transactions ───
async function loadTransactions() {
    try {
        // Fetch from the ingestion response stored in mock
        const [jan, feb] = await Promise.all([
            fetch(`${API_URL}/summary/2026-01`).then(r => r.json()),
            fetch(`${API_URL}/summary/2026-02`).then(r => r.json())
        ]);

        // We need the raw transactions - use the search endpoint
        const searchRes = await fetch(`${API_URL}/search`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'all transactions debit credit', k: 50 })
        });
        const searchData = await searchRes.json();

        // Parse transactions from search results
        const tbody = document.getElementById('transactions-body');
        const resultText = searchData.result || '';
        const lines = resultText.split('\n').filter(l => l.trim().startsWith('-'));

        if (lines.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="loader">No transactions found. Ingest SMS data first!</td></tr>';
            return;
        }

        // Parse each line: "- Debit of ₹450 at ZOMATO on 2026-01-03. Category: food_delivery."
        const txRows = [];
        lines.forEach(line => {
            const text = line.replace(/^-\s*/, '');
            const typeMatch = text.match(/^(Debit|Credit)/i);
            const amtMatch = text.match(/₹([\d,]+)/);
            const merchantMatch = text.match(/at\s+(.+?)\s+on/i);
            const dateMatch = text.match(/on\s+([\d-]+)/);
            const catMatch = text.match(/Category:\s*(\w+)/i);

            if (amtMatch) {
                const tx = {
                    type: typeMatch ? typeMatch[1].toLowerCase() : 'debit',
                    amount: parseFloat(amtMatch[1].replace(',', '')),
                    merchant: merchantMatch ? merchantMatch[1] : 'Unknown',
                    date: dateMatch ? dateMatch[1] : '—',
                    category: catMatch ? catMatch[1] : 'other'
                };
                txRows.push(tx);
                allTransactions.push(tx);
            }
        });

        txRows.sort((a, b) => b.date.localeCompare(a.date));

        tbody.innerHTML = txRows.map(tx => `
            <tr class="fade-in">
                <td>${tx.date}</td>
                <td><strong>${tx.merchant}</strong></td>
                <td><span class="badge badge-cat">${(CATEGORY_ICONS[tx.category] || '📦') + ' ' + tx.category.replace('_', ' ')}</span></td>
                <td><span class="badge badge-${tx.type}">${tx.type === 'credit' ? '↑ Credit' : '↓ Debit'}</span></td>
                <td style="font-weight:700;color:${tx.type === 'credit' ? 'var(--success)' : 'var(--danger)'}">
                    ${tx.type === 'credit' ? '+' : '-'}${formatCurrency(tx.amount)}
                </td>
            </tr>
        `).join('');

        // Now re-render timeline with parsed data
        loadInsightsCharts();

    } catch (e) {
        console.error('Transaction load error', e);
        document.getElementById('transactions-body').innerHTML = '<tr><td colspan="5" class="loader">Error loading transactions.</td></tr>';
    }
}

// ─── Chat ───
function handleKeyPress(e) { if (e.key === 'Enter') sendMessage(); }

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    addMessage(text, 'user');
    input.value = '';

    const loadingId = 'load-' + Date.now();
    addMessage('<i class="fa-solid fa-ellipsis fa-fade"></i> Thinking...', 'bot', loadingId);

    try {
        const res = await fetch(`${API_URL}/chat`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: text, session_id: 'frontend_demo' })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const el = document.getElementById(loadingId);
        if (el) el.remove();
        addMessage(data.answer || 'No response.', 'bot');
    } catch (e) {
        const el = document.getElementById(loadingId);
        if (el) el.remove();
        addMessage('⚠️ ' + e.message, 'bot');
    }
}

function addMessage(html, type, id = '') {
    const container = document.getElementById('chat-messages');
    let parsed = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    const div = document.createElement('div');
    div.className = `msg ${type} fade-in`;
    if (id) div.id = id;
    const icon = type.includes('user') ? 'fa-user' : 'fa-brain';
    div.innerHTML = `<div class="avatar"><i class="fa-solid ${icon}"></i></div><div class="bubble">${parsed}</div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}
