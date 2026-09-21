require("dotenv").config();
const express = require("express");

const app = express();
const mongoose = require("mongoose");
const Merchant = require("./models/Merchant");
const Transaction = require("./models/Transaction");
const { SarvamAIClient } = require("sarvamai");
const sarvam = new SarvamAIClient({
    apiSubscriptionKey: process.env.SARVAM_API_KEY
});
const fs = require("fs");
const csv = require("csv-parser");

mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log("MongoDB Connected Successfully!");
        try {
            const count = await Transaction.countDocuments();
            const merchants = await Transaction.distinct("merchant_name");
            if (count < 400 || merchants.length < 3) {
                console.log("Importing all transaction records from CSV into MongoDB...");
                await importTransactionsHelper();
            } else {
                console.log(`MongoDB ready with ${count} transactions across ${merchants.length} merchants: ${merchants.join(", ")}`);
            }
        } catch (e) {
            console.log("Error checking transaction count:", e.message);
        }
    })
    .catch((error) => {
        console.log("MongoDB Connection Error:", error.message);
    });

app.use(express.json());
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});

// Helper function to import CSV
async function importTransactionsHelper() {
    return new Promise((resolve, reject) => {
        const transactions = [];
        fs.createReadStream("./transactions.csv")
            .pipe(csv())
            .on("data", (row) => {
                if (row.transaction_id && row.merchant_name) {
                    transactions.push({
                        transaction_id: String(row.transaction_id).trim(),
                        merchant_name: String(row.merchant_name).trim(),
                        amount: Number(row.amount),
                        date: new Date(row.date),
                        hour: Number(row.hour),
                        minute: Number(row.minute),
                        category: row.category ? String(row.category).trim() : "General",
                        payment_status: row.payment_status ? String(row.payment_status).trim() : "SUCCESS"
                    });
                }
            })
            .on("end", async () => {
                await Transaction.deleteMany({});
                await Transaction.insertMany(transactions);
                console.log(`${transactions.length} transaction records imported successfully into MongoDB!`);
                resolve(transactions.length);
            })
            .on("error", (error) => {
                reject(error);
            });
    });
}

app.get("/", (req, res) => {
    res.send("AI Merchant Teammate Backend is running!");
});

// Get available merchants list
app.get("/api/merchants", async (req, res) => {
    try {
        const distinctMerchants = await Transaction.distinct("merchant_name");
        const defaultMerchants = ["Sharma Café", "Gupta Sweets", "FreshBite Corner"];
        const merchants = distinctMerchants.length >= 3 ? distinctMerchants : defaultMerchants;
        res.json({
            success: true,
            merchants: merchants
        });
    } catch (error) {
        res.json({
            success: true,
            merchants: ["Sharma Café", "Gupta Sweets", "FreshBite Corner"]
        });
    }
});

// Merchant-wise campaign state
const merchantCampaigns = {};

// Campaign status route
app.get("/api/status", (req, res) => {
    const merchantName = req.query.merchant_name || "Sharma Café";

    const merchantState = merchantCampaigns[merchantName];

    res.json({
        success: true,
        merchantName: merchantName,
        campaignStatus: merchantState?.activated ? "Activated" : "Inactive",
        latestAction: merchantState?.action || null
    });
});

