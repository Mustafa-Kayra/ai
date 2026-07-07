import nodemailer from "nodemailer";
import https from "https";

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const WEATHER_CITY = process.env.WEATHER_CITY || "Istanbul";
const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL || GMAIL_USER;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 2000;
const REQUEST_TIMEOUT_MS = 15000;

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  console.error("HATA: GMAIL_USER ve GMAIL_APP_PASSWORD ortam degiskenleri zorunludur.");
  console.error("Gmail App Password olusturmak icin: https://myaccount.google.com/apppasswords");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchWeather(city, attempt = 1) {
  return new Promise((resolve, reject) => {
    const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;
    const req = https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode >= 500 && attempt < MAX_RETRIES) {
            const delay = RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
            console.log(`⚠️  Sunucu hatasi (${res.statusCode}), ${delay}ms sonra tekrar denenecek (${attempt}/${MAX_RETRIES})...`);
            sleep(delay).then(() => fetchWeather(city, attempt + 1).then(resolve, reject));
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: Hava durumu verisi alinamadi`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Hava durumu verisi ayristirilamadi: ${e.message}`));
          }
        });
      })
      .on("error", (err) => {
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
          console.log(`⚠️  Ag hatasi: ${err.message}, ${delay}ms sonra tekrar denenecek (${attempt}/${MAX_RETRIES})...`);
          sleep(delay).then(() => fetchWeather(city, attempt + 1).then(resolve, reject));
        } else {
          reject(err);
        }
      });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Istek zaman asimi (${REQUEST_TIMEOUT_MS}ms)`));
    });
  });
}

function dressSuggestion(tempC, weatherCode) {
  const c = parseInt(weatherCode);
  const isRainy = [176, 263, 266, 293, 296, 299, 302, 305, 308, 353, 356, 359].includes(c);
  const isSnowy = [179, 182, 185, 227, 230, 320, 323, 326, 329, 332, 335, 338, 350, 362, 365, 368, 371, 374, 377, 392, 395].includes(c);
  const t = parseInt(tempC);
  const items = [];
  if (t <= 0) items.push("🧥 Kalin mont", "🧣 Atkı", "🧤 Eldiven", "🧒 Bere");
  else if (t <= 10) items.push("🧥 Mont veya kaban", "🧣 Atkı", "🧤 Eldiven");
  else if (t <= 18) items.push("🧥 Hafif mont veya cardigan");
  else if (t <= 25) items.push("👕 T-shirt veya ince gomlek");
  else items.push("🩳 Hafif ve ince giysiler", "🧴 Gun kremi");
  if (isRainy) items.push("☂️ Semsiye", "👢 Yagmurluk");
  if (isSnowy) items.push("❄️ Kayma dikkat", "👢 Su gecirmez bot");
  return items;
}

function formatWeatherEmail(weather, city) {
  const current = weather.current_condition[0];
  const today = weather.weather[0];
  const tomorrow = weather.weather[1];

  const date = new Date().toLocaleDateString("tr-TR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const cToEmoji = (code) => {
    const c = parseInt(code);
    if ([113].includes(c)) return "☀️";
    if ([116].includes(c)) return "⛅";
    if ([119, 122].includes(c)) return "☁️";
    if ([176, 263, 266, 293, 296, 299, 302, 305, 308, 353, 356, 359].includes(c))
      return "🌧️";
    if ([179, 182, 185, 227, 230, 320, 323, 326, 329, 332, 335, 338, 350, 362, 365, 368, 371, 374, 377, 392, 395].includes(c))
      return "❄️";
    if ([200, 386, 389].includes(c)) return "⛈️";
    if ([143, 248, 260].includes(c)) return "🌫️";
    return "🌡️";
  };

  const emoji = cToEmoji(current.weatherCode);
  const desc = current.lang_tr && current.lang_tr[0] ? current.lang_tr[0].value : current.weatherDesc[0].value;
  const suggestions = dressSuggestion(current.temp_C, current.weatherCode);
  const sunrise = today.astronomy && today.astronomy[0] ? today.astronomy[0].sunrise : "—";
  const sunset = today.astronomy && today.astronomy[0] ? today.astronomy[0].sunset : "—";
  const moonrise = today.astronomy && today.astronomy[0] ? today.astronomy[0].moonrise : "—";
  const moonset = today.astronomy && today.astronomy[0] ? today.astronomy[0].moonset : "—";

  const hourlyRow = (h, label) => {
    if (!h) return "";
    const hDesc = h.lang_tr && h.lang_tr[0] ? h.lang_tr[0].value : h.weatherDesc[0].value;
    return `<div class="forecast-row"><div class="period">${label}</div><div class="temps">${h.tempC}°</div><div class="forecast-desc">${hDesc}</div></div>`;
  };

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0f4f8; margin: 0; padding: 20px; }
  .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
  .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
  .header h1 { margin: 0; font-size: 24px; }
  .header .date { margin-top: 8px; opacity: 0.9; font-size: 14px; }
  .current { padding: 30px; text-align: center; border-bottom: 1px solid #eee; }
  .current .emoji { font-size: 64px; margin-bottom: 10px; }
  .current .temp { font-size: 48px; font-weight: bold; color: #333; }
  .current .desc { font-size: 18px; color: #666; margin-top: 5px; }
  .current .feels { font-size: 14px; color: #999; margin-top: 5px; }
  .details { display: flex; flex-wrap: wrap; padding: 20px; }
  .detail-item { flex: 1 1 45%; padding: 12px; text-align: center; }
  .detail-item .label { font-size: 12px; color: #999; text-transform: uppercase; letter-spacing: 1px; }
  .detail-item .value { font-size: 18px; font-weight: bold; color: #333; margin-top: 4px; }
  .forecast { padding: 20px; border-top: 1px solid #eee; }
  .forecast h3 { margin: 0 0 15px 0; color: #333; font-size: 16px; }
  .forecast-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f5f5f5; }
  .forecast-row:last-child { border-bottom: none; }
  .forecast-row .period { font-weight: bold; color: #555; width: 80px; }
  .forecast-row .temps { color: #666; flex: 1; text-align: center; }
  .forecast-row .forecast-desc { color: #888; font-size: 13px; flex: 1; text-align: right; }
  .suggestion { padding: 20px; border-top: 1px solid #eee; background: #f9fafb; }
  .suggestion h3 { margin: 0 0 12px 0; color: #333; font-size: 16px; }
  .suggestion-list { list-style: none; padding: 0; margin: 0; }
  .suggestion-list li { padding: 6px 0; font-size: 15px; color: #555; }
  .astronomy { padding: 20px; border-top: 1px solid #eee; }
  .astronomy h3 { margin: 0 0 12px 0; color: #333; font-size: 16px; }
  .astro-grid { display: flex; flex-wrap: wrap; gap: 10px; }
  .astro-item { flex: 1 1 45%; text-align: center; padding: 8px; background: #f5f7fa; border-radius: 8px; }
  .astro-item .label { font-size: 12px; color: #999; text-transform: uppercase; letter-spacing: 1px; }
  .astro-item .value { font-size: 16px; font-weight: bold; color: #333; margin-top: 4px; }
  .footer { padding: 20px; text-align: center; font-size: 12px; color: #aaa; background: #fafafa; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>${emoji} ${city} Hava Durumu</h1>
    <div class="date">${date}</div>
  </div>
  <div class="current">
    <div class="emoji">${emoji}</div>
    <div class="temp">${current.temp_C}°C</div>
    <div class="desc">${desc}</div>
    <div class="feels">Hissedilen: ${current.FeelsLikeC}°C</div>
  </div>
  <div class="details">
    <div class="detail-item">
      <div class="label">Nem</div>
      <div class="value">${current.humidity}%</div>
    </div>
    <div class="detail-item">
      <div class="label">Rüzgar</div>
      <div class="value">${current.windspeedKmph} km/s</div>
    </div>
    <div class="detail-item">
      <div class="label">Görüş Mesafesi</div>
      <div class="value">${current.visibility} km</div>
    </div>
    <div class="detail-item">
      <div class="label">UV İndeksi</div>
      <div class="value">${current.uvIndex}</div>
    </div>
    <div class="detail-item">
      <div class="label">Basınç</div>
      <div class="value">${current.pressure} hPa</div>
    </div>
    <div class="detail-item">
      <div class="label">Yağış</div>
      <div class="value">${current.precipMM} mm</div>
    </div>
  </div>
  <div class="forecast">
    <h3>📅 Bugün Tahmini</h3>
    ${hourlyRow(today.hourly[3], "Sabah")}
    ${hourlyRow(today.hourly[4], "Öğle")}
    ${hourlyRow(today.hourly[6], "Akşam")}
    <h3 style="margin-top:20px">📅 Yarın Tahmini</h3>
    <div class="forecast-row">
      <div class="period">Yarın</div>
      <div class="temps">${tomorrow.mintempC}° / ${tomorrow.maxtempC}°</div>
       <div class="forecast-desc">${tomorrow.hourly[4] ? (tomorrow.hourly[4].lang_tr && tomorrow.hourly[4].lang_tr[0] ? tomorrow.hourly[4].lang_tr[0].value : tomorrow.hourly[4].weatherDesc[0].value) : ""}</div>
    </div>
  </div>
  <div class="astronomy">
    <h3>🌄 Astronomik Bilgiler</h3>
    <div class="astro-grid">
      <div class="astro-item"><div class="label">Gün Doğumu</div><div class="value">🌅 ${sunrise}</div></div>
      <div class="astro-item"><div class="label">Gün Batımı</div><div class="value">🌇 ${sunset}</div></div>
      <div class="astro-item"><div class="label">Ay Doğumu</div><div class="value">🌙 ${moonrise}</div></div>
      <div class="astro-item"><div class="label">Ay Batımı</div><div class="value">🌑 ${moonset}</div></div>
    </div>
  </div>
  <div class="suggestion">
    <h3>👗 Giyim Önerisi</h3>
    <ul class="suggestion-list">
      ${suggestions.map((s) => `<li>${s}</li>`).join("\n      ")}
    </ul>
  </div>
  <div class="footer">
    Bu e-posta otomatik olarak Weather Agent tarafından gönderilmiştir.<br>
    Veri kaynağı: wttr.in | Şehir: ${city}
  </div>
</div>
</body>
</html>`;

  const text = `${emoji} ${city} Hava Durumu - ${date}

Şu An: ${current.temp_C}°C (${desc})
Hissedilen: ${current.FeelsLikeC}°C
Nem: ${current.humidity}%
Rüzgar: ${current.windspeedKmph} km/s

Bugün: ${today.mintempC}°C - ${today.maxtempC}°C
Yarın: ${tomorrow.mintempC}°C - ${tomorrow.maxtempC}°C

Gün Doğumu: ${sunrise} | Gün Batımı: ${sunset}
Giyim Önerisi: ${suggestions.join(", ")}

--- Weather Agent tarafından otomatik gönderildi ---`;

  return { html, text };
}

async function sendWeatherEmail() {
  console.log(`🌤️  ${WEATHER_CITY} icin hava durumu aliniyor...`);

  const weather = await fetchWeather(WEATHER_CITY);
  console.log(`✅ Hava durumu verisi alindi.`);

  const { html, text } = formatWeatherEmail(weather, WEATHER_CITY);

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD,
    },
  });

  const date = new Date().toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
  });

  const mailOptions = {
    from: `"Weather Agent" <${GMAIL_USER}>`,
    to: RECIPIENT_EMAIL,
    subject: `🌤️ ${WEATHER_CITY} Hava Durumu - ${date}`,
    text,
    html,
  };

  console.log(`📧 E-posta gonderiliyor: ${RECIPIENT_EMAIL}...`);
  const info = await transporter.sendMail(mailOptions);
  console.log(`✅ E-posta basariyla gonderildi! Message ID: ${info.messageId}`);

  return info;
}

sendWeatherEmail().catch((err) => {
  console.error("❌ Hata olustu:", err.message);
  process.exit(1);
});
