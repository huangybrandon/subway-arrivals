const express = require('express');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

const app = express();
const PORT = 3000;

// MTA GTFS-realtime feed URLs
const FEEDS = {
  '123456': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
  'ACE': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace',
  'BDFM': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm'
};

// Columbus Circle-59 St stop IDs
// Format: stopId + direction (N = uptown, S = downtown)
const COLUMBUS_CIRCLE_STOPS = {
  '125N': { line: '1', direction: 'Uptown' },
  '125S': { line: '1', direction: 'Downtown' },
  'A24N': { line: 'A/C/B/D', direction: 'Uptown' },
  'A24S': { line: 'A/C/B/D', direction: 'Downtown' }
};

app.use(express.static('public'));

async function fetchFeed(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(buffer)
    );
    return feed;
  } catch (error) {
    console.error(`Error fetching feed ${url}:`, error.message);
    return null;
  }
}

function extractArrivals(feed) {
  const arrivals = [];
  const now = Math.floor(Date.now() / 1000);

  if (!feed || !feed.entity) return arrivals;

  for (const entity of feed.entity) {
    if (!entity.tripUpdate) continue;

    const tripUpdate = entity.tripUpdate;
    const routeId = tripUpdate.trip?.routeId || '';

    if (!tripUpdate.stopTimeUpdate) continue;

    for (const stopTime of tripUpdate.stopTimeUpdate) {
      const stopId = stopTime.stopId;

      if (COLUMBUS_CIRCLE_STOPS[stopId]) {
        const arrivalTime = stopTime.arrival?.time?.low || stopTime.arrival?.time || null;

        if (arrivalTime && arrivalTime > now) {
          const minutesAway = Math.round((arrivalTime - now) / 60);

          arrivals.push({
            line: routeId,
            direction: COLUMBUS_CIRCLE_STOPS[stopId].direction,
            arrivalTime: arrivalTime,
            minutesAway: minutesAway
          });
        }
      }
    }
  }

  return arrivals;
}

app.get('/api/arrivals', async (req, res) => {
  try {
    const allArrivals = [];

    // Fetch all feeds in parallel
    const feedPromises = Object.entries(FEEDS).map(async ([name, url]) => {
      const feed = await fetchFeed(url);
      return extractArrivals(feed);
    });

    const results = await Promise.all(feedPromises);

    for (const arrivals of results) {
      allArrivals.push(...arrivals);
    }

    // Sort by arrival time
    allArrivals.sort((a, b) => a.arrivalTime - b.arrivalTime);

    // Group by direction
    const grouped = {
      uptown: allArrivals.filter(a => a.direction === 'Uptown').slice(0, 10),
      downtown: allArrivals.filter(a => a.direction === 'Downtown').slice(0, 10)
    };

    res.json({
      station: 'Columbus Circle-59 St',
      updatedAt: new Date().toISOString(),
      arrivals: grouped
    });
  } catch (error) {
    console.error('Error fetching arrivals:', error);
    res.status(500).json({ error: 'Failed to fetch arrivals' });
  }
});

app.listen(PORT, () => {
  console.log(`Subway arrivals server running at http://localhost:${PORT}`);
});
