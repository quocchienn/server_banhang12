const express = require('express');
const multer = require('multer');
const cors = require('cors');
const FormData = require('form-data');

let fetch;
try {
    fetch = require('node-fetch');
} catch (error) {
    console.error('Failed to load node-fetch:', error);
    process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '8159995459:AAGAZAoNZcFhVQzmnMcvu4jbzOltai6oMgA';
const CHAT_ID = process.env.CHAT_ID || '5589888565';

// Bộ nhớ trong để theo dõi mã khuyến mãi và IP
const usedPromoCodes = new Map(); // { ip: { code: timestamp } }
const orderAttempts = new Map(); // { ip: { count: number, lastAttempt: timestamp } }
const blockedIPs = new Map(); // { ip: blockUntilTimestamp }

// Mã khuyến mãi hợp lệ (cho demo)
const validPromoCodes = {
    'SAVE10': { discount: '10%', products: ['Picsart Premium 1 Tháng', 'Picsart Premium 1 Năm', 'Combo Ultimate', 'Combo Basic'] },
    'FREELR': { discount: 'Free Lightroom', products: ['Lightroom Mobile'] }
};

// Middleware kiểm tra IP bị chặn
const checkIPBlock = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const blockUntil = blockedIPs.get(ip);
    if (blockUntil && blockUntil > Date.now()) {
        const remainingHours = Math.ceil((blockUntil - Date.now()) / (1000 * 60 * 60));
        return res.status(429).json({ success: false, message: `IP của bạn bị chặn do gửi quá nhiều đơn hàng. Vui lòng thử lại sau ${remainingHours} giờ.` });
    }
    next();
};

// Route xác thực mã khuyến mãi
app.post('/api/promo', checkIPBlock, async (req, res) => {
    try {
        const { promoCode, product } = req.body;
        const ip = req.ip || req.connection.remoteAddress;

        if (!promoCode || !product) {
            return res.status(400).json({ success: false, message: 'Thiếu mã khuyến mãi hoặc sản phẩm' });
        }

        const promo = validPromoCodes[promoCode];
        if (!promo || !promo.products.includes(product)) {
            return res.status(400).json({ success: false, message: 'Mã khuyến mãi không hợp lệ hoặc không áp dụng cho sản phẩm này' });
        }

        const ipPromoData = usedPromoCodes.get(ip) || {};
        if (ipPromoData[promoCode]) {
            return res.status(400).json({ success: false, message: 'Mã khuyến mãi này đã được sử dụng từ địa chỉ IP này' });
        }

        ipPromoData[promoCode] = Date.now();
        usedPromoCodes.set(ip, ipPromoData);

        res.json({ success: true, message: `Áp dụng thành công ${promo.discount} cho ${product}` });
    } catch (error) {
        console.error('Lỗi xác thực mã khuyến mãi:', error);
        res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
});

// Route xử lý đơn hàng
app.post('/api/order', checkIPBlock, upload.single('paymentProof'), async (req, res) => {
    try {
        const { customerName, customerPhone, customerEmail, product } = req.body;
        const paymentProof = req.file;
        const ip = req.ip || req.connection.remoteAddress;

        // Kiểm tra spam
        const now = Date.now();
        const attemptData = orderAttempts.get(ip) || { count: 0, lastAttempt: 0 };
        if (now - attemptData.lastAttempt < 24 * 60 * 60 * 1000) {
            attemptData.count += 1;
        } else {
            attemptData.count = 1;
        }
        attemptData.lastAttempt = now;

        if (attemptData.count > 5) { // Chặn sau 5 lần thử trong 24 giờ
            blockedIPs.set(ip, now + 24 * 60 * 60 * 1000); // Chặn 24 giờ
            orderAttempts.delete(ip); // Reset số lần thử
            return res.status(429).json({ success: false, message: 'Bạn đã gửi quá nhiều đơn hàng. Vui lòng thử lại sau 24 giờ.' });
        }
        orderAttempts.set(ip, attemptData);

        if (!customerName || !customerPhone || !customerEmail || !product) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
        }

        const text = `ĐƠN HÀNG MỚI\nSản phẩm: ${product}\nTên: ${customerName}\nSĐT: ${customerPhone}\nEmail: ${customerEmail}\nIP: ${ip}`;
        const messageResp = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CHAT_ID, text })
        });
        const messageData = await messageResp.json();
        console.log('Phản hồi Telegram:', messageData);

        if (!messageData.ok) {
            throw new Error(`Lỗi API Telegram: ${messageData.description}`);
        }

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
            console.log('Phản hồi ảnh Telegram:', photoData);

            if (!photoData.ok) {
                throw new Error(`Lỗi API ảnh Telegram: ${photoData.description}`);
            }
        }

        res.json({ success: true, message: 'Đã gửi đơn hàng sang Telegram!' });
    } catch (error) {
        console.error('Lỗi xử lý đơn hàng:', error);
        res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
});

// Route kiểm tra server
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Server đang chạy' });
});

// Xử lý các route không tồn tại
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Endpoint không tồn tại' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server đang chạy trên cổng ${port}`);
});
