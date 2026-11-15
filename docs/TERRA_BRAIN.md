# AgroMax Terra Brain

Terra Brain aynı AgroMax oturumunu, işletmeyi ve parsel kimliğini kullanır. Üretim API köprüsü ile ticari Nitro çalışma yolu aynı Araştırma sözleşmesini çağırır. İlk bilimsel kapsam Trakya kışlık buğdayında günlük kök bölgesi su dengesi. Araştırma sonuçları saha doğrulaması bekleyen pilot kayıtları olarak sunulur.

## Araştırma akışı

1. **Araştırma → Veri ve harita.** Çizilmiş bir parsel, sezon başlangıç yılı ve veri türü seç. Şablondaki sütunlarla UTF‑8 CSV hazırla. Kaynağı, yöntemi, gözlem ya da yayın tarihini ve kullanım iznini kaydet. **Dosyayı kontrol et** satır hatalarını kayıt oluşturmadan gösterir. **İşleme al** seçili parsel geometrisi altında sürüm oluşturur.
2. **Deney ve tahmin.** Toprak ve meteoroloji sürümlerini seç. Kayıtlı sulama isteğe bağlı olarak A planına bağlanır. B planına tarih ve brüt su miktarlarını ekle. Tarama seçeneği, belirttiğin gün ve dozlarla su ve bütçe sınırlarında adayları karşılaştırır.
3. **Araştırma raporları.** Bir işi aç, grafikten günü seç, **B − A** sütunu ve kaynak sürümlerini incele. **Sürümlü rapor** girdi manifestosu, yöntem, veri kaynakları, sonuç ve SHA‑256 özetini içeren JSON indirir. **Yeniden üret** aynı yöntem ve sabit girdileri kullanır.
4. **Ölçümle karşılaştır.** Kullanılan senaryoyla sahadaki sulama uygulamasının eşleştiğini kontrol et. Toprak nemi dosyasını yükle ve senaryoyu seç. Sonuç, model günüyle aynı günün tam kök profili için mutlak hata ve yanlılığı gösterir.
5. **Araştırma tahmini.** Son model gününde yayımlanmış 1–7 günlük tahmini arşivle. Araştırma koşumu fiziksel model ve sabit referans değerini üretir. Veri boşluğunda ilgili ufuk boş kalır. Gelecek sulama varsayımı API’de tarih ve brüt suyla sabitlenebilir. Ekrandaki varsayım sulamasız senaryodur.

| CSV türü | Sütunlar | Kabul |
| --- | --- | --- |
| Toprak profili | `field_capacity,wilting_point,root_depth_m,initial_depletion_mm,unit` | Bir profil. Hacimsel su içeriği `m3/m3` veya `%`, derinlik metre, başlangıç açığı mm. |
| Meteoroloji | `date,et0_mm,effective_rain_mm,crop_coefficient,temperature_c` | Model için en az iki ardışık gün. ET₀ ve etkin yağış günlük mm, sıcaklık °C. |
| Sulama | `date,gross_mm` | Tarih başına tek günlük toplam, mm. |
| Toprak nemi | `date,top_cm,bottom_cm,moisture,unit` | Ölçüm kaynağı ve yöntem zorunlu. Derinlik cm, hacimsel su `m3/m3` veya `%`. |
| Hava tahmini arşivi | Meteorolojiyle aynı | Sağlayıcı yayın tarihinden sonraki yedi gün. BAŞLANGIÇ günü modelin son gününe eşleşir. |

Dosya üst sınırı 200 KB. Sütun ayırıcı virgül veya noktalı virgül, ondalık ayırıcı nokta, tarih `YYYY-MM-DD`. (Y) sezonu 1 Temmuz (Y) ile 31 Ağustos (Y+1) arasındadır. Kışlık buğdayın sezon geçişini kapsar. Özgün CSV ve dönüşüm saklanır. Dosya yükleme izni kullanıcının beyanıdır. Pilotun bilimsel onayı ayrıca yapılır.

## Hesap ve kanıt