app.get("/api/merchant", async (req, res) => {
    try {
        const merchantName = req.query.merchant_name || "Sharma Café";
        const transactions = await Transaction.find({
            merchant_name: merchantName,
            payment_status: "SUCCESS"
        }).sort({ date: 1 });

        if (transactions.length === 0) {
            return res.json({
                merchantName,
                currentSales: 0,
                lastMonthSales: 0,
                salesChange: 0,
                transactions: 0
            });
        }

        const latestDate = transactions[transactions.length - 1].date.toISOString().split("T")[0];

        const currentDayTransactions = transactions.filter(t =>
            t.date.toISOString().split("T")[0] === latestDate
        );

        const previousDayTransactions = transactions.filter(t =>
            t.date.toISOString().split("T")[0] !== latestDate
        );

        const currentSales = currentDayTransactions.reduce((sum, t) => sum + t.amount, 0);
        const previousSales = previousDayTransactions.reduce((sum, t) => sum + t.amount, 0);

        const previousDates = [...new Set(previousDayTransactions.map(t => t.date.toISOString().split("T")[0]))];
        const previousAverageSales = previousDates.length > 0 ? previousSales / previousDates.length : 0;

        const salesChange = previousAverageSales > 0 ? ((currentSales - previousAverageSales) / previousAverageSales) * 100 : 0;

        res.json({
            merchantName: merchantName,
            currentSales: Math.round(currentSales),
            lastMonthSales: Math.round(previousAverageSales),
            salesChange: Math.round(salesChange * 100) / 100,
            transactions: currentDayTransactions.length
        });

    } catch (error) {
        console.log("Merchant Data Error:", error);
        res.status(500).json({ message: "Error fetching merchant data" });
    }
});

app.post("/api/seed-merchant", async (req, res) => {
    try {
        const merchant = await Merchant.create({
            merchantName: "Sharma Café",
            currentSales: 5000,
            lastMonthSales: 10000,
            salesChange: -50,
            transactions: 142
        });

        res.json({
            success: true,
            message: "Merchant data added to MongoDB!",
            merchant: merchant
        });
    } catch (error) {
        res.status(500).json({ message: "Error adding merchant data", error: error.message });
    }
});

app.post("/api/import-transactions", async (req, res) => {
    try {
        const count = await importTransactionsHelper();
        res.json({
            success: true,
            message: `${count} transaction records imported successfully!`,
            count: count
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "CSV import failed",
            error: error.message
        });
    }
});

app.get("/api/ai-test", async (req, res) => {
    try {
        const response = await sarvam.chat.completions({
            model: "sarvam-105b",
            messages: [{ role: "user", content: "Say hello in one short sentence." }]
        });
        res.json({ success: true, response: response });
    } catch (error) {
        console.log("Sarvam AI Error:", error);
        res.status(500).json({ success: false, message: "Sarvam AI test failed", error: error.message });
    }
});

app.get("/api/business-health", async (req, res) => {
    try {
        const merchantName = req.query.merchant_name || "Sharma Café";
        const transactions = await Transaction.find({
            merchant_name: merchantName,
            payment_status: "SUCCESS"
        });

        const totalSales = transactions.reduce((sum, t) => sum + t.amount, 0);
        const eveningTransactions = transactions.filter(t => t.hour >= 18);
        const daytimeTransactions = transactions.filter(t => t.hour < 18);
        const eveningSales = eveningTransactions.reduce((sum, t) => sum + t.amount, 0);
        const daytimeSales = daytimeTransactions.reduce((sum, t) => sum + t.amount, 0);

        res.json({
            merchantName,
            totalTransactions: transactions.length,
            totalSales,
            daytimeSales,
            eveningSales,
            eveningTransactionCount: eveningTransactions.length,
            daytimeTransactionCount: daytimeTransactions.length
        });
    } catch (error) {
        console.log("Business Health Error:", error);
        res.status(500).json({ success: false, message: "Error analyzing business health" });
    }
});

