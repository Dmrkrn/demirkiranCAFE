async function testPiped() {
    const videoId = 'eunGvGB6Od4'; // The video from the screenshot
    const instances = [
        'https://pipedapi.kavin.rocks',
        'https://pipedapi.tokhmi.xyz',
        'https://api.piped.projectsegfau.lt',
        'https://piped-api.lunar.icu',
        'https://pipedapi.smnz.de'
    ];

    for (const api of instances) {
        try {
            console.log(`Testing ${api}...`);
            const res = await fetch(`${api}/streams/${videoId}`);
            if (res.ok) {
                const data = await res.json();
                const streams = data.audioStreams || [];
                console.log(`✅ Success with ${api} - Found ${streams.length} audio streams`);
                return;
            } else {
                console.log(`❌ Failed with ${api} - Status ${res.status}`);
            }
        } catch (err) {
            console.log(`❌ Error with ${api}:`, err.message);
        }
    }
}

testPiped();
