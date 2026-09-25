# NAELGHUB + NOXXA Real APK Builder

UI NOXXA lama dipertahankan. Real builder berada di `noxxa-builder/` dan sengaja dipisahkan dari `server.js` utama.

## Menjalankan
1. Jalankan server NAELGHUB seperti biasa.
2. Masuk Dashboard > NOXXA BUILD APK.
3. Jalankan `cd noxxa-builder/builder-server && npm install && npm start`.
4. Pastikan JDK + Android SDK + Build Tools + Gradle tersedia pada mesin builder.
5. URL builder default: `http://localhost:8787`.

Mode URL Web dan Code HTML didukung. Mode HTML membutuhkan `index.html`.

Catatan: APK tidak bisa dikompilasi jika toolchain Android/Gradle belum terpasang.


## FIX5 Full Build
FIX5 menambahkan pemeriksaan URL server-side yang mengikuti redirect dan melaporkan final URL sebelum build. Workflow GitHub Actions juga membuat APK debug nyata dan menerbitkannya sebagai Release asset.
