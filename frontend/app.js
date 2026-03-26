const API_URL = "http://127.0.0.1:8081";
const CATEGORY_COLORS = {
    food_delivery: "#d96c47",
    groceries: "#b18a32",
    shopping: "#256a5a",
    entertainment: "#9b5c7a",
    emi: "#4f7a72",
    travel: "#d1874a",
    fitness: "#4e9d78",
    utilities: "#567fa8",
    healthcare: "#8a6f9f",
    income: "#2c8c67",
    other: "#7c8a83",
};
const CATEGORY_ICONS = {
    food_delivery: "🍕",
    groceries: "🛒",
    shopping: "🛍️",
    entertainment: "🎬",
    emi: "🏦",
    travel: "✈️",
    fitness: "💪",
    utilities: "💡",
    healthcare: "🏥",
    income: "💰",
    other: "📦",
};
let chartInstances = {};
let allTransactions = [];
let memoryGraphData = null;
let selectedGraphNodeId = null;
let currentGraphFilter = "all";
let goalTrackerState = null;
let graphSimulation = null;

const formatCurrency = (value) =>
    new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
    }).format(value || 0);

const getThemeVar = (name, fallback) => {
    const value = getComputedStyle(document.body).getPropertyValue(name).trim();
    return value || fallback;
};

const getChartTheme = () => ({
    text: getThemeVar("--chart-text", "#dbe9df"),
    grid: getThemeVar("--chart-grid", "rgba(255, 255, 255, 0.08)"),
    border: getThemeVar("--chart-border", "#f4f6f0"),
});

function updateThemeToggle(theme) {
    const button = document.getElementById("theme-toggle");
    if (!button) {
        return;
    }

    const icon = button.querySelector(".theme-toggle-icon i");
    const isLight = theme === "light";

    if (icon) {
        icon.className = `fa-solid ${isLight ? "fa-sun" : "fa-moon"}`;
    }

    button.setAttribute("aria-label", isLight ? "Switch to dark mode" : "Switch to light mode");
    button.setAttribute("title", isLight ? "Switch to dark mode" : "Switch to light mode");
}

function refreshThemeDependentViews() {
    const month = document.getElementById("month-select")?.value || "2026-01";
    loadDashboard(month);
    loadInsightsCharts();
    if (memoryGraphData) {
        renderMemoryGraphExplorer();
    }
}

function applyTheme(theme, persist = true, rerender = true) {
    const nextTheme = theme === "light" ? "light" : "dark";
    document.body.dataset.theme = nextTheme;
    updateThemeToggle(nextTheme);

    if (persist) {
        localStorage.setItem("catmoney-theme", nextTheme);
    }
    if (rerender) {
        refreshThemeDependentViews();
    }
}

document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", (event) => {
        event.preventDefault();
        document.querySelectorAll(".nav-link").forEach((item) => item.classList.remove("active"));
        link.classList.add("active");

        const sectionId = `section-${link.dataset.section}`;
        document.querySelectorAll(".section").forEach((section) => section.classList.remove("active"));
        document.getElementById(sectionId).classList.add("active");
    });
});

document.addEventListener("DOMContentLoaded", () => {
    applyTheme(localStorage.getItem("catmoney-theme") || "dark", false, false);
    checkHealth();
    loadDashboard("2026-01");
    fetchPatterns();
    loadTransactions();
    loadInsightsCharts();
    loadMemoryGraphFeature();
    loadOverspendingFeature();
    loadGoalReasoningFeature();

    document.getElementById("month-select").addEventListener("change", (event) => {
        loadDashboard(event.target.value);
    });
    document.getElementById("theme-toggle").addEventListener("click", () => {
        const nextTheme = document.body.dataset.theme === "light" ? "dark" : "light";
        applyTheme(nextTheme);
    });
    document.getElementById("goal-reasoning-form").addEventListener("submit", submitGoalReasoningForm);
    document.getElementById("goal-tracker-reset").addEventListener("click", resetGoalTracker);
    document.querySelectorAll(".graph-filter").forEach((button) => {
        button.addEventListener("click", () => {
            document.querySelectorAll(".graph-filter").forEach((item) => item.classList.remove("active"));
            button.classList.add("active");
            currentGraphFilter = button.dataset.graphFilter;
            renderMemoryGraphExplorer();
        });
    });
});

async function checkHealth() {
    const dot = document.querySelector(".status-dot");
    const text = document.getElementById("api-status-text");

    try {
        const response = await fetch(`${API_URL}/`);
        const data = await response.json();
        dot.classList.add("connected");
        text.innerText = data.mem_brain === "connected" ? "Mem-Brain online" : "API connected";
    } catch {
        text.innerText = "Backend offline";
    }
}

async function loadDashboard(month) {
    try {
        const response = await fetch(`${API_URL}/summary/${month}`);
        if (!response.ok) {
            return;
        }

        const summary = await response.json();
        document.getElementById("stat-income").innerText = formatCurrency(summary.total_income);
        document.getElementById("stat-spent").innerText = formatCurrency(summary.total_spent);
        document.getElementById("stat-net").innerText = formatCurrency(summary.net);
        document.getElementById("stat-count").innerText = summary.transaction_count || "0";

        renderCategoryCharts(summary.by_category || {});
        renderCategoryCards(summary.by_category || {}, summary.total_spent || 0);
    } catch (error) {
        console.error("Dashboard load error", error);
    }
}

