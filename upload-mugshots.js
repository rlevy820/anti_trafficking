const puppeteer = require('puppeteer');
const { Storage } = require('@google-cloud/storage');

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Google Cloud Storage setup
  const storage = new Storage({
    keyFilename: '/Users/ryanlevy/Desktop/Anti Trafficing/mugshots/mugshots-443423-f1edb873cc28.json',
  });
  const bucket = storage.bucket('mugshots-data');

  try {
    await page.goto('https://mugshots.com', { waitUntil: 'networkidle2' });

    // Scroll to load all lazy-loaded images
    await page.evaluate(async () => {
      const scrollInterval = 200; // Time in ms between scrolls
      const totalHeight = await new Promise((resolve) => {
        let distance = 0;
        const timer = setInterval(() => {
          window.scrollBy(0, 100); // Scroll 100px down
          distance += 100;
          if (distance >= document.body.scrollHeight) {
            clearInterval(timer);
            resolve(document.body.scrollHeight);
          }
        }, scrollInterval);
      });
    });

    // Extract and filter image URLs
    const imageUrls = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img'))
        .map((img) => img.src)
        .filter((url) =>
          url.match(/\.(jpg|jpeg|png)$/i) // Include all image files
        );
    });

    console.log('Filtered Mugshot URLs:', imageUrls);

    // Upload images to Google Cloud Storage
    for (const url of imageUrls) {
      const imageName = url.split('/').pop();
      const file = bucket.file(imageName);

      try {
        // Check if the file already exists
        const [exists] = await file.exists();
        if (exists) {
          console.log(`Skipped ${imageName}, already exists.`);
          continue;
        }

        // Fetch image data
        const response = await page.goto(url);
        const buffer = await response.buffer();

        // Save image to Google Cloud Storage
        await file.save(buffer, { contentType: 'image/jpeg' });
        console.log(`Uploaded ${imageName} to bucket.`);
      } catch (uploadError) {
        console.error(`Error uploading ${imageName}:`, uploadError);
      }
    }
  } catch (error) {
    console.error('Error during scraping:', error);
  } finally {
    await browser.close();
  }
})();
