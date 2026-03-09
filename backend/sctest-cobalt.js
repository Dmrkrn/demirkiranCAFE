async function testCobalt() {
    const videoId = 'eunGvGB6Od4'; // Video from user's screenshot
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Cobalt API requires a POST request
    try {
        console.log(`Testing Cobalt API for ${videoUrl}...`);
        const res = await fetch('https://test.cobalt.tools/api/json', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: videoUrl,
                isAudioOnly: true, // We only want the audio stream
                aFormat: "mp3"
            })
        });

        console.log(`Cobalt Status: ${res.status}`);

        if (res.ok) {
            const data = await res.json();
            console.log(`✅ Success! Stream URL:`, data.url);
        } else {
            const text = await res.text();
            console.log(`❌ Failed. Response:`, text);
        }
    } catch (err) {
        console.log(`❌ Error connecting to Cobalt:`, err.message);
    }
}

testCobalt();
