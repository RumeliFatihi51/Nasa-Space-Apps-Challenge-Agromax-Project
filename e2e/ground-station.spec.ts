import {test,expect} from '@playwright/test';
test.use({launchOptions:{args:['--enable-webgl','--enable-gpu']}});
test('AI Studio lab opens from field studio and retains simulation controls',async({page},info)=>{
  test.setTimeout(180000);
  const cookies=process.env.AGROMAX_BROWSER_UPGRADE_COOKIE!;
  await page.context().addCookies(cookies.split('; ').map(pair=>{const i=pair.indexOf('=');return{name:pair.slice(0,i),value:pair.slice(i+1),url:'http://127.0.0.1:5182',httpOnly:true,sameSite:'Lax' as const};}));
  const failures:string[]=[];page.on('pageerror',error=>failures.push(error.message));
  await page.goto('/#field-studio');
  await page.getByRole('button',{name:'Uydu ve Drone Laboratuvarı'}).click();
  const dialog=page.getByRole('dialog',{name:'Uydu ve Drone Simülasyon Laboratuvarı'});
  await expect(dialog).toBeVisible();
  const lab=page.frameLocator('iframe[title="Uydu ve Drone Kontrol Merkezi"]');
  await expect(lab.getByRole('button',{name:'Simülasyonu Başlat',exact:true})).toBeVisible({timeout:45000});
  await expect(page.getByText('3D operasyon sahnesi hazırlanıyor…')).toHaveCount(0);
  await lab.getByRole('button',{name:'Simülasyonu Başlat',exact:true}).click();
  await expect(lab.getByRole('button',{name:'Duraklat',exact:true})).toBeVisible();
  await lab.getByRole('button',{name:'Duraklat',exact:true}).click();
  await expect(lab.getByRole('button',{name:'Devam Et',exact:true})).toBeVisible();
  await lab.getByRole('button',{name:'Sıfırla',exact:true}).click();
  await expect(lab.getByRole('button',{name:'Simülasyonu Başlat',exact:true})).toBeVisible();
  if(info.project.name==='mobile')await lab.locator('button[title="Sol Menüyü Gizle / Göster"]').click();
  await lab.locator('nav button[title="Harita ve Parseller"]').click();
  await expect(lab.getByRole('heading',{name:'EXPLICIT TEST PARCEL upgrade',exact:true})).toBeVisible();
  for(const [title,heading] of [
    ['Veri Alımı','Gerçek Zamanlı Veri Akışı ve Sistem Mimarisi'],
    ['Multispektral Analiz','Multispektral Görüntü İşleme Motoru Beklemede'],
    ['Görev Raporları','AgroMax Operasyon ve Görev Sonu Raporu'],
    ['Sistem Ayarları','Sistem Ayarları, Donanım Adaptörleri ve Varlık Mimarisi']]) {
    await lab.locator(`nav button[title="${title}"]`).click();
    await expect(lab.getByRole('heading',{name:heading,exact:true})).toBeVisible();
  }
  await lab.locator('nav button[title="Operasyon Merkezi"]').click();
  if(info.project.name==='mobile')await lab.locator('button[title="Sol Menüyü Gizle / Göster"]').click();
  await page.screenshot({path:info.outputPath('ground-station.png')});
  expect(await lab.locator('body').evaluate(el=>el.scrollWidth>innerWidth+1)).toBe(false);
  await dialog.getByRole('button',{name:'Çalışmayı platforma kaydet'}).click();
  await expect(dialog.getByText(/Temsili çalışma kaydedildi/)).toBeVisible();
  await dialog.getByRole('button',{name:'Stüdyoya dön'}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Uydu ve Drone Laboratuvarı'})).toBeVisible();
  expect(failures).toEqual([]);
});