app.get("/api/hourly-analysis", async (req, res) => {
    try {
        const merchantName = req.query.merchant_name || "Sharma Café";
        const transactions = await Transaction.find({
            merchant_name: merchantName,
            payment_status: "SUCCESS"
        }).sort({ date: 1 });

        if (transactions.length === 0) {
            return res.json({ success: false, message: "No transaction data found" });
        }

        const latestDate = transactions[transactions.length - 1].date.toISOString().split("T")[0];
        const latestDayTransactions = transactions.filter(t => t.date.toISOString().split("T")[0] === latestDate);
        const historicalTransactions = transactions.filter(t => t.date.toISOString().split("T")[0] !== latestDate);

        // Continuous timeline from min hour to max hour (e.g. 7 AM to 11 PM / 23:00)
        const allHours = transactions.map(t => t.hour);
        const minHour = Math.min(...allHours, 7);
        const maxHour = Math.max(...allHours, 23);

        const previousDates = [...new Set(historicalTransactions.map(t => t.date.toISOString().split("T")[0]))];

        // Group latest day sales by hour
        const latestDaySalesByHour = {};
        latestDayTransactions.forEach(t => {
            const h = t.hour;
            if (!latestDaySalesByHour[h]) latestDaySalesByHour[h] = 0;
            latestDaySalesByHour[h] += t.amount;
        });

        // Group historical sales by date and hour
        const historicalSalesByDateHour = {};
        historicalTransactions.forEach(t => {
            const d = t.date.toISOString().split("T")[0];
            const h = t.hour;
            if (!historicalSalesByDateHour[d]) historicalSalesByDateHour[d] = {};
            if (!historicalSalesByDateHour[d][h]) historicalSalesByDateHour[d][h] = 0;
            historicalSalesByDateHour[d][h] += t.amount;
        });

        const hourlyData = [];
        for (let hour = minHour; hour <= maxHour; hour++) {
            const sales = latestDaySalesByHour[hour] || 0;

            let historicalTotalSales = 0;
            previousDates.forEach(d => {
                if (historicalSalesByDateHour[d] && historicalSalesByDateHour[d][hour]) {
                    historicalTotalSales += historicalSalesByDateHour[d][hour];
                }
            });

            const historicalAverageSales = previousDates.length > 0 ? historicalTotalSales / previousDates.length : 0;

            hourlyData.push({
                hour: hour,
                sales: Math.round(sales * 100) / 100,
                historicalAverageSales: Math.round(historicalAverageSales * 100) / 100
            });
        }

        res.json({
            success: true,
            merchantName: merchantName,
            date: latestDate,
            hourlyData: hourlyData
        });
    } catch (error) {
        console.log("Hourly Analysis Error:", error);
        res.status(500).json({ success: false, message: "Error generating hourly analysis" });
    }
});

app.get("/api/trigger-check", async (req, res) => {
    try {
        const merchantName = req.query.merchant_name || "Sharma Café";
        const transactions = await Transaction.find({
            merchant_name: merchantName,
            payment_status: "SUCCESS"
        }).sort({ date: 1 });

        if (transactions.length === 0) {
            return res.json({ success: false, message: "No transaction data found" });
        }

        const latestTransaction = transactions[transactions.length - 1];
        const currentDate = latestTransaction.date;
        const currentHour = latestTransaction.hour;
        const currentDateString = currentDate.toISOString().split("T")[0];

        const currentTransactions = transactions.filter(t =>
            t.hour === currentHour && t.date.toISOString().split("T")[0] === currentDateString
        );

        const historicalTransactions = transactions.filter(t =>
            t.hour === currentHour && t.date.toISOString().split("T")[0] !== currentDateString
        );

        const dailyCounts = {};
        historicalTransactions.forEach(t => {
            const date = t.date.toISOString().split("T")[0];
            if (!dailyCounts[date]) dailyCounts[date] = 0;
            dailyCounts[date]++;
        });

        const historicalCounts = Object.values(dailyCounts);
        const historicalAverage = historicalCounts.length > 0 ? historicalCounts.reduce((a, b) => a + b, 0) / historicalCounts.length : 0;
        const currentCount = currentTransactions.length;

        let deviation = 0;
        if (historicalAverage > 0) {
            deviation = ((historicalAverage - currentCount) / historicalAverage) * 100;
        }

        const threshold = 30;
        const triggered = deviation >= threshold;

        res.json({
            success: true,
            merchantName: merchantName,
            currentDate: currentDateString,
            currentHour,
            currentTransactions: currentCount,
            historicalAverage: Math.round(historicalAverage * 100) / 100,
            deviation: Math.round(deviation * 100) / 100,
            threshold,
            triggered
        });
    } catch (error) {
        console.log("Trigger Check Error:", error);
        res.status(500).json({ success: false, message: "Trigger check failed" });
    }
});

