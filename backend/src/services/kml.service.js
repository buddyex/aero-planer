const fs = require('fs');
const {
  validatePolygon,
  computeCentroid,
  computeBoundingRadiusKm,
} = require('../lib/geo-bounds');

function decodeXmlEntities(text) {
  return String(text)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractTagContent(block, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = block.match(regex);
  return match ? decodeXmlEntities(match[1].trim()) : null;
}

function parseCoordinateTuples(raw) {
  return String(raw)
    .trim()
    .split(/\s+/)
    .map((tuple) => tuple.split(',').map((part) => parseFloat(part)))
    .filter((parts) => parts.length >= 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1]))
    .map(([lon, lat]) => [lat, lon]);
}

function closeRing(ring) {
  if (ring.length < 3) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, first];
}

function parseKmlContent(kmlText) {
  const placemarks = [];
  const blocks = String(kmlText).match(/<Placemark[\s\S]*?<\/Placemark>/gi) ?? [];

  for (const block of blocks) {
    const name = extractTagContent(block, 'name') || 'Сектор без названия';
    const polygonCoords =
      extractTagContent(block, 'coordinates') ||
      extractTagContent(block, 'gx:coord') ||
      null;

    if (!polygonCoords) continue;

    const isPoint = /<Point[\s>]/i.test(block) && !/<LineString[\s>]/i.test(block) && !/<Polygon[\s>]/i.test(block);
    if (isPoint) continue;

    let ring = parseCoordinateTuples(polygonCoords);
    ring = closeRing(ring);

    if (ring.length < 3) continue;

    placemarks.push({
      name,
      ring,
      shape_type: 'polygon',
    });
  }

  return placemarks;
}

function parseKmlFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseKmlContent(content);
}

function ringToKmlCoordinates(ring) {
  const closed = closeRing(ring);
  return closed.map(([lat, lon]) => `${lon},${lat},0`).join(' ');
}

function exportSectorsToKml(sectors, documentName = 'Секторы Aero-Planer') {
  const placemarks = sectors
    .map((sector) => {
      let ring = null;
      if (sector.boundary_polygon) {
        try {
          ring = JSON.parse(sector.boundary_polygon);
        } catch {
          ring = null;
        }
      }

      if (!ring || ring.length < 3) {
        if (sector.center_lat == null || sector.center_lon == null) return null;
        const lat = sector.center_lat;
        const lon = sector.center_lon;
        const radiusKm = sector.radius_km ?? 20;
        const d = radiusKm / 111;
        ring = [];
        for (let i = 0; i <= 32; i += 1) {
          const angle = (i / 32) * Math.PI * 2;
          ring.push([lat + d * Math.cos(angle), lon + d * Math.sin(angle)]);
        }
      }

      return {
        name: sector.sector_name,
        ring,
      };
    })
    .filter(Boolean);

  const body = placemarks
    .map(
      (item) => `  <Placemark>
    <name>${escapeXml(item.name)}</name>
    <styleUrl>#sector</styleUrl>
    <Polygon>
      <outerBoundaryIs>
        <LinearRing>
          <coordinates>${ringToKmlCoordinates(item.ring)}</coordinates>
        </LinearRing>
      </outerBoundaryIs>
    </Polygon>
  </Placemark>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${escapeXml(documentName)}</name>
  <Style id="sector">
    <LineStyle><color>ff00ffff</color><width>2</width></LineStyle>
    <PolyStyle><fill>0</fill></PolyStyle>
  </Style>
${body}
</Document>
</kml>`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function prepareSectorFromKmlPlacemark(placemark) {
  const validation = validatePolygon(placemark.ring);
  if (!validation.ok) {
    return { ok: false, message: `${placemark.name}: ${validation.message}` };
  }

  const centroid = computeCentroid(validation.ring);
  return {
    ok: true,
    sector_name: placemark.name,
    shape_type: 'polygon',
    boundary_polygon: JSON.stringify(validation.ring),
    center_lat: centroid.lat,
    center_lon: centroid.lon,
    radius_km: computeBoundingRadiusKm(validation.ring, centroid.lat, centroid.lon),
  };
}

function lineStringToKmlCoordinates(geoJsonLineString) {
  let geometry = geoJsonLineString;
  if (typeof geometry === 'string') {
    try {
      geometry = JSON.parse(geometry);
    } catch {
      return null;
    }
  }
  const coords = geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  return coords
    .filter((pair) => Array.isArray(pair) && pair.length >= 2)
    .map(([lon, lat]) => `${lon},${lat},0`)
    .join(' ');
}

function exportMissionToKml(sector, missionTitle, routeGeometry = null) {
  const sectorKml = exportSectorsToKml([sector], missionTitle || sector.sector_name);
  const routeCoords = routeGeometry ? lineStringToKmlCoordinates(routeGeometry) : null;
  if (!routeCoords) {
    return sectorKml;
  }

  const routePlacemark = `  <Placemark>
    <name>${escapeXml(`Маршрут: ${missionTitle || sector.sector_name}`)}</name>
    <styleUrl>#route</styleUrl>
    <LineString>
      <coordinates>${routeCoords}</coordinates>
    </LineString>
  </Placemark>`;

  return sectorKml.replace(
    '<Style id="sector">',
    `<Style id="route">
    <LineStyle><color>ff00a5ff</color><width>3</width></LineStyle>
  </Style>
  <Style id="sector">`,
  ).replace('</Document>', `${routePlacemark}\n</Document>`);
}

module.exports = {
  parseKmlContent,
  parseKmlFile,
  exportSectorsToKml,
  exportMissionToKml,
  prepareSectorFromKmlPlacemark,
  ringToKmlCoordinates,
  lineStringToKmlCoordinates,
};
