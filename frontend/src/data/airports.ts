export interface Airport {
  iata: string
  city: string
  country: string
}

export const airports: Airport[] = [
  // Ireland
  { iata: 'DUB', city: 'Dublin', country: 'Ireland' },
  { iata: 'ORK', city: 'Cork', country: 'Ireland' },
  { iata: 'SNN', city: 'Shannon', country: 'Ireland' },
  { iata: 'KIR', city: 'Kerry', country: 'Ireland' },
  { iata: 'NOC', city: 'Knock', country: 'Ireland' },

  // United Kingdom
  { iata: 'STN', city: 'London Stansted', country: 'United Kingdom' },
  { iata: 'LTN', city: 'London Luton', country: 'United Kingdom' },
  { iata: 'LGW', city: 'London Gatwick', country: 'United Kingdom' },
  { iata: 'BRS', city: 'Bristol', country: 'United Kingdom' },
  { iata: 'MAN', city: 'Manchester', country: 'United Kingdom' },
  { iata: 'BHX', city: 'Birmingham', country: 'United Kingdom' },
  { iata: 'EDI', city: 'Edinburgh', country: 'United Kingdom' },
  { iata: 'GLA', city: 'Glasgow', country: 'United Kingdom' },
  { iata: 'BFS', city: 'Belfast', country: 'United Kingdom' },
  { iata: 'LPL', city: 'Liverpool', country: 'United Kingdom' },
  { iata: 'NCL', city: 'Newcastle', country: 'United Kingdom' },
  { iata: 'LBA', city: 'Leeds Bradford', country: 'United Kingdom' },
  { iata: 'EMA', city: 'East Midlands', country: 'United Kingdom' },
  { iata: 'ABZ', city: 'Aberdeen', country: 'United Kingdom' },
  { iata: 'INV', city: 'Inverness', country: 'United Kingdom' },
  { iata: 'DSA', city: 'Doncaster', country: 'United Kingdom' },
  { iata: 'NQY', city: 'Newquay', country: 'United Kingdom' },
  { iata: 'EXT', city: 'Exeter', country: 'United Kingdom' },

  // Spain
  { iata: 'BCN', city: 'Barcelona', country: 'Spain' },
  { iata: 'MAD', city: 'Madrid', country: 'Spain' },
  { iata: 'AGP', city: 'Málaga', country: 'Spain' },
  { iata: 'ALC', city: 'Alicante', country: 'Spain' },
  { iata: 'VLC', city: 'Valencia', country: 'Spain' },
  { iata: 'SVQ', city: 'Seville', country: 'Spain' },
  { iata: 'PMI', city: 'Palma de Mallorca', country: 'Spain' },
  { iata: 'IBZ', city: 'Ibiza', country: 'Spain' },
  { iata: 'MAH', city: 'Menorca', country: 'Spain' },
  { iata: 'TFS', city: 'Tenerife', country: 'Spain' },
  { iata: 'LPA', city: 'Gran Canaria', country: 'Spain' },
  { iata: 'FUE', city: 'Fuerteventura', country: 'Spain' },
  { iata: 'ACE', city: 'Lanzarote', country: 'Spain' },
  { iata: 'SDR', city: 'Santander', country: 'Spain' },
  { iata: 'BIO', city: 'Bilbao', country: 'Spain' },
  { iata: 'VGO', city: 'Vigo', country: 'Spain' },
  { iata: 'SCQ', city: 'Santiago de Compostela', country: 'Spain' },
  { iata: 'GRX', city: 'Granada', country: 'Spain' },
  { iata: 'MJV', city: 'Murcia', country: 'Spain' },

  // Italy
  { iata: 'FCO', city: 'Rome', country: 'Italy' },
  { iata: 'BGY', city: 'Milan Bergamo', country: 'Italy' },
  { iata: 'MXP', city: 'Milan Malpensa', country: 'Italy' },
  { iata: 'NAP', city: 'Naples', country: 'Italy' },
  { iata: 'PSA', city: 'Pisa', country: 'Italy' },
  { iata: 'VCE', city: 'Venice', country: 'Italy' },
  { iata: 'BLQ', city: 'Bologna', country: 'Italy' },
  { iata: 'CTA', city: 'Catania', country: 'Italy' },
  { iata: 'PMO', city: 'Palermo', country: 'Italy' },
  { iata: 'BRI', city: 'Bari', country: 'Italy' },
  { iata: 'BDS', city: 'Brindisi', country: 'Italy' },
  { iata: 'VRN', city: 'Verona', country: 'Italy' },
  { iata: 'TRN', city: 'Turin', country: 'Italy' },
  { iata: 'CAG', city: 'Cagliari', country: 'Italy' },
  { iata: 'OLB', city: 'Olbia', country: 'Italy' },

  // Portugal
  { iata: 'LIS', city: 'Lisbon', country: 'Portugal' },
  { iata: 'OPO', city: 'Porto', country: 'Portugal' },
  { iata: 'FAO', city: 'Faro', country: 'Portugal' },
  { iata: 'FNC', city: 'Madeira', country: 'Portugal' },
  { iata: 'PDL', city: 'Ponta Delgada', country: 'Portugal' },

  // France
  { iata: 'CDG', city: 'Paris Charles de Gaulle', country: 'France' },
  { iata: 'ORY', city: 'Paris Orly', country: 'France' },
  { iata: 'BOD', city: 'Bordeaux', country: 'France' },
  { iata: 'MRS', city: 'Marseille', country: 'France' },
  { iata: 'LYS', city: 'Lyon', country: 'France' },
  { iata: 'NTE', city: 'Nantes', country: 'France' },
  { iata: 'TLS', city: 'Toulouse', country: 'France' },
  { iata: 'NCE', city: 'Nice', country: 'France' },
  { iata: 'BES', city: 'Brest', country: 'France' },
  { iata: 'LIL', city: 'Lille', country: 'France' },
  { iata: 'CFR', city: 'Caen', country: 'France' },
  { iata: 'BIQ', city: 'Biarritz', country: 'France' },

  // Germany
  { iata: 'BER', city: 'Berlin', country: 'Germany' },
  { iata: 'FRA', city: 'Frankfurt', country: 'Germany' },
  { iata: 'MUC', city: 'Munich', country: 'Germany' },
  { iata: 'HAM', city: 'Hamburg', country: 'Germany' },
  { iata: 'CGN', city: 'Cologne', country: 'Germany' },
  { iata: 'DUS', city: 'Düsseldorf', country: 'Germany' },
  { iata: 'STR', city: 'Stuttgart', country: 'Germany' },
  { iata: 'NUE', city: 'Nuremberg', country: 'Germany' },
  { iata: 'HHN', city: 'Frankfurt Hahn', country: 'Germany' },
  { iata: 'FMM', city: 'Memmingen', country: 'Germany' },

  // Netherlands
  { iata: 'AMS', city: 'Amsterdam', country: 'Netherlands' },
  { iata: 'EIN', city: 'Eindhoven', country: 'Netherlands' },

  // Belgium
  { iata: 'BRU', city: 'Brussels', country: 'Belgium' },
  { iata: 'CRL', city: 'Brussels Charleroi', country: 'Belgium' },

  // Poland
  { iata: 'WAW', city: 'Warsaw', country: 'Poland' },
  { iata: 'KRK', city: 'Krakow', country: 'Poland' },
  { iata: 'GDN', city: 'Gdansk', country: 'Poland' },
  { iata: 'WMI', city: 'Warsaw Modlin', country: 'Poland' },
  { iata: 'KTW', city: 'Katowice', country: 'Poland' },
  { iata: 'WRO', city: 'Wrocław', country: 'Poland' },
  { iata: 'POZ', city: 'Poznań', country: 'Poland' },
  { iata: 'LCJ', city: 'Łódź', country: 'Poland' },

  // Czech Republic
  { iata: 'PRG', city: 'Prague', country: 'Czech Republic' },
  { iata: 'BRQ', city: 'Brno', country: 'Czech Republic' },

  // Hungary
  { iata: 'BUD', city: 'Budapest', country: 'Hungary' },

  // Slovakia
  { iata: 'BTS', city: 'Bratislava', country: 'Slovakia' },

  // Austria
  { iata: 'VIE', city: 'Vienna', country: 'Austria' },
  { iata: 'GRZ', city: 'Graz', country: 'Austria' },
  { iata: 'LNZ', city: 'Linz', country: 'Austria' },
  { iata: 'SZG', city: 'Salzburg', country: 'Austria' },

  // Greece
  { iata: 'ATH', city: 'Athens', country: 'Greece' },
  { iata: 'SKG', city: 'Thessaloniki', country: 'Greece' },
  { iata: 'HER', city: 'Heraklion', country: 'Greece' },
  { iata: 'CFU', city: 'Corfu', country: 'Greece' },
  { iata: 'RHO', city: 'Rhodes', country: 'Greece' },
  { iata: 'KGS', city: 'Kos', country: 'Greece' },
  { iata: 'ZTH', city: 'Zakynthos', country: 'Greece' },
  { iata: 'CHQ', city: 'Chania', country: 'Greece' },
  { iata: 'JMK', city: 'Mykonos', country: 'Greece' },
  { iata: 'JSI', city: 'Skiathos', country: 'Greece' },

  // Cyprus
  { iata: 'PFO', city: 'Paphos', country: 'Cyprus' },
  { iata: 'LCA', city: 'Larnaca', country: 'Cyprus' },

  // Turkey
  { iata: 'SAW', city: 'Istanbul', country: 'Turkey' },
  { iata: 'ADB', city: 'Izmir', country: 'Turkey' },
  { iata: 'DLM', city: 'Dalaman', country: 'Turkey' },
  { iata: 'BJV', city: 'Bodrum', country: 'Turkey' },
  { iata: 'AYT', city: 'Antalya', country: 'Turkey' },

  // Romania
  { iata: 'OTP', city: 'Bucharest', country: 'Romania' },
  { iata: 'CLJ', city: 'Cluj-Napoca', country: 'Romania' },
  { iata: 'TSR', city: 'Timișoara', country: 'Romania' },
  { iata: 'IAS', city: 'Iași', country: 'Romania' },

  // Bulgaria
  { iata: 'SOF', city: 'Sofia', country: 'Bulgaria' },
  { iata: 'VAR', city: 'Varna', country: 'Bulgaria' },
  { iata: 'BOJ', city: 'Burgas', country: 'Bulgaria' },

  // Croatia
  { iata: 'ZAG', city: 'Zagreb', country: 'Croatia' },
  { iata: 'SPU', city: 'Split', country: 'Croatia' },
  { iata: 'DBV', city: 'Dubrovnik', country: 'Croatia' },

  // Slovenia
  { iata: 'LJU', city: 'Ljubljana', country: 'Slovenia' },

  // Serbia
  { iata: 'BEG', city: 'Belgrade', country: 'Serbia' },

  // North Macedonia
  { iata: 'SKP', city: 'Skopje', country: 'North Macedonia' },

  // Albania
  { iata: 'TIA', city: 'Tirana', country: 'Albania' },

  // Moldova
  { iata: 'KIV', city: 'Chisinau', country: 'Moldova' },

  // Ukraine
  { iata: 'KBP', city: 'Kyiv', country: 'Ukraine' },
  { iata: 'LWO', city: 'Lviv', country: 'Ukraine' },

  // Sweden
  { iata: 'ARN', city: 'Stockholm Arlanda', country: 'Sweden' },
  { iata: 'NYO', city: 'Stockholm Skavsta', country: 'Sweden' },
  { iata: 'GOT', city: 'Gothenburg', country: 'Sweden' },
  { iata: 'MMX', city: 'Malmö', country: 'Sweden' },

  // Norway
  { iata: 'OSL', city: 'Oslo', country: 'Norway' },
  { iata: 'BGO', city: 'Bergen', country: 'Norway' },
  { iata: 'TRD', city: 'Trondheim', country: 'Norway' },
  { iata: 'SVG', city: 'Stavanger', country: 'Norway' },

  // Denmark
  { iata: 'CPH', city: 'Copenhagen', country: 'Denmark' },
  { iata: 'BLL', city: 'Billund', country: 'Denmark' },
  { iata: 'AAR', city: 'Aarhus', country: 'Denmark' },

  // Finland
  { iata: 'HEL', city: 'Helsinki', country: 'Finland' },
  { iata: 'TMP', city: 'Tampere', country: 'Finland' },
  { iata: 'OUL', city: 'Oulu', country: 'Finland' },

  // Iceland
  { iata: 'KEF', city: 'Reykjavik', country: 'Iceland' },

  // Morocco
  { iata: 'CMN', city: 'Casablanca', country: 'Morocco' },
  { iata: 'RAK', city: 'Marrakech', country: 'Morocco' },
  { iata: 'FEZ', city: 'Fez', country: 'Morocco' },
  { iata: 'OUD', city: 'Oujda', country: 'Morocco' },
  { iata: 'NDR', city: 'Nador', country: 'Morocco' },
  { iata: 'TNG', city: 'Tangier', country: 'Morocco' },
  { iata: 'AGA', city: 'Agadir', country: 'Morocco' },

  // Israel
  { iata: 'TLV', city: 'Tel Aviv', country: 'Israel' },

  // Jordan
  { iata: 'AMM', city: 'Amman', country: 'Jordan' },

  // Malta
  { iata: 'MLA', city: 'Malta', country: 'Malta' },

  // Switzerland
  { iata: 'BSL', city: 'Basel', country: 'Switzerland' },

  // Luxembourg
  { iata: 'LUX', city: 'Luxembourg', country: 'Luxembourg' },
]
