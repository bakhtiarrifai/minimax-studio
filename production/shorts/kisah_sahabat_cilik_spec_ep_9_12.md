# Spesifikasi Produksi: Kisah Sahabat Cilik (Episode 09–12)

> **Target Eksekusi:** Claude Code / Flow Studio
> **Format Output:** YouTube Shorts vertikal `9:16`, durasi `33 detik` (`0–1 dtk` cover zoom lokal + `4 klip × 8 dtk` Omni Flash 360p)
> **Anggaran Kredit:** `32 kredit` per episode (`4 klip video × 8 kredit`; portrait, still scene, cover, dan TTS Leda gratis)

## Ringkasan Episode 09–12

| \# | Episode ID | Tokoh (Usia) | Judul Cover (EN) | Nilai Inti | Sumber Sahih | 
| ----- | ----- | ----- | ----- | ----- | ----- | 
| 09 | `ep09_umar_salamah` | Umar bin Abi Salamah (anak, ±9 thn ilustrasi) | The Polite Table Manners | Adab makan & tangan kanan | *Shahih al-Bukhari* no. 5376; *Shahih Muslim* no. 2022 | 
| 10 | `ep10_ummu_khalid` | Ummu Khalid binti Khalid (anak kecil, ±7 thn ilustrasi) | The Pretty Striped Cloak | Syukur & mendoakan pemberi hadiah | *Shahih al-Bukhari* no. 5823, 5845 | 
| 11 | `ep11_ibn_umar` | Abdullah bin Umar (termuda di majelis, ±12 thn ilustrasi) | The Secret of the Palm Tree | Ilmu & menghormati orang tua | *Shahih al-Bukhari* no. 61, 131, 4698; *Shahih Muslim* no. 2811 | 
| 12 | `ep12_zaid_arqam` | Zaid bin Arqam (masih muda, ±12 thn ilustrasi) | The Boy Who Spoke the Truth | Kejujuran meski belum dipercaya | *Shahih al-Bukhari* no. 4900, 4901 | 

## Aturan Eksekusi Pipeline (Flow Studio)

1. **Cast Portrait (`flow_generate`, gratis):** Generate 1 portrait seluruh badan per tokoh anak menggunakan `Nano Banana` (`aspect_ratio: "9:16"`, `max_credits: 0`) dengan pola:
   `3D stylized full-body character portrait of a <usia>-year-old Arab <boy/girl> in 7th-century Medina, <look>, Pixar 3D animation style, neutral studio background, vertical 9:16`

2. **Cover Still (`flow_generate`, gratis):** Gunakan portrait tokoh sebagai `reference_images` pada `Nano Banana` (`max_credits: 0`), lalu render lokal `0–1 dtk` dengan efek zoom pelan + kartu judul.

3. **Scene Stills 1–4 (`flow_generate`, gratis):** Generate 4 still menggunakan `Nano Banana` dengan `reference_images: ["<portrait tokoh>"]` dan `max_credits: 0`.

4. **Klip Video 1–4 (`flow_generate`, 8 kredit/klip):** Generate video `Omni Flash` (`economy: "draft"`, `aspect_ratio: "9:16"`, `max_credits: 10`, tanpa parameter `duration`) menggunakan `first_frame` dari masing-masing still scene.

5. **Narasi (`flow_narrate`, gratis):** Gunakan `voice: "Leda"` dengan `narrate_style` yang tercantum di tiap episode (target durasi 33–36 dtk, percepat maksimal ±12% saat build jika perlu).

6. **Finishing Lokal (gratis):** Gabungkan cover (`0–1 dtk`) + 4 klip video (`1–33 dtk`), burn subtitle `subs/en.srt`, campur backsound Islami lokal, dan upscale ke `1080p`.

### Episode 09: Umar bin Abi Salamah — Adab Makan Bersama (Adab & Sopan Santun)

* **Episode ID:** `ep09_umar_salamah`

* **Judul cover (EN):** The Polite Table Manners

