// ESPN's numeric team IDs mapped to our own stable team UUIDs (app/src/data.js
// TEAM_ID, duplicated here rather than imported — Firebase only deploys the
// contents of this functions/ directory, so a relative import reaching into
// app/src would resolve locally but break at deploy time). Generated from
// GET /teams against the live fifa.world league and cross-checked against
// TEAM_ID by name; the four teams where ESPN's displayName differs from our
// canonical name (Curaçao, Congo DR, Türkiye, United States) were aligned
// by hand.
export const ESPN_TEAM = {
  164: { id: "004750b3-7e2c-5a82-9617-04005d6c0455", name: "Spain", abbreviation: "ESP", logo: "https://a.espncdn.com/i/teamlogos/countries/500/esp.png" },
  202: { id: "08642760-194d-5d1b-a074-811c298d6822", name: "Argentina", abbreviation: "ARG", logo: "https://a.espncdn.com/i/teamlogos/countries/500/arg.png" },
  203: { id: "be3833eb-87cb-5da0-8e4c-443001ea513e", name: "Mexico", abbreviation: "MEX", logo: "https://a.espncdn.com/i/teamlogos/countries/500/mex.png" },
  205: { id: "319d6076-6a6a-5de2-a3a0-c004534ab271", name: "Brazil", abbreviation: "BRA", logo: "https://a.espncdn.com/i/teamlogos/countries/500/bra.png" },
  206: { id: "ea507eb3-7ffc-5b89-b218-bdf77bdd5e3c", name: "Canada", abbreviation: "CAN", logo: "https://a.espncdn.com/i/teamlogos/countries/500/can.png" },
  208: { id: "8e00af10-e1f2-5f2f-afec-ad9705d38dc1", name: "Colombia", abbreviation: "COL", logo: "https://a.espncdn.com/i/teamlogos/countries/500/col.png" },
  209: { id: "4b9e6a2c-652a-56c5-860f-b43f62532a0f", name: "Ecuador", abbreviation: "ECU", logo: "https://a.espncdn.com/i/teamlogos/countries/500/ecu.png" },
  210: { id: "8e4c3b45-cafc-5069-bdc0-562e13759c81", name: "Paraguay", abbreviation: "PAR", logo: "https://a.espncdn.com/i/teamlogos/countries/500/par.png" },
  212: { id: "b831775d-3b5d-5909-929b-eec85efa4d8e", name: "Uruguay", abbreviation: "URU", logo: "https://a.espncdn.com/i/teamlogos/countries/500/uru.png" },
  448: { id: "ad64f1bc-05fd-579a-bf7e-beca095ff819", name: "England", abbreviation: "ENG", logo: "https://a.espncdn.com/i/teamlogos/countries/500/eng.png" },
  449: { id: "2c0a9766-b0f5-5b58-9d69-8ed41d0afdc6", name: "Netherlands", abbreviation: "NED", logo: "https://a.espncdn.com/i/teamlogos/countries/500/ned.png" },
  450: { id: "032714b4-4798-5a8e-a788-8d4304cbfbb7", name: "Czechia", abbreviation: "CZE", logo: "https://a.espncdn.com/i/teamlogos/countries/500/cze.png" },
  451: { id: "dea6a721-9dbc-5383-b29b-c9b59647eec8", name: "South Korea", abbreviation: "KOR", logo: "https://a.espncdn.com/i/teamlogos/countries/500/kors.png" },
  452: { id: "a11c97bc-6795-51b2-b4b8-2d92badc03bf", name: "Bosnia-Herzegovina", abbreviation: "BIH", logo: "https://a.espncdn.com/i/teamlogos/countries/500/bih.png" },
  459: { id: "88b74173-8fb4-51bb-ba20-6b5c50b48b53", name: "Belgium", abbreviation: "BEL", logo: "https://a.espncdn.com/i/teamlogos/countries/500/bel.png" },
  464: { id: "6cdeac8c-2994-55e1-9556-f1a2446719bf", name: "Norway", abbreviation: "NOR", logo: "https://a.espncdn.com/i/teamlogos/countries/500/nor.png" },
  465: { id: "b5b07097-83df-510b-b1c7-e76d46ed1796", name: "Turkiye", abbreviation: "TUR", logo: "https://a.espncdn.com/i/teamlogos/countries/500/tur.png" },
  466: { id: "c7638393-de0e-5c81-aef6-d1cc2a235bc9", name: "Sweden", abbreviation: "SWE", logo: "https://a.espncdn.com/i/teamlogos/countries/500/swe.png" },
  467: { id: "a001c536-5f32-5d3a-9524-2625768e2db6", name: "South Africa", abbreviation: "RSA", logo: "https://a.espncdn.com/i/teamlogos/countries/500/rsa.png" },
  469: { id: "6817012b-39d2-519c-af6a-c5772cefe1fd", name: "Iran", abbreviation: "IRN", logo: "https://a.espncdn.com/i/teamlogos/countries/500/irn.png" },
  474: { id: "a115a8a6-917c-515c-a150-c4f32a8f0d64", name: "Austria", abbreviation: "AUT", logo: "https://a.espncdn.com/i/teamlogos/countries/500/aut.png" },
  475: { id: "234a158e-477a-5c2c-a04c-041cc7d1f1cf", name: "Switzerland", abbreviation: "SUI", logo: "https://a.espncdn.com/i/teamlogos/countries/500/sui.png" },
  477: { id: "798acc19-b47f-5cb6-a6d1-012c452c0327", name: "Croatia", abbreviation: "CRO", logo: "https://a.espncdn.com/i/teamlogos/countries/500/cro.png" },
  478: { id: "ef3a7683-fdc9-55a7-8f5a-1f398ba8b19b", name: "France", abbreviation: "FRA", logo: "https://a.espncdn.com/i/teamlogos/countries/500/fra.png" },
  481: { id: "2bc26ff0-285f-51c7-ac24-a244cac0487d", name: "Germany", abbreviation: "GER", logo: "https://a.espncdn.com/i/teamlogos/countries/500/ger.png" },
  482: { id: "ffb9f9ca-2c16-531f-bd23-3bba0e2ae1d6", name: "Portugal", abbreviation: "POR", logo: "https://a.espncdn.com/i/teamlogos/countries/500/por.png" },
  580: { id: "fc837bbc-99ee-5853-8cb5-97751f5a7223", name: "Scotland", abbreviation: "SCO", logo: "https://a.espncdn.com/i/teamlogos/countries/500/sco.png" },
  624: { id: "a6d30860-04c6-5fac-aa75-2834082dc9b3", name: "Algeria", abbreviation: "ALG", logo: "https://a.espncdn.com/i/teamlogos/countries/500/alg.png" },
  627: { id: "9c073283-4bbc-575b-b242-66457f265171", name: "Japan", abbreviation: "JPN", logo: "https://a.espncdn.com/i/teamlogos/countries/500/jpn.png" },
  628: { id: "880e95ce-8947-5198-b3de-84631abbe3cb", name: "Australia", abbreviation: "AUS", logo: "https://a.espncdn.com/i/teamlogos/countries/500/aus.png" },
  654: { id: "28f75665-e569-5933-8d38-60deaef402be", name: "Senegal", abbreviation: "SEN", logo: "https://a.espncdn.com/i/teamlogos/countries/500/sen.png" },
  655: { id: "b0170cd1-53d8-5374-b11f-464f804a88f2", name: "Saudi Arabia", abbreviation: "KSA", logo: "https://a.espncdn.com/i/teamlogos/countries/500/ksa.png" },
  659: { id: "2e18893b-2d82-560b-89f0-8672054977a7", name: "Tunisia", abbreviation: "TUN", logo: "https://a.espncdn.com/i/teamlogos/countries/500/tun.png" },
  660: { id: "192ff8ed-ee5e-5883-972c-a73457bb6561", name: "USA", abbreviation: "USA", logo: "https://a.espncdn.com/i/teamlogos/countries/500/usa.png" },
  2570: { id: "5a434128-eeee-5884-b8c3-a8f4be5598d3", name: "Uzbekistan", abbreviation: "UZB", logo: "https://a.espncdn.com/i/teamlogos/countries/500/uzb.png" },
  2597: { id: "4317f28f-c456-5b80-854d-a7689f61996b", name: "Cape Verde", abbreviation: "CPV", logo: "https://a.espncdn.com/i/teamlogos/countries/500/cpv.png" },
  2620: { id: "60a0170d-d508-5f72-8d71-556a5417a9f9", name: "Egypt", abbreviation: "EGY", logo: "https://a.espncdn.com/i/teamlogos/countries/500/egy.png" },
  2654: { id: "8f3daaf9-4f5d-5bb6-a332-d25c2bee421b", name: "Haiti", abbreviation: "HAI", logo: "https://a.espncdn.com/i/teamlogos/countries/500/hai.png" },
  2659: { id: "ca564f3d-f522-5d9b-a286-b92ae78f98a5", name: "Panama", abbreviation: "PAN", logo: "https://a.espncdn.com/i/teamlogos/countries/500/pan.png" },
  2666: { id: "ca4717d1-f71e-5902-91d9-e2cc51bd9f99", name: "New Zealand", abbreviation: "NZL", logo: "https://a.espncdn.com/i/teamlogos/countries/500/nzl.png" },
  2850: { id: "56043e4c-8bbf-5ba3-9d1f-625b1ff387c0", name: "DR Congo", abbreviation: "COD", logo: "https://a.espncdn.com/i/teamlogos/countries/500/rdc.png" },
  2869: { id: "811717a9-ae7c-5bb7-859b-7bd0d31b73c1", name: "Morocco", abbreviation: "MAR", logo: "https://a.espncdn.com/i/teamlogos/countries/500/mar.png" },
  2917: { id: "367bc7eb-8aef-598b-ba4a-d86809d5ab03", name: "Jordan", abbreviation: "JOR", logo: "https://a.espncdn.com/i/teamlogos/countries/500/jor.png" },
  4375: { id: "fa3b238a-6876-56a5-b7f6-d36c73d919ea", name: "Iraq", abbreviation: "IRQ", logo: "https://a.espncdn.com/i/teamlogos/countries/500/irq.png" },
  4398: { id: "7dcba994-66e9-50b2-939c-394f577b93fc", name: "Qatar", abbreviation: "QAT", logo: "https://a.espncdn.com/i/teamlogos/countries/500/qat.png" },
  4469: { id: "1548ac7b-f676-5ba7-9722-e8cb63599f86", name: "Ghana", abbreviation: "GHA", logo: "https://a.espncdn.com/i/teamlogos/countries/500/gha.png" },
  4789: { id: "ee803858-f87b-56bc-afc2-7bc22d73f88f", name: "Ivory Coast", abbreviation: "CIV", logo: "https://a.espncdn.com/i/teamlogos/countries/500/civ.png" },
  11678: { id: "d0bcf6d9-06cf-59b3-9d5b-8f46cd696f49", name: "Curacao", abbreviation: "CUW", logo: "https://a.espncdn.com/i/teamlogos/soccer/500/11678.png" },
}

export function resolveTeam(espnTeamId) {
  return ESPN_TEAM[Number(espnTeamId)] ?? null
}
