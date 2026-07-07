# Weather Email Agent

Her gun belirli bir sehir icin hava durumu bilgisini Gmail uzerinden e-posta olarak gonderen agent.

## Ozellikler

- **wttr.in** API ile ucretsiz hava durumu verisi (API key gerektirmez)
- Gmail SMTP ile guzel formatli HTML e-posta gonderimi
- Turkce hava durumu aciklamalari
- Anlik sicaklik, hissedilen sicaklik, nem, ruzgar, UV indeksi, basinc, yagis
- Bugun ve yarin icin tahmin bilgileri
- **Gun dogumu/batimi ve ay dogumu/batimi** bilgileri
- **Sicakliga ve havaya gore giyim onerisi** (mont, semsiye, gun kremi vb.)
- Otomatik tekrar deneme (retry) ve zaman asimi (timeout) destegi
- GitHub Actions ile her gun otomatik calisma (cron)
- Manuel calistirmada sehir parametresi destegi

## Kurulum

### 1. Gmail App Password Olusturma

Gmail hesabinizdan bir "App Password" olusturmaniz gerekiyor:

1. [Google Hesap Ayarlari](https://myaccount.google.com/)'na gidin
2. **Security** > **2-Step Verification** > **App passwords** secenegine gidin
3. Yeni bir app password olusturun (isim: "Weather Agent")
4. Olusturulan 16 haneli sifreyi kaydedin

### 2. GitHub Secrets Ayarlama

Repository'nizin **Settings > Secrets and variables > Actions** bolumune asagidaki secret'lari ekleyin:

| Secret Adi | Aciklama | Ornek |
|---|---|---|
| `GMAIL_USER` | Gmail adresiniz | `ornek@gmail.com` |
| `GMAIL_APP_PASSWORD` | Gmail App Password | `abcd efgh ijkl mnop` |
| `WEATHER_CITY` | Hava durumu sehri (opsiyonel) | `Istanbul` (varsayilan) |
| `RECIPIENT_EMAIL` | E-posta alici adresi (opsiyonel) | `ornek@gmail.com` (varsayilan: GMAIL_USER) |

### 3. Manuel Calistirma

```bash
npm install
GMAIL_USER=ornek@gmail.com GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx" WEATHER_CITY=Istanbul node agents/weather-email/index.mjs
```

## Zamanlama

GitHub Actions workflow'u her gun **UTC 06:00** (Turkiye saatiyle yaklasik 09:00) da calisir.

- Cron ifadesi: `0 6 * * *`
- Zamanlamayi degistirmek icin `.github/workflows/weather-email.yml` dosyasindaki `cron` degerini duzenleyin
- Workflow'u **Actions** sekmesinden manuel olarak da calistirabilirsiniz
- Manuel calistirmada farkli bir sehir belirtebilirsiniz (input parametresi)

## Dosya Yapisi

```
agents/weather-email/
  index.mjs          - Ana agent kodu
.github/workflows/
  weather-email.yml  - Gunluk zamanlanmis GitHub Actions workflow
```

## Teknik Detaylar

### Yeniden Deneme (Retry) Mekanizmasi

- wttr.in API istekleri max 3 kez tekrar denir
- Her deneme arasi sure ussel olarak artar (2s, 4s, 8s)
- HTTP 5xx hatalari ve ag hatalari icin otomatik tekrar deneme
- Istek zaman asimi: 15 saniye

### Giyim Onerisi

Sicaklik ve hava koduna gore otomatik giyim onerisi uretilir:
- 0°C ve alti: Kalin mont, atki, eldiven, bere
- 0-10°C: Mont veya kaban, atki, eldiven
- 10-18°C: Hafif mont veya cardigan
- 18-25°C: T-shirt veya ince gomlek
- 25°C ve ustu: Hafif giysiler, gun kremi
- Yagmurlu hava: Semsiye, yagmurluk
- Karli hava: Su gecirmez bot, kayma uyariisi

## E-posta Ornegi

Gonderilen e-posta sunlari icerir:

- Sehir adi ve tarih
- Anlik sicaklik ve hava durumu ikonu
- Hissedilen sicaklik
- Nem, ruzgar, gorüs mesafesi, UV indeksi, basinç, yagis
- Bugun icin sabah/ogle/aksam tahminleri
- Yarin icin tahmin
- Gun dogumu/batimi ve ay dogumu/batimi
- Giyim onerisi
