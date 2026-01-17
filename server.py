from flask import Flask, jsonify, send_from_directory
from google.transit import gtfs_realtime_pb2
import requests
import time
from datetime import datetime

app = Flask(__name__, static_folder='public')

# MTA GTFS-realtime feed URLs
FEEDS = {
    '123456': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
    'ACE': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace',
    'BDFM': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm'
}

# Columbus Circle-59 St stop IDs
# Format: stopId + direction (N = uptown, S = downtown)
COLUMBUS_CIRCLE_STOPS = {
    '125N': {'line': '1', 'direction': 'Uptown'},
    '125S': {'line': '1', 'direction': 'Downtown'},
    'A24N': {'line': 'A/C/B/D', 'direction': 'Uptown'},
    'A24S': {'line': 'A/C/B/D', 'direction': 'Downtown'}
}


def fetch_feed(url):
    """Fetch and parse a GTFS-realtime feed."""
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()

        feed = gtfs_realtime_pb2.FeedMessage()
        feed.ParseFromString(response.content)
        return feed
    except Exception as e:
        print(f"Error fetching feed {url}: {e}")
        return None


def extract_arrivals(feed):
    """Extract arrivals for Columbus Circle from a feed."""
    arrivals = []
    now = int(time.time())

    if not feed:
        return arrivals

    for entity in feed.entity:
        if not entity.HasField('trip_update'):
            continue

        trip_update = entity.trip_update
        route_id = trip_update.trip.route_id if trip_update.HasField('trip') else ''

        for stop_time in trip_update.stop_time_update:
            stop_id = stop_time.stop_id

            if stop_id in COLUMBUS_CIRCLE_STOPS:
                arrival_time = None

                if stop_time.HasField('arrival'):
                    arrival_time = stop_time.arrival.time

                if arrival_time and arrival_time > now:
                    minutes_away = round((arrival_time - now) / 60)

                    arrivals.append({
                        'line': route_id,
                        'direction': COLUMBUS_CIRCLE_STOPS[stop_id]['direction'],
                        'arrivalTime': arrival_time,
                        'minutesAway': minutes_away
                    })

    return arrivals


@app.route('/')
def index():
    return send_from_directory('public', 'index.html')


@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('public', filename)


@app.route('/api/arrivals')
def get_arrivals():
    all_arrivals = []

    # Fetch all feeds
    for name, url in FEEDS.items():
        feed = fetch_feed(url)
        arrivals = extract_arrivals(feed)
        all_arrivals.extend(arrivals)

    # Sort by arrival time
    all_arrivals.sort(key=lambda x: x['arrivalTime'])

    # Group by direction
    uptown = [a for a in all_arrivals if a['direction'] == 'Uptown'][:20]
    downtown = [a for a in all_arrivals if a['direction'] == 'Downtown'][:20]

    return jsonify({
        'station': 'Columbus Circle-59 St',
        'updatedAt': datetime.now().isoformat(),
        'arrivals': {
            'uptown': uptown,
            'downtown': downtown
        }
    })


if __name__ == '__main__':
    print("Subway arrivals server running at http://localhost:3000")
    app.run(host='0.0.0.0', port=3000, debug=False)
