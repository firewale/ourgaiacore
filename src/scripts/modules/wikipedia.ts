const geoUrl = 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*';
const extractUrl = 'https://en.wikipedia.org/w/api.php?format=json&action=query&prop=extracts&origin=*';

export interface WikiArticle {
  title: string;
  lat: number;
  long: number;
  pageId: number;
  extract?: string;
}

interface GeoSearchItem {
  title: string;
  lat: number;
  lon: number;
  pageid: number;
}

export async function getWikipediaData(
  latLng: google.maps.LatLng,
  callback: (results: Record<number, WikiArticle>) => void
): Promise<void> {
  const numOfResults = 100;
  const searchRadius = 10000;
  const lat = latLng.lat();
  const lng = latLng.lng();

  const geoParams = new URLSearchParams({
    gslimit: String(numOfResults),
    list: 'geosearch',
    gsradius: String(searchRadius),
    gscoord: `${lat}|${lng}`,
  });

  let geoData: { error?: { info: string }; query: { geosearch: GeoSearchItem[] } };
  try {
    const res = await fetch(`${geoUrl}&${geoParams}`);
    geoData = await res.json();
  } catch (err) {
    console.error('Wikipedia geosearch failed:', err);
    return;
  }

  if (geoData.error) {
    console.error('Wikipedia error:', geoData.error.info);
    return;
  }

  const items: Record<number, WikiArticle> = {};
  for (const item of geoData.query.geosearch) {
    items[item.pageid] = {
      title: item.title,
      lat: item.lat,
      long: item.lon,
      pageId: item.pageid,
    };
  }

  const extractResponses = await Promise.all(
    Object.values(items).map(async (item) => {
      const params = new URLSearchParams({ pageids: String(item.pageId) });
      const res = await fetch(`${extractUrl}&${params}`);
      return res.json() as Promise<{ query?: { pages?: Record<string, { extract?: string }> } }>;
    })
  );

  for (const data of extractResponses) {
    const pages = data?.query?.pages;
    if (!pages) continue;
    for (const [key, value] of Object.entries(pages)) {
      const id = Number(key);
      if (items[id]) {
        items[id].extract = value.extract;
      }
    }
  }

  callback(items);
}
