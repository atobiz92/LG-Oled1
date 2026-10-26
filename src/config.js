// Zentrale Spieldaten: Gelände, Waren, Gebäude, Völker.
// Alles hier ist bewusst als reine Daten gehalten, damit Balancing ohne Code-Änderung geht.

export const TILE = 32;
export const MAP_W = 80;
export const MAP_H = 80;

export const TERRAIN = { WASSER: 0, SAND: 1, GRAS: 2, BERG: 3 };
export const OBJ = { NONE: 0, BAUM: 1, SETZLING: 2, FELS: 3, FELD: 4 };

export const BAUM_WACHSTUM = 50; // Sekunden vom Setzling zum Baum
export const FELD_WACHSTUM = 40; // Sekunden bis zur Ernte
export const MAX_AUSGANG = 6; // Waren, die ein Betrieb maximal vor der Tür stapelt
export const EINGANG_ZIEL = 3; // Waren, die ein Betrieb pro Rohstoff vorrätig haben will

export const GOODS = {
  holz: { name: 'Baumstamm', icon: '🪵', color: '#8b5a2b' },
  bretter: { name: 'Bretter', icon: '🪚', color: '#d9a866' },
  stein: { name: 'Stein', icon: '🪨', color: '#9a9a9a' },
  getreide: { name: 'Getreide', icon: '🌾', color: '#e8c95a' },
  mehl: { name: 'Mehl', icon: '🥣', color: '#f4f0e6' },
  brot: { name: 'Brot', icon: '🍞', color: '#c98a3c' },
  fisch: { name: 'Fisch', icon: '🐟', color: '#6fa8dc' },
  kohle: { name: 'Kohle', icon: '⚫', color: '#2b2b2b' },
  erz: { name: 'Eisenerz', icon: '🟤', color: '#8d4b3a' },
  eisen: { name: 'Eisen', icon: '🔩', color: '#5d6d7e' },
  schwert: { name: 'Waffe', icon: '🗡️', color: '#c0c6cc' },
  bier: { name: 'Bier', icon: '🍺', color: '#d9a521' },
};

export const START_LAGER = {
  holz: 6, bretter: 26, stein: 20, getreide: 0, mehl: 0, brot: 6,
  fisch: 6, kohle: 4, erz: 0, eisen: 0, schwert: 3, bier: 0,
};
export const MANA_MAX = 60;
export const START_TRAEGER = 14;
export const START_SOLDATEN = 3;

