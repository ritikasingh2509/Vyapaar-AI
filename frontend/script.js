// ─── Vyapaar AI — Frontend Controller ───

const API_BASE = "https://vyapaar-ai-dh59.onrender.com/api";

// ─── State ───
let currentMerchant = "Sharma Café";
let aiRecommendations = null;
let selectedRecommendation = null;
let hourlyChartInstance = null;

// ─── Merchant avatar colors ───
const merchantColors = {
    "Sharma Café": "#2563eb",
    "Gupta Sweets": "#d97706",
    "FreshBite Corner": "#16a34a"
};

function getInitials(name) {
    return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

// ─── Merchant Selector ───
const selectorBtn = document.getElementById("merchantSelectorBtn");
const dropdown = document.getElementById("merchantDropdown");
const merchantNameEl = document.getElementById("merchantName");
const merchantAvatarEl = document.getElementById("merchantAvatar");

selectorBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("open");
});

document.addEventListener("click", () => {
    dropdown.classList.remove("open");
});

function loadMerchantList() {
    fetch(`${API_BASE}/merchants`)
        .then(r => r.json())
        .then(data => {
            if (data.success && data.merchants) {
                renderMerchantDropdown(data.merchants);
            }
        })
        .catch(() => {
            renderMerchantDropdown(["Sharma Café"]);
        });
}

function renderMerchantDropdown(merchants) {
    dropdown.innerHTML = "";
    merchants.forEach(name => {
        const btn = document.createElement("button");
        btn.className = "merchant-dropdown-item" + (name === currentMerchant ? " active" : "");
        btn.innerHTML = `
            <div class="merchant-avatar" style="background:${merchantColors[name] || '#2563eb'}">${getInitials(name)}</div>
            ${name}
        `;
        btn.addEventListener("click", () => {
            currentMerchant = name;
            dropdown.classList.remove("open");
            updateMerchantUI(name);
            loadDashboard(name);
        });
        dropdown.appendChild(btn);
    });
}

function updateMerchantUI(name) {
    merchantNameEl.textContent = name;
    merchantAvatarEl.textContent = getInitials(name);
    merchantAvatarEl.style.background = merchantColors[name] || "#2563eb";

    // Update dropdown active state
    dropdown.querySelectorAll(".merchant-dropdown-item").forEach(item => {
        item.classList.toggle("active", item.textContent.trim() === name);
    });

    // Update welcome
    const hour = new Date().getHours();
    let greeting = "Good Morning";
    if (hour >= 12 && hour < 17) greeting = "Good Afternoon";
    else if (hour >= 17) greeting = "Good Evening";

    document.getElementById("welcomeHeading").textContent = `${greeting}, ${name}`;
    document.getElementById("welcomeSubtext").textContent = "Here's what Vyapaar AI detected from your recent transactions.";
}

