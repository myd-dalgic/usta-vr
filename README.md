# UstaŞef VR 🍕🍔

Kompakt bir VR restoran/fast-food simülasyonu. Meta Quest 3 için WebXR + Three.js ile geliştiriliyor.

## Konsept
- Küçük harita: dışarıda müşteri bekleme alanı, ortada orta boy dükkan
- Sabit menü: pizza, hamburger, patates kızartması, içecek
- Sınırsız/sürekli müşteri akışı
- Yangın tüpü ile söndürme, çekiç/levye ile makine tamiri
- Eldiven eller (aşçı temalı kontrolcü görselleri)

## Mutfak İstasyonları (v0.1)
- Izgara
- Fritöz
- Fırın (Pizza)
- İçecek Makinesi
- Hazırlık Tezgahı
- Yangın Tüpü
- Tamir Çekici İstasyonu

## Çalıştırma
Basit bir statik sunucuyla açılabilir (WebXR için HTTPS veya localhost gerekir):

```bash
npx serve .
```

Ardından Meta Quest 3 tarayıcısından adrese girip "VR'a Gir" butonuna basın.

## Yol Haritası
- [x] Müşteri spawn ve sipariş sistemi (temel - yürüme animasyonu, konuşma balonu, sabır süresi)
- [ ] El etkileşimleri (doğrama, tutma, tabaklama)
- [ ] Yemek pişirme mekanikleri (ızgara, fritöz, fırın)
- [ ] Yanma/duman/yangın sistemi
- [ ] Makine arıza + tamir mekaniği
- [ ] Skor / bahşiş sistemi
- [ ] Ses efektleri ve müzik

## v0.2 - Neler Eklendi
- Müşteri karakterleri (basit gövde+kol+bacak, yürüme ve bekleme animasyonu)
- Konuşma balonları (sipariş isteği, teşekkür/sabırsızlık mesajları) - Canvas tabanlı sprite
- Sınırsız müşteri akışı: her ~8 saniyede bir yeni müşteri geliyor, 3 kişilik sıra
- Sabır sistemi: 25 saniye içinde servis edilmezse müşteri kızıp gidiyor
- Geliştirilmiş eldiven-el modeli (parmaklar + bilek manşeti)
- İstasyonlara üst kontrast şerit + mutfak sıcak ışığı (hafif nefes/pulse animasyonu)
- Dükkan tabelası (Canvas texture ile "USTAŞEF" yazısı)
- Test amaçlı: VR kontrolcü tetiğine (select) basınca sıradaki bekleyen müşteri servis edilmiş sayılır (gerçek yemek sistemi eklenince bu tetikleyici değişecek)

## Deploy
GitHub Pages üzerinden yayınlanacak.
