const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
    transaction_id: String,
    merchant_name: String,
    amount: Number,
    date: Date,
    hour: Number,
    minute: Number,
    category: String,
    payment_status: String
});

module.exports = mongoose.model("Transaction", transactionSchema);