const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const PAYTR_CONFIG = {
    merchant_id: process.env.PAYTR_ID || 'BURAYA_MAGAZA_NO',
    merchant_key: process.env.PAYTR_KEY || 'BURAYA_MAGAZA_KEY',
    merchant_salt: process.env.PAYTR_SALT || 'BURAYA_MAGAZA_SALT',
    ok_url: process.env.SITE_URL ? `${process.env.SITE_URL}/?odeme=basarili` : 'http://localhost:3000/?odeme=basarili',
    fail_url: process.env.SITE_URL ? `${process.env.SITE_URL}/?odeme=hatali` : 'http://localhost:3000/?odeme=hatali',
    test_mode: '1'
};

const outputDir = path.join(__dirname, 'BASKIYA_HAZIR_DOSYALAR');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
app.use('/baski-dosyalari', express.static(outputDir));

const ordersFile = path.join(__dirname, 'siparisler.json');
let ordersDB = fs.existsSync(ordersFile) ? JSON.parse(fs.readFileSync(ordersFile, 'utf8')) : {};
function saveOrders() {
    fs.writeFileSync(ordersFile, JSON.stringify(ordersDB, null, 2), 'utf8');
}

// Standart Master Kalıp Koordinatları (100 Şablonun Tamamı İçin Sabit & Milimetrik)
const MASTER_GEOMETRY = {
    horizontal: { photoX: 0.50, photoY: 0.415, photoR: 0.145 },
    vertical:   { photoX: 0.50, photoY: 0.375, photoR: 0.195 }
};

const LABEL_MAP = {
    'mavi-prens': 'Mavi Prens',
    'prenses': 'Pembe Prenses',
    'safari': 'Orman Safari',
    'yaris': 'Yarış Arabaları',
    'hayvan-balon': 'Hayvan Balonlar'
};

app.get('/api/sablonlar', (req, res) => {
    const dir = path.join(__dirname, 'public', 'sablonlar');
    if (!fs.existsSync(dir)) return res.json([]);
    const files = fs.readdirSync(dir);
    const map = {};

    files.forEach(f => {
        const match = f.match(/^(.+)-(yatay|dikey)\.(jpg|jpeg|png)$/i);
        if (match) {
            const slug = match[1].toLowerCase();
            const orient = match[2].toLowerCase() === 'yatay' ? 'horizontal' : 'vertical';
            const ext = match[3].toLowerCase();
            if (!map[slug]) {
                const autoLabel = LABEL_MAP[slug] || slug.split('-').map(w => w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1)).join(' ');
                map[slug] = { id: slug, label: autoLabel, files: {} };
            }
            if (!map[slug].files[orient] || ext === 'png') {
                map[slug].files[orient] = `sablonlar/${f}`;
            }
        }
    });

    const priority = ['mavi-prens', 'prenses', 'safari', 'yaris', 'hayvan-balon'];
    const list = Object.values(map).sort((a, b) => {
        const ia = priority.indexOf(a.id);
        const ib = priority.indexOf(b.id);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return a.label.localeCompare(b.label, 'tr');
    });

    res.json(list);
});

function findTemplateFile(baseDir, theme, orientationKey) {
    for (const ext of ['png', 'jpg', 'jpeg']) {
        const p = path.join(baseDir, `${theme}-${orientationKey}.${ext}`);
        if (fs.existsSync(p)) return p;
    }
    return null;
}

