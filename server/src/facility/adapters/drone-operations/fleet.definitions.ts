import type { FlightDefinition } from './flight';

/** The operating area this stand-in flight-ops system covers. */
export const FLEET = {
  id: 'gulf-north',
  name: 'Gulf Aerial Survey — North Sector',
  area: 'Ras Laffan corridor',
  targetSortiesPerDay: 18,
} as const;

/**
 * Where the pipeline riser is.
 *
 * Unlike a berth, this one is worth verifying: an aircraft can claim to be
 * inspecting a leak here while flying somewhere else entirely, and the claim
 * is precisely what earns it a slice. The 2 km radius is sized to CAMARA's
 * ~1 km location accuracy, not to the riser.
 */
const RISER_FIX = { latitude: 26.15, longitude: 50.62, radiusMeters: 2_000 } as const;

/**
 * The sortie board.
 *
 * Flights 1 and 2 are the demonstration, and they are deliberately on the SAME
 * aircraft: a routine boundary survey followed by a pipeline leak inspection
 * over inhabited ground. Same device, same cell, same congestion, minutes
 * apart — and FlowGuard must reach opposite decisions.
 *
 * That is the identical argument the berth makes with containers, in a
 * different industry, on shared machinery. Which is the whole point of having
 * a second adapter at all.
 *
 * Flights 5 and 6 exist to make the agent's *other* two paths reachable, both
 * of which were dead until they were added:
 *
 *   flight-5  files the same urgent leak inspection as flight-2, in the same
 *             words, at the same riser — on an aircraft that is 24 km away.
 *             The paperwork is indistinguishable; only the network can tell
 *             them apart, which is the argument for reading the network at
 *             all. The evidence step verifies the position, `validate`
 *             downgrades the claim, and the slice is not granted.
 *   flight-6  is on an aircraft whose modem never attached. The guard clause
 *             ends it after two steps. Spending nothing on an asset that is
 *             not there is the same discipline as releasing.
 *
 * Phone numbers are Nokia sandbox simulated devices.
 */
export const SORTIE_BOARD: readonly FlightDefinition[] = [
  {
    id: 'flight-1',
    droneId: 'drone-3',
    devicePhoneNumber: '+99999991002',
    flight: {
      registration: 'A7-GAS-114',
      missionType: 'Scheduled boundary survey',
      payloadKg: 1.2,
      overPopulated: false,
      bvlos: false,
    },
    fromLocation: 'PAD NORTH-2',
    toLocation: 'GRID 44-C',
    expectedDurationSeconds: 120,
    deferrable: true,
    summary:
      'Routine photogrammetry pass over an uninhabited section of the site boundary, ' +
      'flown within visual line of sight. The survey is scheduled, repeatable and has ' +
      'no live decision depending on it — a dropped link ends the sortie early and it ' +
      'is reflown later.',
  },
  {
    id: 'flight-2',
    droneId: 'drone-3',
    devicePhoneNumber: '+99999991002',
    flight: {
      registration: 'A7-GAS-114',
      missionType: 'Pipeline leak inspection',
      payloadKg: 2.8,
      overPopulated: true,
      bvlos: true,
    },
    fromLocation: 'PAD NORTH-2',
    toLocation: 'RISER 7',
    expectedDurationSeconds: 240,
    siteFix: RISER_FIX,
    summary:
      'Emergency inspection of a suspected hydrocarbon leak at a pipeline riser, flown ' +
      'beyond visual line of sight across an inhabited access road. There is no ' +
      'observer: the operator is flying on the live video link alone, and an engineer ' +
      'is making an isolate-or-not call from that feed in real time.',
  },
  {
    id: 'flight-3',
    droneId: 'drone-2',
    devicePhoneNumber: '+99999991003',
    flight: {
      registration: 'A7-GAS-207',
      missionType: 'Stockpile volumetric',
      payloadKg: 1.6,
      overPopulated: false,
      bvlos: false,
    },
    fromLocation: 'PAD SOUTH-1',
    toLocation: 'YARD STOCKPILE 3',
    expectedDurationSeconds: 180,
    deferrable: true,
    summary:
      'Monthly volumetric capture of the aggregate stockpile for reconciliation. ' +
      'Nobody is beneath the flight path and the figures are not needed until the ' +
      'month-end close.',
  },
  {
    id: 'flight-4',
    droneId: 'drone-2',
    devicePhoneNumber: '+99999991003',
    flight: {
      registration: 'A7-GAS-207',
      missionType: 'Flare stack thermal inspection',
      payloadKg: 3.1,
      overPopulated: true,
      bvlos: true,
    },
    fromLocation: 'PAD SOUTH-1',
    toLocation: 'FLARE STACK B',
    expectedDurationSeconds: 300,
    summary:
      'Thermal survey of an operating flare stack while the unit stays online, flown ' +
      'beyond visual line of sight over the plant access route. Losing the feed with ' +
      'the aircraft inside the thermal plume forces a blind return with no way to ' +
      'confirm clearance.',
  },
  {
    id: 'flight-5',
    droneId: 'drone-9',
    devicePhoneNumber: '+99999991005',
    flight: {
      registration: 'A7-GAS-311',
      missionType: 'Pipeline leak inspection',
      payloadKg: 2.8,
      overPopulated: true,
      bvlos: true,
    },
    fromLocation: 'PAD EAST-4',
    toLocation: 'RISER 7',
    expectedDurationSeconds: 240,
    siteFix: RISER_FIX,
    summary:
      'Emergency inspection of a suspected hydrocarbon leak at riser 7, filed as urgent ' +
      'and beyond visual line of sight over inhabited ground. Word for word the highest-' +
      'priority sortie on the board.',
  },
  {
    id: 'flight-6',
    droneId: 'drone-7',
    devicePhoneNumber: '+99999991006',
    flight: {
      registration: 'A7-GAS-402',
      missionType: 'Perimeter thermal sweep',
      payloadKg: 2.1,
      overPopulated: true,
      bvlos: true,
    },
    fromLocation: 'PAD SOUTH-1',
    toLocation: 'GRID 51-B',
    expectedDurationSeconds: 200,
    siteFix: RISER_FIX,
    summary:
      'Night thermal sweep of the southern perimeter, flown beyond visual line of sight ' +
      'over the access road. The aircraft is on the board but its modem has not attached ' +
      'to the network since the battery swap, so there is no live link to protect.',
  },
];

export function findFlight(flightId: string): FlightDefinition | undefined {
  return SORTIE_BOARD.find((f) => f.id === flightId);
}
