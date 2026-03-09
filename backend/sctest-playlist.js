const ytSearch = require('yt-search');

async function test() {
    console.log("Searching playlist PLDIoUOhQQPlVr3qepMVRsDe4T8vNQsvno");
    try {
        const list = await ytSearch({ listId: 'PLDIoUOhQQPlVr3qepMVRsDe4T8vNQsvno' });
        console.log(`Found playlist: ${list.title} with ${list.videos.length} videos.`);
        if (list.videos.length > 0) {
            console.log(`First video: ${list.videos[0].title}, url: ${list.videos[0].url}, id: ${list.videos[0].videoId}`);
        }
    } catch (err) {
        console.error("Searc error:", err);
    }
}
test();
