async function testInvidious() {
    const videoId = 'eunGvGB6Od4'; // Blocked Vevo video

    const instances = [
        'https://invidious.jing.rocks',
        'https://invidious.nerdvpn.de',
        'https://inv.tux.pizza',
        'https://invidious.no-logs.com',
        'https://invidious.privacydev.net'
    ];

    for (const api of instances) {
        try {
            console.log(`Testing Invidious API: ${api}...`);
            const res = await fetch(`${api}/api/v1/videos/${videoId}`);

            if (res.ok) {
                const data = await res.json();

                // Find highest quality audio stream
                if (data.formatStreams && data.formatStreams.length > 0) {
                    const audioStream = data.formatStreams.find(s => s.type.includes('audio/mp4') || s.type.includes('audio/webm'))
                        || data.formatStreams[0];
                    console.log(`✅ Success with ${api} - Found stream:`, audioStream.url.substring(0, 80));
                    return;
                } else {
                    console.log(`❌ No formatStreams found on ${api}`);
                }
            } else {
                console.log(`❌ Failed with ${api} - Status ${res.status}`);
            }
        } catch (err) {
            console.log(`❌ Error with ${api}:`, err.message);
        }
    }
}

testInvidious();
