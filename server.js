const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fetch = require('node-fetch');
const FormData = require('form-data');

const app = express();
app.use(cors());

const upload = multer({ storage: multer.memoryStorage() }); // Lưu file trên RAM

const TELEGRAM_TOKEN = '8159995459:AAGAZAoNZcFhVQzmnMcvu4jbzOltai6oMgA';
const CHAT_ID = '5589888565';

app.post('/api/order', upload.single('paymentProof'), async(req, res) => {
    const { customerName, customerPhone, customerEmail, product } = req.body;
    const paymentProof = req.file;

    // Gửi thông tin đơn hàng
    const text = `ĐƠN HÀNG MỚI\nSản phẩm: ${product}\nTên: ${customerName}\nSĐT: ${customerPhone}\nEmail: ${customerEmail}`;
    const resp = await fetch(`https://api.telegram.org/bot8159995459:AAGAZAoNZcFhVQzmnMcvu4jbzOltai6oMgA/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, text })
    });
    const data = await resp.json();
    console.log(data); // Xem phản hồi từ Telegram

    // Gửi ảnh chuyển khoản nếu có
    if (paymentProof) {
        const formData = new FormData();
        formData.append('chat_id', CHAT_ID);
        formData.append('caption', 'Ảnh chuyển khoản');
        formData.append('photo', paymentProof.buffer, {
            filename: paymentProof.originalname,
            contentType: paymentProof.mimetype
        });

        await fetch(`https://api.telegram.org/bot8159995459:AAGAZAoNZcFhVQzmnMcvu4jbzOltai6oMgA/sendPhoto`, {
            method: 'POST',
            body: formData
        });
    }

    res.json({ success: true, message: 'Đã gửi đơn hàng sang Telegram!' });
});

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});