const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const app = express();
app.use(express.json({ limit: '35mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// PAYTR MAĞAZA BİLGİLERİNİZ (Canlıya geçerken PayTR panelinden girilecek)
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

// Tüm temalar için kalibrasyon haritası (Önizleme ile %100 aynı koordinatlar)
const LAYOUTS = {
    'mavi-prens': {
        horizontal: {
            sloganY: 0.118, sloganArc: 0.22, sloganMaxW: 0.36, sloganMaxH: 0.046,
            nameY: 0.625, nameArc: 0.15, nameMaxW: 0.30, nameMaxH: 0.052,
            ageY: 0.775, ageSize: 0.095, ageSub: 'YAŞ', ageSubY: 0.892, ageSubSize: 0.035,
            hasAgeBadge: true, badgeX: 0.50, badgeY: 0.775, badgeR: 0.068,
            photoX: 0.50, photoY: 0.415, photoR: 0.145,
            goldTop: '#FFFDE7', goldMid: '#FFD54F', goldBot: '#FF8F00', strokeDark: '#0A2463', strokeLight: '#FFFFFF'
        },
        vertical: {
            sloganY: 0.122, sloganArc: 0.22, sloganMaxW: 0.44, sloganMaxH: 0.050,
            nameY: 0.562, nameArc: 0.15, nameMaxW: 0.38, nameMaxH: 0.058,
            ageY: 0.720, ageSize: 0.110, ageSub: 'YAŞ', ageSubY: 0.848, ageSubSize: 0.042,
            hasAgeBadge: true, badgeX: 0.50, badgeY: 0.720, badgeR: 0.080,
            photoX: 0.50, photoY: 0.365, photoR: 0.170,
            goldTop: '#FFFDE7', goldMid: '#FFD54F', goldBot: '#FF8F00', strokeDark: '#0A2463', strokeLight: '#FFFFFF'
        }
    },
    'prenses': {
        horizontal: {
            sloganY: 0.28, sloganArc: 0.12, sloganMaxW: 0.42, sloganMaxH: 0.045,
            nameY: 0.42, nameArc: 0.0, nameMaxW: 0.48, nameMaxH: 0.088,
            ageY: 0.61, ageSize: 0.13, ageSub: 'YAŞINDA', ageSubY: 0.72, ageSubSize: 0.045,
            hasAgeBadge: false, photoX: 0.18, photoY: 0.36, photoR: 0.10,
            goldTop: '#FFF9C4', goldMid: '#FFD54F', goldBot: '#F57F17', strokeDark: '#880E4F', strokeLight: '#FFFFFF'
        },
        vertical: {
            sloganY: 0.24, sloganArc: 0.12, sloganMaxW: 0.52, sloganMaxH: 0.048,
            nameY: 0.37, nameArc: 0.0, nameMaxW: 0.58, nameMaxH: 0.10,
            ageY: 0.58, ageSize: 0.15, ageSub: 'YAŞINDA', ageSubY: 0.70, ageSubSize: 0.05,
            hasAgeBadge: false, photoX: 0.50, photoY: 0.48, photoR: 0.11,
            goldTop: '#FFF9C4', goldMid: '#FFD54F', goldBot: '#F57F17', strokeDark: '#880E4F', strokeLight: '#FFFFFF'
        }
    },
    'safari': {
        horizontal: {
            sloganY: 0.11, sloganArc: 0.10, sloganMaxW: 0.42, sloganMaxH: 0.042,
            nameY: 0.21, nameArc: 0.08, nameMaxW: 0.48, nameMaxH: 0.072,
            ageY: 0.71, ageSize: 0.13, ageSub: 'YAŞINDA', ageSubY: 0.85, ageSubSize: 0.045,
            hasAgeBadge: false, photoX: 0.50, photoY: 0.48, photoR: 0.15,
            goldTop: '#FFFDE7', goldMid: '#FFCA28', goldBot: '#E65100', strokeDark: '#1B5E20', strokeLight: '#FFFFFF'
        },
        vertical: {
            sloganY: 0.11, sloganArc: 0.10, sloganMaxW: 0.50, sloganMaxH: 0.045,
            nameY: 0.21, nameArc: 0.08, nameMaxW: 0.56, nameMaxH: 0.082,
            ageY: 0.70, ageSize: 0.14, ageSub: 'YAŞINDA', ageSubY: 0.84, ageSubSize: 0.048,
            hasAgeBadge: false, photoX: 0.50, photoY: 0.46, photoR: 0.17,
            goldTop: '#FFFDE7', goldMid: '#FFCA28', goldBot: '#E65100', strokeDark: '#1B5E20', strokeLight: '#FFFFFF'
        }
    },
    'yaris': {
        horizontal: {
            sloganY: 0.075, sloganArc: 0.06, sloganMaxW: 0.42, sloganMaxH: 0.038,
            nameY: 0.195, nameArc: 0.04, nameMaxW: 0.48, nameMaxH: 0.075,
            ageY: 0.76, ageSize: 0.13, ageSub: 'YAŞINDA', ageSubY: 0.88, ageSubSize: 0.045,
            hasAgeBadge: false, photoX: 0.50, photoY: 0.48, photoR: 0.145,
            goldTop: '#FFFFFF', goldMid: '#E0E0E0', goldBot: '#9E9E9E', strokeDark: '#B71C1C', strokeLight: '#FFD54F'
        },
        vertical: {
            sloganY: 0.08, sloganArc: 0.06, sloganMaxW: 0.50, sloganMaxH: 0.042,
            nameY: 0.185, nameArc: 0.04, nameMaxW: 0.56, nameMaxH: 0.085,
            ageY: 0.73, ageSize: 0.14, ageSub: 'YAŞINDA', ageSubY: 0.85, ageSubSize: 0.048,
            hasAgeBadge: false, photoX: 0.50, photoY: 0.46, photoR: 0.17,
            goldTop: '#FFFFFF', goldMid: '#E0E0E0', goldBot: '#9E9E9E', strokeDark: '#B71C1C', strokeLight: '#FFD54F'
        }
    },
    'hayvan-balon': {
        horizontal: {
            sloganY: 0.115, sloganArc: 0.06, sloganMaxW: 0.44, sloganMaxH: 0.042,
            nameY: 0.25, nameArc: 0.0, nameMaxW: 0.48, nameMaxH: 0.092,
            ageY: 0.68, ageSize: 0.14, ageSub: 'YAŞINDA', ageSubY: 0.81, ageSubSize: 0.046,
            hasAgeBadge: false, photoX: 0.84, photoY: 0.22, photoR: 0.095,
            goldTop: '#FFFDE7', goldMid: '#FFD54F', goldBot: '#FF6F00', strokeDark: '#4E342E', strokeLight: '#FFFFFF'
        },
        vertical: {
            sloganY: 0.10, sloganArc: 0.06, sloganMaxW: 0.52, sloganMaxH: 0.046,
            nameY: 0.22, nameArc: 0.0, nameMaxW: 0.58, nameMaxH: 0.105,
            ageY: 0.68, ageSize: 0.15, ageSub: 'YAŞINDA', ageSubY: 0.81, ageSubSize: 0.05,
            hasAgeBadge: false, photoX: 0.50, photoY: 0.35, photoR: 0.10,
            goldTop: '#FFFDE7', goldMid: '#FFD54F', goldBot: '#FF6F00', strokeDark: '#4E342E', strokeLight: '#FFFFFF'
        }
    }
};

app.post('/api/siparis-olustur', async (req, res) => {
    try {
        const { slogan, name, age, theme, orientation, size, price, customerName, customerPhone, customerEmail, customerAddress, photoBase64, isTestOrder } = req.body;

        const merchant_oid = 'AFIS' + Date.now();
        ordersDB[merchant_oid] = {
            merchant_oid,
            date: new Date().toLocaleString('tr-TR'),
            slogan: slogan || 'İYİ Kİ DOĞDUN',
            name, age, theme, orientation, size, price,
            customerName, customerPhone, customerEmail, customerAddress,
            photoBase64: photoBase64 || null,
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

    if (hash !== calculatedHash) {
        return res.status(403).send('PAYTR notification failed: bad hash');
    }

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

// Yönetici Paneli: Gelen Siparişler ve Tek Tıkla Baskı Dosyası İndirme Ekranı
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

function fitFontSize(ctx, text, maxFontPx, maxWidthPx) {
    let size = maxFontPx;
    ctx.font = `bold ${size}px Sans`;
    let measured = ctx.measureText(text).width * 1.05;
    if (measured > maxWidthPx) {
        size = Math.floor(size * (maxWidthPx / measured));
    }
    return Math.max(48, size);
}

function renderArcChars(ctx, chars, widths, totalWidth, cx, cy, radius, arcStrength, drawFn) {
    let currentX = -totalWidth / 2;
    for (let i = 0; i < chars.length; i++) {
        const charMid = currentX + widths[i] / 2;
        ctx.save();
        if (arcStrength > 0) {
            const angle = charMid / radius;
            const x = cx + Math.sin(angle) * radius;
            const y = cy + (radius - Math.cos(angle) * radius);
            ctx.translate(x, y);
            ctx.rotate(angle);
        } else {
            ctx.translate(cx + charMid, cy);
        }
        drawFn(chars[i]);
        ctx.restore();
        currentX += widths[i];
    }
}

function drawCurved3DText(ctx, text, centerX, centerY, fontSize, arcStrength, cfg) {
    if (!text) return;
    ctx.save();
    ctx.font = `bold ${fontSize}px Sans`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const chars = text.split('');
    const widths = chars.map(c => ctx.measureText(c).width * 1.03);
    const totalWidth = widths.reduce((a, b) => a + b, 0);
    const radius = arcStrength > 0 ? (totalWidth / (arcStrength * Math.PI)) : 999999;

    const depthSteps = Math.max(16, Math.floor(fontSize * 0.16));
    for (let d = depthSteps; d > 0; d--) {
        renderArcChars(ctx, chars, widths, totalWidth, centerX, centerY + d, radius, arcStrength, (ch) => {
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#120B07';
            ctx.lineWidth = Math.max(12, fontSize * 0.14);
            ctx.strokeText(ch, 0, 0);
            ctx.fillStyle = '#120B07';
            ctx.fillText(ch, 0, 0);
        });
    }

    renderArcChars(ctx, chars, widths, totalWidth, centerX, centerY, radius, arcStrength, (ch) => {
        ctx.lineJoin = 'round';
        ctx.strokeStyle = cfg.strokeLight;
        ctx.lineWidth = Math.max(18, fontSize * 0.17);
        ctx.strokeText(ch, 0, 0);
    });

    renderArcChars(ctx, chars, widths, totalWidth, centerX, centerY, radius, arcStrength, (ch) => {
        ctx.lineJoin = 'round';
        ctx.strokeStyle = cfg.strokeDark;
        ctx.lineWidth = Math.max(8, fontSize * 0.08);
        ctx.strokeText(ch, 0, 0);
    });

    renderArcChars(ctx, chars, widths, totalWidth, centerX, centerY, radius, arcStrength, (ch) => {
        const grad = ctx.createLinearGradient(0, -fontSize * 0.55, 0, fontSize * 0.55);
        grad.addColorStop(0.0, cfg.goldTop);
        grad.addColorStop(0.35, cfg.goldMid);
        grad.addColorStop(0.75, cfg.goldBot);
        grad.addColorStop(1.0, cfg.goldMid);
        ctx.fillStyle = grad;
        ctx.fillText(ch, 0, 0);
    });

    ctx.restore();
}

async function generatePrintReadyFile(order) {
    const isHoriz = order.orientation === 'horizontal';
    const width = isHoriz ? 4800 : 3600;
    const height = isHoriz ? 3600 : 4800;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const orientationKey = isHoriz ? 'yatay' : 'dikey';
    let templatePath = path.join(__dirname, 'yuksek_cozunurluk_sablonlar', `${order.theme}-${orientationKey}.jpg`);
    if (!fs.existsSync(templatePath)) {
        templatePath = path.join(__dirname, 'public', 'sablonlar', `${order.theme}-${orientationKey}.jpg`);
    }

    const bgImg = await loadImage(templatePath);
    ctx.drawImage(bgImg, 0, 0, width, height);

    const themeObj = LAYOUTS[order.theme] || LAYOUTS['mavi-prens'];
    const cfg = themeObj[order.orientation] || themeObj.horizontal;
    const cx = width / 2;

    if (order.photoBase64) {
        const userPhoto = await loadImage(order.photoBase64);
        const r = width * cfg.photoR;
        const px = width * cfg.photoX;
        const py = height * cfg.photoY;
        ctx.save();
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.clip();
        const imgRatio = userPhoto.width / userPhoto.height;
        let drawW = r * 2, drawH = r * 2;
        if (imgRatio > 1) { drawW = drawH * imgRatio; } else { drawH = drawW / imgRatio; }
        ctx.drawImage(userPhoto, px - drawW / 2, py - drawH / 2, drawW, drawH);
        ctx.restore();
    }

    const slogan = (order.slogan || 'İYİ Kİ DOĞDUN').toLocaleUpperCase('tr-TR');
    const sSize = fitFontSize(ctx, slogan, Math.floor(width * cfg.sloganMaxH), width * cfg.sloganMaxW);
    drawCurved3DText(ctx, slogan, cx, height * cfg.sloganY, sSize, cfg.sloganArc, cfg);

    const name = (order.name || 'İSİMSİZ').toLocaleUpperCase('tr-TR');
    const nSize = fitFontSize(ctx, name, Math.floor(width * cfg.nameMaxH), width * cfg.nameMaxW);
    drawCurved3DText(ctx, name, cx, height * cfg.nameY, nSize, cfg.nameArc, cfg);

    if (cfg.hasAgeBadge) {
        const bx = width * cfg.badgeX;
        const by = height * cfg.badgeY;
        const br = width * cfg.badgeR;
        ctx.save();
        ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fillStyle = '#FFB300'; ctx.fill();
        ctx.beginPath(); ctx.arc(bx, by, br * 0.90, 0, Math.PI * 2); ctx.fillStyle = '#1565C0'; ctx.fill();
        ctx.beginPath(); ctx.arc(bx, by, br * 0.76, 0, Math.PI * 2); ctx.fillStyle = '#FFFFFF'; ctx.fill();
        ctx.restore();
    }

    drawCurved3DText(ctx, String(order.age), cx, height * cfg.ageY, Math.floor(width * cfg.ageSize), 0, cfg);
    drawCurved3DText(ctx, cfg.ageSub, cx, height * cfg.ageSubY, Math.floor(width * cfg.ageSubSize), 0.08, cfg);

    const safeName = name.replace(/[^a-zA-Z0-9ĞÜŞİÖÇğüşıöç]/g, '_');
    const fileName = `${order.merchant_oid}__${safeName}__${order.age}YAS__${order.theme.toUpperCase()}__${order.size}cm_${orientationKey.toUpperCase()}.jpg`;
    fs.writeFileSync(path.join(outputDir, fileName), canvas.toBuffer('image/jpeg', { quality: 0.96 }));
    return fileName;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Premium Afiş Baskı Robotu ${PORT} portunda çalışıyor.`);
});