app.post('/api/siparis-olustur', async (req, res) => {
    try {
        const { slogan, name, age, theme, orientation, size, price, customerName, customerPhone, customerEmail, customerAddress, photoBase64, photoTransform, overlayLayerBase64, isTestOrder } = req.body;

        const merchant_oid = 'AFIS' + Date.now();
        ordersDB[merchant_oid] = {
            merchant_oid,
            date: new Date().toLocaleString('tr-TR'),
            slogan: slogan || 'İYİ Kİ DOĞDUN',
            name, age, theme, orientation, size, price,
            customerName, customerPhone, customerEmail, customerAddress,
            photoBase64: photoBase64 || null,
            photoTransform: photoTransform || { scale: 1, offsetX: 0, offsetY: 0 },
            overlayLayerBase64: overlayLayerBase64 || null,
            status: 'ODEME_BEKLIYOR',
            fileName: null
        };
        saveOrders();

        if (isTestOrder) {
            const fileName = await generatePrintReadyFile(ordersDB[merchant_oid]);
            ordersDB[merchant_oid].status = 'BASKIYA_HAZIR_TEST';
            ordersDB[merchant_oid].fileName = fileName;
            saveOrders();
            return res.json({ status: 'test_success', orderId: merchant_oid, fileName });
        }

        const payment_amount = Math.round(price * 100);
        const user_ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').split(',')[0].trim();
        const user_basket = Buffer.from(JSON.stringify([
            [`Kişiye Özel ${theme.toUpperCase()} Afiş (${size} cm - ${name})`, price.toString(), 1]
        ])).toString('base64');

        const hashSTR = `${PAYTR_CONFIG.merchant_id}${user_ip}${merchant_oid}${customerEmail}${payment_amount}${user_basket}00TL${PAYTR_CONFIG.test_mode}`;
        const paytr_token = crypto.createHmac('sha256', PAYTR_CONFIG.merchant_key)
            .update(hashSTR + PAYTR_CONFIG.merchant_salt)
            .digest('base64');

        const formData = new URLSearchParams({
            merchant_id: PAYTR_CONFIG.merchant_id,
            user_ip,
            merchant_oid,
            email: customerEmail,
            payment_amount: payment_amount.toString(),
            paytr_token,
            user_basket,
            debug_on: '1',
            no_installment: '0',
            max_installment: '0',
            user_name: customerName,
            user_address: customerAddress,
            user_phone: customerPhone,
            merchant_ok_url: PAYTR_CONFIG.ok_url,
            merchant_fail_url: PAYTR_CONFIG.fail_url,
            timeout_limit: '30',
            currency: 'TL',
            test_mode: PAYTR_CONFIG.test_mode
        });

        const response = await fetch('https://www.paytr.com/odeme/api/get-token', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();

        if (result.status === 'success') {
            res.json({ status: 'success', token: result.token, orderId: merchant_oid });
        } else {
            res.status(400).json({ status: 'error', reason: result.reason });
        }
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.post('/api/paytr-callback', async (req, res) => {
    const { merchant_oid, status, total_amount, hash } = req.body;
    const calculatedHash = crypto.createHmac('sha256', PAYTR_CONFIG.merchant_key)
        .update(merchant_oid + PAYTR_CONFIG.merchant_salt + status + total_amount)
        .digest('base64');

    if (hash !== calculatedHash) return res.status(403).send('PAYTR notification failed: bad hash');

    if (status === 'success' && ordersDB[merchant_oid]) {
        const order = ordersDB[merchant_oid];
        if (order.status !== 'BASKIYA_HAZIR') {
            const fileName = await generatePrintReadyFile(order);
            order.status = 'BASKIYA_HAZIR';
            order.fileName = fileName;
            saveOrders();
        }
    }
    res.send('OK');
});

app.get('/yonetim', (req, res) => {
    const list = Object.values(ordersDB).reverse();
    const rows = list.map(o => `
        <tr>
            <td><strong>${o.merchant_oid}</strong><br><small>${o.date}</small></td>
            <td>${o.theme.toUpperCase()} (${o.size} cm - ${o.orientation === 'horizontal' ? 'Yatay' : 'Dikey'})<br>
                <strong>Slogan:</strong> ${o.slogan} | <strong>İsim:</strong> ${o.name} | <strong>Yaş:</strong> ${o.age}</td>
            <td>${o.customerName}<br>${o.customerPhone}<br><small>${o.customerAddress}</small></td>
            <td><strong>${o.price} TL</strong><br>${o.status}</td>
            <td>${o.fileName ? `<a href="/baski-dosyalari/${o.fileName}" download style="background:#E6007E;color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Baskı Dosyasını İndir</a>` : 'Ödeme Bekleniyor'}</td>
        </tr>
    `).join('');

    res.send(`<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>Premium Afiş Yönetim Paneli</title>
    <style>body{font-family:sans-serif;padding:24px;background:#f8f9fa}table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08)}th,td{padding:14px;border-bottom:1px solid #eee;text-align:left;font-size:14px}th{background:#1E193B;color:#fff}</style>
    </head><body><h2>Premium Afiş - Gelen Siparişler ve Baskı Merkezi</h2><table><tr><th>Sipariş No</th><th>Afiş Detayı</th><th>Müşteri & Kargo</th><th>Tutar / Durum</th><th>Baskı Dosyası</th></tr>${rows || '<tr><td colspan="5">Henüz sipariş yok.</td></tr>'}</table></body></html>`);
});

async function generatePrintReadyFile(order) {
    const isHoriz = order.orientation === 'horizontal';
    const width = isHoriz ? 4800 : 3600;
    const height = isHoriz ? 3600 : 4800;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const orientationKey = isHoriz ? 'yatay' : 'dikey';
    let tplPath = findTemplateFile(path.join(__dirname, 'yuksek_cozunurluk_sablonlar'), order.theme, orientationKey);
    if (!tplPath) {
        tplPath = findTemplateFile(path.join(__dirname, 'public', 'sablonlar'), order.theme, orientationKey);
    }

    // 1. Katman: Temiz Zemin İllüstrasyonu
    const bgImg = await loadImage(tplPath);
    ctx.drawImage(bgImg, 0, 0, width, height);

    // 2. Katman: Müşteri Fotoğrafı (Sabit Master Yuvarlağı İçinde)
    const geo = MASTER_GEOMETRY[order.orientation];
    const r = width * geo.photoR;
    const px = width * geo.photoX;
    const py = height * geo.photoY;
    const tf = order.photoTransform || { scale: 1, offsetX: 0, offsetY: 0 };

    if (order.photoBase64) {
        const userPhoto = await loadImage(order.photoBase64);
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.clip();
        const imgRatio = userPhoto.width / userPhoto.height;
        let baseW = r * 2, baseH = r * 2;
        if (imgRatio > 1) { baseW = baseH * imgRatio; } else { baseH = baseW / imgRatio; }
        const drawW = baseW * (tf.scale || 1);
        const drawH = baseH * (tf.scale || 1);
        const shiftX = (tf.offsetX || 0) * r;
        const shiftY = (tf.offsetY || 0) * r;
        ctx.drawImage(userPhoto, px + shiftX - drawW / 2, py + shiftY - drawH / 2, drawW, drawH);
        ctx.restore();
    }

    // 3. Katman: 3D Altın/Gümüş Çerçeve + Otomatik Kurdeleler + 3D Kabartmalı Yazılar
    if (order.overlayLayerBase64) {
        const overlayImg = await loadImage(order.overlayLayerBase64);
        ctx.drawImage(overlayImg, 0, 0, width, height);
    }

    const safeName = (order.name || 'ISIMSIZ').toLocaleUpperCase('tr-TR').replace(/[^a-zA-Z0-9ĞÜŞİÖÇğüşıöç]/g, '_');
    const fileName = `${order.merchant_oid}__${safeName}__${order.age}YAS__${order.theme.toUpperCase()}__${order.size}cm_${orientationKey.toUpperCase()}.jpg`;
    fs.writeFileSync(path.join(outputDir, fileName), canvas.toBuffer('image/jpeg', { quality: 0.96 }));
    return fileName;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Premium Afiş Baskı Robotu ${PORT} portunda çalışıyor.`);
});
