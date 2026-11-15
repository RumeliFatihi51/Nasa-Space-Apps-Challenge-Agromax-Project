# AgroMax Desktop

Windows masaüstü sürümü gerçek QGroundControl 5.1.5 ApplicationWindow içinde AgroMax web uygulamasını Qt WebEngine ile açar. Üstteki AgroMax ve QGroundControl düğmeleri aynı pencerede geçiş sağlar. Qt profili AgroMax oturumunu kendi uygulama dizininde saklar.

AgroMax uçuş ekranındaki `agromax-qgc://open` bağlantısı masaüstü WebEngine tarafından yakalanıp yerel Plan ekranını açar. Normal tarayıcıda aynı bağlantı kurulu masaüstü uygulamasını başlatır. Web profilinden gelen indirmeler zaman damgalı dosya adıyla Downloads klasörüne yazılır. Tamamlanan `.plan` indirimi üst çubukta içe aktarım düğmesini açar.

İçe aktarım QGroundControl'un mevcut `PlanMasterController.loadFromFile` yöntemini kullanır. Kaydedilmemiş plan, giriş doğrulama engeli veya kurulu araç durumunda işlem durur. Kullanıcı planı QGroundControl içinde inceler ve standart araç yükleme akışını kullanır. Bağlantı ve araç durumu AgroMax sayfası açıkken üst çubukta görünür.

Paket kaynağı resmî QGroundControl sürümüne sabitlidir. `brand.mjs` ardından `desktop.mjs` uygulanır. Qt WebEngine ve WebChannel, QGC'nin aynı Qt sürümündeki araç zincirine eklenir. Windows iş akışı kurucuyu üretir, kurup açılış kontrolü yapar ve başarılı çıktıyı GitHub Releases'e koyar.

Web sitesindeki **Windows uygulamasını indir** bağlantısından yayımlanan sürümler açılır. Depo özel olduğundan indirme GitHub hesabının depo erişimini gerektirir. Masaüstü uygulamasının AgroMax sayfaları internet erişimi gerektirir.

Yeni Qt/WebEngine kurucusu Windows derlemesi ve kurulu uygulama kontrolü tamamlanmadan doğrulanmış sürüm olarak değerlendirilmemelidir. Bu geliştirme aşamasında gerçek USB araç, fiziksel uçuş ve operasyon testi yapılmamıştır.
