export type MapPointer = {
  id: string;
  name: string;
  keyName: string;
  lat: number;
  lng: number;
  area: string;
};

export const MAP_POINTERS: MapPointer[] = [
  { id: "p01", name: "Red Deer Terminal", keyName: "RD-TERMINAL", lat: 52.268, lng: -113.811, area: "Red Deer" },
  { id: "p02", name: "Lacombe Depot", keyName: "LAC-DEPOT", lat: 52.468, lng: -113.734, area: "Lacombe" },
  { id: "p03", name: "Innisfail Mix Hub", keyName: "INN-HUB", lat: 52.021, lng: -113.951, area: "Innisfail" },
  { id: "p04", name: "Ponoka Ag Yard", keyName: "PON-AG", lat: 52.676, lng: -113.581, area: "Ponoka" },
  { id: "p05", name: "Stettler East Plant", keyName: "STT-EAST", lat: 52.323, lng: -112.719, area: "Stettler" },
  { id: "p06", name: "Bowden Fleet Base", keyName: "BOW-FLEET", lat: 51.931, lng: -114.032, area: "Bowden" },
  { id: "p07", name: "Alix Commercial", keyName: "ALX-COM", lat: 52.395, lng: -113.187, area: "Alix" },
  { id: "p08", name: "Highway 2 Cardlock", keyName: "HW2-LOCK", lat: 52.182, lng: -113.894, area: "Gasoline Alley" },
  { id: "p09", name: "Willow Creek Ranch", keyName: "WCR-TANK", lat: 51.932, lng: -114.201, area: "Bowden Rural" },
  { id: "p10", name: "Lacombe Hospital Tank", keyName: "LAC-HOSP", lat: 52.477, lng: -113.741, area: "Lacombe" },
];