- Kernel mevcut `fao56-daily-root-zone-v1` motorunu çağırır. Toprak kapasitesi ve kök derinliği çalışma boyunca sabittir. Kc, ET₀ ve etkin yağış veride beyan edilir. Taşma aynı günde drenaj olarak çıkar. Toprak, ürün gelişimi ve sulama verimi model varsayımlarıdır.
- Her deney günlük su kütlesi dengesi için (10^{-6}) mm eşik kullanır. Sulama taraması en çok 1.000 aday hesaplar ve kısıt içindeki adayları stres günü, su ve maliyete göre sıralar. Kesilen tarama raporda işaretlenir. Duyarlılık, ayrı ayrı ET₀ ±%10 hesaplarından gelir.
- Toprak ölçümü tarih ve derinlik profiliyle eşleştirilir. Toprak tabakaları kök derinliğini üstten alta boşluksuz kaplamalı. Hacimsel değerleri katman kalınlığıyla ağırlıklandır. Model aralığı dışındaki ölçümler ve kesik profiller ayrı raporlanır. MAE ve yanlılık eşleşmiş günlere aittir.
- Kaynaklı inceleme, sezon içindeki mevcut Sentinel‑2 iddia ve kapsama kayıtlarını kullanır. Toprak, meteoroloji, sulama ve nem kayıt boşluklarını saha sorularına dönüştürür. Kalibrasyonsuz tahminlerin araştırma ufukları 1, 3 ve 7 gündür. Bu sürümde tahmin aralığı ve stres olasılığı yayımlanmaz.

## Mimari ve sınırlar

- `commercial/terra-brain/kernel.ts` girdi doğrulama, yöntem ve hesaplamayı içerir. `service.ts` parsel yetkisi, girdi sürümü, kuyruk, sonuç ve kaynak yaşam döngüsünü yürütür. `0009_terra_brain.sql` işletme/parsel bileşik yabancı anahtarlarını, zaman indekslerini ve RLS'yi kurar. Üretimde yayın sırasında mevcut parsel tablosu yetkili kaynaktır.
- İstek anahtarı, kopyalanan girdi manifestosu ve iş aynı işlemde yazılır. İşçi iki dakikalık deneme kimliğiyle işi alır. Süresi dolan deneme tekrar alınır. İptal ve yetki/sınır değişimi yayını engeller. İşletme başına 20 açık iş ve iki etkin deneme sınırı vardır. Sonuç, olay ve mevcut AgroMax sistem bildirimi aynı işlemde görünür.
- Sözleşme mevcut oturumla `GET /api/v1/terra-brain/openapi.json` üzerinden okunur. Yazma `Idempotency-Key` ister. Kuru CSV kontrolü buna ihtiyaç duymaz. İş ve raporlar opak kimlikle istenir ve işletme/parsel erişimi sunucuda yeniden denetlenir.
- İlk sürüm, küçük CSV’leri özel PostgreSQL şemasında tutar. Mevcut uydu arşivi ve sağlayıcı ayarları kullanımdadır. Terra Brain için ayırılmış COG ve Parquet deposu, PostGIS sorguları, otomatik harici veri ithali ve bağımsız TerraOS olay teslimi sonraki aşamadır.

## Yerel ve staging işletimi

