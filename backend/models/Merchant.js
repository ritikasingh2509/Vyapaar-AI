const mongoose = require("mongoose");

const merchantSchema = new mongoose.Schema({
    merchantName: String,
    currentSales: Number,
    lastMonthSales: Number,
    salesChange: Number,
    transactions: Number
});

module.exports = mongoose.model("Merchant", merchantSchema);