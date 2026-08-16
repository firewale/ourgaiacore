export interface Coordinate {
  lat: number;
  lng: number;
}

export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export function toLngLat(coord: Coordinate): [number, number] {
  return [coord.lng, coord.lat];
}