* **Nilai inti:** Membaca basmalah, makan dengan tangan kanan, dan mengambil makanan dari yang terdekat.

* **Sumber:** *Shahih al-Bukhari* no. 5376 dan *Shahih Muslim* no. 2022; riwayat sahih tentang pengasuhan Umar bin Abi Salamah di rumah Rasulullah ﷺ.

* **Usia tokoh saat kejadian:** Tidak disebut dalam hadits; ia hanya disebut *ghulam* (anak) yang diasuh Rasulullah ﷺ. Angka 9 tahun di cast adalah ilustrasi visual.

#### Cast (portrait, gratis)

| name | look (Bahasa Inggris, satu baris) | 
| ----- | ----- | 
| Umar | 9-year-old Arab boy, curly dark hair, bright brown eyes, wearing a warm terracotta linen tunic with a simple brown leather belt and plain beige head cloth | 

#### Narasi (Bahasa Indonesia, 73 kata)

> "Pernah nggak sih kamu lapar banget sampai tanganmu jalan ke mana-mana saat makan bersama? Namaku Umar. Waktu kecil, aku tinggal di rumah Rasulullah ﷺ. Suatu hari saat makan bersama, tanganku mengambil makanan dari berbagai arah di piring besar. Tiba-tiba, suara lembut Rasulullah ﷺ menasihatiku: 'Wahai anak, sebutlah nama Allah, makanlah dengan tangan kananmu, dan makanlah dari yang terdekat denganmu.' Sejak hari itu, aku selalu membaca bismillah, memakai tangan kanan, dan makan dengan sopan!"

`narrate_style`: "in Indonesian, as a cheerful and polite boy telling his own story, warm and lively, brisk pace"

#### Subtitle (`subs/en.srt`)

```
1
00:00:00,000 --> 00:00:05,500
Have you ever been so hungry
that your hand wandered everywhere at mealtime?

2
00:00:05,500 --> 00:00:12,500
My name is Umar, and as a boy,
I grew up in the home of the Prophet (PBUH).

3
00:00:12,500 --> 00:00:19,500
One day while eating, my hand reached
all over the shared platter.

4
00:00:19,500 --> 00:00:26,500
The Prophet (PBUH) gently said: Say Bismillah,
eat with your right hand, and eat what is nearest to you.

5
00:00:26,500 --> 00:00:33,000
Since that day, I always say Bismillah
and eat with polite manners!

```

#### Storyboard (siap untuk `flow_storyboard`)

