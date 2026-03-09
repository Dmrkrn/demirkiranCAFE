const youtubedl = require('youtube-dl-exec');

async function testYTDL() {
    const videoUrl = 'https://www.youtube.com/watch?v=eunGvGB6Od4'; // Video from user's screenshot

    try {
        console.log(`Testing youtube-dl-exec for ${videoUrl}...`);

        // Sadece URL çıkarma (indirme yapmaz)
        const result = await youtubedl(videoUrl, {
            dumpJson: true,    // Tüm meta veriyi JSON dön
            format: 'bestaudio', // Sadece sesteki en iyi formatlı stream URL'yi al
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true
        });

        console.log(`✅ Success! Audio Stream URL:`);
        console.log(result.url.substring(0, 100) + '...');
    } catch (err) {
        console.log(`❌ Error connecting to youtube-dl:`, err.message);
    }
}

testYTDL();