// kind:
//   lager       – Hauptquartier, speichert alle Waren
//   wohnen      – erzeugt neue Träger
//   sammeln     – Arbeiter holt ein Objekt (Baum/Fels) aus der Umgebung
//   pflanzen    – Förster setzt Bäume
//   fischen     – Fischer angelt an der Küste
//   farm        – Bauer sät und erntet Felder
//   verarbeiten – wandelt Eingangswaren in eine Ausgangsware (auch Minen)
//   kaserne     – macht aus Träger + Waffe einen Soldaten
//   militaer    – Turm/Burg, bringt Land sobald besetzt
// in: Liste von Eingangs-Slots; jeder Slot ist eine Liste austauschbarer Waren.
export const BUILDINGS = {
  hq: {
    name: 'Hauptquartier', icon: '🏰', kind: 'lager', cost: {}, time: 0,
    territory: 9, capacity: 99, hidden: true,
    desc: 'Herz deines Reiches. Fällt es, ist das Spiel vorbei.',
  },
  wohnhaus: {
    name: 'Wohnhaus', icon: '🏠', kind: 'wohnen', group: 'Grundlagen',
    cost: { bretter: 2, stein: 1 }, time: 10, spawnEvery: 14, capacity: 8,
    desc: 'Hier ziehen neue Träger ein (bis zu 8).',
  },
  holzfaeller: {
    name: 'Holzfäller', icon: '🪓', kind: 'sammeln', group: 'Grundlagen',
    cost: { bretter: 2 }, time: 7, worker: 'Holzfäller',
    target: OBJ.BAUM, radius: 7, out: 'holz', workTime: 3.5, rest: 2, sfx: 'hacken',
    desc: 'Fällt Bäume in der Umgebung.',
  },
  foerster: {
    name: 'Förster', icon: '🌲', kind: 'pflanzen', group: 'Grundlagen',
    cost: { bretter: 2 }, time: 7, worker: 'Förster',
    radius: 6, workTime: 2.5, rest: 3, sfx: 'graben',
    desc: 'Pflanzt neue Bäume. Nachhaltigkeit, bevor es cool war.',
  },
  saegewerk: {
    name: 'Sägewerk', icon: '🪚', kind: 'verarbeiten', group: 'Grundlagen',
    cost: { bretter: 2, stein: 2 }, time: 10, worker: 'Säger',
    in: [['holz']], out: 'bretter', workTime: 4, sfx: 'saegen',
    desc: 'Macht aus Baumstämmen Bretter.',
  },
  steinmetz: {
    name: 'Steinmetz', icon: '⛏️', kind: 'sammeln', group: 'Grundlagen',
    cost: { bretter: 2 }, time: 7, worker: 'Steinmetz',
    target: OBJ.FELS, radius: 7, out: 'stein', workTime: 4, rest: 2, sfx: 'klopfen',
    desc: 'Haut Steine aus Felsen.',
  },
  fischer: {
    name: 'Fischer', icon: '🎣', kind: 'fischen', group: 'Nahrung',
    cost: { bretter: 2 }, time: 7, worker: 'Fischer',
    radius: 7, out: 'fisch', workTime: 5, rest: 2, sfx: 'platsch',
    desc: 'Angelt an der Küste. Braucht Wasser in der Nähe.',
  },
  bauernhof: {
    name: 'Bauernhof', icon: '🌾', kind: 'farm', group: 'Nahrung',
    cost: { bretter: 3, stein: 1 }, time: 10, worker: 'Bauer',
    radius: 4, out: 'getreide', workTime: 2.5, rest: 1.5, maxFields: 8, sfx: 'graben',
    desc: 'Sät und erntet Getreide auf freien Wiesen.',
  },
  muehle: {
    name: 'Mühle', icon: '🌀', kind: 'verarbeiten', group: 'Nahrung',
    cost: { bretter: 2, stein: 2 }, time: 10, worker: 'Müller',
    in: [['getreide']], out: 'mehl', workTime: 4, sfx: 'muehle',
    desc: 'Mahlt Getreide zu Mehl.',
  },
  baeckerei: {
    name: 'Bäckerei', icon: '🍞', kind: 'verarbeiten', group: 'Nahrung',
    cost: { bretter: 2, stein: 2 }, time: 10, worker: 'Bäcker',
    in: [['mehl']], out: 'brot', workTime: 4, sfx: 'ofen',
    desc: 'Backt Brot für die Minen.',
  },
  kohlemine: {
    name: 'Kohlemine', icon: '⚫', kind: 'verarbeiten', group: 'Industrie', terrain: TERRAIN.BERG,
    cost: { bretter: 3 }, time: 10, worker: 'Bergmann',
    in: [['brot', 'fisch']], out: 'kohle', workTime: 5, sfx: 'klopfen',
    desc: 'Nur im Gebirge. Braucht Brot oder Fisch.',
  },
  erzmine: {
    name: 'Erzmine', icon: '🟤', kind: 'verarbeiten', group: 'Industrie', terrain: TERRAIN.BERG,
    cost: { bretter: 3 }, time: 10, worker: 'Bergmann',
    in: [['brot', 'fisch']], out: 'erz', workTime: 5, sfx: 'klopfen',
    desc: 'Nur im Gebirge. Braucht Brot oder Fisch.',
  },
  schmelze: {
    name: 'Eisenschmelze', icon: '🔥', kind: 'verarbeiten', group: 'Industrie',
    cost: { bretter: 2, stein: 3 }, time: 12, worker: 'Schmelzer',
    in: [['erz'], ['kohle']], out: 'eisen', workTime: 5, sfx: 'zischen',
    desc: 'Schmilzt Erz mit Kohle zu Eisen.',
  },
  waffenschmied: {
    name: 'Waffenschmied', icon: '⚔️', kind: 'verarbeiten', group: 'Militär',
    cost: { bretter: 2, stein: 3 }, time: 12, worker: 'Schmied',
    in: [['eisen'], ['kohle']], out: 'schwert', workTime: 5, sfx: 'amboss',
    desc: 'Schmiedet Waffen aus Eisen und Kohle.',
  },
  kaserne: {
    name: 'Kaserne', icon: '🛡️', kind: 'kaserne', group: 'Militär',
    cost: { bretter: 4, stein: 4 }, time: 14, worker: 'Ausbilder',
    in: [['schwert']], workTime: 4, sfx: 'amboss',
    desc: 'Macht aus einem Träger und einer Waffe einen Soldaten.',
  },
  brauerei: {
    name: 'Brauerei', icon: '🍺', kind: 'verarbeiten', group: 'Magie',
    cost: { bretter: 2, stein: 2 }, time: 10, worker: 'Brauer',
    in: [['getreide']], out: 'bier', workTime: 5, sfx: 'blubbern',
    desc: 'Braut Bier aus Getreide. Die Götter trinken gern einen mit.',
  },
  tempel: {
    name: 'Tempel', icon: '⛩️', kind: 'verarbeiten', group: 'Magie',
    cost: { bretter: 3, stein: 5 }, time: 16, worker: 'Priester',
    in: [['bier']], out: null, mana: 2, workTime: 6, sfx: 'glocke',
    desc: 'Bieropfer bringen Mana. Mit Mana wirkst du Zauber.',
  },
  wachturm: {
    name: 'Wachturm', icon: '🗼', kind: 'militaer', group: 'Militär',
    cost: { bretter: 2, stein: 3 }, time: 10, territory: 6, capacity: 3,
    desc: 'Vergrößert dein Land, sobald ein Soldat einzieht.',
  },
  burg: {
    name: 'Burg', icon: '🏯', kind: 'militaer', group: 'Militär',
    cost: { bretter: 5, stein: 7 }, time: 22, territory: 9, capacity: 7,
    desc: 'Großes Land, viel Platz für Soldaten.',
  },
};