// ─── Dashboard Loader ───
function loadDashboard(merchantName) {
    const qs = `merchant_name=${encodeURIComponent(merchantName)}`;

    // Reset recommendation state
    aiRecommendations = null;
    selectedRecommendation = null;

    // Reset UI sections
    document.getElementById("performance").style.display = "none";
    document.getElementById("salesResult").style.display = "none";
    document.getElementById("upliftResult").style.display = "none";
    document.getElementById("activatedHistory").style.display = "none";
    document.getElementById("actionStatus").textContent = "";
    document.getElementById("opportunityBanner").style.display = "none";
    resetFlowIndicator();

    // Show loading in recommendations
    document.getElementById("recommendationCards").innerHTML = `
        <div class="rec-loading">
            <div class="spinner"></div>
            <p>Sarvam AI is generating growth options…</p>
        </div>
    `;

    // Load merchant stats
    fetch(`${API_BASE}/merchant?${qs}`)
        .then(r => r.json())
        .then(data => {
            document.getElementById("currentSales").textContent = `₹${data.currentSales.toLocaleString("en-IN")}`;
            document.getElementById("lastMonthSales").textContent = `₹${data.lastMonthSales.toLocaleString("en-IN")}`;

            const changeEl = document.getElementById("salesChange");
            changeEl.textContent = `${data.salesChange > 0 ? '+' : ''}${data.salesChange}%`;
            changeEl.className = "stat-value " + (data.salesChange >= 0 ? "positive" : "negative");

            document.getElementById("transactions").textContent = data.transactions;
        })
        .catch(err => console.log("Merchant Data Error:", err));

    // Load business intelligence
    const healthEl = document.getElementById("healthMessage");
    healthEl.textContent = "Analyzing your transaction patterns…";
    healthEl.className = "health-content loading";

    fetch(`${API_BASE}/ai-business-analysis?${qs}`)
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                healthEl.textContent = data.aiAnalysis;
                healthEl.className = "health-content";
            }
        })
        .catch(err => console.log("AI Analysis Error:", err));

    // Load hourly chart
    loadHourlyChart(qs);

    // Load AI growth recommendations (3 options)
    fetch(`${API_BASE}/ai-growth-recommendation?${qs}`)
        .then(r => r.json())
        .then(data => {
            console.log("AI Growth Recommendations:", data);

            if (data.success) {
                try {
                    // Parse the recommendations (could be raw JSON or wrapped in markdown)
                    let recs = data.recommendations;
                    if (typeof recs === "string") {
                        // Strip markdown code fences if present
                        recs = recs.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
                        recs = JSON.parse(recs);
                    }
                    aiRecommendations = Array.isArray(recs) ? recs : [recs];
                } catch (e) {
                    console.log("Recommendation parse error:", e);
                    // Fallback: try legacy single-recommendation format
                    if (data.recommendation) {
                        try {
                            let rec = data.recommendation;
                            if (typeof rec === "string") {
                                rec = rec.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
                                rec = JSON.parse(rec);
                            }
                            aiRecommendations = [rec];
                        } catch (e2) {
                            console.log("Legacy parse also failed:", e2);
                        }
                    }
                }

                // Show opportunity banner
                if (data.opportunity) {
                    const opp = data.opportunity;
                    const banner = document.getElementById("opportunityBanner");
                    banner.style.display = "flex";

                    const startHour = String(opp.hour).padStart(2, "0");
                    const endHour = String((opp.hour + 1) % 24).padStart(2, "0");

                    document.getElementById("oppTitle").textContent = "Opportunity Detected";
                    document.getElementById("oppTargetWindow").textContent = `Target window: ${startHour}:00–${endHour}:00`;
                    document.getElementById("oppDescription").textContent =
                        `Sales are ${Math.abs(opp.deviation)}% below the historical baseline during ${startHour}:00–${endHour}:00. Current: ₹${opp.currentValue} vs baseline ₹${opp.baseline}.`;

                    // Re-create lucide icons for the banner
                    lucide.createIcons();
                }

                renderRecommendationCards();
            } else {
                document.getElementById("recommendationCards").innerHTML = `
                    <div class="rec-loading" style="color:#475569;">
                        <p>No significant growth opportunities detected right now. Vyapaar AI will keep monitoring.</p>
                    </div>
                `;
            }
        })
        .catch(err => {
            console.log("Growth Recommendation Error:", err);
            document.getElementById("recommendationCards").innerHTML = `
                <div class="rec-loading" style="color:#dc2626;">
                    <p>Could not load recommendations. Please check your connection.</p>
                </div>
            `;
        });

    // Check existing campaign status
    fetch(`${API_BASE}/status?merchant_name=${encodeURIComponent(currentMerchant)}`)
        .then(r => r.json())
        .then(statusData => {
            if (statusData.campaignStatus === "Activated") {
                document.getElementById("performance").style.display = "block";
                document.getElementById("campaignStatus").textContent = "Activated";
                document.getElementById("activatedHistory").style.display = "flex";
                setFlowStep("measure");
            }
        })
        .catch(() => { /* status endpoint may not exist yet */ });
}

