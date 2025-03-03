# Intro
Internet mugshot data comes from law enforcement and police departments that make booking
photos available online. Many third party sites collect data from those sources, so they act as a
superset of state and county mugshot data. These include sites like Mugshots.com, Arrests.org,
Mugshots.zone, RecentlyBooked.com, FindMugshots.com, MugshotLook.com.

# Collection
I cloned this [script](https://github.com/agaricide/mugshots-client) that uses [puppeteer](https://github.com/puppeteer/puppeteer) to scrape [Mugshots.com](https://mugshots.com/). I altered the code using [Claude AI](https://claude.ai/) to collect
chunks of 1,000 pictures that capture a random sample from the site. I stored these photos in a
Google Cloud bucket mugshots-data.

# Limitations
Federal mugshots are less open to the public than state. Several states have laws regulating
mugshot publication/access including CA, CO, GA, MO, OR, TX, UT. This may cause
underrepresentation in the data.

# Results
Google Cloud Bucket with 108,906 jpeg mugshots.
