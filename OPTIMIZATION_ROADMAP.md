# 🏎️ Arcade Racer — Optimizasyon Yol Haritası

## ✅ Yapılan Optimizasyonlar (Mevcut)

| Kategori | Detay | Etki |
|----------|-------|------|
| **PointLight azaltma** | 35+ → ~12 | GPU draw call ve fragment shader yükü %60 düşüş |
| **InstancedMesh** | 120 bina → 3 instance grubu, ~80 park araba → 1 instance | Draw call ~200 → ~10 |
| **Shadow map** | 2048 → 1024 | Shadow pass %75 hızlanma |
| **Shadow frustum** | ±300 → ±200 | Daha az shadow hesaplaması |
| **pixelRatio** | devicePixelRatio → max 1.5 | Retina'da %44 daha az piksel |
| **powerPreference** | varsayılan → high-performance | Dedicated GPU kullanımı |
| **castShadow** | Tribünlerden kaldırıldı | Sadece araçlar gölge düşürür |
| **Fence azaltma** | Her 12 segment → 24 | %50 daha az mesh |
| **Material paylaşımı** | Tekrarlanan material'ler tekil | Daha az GPU state değişimi |

---

## 🔵 Kısa Vadeli (Kolay, Büyük Etki)

### Geometry Merge
- Barrier duvarlarını tek `BufferGeometry`'ye birleştir
- Neon sign'ları InstancedMesh yap
- **Beklenen etki:** Draw call %30-40 düşüş

### LOD (Level of Detail)
- Uzak nesneler için düşük-poly versiyonlar
- Kameradan 200m+ olan objeleri basitleştir
- **Beklenen etki:** Vertex shader %20-30 düşüş

### Frustum Culling Optimizasyonu
- `Object3D.frustumCulled = true` kontrol et
- Büyük grupları bounding box ile kontrol et

---

## 🟡 Orta Vadeli (Orta Zorluk)

### Material Atlasing
- Benzer material'leri birleştir (texture atlas)
- Metal/Vulkan'da state change maliyeti yüksek

### Spatial Hashing
- `getClosestT()`, `isOnRoad()`, `getElevation()` fonksiyonları brute-force
- Grid-based spatial hash ile O(n) → O(1) 
- **Beklenen etki:** CPU frame time %15-25 düşüş

### Deferred Lighting Alternatifi
- Çok sayıda PointLight varsa deferred approach düşünülebilir
- Three.js vanilla'da zor — custom shader gerekebilir

---

## 🔴 Uzun Vadeli (Zor, İleri Seviye)

### WebGPU Backend
- Three.js r160+ WebGPU destekliyor
- Metal/Vulkan'a doğrudan erişim → ciddi performans artışı
- Deneysel ama gelecek için hazırlık

### Compute Shader Fizik
- Çarpışma kontrolü GPU'da
- Partikül sistemi compute shader'da

### Occlusion Culling
- Binaların arkasındaki objeleri render etme
- Three.js'de GPU occlusion query ile

---

## 📊 Performans Ölçüm Araçları

```
// FPS sayacı ekle (basit)
const stats = new Stats();
document.body.appendChild(stats.dom);
// loop içinde: stats.begin(); ... stats.end();

// Three.js renderer info
console.log(renderer.info.render);
// { calls, triangles, points, lines, frame }
```

## Hedef Metrikler

| Metrik | Şu An (tahmini) | Hedef |
|--------|-----------------|-------|
| Draw calls | ~50-80 | <30 |
| Triangles | ~100K-200K | <80K |
| PointLights | 12 | <10 |
| FPS (Metal) | ~30-45 | 60 |
| FPS (WebGL) | ~45-60 | 60 |