// ─── Recommendation Cards ───
function renderRecommendationCards() {
    const container = document.getElementById("recommendationCards");

    if (!aiRecommendations || aiRecommendations.length === 0) {
        container.innerHTML = `
            <div class="rec-loading" style="color:#475569;">
                <p>No recommendations available at this time.</p>
            </div>
        `;
        return;
    }

    const grid = document.createElement("div");
    grid.className = "recommendations-grid";

    aiRecommendations.forEach((rec, index) => {
        const card = document.createElement("div");
        card.className = "recommendation-card";
        card.innerHTML = `
            <div class="rec-number">${index + 1}</div>
            <div class="rec-title">${rec.action || 'Growth Action'}</div>
            <div class="rec-desc">${rec.description || ''}</div>
            ${rec.discount ? `<div class="rec-discount">↓ ${rec.discount}% discount</div>` : ''}
            <button class="rec-activate-btn" data-index="${index}">
                Activate This
            </button>
        `;

        const btn = card.querySelector(".rec-activate-btn");
        btn.addEventListener("click", () => activateRecommendation(index, card));

        grid.appendChild(card);
    });

    container.innerHTML = "";
    container.appendChild(grid);

    // Update timeline
    if (aiRecommendations.length > 0) {
        document.getElementById("recommendedActionHistory").textContent =
            `${aiRecommendations.length} growth options generated`;
    }
}

