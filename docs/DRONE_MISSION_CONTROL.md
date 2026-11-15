# Drone Görev Kontrolü

Dron bağlantıları sayfası seçili parselin güncel sınırına bağlanır. Sahne, mevcut MapLibre uydu altlığını ve Mapzen Terrarium yükseklik döşemelerini kullanır. Yapılandırılmış Mapbox Satellite kaynağı önce gelir. Yüklenen ve mevcut geometriyle eşleşen özel ortomozaik ile DTM isteğe bağlı açılır. WebGL kesilirse Leaflet üzerinde sınır, rota ve konum gösterilir. [MapLibre arazi üzerinde özel katmanlar](https://maplibre.org/maplibre-gl-js/docs/examples/add-custom-layers-that-follow-the-terrain/)

## Uydu, rota ve simülasyon

14 Kasım yerleşiminde 3D sahne ana çalışma yüzeyidir. 1440 × 1000 px tarayıcıda harita alanı 1336 × 738 px ölçüldü. Bu, tüm görünümün %68,47'sidir. Görev, katman, telemetri ve inceleme panelleri tek tek açılır. Menü bu ekranda dar başlar ve kullanıcı tarafından genişletilebilir. Mobilde araç şeridi haritanın altına geçer ve seçilen panel kendi kaydırılabilir bölümünde açılır. Uydu altlığı parselin çevresinde kesintisiz devam eder.

Kamera, serbest coğrafi gezinme, konum takibi, yönle hizalı yakın takip, ufuk ve üstten görünüm sunar. Açık paneller Escape ile kapanır. Tam ekran görünümde klavye odağı sahne kontrollerinde tutulur. Azaltılmış hareket tercihi kamera geçişlerini doğrudan uygular. Görüntü kalitesi otomatik, yüksek ve düşük güç seçenekleriyle değiştirilebilir. Otomatik ayar yazılımsal WebGL'de piksel oranını düşürür.

Harita üzerindeki uçuş özeti, simülasyonun veya seçilen gerçek cihazın anlık değerlerini gösterir ve telemetri panelini açar. Simülasyon irtifası zemine göre AGL, cihaz irtifası kalkışa göre etiketlenir. Bayat veya eksik cihaz değerleri çizgiyle gösterilir. Gerçek cihaz bağlantısına geçildiğinde simülasyon değerleri bu özete taşınmaz.

Simülasyon saati monotonik geçen zamana dayanır. Düşük kare hızında uçuş zamanı yavaşlamaz. Başlatma, duraklatma, hız değiştirme ve zaman seçimi aynı saati kullanır. WebGL modeli bu saati çizim sırasında okur. Araç panelleri 10 Hz'de güncellenir; bütün form ağacı her karede yeniden oluşturulmaz. Kamera ve coğrafi iz güncellemeleri ayrıca 6 Hz ile sınırlandırılır. Azaltılmış hareket tercihinde pervane animasyonu durur. Fiziksel cihaz kare süresi kabulü bu uygulama ayrımından bağımsız ölçülmelidir.

Mobilde uçuş özeti açık harita atıflarının boyuna göre yer değiştirir. Nokta düzenleme sırasında gizlenir. Kaynak/lisans metni ve rota tutamaçlarıyla örtüşmez.

Nokta düzenleme modunda numaralı tutamaçlar fare veya dokunmayla sürüklenebilir. Odaklanan tutamaç yön tuşlarıyla, Shift ile daha büyük adımla taşınabilir. Yeni nokta veya iki komşu bağlantısı sınırdan çıkarsa önceki konum korunur. Geçerli değişiklik önceki simülasyon incelemesini sıfırlar. [MapLibre sürüklenebilir işaretçi](https://maplibre.org/maplibre-gl-js/docs/examples/create-a-draggable-marker/)

## Görevden sahaya geri bildirim

İnceleme çekmecesi Dosya, Saha ve Geçmiş alanlarına ayrılır. Paneller ve bu alanlar arasında geçerken yazılmakta olan saha formu korunur.

Saha alanında kaydedilmiş bir simülasyon incelemesi ve rota noktası seçilir. Tarih, kullanıcı gözlemi, gerçek gözlem koordinatı ve isteğe bağlı cihaz ölçümü kaydedilir. Hacimsel nem, toprak/hava sıcaklığı ve debi mevcut birim sözlüğünü kullanır. Sıfır değeri eksik veri sayılmaz. Simülasyon dosyası gerçek uçuş yapılmış olarak işaretlenmez.

- Kayıt mevcut `observation` türüdür. İsteğe bağlı `payload.missionFinding` alanı görev kimliği, tam görev sürümü, nokta indeksi ve kullanıcının değişim değerlendirmesini saklar. Veritabanı şema değişikliği gerekmez.
- Sunucu kuruluş/hesap, parsel, güncel geometri, değiştirilemez görev revizyonu, nokta ve koordinatı tekrar doğrular. Gelecekteki gözlem tarihi reddedilir. Önceden kaydedilen görev bağlantısı genel saha düzenleyicisinde de korunur. Değiştirmek için yeni saha gözlemi gerekir.
- Saha kayıtları parsel geçmişine, sürümlere ve mevcut kanıt paketi ihracına girer. Görev daha sonra düzenlense de gözlemin özgün görev sürümü değişmez.
- Yeni uydu çekimi kontrolü aynı sağlayıcı, yöntem ve indeks için yapılır. Başlangıç ölçümü bulunmalı, dönemler örtüşmemeli ve geçerli piksel kapsamı bilinen kaynak eşiğini karşılamalıdır. Eksik dayanakta fark üretilmez.
- Gösterilen indeks farkı kayıtlı dönemlerin **parsel ortalamaları** arasındadır. Noktasal nem, hastalık veya müdahale etkisi olarak sunulmaz. Kullanıcının saha beyanı otomatik bilimsel doğrulama değildir.

Uyduyla yeniden kontrol mevcut yetkili katalogdan yeniden üretilir. Ayrı, dondurulmuş bir sonuç raporu veya nedensel müdahale değerlendirmesi henüz değildir. Gerçek drone görüntüsü yükleme mevcut ortomozaik/DTM hattında sürer. Ölçümlü uçuş, görüntü geri alımı, müdahale onayı, uygulama ve kontrol bölgeli nedensel değerlendirme ayrı kabul bekler.

- Uydu taraması aynı sağlayıcı, yöntem ve indeksle alınan kayıtlı çekimleri karşılaştırır. Piksel değerleri mevcut yetkili raster API'sinden alınır. Güncel, önceki ve nicel fark katmanı tarih, ölçek ve seçilen pikselin değeriyle gösterilir. Aynı ızgaradaki negatif MAD sapmaları saha inceleme adaylarıdır. İşaretler, parsel sınırına kırpılmış uydu piksel alanını gösterir.
- Noktalar haritadan veya WGS84 koordinatı girilerek düzenlenebilir. Dönüş dahil rota parçalarının parsel sınırı ve deliklerle kesişimleri kontrol edilir. Kalkış ve iniş aynı konumdadır. Tek inceleme hedefi varsa kalkış noktası operatörce seçilebilir.
- İrtifa, simülasyonda yerel zemin üzerindeki yüksekliktir. Modelin sahnedeki konumu DEM ile hesaplanır ve uçak modeli okunabilirlik için büyütülür. Yatay hızlanma, dönme, dikey hız ve doğrusal batarya varsayımı ortak simülasyon zamanından alınır. Görüş alanı 66° × 48° nadir kamera için yatay referans yüzeyinde hesaplanır. Rota boyunca zemin profilinde DEM çözünürlüğü ve örnek kapsamı belirtilir.
- İndeks geçmişi aynı sağlayıcı ve işlem yönteminden oluşur. Düzenli ve yeterli seri varsa son değerin sürdüğü kısa vadeli senaryo ve geçmiş adım hatalarından türetilmiş ampirik aralık gösterilir. Bu aralık ürün veya verim tahmini için doğrulanmış değildir.
- İncelenen simülasyon, JSON olarak indirilebilir veya saha incelemesine kaydedilebilir. Sunucu güncel parsel sınırını, kayıt yetkisini ve varsa kaynak gözlemlerini doğrular. İnceleme JSON'u makine yürütmesi kapalı olarak üretilir.

## Cihaz modu

- Masaüstü Chrome veya Edge'de HTTPS ya da localhost üzerinden USB telemetri portunu ve baud hızını seç. PX4/ArduPilot sinyali alındığında sistem, seçilen portun ilk desteklenen uçuş kontrolcüsüne bağlanır. MAVLink 1/2 üzerinde son beş saniyenin HEARTBEAT, GLOBAL_POSITION_INT, SYS_STATUS ve MISSION_CURRENT paketleri yorumlanır. CRC paket bütünlüğünü denetler. Cihaz imzası ve fiziksel kimlik doğrulaması ayrı kabul gerektirir. İrtifa etiketleri, deniz seviyesini ve eve/kalkışa göre irtifayı ayırır. [MAVLink ileti dizilimi](https://mavlink.io/en/guide/serialization.html) · [Web Serial API](https://developer.chrome.com/docs/capabilities/serial)
- Tarayıcının kamera olarak gördüğü yerel USB video alıcısı açılabilir. Görüntü cihazda kalır. Video ve telemetri saatleri eşleştirilmez. Simülasyona dönünce yerel akışlar kapatılır.
- QGroundControl görev yükleme ve DJI SDK ayrı uyumluluk adımları gerektirir. Donanım veya simülatörle doğrulanmış görev aktarımı, uçuş komutları ve üretici kamera bağlantısı şu anda kapalıdır. Engel, hava sahası ve uçuş emniyeti fiziksel operasyon için doğrulanmalıdır. [QGroundControl plan biçimi](https://docs.qgroundcontrol.com/master/en/qgc-dev-guide/file_formats/plan.html)

Model atfı `public/visuals/mission-drone.txt` dosyasındadır.

Drone varlığı yaklaşık 2,42 MB'tır. Blender 5.2.2 ile dört pervane pivotu hazırlandı. Pervaneler ortak simülasyon saatini kullanır. Hazırlama işlemi `scripts/prepare-mission-drone.py` üzerinden kaynak ve çıktı GLB yollarıyla tekrarlanabilir.

14 Kasım kabul kaydı

- Tip kontrolü ve iki üretim derlemesi geçti. Güncel birim/API takımı 94 test, ticari çalışma alanı takımı 24 test geçti.
- Drone ve uzamsal kabul, masaüstünde dokuz ve mobilde dokuz olmak üzere 18 akışın tamamını tek koşuda geçti. Görev bulgusunu kaydetme/yeniden açma, hata sonrası formu koruma, sıfır ölçüm, sürüm bağlantısı, yeni çekim karşılaştırması ve klavye/fareyle nokta taşıma kapsandı. Son koşuda Drone Görev Kontrolü donanım hızlandırmalı WebGL kullandı. Eski uzamsal etütler yazılımsal WebGL koşulunu da korur.
- Uydu değişiminden rota, koordinat düzenleme, 2D/3D, gerçek kamera eğimi, tam ekran, görüş izi, simülasyon ve kalıcı inceleme doğrulandı. Seri bağlantı kesintisi, kurum/parsel kapsamı ve bozuk kaynak davranışları ilgili testlerde kapsandı.
- Tarayıcı kayıtları 1440 ve 390 px için alındı. 360 ve 768 px genişliklerinde taşma kontrolü yapıldı. Trakya ekran görüntülerinde Mapbox'tan gelen gerçek tarım görüntüsü üzerine örnek sınır ve simülasyon rotası yerleştirildi.
- Test rasterları, DEM ve MAVLink paketleri izole fixture'lardır. MAVLink ayrıştırma ayrıca PyMAVLink 2.4.50 tarafından üretilen referans paketlerle doğrulandı. Fiziksel cihaz, DJI, görev yükleme ve kamera kalibrasyonu dış kabul bekliyor.
- Temsili buğday etüdünün yazılımsal SwiftShader profilinde masaüstü p95 yaklaşık 350 ms, mobil p95 yaklaşık 67 ms ölçüldü. Bu ölçüm kamera hareketi sırasında tarayıcı RAF aralıklarını kaydeder. Drone haritasında otomatik piksel oranı ve düşük güç seçeneği sunulur.
- Drone sahnesi 1440 × 1000 px üzerinde gerçek AMD Radeon Graphics / Direct3D11 WebGL ile ayrıca ölçüldü. Simülasyon, takip kamerası, telemetri ve 2D/3D geçişleri sırasında kayıt açıkken 826 RAF örneğinde p95 33,3 ms; kayıt kapalıyken 761 örnekte p95 33,4 ms ölçüldü. Bu tek masaüstü GPU'sundaki tarayıcı kare aralığıdır. 33 ms sınırı kesin olarak karşılanmadı. Gerçek telefon, GPU zamanlayıcı sorgusu ve uzun süreli cihaz profili ayrı kabul bekler.
- Yaklaşık 16 saniyelik gerçek tarayıcı etkileşim videosu alındı. Uydu görüntüsü gerçek Mapbox verisidir; sınır ve uçuş açıkça örnek/simülasyon olarak etiketlidir. Video, doğrulanmış donanım WebGL üzerinde 25 fps tarayıcı kaydından kırpıldı. Yapay ara kare veya kurgulanmış telemetri kullanılmadı.

Güncel kabul günlükleri `data/terraos-final-browser.log`, `data/terraos-feedback-unit.log`, `data/terraos-feedback-commercial-tests.log`, `data/terraos-feedback-production.log`, `data/terraos-feedback-commercial.log`, `data/terraos-mission-recording.log` ve `data/terraos-mission-profile.log` dosyalarındadır. Ekranlar, video, yerleşim ve kare profilleri çalışma alanının `outputs/agromax-drone-mission` klasörüne kopyalandı. Başlangıç commit'i 198ca7d ve dal codex/agromax-3d-revision'dır.

Donanımlı kabulü yeniden çalıştırmak için PowerShell'de `$env:AGROMAX_GPU_QA='true'` ile ortamı ayarla ve `npx playwright test e2e/drone-mission.spec.ts e2e/spatial.spec.ts` çalıştır. Video için ayrıca `$env:AGROMAX_RECORD_MISSION='true'`, video olmadan kare örneklemesi için `$env:AGROMAX_PROFILE_MISSION='true'` kullan; `--project=desktop -g "mission control renders"` seçenekleriyle tek testi seç. GPU modu, [Chromium'un belgelenmiş `--enable-gpu` seçeneğini](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/gpu/using-gpu-hardware-in-headless-chrome.md) kullanır. Sayfanın gerçek WebGL sürücüsü ölçüm JSON'una yazılır. Bu değişkenler ürün için yeni bir API anahtarı gerektirmez.

TerraOS genel hedefi sürüyor. Fotogrametri, kalibre bitki tespiti, AR, gerçek operasyon aktarımı, kapalı döngü değerlendirme ve bölgesel ölçek kabulü kapsam matrisinde açık kalıyor.
