# QGroundControl uçuş planları

Drone Görev Kontrolü → **.plan** paneli. Mevcut simülasyon/telemetri ve inceleme JSON’u korunur. Yeni kayıt türü `flight_plan`, mevcut kuruluş kapsamlı platform kayıtları ve sürüm geçmişinde saklanır; yeni veritabanı tablosu veya migration gerekmez.

## Desteklenen akış

1. Tüm parsel, güncel geometriye bağlı kayıtlı reçete bölgesi veya uydu değişim taramasındaki inceleme hedefi seçilir. Uydu hedefi operatör tarafından seçilmiş gözlem alanıdır; eksiklik/hastalık teşhisi veya onaylanmış uygulama bölgesi değildir.
2. PX4/ArduCopter varsayımı, motor sayısı, gerçek kalkış koordinatı, ölçülmüş kalkış AMSL yüksekliği, kalkışa göre irtifa, hız, süre, gözlem genişliği, örtüşme ve yön girilir. Cihaz profili fiziksel olarak doğrulanmış sayılmaz.
3. Yerel tarama hatları ve kalkış/dönüş bağlantıları hesaplanır. Hatlar hedef içinde, bağlantılar parsel içinde olmalıdır. Delik/çukur/ayrık geometri üzerinden geçiş gerekiyorsa rota reddedilir; ayrı uçuş veya farklı yön/kalkış noktası gerekir. Fiziksel engeller modelde bulunmaz.
4. Operatör uyarıyı kabul eder, planı kaydeder, `.plan` indirir. Yetkili sunucu dosyayı kayıttan yeniden hesaplar. Sahiplik, parsel/geometri, kayıt sürümü ve kaynak kayıtlar her indirmede yeniden kontrol edilir. Eski geometri ve sürüm `409` döndürür.
5. Dosya QGroundControl Plan ekranında açılır; cihazla uyumluluk ve uçuş öncesi kontroller yapıldıktan sonra operatör tarafından MAVLink bağlantısıyla araca yüklenir. SD karta kopyalamak görevi başlatmaz. AgroMax bu akışta aracı silahlandırmaz, görevi yüklemez veya başlatmaz.

## Dosya ve fiziksel sınırlar

- QGC Plan v1 / mission v2, sıralı SimpleItem kimlikleri; PX4=12, ArduPilot=3; quad=2, hexa=13, octo=14. Konumlar QGC’de `[enlem, boylam, irtifa]` sırasındadır.
- Yalnızca TAKEOFF (22), DO_CHANGE_SPEED (178), WAYPOINT (16) ve LAND (21). Son noktada kalkış yerine dönüş ve iniş vardır. `MAV_FRAME_GLOBAL_RELATIVE_ALT=3`, `AltitudeMode=1`: irtifa kalkışa göredir, AGL/terrain following değildir.
- **Pompa, röle, servo, doz veya kamera komutu yoktur.** Reçete miktarı sadece kaynak hazırlık bilgisidir. Mevcut kullanıcı donanımında dağıtıcı bulunmadığı için sulama/gübreleme/ilaçlama devre dışıdır.
- Geofence listeleri boştur; çizgisel parsel kontrolü cihazda geofence veya engelden kaçınma sağlamaz. Dönüş yarıçapı, waypoint kabulü, rüzgâr, zemin yüksekliği, batarya davranışı ve iniş güvenliği gerçek uçuşta ayrıca doğrulanmalıdır.
- En fazla 5 km genişlik, 140 tarama satırı, 290 rota noktası. Süre tahmini sabit yatay hız, 2 m/sn dikey hız ve dönüş başına 2 sn varsayar; girilen sürenin en fazla %80’i kullanılır. Bu bir enerji veya dayanıklılık doğrulaması değildir.
- Kenar uçları 1 m içeridedir; dar parçalar atlanabilir. Şerit genişliği gerçek kamera/irtifa bilgisine göre girilmelidir. Tam görüntü kapsamı veya gerçek uygulama kapsamı iddia edilmez.
- `.plan` **çalıştırılabilir bir görev dosyasıdır**. İnceleme etiketi veya JSON meta verisi cihazın çalışmasını engellemez. Pixhawk 2.4.8’in yazılımı/sürümü ve motor yapısı kullanıcı tarafından henüz doğrulanmadı; fiziksel uçuş veya SITL kabulü tamamlanmış değildir.

## API

`POST /api/platform/records` (`kind: flight_plan`) ve mevcut sürümlü `PATCH` sözleşmesi kullanılır. `GET /api/platform/records/:id/qgc-plan?version=N` özel, önbelleksiz `.plan` dosyası döndürür. Başka kuruluş/parsel kaynakları reddedilir. Reçete sürümü sabitlenir; analiz hedefinin tamamlanmış kaynak kaydı, tarihi, indeksi ve geometri kapsamı doğrulanır. Hedef poligonunun tarımsal yorumu onaylanmış sayılmaz.

## Kaynaklar

- [QGroundControl Plan biçimi](https://docs.qgroundcontrol.com/master/en/qgc-dev-guide/file_formats/plan.html)
- [QGC 4.4.5 irtifa modu enum’u](https://github.com/mavlink/qgroundcontrol/blob/v4.4.5/src/QmlControls/QGroundControlQmlGlobal.h)
- [MAVLink ortak komutlar](https://mavlink.io/en/messages/common.html)

Testler: `server/qgc-plan.test.js`, `server/platform.test.js`, `e2e/qgc-plan.spec.ts`. İzole test dosyaları gerçek uçuş için kullanılmaz; `outputs/qgc-plan/*-fixture.plan` yalnızca test verisidir.

### Yerel kabul kaydı · 14 Kasım 2026

- Tip kontrolü ve iki üretim derlemesi başarılı.
- Birim/API: 99/99; ticari çalışma yolu: 24/24.
- Mevcut Drone tarayıcı regresyonları: masaüstü ve mobil toplam 12/12. Yeni QGC akışı iki görünümde ayrıca çalıştırılır: 1440 × 1000 ve 390 × 844 CSS piksel.
- Yeni akış rota üretimi, onay kapısı, sahiplik kontrollü kaydetme/indirme, indirilen gerçek JSON içeriği, ayar değişiminde önceki dosyanın geçersizleşmesi, yenileme sonrası kayıt açma, taşma ve JavaScript hatalarını kontrol eder.
- İlk QGC tarayıcı denemesinde testteki tam etiket seçicisi seçenek metinleriyle eşleşmedi. Seçici erişilebilir `combobox` rolüyle düzeltildi. Son geçiş kaydı: `data/qgc-final-browser-tests.log`. Mevcut regresyon sonuçları: `data/qgc-browser-tests.log`; bu ilk dosyanın toplam durumu düzeltilmiş seçici denemesinden öncedir.
- Masaüstü/mobil ekran görüntüleri ve açıkça fixture olan `.plan` dosyaları: `outputs/qgc-plan/`.
- QGroundControl uygulamasında dosya içe aktarma, PX4/ArduPilot SITL ve fiziksel Pixhawk uçuşu bu yerel kabulde doğrulanmadı. Fiziksel uçuş veya uygulama güvenilirliği iddia edilmez.
