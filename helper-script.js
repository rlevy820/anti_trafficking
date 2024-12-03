const puppeteer = require('puppeteer');
const { Storage } = require('@google-cloud/storage');
const fs = require('fs');

async function main() {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  const storage = new Storage({
    keyFilename: '/Users/ryanlevy/Desktop/Anti Trafficing/mugshots/mugshots-443423-f1edb873cc28.json',
  });
  const bucket = storage.bucket('mugshots-data');

  const progressFile = './sample-progress.json';
  const sampledPhotosFile = './sampled-photos.json';

  let progress = { sampledStates: [], sampledCounties: {}, sampledAZ: {} };
  let sampledPhotos = [];
  let photosThisRun = []; // Tracks only photos collected during this run

  if (fs.existsSync(progressFile)) {
    progress = JSON.parse(fs.readFileSync(progressFile));
  }
  if (fs.existsSync(sampledPhotosFile)) {
    sampledPhotos = JSON.parse(fs.readFileSync(sampledPhotosFile));
  }

  async function saveProgress() {
    fs.writeFileSync(progressFile, JSON.stringify(progress));
  }

  async function saveSampledPhotos() {
    fs.writeFileSync(sampledPhotosFile, JSON.stringify(sampledPhotos));
  }

  function getRandomSubset(array, count) {
    const shuffled = array.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  async function scrapePhotosFromPage(url, maxPhotos) {
    try {
      console.log(`Scraping photos from page: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2' });

      const imageUrls = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('img'))
          .map((img) => img.src)
          .filter((url) => url.match(/mugshot.*\.(jpg|jpeg|png)$/i));
      });

      const unsampledPhotos = imageUrls.filter((url) => !sampledPhotos.includes(url));
      const sampledPhotosChunk = getRandomSubset(unsampledPhotos, maxPhotos);

      console.log(`Selected ${sampledPhotosChunk.length} new photos for sampling.`);

      for (const imageUrl of sampledPhotosChunk) {
        const imageName = imageUrl.split('/').pop();
        const file = bucket.file(imageName);

        try {
          const [exists] = await file.exists();
          if (exists) {
            console.log(`Skipped ${imageName}, already exists.`);
            continue;
          }

          const response = await page.goto(imageUrl);
          const buffer = await response.buffer();

          await file.save(buffer, { contentType: 'image/jpeg' });
          console.log(`Uploaded ${imageName} to bucket.`);

          sampledPhotos.push(imageUrl);
          photosThisRun.push(imageUrl); // Count only for this run
          await saveSampledPhotos();
        } catch (uploadError) {
          console.error(`Error uploading ${imageName}:`, uploadError);
        }
      }
    } catch (error) {
      console.error(`Error accessing page: ${url}. Skipping...`, error);
    }
  }

  async function scrapeAZFilters(countyUrl, maxAZ, maxPhotos) {
    try {
      console.log(`Scraping A-Z filters from county: ${countyUrl}`);
      await page.goto(countyUrl, { waitUntil: 'networkidle2' });

      const azFilters = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('nav#alphabet a'))
          .map((a) => ({
            href: a.href,
            name: a.textContent.trim(),
          }));
      });

      const unsampledAZ = azFilters.filter((az) => !progress.sampledAZ[az.href]);
      const sampledAZ = getRandomSubset(unsampledAZ, maxAZ);
      console.log(`Selected ${sampledAZ.length} A-Z filters for sampling.`);

      for (const az of sampledAZ) {
        progress.sampledAZ[az.href] = true;
        await scrapePhotosFromPage(az.href, maxPhotos);
        await saveProgress();

        if (photosThisRun.length >= minPhotos) {
          console.log(`Reached minimum photo count of ${minPhotos} this run.`);
          break;
        }
      }
    } catch (error) {
      console.error(`Error accessing county A-Z filters: ${countyUrl}. Skipping...`, error);
    }
  }

  async function scrapeCounties(stateUrl, maxCounties, maxAZ, maxPhotos) {
    try {
      console.log(`Scraping counties for state: ${stateUrl}`);
      await page.goto(stateUrl, { waitUntil: 'networkidle2' });

      const countyLinks = await page.evaluate(() => {
        return Array.from(
          document.querySelectorAll('div#subcategories div.column ul.categories li a')
        ).map((a) => ({
          href: a.href.startsWith('/') ? `https://mugshots.com${a.href}` : a.href,
          name: a.textContent.trim(),
        }));
      });

      const unsampledCounties = countyLinks.filter((county) => !progress.sampledCounties[county.href]);
      const sampledCounties = getRandomSubset(unsampledCounties, maxCounties);
      console.log(`Selected ${sampledCounties.length} counties for sampling.`);

      for (const county of sampledCounties) {
        progress.sampledCounties[county.href] = true;

        const hasAZ = await page.evaluate(() =>
          document.querySelector('nav#alphabet')
        );
        if (hasAZ) {
          await scrapeAZFilters(county.href, maxAZ, maxPhotos);
        } else {
          await scrapePhotosFromPage(county.href, maxPhotos);
        }
        await saveProgress();

        if (photosThisRun.length >= minPhotos) {
          console.log(`Reached minimum photo count of ${minPhotos} this run.`);
          break;
        }
      }
    } catch (error) {
      console.error(`Error accessing counties for state: ${stateUrl}. Skipping...`, error);
    }
  }

  async function scrapeStates(maxStates, maxCounties, maxAZ, maxPhotos) {
    try {
      console.log('Scraping states...');
      await page.goto('https://mugshots.com/US-States/', { waitUntil: 'networkidle2' });

      const stateLinks = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('div#subcategories div.column ul.categories li a'))
          .map((a) => ({
            href: a.href.startsWith('/') ? `https://mugshots.com${a.href}` : a.href,
            name: a.textContent.trim(),
          }));
      });

      const sampledStates = getRandomSubset(stateLinks, maxStates);

      console.log(`Selected ${sampledStates.length} states for sampling.`);

      for (const state of sampledStates) {
        await scrapeCounties(state.href, maxCounties, maxAZ, maxPhotos);
        if (photosThisRun.length >= minPhotos) {
          break;
        }
      }
    } catch (error) {
      console.error('Error accessing states. Skipping...', error);
    }
  }

  const minPhotos = 5000; // Set the minimum number of photos for this run

  while (true) {
    try {
      console.log('Starting a new scraping cycle...');
      photosThisRun = []; // Reset for each cycle
      await scrapeStates(50, 2, 2, 20);

      console.log(`Total new photos scraped this run: ${photosThisRun.length}`);
      if (photosThisRun.length < minPhotos) {
        console.log(`Reached fewer than ${minPhotos} photos. Retrying...`);
      } else {
        console.log(`Reached the target of ${minPhotos} photos. Exiting cycle.`);
        break;
      }
    } catch (error) {
      console.error('Error during scraping cycle:', error);
    }
  }

  await browser.close();
}

// Run the script
main().catch((error) => console.error('Script error:', error));
