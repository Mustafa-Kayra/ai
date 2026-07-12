# Weather Email Agent

Her gun belirli bir sehir icin hava durumu bilgisini Gmail uzerinden e-posta olarak gonderen agent.

## Ozellikler

- **wttr.in** API ile ucretsiz hava durumu verisi (API key gerektirmez)
- Gmail SMTP ile guzel formatli HTML e-posta gonderimi
- **Turkce** hava durumu aciklamalari (`wttr.in?format=j1&lang=tr` ile)
- Anlik sicaklik, hissedilen sicaklik, nem, ruzgar, UV indeksi, basinc, yagis
- Bugun ve yarin icin tahmin bilgileri
- GitHub Actions ile her gun otomatik calisma (cron)
- Ag hatasina karsi **yeniden deneme** (3 deneme, 5/10/15 sn bekleme) ve istek **zaman asimi** (15 sn)
- **DRY_RUN** modu ile e-posta gondermeden test (Gmail sifresi gerektirmez)

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

### 4. Test Modu (DRY_RUN)

E-posta gondermeden, Gmail sifresi olmadan agent'i test edebilirsiniz:

```bash
DRY_RUN=true WEATHER_CITY=Istanbul RECIPIENT_EMAIL=ornek@gmail.com node agents/weather-email/index.mjs
```

Bu mod hava durumunu cekip e-postayi hazirlar ama gonderim adimini atlar. CI'da veya yerelde agent'in calistigini dogrulamak icin kullanislidir.

### 5. Test Suite

Agent'in Turkce aciklamalar urettigini ve e-posta formatini dogrulayan deterministik testler:

```bash
npm test
```

## Zamanlama

GitHub Actions workflow'u her gun **UTC 06:00** (Turkiye saatiyle yaklasik 09:00) da calisir.

- Cron ifadesi: `0 6 * * *`
- Zamanlamayi degistirmek icin `.github/workflows/weather-email.yml` dosyasindaki `cron` degerini duzenleyin
- Workflow'u **Actions** sekmesinden manuel olarak da calistirabilirsiniz

## Dosya Yapisi

```
agents/weather-email/
  index.mjs          - Ana agent kodu (fonksiyonlar export edilir, test edilebilir)
tests/
  weather-email.test.mjs - Turkce aciklama ve format regresyon testleri
.github/workflows/
  weather-email.yml  - Gunluk zamanlanmis GitHub Actions workflow
```

## E-posta Ornegi

Gonderilen e-posta sunlari icerir:

- Sehir adi ve tarih
- Anlik sicaklik ve hava durumu ikonu
- Hissedilen sicaklik
- Nem, ruzgar, gorüs mesafesi, UV indeksi, basinç, yagis
- Bugun icin sabah/ogle/aksam tahminleri
- Yarin icin tahmin
