const scdl = require('soundcloud-downloader').default;
async function test() {
    console.log("Searching...");
    const search = await scdl.search({ query: 'Wegh Geri Ver', limit: 1, resourceType: 'tracks' });
    const trackUrl = search.collection[0].permalink_url;
    console.log('Track:', trackUrl);
    console.log("Downloading metadata...");
    const info = await scdl.getInfo(trackUrl);
    console.log("Duration:", info.duration);
    console.log("Downloading stream...");

    // We can also fetch HLS or Progressive streams. Discord bots prefer HLS if available.
    const stream = await scdl.download(trackUrl);
    let len = 0;
    stream.on('data', c => {
        len += c.length;
        process.stdout.write(`\rDownloaded bytes: ${len}`);
    });
    stream.on('end', () => console.log('\nDone!'));
}
test().catch(console.error);
