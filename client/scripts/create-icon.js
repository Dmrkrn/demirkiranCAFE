const sharp = require('sharp');
const fs = require('fs');

// ICO için 256x256 PNG oluştur
sharp('public/icon.png')
    .resize(256, 256)
    .toFile('public/icon-256.png')
    .then(() => {
        console.log('✅ icon-256.png oluşturuldu!');
        console.log('ℹ️ ICO dosyası için online converter kullanabilirsin:');
        console.log('   https://convertio.co/png-ico/');
    })
    .catch(err => console.error('❌ Hata:', err));