export const PLAYER_COLORS = ['#1e88e5', '#e53935', '#43a047', '#fdd835'];

// Völker. Name, Optik, Stimme, Musik und kleine Boni.
// Wer den Namen der Amazonen ändern will: einfach hier anpassen.
export const FACTIONS = {
  roemer: {
    name: 'Römer', motto: 'Ordnung, Straßen und viel zu viele Formulare.',
    roof: '#b33939', wall: '#efe2c4', style: 'giebel', women: false,
    soldier: 'Legionär', scale: 'dur', drum: 0.5,
    bekehrung: { name: 'Bestechung', desc: 'Wein und Gold: bis zu 2 feindliche Soldaten wechseln die Seite.' },
    voice: { pitch: 0.9, rate: 1.0 },
    bonus: { speed: 1.0, attack: 1.0, defense: 1.15, work: 1.0 },
    bonusText: 'Verteidigung +15 %',
  },
  wikinger: {
    name: 'Wikinger', motto: 'Laut, bärtig und überraschend gute Zimmerleute.',
    roof: '#5b3a1e', wall: '#a77b4f', style: 'steil', women: false,
    soldier: 'Berserker', scale: 'dorisch', drum: 1.0,
    bekehrung: { name: 'Met-Rausch', desc: 'Freibier! Bis zu 2 feindliche Soldaten laufen besoffen zu dir über.' },
    voice: { pitch: 0.6, rate: 0.95 },
    bonus: { speed: 1.0, attack: 1.15, defense: 1.0, work: 1.0 },
    bonusText: 'Angriff +15 %',
  },
  aegypter: {
    name: 'Ägypter', motto: 'Wer Pyramiden baut, baut auch Sägewerke.',
    roof: '#d4a62a', wall: '#f3e2a9', style: 'flach', women: false,
    soldier: 'Speerträger', scale: 'phrygisch', drum: 0.7,
    bekehrung: { name: 'Fluch des Pharao', desc: 'Bis zu 2 feindliche Soldaten dienen ab sofort dem Pharao.' },
    voice: { pitch: 1.0, rate: 1.05 },
    bonus: { speed: 1.0, attack: 1.0, defense: 1.0, work: 1.15 },
    bonusText: 'Produktion +15 %',
  },
  amazonen: {
    name: 'Amazonen', motto: 'Die Donnerschwestern. Sie lesen die Bauanleitung UND gewinnen.',
    roof: '#7b4bc4', wall: '#e9d7f5', style: 'kuppel', women: true,
    soldier: 'Kampfamazone', scale: 'mixolydisch', drum: 0.8,
    bekehrung: { name: 'Betörung', desc: 'Ein Augenaufschlag, und bis zu 2 feindliche Soldaten laufen verliebt zu dir über.' },
    voice: { pitch: 1.35, rate: 1.08 },
    bonus: { speed: 1.12, attack: 1.07, defense: 1.0, work: 1.0 },
    bonusText: 'Laufen +12 %, Angriff +7 %',
  },
};

// Zauber des Tempels. Kosten in Mana, Radius in Feldern um den Zielpunkt.
export const SPELLS = {
  wald: { name: 'Steine zu Bäumen', icon: '🌳', cost: 5, radius: 3, desc: 'Verwandelt Felsen in ausgewachsene Bäume.' },
  stein: { name: 'Bäume zu Steinen', icon: '🪨', cost: 5, radius: 3, desc: 'Verwandelt Bäume in Felsen.' },
  fisch: { name: 'Fischwunder', icon: '🐟', cost: 3, radius: 5, desc: 'Füllt das Wasser mit Fischen.' },
  ernte: { name: 'Erntesegen', icon: '🌾', cost: 4, radius: 4, desc: 'Alle Felder im Umkreis sind sofort reif.' },
  bekehrung: { name: 'Bekehrung', icon: '💘', cost: 12, radius: 4, desc: 'Bis zu 2 feindliche Soldaten wechseln die Seite.' },
};
