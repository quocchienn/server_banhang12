const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fetch = require('node-fetch');
const FormData = require('form-data');

const app = express();
app.use(cors());
app.use(express.json()); // Để parse JSON body nếu cần

const upload = multer({ storage: multer.memoryStorage() }); // Lưu file trên RAM

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '8159995459:AAGAZAoNZcFhVQzmnMcvu4jbzOltai6oMgA';
const CHAT_ID = process.env.CHAT_ID || '5589888565';

// Route kiểm tra server
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Server is running' });
});

app.post('/api/order', upload.single('paymentProof'), async (req, res) => {
    try {
        const { customerName, customerPhone, customerEmail, product } = req.body;
        const paymentProof = req.file;

        if (!customerName || !customerPhone || !customerEmail || !product) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
        }

        // Gửi thông tin đơn hàng
        const text = `ĐƠN HÀNG MỚI\nSản phẩm: ${product}\nTên: ${customerName}\nSĐT: ${customerPhone}\nEmail: ${customerEmail}`;
        const messageResp = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CHAT_ID, text })
        });
        const messageData = await messageResp.json();
        console.log('Telegram message response:', messageData);

        if (!messageData.ok) {
            throw new Error(`Telegram API error: ${messageData.description}`);
        }

        // Gửi ảnh chuyển khoản nếu có
        if (paymentProof) {
            const formData = new FormData();
            formData.append('chat_id', CHAT_ID);
            formData.append('caption', 'Ảnh chuyển khoản');
            formData.append('photo', paymentProof.buffer, {
                filename: paymentProof.originalname || 'payment.jpg',
                contentType: paymentProof.mimetype || 'image/jpeg'
            });

            const photoResp = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`, {
                method: 'POST',
                body: formData
            });
            const photoData = await photoResp.json();
            console.log('Telegram photo response:', photoData);

            if (!photoData.ok) {
                throw new Error(`Telegram photo API error: ${photoData.description}`);
            }
        }

        res.json({ success: true, message: 'Đã gửi đơn hàng sang Telegram!' });
    } catch (error) {
        console.error('Error processing order:', error);
        res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
});

// Xử lý các route không tồn tại
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Endpoint không tồn tại' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
