export const SHOW_TYPES = ["concert", "theatre", "sport", "stand-up", "opera", "festival"] as const;
export type ShowType = (typeof SHOW_TYPES)[number];

export interface SeedVenue {
  readonly name: string;
  readonly city: string;
  readonly countryCode: string;
  readonly timezone: string;
}

export const SEED_VENUES: readonly SeedVenue[] = [
  { name: "Spreehalle", city: "Berlin", countryCode: "DE", timezone: "Europe/Berlin" },
  { name: "Tempelhof Arena", city: "Berlin", countryCode: "DE", timezone: "Europe/Berlin" },
  { name: "Isar Theater", city: "Munich", countryCode: "DE", timezone: "Europe/Berlin" },
  { name: "Salle Montmartre", city: "Paris", countryCode: "FR", timezone: "Europe/Paris" },
  { name: "Palais Lumiere", city: "Paris", countryCode: "FR", timezone: "Europe/Paris" },
  { name: "Halle Rhone", city: "Lyon", countryCode: "FR", timezone: "Europe/Paris" },
  { name: "Thames Hall", city: "London", countryCode: "GB", timezone: "Europe/London" },
  { name: "Westway Stadium", city: "London", countryCode: "GB", timezone: "Europe/London" },
  { name: "Canal Street Playhouse", city: "Manchester", countryCode: "GB", timezone: "Europe/London" },
  { name: "Teatro Retiro", city: "Madrid", countryCode: "ES", timezone: "Europe/Madrid" },
  { name: "Plaza Mayor Arena", city: "Madrid", countryCode: "ES", timezone: "Europe/Madrid" },
  { name: "Teatro Navigli", city: "Milan", countryCode: "IT", timezone: "Europe/Rome" },
];

export const GENRES: Readonly<Record<ShowType, readonly string[]>> = {
  concert: ["rock", "pop", "jazz", "electronic"],
  theatre: ["drama", "musical", "comedy-play"],
  sport: ["football", "basketball", "tennis"],
  "stand-up": ["observational", "satire"],
  opera: ["classic-opera", "contemporary-opera"],
  festival: ["music-festival", "food-festival", "film-festival"],
};

export const TITLE_STARTS: readonly string[] = [
  "Midnight", "Golden", "Electric", "Silent", "Crimson", "Northern", "Velvet", "Wild", "Hidden", "Final",
  "Rising", "Neon", "Ancient", "Bright", "Last", "Savage", "Gentle", "Iron", "Paper", "Salt",
];

export const TITLE_ENDS: Readonly<Record<ShowType, readonly string[]>> = {
  concert: ["Echoes Live", "Tour", "Sessions", "Nights"],
  theatre: ["Stage", "Players", "Curtain", "Story"],
  sport: ["Cup", "Derby", "Open", "Championship"],
  "stand-up": ["Laughs", "Comedy Night", "Unfiltered", "Live Mic"],
  opera: ["Aria", "Requiem", "Overture", "Serenade"],
  festival: ["Festival", "Fair", "Weekender", "Open Air"],
};

/** Base ticket price per type, in minor units. */
export const BASE_PRICE_MINOR: Readonly<Record<ShowType, number>> = {
  concert: 5500, theatre: 4000, sport: 3500, "stand-up": 2500, opera: 7500, festival: 9000,
};