app.get("/api/opportunity", async (req, res) => {
    try {
        const merchantName = req.query.merchant_name || "Sharma Café";
        const transactions = await Transaction.find({ merchant_name: merchantName });

        const hourlyData = {};
        transactions.forEach(t => {
            const date = new Date(t.date).toISOString().split("T")[0];
            const hour = t.hour;
            const key = `${date}-${hour}`;
            if (!hourlyData[key]) hourlyData[key] = 0;
            hourlyData[key] += t.amount;
        });

        const dates = [...new Set(transactions.map(t => new Date(t.date).toISOString().split("T")[0]))].sort();
        const currentDate = dates[dates.length - 1];
        const threshold = 20;
        const opportunities = [];

        for (const key in hourlyData) {
            if (!key.startsWith(currentDate)) continue;
            const hour = Number(key.split("-")[3]);
            const historicalValues = dates.slice(0, -1).map(date => hourlyData[`${date}-${hour}`]).filter(v => v !== undefined);
            if (historicalValues.length === 0) continue;

            const baseline = historicalValues.reduce((sum, v) => sum + v, 0) / historicalValues.length;
            const currentValue = hourlyData[key];
            const deviation = ((currentValue - baseline) / (baseline || 1)) * 100;

            if (deviation <= -threshold) {
                opportunities.push({
                    date: currentDate,
                    hour: hour,
                    currentHourlyValue: currentValue,
                    baseline: Number(baseline.toFixed(2)),
                    deviation: Number(deviation.toFixed(2)),
                    threshold: threshold,
                    opportunity: true,
                    message: `Sales dropped ${Math.abs(deviation).toFixed(2)}% below the historical baseline.`
                });
            }
        }

        res.json({
            success: true,
            merchantName: merchantName,
            currentDate: currentDate,
            threshold: `${threshold}%`,
            opportunityDetected: opportunities.length > 0,
            opportunities: opportunities.sort((a, b) => a.hour - b.hour)
        });
    } catch (error) {
        console.log("Opportunity Detection Error:", error);
        res.status(500).json({ success: false, message: "Error detecting growth opportunity" });
    }
});

app.get("/api/ai-business-analysis", async (req, res) => {
    try {
        const merchantName = req.query.merchant_name || "Sharma Café";
        const transactions = await Transaction.find({ merchant_name: merchantName, payment_status: "SUCCESS" });

        const totalSales = transactions.reduce((sum, t) => sum + t.amount, 0);
        const eveningTransactions = transactions.filter(t => t.hour >= 18);
        const daytimeTransactions = transactions.filter(t => t.hour < 18);
        const eveningSales = eveningTransactions.reduce((sum, t) => sum + t.amount, 0);
        const daytimeSales = daytimeTransactions.reduce((sum, t) => sum + t.amount, 0);

        const prompt = `
You are an AI business partner for ${merchantName}, a small Paytm merchant.

Analyze this simulated transaction data:
- Merchant: ${merchantName}
- Total Sales: ₹${totalSales}
- Daytime Sales (before 6 PM): ₹${daytimeSales} (${daytimeTransactions.length} txns)
- Evening Sales (after 6 PM): ₹${eveningSales} (${eveningTransactions.length} txns)

Provide a concise, professional 2-sentence executive summary identifying the key business pattern and strategic growth opportunity. Be direct and business-focused.
`;

        const response = await sarvam.chat.completions({
            model: "sarvam-105b",
            messages: [{ role: "user", content: prompt }]
        });

        res.json({
            success: true,
            merchantName,
            businessData: {
                totalSales,
                daytimeSales,
                eveningSales,
                daytimeTransactions: daytimeTransactions.length,
                eveningTransactions: eveningTransactions.length
            },
            aiAnalysis: response.choices[0].message.content
        });
    } catch (error) {
        console.log("AI Business Analysis Error:", error);
        res.status(500).json({ success: false, message: "AI business analysis failed", error: error.message });
    }
});