function renderCategoryCharts(byCategory) {
    const labels = Object.keys(byCategory).map((key) => prettify(key));
    const values = Object.values(byCategory);
    const colors = Object.keys(byCategory).map((key) => CATEGORY_COLORS[key] || CATEGORY_COLORS.other);
    const chartTheme = getChartTheme();

    if (chartInstances.donut) {
        chartInstances.donut.destroy();
    }

    chartInstances.donut = new Chart(document.getElementById("categoryChart"), {
        type: "doughnut",
        data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0, hoverOffset: 10 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "68%",
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { color: chartTheme.text, font: { size: 12, weight: "700" }, padding: 18, usePointStyle: true },
                },
                tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.raw)}` } },
            },
        },
    });

    if (chartInstances.bar) {
        chartInstances.bar.destroy();
    }

    chartInstances.bar = new Chart(document.getElementById("barChart"), {
        type: "bar",
        data: {
            labels,
            datasets: [{ data: values, backgroundColor: colors, borderRadius: 10, borderSkipped: false, barThickness: 22 }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: "y",
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => formatCurrency(ctx.raw) } },
            },
            scales: {
                x: {
                    grid: { color: chartTheme.grid },
                    ticks: { color: chartTheme.text, callback: (value) => `Rs ${Math.round(value / 1000)}k` },
                },
                y: {
                    grid: { display: false },
                    ticks: { color: chartTheme.border, font: { size: 12, weight: "700" } },
                },
            },
        },
    });
}

function renderCategoryCards(byCategory, totalSpent) {
    const container = document.getElementById("category-cards");
    const entries = Object.entries(byCategory);

    if (!entries.length) {
        container.innerHTML = '<div class="loader">No category data yet.</div>';
        return;
    }

    container.innerHTML = entries
        .sort((a, b) => b[1] - a[1])
        .map(([category, amount]) => {
            const percent = totalSpent > 0 ? ((amount / totalSpent) * 100).toFixed(1) : "0.0";
            const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.other;
            return `
                <div class="cat-card fade-in">
                    <div class="cat-name">${prettify(category)}</div>
                    <div class="cat-amount" style="color:${color}">${formatCurrency(amount)}</div>
                    <div class="cat-meta">${percent}% of total spending</div>
                    <div class="cat-bar"><div class="cat-bar-fill" style="width:${percent}%;background:${color}"></div></div>
                </div>
            `;
        })
        .join("");
}

async function fetchPatterns() {
    const container = document.getElementById("patterns-content");
    container.innerHTML = '<div class="loader"><i class="fa-solid fa-spinner fa-spin"></i> Analyzing memory graph...</div>';

    try {
        const response = await fetch(`${API_URL}/patterns`);
        if (!response.ok) {
            throw new Error(`API error ${response.status}`);
        }
        const data = await response.json();
        const rawText = data.insights || JSON.stringify(data);
        const html = rawText.replace(/\n\n/g, "</p><p>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
        container.innerHTML = `<p>${html}</p>`;
    } catch (error) {
        container.innerHTML = `<div class="loader" style="color:var(--danger)">Failed to load insights: ${error.message}</div>`;
    }
}

async function loadInsightsCharts() {
    try {
        const [jan, feb] = await Promise.all([
            fetch(`${API_URL}/summary/2026-01`).then((response) => response.json()),
            fetch(`${API_URL}/summary/2026-02`).then((response) => response.json()),
        ]);
        renderTopSpending(jan.by_category || {}, feb.by_category || {});
        renderComparisonChart(jan.by_category || {}, feb.by_category || {});
        renderTimelineChart();
    } catch (error) {
        console.error("Insights chart error", error);
    }
}

function renderTopSpending(janCategories, febCategories) {
    const topContainer = document.getElementById("top-spending-content");
    const combined = {};
    [janCategories, febCategories].forEach((group) => {
        Object.entries(group).forEach(([category, amount]) => {
            combined[category] = (combined[category] || 0) + amount;
        });
    });

    const sorted = Object.entries(combined).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!sorted.length) {
        topContainer.innerHTML = '<div class="loader">No spending categories found.</div>';
        return;
    }

    topContainer.innerHTML = sorted.map(([category, amount]) => `
        <div class="top-spending-row">
            <span>#</span>
            <span class="top-spending-name">${prettify(category)}</span>
            <span class="top-spending-amount" style="color:${CATEGORY_COLORS[category] || CATEGORY_COLORS.other}">
                ${formatCurrency(amount)}
            </span>
        </div>
    `).join("");
}

function renderComparisonChart(janCategories, febCategories) {
    const categoryKeys = [...new Set([...Object.keys(janCategories), ...Object.keys(febCategories)])];
    const labels = categoryKeys.map((key) => prettify(key));
    const janValues = categoryKeys.map((key) => janCategories[key] || 0);
    const febValues = categoryKeys.map((key) => febCategories[key] || 0);
    const chartTheme = getChartTheme();

    if (chartInstances.compare) {
        chartInstances.compare.destroy();
    }

    chartInstances.compare = new Chart(document.getElementById("compareChart"), {
        type: "bar",
        data: {
            labels,
            datasets: [
                { label: "January", data: janValues, backgroundColor: "rgba(31, 111, 95, 0.78)", borderRadius: 8, borderSkipped: false, barThickness: 16 },
                { label: "February", data: febValues, backgroundColor: "rgba(201, 108, 55, 0.82)", borderRadius: 8, borderSkipped: false, barThickness: 16 },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: chartTheme.text, font: { size: 11, weight: "700" } } },
                tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.raw)}` } },
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: chartTheme.text, font: { size: 10, weight: "700" } } },
                y: {
                    grid: { color: chartTheme.grid },
                    ticks: { color: chartTheme.text, callback: (value) => `Rs ${Math.round(value / 1000)}k` },
                },
            },
        },
    });
}

function renderTimelineChart() {
    const dailySpend = {};
    allTransactions.forEach((transaction) => {
        if (transaction.type === "debit") {
            dailySpend[transaction.date] = (dailySpend[transaction.date] || 0) + transaction.amount;
        }
    });

    const sortedDays = Object.keys(dailySpend).sort();
    if (chartInstances.timeline) {
        chartInstances.timeline.destroy();
    }
    if (!sortedDays.length) {
        return;
    }
    const chartTheme = getChartTheme();

    chartInstances.timeline = new Chart(document.getElementById("timelineChart"), {
        type: "line",
        data: {
            labels: sortedDays.map((day) => day.slice(5)),
            datasets: [{
                label: "Daily spend",
                data: sortedDays.map((day) => dailySpend[day]),
                borderColor: "#1f6f5f",
                backgroundColor: "rgba(31, 111, 95, 0.12)",
                fill: true,
                tension: 0.34,
                pointRadius: 4,
                pointHoverRadius: 5,
                pointBackgroundColor: "#c96c37",
                pointBorderWidth: 0,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => formatCurrency(ctx.raw) } } },
            scales: {
                x: { grid: { color: chartTheme.grid }, ticks: { color: chartTheme.text, font: { size: 11, weight: "700" } } },
                y: { grid: { color: chartTheme.grid }, ticks: { color: chartTheme.text, callback: (value) => `Rs ${Math.round(value / 1000)}k` } },
            },
        },
    });
}

