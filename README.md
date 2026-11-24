# RealDrive Telemetry Studio

**RealDrive Telemetry Studio**, yarış simülasyonu ve pist sürüşlerinden dışa aktarılan **20 Hz CSV / MoTeC i2 Pro** telemetri kayıtlarını ek masaüstü yazılımı gerektirmeden doğrudan tarayıcıda analiz etmek için geliştirilmiş sıfır bağımlılıklı bir web uygulamasıdır.

## Çözdüğü Problem ve Hedef Kitle

- **Çözdüğü Problem:** Yarış oturumlarından alınan 20 Hz çok kanallı CSV telemetri loglarını ham tablo olarak okumak zordur ve klasik telemetri yazılımları ağır masaüstü kurulumu gerektirir. Sürücüler hangi virajda fren yaptıklarını, hangi sektörde zaman kaybettiklerini ve lastik/fren ısısının nereye ulaştığını tek ekranda göremez.
- **Kimin İçin Geliştirildi?** Yarış simülasyonu oyuncuları, amatör pist sürücüleri ve telemetri verileriyle tur sürelerini geliştirmek isteyen kullanıcılar için geliştirilmiştir.

---

## İş Takip Panosu (GitHub Projects)

Proje planlaması, kabul kriterleri ve geliştirme akışı herkese açık GitHub Projects panosu üzerinden takip edilmektedir:

- **İş Takip Panosu:** https://github.com/users/cihankocc/projects/1
- **Depo:** https://github.com/cihankocc/realdrive-telemetry-studio