// AI Growth Recommendation - SINGLE Sarvam API call returning 3 JSON object recommendations
app.get("/api/ai-growth-recommendation", async (req, res) => {
    try {
        const merchantName = req.query.merchant_name || "Sharma Café";
        const transactions = await Transaction.find({ merchant_name: merchantName });

        if (transactions.length === 0) {
            return res.json({
                success: false,
                merchantName,
                message: "No transaction data found for this merchant."
            });
        }

        const categories = [...new Set(transactions.map(t => t.category).filter(Boolean))];

        const hourlyData = {};
        transactions.forEach(t => {
            const date = new Date(t.date).toISOString().split("T")[0];
            const hour = t.hour;
            const key = `${date}-${hour}`;
            if (!hourlyData[key]) hourlyData[key] = 0;
            hourlyData[key] += t.amount;
        });

        const dates = [...new Set(transactions.map(t => new Date(t.date).toISOString().split("T")[0]))].sort();
        const currentDate = dates[dates.length - 1];
        const opportunities = [];

        for (const key in hourlyData) {
            if (!key.startsWith(currentDate)) continue;
            const hour = Number(key.split("-")[3]);
            const historicalValues = dates.slice(0, -1).map(date => hourlyData[`${date}-${hour}`]).filter(v => v !== undefined);
            if (historicalValues.length === 0) continue;

            const baseline = historicalValues.reduce((sum, v) => sum + v, 0) / historicalValues.length;
            const currentValue = hourlyData[key];
            const deviation = ((currentValue - baseline) / (baseline || 1)) * 100;

            if (deviation <= -20) {
                opportunities.push({
                    hour,
                    currentValue,
                    baseline: Number(baseline.toFixed(2)),
                    deviation: Number(deviation.toFixed(2))
                });
            }
        }

        let opportunity;
        if (opportunities.length > 0) {
            opportunity = opportunities.sort((a, b) => a.deviation - b.deviation)[0];
        } else {
            opportunity = { hour: 19, currentValue: 120, baseline: 350, deviation: -65.71 };
        }

        const prompt = `
You are Vyapaar AI, an AI growth partner for ${merchantName} (a Paytm merchant).

A business opportunity has been detected:
- Merchant: ${merchantName}
- Main categories sold: ${categories.join(", ")}
- Low activity window: ${opportunity.hour}:00 - ${opportunity.hour + 1}:00
- Current sales in window: ₹${opportunity.currentValue}
- Historical baseline: ₹${opportunity.baseline}
- Sales drop: ${Math.abs(opportunity.deviation)}% below baseline

Generate EXACTLY 3 distinct, practical, actionable growth recommendations tailored specifically to ${merchantName}'s business context to boost sales during this window.

Return ONLY a raw JSON array of 3 objects with NO markdown formatting or commentary:
[
  {
    "action": "Short Title 1",
    "description": "Short 1-sentence explanation of what to do.",
    "discount": 10
  },
  {
    "action": "Short Title 2",
    "description": "Short 1-sentence explanation of what to do.",
    "discount": 15
  },
  {
    "action": "Short Title 3",
    "description": "Short 1-sentence explanation of what to do.",
    "discount": 5
  }
]

Rules:
- Generate 3 distinct actions tailored to ${merchantName}.
- Each discount must be a number between 5 and 20.
- Return ONLY valid JSON array of 3 recommendation objects.
`;

        let recommendations = [];

        try {
            const response = await sarvam.chat.completions({
                model: "sarvam-105b",
                messages: [{ role: "user", content: prompt }]
            });

            const aiText = response.choices[0].message.content;
            console.log(`Sarvam AI Response for ${merchantName}:`, aiText);

            const cleanText = aiText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
            const parsed = JSON.parse(cleanText);

            if (Array.isArray(parsed) && parsed.length > 0) {
                recommendations = parsed;
            }
        } catch (aiErr) {
            console.log("Sarvam AI call or parsing error:", aiErr.message);
        }

        // Contextual fallback guaranteeing 3 distinct recommendations
        if (!Array.isArray(recommendations) || recommendations.length < 3) {
            const cat1 = categories[0] || "Featured";
            const cat2 = categories[1] || "Popular";
            const cat3 = categories[2] || "Special";

            recommendations = [
                {
                    action: `${cat1} Combo Offer`,
                    description: `Offer a targeted ${cat1.toLowerCase()} combo during the ${opportunity.hour}:00–${opportunity.hour + 1}:00 low-activity period.`,
                    discount: 10
                },
                {
                    action: `Time-Limited ${cat2} Discount`,
                    description: `Run a time-limited discount on ${cat2.toLowerCase()} items during the low-activity window.`,
                    discount: 15
                },
                {
                    action: `${cat3} Product Promotion`,
                    description: `Promote high-demand ${cat3.toLowerCase()} items to increase footfall during quiet hours.`,
                    discount: 5
                }
            ];
        }

        res.json({
            success: true,
            merchantName: merchantName,
            opportunity: opportunity,
            recommendations: recommendations
        });

    } catch (error) {
        console.log("AI Growth Recommendation Error:", error);
        res.status(500).json({
            success: false,
            message: "Error generating AI growth recommendations",
            error: error.message
        });
    }
});

