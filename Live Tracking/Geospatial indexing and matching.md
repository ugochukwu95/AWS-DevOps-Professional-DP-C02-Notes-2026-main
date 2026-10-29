# Geospatial indexing and matching

The gateway has accepted a GPS fix. Matching needs a different question: which **available** drivers are near this pickup, cheaply, for thousands of pickups at once.

Distance math against every driver does not scale. Both practical options turn the map into **keys**.

## Start with Redis geo

Redis `GEOADD` / `GEOSEARCH` (the older `GEORADIUS` is deprecated) stores positions in a geohash and returns members inside a radius. One city often fits in a single key:

```text
GEOADD drivers:{cityId}  3.3792  6.5244  driver-42
GEOSEARCH drivers:{cityId} FROMLONLAT 3.3792 6.5244 BYRADIUS 2 km ASC COUNT 30
```

DevOps constraint: a Redis key lives on **one slot**. `drivers:lagos` is one shard, no matter how big the cluster is. That is fine for one city at startup volume. Shard by city (or by a coarse geohash prefix) before a single geo key becomes hot.

Use Redis geo while you have one product surface ("drivers within N km"). Move the hot nearby-query to H3 when you also need stable areas for supply/demand, surge, and zone stats.

## H3

[H3](https://h3geo.org/) is Uber's open hexagonal grid. A lat/lng becomes a 64-bit cell id, often written as a hex string (`882a107257fffff`). Nearby search is "this cell and its neighbors", which is a handful of key lookups.

Hexagons are used instead of squares because each neighbor is roughly the same distance from the center. Squares have closer edge-neighbors than corner-neighbors, so a "ring" of squares is a distorted circle.

Google's **S2** is the other common library (square cells on a space-filling curve). Pick **H3** unless you are joining data that is already S2. Do not run both in the matching path.

### Resolution

H3 resolution is a hierarchy from 0 (huge) to 15 (sub-meter). Edge lengths are approximate:

| Resolution | Edge length (approx.) | Typical use |
| --- | --- | --- |
| 7 | ~1.2 km | City heatmaps, "which zone is short of drivers" |
| 8 | ~460 m | Coarse nearby search |
| 9 | ~174 m | Matching in a dense city, with a neighbor ring |
| 10 | ~66 m | Pickup clustering, curbside grouping |
| 11+ | tens of meters down to sub-meter | Rare in the hot path; storage gets expensive |

Compute the cell **on the server** with the H3 library for your language (`h3-go`, `h3-js`, `h3-py`). Do not trust a cell id sent by the phone.

Twelve cells on the globe are pentagons rather than hexagons. They matter at coarse resolutions and almost never sit inside a single startup's city. Still call the library's neighbor function rather than assuming every cell has six neighbors.

### Redis layout for H3

Keep the driver record and the cell index as separate keys.

```text
HSET driver:{id}  lat 6.5244  lng 3.3792  h3 882a107257fffff
                 heading 182  speed 8.2  ts {serverMs}  status available
EXPIRE driver:{id}  45

SADD cell:{h3}  {driverId}
```

When the driver moves to a new cell, `SREM` the old cell and `SADD` the new one. Do that only when the cell changes, not on every tick. Refresh the driver hash TTL on every accepted tick so a crashed app disappears without an explicit offline.

Lookup:

```text
cell  = latLngToCell(pickup, 9)
ring  = gridDisk(cell, 1)          # center + neighbors
ids   = SUNION cell:{each ring cell}
```

Then load those driver hashes and drop anyone whose status is not `available`, whose `ts` is older than your freshness window, or who is already locked to a trip. Rank the remainder by distance or by a simple ETA (distance / recent speed).

`gridDisk` k=1 at resolution 9 covers on the order of a few hundred meters past the center cell. Raise k or drop to resolution 8 in a sparse city. Measure match rate (pickup finds at least one driver) before adding radius.

### Lock the driver

Two riders must not take the same car.

```text
SET offer:{driverId}  {tripId}  NX  EX 15
```

`NX` fails if another offer holds the driver. The TTL releases the lock if the app never answers. Confirming the trip writes `status=on_trip` and stores `tripId` on the driver hash. Cancel deletes the offer key.

## What stays out of the hot path

| Tool | Role |
| --- | --- |
| **Redis** | Current cell, current status, offer lock |
| **PostGIS** | Zones, airports, "is this pickup inside the service area?", saved places. Not a write per GPS tick. |
| **H3 on the cold log** | Aggregate trips and supply per cell in Athena/Spark for surge and planning |

A service-area check is a polygon query. Do it when the rider sets the pin, cache the result, and do not run PostGIS on the driver stream.

## Map display vs matching

These are different queries:

| View | How |
| --- | --- |
| Rider has a driver assigned | Server republishes that one driver's points to `trips/{tripId}/location`. One subscriber. |
| Rider is browsing cars nearby | Startup: HTTPS poll every 3 s for the viewport's cells, read Redis, return a few dozen pins. Later: the rider's WebSocket subscribes to the cells in view and the gateway pushes diffs. |
| Ops heatmap | Batch job over the cold log, or a slow counter per H3 cell. Never the matching query. |

Browsing must be **viewport-scoped**. Subscribing each rider to every driver in the city is the fan-out that melts the gateway.