1. İzole PostgreSQL için `docker compose -f compose.terra-brain.yml up -d postgres` çalıştır. Yerel API için `AGROMAX_POSTGRES_DRIVER=pg` ve `AGROMAX_DATABASE_URL=postgres://agromax_pilot:local-isolated-pilot@127.0.0.1:5438/agromax_pilot` kullan. Yerelde `npm run db:migrate` ve `npm run dev:commercial` çalıştır. Üretim bağlantılarını bu ortamın dışında tut.
2. İzole AgroMax oturumu aç ve çalışma alanı kimliğini `/api/v1/bootstrap` yanıtından al. API ve işçi için `AGROMAX_TERRA_BRAIN_ENABLED=true` ve `AGROMAX_TERRA_BRAIN_ORGS` ayarla. `docker compose -f compose.terra-brain.yml up -d worker` ile tüketiciyi başlat. Node üzerinden çalışırken `AGROMAX_TERRA_BRAIN_WORKER_DATABASE_URL` ayarla ve `npm run worker:terra` çalıştır.
3. Staging’de PostgreSQL işçi kimliğini uygulama ve migration kimliğinden ayrı oluştur. İşçi `terra_brain` şemasında kuyruk güncellemelerini, sürüm/event/bildirim eklemeyi ve işletme/parsel üyeliğini okumayı gerektirir. Yayın sırasında `FOR SHARE` için ilgili kayıt tablolarında satır kilidi yetkisini sınayarak ver. İşçiye şema sahipliği veya `BYPASSRLS` verme. Oturumsuz tarayıcı rollerine özel şemayı açma.
4. Çalışma logunda `terra.heartbeat` ve `terra.job` kayıtlarını izle. Son sinyal, kuyruk yaşı, deneme sayısı ve süre için uyarı kur. `AGROMAX_RELEASE` değerini uygulama commit’i olarak sabitle ve kullanılan OCI imaj özetini sürüm kaydına yaz. Veritabanına yakın AB bölgesinde tek işçiyle başla.
5. Yedek ve geri dönüş provasına mevcut legacy tablo ve nesne deposu envanterini de kat. `commercial/operations/backup.ts` şifreli ticari yedekte üç özel Terra Brain tablosunu saklar. Üretim köprüsü için legacy kimlik ve oturum tablolarını da kapsayan tam PostgreSQL yedeği gerekir. Yedeği boş hedefe dön, girdi ve çıktı özetlerini karşılaştır, süreyi kaydet. Hedef RPO 24 saat, RTO 4 saattir.
6. Geri almada API’nin iş kabulünü kapat, işçiyi durdur ve önceki uygulama/işçi sürümünü etkinleştir. Özel tablolar yerinde tutulur. Yeni işçi eski yöntem manifestolarını okuyabildiğinde yarım kalan kiralar tekrar alınabilir.

## Kabul durumu

| Yetenek | Uygulama | Otomatik test | Gerçek sağlayıcı | Bilimsel doğrulama | Üretim onayı |
| --- | --- | --- | --- | --- | --- |
| CSV, kaynak sürümleri, kuyruk ve bildirim | Var | İzole API ve üretim köprüsü, 20 tekrar, iki tüketici, süre aşımı, iptal, RLS, şifreli geri yükleme | CSV saha dosyası bekleniyor | Uzman denetimi bekleniyor | Bekliyor |
| A/B su dengesi ve tarama | Var | Kütle dengesi, bağımsız aritmetik örneği, tekrar üretim, masaüstü/mobil rapor | Uygulanmaz | İzinli gerçek parsel ve sezon bekleniyor | Bekliyor |
| Model–ölçüm karşılaştırması | Var | Tam ve kesik profil, yanlılık ve MAE | Saha ölçümü bekleniyor | Örnekleme yöntemi onayı bekleniyor | Bekliyor |
| Fiziksel araştırma tahmini ve sabit referans | Var | Eksik yedi günlük veri, ufuk değerleri, arşiv sürümü | Doğrulanmış hava arşivi bekleniyor | Bağımsız geçmiş sınama bekleniyor | Bekliyor |
| Kalibrasyon, MLflow, tahmin aralığı ve model kararı | Açılmadı | Bekliyor | Bağımsız ölçüm bekleniyor | En az 10 bağımsız parsel-sezon, iki sezon, ufuk başına 50 eşleşme ve uzman imzası bekleniyor | Bekliyor |
| Gelişmiş NASA/GIS işçileri ve TerraOS aboneliği | Açılmadı | Bekliyor | Doğrulanmış veri, lisans ve kimlik sözleşmesi bekleniyor | Ürün bazlı doğrulama bekleniyor | Bekliyor |

Gerçek saha dosyaları bu geliştirme teslimine dahil edilmedi. Bağımsız bölgesel/sezonsal kalibrasyon, 20 oturum ve 100 iş yükü ölçümü, 72 saatlik kararlılık çalışması, staging nesne yedeği ve üretim pilotu açılışı sürüm kabulünde duruyor.
