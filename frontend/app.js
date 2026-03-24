
const API_URL = 'http://127.0.0.1:8080';

// Format currency
const formatCurrency = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

document.addEventListener('DOMContentLoaded', () => {
    checkHealth();
    fetchMonthlySummary();
    fetchPatterns();
});

// 1. Check health
async function checkHealth() {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.getElementById('api-status-text');
    try {
        const res = await fetch(`${API_URL}/`);
        const data = await res.json();
        if (data.mem_brain === 'connected') {
            statusDot.classList.add('connected');
            statusText.innerText = 'Connected to Mem-Brain API';
        } else {
            statusText.innerText = 'Mem-Brain API Offline';
        }
    } catch (e) {
        statusText.innerText = 'Backend Offline';
    }
}

// 2. Fetch stats (hardcoded for 2026-01 as per repo mock data)
async function fetchMonthlySummary() {
    try {
        const res = await fetch(`${API_URL}/summary/2026-01`);
        if (!res.ok) return;
        const data = await res.json();

        // Ensure UI updates only with numbers
        let income = data.total_income || 0;
        let spent = data.total_spent || 0;
        let net = data.net || 0;

        // Animate numbers
        document.getElementById('stat-income').innerText = formatCurrency(income);
        document.getElementById('stat-spent').innerText = formatCurrency(spent);
        document.getElementById('stat-net').innerText = formatCurrency(net);
        document.getElementById('stat-count').innerText = data.transaction_count || '0';
    } catch (e) {
        console.error("Failed to load summary", e);
    }
}

// 3. Fetch Patterns
async function fetchPatterns() {
    const container = document.getElementById('patterns-content');
    container.innerHTML = '<div class="loader"><i class="fa-solid fa-spinner fa-spin"></i> Analyzing memory graph...</div>';

    try {
        const res = await fetch(`${API_URL}/patterns`);
        if (!res.ok) throw new Error("API Error");
        const data = await res.json();

        // Format markdown returned from the API
        let htmlContent = (data.insights || data).replace(/\n\n/g, '</p><p>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n- /g, '<br>• ');
        container.innerHTML = `<p>${htmlContent}</p>`;
    } catch (e) {
        container.innerHTML = '<div class="loader" style="color:var(--danger)">Failed to fetch deep insights. Is AI configured?</div>';
    }
}

// 4. Chat UI
function handleKeyPress(e) {
    if (e.key === 'Enter') sendMessage();
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    addMessage(text, 'user');
    input.value = '';

    // add loading bubble
    const loadingId = 'loading-' + Date.now();
    addMessage('<i class="fa-solid fa-ellipsis fa-fade"></i> HisaabAI is thinking...', 'bot loading', loadingId);

    try {
        const res = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: text, session_id: 'frontend_demo' })
        });
        const data = await res.json();

        // Remove loading 
        document.getElementById(loadingId).remove();

        // Add actual
        addMessage(data.answer, 'bot');
    } catch (e) {
        const loadEl = document.getElementById(loadingId);
        if(loadEl) loadEl.remove();
        addMessage('⚠️ Sorry, connection to backend failed: ' + e.message, 'bot');
    }
}

function addMessage(htmlContent, type, id = '') {
    const container = document.getElementById('chat-messages');

    // Basic markdown parse for chat
    let parsed = htmlContent.replace(/\n\n/g, '<br><br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    const div = document.createElement('div');
    div.className = `msg ${type} fade-in`;
    if (id) div.id = id;

    const icon = type.includes('user') ? 'fa-user' : 'fa-brain';

    div.innerHTML = `
        <div class="avatar"><i class="fa-solid ${icon}"></i></div>
        <div class="bubble">${parsed}</div>
    `;

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}