| Görev | Durum | İlgili Issue | İlgili PR | Kabul Kriteri Özeti |
|---|---|---|---|---|
| 1. 20 Hz CSV / MoTeC Telemetri Yükleyici ve Özet Analiz Paneli | `Tamamlandı` | [#1](https://github.com/cihankocc/realdrive-telemetry-studio/issues/1) | [#6](https://github.com/cihankocc/realdrive-telemetry-studio/pull/6) | Geçerli CSV/örnek yüklenince meta, KPI ve etkileşimli grafik çizilir; hatalı CSV'de Türkçe hata gösterilir; birim testleri geçer. |
| 2. Tur Bazlı Performans Karşılaştırma ve 2B Pist Isı Haritası | `Tamamlandı` | [#2](https://github.com/cihankocc/realdrive-telemetry-studio/issues/2) | [#7](https://github.com/cihankocc/realdrive-telemetry-studio/pull/7) | Turlar S1/S2/S3 ile listelenir, Δt hesaplanır, 2B pist ısı haritası 3 modda çizilir, tek turda bilgilendirme gösterilir. |
| 3. 3 Bölgeli (İç/Orta/Dış) Lastik Termodinamik ve Kamber Teşhis Görünümü | `Yapılacak` | [#3](https://github.com/cihankocc/realdrive-telemetry-studio/issues/3) | — | I/M/O farkı 8 °C'yi aşınca uyarı ve basınç/kamber önerisi üretilir. |
| 4. Otomatik Frenleme Noktası ve Tutunma Kaybı (Slip) Anomali Raporu | `Yapılacak` | [#4](https://github.com/cihankocc/realdrive-telemetry-studio/issues/4) | — | `grip < 0.75` aralıkları tabloda listelenir ve tıklanınca grafiğe odaklanılır. |
| 5. Analiz Raporunu JSON / PDF Özet Olarak Dışa Aktarma | `Yapılacak` | [#5](https://github.com/cihankocc/realdrive-telemetry-studio/issues/5) | — | KPI ve tur özetleri tek tıkla JSON/yazdırılabilir rapor olarak indirilir. |

---

## Projeyi Çalıştırma Adımları

Uygulama harici npm paketi veya veritabanı kurulumu gerektirmez; yalnızca **Node.js 18+** yeterlidir.

1. Depoyu klonlayın ve proje klasörüne girin:
   ```bash
   git clone https://github.com/cihankocc/realdrive-telemetry-studio.git
   cd realdrive-telemetry-studio
   ```
2. Yerel web sunucusunu başlatın:
   ```bash
   npm start
   ```
3. Tarayıcınızdan aşağıdaki adresi açın:
   ```text
   http://127.0.0.1:3000
   ```
4. Otomatik birim testlerini çalıştırmak için:
   ```bash
   npm test
   ```

---

## İki Özelliği Nasıl Deneyebilirsiniz?

Sayfa açıldığında **`samples/teknik_pist_3tur.csv`** (55 kanallı, 20 Hz, 3 turlu Teknik Pist MoTeC kaydı) otomatik olarak yüklenir.

### Özellik 1 — 20 Hz CSV / MoTeC Telemetri Yükleyici, KPI Özeti ve Çok Kanallı Grafik ([#6](https://github.com/cihankocc/realdrive-telemetry-studio/pull/6))

1. **Oturum Meta & KPI Kartlarını İnceleyin:** Bölüm 2'de pist (`Teknik Pist`), araç (`Apex GT-R`), örnek sayısı (`1678 satır`), `Maks. Hız`, `Tepe Yanal / Boyuna G`, `Fren Süresi`, `Tutunma Kaybı (<0.75)`, `Tepe Lastik Isısı`, `Tepe Fren Diski Isısı` ve `Toplam Süre & Mesafe` kartlarını kontrol edin.
2. **Kanalları Filtreleyin ve İmleçle Okuyun:** Bölüm 3'teki kanal düğmelerine (`Hız`, `Gaz`, `Fren`, `RPM`, `Lastik Isısı`, `Yanal G`) tıklayarak serileri açıp kapatın; fareyi grafik üzerinde gezdirerek alt şeritteki anlık `Zaman / Tur / Vites / Hız / RPM / Gaz / Fren / Lastik / Tutunma` değerlerinin canlı değiştiğini gözlemleyin.
3. **Kendi Dosyanızı ve Hata Yönetimini Test Edin:** `Dosya Seç (.csv)` veya sürükle-bırak alanına `samples/sehir_devresi_1tur.csv` gibi geçerli bir CSV bırakarak verinin güncellendiğini görün. Ardından boş ya da rastgele metin içeren bozuk bir `.csv` dosyası yükleyerek uygulamanın çökmeden kırmızı uyarı şeridinde açıklayıcı Türkçe hata mesajı gösterdiğini doğrulayın.

### Özellik 2 — Tur Bazlı Performans Karşılaştırma ve 2B Pist Isı Haritası ([#7](https://github.com/cihankocc/realdrive-telemetry-studio/pull/7))

1. **Tur Tablosu ve Sektör Karşılaştırması:** Bölüm 4'te `Tur 1`, `Tur 2` (`EN HIZLI` rozetli) ve `Tur 3` satırlarını S1/S2/S3 sektör süreleriyle inceleyin. Sağdaki `Referans Tur (A)` ve `Karşılaştırılan Tur (B)` seçicilerini değiştirerek (örneğin `Tur 2` ile `Tur 3`) toplam zaman farkının (`Δt`), sektör farklarının ve hız/ısı farklarının güncellendiğini görün.
2. **2B Pist Isı Haritası:** Bölüm 5'te `Hız`, `Fren` ve `Lastik Isısı` butonları arasında geçiş yaparak pist geometrisinin renklendirmesinin ve alt lejant aralığının değiştiğini izleyin; `Tur Filtresi` üzerinden tek bir tur seçin ve pist çizgisi üzerinde fare gezdirerek nokta verilerini inceleyin.
3. **Tek Turlu Oturum Kenar Durumu:** Üst panelden **`Örnek: Şehir Devresi (1 Tur)`** butonuna tıklayın. Karşılaştırma panelinin hata vermeden bilgilendirici tek tur uyarısı gösterdiğini ve 2B pist ısı haritasında 4 düzlük + 4 virajlı şehir pisti geometrisinin çizildiğini doğrulayın.

---

## Proje Yapısı

```text
realdrive-telemetry-studio/
├── package.json
├── server.js
├── scripts/
│   └── generate-samples.js
├── samples/
│   ├── teknik_pist_3tur.csv
│   └── sehir_devresi_1tur.csv
├── src/
│   ├── telemetryParser.js
│   ├── telemetryStats.js
│   └── lapAnalyzer.js
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── tests/
    ├── telemetryAnalyzer.test.js
    └── lapAnalyzer.test.js
```
