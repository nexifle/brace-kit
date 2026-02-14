# Fix: MCP Tools Tidak Dikirim ke Payload

## Masalah
MCP tools tidak dikirimkan ke API payload saat melakukan chat request. Payload hanya berisi `model`, `messages`, dan `stream`, tanpa field `tools`.

## Penyebab
Di file `providers.js`, fungsi `formatOpenAI`, `formatAnthropic`, dan `formatGemini` melakukan pengecekan `if (tools.length > 0)` tanpa memeriksa apakah `tools` adalah `undefined` atau `null` terlebih dahulu.

Ketika `tools` adalah `undefined`, ekspresi `tools.length` akan menyebabkan error atau diabaikan, sehingga field `tools` tidak ditambahkan ke body request.

## Solusi
Ubah semua pengecekan dari:
```javascript
if (tools.length > 0) {
```

Menjadi:
```javascript
if (tools && tools.length > 0) {
```

## File yang Diubah
1. `/providers.js` - fungsi `formatOpenAI` (line ~217)
2. `/providers.js` - fungsi `formatAnthropic` (line ~247)
3. `/providers.js` - fungsi `formatGemini` (line ~368)

## Testing
Setelah fix:
1. Build ulang: `bun run build`
2. Reload extension di Chrome
3. Connect MCP server di Settings
4. Kirim pesan chat
5. Periksa console log untuk melihat payload yang dikirim
6. Pastikan field `tools` ada di payload jika ada MCP server yang connected

## Debug Logs
Tambahkan temporary logs di `useChat.ts` untuk memverifikasi:
- MCP servers yang ada di store
- Response dari MCP_LIST_TOOLS
- Enabled server IDs
- Filtered tools yang akan dikirim

Setelah verifikasi berhasil, hapus debug logs tersebut.
