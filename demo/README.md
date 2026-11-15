# AgroMax demo kurulumu

`demo/AGROMAX_SUPABASE_DEMO.sql` dosyasının tamamını, uygulamanın kullandığı Supabase projesinin SQL Editor ekranında çalıştır. Dosya mevcut AgroMax şemasını kullanır. Boş bir Supabase projesinde önce uygulama veritabanı migration'ları gerekir.

Bu kod sürümü çalışırken yeni misafir oturumları örnek kayıtlarla açılır. Önceden oluşturulmuş boş misafir hesapları da uygulamayı yeniden açınca aynı paketi alır. Her hesap kendi parsel ve kayıt kimliklerini alır. Kendi parselleri veya görevleri olan hesaplar otomatik olarak atlanır.

Demo üç Trakya parseli, her parselde sekiz tarih ve 24 indeks, 12 görev, 12 kanıt karşılaştırması, 36 çalışma dosyası, 42 işletme ve model kaydı ile üç rapor içerir. Uygulama, sentetik hava verilerini ve indeks piksellerini demo parseli için üretir. Raporların PDF dosyaları, Raporlar açıldığında mevcut özel dosya deposuna işlenir. Demo rotası önizlemede incelenebilir. Gerçek uçuş ihracı kendi parselinde kullanılabilir.

Var olan boş bir AgroMax hesabına yönetici olarak paketi kurmak için SQL Editor'da `select agromax_install_demo('AGROMAX_USER_ID');` çalıştır. Bu kimlik uygulamanın `users.id` alanıdır. Tekrar çalıştırmak kayıt çoğaltmaz. Yeni kurulumları durdurmak için `update demo_templates set enabled=0 where id='agromax-demo-v1';` çalıştır.

Paketi kaynak koddan yeniden üretmek için `node --import tsx scripts/build-demo.mjs` ve ardından `node scripts/build-demo-sql.mjs` çalıştır.

Araştırma örneklerini mevcut AgroMax kurulumlarına eklemek için uygulama migration'larından sonra `demo/AGROMAX_SUPABASE_RESEARCH.sql` dosyasını çalıştır. Dosya canlı kurulumdaki `agromax_launch` şemasını hedefler. Başka bir kurulumda ilk `search_path` satırını uygulamanın şemasına göre düzenle. Paket, üç parselin her biri için beş kaynak veri seti ile sulama karşılaştırması, tahmin ve ölçüm karşılaştırması kayıtları hazırlar. Yeni misafirlerde Araştırma açılınca aynı örnekleri uygulama oluşturur.

SQL dosyasını yeniden üretmek için `node --import tsx scripts/build-research-sql.mjs` çalıştır.
