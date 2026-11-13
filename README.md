<div align="center">
  <img src="public/opung-icon.png" alt="Logo Opung" width="96" height="96" style="border-radius: 22px;" />

  # Opung — Office Proximity Ultra Noise Gate

  **Peredam Bising Radius &le; 1.0 Meter & Penjernih Vokal Studio HD 48 kHz untuk macOS, Google Meet & Zoom**

  [![Platform](https://img.shields.io/badge/macOS-11.0%2B%20(Apple%20Silicon%20%26%20Intel)-0284c7?style=flat-square&logo=apple&logoColor=white)](#arsitektur-native-macos)
  [![Audio Engine](https://img.shields.io/badge/DSP%20Engine-48%20kHz%20Studio%20HD-10b981?style=flat-square)](#4-mesin-audio-pintar-otomatis)
  [![Virtual Mic](https://img.shields.io/badge/Virtual%20Mic-BlackHole%202ch%20(CoreAudio%20HAL)-38bdf8?style=flat-square)](#integrasi-google-meet--zoom)
  [![Version](https://img.shields.io/badge/Versi-1.0-f43f5e?style=flat-square)](#lisensi--kredit)
  [![License: MIT](https://img.shields.io/badge/License-MIT-eab308?style=flat-square)](LICENSE)
</div>

---

## Ringkasan Proyek

**Opung** (*Office Proximity Ultra Noise Gate*) adalah aplikasi peredam kebisingan jarak dekat (*near-field proximity noise gate*) dan penjernih vokal *real-time* yang dirancang khusus untuk rapat daring (**Google Meet**, **Zoom**, **Microsoft Teams**, **Slack**, dan **Discord**) dari ruang kantor terbuka (*open-space office*), *co-working space*, maupun ruangan yang ramai.

Berbeda dengan peredam bising bawaan laptop yang masih sering meloloskan suara rekan kerja yang mengobrol di meja sebelah (karena sama-sama dikenali sebagai frekuensi suara manusia), **Opung** mengunci fokus tangkapan mikrofon hanya pada **radius &le; 1.0 meter** di depan pembicara utama, mengupas bising alat berat/ketikan *keyboard* saat berbicara, serta memoles vokal dengan **5-Stage Studio HD Equalizer** secara otomatis.

---

## Fitur Utama

| Fitur | Kemampuan Teknis | Manfaat Saat Rapat |
| :--- | :--- | :--- |
| **Gerbang Radius &le; 1.0 Meter** | *Hard Proximity Gate* dengan 3 preset jarak (`0.5m Dekat`, `1.0m Kantor`, `1.5m Ruang`) | Suara obrolan rekan kerja di meja sebelah (&ge; 1.5m) diputus mutlak ke `0.00x` (`-90 dB`) |
| **Pengupas Bising Saat Bicara** | *Sidechain Formant Detector* (`120 Hz – 3.1 kHz`) + *ZCR Discriminator* + *Wiener Spectral Subtraction* | Suara bor bangunan, deru kipas, dan ketikan *mechanical keyboard* dikupas bersih bahkan saat Anda sedang berbicara |
| **Penjernih Vokal Studio HD** | *5-Stage Parametric EQ* (`48 kHz`) + *Soft-Knee Studio Compressor* | Menghilangkan suara mendem/kaleng (*Anti-Mud 260 Hz*) dan mengangkat artikulasi vokal (`+4.5 dB @ 3.5 kHz`) |
| **Anti-Bocor Speaker & Anti-Goa** | *Hardware AEC* + *Echo Guard Decay Tracker* | Mencegah suara dari speaker MacBook memantul kembali ke mikrofon saat rapat tanpa *earphone* maupun saat uji suara sendiri |
| **Aplikasi Menu Bar macOS** | Native Objective-C (`Cocoa` + `NSStatusBar` + `WKWebView` + `CoreAudio HAL`) | Muncul sebagai ikon logo Opung di Menu Bar atas macOS (samping baterai/Wi-Fi), ukuran ringan (~50 KB), beban CPU `< 2%` |
| **Jembatan Langsung BlackHole 2ch** | *Lock-Free Ring Buffer* `48 kHz` via `AudioUnit` / `CoreAudio HAL` | Mengalirkan suara bersih langsung ke mikrofon virtual **BlackHole 2ch** tanpa membocorkan suara sendiri ke *earphone* |

---

## 4 Mesin Audio Pintar (Otomatis Aktif)

Opung dirancang sesimpel aplikasi kelas komersial: cukup nyalakan **1 Sakelar Utama**, dan keempat mesin pemroses sinyal digital (*Digital Signal Processing*) berikut langsung bekerja secara *real-time* pada *frame* `480 sampel` (`10 ms` @ `48 kHz`):

### 1. Sidechain Formant Detector & Proximity Gate (&le; 1.0 Meter)
- Mengukur energi akustik khusus pada pita frekuensi pita suara manusia (*Formant F0–F3*, `120 Hz – 3.100 Hz`).
- Dilengkapi 3 pilihan sensitivitas jarak instan:
  - **Dekat (`0.5m` / `-20 dB`)**: Mode super ketat untuk ruang kerja yang sangat bising.
  - **Kantor (`1.0m` / `-26 dB`)**: Pengaturan ideal untuk memblokir obrolan meja sebelah.
  - **Ruang (`1.5m` / `-38 dB`)**: Pengaturan lebih longgar untuk ruang kerja pribadi.
- Setiap suara di bawah ambang batas jarak langsung ditutup ke **`Gain = 0.00x`** dengan *hold time* alami (`260 ms`) agar suku kata akhir dan konsonan (`S`, `T`, `K`) tidak pernah terpotong.

### 2. Zero-Crossing Rate (ZCR) Discriminator & Wiener Intra-Speech Denoising
- Menghitung laju perpotongan nol (*Zero-Crossing Rate*) dan *Adaptive Noise Floor* pada setiap *frame* `10 ms`.
- Bising frekuensi tinggi/kasar non-manusia (seperti mata bor bangunan atau ketikan *keyboard* dengan `ZCR > 135`) dikenai penalti detektor `-12 dB` sehingga tidak dapat menipu gerbang mikrofon untuk terbuka.
- Saat pembicara utama sedang berbicara, **Wiener Spectral Subtraction** dan **Slew-Rate Transient De-Clicker** aktif mengupas bising latar secara simultan.

### 3. 5-Stage Studio HD Vocal Clarity Equalizer
Secara otomatis menjernihkan karakter suara mikrofon bawaan laptop melalui 5 tahapan filter biquad:
1. **Sub-Rumble High-Pass (`85 Hz`)**: Membuang getaran meja dan dengung AC frekuensi rendah.
2. **Chest Warmth Peaking (`135 Hz`, `+2.0 dB`)**: Memberikan bobot suara yang hangat dan bulat.
3. **Anti-Mud Cut (`260 Hz`, `-2.8 dB`)**: Menghilangkan efek suara mendem atau terdengar seperti di dalam ruangan tertutup.
4. **Vocal Presence Boost (`3.500 Hz`, `+4.5 dB`)**: Memperjelas artikulasi vokal agar tetap tajam di Google Meet & Zoom.
5. **Krisp Vocal Mask & Air Shelf (`4.600 Hz` Low-Pass / `6.500 Hz` High-Shelf)**: Menahan desis frekuensi tinggi di luar pita suara manusia.

### 4. Hardware AEC & Anti-Cave-Echo Guard
- Mengunci *Hardware Acoustic Echo Cancellation* (`echoCancellation: true`) agar tetap menyala setiap saat, baik ketika rapat menggunakan speaker laptop maupun saat menekan tombol **Tes Dengar Suara Sendiri (Gunakan Earphone)**.
- Dilengkapi *Echo Guard Decay Tracker* yang mencegah pantulan suara dari speaker (~120 ms kemudian) memicu ulang gerbang mikrofon sehingga bebas dari efek suara berulang seperti di dalam goa.

---

## Arsitektur Native macOS (`Opung.app` & `OPUNG-Installer.dmg`)

Aplikasi desktop macOS Opung **tidak menggunakan Electron** yang memakan ratusan megabyte RAM, melainkan dibangun menggunakan arsitektur **Native macOS** murni:

- **UI & Window Host**: Native Objective-C (`Cocoa`, `AppKit`, `NSStatusBar`, `WKWebView`) dengan jendela *floating panel* yang otomatis menyesuaikan tinggi konten (*Auto-Fit Window Height Bridge*).
- **Menu Bar Integration**: Menampilkan ikon resmi Opung di **macOS Menu Bar** kanan atas (sebelah indikator Wi-Fi/baterai) untuk membuka/menyembunyikan panel dengan cepat.
- **CoreAudio HAL Bridge**: Menulis sampel PCM `Float32` / `Int16` hasil pemrosesan DSP secara langsung ke perangkat `BlackHole 2ch` melalui `AudioUnit` (`kAudioUnitSubType_HALOutput`) yang otomatis menyesuaikan *sample rate* perangkat keras (`48.000 Hz` atau `44.100 Hz`).
- **In-Browser HFS+ `.DMG` Generator (`src/utils/macosAppBuilder.ts`)**: Web aplikasi mampu merakit *disk image* macOS asli (`OPUNG-Installer.dmg` berformat Apple HFS+ / UDIF `koly` lengkap dengan `.DS_Store`, ikon Retina `AppIcon.icns`, `Opung.app`, dan pintasan *drag-and-drop* ke folder `Applications`) secara langsung di *browser* tanpa memerlukan server kompilasi eksternal.

---

## Panduan Instalasi & Penggunaan di macOS

### 1. Pasang Aplikasi dari `OPUNG-Installer.dmg`
1. Klik tombol **Unduh untuk macOS (.dmg)** pada halaman aplikasi untuk mengunduh file `OPUNG-Installer.dmg`.
2. Klik 2x file **`OPUNG-Installer.dmg`** di folder `Downloads`, lalu **geser (*drag & drop*) `Opung.app` ke folder `Applications`**.
3. Buka folder `Applications`, lalu pada **`Opung.app`** lakukan **Klik Kanan (2 jari) &rarr; pilih Open** (hanya diperlukan saat pertama kali dibuka).

### 2. Hubungkan ke Google Meet / Zoom
1. Pastikan di dalam jendela **Opung**, bagian **Mikrofon Input** memilih mikrofon fisik Anda (mis. *MacBook Pro Microphone*), dan bagian **Output ke Google Meet / Zoom** berstatus hijau **`Terhubung ke BlackHole 2ch ✓`**.
2. Buka pengaturan **Audio** di **Google Meet**, **Zoom**, atau **Microsoft Teams**:
   - **Microphone (Input)**: Pilih **`BlackHole 2ch`**
   - **Speakers (Output)**: Pilih **Speaker MacBook** atau **Earphone/AirPods** Anda.

---

## Menjalankan Proyek Secara Lokal (Development)

Proyek ini menggunakan **React 19**, **TypeScript**, **Tailwind CSS v4**, dan **Vite**.

### Prasyarat
- **Node.js** `v18+` atau `v20+`
- **npm** `v9+`

### Langkah Menjalankan
```bash
# 1. Clone repositori
git clone <url-repositori-anda>
cd opung

# 2. Instal seluruh dependensi
npm install

# 3. Jalankan server pengembangan (http://localhost:3000)
npm run dev
```

### Perintah Build & Verifikasi
```bash
# Cek tipe TypeScript (Linter)
npm run lint

# Build produksi ke folder dist/
npm run build
```

---

## Struktur Direktori

```text
├── public/
│   ├── opung-icon.png                  # Ikon resmi aplikasi Opung (macOS Squircle)
│   ├── demo-voice-office-chatter.mp3   # Rekaman suara manusia Bahasa Indonesia (Skenario 1)
│   ├── demo-voice-drill-keyboard.mp3   # Rekaman suara manusia Bahasa Indonesia (Skenario 2)
│   ├── demo-voice-speaker-echo.mp3     # Rekaman suara manusia Bahasa Indonesia (Skenario 3)
│   └── demo-bg-chatter.mp3             # Audio simulasi obrolan latar meja sebelah
├── src/
│   ├── components/
│   │   └── MacOSDesktopAppWorkspace.tsx # Mesin DSP WebAudio real-time & simulasi jendela Opung
│   ├── utils/
│   │   └── macosAppBuilder.ts           # Generator Native Objective-C, CoreAudio HAL & HFS+ .DMG Builder
│   ├── App.tsx                          # Halaman utama & pemutar uji banding audio interaktif
│   ├── main.tsx                         # Entry point aplikasi React
│   └── index.css                        # Konfigurasi tema gelap & tipografi Tailwind CSS
├── index.html                           # Entry HTML & metadata SEO/OpenGraph
└── package.json                         # Konfigurasi skrip dan dependensi proyek
```

---

## Lisensi & Kredit

Proyek ini dilisensikan di bawah **[MIT License](LICENSE)**.

<div align="center">
  <p>
    <strong>Opung - Office Proximity Ultra Noise Gate · Versi 1.0</strong><br />
    &copy; 2026 Opung &middot; Made with &hearts; by <strong>Muhammad Zen</strong>
  </p>
</div>
