export interface Coordinate {
  lat: number;
  lng: number;
}

export function toLngLat(coord: Coordinate): [number, number] {
  return [coord.lng, coord.lat];
}