async function loadTransactions() {
    try {
        allTransactions = [];
        const searchResponse = await fetch(`${API_URL}/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: "all transactions debit credit", k: 50 }),
        });
        const searchData = await searchResponse.json();
        const tbody = document.getElementById("transactions-body");
        const lines = (searchData.result || "").split("\n").filter((line) => line.trim().startsWith("-"));

        if (!lines.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="loader">No transactions found. Ingest SMS data first.</td></tr>';
            return;
        }

        const transactions = [];
        lines.forEach((line) => {
            const transaction = parseTransactionLine(line.replace(/^-\s*/, ""));
            if (transaction) {
                transactions.push(transaction);
                allTransactions.push(transaction);
            }
        });

        transactions.sort((a, b) => b.date.localeCompare(a.date));
        tbody.innerHTML = transactions.map((transaction) => `
            <tr class="fade-in">
                <td>${transaction.date}</td>
                <td><strong>${transaction.merchant}</strong></td>
                <td><span class="badge badge-cat">${prettify(transaction.category)}</span></td>
                <td><span class="badge badge-${transaction.type}">${transaction.type === "credit" ? "Credit" : "Debit"}</span></td>
                <td style="font-weight:800;color:${transaction.type === "credit" ? "var(--success)" : "var(--danger)"}">
                    ${transaction.type === "credit" ? "+" : "-"}${formatCurrency(transaction.amount)}
                </td>
            </tr>
        `).join("");

        renderTimelineChart();
    } catch (error) {
        console.error("Transaction load error", error);
        document.getElementById("transactions-body").innerHTML = '<tr><td colspan="5" class="loader">Error loading transactions.</td></tr>';
    }
}

function parseTransactionLine(text) {
    const typeMatch = text.match(/^(Debit|Credit)/i);
    const amountMatch = text.match(/(?:₹|â‚¹|Rs\.?|INR)?\s*([\d,]+(?:\.\d+)?)/i);
    const merchantMatch = text.match(/at\s+(.+?)\s+on/i);
    const dateMatch = text.match(/on\s+(\d{4}-\d{2}-\d{2})/i);
    const categoryMatch = text.match(/Category:\s*([\w_]+)/i);
    if (!amountMatch) {
        return null;
    }

    return {
        type: typeMatch ? typeMatch[1].toLowerCase() : "debit",
        amount: Number.parseFloat(amountMatch[1].replace(/,/g, "")),
        merchant: merchantMatch ? merchantMatch[1] : "Unknown",
        date: dateMatch ? dateMatch[1] : "--",
        category: categoryMatch ? categoryMatch[1].toLowerCase() : "other",
    };
}

async function loadMemoryGraphFeature() {
    try {
        const response = await fetch(`${API_URL}/memory-graph`);
        memoryGraphData = await response.json();
        selectedGraphNodeId = memoryGraphData.nodes?.[0]?.id || null;
        renderMemoryGraphSummary(memoryGraphData.summary || {});
        renderMemoryGraphExplorer();
    } catch (error) {
        document.getElementById("graph-summary").innerHTML = '<div class="loader">Failed to load graph summary.</div>';
        document.getElementById("memory-graph-board").innerHTML = '<div class="loader">Failed to load memory graph.</div>';
        document.getElementById("graph-node-detail").innerHTML = '<div class="loader">Failed to load relation detail.</div>';
    }
}

function renderMemoryGraphSummary(summary) {
    const container = document.getElementById("graph-summary");
    const items = [
        { label: "Total nodes", value: summary.total_nodes ?? 0 },
        { label: "Total edges", value: summary.total_edges ?? 0 },
        { label: "Transactions", value: summary.transaction_nodes ?? 0 },
        { label: "Categories", value: summary.categories ?? 0 },
        { label: "Top cluster", value: summary.top_cluster ?? "none" },
        { label: "Strongest relation", value: summary.strongest_relation ?? "none" },
    ];

    container.innerHTML = items.map((item) => `
        <article class="mini-stat-card fade-in">
            <p class="panel-label">${item.label}</p>
            <strong>${item.value}</strong>
        </article>
    `).join("");
}

function renderMemoryGraphExplorer() {
    if (!memoryGraphData) {
        return;
    }
    const adjacency = buildAdjacency(memoryGraphData.edges || []);
    const model = buildForceGraphModel(memoryGraphData, currentGraphFilter, selectedGraphNodeId);
    const board = document.getElementById("memory-graph-board");

    teardownForceGraph();

    if (!model.nodes.length) {
        board.innerHTML = `
            <div class="graph-empty-state fade-in">
                <strong>${model.emptyTitle}</strong>
                <p>${model.emptyMessage}</p>
            </div>
        `;
        document.getElementById("graph-node-detail").innerHTML = `<div class="loader">${model.emptyMessage}</div>`;
        return;
    }

    if (window.d3) {
        board.innerHTML = `
            <div class="graph-force-root fade-in">
                <div class="graph-force-toolbar">
                    <div class="graph-force-copy">
                        <p class="panel-label">Interactive memory map</p>
                        <span>Drag nodes, zoom the canvas, and click a memory to inspect its linked context.</span>
                    </div>
                    <div class="graph-force-legend">
                        ${renderGraphLegend(model.nodes)}
                    </div>
                </div>
                <svg class="graph-force-svg" aria-label="CatMoney memory graph"></svg>
            </div>
        `;
        renderForceGraph(board.querySelector(".graph-force-root"), model, adjacency);
    } else {
        const fallbackModel = buildLayeredGraphModel(memoryGraphData, currentGraphFilter, selectedGraphNodeId);
        board.innerHTML = renderLayeredGraph(fallbackModel, adjacency);

        document.querySelectorAll(".graph-orbit-node").forEach((node) => {
            node.addEventListener("click", () => {
                selectedGraphNodeId = node.dataset.nodeId;
                renderMemoryGraphExplorer();
            });
        });
    }

    renderGraphDetailPanel(adjacency);
}

function buildForceGraphModel(graphData, filter, selectedId) {
    const nodes = graphData.nodes || [];
    const edges = graphData.edges || [];
    const primaryIds = new Set(
        filter === "all"
            ? nodes.map((node) => node.id)
            : nodes.filter((node) => node.type === filter).map((node) => node.id),
    );

    if (filter !== "all" && primaryIds.size === 0) {
        const title = filter === "goal" ? "No goal memories yet" : `No ${prettify(filter)} memories yet`;
        const message = filter === "goal"
            ? "Store a goal from Goal Reasoning and it will appear here with its linked spending signals."
            : `There are no ${prettify(filter)} nodes in the current memory graph.`;
        return {
            nodes: [],
            edges: [],
            selectedId: null,
            emptyTitle: title,
            emptyMessage: message,
        };
    }

    const relevantEdges = filter === "all"
        ? edges
        : edges.filter((edge) => primaryIds.has(edge.source) || primaryIds.has(edge.target));

    const includedIds = new Set(filter === "all" ? nodes.map((node) => node.id) : [...primaryIds]);
    relevantEdges.forEach((edge) => {
        includedIds.add(edge.source);
        includedIds.add(edge.target);
    });

    const filteredNodes = nodes
        .filter((node) => includedIds.has(node.id))
        .map((node) => ({ ...node, primary: filter === "all" ? true : primaryIds.has(node.id) }));
    const filteredEdges = relevantEdges.filter((edge) => includedIds.has(edge.source) && includedIds.has(edge.target));
    const filteredAdjacency = buildAdjacency(filteredEdges);

    const nextSelected = includedIds.has(selectedId)
        ? selectedId
        : filteredNodes.find((node) => node.primary)?.id || filteredNodes[0]?.id || null;
    selectedGraphNodeId = nextSelected;

    const selectedNeighbors = new Set(filteredAdjacency[nextSelected] || []);
    const enhancedNodes = filteredNodes.map((node) => ({
        ...node,
        selected: node.id === nextSelected,
        connected: selectedNeighbors.has(node.id),
    }));

    return {
        nodes: enhancedNodes,
        edges: filteredEdges.map((edge) => ({ ...edge })),
        selectedId: nextSelected,
        adjacency: filteredAdjacency,
        filter,
        emptyTitle: "No graph data",
        emptyMessage: "There are no nodes available for this filter.",
    };
}

function renderGraphLegend(nodes) {
    const legendTypes = ["transaction", "category", "merchant", "month", "goal", "life_event"];
    const counts = nodes.reduce((map, node) => {
        map[node.type] = (map[node.type] || 0) + 1;
        return map;
    }, {});

    return legendTypes
        .filter((type) => counts[type])
        .map((type) => `
            <span class="graph-legend-chip">
                <i style="background:${getGraphNodeColor(type)}"></i>
                <span>${prettify(type)} (${counts[type]})</span>
            </span>
        `)
        .join("");
}

function renderForceGraph(root, model, adjacency) {
    const d3 = window.d3;
    if (!d3) {
        return;
    }

    const svgElement = root.querySelector(".graph-force-svg");
    const width = Math.max(root.clientWidth || 0, 900);
    const height = 580;
    const svg = d3
        .select(svgElement)
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    const viewport = svg.append("g").attr("class", "graph-force-viewport");
    const linkLayer = viewport.append("g").attr("class", "graph-force-links");
    const nodeLayer = viewport.append("g").attr("class", "graph-force-nodes");

    const nodes = model.nodes.map((node) => ({ ...node }));
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const links = model.edges
        .map((edge) => ({
            ...edge,
            source: nodeMap.get(edge.source),
            target: nodeMap.get(edge.target),
        }))
        .filter((edge) => edge.source && edge.target);

    const selectedId = model.selectedId;
    const selectedNeighbors = new Set(adjacency[selectedId] || []);

    const linkSelection = linkLayer
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("class", "graph-force-link")
        .attr("stroke", (edge) => getGraphLinkColor(edge, selectedId, selectedNeighbors))
        .attr("stroke-width", (edge) => (isGraphEdgeHighlighted(edge, selectedId, selectedNeighbors) ? 2.8 : 1.4))
        .attr("stroke-opacity", (edge) => (isGraphEdgeVisible(edge, selectedId, selectedNeighbors) ? 0.95 : 0.24));

    const nodeSelection = nodeLayer
        .selectAll("g")
        .data(nodes)
        .join("g")
        .attr("class", "graph-force-node")
        .style("cursor", "pointer")
        .on("click", (event, node) => {
            event.stopPropagation();
            selectedGraphNodeId = node.id;
            renderMemoryGraphExplorer();
        });

    nodeSelection
        .append("circle")
        .attr("class", "graph-force-halo")
        .attr("r", (node) => getGraphNodeRadius(node) + 8)
        .attr("fill", "none")
        .attr("stroke", getThemeVar("--graph-node-halo", "rgba(184, 255, 118, 0.22)"))
        .attr("stroke-width", (node) => (node.id === selectedId ? 3 : 0))
        .attr("stroke-opacity", (node) => (node.id === selectedId ? 1 : 0));

    nodeSelection
        .append("circle")
        .attr("class", "graph-force-core")
        .attr("r", (node) => getGraphNodeRadius(node))
        .attr("fill", (node) => getGraphNodeColor(node.type))
        .attr("fill-opacity", (node) => getGraphNodeOpacity(node, selectedId, selectedNeighbors))
        .attr("stroke", (node) => getGraphNodeStroke(node, selectedId, selectedNeighbors))
        .attr("stroke-width", (node) => (node.id === selectedId ? 2.4 : node.primary ? 1.6 : 1.1));

    nodeSelection
        .append("text")
        .attr("class", "graph-force-node-label")
        .attr("dy", (node) => getGraphNodeRadius(node) + 16)
        .attr("text-anchor", "middle")
        .attr("fill", getThemeVar("--graph-label", "#f4f6f0"))
        .attr("opacity", (node) => (shouldRenderGraphLabel(node, selectedId, selectedNeighbors) ? 1 : 0))
        .text((node) => truncate(node.label, node.type === "transaction" ? 16 : 20));

    nodeSelection.append("title").text((node) => `${node.label}\n${prettify(node.type)} memory`);

    graphSimulation = d3
        .forceSimulation(nodes)
        .force(
            "link",
            d3
                .forceLink(links)
                .id((node) => node.id)
                .distance((edge) => getGraphLinkDistance(edge))
                .strength((edge) => getGraphLinkStrength(edge)),
        )
        .force("charge", d3.forceManyBody().strength((node) => getGraphCharge(node)))
        .force("collide", d3.forceCollide().radius((node) => getGraphNodeRadius(node) + 12))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("x", d3.forceX((node) => getGraphClusterX(node, width)).strength(0.18))
        .force("y", d3.forceY((node) => getGraphClusterY(node, height)).strength(0.14))
        .alpha(0.9)
        .alphaDecay(0.06);

    const dragBehavior = d3
        .drag()
        .on("start", (event, node) => {
            if (!event.active) {
                graphSimulation.alphaTarget(0.18).restart();
            }
            node.fx = node.x;
            node.fy = node.y;
        })
        .on("drag", (event, node) => {
            node.fx = event.x;
            node.fy = event.y;
        })
        .on("end", (event, node) => {
            if (!event.active) {
                graphSimulation.alphaTarget(0);
            }
            node.fx = null;
            node.fy = null;
        });

    nodeSelection.call(dragBehavior);

    svg.call(
        d3.zoom().scaleExtent([0.65, 1.8]).on("zoom", (event) => {
            viewport.attr("transform", event.transform);
        }),
    );

    svg.on("dblclick.zoom", null);

    graphSimulation.on("tick", () => {
        linkSelection
            .attr("x1", (edge) => edge.source.x)
            .attr("y1", (edge) => edge.source.y)
            .attr("x2", (edge) => edge.target.x)
            .attr("y2", (edge) => edge.target.y);

        nodeSelection.attr("transform", (node) => `translate(${clamp(node.x, 32, width - 32)}, ${clamp(node.y, 56, height - 42)})`);
    });
}

function teardownForceGraph() {
    if (graphSimulation) {
        graphSimulation.stop();
        graphSimulation = null;
    }
}

function getGraphNodeRadius(node) {
    const sizeMap = {
        transaction: 10,
        category: 16,
        merchant: 14,
        month: 12,
        week: 11,
        goal: 17,
        life_event: 15,
        output: 15,
    };
    return sizeMap[node.type] || 12;
}

function getGraphCharge(node) {
    const chargeMap = {
        transaction: -150,
        category: -260,
        merchant: -220,
        month: -170,
        week: -150,
        goal: -290,
        life_event: -240,
        output: -220,
    };
    return chargeMap[node.type] || -180;
}

function getGraphClusterX(node, width) {
    const positions = {
        category: width * 0.22,
        merchant: width * 0.3,
        month: width * 0.54,
        week: width * 0.62,
        transaction: width * 0.5,
        goal: width * 0.78,
        life_event: width * 0.82,
        output: width * 0.84,
    };
    return positions[node.type] || width * 0.5;
}

function getGraphClusterY(node, height) {
    const amount = Number(node.meta?.amount || 0);
    if (node.type === "transaction") {
        const normalized = Math.min(1, amount / 10000);
        return height * (0.24 + normalized * 0.56);
    }
    if (node.type === "month") return height * 0.2;
    if (node.type === "week") return height * 0.34;
    if (node.type === "goal") return height * 0.3;
    if (node.type === "life_event") return height * 0.7;
    return height * 0.5;
}

function getGraphLinkDistance(edge) {
    const type = edge.type;
    if (type === "same_category") return 72;
    if (type === "same_merchant") return 68;
    if (type === "in_month") return 88;
    if (type === "in_week") return 78;
    if (type === "affects_goal") return 110;
    if (type === "occurred_near") return 104;
    return 96;
}

function getGraphLinkStrength(edge) {
    const type = edge.type;
    if (type === "same_category" || type === "same_merchant") return 0.8;
    if (type === "in_month" || type === "in_week") return 0.45;
    if (type === "affects_goal" || type === "occurred_near") return 0.7;
    return 0.55;
}

function getGraphNodeColor(type) {
    const fallback = {
        transaction: "#b8ff76",
        category: "#ff8fc5",
        merchant: "#8bd7ff",
        month: "#98a4ff",
        week: "#98a4ff",
        goal: "#f1cc6a",
        life_event: "#ffb27a",
        output: "#9fe8da",
    };
    return getThemeVar(`--graph-${type}`, fallback[type] || "#dbe9df");
}

function getGraphNodeStroke(node, selectedId, selectedNeighbors) {
    if (node.id === selectedId) {
        return getThemeVar("--graph-node-selected-stroke", "#fafff6");
    }
    if (selectedNeighbors.has(node.id)) {
        return getThemeVar("--graph-node-connected-stroke", "rgba(184, 255, 118, 0.46)");
    }
    return getThemeVar("--graph-node-stroke", "rgba(255, 255, 255, 0.22)");
}

function getGraphNodeOpacity(node, selectedId, selectedNeighbors) {
    if (!selectedId) {
        return node.primary ? 0.94 : 0.76;
    }
    if (node.id === selectedId || selectedNeighbors.has(node.id)) {
        return 1;
    }
    return node.primary ? 0.5 : 0.22;
}

function getGraphLinkColor(edge, selectedId, selectedNeighbors) {
    if (isGraphEdgeHighlighted(edge, selectedId, selectedNeighbors)) {
        return getThemeVar("--graph-link-highlight", "rgba(184, 255, 118, 0.62)");
    }
    return getThemeVar("--graph-link", "rgba(255, 255, 255, 0.16)");
}

function isGraphEdgeHighlighted(edge, selectedId, selectedNeighbors) {
    const sourceId = typeof edge.source === "object" ? edge.source.id : edge.source;
    const targetId = typeof edge.target === "object" ? edge.target.id : edge.target;
    return sourceId === selectedId || targetId === selectedId || (selectedNeighbors.has(sourceId) && selectedNeighbors.has(targetId));
}

function isGraphEdgeVisible(edge, selectedId, selectedNeighbors) {
    if (!selectedId) {
        return true;
    }
    const sourceId = typeof edge.source === "object" ? edge.source.id : edge.source;
    const targetId = typeof edge.target === "object" ? edge.target.id : edge.target;
    return sourceId === selectedId || targetId === selectedId || selectedNeighbors.has(sourceId) || selectedNeighbors.has(targetId);
}

function shouldRenderGraphLabel(node, selectedId, selectedNeighbors) {
    if (!selectedId) {
        return node.type !== "transaction";
    }
    if (node.id === selectedId || selectedNeighbors.has(node.id)) {
        return true;
    }
    return node.type !== "transaction" && node.primary;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function buildLayeredGraphModel(graphData, filter, selectedId) {
    const groups = graphData.relation_groups || {};
    const summary = graphData.summary || {};
    const allNodes = graphData.nodes || [];
    const categoryById = Object.fromEntries(allNodes.map((node) => [node.id, node]));
    const leftPool = [
        ...(groups.categories || []).slice(0, 3),
        ...(groups.merchants || []).slice(0, 2),
        ...(groups.time || []).slice(0, 2),
    ].filter((node) => filter === "all" || node.type === filter);

    const middlePool = (groups.transactions || []).slice(0, 4).filter((node) => filter === "all" || node.type === filter || filter === "transaction");

    const rightPool = [
        ...(groups.goals || []).slice(0, 2),
        ...(groups.life_events || []).slice(0, 2),
    ].filter((node) => filter === "all" || node.type === filter);

    const fallbackOutputs = [
        summary.top_cluster ? { id: "output:cluster", label: `Cluster: ${summary.top_cluster}`, type: "output" } : null,
        summary.strongest_relation ? { id: "output:relation", label: `Relation: ${summary.strongest_relation}`, type: "output" } : null,
        summary.top_recurring_merchant ? { id: "output:merchant", label: `Merchant: ${summary.top_recurring_merchant}`, type: "output" } : null,
    ].filter(Boolean);

    const leftNodes = leftPool.length ? leftPool : (groups.categories || []).slice(0, 4);
    const middleNodes = middlePool.length ? middlePool : (groups.transactions || []).slice(0, 4);
    const rightNodes = rightPool.length ? rightPool : fallbackOutputs;

    if (!selectedGraphNodeId && middleNodes[0]) {
        selectedGraphNodeId = middleNodes[0].id;
    }

    const selectedNode = selectedId || middleNodes[0]?.id || leftNodes[0]?.id || rightNodes[0]?.id || null;
    const edgeSet = new Set((graphData.edges || []).map((edge) => `${edge.source}->${edge.target}|${edge.type}`));
    const bridgeCategories = new Set(
        (graphData.edges || [])
            .filter((edge) => edge.type === "affects_goal")
            .map((edge) => edge.target),
    );

    const leftToMiddle = [];
    leftNodes.forEach((left) => {
        middleNodes.forEach((middle) => {
            const match = (graphData.edges || []).find((edge) =>
                (edge.source === middle.id && edge.target === left.id) ||
                (edge.target === middle.id && edge.source === left.id),
            );
            if (match) {
                leftToMiddle.push({ source: left.id, target: middle.id, type: match.type });
            }
        });
    });

    const middleToRight = [];
    middleNodes.forEach((middle) => {
        rightNodes.forEach((right) => {
            if (String(right.id).startsWith("output:")) {
                if (right.id === "output:cluster" && middle.meta?.category && prettify(middle.meta.category) === summary.top_cluster) {
                    middleToRight.push({ source: middle.id, target: right.id, type: "cluster_output" });
                } else if (right.id === "output:merchant" && middle.meta?.merchant && prettify(middle.meta.merchant) === summary.top_recurring_merchant) {
                    middleToRight.push({ source: middle.id, target: right.id, type: "merchant_output" });
                } else if (right.id === "output:relation") {
                    middleToRight.push({ source: middle.id, target: right.id, type: "relation_output" });
                }
                return;
            }

            const directEvent = (graphData.edges || []).find((edge) =>
                ((edge.source === right.id && edge.target === middle.id) || (edge.target === right.id && edge.source === middle.id)) &&
                edge.type === "occurred_near",
            );
            if (directEvent) {
                middleToRight.push({ source: middle.id, target: right.id, type: directEvent.type });
                return;
            }

            if (right.type === "goal" && middle.meta?.category) {
                const categoryNodeId = `category:${middle.meta.category}`;
                if (bridgeCategories.has(categoryNodeId)) {
                    middleToRight.push({ source: middle.id, target: right.id, type: "affects_goal" });
                }
            }
        });
    });

    return {
        selectedNode,
        leftNodes,
        middleNodes,
        rightNodes,
        leftToMiddle,
        middleToRight,
        nodeMap: categoryById,
    };
}

function renderLayeredGraph(model, adjacency) {
    const width = 940;
    const height = 540;
    const columnX = { left: 120, middle: 470, right: 820 };
    const positions = {};
    const nodeHalfWidth = 75;
    const topOffset = 110;
    const usableHeight = height - 150;
    const maxRows = Math.max(model.leftNodes.length, model.middleNodes.length, model.rightNodes.length, 1);
    const slotY = Array.from({ length: maxRows }, (_, index) => {
        if (maxRows === 1) return topOffset + usableHeight / 2;
        return topOffset + (index * usableHeight) / (maxRows - 1);
    });

    const placeNodes = (nodes, x) => {
        nodes.forEach((node, index) => {
            const slotIndex = nodes.length === 1
                ? Math.floor((maxRows - 1) / 2)
                : Math.round((index * (maxRows - 1)) / (nodes.length - 1));
            positions[node.id] = { x, y: slotY[slotIndex] };
        });
    };

    placeNodes(model.leftNodes, columnX.left);
    placeNodes(model.middleNodes, columnX.middle);
    placeNodes(model.rightNodes, columnX.right);

    const displayAdjacency = {};
    [...model.leftToMiddle, ...model.middleToRight].forEach((edge) => {
        displayAdjacency[edge.source] = displayAdjacency[edge.source] || [];
        displayAdjacency[edge.target] = displayAdjacency[edge.target] || [];
        displayAdjacency[edge.source].push(edge.target);
        displayAdjacency[edge.target].push(edge.source);
    });

    const selectedNeighbors = new Set(displayAdjacency[model.selectedNode] || []);
    const connectors = [...model.leftToMiddle, ...model.middleToRight].map((edge) => {
        const from = positions[edge.source];
        const to = positions[edge.target];
        if (!from || !to) return "";
        const active = edge.source === model.selectedNode || edge.target === model.selectedNode;
        const highlighted = selectedNeighbors.has(edge.source) || selectedNeighbors.has(edge.target) || active;
        return `<line x1="${from.x + nodeHalfWidth}" y1="${from.y}" x2="${to.x - nodeHalfWidth}" y2="${to.y}" class="graph-connector ${highlighted ? "highlighted" : ""}" />`;
    }).join("");

    const renderNodes = (nodes, stage) => nodes.map((node) => {
        const position = positions[node.id];
        const relationCount = (displayAdjacency[node.id] || []).length;
        const selected = node.id === model.selectedNode;
        const connected = selectedNeighbors.has(node.id);
        const classes = ["graph-orbit-node", `graph-orbit-node-${node.type || stage}`];
        if (selected) classes.push("selected");
        if (connected) classes.push("connected");

        return `
            <button
                type="button"
                class="${classes.join(" ")}"
                data-node-id="${node.id}"
                style="left:${position.x}px; top:${position.y}px;"
            >
                <span class="graph-orbit-core"></span>
                <span class="graph-orbit-label">${truncate(node.label, 28)}</span>
                <span class="graph-orbit-meta">${relationCount} links</span>
            </button>
        `;
    }).join("");

    return `
        <div
            class="graph-stage-board fade-in"
            style="--graph-width:${width}px; --graph-height:${height}px; --graph-left-x:${columnX.left}px; --graph-middle-x:${columnX.middle}px; --graph-right-x:${columnX.right}px;"
        >
            <div class="graph-stage-label graph-stage-left">Input</div>
            <div class="graph-stage-label graph-stage-middle">Linked Memories</div>
            <div class="graph-stage-label graph-stage-right">Output</div>
            <svg class="graph-stage-svg" width="${width}" height="${height}">
                ${connectors}
            </svg>
            ${renderNodes(model.leftNodes, "left")}
            ${renderNodes(model.middleNodes, "middle")}
            ${renderNodes(model.rightNodes, "right")}
        </div>
    `;
}

function renderGraphDetailPanel(adjacency) {
    const detail = document.getElementById("graph-node-detail");
    const node = (memoryGraphData.nodes || []).find((item) => item.id === selectedGraphNodeId);
    if (!node) {
        detail.innerHTML = '<div class="loader">Select a node to inspect its relations.</div>';
        return;
    }

    const connectedEdges = (memoryGraphData.edges || []).filter((edge) => edge.source === node.id || edge.target === node.id);
    const relatedByType = groupEdgesByType(node.id, connectedEdges, memoryGraphData.nodes || []);
    const strongestConnections = (memoryGraphData.connection_strength || []).slice(0, 5);

    detail.innerHTML = `
        <article class="stack-card fade-in">
            <strong>${node.label}</strong>
            <p>${prettify(node.type)} memory</p>
        </article>
        ${Object.entries(relatedByType).map(([type, items]) => `
            <article class="stack-card fade-in">
                <strong>${prettify(type)}</strong>
                <p>${items.map((item) => truncate(item.label, 38)).join(", ") || "No linked nodes"}</p>
            </article>
        `).join("")}
        <article class="stack-card fade-in">
            <strong>Strong recurring links</strong>
            <p>${strongestConnections.map((item) => `${prettifyGraphRef(item.source)} -> ${prettifyGraphRef(item.target)} (${item.weight})`).join("<br>")}</p>
        </article>
    `;
}

function buildAdjacency(edges) {
    const adjacency = {};
    edges.forEach((edge) => {
        adjacency[edge.source] = adjacency[edge.source] || [];
        adjacency[edge.target] = adjacency[edge.target] || [];
        adjacency[edge.source].push(edge.target);
        adjacency[edge.target].push(edge.source);
    });
    return adjacency;
}

function groupEdgesByType(nodeId, edges, nodes) {
    const nodeMap = Object.fromEntries(nodes.map((node) => [node.id, node]));
    const grouped = {};
    edges.forEach((edge) => {
        const otherId = edge.source === nodeId ? edge.target : edge.source;
        const otherNode = nodeMap[otherId];
        if (!otherNode) {
            return;
        }
        grouped[edge.type] = grouped[edge.type] || [];
        grouped[edge.type].push(otherNode);
    });
    return grouped;
}

async function loadOverspendingFeature() {
    try {
        const response = await fetch(`${API_URL}/overspending`);
        const data = await response.json();

        document.getElementById("overspending-summary").innerHTML = `<p>${data.summary || "No overspending summary available."}</p>`;
        document.getElementById("overspending-drivers").innerHTML = renderStackList(
            (data.drivers || []).map((driver) => ({ title: `${driver.title} - ${driver.severity}`, detail: driver.detail })),
        );
        document.getElementById("overspending-recommendations").innerHTML = renderStackList(data.recommendations || []);
        document.getElementById("overspending-categories").innerHTML = renderStackList(
            (data.top_categories || []).map((item) => ({
                title: `${prettify(item.category)} - ${formatCurrency(item.amount)}`,
                detail: `${item.count} memories in this category`,
            })),
        );
        document.getElementById("overspending-merchants").innerHTML = renderStackList(
            (data.top_merchants || []).map((item) => ({
                title: `${prettify(item.merchant)} - ${formatCurrency(item.amount)}`,
                detail: `Seen in ${item.count} memories`,
            })),
        );
        document.getElementById("overspending-behavior-split").innerHTML = renderStackList(
            (data.behavior_split || []).map((item) => ({ title: item.label, detail: `${item.share}% of debit spend` })),
        );
        document.getElementById("overspending-timing").innerHTML = renderStackList(
            (data.timing_breakdown || []).map((item) => ({ title: item.label, detail: `${item.share}% of debit spend` })),
        );
    } catch {
        document.getElementById("overspending-summary").innerHTML = '<div class="loader">Failed to load overspending analysis.</div>';
    }
}

async function loadGoalReasoningFeature(payload = {}) {
    try {
        const response = await fetch(`${API_URL}/goal/reasoning`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        renderGoalReasoning(data);
    } catch {
        document.getElementById("goal-summary").innerHTML = '<div class="loader">Failed to load goal reasoning.</div>';
    }
}

async function submitGoalReasoningForm(event) {
    event.preventDefault();
    const goalText = document.getElementById("goal-text-input").value.trim();
    const targetAmount = document.getElementById("goal-target-input").value.trim();
    const deadline = document.getElementById("goal-deadline-input").value;

    const payload = {};
    if (goalText) payload.goal_text = goalText;
    if (targetAmount) payload.target_amount = Number(targetAmount);
    if (deadline) payload.deadline = deadline;

    await loadGoalReasoningFeature(payload);
}

function renderGoalReasoning(data) {
    const goal = data.goal || {};
    const summary = data.summary || {};

    document.getElementById("goal-summary").innerHTML = [
        { label: "Goal", value: goal.goal_text || "Unknown goal" },
        { label: "Target", value: formatCurrency(goal.target_amount || 0) },
        { label: "Feasibility", value: goal.feasibility || "Unknown" },
        { label: "Weeks left", value: goal.weeks_left || 0 },
        { label: "Weekly target", value: formatCurrency(goal.weekly_target || 0) },
        { label: "Confidence", value: `${summary.confidence || 0}%` },
    ].map((item) => `
        <article class="mini-stat-card fade-in">
            <p class="panel-label">${item.label}</p>
            <strong>${item.value}</strong>
        </article>
    `).join("");

    document.getElementById("goal-plan").innerHTML = renderStackList(
        (data.plan_steps || []).map((detail, index) => ({ title: `Step ${index + 1}`, detail })),
    );
    document.getElementById("goal-pressure-points").innerHTML = renderStackList(data.pressure_points || []);
    document.getElementById("goal-conflicts").innerHTML = renderStackList(
        (data.conflict_categories || []).map((item) => ({
            title: `${prettify(item.category)} - ${formatCurrency(item.amount)}/month`,
            detail: `${item.reason} Suggested cut: ${formatCurrency(item.suggested_cut)}.`,
        })),
    );
    document.getElementById("goal-linked-transactions").innerHTML = renderStackList(
        (data.linked_transactions || []).map((item) => ({
            title: `${prettify(item.merchant)} - ${formatCurrency(item.amount)}`,
            detail: `${prettify(item.category)} on ${item.date} - ${prettify(item.behavior_class)}`,
        })),
    );

    initializeGoalTracker(goal, summary);
}

function initializeGoalTracker(goal, summary) {
    const baseState = buildGoalTrackerState(goal, summary);
    if (!baseState) {
        goalTrackerState = null;
        document.getElementById("goal-tracker-summary").innerHTML = '<div class="loader">Tracker is unavailable for this goal.</div>';
        document.getElementById("goal-tracker-advice").innerHTML = '<div class="loader">Recovery advice is unavailable for this goal.</div>';
        document.getElementById("goal-tracker-list").innerHTML = '<div class="loader">Tracker is unavailable for this goal.</div>';
        return;
    }

    const stored = localStorage.getItem(baseState.storageKey);
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            goalTrackerState = {
                ...baseState,
                ...parsed,
                storageKey: baseState.storageKey,
                checkpoints: (parsed.checkpoints || baseState.checkpoints).map((checkpoint, index) => ({
                    ...baseState.checkpoints[index],
                    ...checkpoint,
                })),
            };
        } catch {
            goalTrackerState = baseState;
        }
    } else {
        goalTrackerState = baseState;
    }

    recalculateGoalTracker(goalTrackerState);
    persistGoalTrackerState();
    renderGoalTracker();
}

function buildGoalTrackerState(goal, summary) {
    const targetAmount = Number(goal.target_amount || 0);
    if (!targetAmount) {
        return null;
    }

    const now = new Date();
    const deadline = goal.deadline ? new Date(`${goal.deadline}T00:00:00`) : null;
    const hasValidDeadline = deadline instanceof Date && !Number.isNaN(deadline.getTime());
    const daysLeft = hasValidDeadline
        ? Math.max(1, Math.ceil((deadline - now) / 86400000))
        : Math.max(1, (Number(goal.weeks_left) || 6) * 7);

    let cadence = "weekly";
    let checkpointCount = Math.max(1, Number(goal.weeks_left) || 6);

    if (daysLeft <= 21) {
        cadence = "daily";
        checkpointCount = daysLeft;
    } else if (daysLeft > 120) {
        cadence = "monthly";
        checkpointCount = Math.max(1, Math.ceil(daysLeft / 30));
    }

    const originalTargets = distributeTrackerAmount(targetAmount, checkpointCount);
    const checkpoints = [];
    let cursor = new Date(now);

    for (let index = 0; index < checkpointCount; index += 1) {
        if (cadence === "daily") {
            cursor = addDays(now, index + 1);
        } else if (cadence === "weekly") {
            cursor = addDays(now, (index + 1) * 7);
        } else {
            cursor = addMonths(now, index + 1);
        }

        const dueDate = hasValidDeadline && index === checkpointCount - 1 ? deadline : cursor;
        checkpoints.push({
            id: `checkpoint-${index + 1}`,
            label: `${prettify(cadence)} ${index + 1}`,
            dueDate: dueDate.toISOString(),
            originalTarget: originalTargets[index],
            revisedTarget: originalTargets[index],
            savedAmount: 0,
            status: "pending",
        });
    }

    return {
        storageKey: getGoalTrackerStorageKey(goal),
        goalText: goal.goal_text || "Goal",
        targetAmount,
        cadence,
        suggestedWeeklySavings: Number(summary.suggested_weekly_savings || 0),
        recoveryAdvice: "",
        adviceKey: "",
        checkpoints,
    };
}

function getGoalTrackerStorageKey(goal) {
    return `catmoney-goal-tracker:${[goal.goal_text || "goal", goal.target_amount || 0, goal.deadline || goal.weeks_left || 0].join("|")}`;
}

function distributeTrackerAmount(totalAmount, count) {
    if (!count) {
        return [];
    }
    const base = Math.floor(totalAmount / count);
    let remainder = Math.round(totalAmount - base * count);
    return Array.from({ length: count }, (_, index) => {
        const bonus = remainder > 0 ? 1 : 0;
        remainder -= bonus;
        return base + bonus;
    });
}

function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function addMonths(date, months) {
    const next = new Date(date);
    next.setMonth(next.getMonth() + months);
    return next;
}

function recalculateGoalTracker(state) {
    const completedAmount = state.checkpoints.reduce((sum, checkpoint) => {
        if (!["done", "partial", "extra"].includes(checkpoint.status)) {
            return sum;
        }
        return sum + Number(checkpoint.savedAmount || 0);
    }, 0);

    const remainingTarget = Math.max(0, state.targetAmount - completedAmount);
    const pendingCheckpoints = state.checkpoints.filter((checkpoint) => checkpoint.status === "pending");
    const redistributed = distributeTrackerAmount(remainingTarget, pendingCheckpoints.length);
    let pendingIndex = 0;

    state.checkpoints = state.checkpoints.map((checkpoint) => {
        const nextCheckpoint = { ...checkpoint };
        if (nextCheckpoint.status === "pending") {
            nextCheckpoint.revisedTarget = redistributed[pendingIndex] || 0;
            pendingIndex += 1;
        } else if (nextCheckpoint.status === "done" && !nextCheckpoint.savedAmount) {
            nextCheckpoint.savedAmount = nextCheckpoint.revisedTarget || nextCheckpoint.originalTarget;
        } else if (nextCheckpoint.status === "missed") {
            nextCheckpoint.savedAmount = 0;
        }
        return nextCheckpoint;
    });

    const nextPendingCheckpoint = state.checkpoints.find((checkpoint) => checkpoint.status === "pending");
    state.savedAmount = completedAmount;
    state.remainingTarget = remainingTarget;
    state.completedCount = state.checkpoints.filter((checkpoint) => checkpoint.status === "done").length;
    state.missedCount = state.checkpoints.filter((checkpoint) => checkpoint.status === "missed").length;
    state.progressPercent = Math.min(100, Math.round((completedAmount / state.targetAmount) * 100)) || 0;
    state.nextRequired = nextPendingCheckpoint ? nextPendingCheckpoint.revisedTarget : 0;
    state.remainingCheckpoints = pendingCheckpoints.length;
    state.finishState = remainingTarget === 0
        ? "Goal fully funded."
        : pendingCheckpoints.length
            ? `To stay on track, the next ${prettify(state.cadence)} checkpoint should save ${formatCurrency(state.nextRequired)}.`
            : `You still need ${formatCurrency(remainingTarget)} to hit the goal, so extend the timeline or raise the contribution.`;
}

function persistGoalTrackerState() {
    if (!goalTrackerState?.storageKey) {
        return;
    }
    localStorage.setItem(goalTrackerState.storageKey, JSON.stringify(goalTrackerState));
}

function renderGoalTracker() {
    if (!goalTrackerState) {
        return;
    }

    document.getElementById("goal-tracker-summary").innerHTML = `
        <article class="tracker-overview fade-in">
            <div class="tracker-overview-head">
                <div>
                    <p class="panel-label">${prettify(goalTrackerState.cadence)} tracker</p>
                    <strong>${goalTrackerState.goalText}</strong>
                </div>
                <div class="tracker-progress-copy">${goalTrackerState.progressPercent}% funded</div>
            </div>
            <div class="tracker-progress-bar">
                <span style="width:${goalTrackerState.progressPercent}%"></span>
            </div>
            <p class="tracker-overview-note">${goalTrackerState.finishState}</p>
        </article>
        <article class="mini-stat-card fade-in">
            <p class="panel-label">Saved so far</p>
            <strong>${formatCurrency(goalTrackerState.savedAmount)}</strong>
        </article>
        <article class="mini-stat-card fade-in">
            <p class="panel-label">Remaining</p>
            <strong>${formatCurrency(goalTrackerState.remainingTarget)}</strong>
        </article>
        <article class="mini-stat-card fade-in">
            <p class="panel-label">Next checkpoint</p>
            <strong>${formatCurrency(goalTrackerState.nextRequired || 0)}</strong>
        </article>
        <article class="mini-stat-card fade-in">
            <p class="panel-label">Missed checkpoints</p>
            <strong>${goalTrackerState.missedCount || 0}</strong>
        </article>
    `;

    renderGoalTrackerAdvice();

    document.getElementById("goal-tracker-list").innerHTML = `
        <div class="goal-tracker-grid">
            ${goalTrackerState.checkpoints.map((checkpoint) => `
                <article class="checkpoint-card checkpoint-${checkpoint.status} fade-in">
                    <div class="checkpoint-head">
                        <div>
                            <p class="panel-label">${checkpoint.label}</p>
                            <strong>${formatTrackerDate(checkpoint.dueDate)}</strong>
                        </div>
                        <span class="checkpoint-status">${prettify(checkpoint.status)}</span>
                    </div>
                    <div class="checkpoint-metrics">
                        <div>
                            <span>Original</span>
                            <strong>${formatCurrency(checkpoint.originalTarget)}</strong>
                        </div>
                        <div>
                            <span>Revised</span>
                            <strong>${formatCurrency(checkpoint.revisedTarget)}</strong>
                        </div>
                    </div>
                    <label class="checkpoint-field">
                        <span>Status</span>
                        <span class="checkpoint-select-wrap">
                            <select class="tracker-status-select" data-checkpoint-id="${checkpoint.id}">
                                ${["pending", "partial", "done", "missed", "extra"].map((status) => `
                                    <option value="${status}" ${(checkpoint.editorStatus || checkpoint.status) === status ? "selected" : ""}>${prettify(status)}</option>
                                `).join("")}
                            </select>
                            <i class="fa-solid fa-chevron-down"></i>
                        </span>
                    </label>
                    ${renderCheckpointInput(checkpoint)}
                </article>
            `).join("")}
        </div>
    `;

    document.querySelectorAll(".tracker-status-select").forEach((select) => {
        select.addEventListener("change", () => handleCheckpointStatusChange(select.dataset.checkpointId));
    });

    document.querySelectorAll(".tracker-apply-button").forEach((button) => {
        button.addEventListener("click", () => applyCheckpointSavings(button.dataset.checkpointId));
    });
}

function renderGoalTrackerAdvice() {
    const container = document.getElementById("goal-tracker-advice");
    if (!goalTrackerState) {
        container.innerHTML = '<div class="loader">Recovery advice appears here if you miss a checkpoint.</div>';
        return;
    }

    if ((goalTrackerState.missedCount || 0) <= 0) {
        container.innerHTML = '<div class="loader">Recovery advice appears here if you miss a checkpoint.</div>';
        return;
    }

    if ((goalTrackerState.remainingCheckpoints || 0) <= 0) {
        container.innerHTML = `
            <article class="tracker-advice-panel fade-in">
                <p class="panel-label">Recovery advice</p>
                <p>There are no checkpoints left to absorb the shortfall. Extend the deadline or lower the target, then rebuild the tracker.</p>
            </article>
        `;
        return;
    }

    const adviceKey = getGoalTrackerAdviceKey(goalTrackerState);
    if (goalTrackerState.recoveryAdvice && goalTrackerState.adviceKey === adviceKey) {
        container.innerHTML = `
            <article class="tracker-advice-panel fade-in">
                <p class="panel-label">Recovery advice</p>
                <p>${formatRichText(goalTrackerState.recoveryAdvice)}</p>
            </article>
        `;
        return;
    }

    container.innerHTML = '<div class="loader">Generating recovery advice from your memory graph...</div>';
    loadGoalTrackerAdvice(adviceKey);
}

function renderCheckpointInput(checkpoint) {
    const selectedStatus = checkpoint.editorStatus || checkpoint.status;
    const target = checkpoint.revisedTarget || checkpoint.originalTarget;

    if (selectedStatus === "partial" || selectedStatus === "extra") {
        return `
            <label class="checkpoint-field">
                <span>${selectedStatus === "extra" ? "Saved total" : "Saved so far"}</span>
                <input
                    type="number"
                    min="0"
                    step="100"
                    class="tracker-amount-input"
                    data-checkpoint-id="${checkpoint.id}"
                    value="${checkpoint.savedAmount || ""}"
                    placeholder="${Math.round(target)}"
                >
            </label>
            <button type="button" class="secondary-link tracker-apply-button" data-checkpoint-id="${checkpoint.id}">
                Apply update
            </button>
            <p class="tracker-inline-note">${selectedStatus === "extra"
                ? `Anything above ${formatCurrency(target)} reduces later checkpoints automatically.`
                : `Enter how much you actually saved. Any shortfall will be redistributed across the remaining checkpoints.`}</p>
        `;
    }

    if (selectedStatus === "done") {
        return `<p class="tracker-inline-note">Marked complete. This checkpoint is locked at ${formatCurrency(checkpoint.savedAmount || target)}.</p>`;
    }

    if (selectedStatus === "missed") {
        return `<p class="tracker-inline-note">Missed. The full target has been pushed into the remaining checkpoints so the goal can still be reached.</p>`;
    }

    return `<p class="tracker-inline-note">Still open. If it is missed later, the remaining checkpoints will adjust automatically.</p>`;
}

async function loadGoalTrackerAdvice(adviceKey) {
    if (!goalTrackerState || !goalTrackerState.remainingCheckpoints) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/goal/tracker-advice`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                goal_text: goalTrackerState.goalText,
                target_amount: goalTrackerState.targetAmount,
                remaining_target: goalTrackerState.remainingTarget,
                remaining_checkpoints: goalTrackerState.remainingCheckpoints,
                next_required: goalTrackerState.nextRequired,
                cadence: goalTrackerState.cadence,
                missed_checkpoints: goalTrackerState.missedCount,
                saved_so_far: goalTrackerState.savedAmount,
            }),
        });
        const data = await response.json();

        if (!goalTrackerState || getGoalTrackerAdviceKey(goalTrackerState) !== adviceKey) {
            return;
        }

        goalTrackerState.recoveryAdvice = data.advice || "No recovery advice available.";
        goalTrackerState.adviceKey = adviceKey;
        persistGoalTrackerState();
        renderGoalTrackerAdvice();
    } catch {
        document.getElementById("goal-tracker-advice").innerHTML = '<div class="loader">Could not load recovery advice right now.</div>';
    }
}