```
{
  "title": "Ep09 Umar bin Abi Salamah - Adab Makan Bersama",
  "script": "Pernah nggak sih kamu lapar banget sampai tanganmu jalan ke mana-mana saat makan bersama? Namaku Umar. Waktu kecil, aku tinggal di rumah Rasulullah ﷺ. Suatu hari saat makan bersama, tanganku mengambil makanan dari berbagai arah di piring besar. Tiba-tiba, suara lembut Rasulullah ﷺ menasihatiku: 'Wahai anak, sebutlah nama Allah, makanlah dengan tangan kananmu, dan makanlah dari yang terdekat denganmu.' Sejak hari itu, aku selalu membaca bismillah, memakai tangan kanan, dan makan dengan sopan!",
  "style": "Pixar 3D animation, vertical 9:16. The Prophet is never shown and is represented only by warm golden light from off-frame; any elders are seen only from behind or shoulders.",
  "aspect_ratio": "9:16",
  "cast": [
    {
      "name": "Umar",
      "look": "9-year-old Arab boy, curly dark hair, bright brown eyes, wearing a warm terracotta linen tunic with a simple brown leather belt and plain beige head cloth"
    }
  ],
  "scenes": [
    {
      "number": 1,
      "frame_prompt": "3D animated 9-year-old Arab boy with curly dark hair and bright brown eyes wearing a warm terracotta linen tunic and plain beige head cloth, sitting cross-legged on a woven mat in a sunlit 7th-century Medina clay room in front of a large wooden platter of flatbread and dates, looking eagerly at the food, Pixar style, 9:16",
      "prompt": "The animated character leans forward excitedly over the platter, eyes widening with hunger while reaching out eagerly toward the food in warm indoor sunlight.",
      "economy": "draft",
      "max_credits": 10
    },
    {
      "number": 2,
      "frame_prompt": "3D animated 9-year-old Arab boy wearing a terracotta linen tunic and plain beige head cloth, pausing mid-reach over a wooden platter of food with a surprised, sheepish expression as soft warm golden light illuminates his face from off-frame, Pixar style, 9:16",
      "prompt": "The animated character pauses suddenly, pulls his hand back slightly, and looks up toward the warm golden light with an attentive, slightly shy expression.",
      "economy": "draft",
      "max_credits": 10
    },
    {
      "number": 3,
      "frame_prompt": "3D animated 9-year-old Arab boy in a terracotta linen tunic sitting calmly on a woven mat, smiling warmly while neatly taking a piece of flatbread with his right hand from the edge of the platter closest to him, bathed in soft golden light, Pixar style, 9:16",
      "prompt": "The animated character nods happily, whispers with a gentle smile, and politely takes food using only his right hand from the nearest side of the platter.",
      "economy": "draft",
      "max_credits": 10
    },
    {
      "number": 4,
      "frame_prompt": "3D animated 9-year-old Arab boy in a terracotta linen tunic and plain beige head cloth sitting in a cozy sunlit Medina courtyard, smiling directly at the camera with his right hand raised in a friendly gesture, Pixar style, 9:16",
      "prompt": "The animated character smiles brightly at the camera and gives an encouraging nod as soft sunlight filters through palm leaves behind.",
      "economy": "draft",
      "max_credits": 10
    }
  ]
}

```

#### Cover (still terpisah, bukan bagian storyboard)

`Close-up 3D animated 9-year-old Arab boy with curly dark hair and bright brown eyes wearing a terracotta linen tunic and plain beige head cloth, smiling warmly above a wooden platter of dates in sunlit 7th-century Medina, clean top space for title text, Pixar style, 9:16`

#### Caption YouTube

* **ID:** Tiga aturan makan dari Rasulullah ﷺ yang bikin adab kita makin keren: baca Bismillah, pakai tangan kanan, dan ambil yang terdekat! 🍽️✨ #SirahNabawiyah #KisahIslamiAnak #KisahSahabatCilik #Shorts

* **EN:** Three golden table manners taught by the Prophet (PBUH): say Bismillah, use your right hand, and eat what is nearest to you! 🍽️✨ #Seerah #IslamicStoriesForKids #MuslimKids #Shorts

* Judul video: "Kisah Sahabat Cilik #09: The Polite Table Manners"

### Episode 10: Ummu Khalid binti Khalid — Baju Cantik dari Tanah Habasyah (Bersyukur)

* **Episode ID:** `ep10_ummu_khalid`

* **Judul cover (EN):** The Pretty Striped Cloak

* **Nilai inti:** Bergembira dan bersyukur atas pemberian baik, serta mendoakan kebaikan bagi orang yang memberi.

