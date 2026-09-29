// Zonen der Fahrzeugskizze (Draufsicht, Front oben) – genutzt in UI & PDF
export type Zone = { id: string; x: number; y: number; w: number; h: number; r?: number };

// Draufsicht, Fahrzeugfront oben
export const CAR_ZONES: Zone[] = [
  { id: "FRONT_BUMPER", x: 50, y: 8, w: 140, h: 26, r: 12 },
  { id: "HOOD", x: 56, y: 38, w: 128, h: 70, r: 6 },
  { id: "WINDSHIELD", x: 60, y: 111, w: 120, h: 34, r: 4 },
  { id: "ROOF", x: 62, y: 148, w: 116, h: 130, r: 4 },
  { id: "REAR_WINDOW", x: 60, y: 281, w: 120, h: 30, r: 4 },
  { id: "TRUNK", x: 56, y: 314, w: 128, h: 60, r: 6 },
  { id: "REAR_BUMPER", x: 50, y: 378, w: 140, h: 26, r: 12 },
  { id: "FENDER_FL", x: 22, y: 38, w: 30, h: 70, r: 6 },
  { id: "DOOR_FL", x: 22, y: 111, w: 30, h: 84, r: 3 },
  { id: "DOOR_RL", x: 22, y: 198, w: 30, h: 80, r: 3 },
  { id: "QUARTER_RL", x: 22, y: 281, w: 30, h: 93, r: 6 },
  { id: "FENDER_FR", x: 188, y: 38, w: 30, h: 70, r: 6 },
  { id: "DOOR_FR", x: 188, y: 111, w: 30, h: 84, r: 3 },
  { id: "DOOR_RR", x: 188, y: 198, w: 30, h: 80, r: 3 },
  { id: "QUARTER_RR", x: 188, y: 281, w: 30, h: 93, r: 6 },
  { id: "MIRROR_L", x: 2, y: 116, w: 17, h: 14, r: 3 },
  { id: "MIRROR_R", x: 221, y: 116, w: 17, h: 14, r: 3 },
  { id: "WHEEL_FL", x: 4, y: 50, w: 15, h: 44, r: 4 },
  { id: "WHEEL_FR", x: 221, y: 50, w: 15, h: 44, r: 4 },
  { id: "WHEEL_RL", x: 4, y: 300, w: 15, h: 44, r: 4 },
  { id: "WHEEL_RR", x: 221, y: 300, w: 15, h: 44, r: 4 },
];

