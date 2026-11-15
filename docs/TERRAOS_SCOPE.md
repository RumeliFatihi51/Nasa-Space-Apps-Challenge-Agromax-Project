# AgroMax TerraOS · Kapsam ve doğrulama

Bu kayıt, TerraOS brifinin 19 bölümünü mevcut çalışma ağacındaki kanıtla eşler. Bir modülün bulunması, bütün kabul koşullarının karşılandığını göstermez.

| Bölüm | Mevcut dayanak | TerraOS kabulü için gereken |
|---|---|---|
| 1 · Sinematik tasarım | Canopy/Fieldwork, Saha Stüdyosu ve %68,47 ekran alanı kaplayan Drone Görev Kontrolü. Mapbox/DEM, açılır paneller, mobil araç şeridi, takip kamerası | Ortak koyu çalışma yüzeyleri, tüm ana modüllerde masaüstü/mobil görsel kabul |
| 2 · Drone Görev Kontrolü | Georeferanslı uydu/DEM, CC0 drone GLB, sınıra bağlı rota, kamera takibi ve izi, rota zemini, kalıcı inceleme, salt okunur USB MAVLink ve yerel video | Fiziksel cihaz testi, engel ve hava sahası kaynakları, her hedef adaptör için doğrulanmış oturum ve uçuş öncesi yetki |
| 3 · Uydu → drone | Aynı ızgaradaki MAD inceleme noktaları, tarih katmanları, kaynak ve sınıra bağlı simülasyon kaydı; görev sürümü/noktasına bağlı kalıcı saha bulgusu; uyumlu yeni çekimde gözlemsel parsel farkı | Dondurulmuş yeniden değerlendirme raporu, görüntü geri alımı ve değerlendirme; gerçek cihazda ayrı yetkili aktarım |
| 4 · 3D/4D | Saha Stüdyosu, DEM, ortomozaik/DTM kayıtları, tarihli indeks katmanları ve Arazi Hafızası | Uçuş fotoğraflarından doğrulanmış fotogrametri/ortofoto, nokta bulutu, ölçüm araçları ve zamanlı model karşılaştırması |
| 5 · Tek tek bitki | Bitki Tanıma ve koşullu Filiz fotoğraf akışı | Georeferanslı bitki/boşluk/sıra/yoğunluk/boy tespiti, çözünürlük kapıları, ürün bazlı kalibrasyon ve saha doğrulaması |
| 6 · Drone AR | Zaman damgalı MAVLink telemetrisi ve yerel USB video alıcısı | Üretici kamera akışı, iç/dış kalibrasyon, zaman eşleme ve sahada ölçülen yeniden projeksiyon hatası |
| 7 · Hidroloji | DEM eğimi ve parsel içi D8 yüzey akış taraması, parsel geneli su dengesi | Drenaj ve yağış senaryosu, parsel dışı havza, hidrolik kalibrasyon |
| 8 · Earth Engine | Dijital İkiz, saha kayıtları, uydu gözlemleri, toprak/hava girdileri | Tarihli ortak parsel durumu, kaynak ve eksiklik takibi, sensör/işlem geçmişi ve senaryo çıktılarının ayrılması |
| 9 · Senaryo ve ekonomi | FAO-56 buğday pilotu, A/B sulama, maliyet ve kaynak karşılaştırması | Yağış/sıcaklık ve gübre senaryoları, kalibrasyon ve belirsizlik, verim için veri yeterliliği |
| 10 · Foundation Intelligence | Kayıt kontrolleri, iddia/kanıt hattı, Filiz | Zamanlı çok kaynak füzyonu, eksik kanıt ve neden hipotezleri, kalibrasyon ve kaynaklı Filiz yanıtı |
| 11 · Autonomy | Saha görevleri, cihaz taslakları, simülasyon | Cihaz yetenek kaydı, onaylı komut geçidi, süreklilik, yetki, hata yönetimi ve uçtan uca cihaz testi |
| 12 · Closed-loop | Saha inceleme dosyası, analiz referansları, kanıt paketi; görev sürümüne bağlanan noktasal saha beyanı ve birimli sensör ölçümü, yeni uydu gözlemi kontrolü | Onay, müdahale ve yeniden değerlendirmenin tek zincirde sürümlenmesi; kontrol bölgeleri, hava ve karıştırıcı etkenlerin kaydedilmesi; nedensel doğrulama |
| 13 · Earth Watch | Çoklu parsel atlası ve bölgesel görünüm | Sunucu taraflı sayfalama ve toplulaştırma, bölgesel ölçek/kapsam, kooperatif görünümü, yük testi ve raporlama |
| 14 · Orbital Network | Sentinel/Landsat/HLS, açık NASA WMTS, Earthdata sahne kataloğu, alıcı sözleşmesi | ECOSTRESS/NISAR/EMIT sayısal hatları, kaynak bazlı güncelleme işleri, alıcı/SDR, doğrulanmış yer istasyonu kimliği ve kayıt akışı |
| 15 · Zaman serisi | Uydu geçmişi, arazi hafızası, meteoroloji, drone ekranında ampirik kısa vadeli varsayım | Eksik gün ve mevsim hizalaması, sıcaklık/yağış/nem eşzamanlı görünümü, doğrulanmış belirsizlik |
| 16 · Mimari | Vite, Node, PostgreSQL/Drizzle, mevcut kuyruk ve yedekleme testi | Büyük veri ölçümleri, arka plan işleme ve gözlemlenebilirlik, gerçek zamanlı cihaz adaptörleri, kurtarma provası |
| 17 · Durumlar | Modül bazlı boş, hata ve erişim durumları | Bütün kullanıcı akışlarında mobil ve klavye QA, bağlantı/donanım durum kanıtı |
| 18 · Kabul | Modüle özel birim ve tarayıcı testleri | Briefteki 20 adımın bir parsel üzerinde gerçek veya işaretli simülasyonla doğrulanması, performans ve regresyon kanıtı |
| 19 · Strateji | Çalışan modüller ve üretim öncesi dal | Aşama başına kod ve kabul kaydı. Eksik bağımlılık ve doğrulanmamış davranışlar açık kalır. |

## Çalışma sınırı

Sahaya ait fotogrametri, kalibrasyon, yer istasyonu veya canlı cihaz testi için kullanıcıya/kuruluşa ait veri ve fiziksel erişim gerekir. Açık kaynak uydu görüntüleri ve mevcut lisanslı modeller geliştirme için kullanılabilir. Simülasyon telemetrisi gerçek cihaz durumu olarak yayımlanmaz.