function getGoalTrackerAdviceKey(state) {
    return [
        state.goalText,
        state.remainingTarget,
        state.remainingCheckpoints,
        state.nextRequired,
        state.missedCount,
        state.savedAmount,
    ].join("|");
}

function handleCheckpointStatusChange(checkpointId) {
    if (!goalTrackerState) {
        return;
    }

    const checkpoint = goalTrackerState.checkpoints.find((item) => item.id === checkpointId);
    const statusInput = document.querySelector(`.tracker-status-select[data-checkpoint-id="${checkpointId}"]`);
    if (!checkpoint || !statusInput) {
        return;
    }

    const nextStatus = statusInput.value;
    checkpoint.editorStatus = null;

    if (nextStatus === "partial" || nextStatus === "extra") {
        checkpoint.editorStatus = nextStatus;
        renderGoalTracker();
        return;
    }

    checkpoint.status = nextStatus;
    if (nextStatus === "pending" || nextStatus === "missed") {
        checkpoint.savedAmount = 0;
    } else if (nextStatus === "done") {
        checkpoint.savedAmount = checkpoint.revisedTarget || checkpoint.originalTarget;
    }

    recalculateGoalTracker(goalTrackerState);
    goalTrackerState.recoveryAdvice = "";
    goalTrackerState.adviceKey = "";
    persistGoalTrackerState();
    renderGoalTracker();
}