* **Sumber:** *Shahih al-Bukhari* no. 5823 dan 5845; kisah sahih tentang Ummu Khalid (Amatullah binti Khalid bin Sa'id) yang lahir di Habasyah. Dalam riwayat ini ia dibawa (digendong) kepada Nabi ﷺ; corak bajunya "hijau atau kuning" (5823). Kedatangan dari Habasyah disebut di syarah dan Bukhari 3874.

* **Usia tokoh saat kejadian:** Tidak disebut; ia masih cukup kecil untuk digendong. Angka 7 tahun di cast adalah ilustrasi visual.

#### Cast (portrait, gratis)

| name | look (Bahasa Inggris, satu baris) | 
| ----- | ----- | 
| Ummu Khalid | 7-year-old Arab girl, large joyful dark eyes, wearing a modest light-cream long tunic dress and a soft sage-green headscarf | 

#### Narasi (Bahasa Indonesia, 67 kata)

> "Pernah nggak sih kamu dapat hadiah baju baru yang warnanya cantik banget? Namaku Ummu Khalid. Aku baru saja pulang naik kapal dari negeri jauh menuju Madinah. Aku dibawa menemui Rasulullah ﷺ, lalu beliau mengambil sebuah baju hitam kecil bercorak indah. Beliau memakaikannya kepadaku sambil bersabda, 'Bagus, bagus!' dan mendoakanku panjang umur. Aku senang sekali! Yuk, selalu bersyukur dan mendoakan kebaikan bagi siapa saja yang memberi kita hadiah!"

`narrate_style`: "in Indonesian, as an enthusiastic and sweet young girl telling her own story, warm and lively, brisk pace"

#### Subtitle (`subs/en.srt`)

```
1
00:00:00,000 --> 00:00:05,500
Have you ever received a brand-new outfit
with super pretty colors?

2
00:00:05,500 --> 00:00:12,500
My name is Ummu Khalid, and I had just arrived
in Medina by ship from a faraway land.

3
00:00:12,500 --> 00:00:19,500
I was brought to the Prophet (PBUH),
and he picked a little black dress with pretty markings.

4
00:00:19,500 --> 00:00:26,500
He placed it on me, saying "Sanah, sanah!"
meaning wonderful, and prayed for my long life.

5
00:00:26,500 --> 00:00:33,000
I was so happy! Always be grateful
and pray for anyone who gives you a gift!

```

#### Storyboard (siap untuk `flow_storyboard`)

```
{
  "title": "Ep10 Ummu Khalid - Baju Cantik dari Tanah Habasyah",
  "script": "Pernah nggak sih kamu dapat hadiah baju baru yang warnanya cantik banget? Namaku Ummu Khalid. Aku baru saja pulang naik kapal dari negeri jauh menuju Madinah. Aku dibawa menemui Rasulullah ﷺ, lalu beliau mengambil sebuah baju hitam kecil bercorak indah. Beliau memakaikannya kepadaku sambil bersabda, 'Bagus, bagus!' dan mendoakanku panjang umur. Aku senang sekali! Yuk, selalu bersyukur dan mendoakan kebaikan bagi siapa saja yang memberi kita hadiah!",
  "style": "Pixar 3D animation, vertical 9:16. The Prophet is never shown and is represented only by warm golden light from off-frame; the father is seen only from behind or shoulder silhouette.",
  "aspect_ratio": "9:16",
  "cast": [
    {
      "name": "Ummu Khalid",
      "look": "7-year-old Arab girl, large joyful dark eyes, wearing a modest light-cream long tunic dress and a soft sage-green headscarf"
    }
  ],
  "scenes": [
    {
      "number": 1,
      "frame_prompt": "3D animated 7-year-old Arab girl with large joyful dark eyes wearing a modest light-cream long tunic dress and soft sage-green headscarf, walking happily into a sunlit 7th-century Medina courtyard with mud-brick walls, holding the sleeve of an adult seen only from behind, Pixar style, 9:16",
      "prompt": "The animated character walks forward with bouncy, excited steps in the sunlit courtyard, looking around with wide curious eyes.",
      "economy": "draft",
      "max_credits": 10
    },
    {
      "number": 2,
      "frame_prompt": "3D animated 7-year-old Arab girl in a light-cream dress and sage-green headscarf looking upward in awe as radiant warm golden light from off-frame illuminates a neatly folded small black dress with small green and yellow embroidered markings, Pixar style, 9:16",
      "prompt": "The animated character gasps softly in amazement, eyes sparkling as warm golden light shimmers across the embroidered fabric.",
      "economy": "draft",
      "max_credits": 10
    },
    {
      "number": 3,
      "frame_prompt": "3D animated 7-year-old Arab girl wearing a sage-green headscarf and a small black dress with green and yellow embroidered markings over her light-cream dress, beaming with pure joy in warm golden sunlight, Pixar style, 9:16",
      "prompt": "The animated character looks down proudly at the green and yellow markings on the dress and spins slightly with a radiant, grateful smile.",
      "economy": "draft",
      "max_credits": 10
    },
    {
      "number": 4,
      "frame_prompt": "3D animated 7-year-old Arab girl wearing the small black dress with green and yellow markings and sage-green headscarf in a sunny Medina courtyard, smiling directly at the camera with hands pressed happily together, Pixar style, 9:16",
      "prompt": "The animated character smiles warmly at the camera and nods cheerfully as a gentle desert breeze moves the fabric.",
      "economy": "draft",
      "max_credits": 10
    }
  ]
}

```

#### Cover (still terpisah, bukan bagian storyboard)

`Close-up 3D animated 7-year-old Arab girl with large joyful dark eyes wearing a sage-green headscarf and a small black dress with green and yellow embroidered markings, beaming happily in warm Medina sunlight, clean top space for title text, Pixar style, 9:16`

#### Caption YouTube

* **ID:** Gemas banget! Kisah Ummu Khalid kecil yang mendapat hadiah baju hitam bercorak indah langsung dari Rasulullah ﷺ dan didoakan panjang umur! 🎁💛 #SirahNabawiyah #KisahIslamiAnak #KisahSahabatCilik #Shorts

* **EN:** So heartwarming! Young Ummu Khalid receives a beautiful little black dress from the Prophet (PBUH) along with a prayer for a long, blessed life! 🎁💛 #Seerah #IslamicStoriesForKids #MuslimKids #Shorts

* Judul video: "Kisah Sahabat Cilik #10: The Pretty Striped Cloak"

### Episode 11: Abdullah bin Umar — Tebak Pohon Paling Istimewa (Ilmu & Adab)

* **Episode ID:** `ep11_ibn_umar`

* **Judul cover (EN):** The Secret of the Palm Tree

* **Nilai inti:** Semangat mencari ilmu dan berpikir kritis sambil tetap menjaga adab menghormati orang yang lebih tua.

* **Sumber:** *Shahih al-Bukhari* no. 61, 131, dan 4698; *Shahih Muslim* no. 2811 (ucapan Umar: "andai kamu mengatakannya, itu lebih aku sukai" ada di 131, 4698, dan Muslim 2811); hadits masyhur tentang teka-teki pohon kurma yang perumpamaannya seperti seorang Muslim.

* **Usia tokoh saat kejadian:** Tidak disebut; dalam riwayat ia menyebut dirinya yang termuda di majelis (Bukhari 72). Angka 12 tahun di cast adalah ilustrasi visual.

#### Cast (portrait, gratis)

| name | look (Bahasa Inggris, satu baris) | 
| ----- | ----- | 
| Abdullah bin Umar | 12-year-old Arab boy, neat dark hair, thoughtful brown eyes, wearing a soft olive-green linen tunic with a brown leather belt and white head cloth | 

#### Narasi (Bahasa Indonesia, 77 kata)

> "Pernah nggak sih kamu tahu jawaban tebak-tebakan, tapi malu bicara karena banyak orang dewasa? Namaku Abdullah bin Umar. Suatu hari aku duduk di majelis bersama Ayahku. Rasulullah ﷺ bertanya tentang pohon yang daunnya tidak gugur, perumpamaan seorang Muslim. Di hatiku terlintas itu pohon kurma, tapi aku diam menghormati para orang tua. Akhirnya Rasulullah ﷺ menjawab, 'Itu adalah pohon kurma.' Kata Ayah, andai tadi aku menjawab, itu lebih ia sukai! Jadi, tetap sopan, tapi jangan ragu menyampaikan ilmu."

`narrate_style`: "in Indonesian, as a thoughtful and respectful boy telling his own story, warm and lively, brisk pace"

#### Subtitle (`subs/en.srt`)

```
1
00:00:00,000 --> 00:00:05,500
Have you ever known the answer to a riddle,
but stayed quiet out of respect for elders?

2
00:00:05,500 --> 00:00:12,500
My name is Abdullah bin Umar. One day,
I sat in a gathering beside my father.

3
00:00:12,500 --> 00:00:19,500
The Prophet (PBUH) asked about a tree whose leaves
never fall, just like a true believer.

4
00:00:19,500 --> 00:00:26,500
I knew it was the date palm, yet I stayed quiet.
The Prophet (PBUH) then said: It is the date palm!

5
00:00:26,500 --> 00:00:33,000
My father said he wished I had spoken up! Be polite,
but don't be afraid to share what you know.

```

#### Storyboard (siap untuk `flow_storyboard`)

```
{
  "title": "Ep11 Abdullah bin Umar - Tebak Pohon Paling Istimewa",
  "script": "Pernah nggak sih kamu tahu jawaban tebak-tebakan, tapi malu bicara karena banyak orang dewasa? Namaku Abdullah bin Umar. Suatu hari aku duduk di majelis bersama Ayahku. Rasulullah ﷺ bertanya tentang pohon yang daunnya tidak gugur, perumpamaan seorang Muslim. Di hatiku terlintas itu pohon kurma, tapi aku diam menghormati para orang tua. Akhirnya Rasulullah ﷺ menjawab, 'Itu adalah pohon kurma.' Kata Ayah, andai tadi aku menjawab, itu lebih ia sukai! Jadi, tetap sopan, tapi jangan ragu menyampaikan ilmu.",
  "style": "Pixar 3D animation, vertical 9:16. The Prophet and senior companions are never shown; elders are visible only as blurred back-of-shoulder silhouettes, with warm golden light coming from off-frame.",
  "aspect_ratio": "9:16",
  "cast": [
    {
      "name": "Abdullah bin Umar",
      "look": "12-year-old Arab boy, neat dark hair, thoughtful brown eyes, wearing a soft olive-green linen tunic with a brown leather belt and white head cloth"
    }
  ],
  "scenes": [
    {
      "number": 1,
      "frame_prompt": "3D animated 12-year-old Arab boy with thoughtful brown eyes wearing a soft olive-green linen tunic and white head cloth, sitting attentively on a woven mat in a sunlit 7th-century Medina courtyard gathering with blurred silhouettes of elders' backs nearby, Pixar style, 9:16",
      "prompt": "The animated character sits upright and listens intently, looking toward warm golden light coming from off-frame.",
      "economy": "draft",
      "max_credits": 10
    },
    {
      "number": 2,
      "frame_prompt": "3D animated 12-year-old Arab boy in a soft olive-green linen tunic and white head cloth, eyes lighting up with a sudden realization while glancing politely at an elder's shoulder silhouette beside him and keeping his lips gently closed, Pixar style, 9:16",
      "prompt": "The animated character perks up with an expression of sudden insight, glances respectfully to the side, and holds back with a polite, modest smile.",
      "economy": "draft",
      "max_credits": 10
    },
    {
      "number": 3,
      "frame_prompt": "3D animated 12-year-old Arab boy in an olive-green linen tunic smiling brightly with pride as warm golden light shines down and tall date palm trees sway softly in the background of a Medina courtyard, Pixar style, 9:16",
      "prompt": "The animated character beams with quiet happiness and nods softly as golden sunlight and swaying palm fronds fill the background.",
      "economy": "draft",
      "max_credits": 10
    },
    {
      "number": 4,
      "frame_prompt": "3D animated 12-year-old Arab boy wearing a soft olive-green linen tunic and white head cloth standing beside a date palm tree in Medina, smiling warmly at the camera with one hand over his heart, Pixar style, 9:16",
      "prompt": "The animated character places one hand respectfully over his heart and smiles encouragingly at the camera.",
      "economy": "draft",
      "max_credits": 10
    }
  ]
}

```

#### Cover (still terpisah, bukan bagian storyboard)

`Close-up 3D animated 12-year-old Arab boy with thoughtful brown eyes wearing an olive-green linen tunic and white head cloth in front of sunlit date palm trees in Medina, smiling knowingly, clean top space for title text, Pixar style, 9:16`

#### Caption YouTube

* **ID:** Tahu jawabannya tapi tetap santun menunggu orang dewasa bicara dulu! Kisah cerdas Abdullah bin Umar dan teka-teki pohon kurma dari Rasulullah ﷺ 🌴💡 #SirahNabawiyah #KisahIslamiAnak #KisahSahabatCilik #Shorts

* **EN:** Knowing the answer yet staying humble out of respect for elders! The inspiring story of young Abdullah bin Umar and the riddle of the date palm tree 🌴💡 #Seerah #IslamicStoriesForKids #MuslimKids #Shorts

* Judul video: "Kisah Sahabat Cilik #11: The Secret of the Palm Tree"

### Episode 12: Zaid bin Arqam — Kejujuran yang Dibela Langit (Kejujuran)

* **Episode ID:** `ep12_zaid_arqam`

* **Judul cover (EN):** The Boy Who Spoke the Truth

* **Nilai inti:** Berani menyampaikan kebenaran dan tetap teguh meski awalnya tidak langsung dipercaya orang lain.

* **Sumber:** *Shahih al-Bukhari* no. 4900 dan 4901 (Kitab Tafsir Surah al-Munafiqun); riwayat sahih tentang Zaid bin Arqam RA "dalam sebuah peperangan". Ulama berbeda soal peperangannya (Bani Musthaliq menurut ahli maghazi, Tabuk menurut Ibnu Hajar dan Tirmidzi 3314).

* **Usia tokoh saat kejadian:** Tidak disebut dalam hadits ini; ia digambarkan masih muda. Angka 12 tahun di cast adalah ilustrasi visual.

#### Cast (portrait, gratis)

| name | look (Bahasa Inggris, satu baris) | 
| ----- | ----- | 
| Zaid bin Arqam | 12-year-old Arab boy, earnest dark eyes, wearing a sky-blue linen tunic with a simple brown leather belt and sand-colored head cloth | 

#### Narasi (Bahasa Indonesia, 72 kata)

> "Pernah nggak sih kamu sudah berkata jujur, tapi orang-orang belum percaya? Namaku Zaid bin Arqam. Dalam sebuah perjalanan, aku mendengar seseorang berkata buruk untuk memecah belah penduduk Madinah. Aku menceritakannya kepada pamanku, lalu kabar itu sampai kepada Rasulullah ﷺ. Awalnya orang itu menyangkal sehingga aku sempat bersedih di rumah sendirian. Tak lama kemudian, Allah menurunkan wahyu yang membenarkan perkataanku! Jangan pernah takut berkata jujur ya, karena Allah pasti membela orang yang jujur."

`narrate_style`: "in Indonesian, as an earnest and brave boy telling his own story, warm and lively, brisk pace"

#### Subtitle (`subs/en.srt`)

```
1
00:00:00,000 --> 00:00:05,500
Have you ever told the truth,
only for people not to believe you at first?

2
00:00:05,500 --> 00:00:12,500
My name is Zaid bin Arqam. During a journey,
I overheard someone trying to divide the people of Medina.

3
00:00:12,500 --> 00:00:19,500
I told my uncle, and it reached the Prophet (PBUH),
but the man denied it, leaving me sad at home.

4
00:00:19,500 --> 00:00:26,500
Soon after, Allah revealed verses proving
that every word I spoke was completely true!

5
00:00:26,500 --> 00:00:33,000
Never be afraid to tell the truth,
because Allah always stands with the truthful!

```

#### Storyboard (siap untuk `flow_storyboard`)

```
{
  "title": "Ep12 Zaid bin Arqam - Kejujuran yang Dibela Langit",
  "script": "Pernah nggak sih kamu sudah berkata jujur, tapi orang-orang belum percaya? Namaku Zaid bin Arqam. Dalam sebuah perjalanan, aku mendengar seseorang berkata buruk untuk memecah belah penduduk Madinah. Aku menceritakannya kepada pamanku, lalu kabar itu sampai kepada Rasulullah ﷺ. Awalnya orang itu menyangkal sehingga aku sempat bersedih di rumah sendirian. Tak lama kemudian, Allah menurunkan wahyu yang membenarkan perkataanku! Jangan pernah takut berkata jujur ya, karena Allah pasti membela orang yang jujur.",
  "style": "Pixar 3D animation, vertical 9:16. The Prophet and senior companions are never shown; the Prophet's presence is shown only as warm golden light from off-frame, and no weapons or violence appear.",
  "aspect_ratio": "9:16",
  "cast": [
    {
      "name": "Zaid bin Arqam",
      "look": "12-year-old Arab boy, earnest dark eyes, wearing a sky-blue linen tunic with a simple brown leather belt and sand-colored head cloth"
    }
  ],
  "scenes": [
    {
      "number": 1,
      "frame_prompt": "3D animated 12-year-old Arab boy with earnest dark eyes wearing a sky-blue linen tunic and sand-colored head cloth, standing near a wooden water well in a sunlit 7th-century Arabian desert oasis camp, looking concerned and attentive as if overhearing something important, Pixar style, 9:16",
      "prompt": "The animated character turns his head subtly with wide, concerned eyes, listening carefully in the quiet desert oasis.",
      "economy": "draft",
      "max_credits": 10
    },
    {
      "number": 2,
      "frame_prompt": "3D animated 12-year-old Arab boy in a sky-blue linen tunic and sand-colored head cloth sitting quietly inside a dim mud-brick room in Medina, resting his chin on his hand with a sad, downcast expression, soft afternoon light through a small window, Pixar style, 9:16",
      "prompt": "The animated character sighs softly and looks down sadly while sitting alone near the sunlit window.",
      "economy": "draft",
      "max_credits": 10
    },
    {
      "number": 3,
      "frame_prompt": "3D animated 12-year-old Arab boy in a sky-blue linen tunic and sand-colored head cloth standing in a bright Medina courtyard as radiant warm golden light shines on his face, his expression transforming from sadness into immense relief and joy, Pixar style, 9:16",
      "prompt": "The animated character looks up into the warm golden light, his eyes brightening with pure relief and a joyful smile.",
      "economy": "draft",
      "max_credits": 10
    },
    {
      "number": 4,
      "frame_prompt": "3D animated 12-year-old Arab boy wearing a sky-blue linen tunic with a brown leather belt and sand-colored head cloth in a sunlit Medina street, standing tall and smiling confidently directly at the camera, Pixar style, 9:16",
      "prompt": "The animated character stands tall with a confident, reassuring smile and nods warmly at the camera.",
      "economy": "draft",
      "max_credits": 10
    }
  ]
}

```

#### Cover (still terpisah, bukan bagian storyboard)

`Close-up 3D animated 12-year-old Arab boy with earnest dark eyes wearing a sky-blue linen tunic and sand-colored head cloth bathed in warm golden light in Medina, looking sincere and hopeful, clean top space for title text, Pixar style, 9:16`

#### Caption YouTube

* **ID:** Sempat sedih karena kejujurannya belum dipercaya, sampai akhirnya wahyu dari langit turun membela Zaid bin Arqam! MasyaAllah! 🌟📖 #SirahNabawiyah #KisahIslamiAnak #KisahSahabatCilik #Shorts

* **EN:** Sad at first when no one believed him, until revelation from heaven proved young Zaid bin Arqam was telling the truth all along! 🌟📖 #Seerah #IslamicStoriesForKids #MuslimKids #Shorts

* Judul video: "Kisah Sahabat Cilik #12: The Boy Who Spoke the Truth"