// ─── Activate a Recommendation ───
function activateRecommendation(index, cardEl) {
    const rec = aiRecommendations[index];
    if (!rec) return;

    selectedRecommendation = rec;

    // Disable all buttons
    document.querySelectorAll(".rec-activate-btn").forEach(btn => {
        btn.disabled = true;
        btn.textContent = "—";
    });

    // Highlight selected card
    document.querySelectorAll(".recommendation-card").forEach(c => c.classList.remove("selected"));
    cardEl.classList.add("selected");
    const selectedBtn = cardEl.querySelector(".rec-activate-btn");
    selectedBtn.textContent = "✓ Activated";

    // Status update
    const actionStatus = document.getElementById("actionStatus");
    actionStatus.textContent = `${rec.action} activated. Monitoring performance…`;

    // Update timeline
    const activatedHistory = document.getElementById("activatedHistory");
    activatedHistory.style.display = "flex";
    document.getElementById("activatedActionHistory").textContent =
        `${rec.discount ? rec.discount + '% ' : ''}${rec.action} activated`;

    // Show performance section
    const performanceSection = document.getElementById("performance");
    performanceSection.style.display = "block";
    document.getElementById("campaignStatus").textContent = "Campaign Activated";
    document.getElementById("campaignName").textContent = rec.action;

    // Update flow
    setFlowStep("execute");

    // Simulate monitoring → results
    setTimeout(() => {
        document.getElementById("campaignStatus").textContent = "Monitoring performance…";
        setFlowStep("measure");

        setTimeout(() => {
            document.getElementById("campaignStatus").textContent = "Results Available";
            document.getElementById("salesResult").style.display = "block";
            document.getElementById("upliftResult").style.display = "block";
            setFlowStep("grow");
        }, 2500);
    }, 1500);

    // Send to backend
    fetch(`${API_BASE}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
    merchant_name: currentMerchant,
    type: rec.action,
    discount: rec.discount || 0,
    status: "approved"
})
    })
    .then(r => r.json())
    .then(data => {
        console.log("Backend Action Response:", data);
        actionStatus.textContent = data.message;
        loadCampaignResult();
    })
    .catch(err => console.log("Action Error:", err));
}

// ─── Campaign Result ───
function loadCampaignResult() {
    fetch(`${API_BASE}/campaign-result?merchant_name=${encodeURIComponent(currentMerchant)}`)
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                document.getElementById("salesAfterCampaign").textContent =
                    `₹${data.result.currentSales.toLocaleString("en-IN")}`;
                document.getElementById("salesUplift").textContent =
                    `+${data.result.salesUplift}%`;
                document.getElementById("campaignName").textContent =
                    data.result.campaign;
            }
        })
        .catch(err => console.log("Campaign Result Error:", err));
}

// ─── Hourly Chart ───
function loadHourlyChart(qs) {
    fetch(`${API_BASE}/hourly-analysis?${qs}`)
        .then(r => r.json())
        .then(data => {
            if (!data.success) return;

            const labels = data.hourlyData.map(item => `${String(item.hour).padStart(2, "0")}:00`);
            const salesData = data.hourlyData.map(item => item.sales);
            const baselineData = data.hourlyData.map(item => item.historicalAverageSales);

            const ctx = document.getElementById("hourlyChart");

            // Destroy previous chart instance if switching merchants
            if (hourlyChartInstance) {
                hourlyChartInstance.destroy();
            }

            hourlyChartInstance = new Chart(ctx, {
                type: "line",
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: "Latest Day Sales (₹)",
                            data: salesData,
                            borderColor: "#2563eb",
                            backgroundColor: "rgba(37, 99, 235, 0.08)",
                            tension: 0.35,
                            fill: true,
                            pointBackgroundColor: "#2563eb",
                            pointRadius: 4,
                            pointHoverRadius: 6,
                            borderWidth: 2.5
                        },
                        {
                            label: "Historical Baseline Sales (₹)",
                            data: baselineData,
                            borderColor: "#94a3b8",
                            borderDash: [6, 4],
                            tension: 0.35,
                            fill: false,
                            pointBackgroundColor: "#94a3b8",
                            pointRadius: 3,
                            pointHoverRadius: 5,
                            borderWidth: 2
                        }
                    ]
                },
                options: {
                    responsive: true,
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    plugins: {
                        legend: {
                            display: true,
                            labels: {
                                usePointStyle: true,
                                padding: 20,
                                font: { family: "'Inter', sans-serif", size: 12 }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return `${context.dataset.label}: ₹${context.raw.toLocaleString('en-IN')}`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: "Sales (₹)",
                                font: { family: "'Inter', sans-serif", size: 12, weight: '500' },
                                color: "#64748b"
                            },
                            grid: { color: "#f1f5f9" },
                            ticks: {
                                font: { family: "'Inter', sans-serif", size: 11 },
                                color: "#94a3b8",
                                callback: function(value) {
                                    return '₹' + value;
                                }
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: "Time",
                                font: { family: "'Inter', sans-serif", size: 12, weight: '500' },
                                color: "#64748b"
                            },
                            grid: { display: false },
                            ticks: {
                                font: { family: "'Inter', sans-serif", size: 11 },
                                color: "#94a3b8"
                            }
                        }
                    }
                }
            });
        })
        .catch(err => console.log("Hourly Chart Error:", err));
}

// ─── Flow Indicator ───
const flowSteps = ["observe", "understand", "recommend", "execute", "measure", "grow"];
const flowElements = {
    observe: document.getElementById("flowObserve"),
    understand: document.getElementById("flowUnderstand"),
    recommend: document.getElementById("flowRecommend"),
    execute: document.getElementById("flowExecute"),
    measure: document.getElementById("flowMeasure"),
    grow: document.getElementById("flowGrow")
};

function resetFlowIndicator() {
    flowElements.observe.className = "flow-step completed";
    flowElements.understand.className = "flow-step completed";
    flowElements.recommend.className = "flow-step active";
    flowElements.execute.className = "flow-step";
    flowElements.measure.className = "flow-step";
    flowElements.grow.className = "flow-step";
}

function setFlowStep(stepName) {
    const targetIdx = flowSteps.indexOf(stepName);
    if (targetIdx === -1) return;

    flowSteps.forEach((step, idx) => {
        if (idx < targetIdx) {
            flowElements[step].className = "flow-step completed";
        } else if (idx === targetIdx) {
            flowElements[step].className = "flow-step active";
        } else {
            flowElements[step].className = "flow-step";
        }
    });

    // Re-create lucide icons for updated flow steps
    lucide.createIcons();
}

// ─── Initialize ───
updateMerchantUI(currentMerchant);
loadMerchantList();
loadDashboard(currentMerchant);