function applyCheckpointSavings(checkpointId) {
    if (!goalTrackerState) {
        return;
    }

    const checkpoint = goalTrackerState.checkpoints.find((item) => item.id === checkpointId);
    const amountInput = document.querySelector(`.tracker-amount-input[data-checkpoint-id="${checkpointId}"]`);
    if (!checkpoint || !amountInput) {
        return;
    }

    const target = checkpoint.revisedTarget || checkpoint.originalTarget;
    const amount = Math.max(0, Number(amountInput.value || 0));
    const selectedStatus = checkpoint.editorStatus || checkpoint.status;

    checkpoint.editorStatus = null;
    checkpoint.savedAmount = amount;

    if (amount <= 0) {
        checkpoint.status = "missed";
    } else if (amount > target || selectedStatus === "extra") {
        checkpoint.status = amount > target ? "extra" : "partial";
    } else if (amount >= target) {
        checkpoint.status = "done";
    } else {
        checkpoint.status = "partial";
    }

    recalculateGoalTracker(goalTrackerState);
    goalTrackerState.recoveryAdvice = "";
    goalTrackerState.adviceKey = "";
    persistGoalTrackerState();
    renderGoalTracker();
}

function resetGoalTracker() {
    if (!goalTrackerState) {
        return;
    }
    const lastCheckpoint = goalTrackerState.checkpoints[goalTrackerState.checkpoints.length - 1];
    localStorage.removeItem(goalTrackerState.storageKey);
    initializeGoalTracker(
        {
            goal_text: goalTrackerState.goalText,
            target_amount: goalTrackerState.targetAmount,
            deadline: lastCheckpoint?.dueDate?.slice(0, 10),
            weeks_left: goalTrackerState.cadence === "weekly" ? goalTrackerState.checkpoints.length : undefined,
        },
        {
            suggested_weekly_savings: goalTrackerState.suggestedWeeklySavings,
        },
    );
}

function formatTrackerDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "No date";
    }
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatRichText(text) {
    return String(text || "")
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br>");
}

function renderStackList(items) {
    if (!items.length) {
        return '<div class="loader">No data available yet.</div>';
    }
    return items.map((item) => `
        <article class="stack-card fade-in">
            <strong>${item.title}</strong>
            <p>${item.detail}</p>
        </article>
    `).join("");
}

function handleKeyPress(event) {
    if (event.key === "Enter") {
        sendMessage();
    }
}

async function sendMessage() {
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text) {
        return;
    }

    addMessage(text, "user");
    input.value = "";

    const loadingId = `load-${Date.now()}`;
    addMessage('<i class="fa-solid fa-ellipsis fa-fade"></i> Thinking...', "bot", loadingId);

    try {
        const response = await fetch(`${API_URL}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: text, session_id: "frontend_demo" }),
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        removeMessage(loadingId);
        addMessage(data.answer || "No response.", "bot");
    } catch (error) {
        removeMessage(loadingId);
        addMessage(`Request failed: ${error.message}`, "bot");
    }
}

function addMessage(html, type, id = "") {
    const container = document.getElementById("chat-messages");
    const parsed = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
    const message = document.createElement("div");
    message.className = `msg ${type} fade-in`;
    if (id) {
        message.id = id;
    }
    const icon = type === "user" ? "fa-user" : "fa-brain";
    message.innerHTML = `<div class="avatar"><i class="fa-solid ${icon}"></i></div><div class="bubble">${parsed}</div>`;
    container.appendChild(message);
    container.scrollTop = container.scrollHeight;
}

function removeMessage(id) {
    const element = document.getElementById(id);
    if (element) {
        element.remove();
    }
}

function prettify(value) {
    return String(value || "").replace(/_/g, " ");
}

function prettifyGraphRef(value) {
    return prettify(String(value || "").split(":").pop());
}

function truncate(value, length) {
    const text = String(value || "");
    return text.length > length ? `${text.slice(0, length - 1)}...` : text;
}

