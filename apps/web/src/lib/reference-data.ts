/**
 * ISO reference data for registration and pricing selectors.
 * Countries: ISO 3166-1 alpha-2 (249 entries).
 * Currencies: 155 current ISO 4217 national/territorial currencies (fund codes excluded).
 * Country names: datasets/country-list; currency names/minor units: SIX Group List One (ISO 4217 Maintenance Agency), 2026-09-17 snapshot.
 * Refresh this file when upstream ISO lists change. This is not an FX-rate source.
 */
export const COUNTRY_OPTIONS = [
  {
    "value": "AF",
    "label": "Afghanistan"
  },
  {
    "value": "AL",
    "label": "Albania"
  },
  {
    "value": "DZ",
    "label": "Algeria"
  },
  {
    "value": "AS",
    "label": "American Samoa"
  },
  {
    "value": "AD",
    "label": "Andorra"
  },
  {
    "value": "AO",
    "label": "Angola"
  },
  {
    "value": "AI",
    "label": "Anguilla"
  },
  {
    "value": "AQ",
    "label": "Antarctica"
  },
  {
    "value": "AG",
    "label": "Antigua and Barbuda"
  },
  {
    "value": "AR",
    "label": "Argentina"
  },
  {
    "value": "AM",
    "label": "Armenia"
  },
  {
    "value": "AW",
    "label": "Aruba"
  },
  {
    "value": "AU",
    "label": "Australia"
  },
  {
    "value": "AT",
    "label": "Austria"
  },
  {
    "value": "AZ",
    "label": "Azerbaijan"
  },
  {
    "value": "BS",
    "label": "Bahamas"
  },
  {
    "value": "BH",
    "label": "Bahrain"
  },
  {
    "value": "BD",
    "label": "Bangladesh"
  },
  {
    "value": "BB",
    "label": "Barbados"
  },
  {
    "value": "BY",
    "label": "Belarus"
  },
  {
    "value": "BE",
    "label": "Belgium"
  },
  {
    "value": "BZ",
    "label": "Belize"
  },
  {
    "value": "BJ",
    "label": "Benin"
  },
  {
    "value": "BM",
    "label": "Bermuda"
  },
  {
    "value": "BT",
    "label": "Bhutan"
  },
  {
    "value": "BO",
    "label": "Bolivia, Plurinational State of"
  },
  {
    "value": "BQ",
    "label": "Bonaire, Sint Eustatius and Saba"
  },
  {
    "value": "BA",
    "label": "Bosnia and Herzegovina"
  },
  {
    "value": "BW",
    "label": "Botswana"
  },
  {
    "value": "BV",
    "label": "Bouvet Island"
  },
  {
    "value": "BR",
    "label": "Brazil"
  },
  {
    "value": "IO",
    "label": "British Indian Ocean Territory"
  },
  {
    "value": "BN",
    "label": "Brunei Darussalam"
  },
  {
    "value": "BG",
    "label": "Bulgaria"
  },
  {
    "value": "BF",
    "label": "Burkina Faso"
  },
  {
    "value": "BI",
    "label": "Burundi"
  },
  {
    "value": "CV",
    "label": "Cabo Verde"
  },
  {
    "value": "KH",
    "label": "Cambodia"
  },
  {
    "value": "CM",
    "label": "Cameroon"
  },
  {
    "value": "CA",
    "label": "Canada"
  },
  {
    "value": "KY",
    "label": "Cayman Islands"
  },
  {
    "value": "CF",
    "label": "Central African Republic"
  },
  {
    "value": "TD",
    "label": "Chad"
  },
  {
    "value": "CL",
    "label": "Chile"
  },
  {
    "value": "CN",
    "label": "China"
  },
  {
    "value": "CX",
    "label": "Christmas Island"
  },
  {
    "value": "CC",
    "label": "Cocos (Keeling) Islands"
  },
  {
    "value": "CO",
    "label": "Colombia"
  },
  {
    "value": "KM",
    "label": "Comoros"
  },
  {
    "value": "CG",
    "label": "Congo"
  },
  {
    "value": "CD",
    "label": "Congo, The Democratic Republic of the"
  },
  {
    "value": "CK",
    "label": "Cook Islands"
  },
  {
    "value": "CR",
    "label": "Costa Rica"
  },
  {
    "value": "HR",
    "label": "Croatia"
  },
  {
    "value": "CU",
    "label": "Cuba"
  },
  {
    "value": "CW",
    "label": "Curaçao"
  },
  {
    "value": "CY",
    "label": "Cyprus"
  },
  {
    "value": "CZ",
    "label": "Czechia"
  },
  {
    "value": "CI",
    "label": "Côte d'Ivoire"
  },
  {
    "value": "DK",
    "label": "Denmark"
  },
  {
    "value": "DJ",
    "label": "Djibouti"
  },
  {
    "value": "DM",
    "label": "Dominica"
  },
  {
    "value": "DO",
    "label": "Dominican Republic"
  },
  {
    "value": "EC",
    "label": "Ecuador"
  },
  {
    "value": "EG",
    "label": "Egypt"
  },
  {
    "value": "SV",
    "label": "El Salvador"
  },
  {
    "value": "GQ",
    "label": "Equatorial Guinea"
  },
  {
    "value": "ER",
    "label": "Eritrea"
  },
  {
    "value": "EE",
    "label": "Estonia"
  },
  {
    "value": "SZ",
    "label": "Eswatini"
  },
  {
    "value": "ET",
    "label": "Ethiopia"
  },
  {
    "value": "FK",
    "label": "Falkland Islands (Malvinas)"
  },
  {
    "value": "FO",
    "label": "Faroe Islands"
  },
  {
    "value": "FJ",
    "label": "Fiji"
  },
  {
    "value": "FI",
    "label": "Finland"
  },
  {
    "value": "FR",
    "label": "France"
  },
  {
    "value": "GF",
    "label": "French Guiana"
  },
  {
    "value": "PF",
    "label": "French Polynesia"
  },
  {
    "value": "TF",
    "label": "French Southern Territories"
  },
  {
    "value": "GA",
    "label": "Gabon"
  },
  {
    "value": "GM",
    "label": "Gambia"
  },
  {
    "value": "GE",
    "label": "Georgia"
  },
  {
    "value": "DE",
    "label": "Germany"
  },
  {
    "value": "GH",
    "label": "Ghana"
  },
  {
    "value": "GI",
    "label": "Gibraltar"
  },
  {
    "value": "GR",
    "label": "Greece"
  },
  {
    "value": "GL",
    "label": "Greenland"
  },
  {
    "value": "GD",
    "label": "Grenada"
  },
  {
    "value": "GP",
    "label": "Guadeloupe"
  },
  {
    "value": "GU",
    "label": "Guam"
  },
  {
    "value": "GT",
    "label": "Guatemala"
  },
  {
    "value": "GG",
    "label": "Guernsey"
  },
  {
    "value": "GN",
    "label": "Guinea"
  },
  {
    "value": "GW",
    "label": "Guinea-Bissau"
  },
  {
    "value": "GY",
    "label": "Guyana"
  },
  {
    "value": "HT",
    "label": "Haiti"
  },
  {
    "value": "HM",
    "label": "Heard Island and McDonald Islands"
  },
  {
    "value": "VA",
    "label": "Holy See (Vatican City State)"
  },
  {
    "value": "HN",
    "label": "Honduras"
  },
  {
    "value": "HK",
    "label": "Hong Kong"
  },
  {
    "value": "HU",
    "label": "Hungary"
  },
  {
    "value": "IS",
    "label": "Iceland"
  },
  {
    "value": "IN",
    "label": "India"
  },
  {
    "value": "ID",
    "label": "Indonesia"
  },
  {
    "value": "IR",
    "label": "Iran, Islamic Republic of"
  },
  {
    "value": "IQ",
    "label": "Iraq"
  },
  {
    "value": "IE",
    "label": "Ireland"
  },
  {
    "value": "IM",
    "label": "Isle of Man"
  },
  {
    "value": "IL",
    "label": "Israel"
  },
  {
    "value": "IT",
    "label": "Italy"
  },
  {
    "value": "JM",
    "label": "Jamaica"
  },
  {
    "value": "JP",
    "label": "Japan"
  },
  {
    "value": "JE",
    "label": "Jersey"
  },
  {
    "value": "JO",
    "label": "Jordan"
  },
  {
    "value": "KZ",
    "label": "Kazakhstan"
  },
  {
    "value": "KE",
    "label": "Kenya"
  },
  {
    "value": "KI",
    "label": "Kiribati"
  },
  {
    "value": "KP",
    "label": "Korea, Democratic People's Republic of"
  },
  {
    "value": "KR",
    "label": "Korea, Republic of"
  },
  {
    "value": "KW",
    "label": "Kuwait"
  },
  {
    "value": "KG",
    "label": "Kyrgyzstan"
  },
  {
    "value": "LA",
    "label": "Lao People's Democratic Republic"
  },
  {
    "value": "LV",
    "label": "Latvia"
  },
  {
    "value": "LB",
    "label": "Lebanon"
  },
  {
    "value": "LS",
    "label": "Lesotho"
  },
  {
    "value": "LR",
    "label": "Liberia"
  },
  {
    "value": "LY",
    "label": "Libya"
  },
  {
    "value": "LI",
    "label": "Liechtenstein"
  },
  {
    "value": "LT",
    "label": "Lithuania"
  },
  {
    "value": "LU",
    "label": "Luxembourg"
  },
  {
    "value": "MO",
    "label": "Macao"
  },
  {
    "value": "MG",
    "label": "Madagascar"
  },
  {
    "value": "MW",
    "label": "Malawi"
  },
  {
    "value": "MY",
    "label": "Malaysia"
  },
  {
    "value": "MV",
    "label": "Maldives"
  },
  {
    "value": "ML",
    "label": "Mali"
  },
  {
    "value": "MT",
    "label": "Malta"
  },
  {
    "value": "MH",
    "label": "Marshall Islands"
  },
  {
    "value": "MQ",
    "label": "Martinique"
  },
  {
    "value": "MR",
    "label": "Mauritania"
  },
  {
    "value": "MU",
    "label": "Mauritius"
  },
  {
    "value": "YT",
    "label": "Mayotte"
  },
  {
    "value": "MX",
    "label": "Mexico"
  },
  {
    "value": "FM",
    "label": "Micronesia, Federated States of"
  },
  {
    "value": "MD",
    "label": "Moldova, Republic of"
  },
  {
    "value": "MC",
    "label": "Monaco"
  },
  {
    "value": "MN",
    "label": "Mongolia"
  },
  {
    "value": "ME",
    "label": "Montenegro"
  },
  {
    "value": "MS",
    "label": "Montserrat"
  },
  {
    "value": "MA",
    "label": "Morocco"
  },
  {
    "value": "MZ",
    "label": "Mozambique"
  },
  {
    "value": "MM",
    "label": "Myanmar"
  },
  {
    "value": "NA",
    "label": "Namibia"
  },
  {
    "value": "NR",
    "label": "Nauru"
  },
  {
    "value": "NP",
    "label": "Nepal"
  },
  {
    "value": "NL",
    "label": "Netherlands"
  },
  {
    "value": "NC",
    "label": "New Caledonia"
  },
  {
    "value": "NZ",
    "label": "New Zealand"
  },
  {
    "value": "NI",
    "label": "Nicaragua"
  },
  {
    "value": "NE",
    "label": "Niger"
  },
  {
    "value": "NG",
    "label": "Nigeria"
  },
  {
    "value": "NU",
    "label": "Niue"
  },
  {
    "value": "NF",
    "label": "Norfolk Island"
  },
  {
    "value": "MK",
    "label": "North Macedonia"
  },
  {
    "value": "MP",
    "label": "Northern Mariana Islands"
  },
  {
    "value": "NO",
    "label": "Norway"
  },
  {
    "value": "OM",
    "label": "Oman"
  },
  {
    "value": "PK",
    "label": "Pakistan"
  },
  {
    "value": "PW",
    "label": "Palau"
  },
  {
    "value": "PS",
    "label": "Palestine, State of"
  },
  {
    "value": "PA",
    "label": "Panama"
  },
  {
    "value": "PG",
    "label": "Papua New Guinea"
  },
  {
    "value": "PY",
    "label": "Paraguay"
  },
  {
    "value": "PE",
    "label": "Peru"
  },
  {
    "value": "PH",
    "label": "Philippines"
  },
  {
    "value": "PN",
    "label": "Pitcairn"
  },
  {
    "value": "PL",
    "label": "Poland"
  },
  {
    "value": "PT",
    "label": "Portugal"
  },
  {
    "value": "PR",
    "label": "Puerto Rico"
  },
  {
    "value": "QA",
    "label": "Qatar"
  },
  {
    "value": "RO",
    "label": "Romania"
  },
  {
    "value": "RU",
    "label": "Russian Federation"
  },
  {
    "value": "RW",
    "label": "Rwanda"
  },
  {
    "value": "RE",
    "label": "Réunion"
  },
  {
    "value": "BL",
    "label": "Saint Barthélemy"
  },
  {
    "value": "SH",
    "label": "Saint Helena, Ascension and Tristan da Cunha"
  },
  {
    "value": "KN",
    "label": "Saint Kitts and Nevis"
  },
  {
    "value": "LC",
    "label": "Saint Lucia"
  },
  {
    "value": "MF",
    "label": "Saint Martin (French part)"
  },
  {
    "value": "PM",
    "label": "Saint Pierre and Miquelon"
  },
  {
    "value": "VC",
    "label": "Saint Vincent and the Grenadines"
  },
  {
    "value": "WS",
    "label": "Samoa"
  },
  {
    "value": "SM",
    "label": "San Marino"
  },
  {
    "value": "ST",
    "label": "Sao Tome and Principe"
  },
  {
    "value": "SA",
    "label": "Saudi Arabia"
  },
  {
    "value": "SN",
    "label": "Senegal"
  },
  {
    "value": "RS",
    "label": "Serbia"
  },
  {
    "value": "SC",
    "label": "Seychelles"
  },
  {
    "value": "SL",
    "label": "Sierra Leone"
  },
  {
    "value": "SG",
    "label": "Singapore"
  },
  {
    "value": "SX",
    "label": "Sint Maarten (Dutch part)"
  },
  {
    "value": "SK",
    "label": "Slovakia"
  },
  {
    "value": "SI",
    "label": "Slovenia"
  },
  {
    "value": "SB",
    "label": "Solomon Islands"
  },
  {
    "value": "SO",
    "label": "Somalia"
  },
  {
    "value": "ZA",
    "label": "South Africa"
  },
  {
    "value": "GS",
    "label": "South Georgia and the South Sandwich Islands"
  },
  {
    "value": "SS",
    "label": "South Sudan"
  },
  {
    "value": "ES",
    "label": "Spain"
  },
  {
    "value": "LK",
    "label": "Sri Lanka"
  },
  {
    "value": "SD",
    "label": "Sudan"
  },
  {
    "value": "SR",
    "label": "Suriname"
  },
  {
    "value": "SJ",
    "label": "Svalbard and Jan Mayen"
  },
  {
    "value": "SE",
    "label": "Sweden"
  },
  {
    "value": "CH",
    "label": "Switzerland"
  },
  {
    "value": "SY",
    "label": "Syrian Arab Republic"
  },
  {
    "value": "TW",
    "label": "Taiwan, Province of China"
  },
  {
    "value": "TJ",
    "label": "Tajikistan"
  },
  {
    "value": "TZ",
    "label": "Tanzania, United Republic of"
  },
  {
    "value": "TH",
    "label": "Thailand"
  },
  {
    "value": "TL",
    "label": "Timor-Leste"
  },
  {
    "value": "TG",
    "label": "Togo"
  },
  {
    "value": "TK",
    "label": "Tokelau"
  },
  {
    "value": "TO",
    "label": "Tonga"
  },
  {
    "value": "TT",
    "label": "Trinidad and Tobago"
  },
  {
    "value": "TN",
    "label": "Tunisia"
  },
  {
    "value": "TM",
    "label": "Turkmenistan"
  },
  {
    "value": "TC",
    "label": "Turks and Caicos Islands"
  },
  {
    "value": "TV",
    "label": "Tuvalu"
  },
  {
    "value": "TR",
    "label": "Türkiye"
  },
  {
    "value": "UG",
    "label": "Uganda"
  },
  {
    "value": "UA",
    "label": "Ukraine"
  },
  {
    "value": "AE",
    "label": "United Arab Emirates"
  },
  {
    "value": "GB",
    "label": "United Kingdom"
  },
  {
    "value": "US",
    "label": "United States"
  },
  {
    "value": "UM",
    "label": "United States Minor Outlying Islands"
  },
  {
    "value": "UY",
    "label": "Uruguay"
  },
  {
    "value": "UZ",
    "label": "Uzbekistan"
  },
  {
    "value": "VU",
    "label": "Vanuatu"
  },
  {
    "value": "VE",
    "label": "Venezuela, Bolivarian Republic of"
  },
  {
    "value": "VN",
    "label": "Viet Nam"
  },
  {
    "value": "VG",
    "label": "Virgin Islands, British"
  },
  {
    "value": "VI",
    "label": "Virgin Islands, U.S."
  },
  {
    "value": "WF",
    "label": "Wallis and Futuna"
  },
  {
    "value": "EH",
    "label": "Western Sahara"
  },
  {
    "value": "YE",
    "label": "Yemen"
  },
  {
    "value": "ZM",
    "label": "Zambia"
  },
  {
    "value": "ZW",
    "label": "Zimbabwe"
  },
  {
    "value": "AX",
    "label": "Åland Islands"
  }
] as const;

