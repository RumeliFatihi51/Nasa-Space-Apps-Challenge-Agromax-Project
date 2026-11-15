# AgroMax Uydu ve Drone Laboratuvarı

Kullanıcının Google AI Studio ZIP dışa aktarımından alınmıştır. Kaynak ZIP SHA-256: `C50770CBAB4BE7D7EFE73503B01034D295E94F5CB1B009C6AD1E9ACD55CCF87D`.

Uydu/yörünge, yer istasyonu, RF, veri alımı, spektral işleme, harita/parsel, görev planlama, drone fiziği, canlı simülasyon, raporlama, ayarlar, Google görünüm/AR ve bütün model/doku üreticileri korunmuştur. Kullanıcının referans görseli `public/assets/aistudio` içinde, metin referansı `reference` içinde tutulur. Metin referansı web üzerinden yayımlanmaz.

Platformdaki 3D Saha Stüdyosu → **Uydu ve Drone Laboratuvarı** düğmesi çalışma alanını açar. Dönüşte iframe ve kendi WebGL bağlamı kaldırılır. Ana platformun uydu kaynakları, kayıtları ve stilleriyle ayrı yaşam döngüsü vardır. Kaynak kodlar uygulamanın kendi reposundadır; haricî AI Studio oturumuna bağımlı değildir.

Parsel sınırı aynı origin ve parent window doğrulanmış mesajla alınır. İlk sürüm tek dış halkalı Polygon içe aktarır. Delikli/MultiPolygon geometri sessizce sadeleştirilmez; uyarı kaydıyla örnek sahne korunur. Harita/geometri girişi mevcut AgroMax kayıtlarını değiştirmez. 3D parsel çizgisi güncel sınırı takip eder. Arazi rölyefi, yapılar, bitkiler, sensörler, spektral değerler, RF ve uçuş çıktıları **simülasyondur**. Saha ölçümü veya gerçek cihaz bağlantısı olarak sunulmaz.

İyileştirmeler: gerçek fiziksel Sky modelinden açık hava PMREM yansıması, öğle/altın saat eşlemesi, pozlama dengesi, kaynak temizliği, mobil piksel oranı sınırı, mobil açılır yan paneller, kaydırılabilir kamera araçları ve platformla aynı yerel Manrope yazı tipi. Mevcut kaynakta bulunan Google harita/Street View yetenekleri korunur; isteğe bağlı `VITE_GOOGLE_MAPS_API_KEY` olmadan Google katmanı açılmaz. Sunucuya ait gizli anahtarlar istemci derlemesine alınmaz.

`npm run build:station` bağımsız dosyaları `public/ground-station` altına üretir. İki ana üretim derlemesi ve geliştirme başlangıcı bu adımı otomatik çalıştırır. `npm run typecheck` hem platformu hem laboratuvarın tüm TypeScript kaynaklarını denetler.

Kabul: `e2e/ground-station.spec.ts` masaüstü ve mobilde açma, parsel aktarımı, simülasyon kontrolleri, modüller arası gezinme, taşma ve stüdyoya dönüşü gerçek derlenmiş uygulamada doğrular. Test verileri açıkça fixture olarak etiketlenir.
