const play = require('play-dl');

async function testPlayDl() {
    const videoUrl = 'https://www.youtube.com/watch?v=eunGvGB6Od4'; // The blocked Vevo video
    const mixUrl = 'https://www.youtube.com/watch?v=eunGvGB6Od4&list=RDeunGvGB6Od4&start_radio=1';

    try {
        console.log(`-- Testing Single Video Audio Fetch --`);
        const stream = await play.stream(videoUrl, { discordPlayerCompatibility: true });
        console.log(`✅ Success! Audio Stream URL extracted:`);
        console.log(stream.url.substring(0, 100) + '...');
        console.log(`Stream type: ${stream.type}`);

        console.log(`\n-- Testing Mix (RD) Playlist Fetch --`);
        if (play.yt_validate(mixUrl) === 'playlist') {
            const playlist = await play.playlist_info(mixUrl, { incomplete: true });
            console.log(`✅ Success! Playlist detected: ${playlist.title} with ${playlist.videoCount} videos.`);
            const videos = await playlist.all_videos();
            console.log(`First video in mix: ${videos[0].title}`);
        } else {
            console.log(`❌ URL not recognized as playlist. Fallback to extracting just the video id from mix URL.`);
            const videoInfo = await play.video_info(mixUrl);
            console.log(`✅ Fetched specific video from inside mix: ${videoInfo.video_details.title}`);
        }
    } catch (err) {
        console.error(`❌ Error with play-dl:`, err.message);
    }
}

testPlayDl();
