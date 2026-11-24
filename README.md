# RealDrive Telemetry Studio

**RealDrive Telemetry Studio**, yarış ve simülasyon oturumlarından dışa aktarılan **20 Hz CSV / MoTeC i2 Pro** telemetri kayıtlarını tarayıcı üzerinden analiz etmek için geliştirilen hafif bir web uygulamasıdır.

## Çözdüğü Problem ve Hedef Kitle

- **Problem:** Yarış simülasyonlarından alınan çok kanallı CSV telemetri dosyalarını incelemek genellikle karmaşık masaüstü yazılımları veya ham tablolarla uğraşmayı gerektirir. Sürücülerin tur zamanı kayıplarını, frenleme noktalarını ve lastik ısınmasını tek bakışta görmesi zordur.
- **Kimin İçin Geliştirildi?** Yarış simülasyonu oyuncuları, amatör pist sürücüleri ve telemetri verileriyle sürüş tekniğini geliştirmek isteyen kullanıcılar.

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
└── public/
    ├── index.html
    └── styles.css
```
