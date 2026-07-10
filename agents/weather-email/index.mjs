import nodemailer from "nodemailer";
import https from "https";

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const WEATHER_CITY = process.env.WEATHER_CITY || "Istanbul";
const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL || GMAIL_USER;
const MAX_RETRIES = parseInt(process.env.WEATHER_MAX_RETRIES || "3", 10);

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  console.error("HATA: GMAIL_USER ve GMAIL_APP_PASSWORD ortam degiskenleri zorunludur.");
  console.error("Gmail App Password olusturmak icin: https://myaccount.google.com/apppasswords");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchWeatherOnce(city) {
  return new Promise((resolve, reject) => {
    const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=tr`;
    const req = https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new Error(`wttr.in HTTP ${res.statusCode}`));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          if (!parsed.current_condition || !parsed.weather) {
            reject(new Error("wttr.in beklenen veri yapısını döndürmedi"));
            return;
          }
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Hava durumu verisi ayristirilamadi: ${e.message}`));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error("wttr.in istek zaman aşımına uğradı"));
    });
  });
}

async function fetchWeather(city) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`   Deneme ${attempt}/${MAX_RETRIES}...`);
      return await fetchWeatherOnce(city);
    } catch (err) {
      lastError = err;
      console.error(`   ⚠️  Deneme ${attempt} başarısız: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        const delay = attempt * 3000;
        console.log(`   ${delay / 1000} sn beklenip tekrar denenecek...`);
        await sleep(delay);
      }
    }
  }
  throw new Error(`Hava durumu ${MAX_RETRIES} deneme sonrasında alınamadı: ${lastError?.message}`);
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

  const astro = today.astronomy[0] || {};
  const sunrise = astro.sunrise || "—";
  const sunset = astro.sunset || "—";
  const moonPhase = astro.moon_phase || "—";

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
  .astro { display: flex; justify-content: space-around; padding: 15px 20px; border-top: 1px solid #eee; background: #fafafa; }
  .astro-item { text-align: center; }
  .astro-item .label { font-size: 12px; color: #999; }
  .astro-item .value { font-size: 15px; font-weight: bold; color: #555; margin-top: 3px; }
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
    <div class="desc">${current.lang_tr && current.lang_tr[0] ? current.lang_tr[0].value : current.weatherDesc[0].value}</div>
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
    <div class="forecast-row">
       <div class="period">Sabah</div>
       <div class="temps">${today.hourly[3] ? today.hourly[3].tempC + "°" : today.mintempC + "°"}</div>
       <div class="forecast-desc">${today.hourly[3] ? (today.hourly[3].lang_tr && today.hourly[3].lang_tr[0] ? today.hourly[3].lang_tr[0].value : today.hourly[3].weatherDesc[0].value) : ""}</div>
     </div>
     <div class="forecast-row">
       <div class="period">Öğle</div>
       <div class="temps">${today.hourly[4] ? today.hourly[4].tempC + "°" : today.maxtempC + "°"}</div>
       <div class="forecast-desc">${today.hourly[4] ? (today.hourly[4].lang_tr && today.hourly[4].lang_tr[0] ? today.hourly[4].lang_tr[0].value : today.hourly[4].weatherDesc[0].value) : ""}</div>
     </div>
     <div class="forecast-row">
       <div class="period">Akşam</div>
       <div class="temps">${today.hourly[6] ? today.hourly[6].tempC + "°" : today.mintempC + "°"}</div>
       <div class="forecast-desc">${today.hourly[6] ? (today.hourly[6].lang_tr && today.hourly[6].lang_tr[0] ? today.hourly[6].lang_tr[0].value : today.hourly[6].weatherDesc[0].value) : ""}</div>
     </div>
     <h3 style="margin-top:20px">📅 Yarın Tahmini</h3>
     <div class="forecast-row">
       <div class="period">Yarın</div>
       <div class="temps">${tomorrow.mintempC}° / ${tomorrow.maxtempC}°</div>
        <div class="forecast-desc">${tomorrow.hourly[4] ? (tomorrow.hourly[4].lang_tr && tomorrow.hourly[4].lang_tr[0] ? tomorrow.hourly[4].lang_tr[0].value : tomorrow.hourly[4].weatherDesc[0].value) : ""}</div>
     </div>
   </div>
   <div class="astro">
     <div class="astro-item">
       <div class="label">🌅 Gündoğumu</div>
       <div class="value">${sunrise}</div>
     </div>
     <div class="astro-item">
       <div class="label">🌇 Gün Batımı</div>
       <div class="value">${sunset}</div>
     </div>
     <div class="astro-item">
       <div class="label">🌙 Ay Evresi</div>
       <div class="value">${moonPhase}</div>
     </div>
   </div>
  <div class="footer">
    Bu e-posta otomatik olarak Weather Agent tarafından gönderilmiştir.<br>
    Veri kaynağı: wttr.in | Şehir: ${city}
  </div>
</div>
</body>
</html>`;

  const text = `${emoji} ${city} Hava Durumu - ${date}

Şu An: ${current.temp_C}°C (${current.lang_tr && current.lang_tr[0] ? current.lang_tr[0].value : current.weatherDesc[0].value})
Hissedilen: ${current.FeelsLikeC}°C
Nem: ${current.humidity}%
Rüzgar: ${current.windspeedKmph} km/s

Bugün: ${today.mintempC}°C - ${today.maxtempC}°C
Yarın: ${tomorrow.mintempC}°C - ${tomorrow.maxtempC}°C
Gündoğumu: ${sunrise} | Gün Batımı: ${sunset} | Ay: ${moonPhase}

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