app.get("/api/campaign-result", async (req, res) => {
    try {
        const merchantName = req.query.merchant_name || "Sharma Café";
        if (!campaignActivated || !latestAction) {
            return res.json({ success: false, message: "No campaign has been activated yet." });
        }

        const transactions = await Transaction.find({
            merchant_name: merchantName,
            payment_status: "SUCCESS"
        }).sort({ date: 1 });

        if (transactions.length === 0) {
            return res.json({ success: false, message: "No transaction data available." });
        }

        const latestDate = transactions[transactions.length - 1].date.toISOString().split("T")[0];
        const latestDayTransactions = transactions.filter(t => t.date.toISOString().split("T")[0] === latestDate);
        const currentSales = latestDayTransactions.reduce((sum, t) => sum + t.amount, 0);

        const previousTransactions = transactions.filter(t => t.date.toISOString().split("T")[0] !== latestDate);
        const previousDates = [...new Set(previousTransactions.map(t => t.date.toISOString().split("T")[0]))];
        const previousSales = previousTransactions.reduce((sum, t) => sum + t.amount, 0);
        const previousAverageSales = previousDates.length > 0 ? previousSales / previousDates.length : 0;

        const simulatedUplift = 12;
        const simulatedSalesAfterCampaign = Math.round(currentSales * (1 + simulatedUplift / 100));

        res.json({
            success: true,
            merchantName,
   
            result: {
                previousSales: Math.round(previousAverageSales),
                currentSales: simulatedSalesAfterCampaign,
                salesUplift: simulatedUplift,
                campaign: latestAction.type,
                status: "Completed",
                simulated: true
            }
        });
    } catch (error) {
        console.log("Campaign Result Error:", error);
        res.status(500).json({ success: false, message: "Error fetching campaign result", error: error.message });
    }
});

app.post("/api/action", async (req, res) => {
    try {
        const action = req.body;

        const merchantName =
            action.merchant_name ||
            action.merchantName ||
            "Sharma Café";

        merchantCampaigns[merchantName] = {
            activated: true,
            action: action
        };

        console.log(`Growth Action Received for ${merchantName}:`, action);

        let n8nStatus = "n8n unavailable";
        try {
            const n8nResponse = await fetch("http://localhost:5678/webhook/merchant-growth-action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(action)
            });

            const n8nResult = await n8nResponse.text();
            console.log("n8n Response:", n8nResult);
            n8nStatus = "Action sent to n8n successfully";
        } catch (n8nError) {
            console.log("n8n unavailable:", n8nError.message);
        }

        res.json({
            success: true,
            message: `Growth action "${action.type || "Campaign"}" approved and activated for ${merchantName}.`,
            merchantName: merchantName,
            action: action,
            n8n: n8nStatus
        });

    } catch (error) {
        console.log("Action Error:", error);

        res.status(500).json({
            success: false,
            message: "Growth action activation failed.",
            error: error.message
        });
    }
});

const PORT = 5001;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});