export const CURRENCY_OPTIONS = [
  {
    "value": "AED",
    "label": "AED — UAE Dirham",
    "minorUnits": 2
  },
  {
    "value": "AFN",
    "label": "AFN — Afghani",
    "minorUnits": 2
  },
  {
    "value": "ALL",
    "label": "ALL — Lek",
    "minorUnits": 2
  },
  {
    "value": "AMD",
    "label": "AMD — Armenian Dram",
    "minorUnits": 2
  },
  {
    "value": "AOA",
    "label": "AOA — Kwanza",
    "minorUnits": 2
  },
  {
    "value": "ARS",
    "label": "ARS — Argentine Peso",
    "minorUnits": 2
  },
  {
    "value": "AUD",
    "label": "AUD — Australian Dollar",
    "minorUnits": 2
  },
  {
    "value": "AWG",
    "label": "AWG — Aruban Florin",
    "minorUnits": 2
  },
  {
    "value": "AZN",
    "label": "AZN — Azerbaijan Manat",
    "minorUnits": 2
  },
  {
    "value": "BAM",
    "label": "BAM — Convertible Mark",
    "minorUnits": 2
  },
  {
    "value": "BBD",
    "label": "BBD — Barbados Dollar",
    "minorUnits": 2
  },
  {
    "value": "BDT",
    "label": "BDT — Taka",
    "minorUnits": 2
  },
  {
    "value": "BHD",
    "label": "BHD — Bahraini Dinar",
    "minorUnits": 3
  },
  {
    "value": "BIF",
    "label": "BIF — Burundi Franc",
    "minorUnits": 0
  },
  {
    "value": "BMD",
    "label": "BMD — Bermudian Dollar",
    "minorUnits": 2
  },
  {
    "value": "BND",
    "label": "BND — Brunei Dollar",
    "minorUnits": 2
  },
  {
    "value": "BOB",
    "label": "BOB — Boliviano",
    "minorUnits": 2
  },
  {
    "value": "BRL",
    "label": "BRL — Brazilian Real",
    "minorUnits": 2
  },
  {
    "value": "BSD",
    "label": "BSD — Bahamian Dollar",
    "minorUnits": 2
  },
  {
    "value": "BTN",
    "label": "BTN — Ngultrum",
    "minorUnits": 2
  },
  {
    "value": "BWP",
    "label": "BWP — Pula",
    "minorUnits": 2
  },
  {
    "value": "BYN",
    "label": "BYN — Belarusian Ruble",
    "minorUnits": 2
  },
  {
    "value": "BZD",
    "label": "BZD — Belize Dollar",
    "minorUnits": 2
  },
  {
    "value": "CAD",
    "label": "CAD — Canadian Dollar",
    "minorUnits": 2
  },
  {
    "value": "CDF",
    "label": "CDF — Congolese Franc",
    "minorUnits": 2
  },
  {
    "value": "CHF",
    "label": "CHF — Swiss Franc",
    "minorUnits": 2
  },
  {
    "value": "CLP",
    "label": "CLP — Chilean Peso",
    "minorUnits": 0
  },
  {
    "value": "CNY",
    "label": "CNY — Yuan Renminbi",
    "minorUnits": 2
  },
  {
    "value": "COP",
    "label": "COP — Colombian Peso",
    "minorUnits": 2
  },
  {
    "value": "CRC",
    "label": "CRC — Costa Rican Colon",
    "minorUnits": 2
  },
  {
    "value": "CUP",
    "label": "CUP — Cuban Peso",
    "minorUnits": 2
  },
  {
    "value": "CVE",
    "label": "CVE — Cabo Verde Escudo",
    "minorUnits": 2
  },
  {
    "value": "CZK",
    "label": "CZK — Czech Koruna",
    "minorUnits": 2
  },
  {
    "value": "DJF",
    "label": "DJF — Djibouti Franc",
    "minorUnits": 0
  },
  {
    "value": "DKK",
    "label": "DKK — Danish Krone",
    "minorUnits": 2
  },
  {
    "value": "DOP",
    "label": "DOP — Dominican Peso",
    "minorUnits": 2
  },
  {
    "value": "DZD",
    "label": "DZD — Algerian Dinar",
    "minorUnits": 2
  },
  {
    "value": "EGP",
    "label": "EGP — Egyptian Pound",
    "minorUnits": 2
  },
  {
    "value": "ERN",
    "label": "ERN — Nakfa",
    "minorUnits": 2
  },
  {
    "value": "ETB",
    "label": "ETB — Ethiopian Birr",
    "minorUnits": 2
  },
  {
    "value": "EUR",
    "label": "EUR — Euro",
    "minorUnits": 2
  },
  {
    "value": "FJD",
    "label": "FJD — Fiji Dollar",
    "minorUnits": 2
  },
  {
    "value": "FKP",
    "label": "FKP — Falkland Islands Pound",
    "minorUnits": 2
  },
  {
    "value": "GBP",
    "label": "GBP — Pound Sterling",
    "minorUnits": 2
  },
  {
    "value": "GEL",
    "label": "GEL — Lari",
    "minorUnits": 2
  },
  {
    "value": "GHS",
    "label": "GHS — Ghana Cedi",
    "minorUnits": 2
  },
  {
    "value": "GIP",
    "label": "GIP — Gibraltar Pound",
    "minorUnits": 2
  },
  {
    "value": "GMD",
    "label": "GMD — Dalasi",
    "minorUnits": 2
  },
  {
    "value": "GNF",
    "label": "GNF — Guinean Franc",
    "minorUnits": 0
  },
  {
    "value": "GTQ",
    "label": "GTQ — Quetzal",
    "minorUnits": 2
  },
  {
    "value": "GYD",
    "label": "GYD — Guyana Dollar",
    "minorUnits": 2
  },
  {
    "value": "HKD",
    "label": "HKD — Hong Kong Dollar",
    "minorUnits": 2
  },
  {
    "value": "HNL",
    "label": "HNL — Lempira",
    "minorUnits": 2
  },
  {
    "value": "HTG",
    "label": "HTG — Gourde",
    "minorUnits": 2
  },
  {
    "value": "HUF",
    "label": "HUF — Forint",
    "minorUnits": 2
  },
  {
    "value": "IDR",
    "label": "IDR — Rupiah",
    "minorUnits": 2
  },
  {
    "value": "ILS",
    "label": "ILS — New Israeli Sheqel",
    "minorUnits": 2
  },
  {
    "value": "INR",
    "label": "INR — Indian Rupee",
    "minorUnits": 2
  },
  {
    "value": "IQD",
    "label": "IQD — Iraqi Dinar",
    "minorUnits": 3
  },
  {
    "value": "IRR",
    "label": "IRR — Iranian Rial",
    "minorUnits": 2
  },
  {
    "value": "ISK",
    "label": "ISK — Iceland Krona",
    "minorUnits": 0
  },
  {
    "value": "JMD",
    "label": "JMD — Jamaican Dollar",
    "minorUnits": 2
  },
  {
    "value": "JOD",
    "label": "JOD — Jordanian Dinar",
    "minorUnits": 3
  },
  {
    "value": "JPY",
    "label": "JPY — Yen",
    "minorUnits": 0
  },
  {
    "value": "KES",
    "label": "KES — Kenyan Shilling",
    "minorUnits": 2
  },
  {
    "value": "KGS",
    "label": "KGS — Som",
    "minorUnits": 2
  },
  {
    "value": "KHR",
    "label": "KHR — Riel",
    "minorUnits": 2
  },
  {
    "value": "KMF",
    "label": "KMF — 'Comorian Franc '",
    "minorUnits": 0
  },
  {
    "value": "KPW",
    "label": "KPW — North Korean Won",
    "minorUnits": 2
  },
  {
    "value": "KRW",
    "label": "KRW — Won",
    "minorUnits": 0
  },
  {
    "value": "KWD",
    "label": "KWD — Kuwaiti Dinar",
    "minorUnits": 3
  },
  {
    "value": "KYD",
    "label": "KYD — Cayman Islands Dollar",
    "minorUnits": 2
  },
  {
    "value": "KZT",
    "label": "KZT — Tenge",
    "minorUnits": 2
  },
  {
    "value": "LAK",
    "label": "LAK — Lao Kip",
    "minorUnits": 2
  },
  {
    "value": "LBP",
    "label": "LBP — Lebanese Pound",
    "minorUnits": 2
  },
  {
    "value": "LKR",
    "label": "LKR — Sri Lanka Rupee",
    "minorUnits": 2
  },
  {
    "value": "LRD",
    "label": "LRD — Liberian Dollar",
    "minorUnits": 2
  },
  {
    "value": "LSL",
    "label": "LSL — Loti",
    "minorUnits": 2
  },
  {
    "value": "LYD",
    "label": "LYD — Libyan Dinar",
    "minorUnits": 3
  },
  {
    "value": "MAD",
    "label": "MAD — Moroccan Dirham",
    "minorUnits": 2
  },
  {
    "value": "MDL",
    "label": "MDL — Moldovan Leu",
    "minorUnits": 2
  },
  {
    "value": "MGA",
    "label": "MGA — Malagasy Ariary",
    "minorUnits": 2
  },
  {
    "value": "MKD",
    "label": "MKD — Denar",
    "minorUnits": 2
  },
  {
    "value": "MMK",
    "label": "MMK — Kyat",
    "minorUnits": 2
  },
  {
    "value": "MNT",
    "label": "MNT — Tugrik",
    "minorUnits": 2
  },
  {
    "value": "MOP",
    "label": "MOP — Pataca",
    "minorUnits": 2
  },
  {
    "value": "MRU",
    "label": "MRU — Ouguiya",
    "minorUnits": 2
  },
  {
    "value": "MUR",
    "label": "MUR — Mauritius Rupee",
    "minorUnits": 2
  },
  {
    "value": "MVR",
    "label": "MVR — Rufiyaa",
    "minorUnits": 2
  },
  {
    "value": "MWK",
    "label": "MWK — Malawi Kwacha",
    "minorUnits": 2
  },
  {
    "value": "MXN",
    "label": "MXN — Mexican Peso",
    "minorUnits": 2
  },
  {
    "value": "MYR",
    "label": "MYR — Malaysian Ringgit",
    "minorUnits": 2
  },
  {
    "value": "MZN",
    "label": "MZN — Mozambique Metical",
    "minorUnits": 2
  },
  {
    "value": "NAD",
    "label": "NAD — Namibia Dollar",
    "minorUnits": 2
  },
  {
    "value": "NGN",
    "label": "NGN — Naira",
    "minorUnits": 2
  },
  {
    "value": "NIO",
    "label": "NIO — Cordoba Oro",
    "minorUnits": 2
  },
  {
    "value": "NOK",
    "label": "NOK — Norwegian Krone",
    "minorUnits": 2
  },
  {
    "value": "NPR",
    "label": "NPR — Nepalese Rupee",
    "minorUnits": 2
  },
  {
    "value": "NZD",
    "label": "NZD — New Zealand Dollar",
    "minorUnits": 2
  },
  {
    "value": "OMR",
    "label": "OMR — Rial Omani",
    "minorUnits": 3
  },
  {
    "value": "PAB",
    "label": "PAB — Balboa",
    "minorUnits": 2
  },
  {
    "value": "PEN",
    "label": "PEN — Sol",
    "minorUnits": 2
  },
  {
    "value": "PGK",
    "label": "PGK — Kina",
    "minorUnits": 2
  },
  {
    "value": "PHP",
    "label": "PHP — Philippine Peso",
    "minorUnits": 2
  },
  {
    "value": "PKR",
    "label": "PKR — Pakistan Rupee",
    "minorUnits": 2
  },
  {
    "value": "PLN",
    "label": "PLN — Zloty",
    "minorUnits": 2
  },
  {
    "value": "PYG",
    "label": "PYG — Guarani",
    "minorUnits": 0
  },
  {
    "value": "QAR",
    "label": "QAR — Qatari Rial",
    "minorUnits": 2
  },
  {
    "value": "RON",
    "label": "RON — Romanian Leu",
    "minorUnits": 2
  },
  {
    "value": "RSD",
    "label": "RSD — Serbian Dinar",
    "minorUnits": 2
  },
  {
    "value": "RUB",
    "label": "RUB — Russian Ruble",
    "minorUnits": 2
  },
  {
    "value": "RWF",
    "label": "RWF — Rwanda Franc",
    "minorUnits": 0
  },
  {
    "value": "SAR",
    "label": "SAR — Saudi Riyal",
    "minorUnits": 2
  },
  {
    "value": "SBD",
    "label": "SBD — Solomon Islands Dollar",
    "minorUnits": 2
  },
  {
    "value": "SCR",
    "label": "SCR — Seychelles Rupee",
    "minorUnits": 2
  },
  {
    "value": "SDG",
    "label": "SDG — Sudanese Pound",
    "minorUnits": 2
  },
  {
    "value": "SEK",
    "label": "SEK — Swedish Krona",
    "minorUnits": 2
  },
  {
    "value": "SGD",
    "label": "SGD — Singapore Dollar",
    "minorUnits": 2
  },
  {
    "value": "SHP",
    "label": "SHP — Saint Helena Pound",
    "minorUnits": 2
  },
  {
    "value": "SLE",
    "label": "SLE — Leone",
    "minorUnits": 2
  },
  {
    "value": "SOS",
    "label": "SOS — Somali Shilling",
    "minorUnits": 2
  },
  {
    "value": "SRD",
    "label": "SRD — Surinam Dollar",
    "minorUnits": 2
  },
  {
    "value": "SSP",
    "label": "SSP — South Sudanese Pound",
    "minorUnits": 2
  },
  {
    "value": "STN",
    "label": "STN — Dobra",
    "minorUnits": 2
  },
  {
    "value": "SVC",
    "label": "SVC — El Salvador Colon",
    "minorUnits": 2
  },
  {
    "value": "SYP",
    "label": "SYP — Syrian Pound",
    "minorUnits": 2
  },
  {
    "value": "SZL",
    "label": "SZL — Lilangeni",
    "minorUnits": 2
  },
  {
    "value": "THB",
    "label": "THB — Baht",
    "minorUnits": 2
  },
  {
    "value": "TJS",
    "label": "TJS — Somoni",
    "minorUnits": 2
  },
  {
    "value": "TMT",
    "label": "TMT — Turkmenistan New Manat",
    "minorUnits": 2
  },
  {
    "value": "TND",
    "label": "TND — Tunisian Dinar",
    "minorUnits": 3
  },
  {
    "value": "TOP",
    "label": "TOP — Pa’anga",
    "minorUnits": 2
  },
  {
    "value": "TRY",
    "label": "TRY — Turkish Lira",
    "minorUnits": 2
  },
  {
    "value": "TTD",
    "label": "TTD — Trinidad and Tobago Dollar",
    "minorUnits": 2
  },
  {
    "value": "TWD",
    "label": "TWD — New Taiwan Dollar",
    "minorUnits": 2
  },
  {
    "value": "TZS",
    "label": "TZS — Tanzanian Shilling",
    "minorUnits": 2
  },
  {
    "value": "UAH",
    "label": "UAH — Hryvnia",
    "minorUnits": 2
  },
  {
    "value": "UGX",
    "label": "UGX — Uganda Shilling",
    "minorUnits": 0
  },
  {
    "value": "USD",
    "label": "USD — US Dollar",
    "minorUnits": 2
  },
  {
    "value": "UYU",
    "label": "UYU — Peso Uruguayo",
    "minorUnits": 2
  },
  {
    "value": "UZS",
    "label": "UZS — Uzbekistan Sum",
    "minorUnits": 2
  },
  {
    "value": "VED",
    "label": "VED — Bolívar Soberano",
    "minorUnits": 2
  },
  {
    "value": "VES",
    "label": "VES — Bolívar Soberano",
    "minorUnits": 2
  },
  {
    "value": "VND",
    "label": "VND — Dong",
    "minorUnits": 0
  },
  {
    "value": "VUV",
    "label": "VUV — Vatu",
    "minorUnits": 0
  },
  {
    "value": "WST",
    "label": "WST — Tala",
    "minorUnits": 2
  },
  {
    "value": "XAF",
    "label": "XAF — CFA Franc BEAC",
    "minorUnits": 0
  },
  {
    "value": "XCD",
    "label": "XCD — East Caribbean Dollar",
    "minorUnits": 2
  },
  {
    "value": "XCG",
    "label": "XCG — Caribbean Guilder",
    "minorUnits": 2
  },
  {
    "value": "XOF",
    "label": "XOF — CFA Franc BCEAO",
    "minorUnits": 0
  },
  {
    "value": "XPF",
    "label": "XPF — CFP Franc",
    "minorUnits": 0
  },
  {
    "value": "YER",
    "label": "YER — Yemeni Rial",
    "minorUnits": 2
  },
  {
    "value": "ZAR",
    "label": "ZAR — Rand",
    "minorUnits": 2
  },
  {
    "value": "ZMW",
    "label": "ZMW — Zambian Kwacha",
    "minorUnits": 2
  },
  {
    "value": "ZWG",
    "label": "ZWG — Zimbabwe Gold",
    "minorUnits": 2
  }
] as const;

export function currencyMinorUnits(currency: string): number {
  return CURRENCY_OPTIONS.find((item) => item.value === currency)?.minorUnits ?? 2;
}
