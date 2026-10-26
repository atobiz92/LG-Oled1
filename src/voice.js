// Lustige deutsche Sprachausgabe. Nutzt die Sprachsynthese des Browsers (de-DE).
// Die Texte sind gleichzeitig das Sprecherskript für eine spätere Studio-Vertonung
// (siehe tools/sprecherskript.mjs).

// LINES[ereignis][volk | 'alle'] = [...Sprüche]
export const LINES = {
  start: {
    alle: [
      'Na dann, frisch ans Werk! Die Bäume fällen sich nicht von allein.',
      'Neues Land, neues Glück. Und hoffentlich neue Bretter.',
    ],
    roemer: [
      'Ave! Das Imperium beginnt hier. Mit einem Hauptquartier und vierzehn verwirrten Trägern.',
      'Rom wurde nicht an einem Tag erbaut. Aber wir haben ja auch keinen Termin.',
    ],
    wikinger: [
      'Hört her! Wir bauen! Und wenn wir fertig sind, feiern wir. Und dann bauen wir wieder.',
      'Das Langschiff ist kaputt, also bleiben wir eben hier. Schöne Gegend eigentlich.',
    ],
    aegypter: [
      'Der Pharao wünscht ein Reich. Sofort. Gestern wäre ihm noch lieber gewesen.',
      'Sand haben wir genug. Jetzt fehlt nur noch alles andere.',
    ],
    amazonen: [
      'Schwestern! Wir bauen hier ein Reich. Und diesmal liest jemand die Bauanleitung.',
      'Die Donnerschwestern sind gelandet. Die Nachbarn dürfen schon mal nervös werden.',
    ],
  },
  bau_platziert: {
    alle: [
      'Hier? Na gut, du bist der Chef.',
      'Baustelle eröffnet. Kaffee steht bereit.',
      'Ich hol schon mal die Bretter. Also, jemand holt die Bretter.',
      'Gute Lage. Seeblick wäre schöner gewesen, aber gut.',
    ],
    roemer: ['Formular siebzehn B ist ausgefüllt. Wir dürfen bauen!'],
    wikinger: ['Bauen! Hämmern! Laut sein! Mein Lieblingsteil.'],
    aegypter: ['Wird gemacht. Soll es dreieckig werden? Nein? Schade.'],
    amazonen: [
      'Ausgezeichnete Wahl. Ich hätte es genauso gemacht. Nur schneller.',
      'Wird erledigt. Ohne Diskussion, ohne Pause, ohne Kerl, der danebensteht und Tipps gibt.',
    ],
  },
  bau_fertig: {
    alle: [
      'Fertig! Und nur zwei Bretter übrig. Die nehm ich mit nach Hause.',
      'Das Gebäude steht. Bitte nicht dagegenlehnen.',
      'Fertig. Pünktlich. Fast.',
    ],
    roemer: ['Opus perfectum! Das heißt: Feierabend!'],
    wikinger: ['Steht! Und es hält sogar. Meistens.'],
    aegypter: ['Fertig. Es hält mindestens viertausend Jahre. Garantie.'],
    amazonen: [
      'Fertig. Und keiner hat sich dabei den Daumen gehauen. Das ist bei uns Standard.',
      'Steht wie eine Eins. Die Männer da drüben brauchen dafür doppelt so lange.',
    ],
  },
  arbeiter_da: {
    alle: [
      'Bin da! Wo ist der Pausenraum?',
      'Neuer Arbeitsplatz, neues Glück.',
      'Ich fang dann mal an. Gleich. Nach dem Frühstück.',
    ],
    amazonen: ['Bin da. Ab jetzt läuft der Laden.'],
  },
  mangel_baeume: {
    alle: [
      'Keine Bäume mehr in Reichweite. Soll ich etwa Gras fällen?',
      'Der Wald ist alle. Ein Förster wäre jetzt nett.',
    ],
    wikinger: ['Kein Holz mehr! Wie sollen wir da Langschiffe bauen? Oder Bänke?'],
    amazonen: ['Keine Bäume mehr. Wer hat da nicht vorausgeplant? Ach ja. Niemand von uns.'],
  },
  mangel_felsen: {
    alle: ['Hier gibt es keine Steine mehr. Nur noch Kiesel. Und die sind beleidigend klein.'],
    aegypter: ['Keine Steine mehr! Wie soll man so eine Pyramide... ach, wir bauen ja gar keine.'],
  },
  mangel_fische: {
    alle: ['Die Fische haben gekündigt. Wir brauchen ein anderes Ufer.'],
  },
  lager_leer: {
    alle: [
      'Wir haben keine Bretter mehr! Ich wiederhole: KEINE. BRETTER.',
      'Das Lager ist leer. Und zwar so richtig leer. Mit Echo.',
    ],
    amazonen: ['Keine Bretter mehr. Wir brauchen ein Sägewerk. Und zwar gestern.'],
  },
  einzug: {
    alle: [
      'Hallo! Ich bin neu hier. Wo kann ich was tragen?',
      'Neuer Träger meldet sich. Rücken ist frisch geölt.',
    ],
    amazonen: ['Neue Schwester eingetroffen. Tragen? Kann ich. Kämpfen? Kann ich besser.'],
  },
  soldat_neu: {
    roemer: ['Legionär meldet sich zum Dienst. Wo ist die Kantine?', 'Neuer Legionär! Helm sitzt, Sandalen drücken.'],
    wikinger: ['Berserker bereit! Wen soll ich anbrüllen?', 'Ich bin bereit! Ich habe meinen Bart extra gekämmt.'],
    aegypter: ['Speerträger zur Stelle. Die Pyramide kann warten.', 'Bereit zum Kampf. Sonnencreme ist aufgetragen.'],
    amazonen: [
      'Kampfamazone einsatzbereit. Die Kerle da drüben können schon mal ihre Mama anrufen.',
      'Neue Kriegerin! Bogen gespannt, Zopf geflochten, Laune hervorragend.',
      'Ich bin bereit. Sag mir einfach, wen ich höflich, aber bestimmt besiegen soll.',
    ],
  },
  angriff: {
    alle: ['Attacke! Also, ihr zuerst.', 'Vorwärts! Und keiner bleibt stehen, um Blumen zu pflücken!'],
    roemer: ['Für Rom! Und für die Rente!', 'Testudo! Ach nein, das üben wir noch.'],
    wikinger: ['Waaaaah! Das war der ganze Plan. Waaaaah!', 'Zum Angriff! Wer zuletzt ankommt, spült ab!'],
    aegypter: ['Im Namen des Pharaos! Er schaut übrigens zu. Also gebt euch Mühe.'],
    amazonen: [
      'Schwestern, vorwärts! Und niemand bleibt stehen, um nach dem Weg zu fragen. Das machen nur die Kerle nicht.',
      'Angriff! Wir sind schnell, wir sind viele, und wir haben uns vorher gedehnt.',
    ],
  },
  wir_werden_angegriffen: {
    alle: ['Alarm! Die Nachbarn kommen zu Besuch. Und sie haben keinen Kuchen dabei.', 'Feind in Sicht! Alle Mann auf die Türme!'],
    amazonen: ['Sie greifen uns an? Wie süß. Schwestern, auf die Türme!'],
  },
  erobert: {
    alle: ['Turm erobert! Die Möbel bleiben, die Vormieter nicht.', 'Gehört jetzt uns. Wer zuerst kommt, mahlt zuerst.'],
    amazonen: ['Turm erobert. Wir dekorieren gleich um. Lila steht dem Turm viel besser.'],
  },
  verloren: {
    alle: ['Wir haben einen Turm verloren. Das war doch nur geliehen, oder?', 'Turm verloren! Na toll. Da hing meine Wäsche.'],
    amazonen: ['Einen Turm verloren. Das gibt eine ernste Nachbesprechung.'],
  },
  brand: {
    alle: ['Es brennt! Wer hat da wieder mit Fackeln gespielt?', 'Unser Gebäude brennt ab! Hat jemand den Herd angelassen?'],
  },
  sieg: {
    alle: ['Sieg! Freibier für alle! Außer für die Verlierer.', 'Gewonnen! Das gibt einen Eintrag ins Geschichtsbuch.'],
    amazonen: ['Sieg! War ja klar. Und jetzt: Wellness-Tag für alle Schwestern!'],
  },
  niederlage: {
    alle: ['Verloren. Aber wir hatten eine schöne Zeit, oder?', 'Niederlage. Ich hab ja gleich gesagt, wir hätten Fischer werden sollen.'],
    amazonen: ['Verloren?! Das muss ein Rechenfehler sein. Wir fordern eine Revanche.'],
  },
  klick_traeger: {
    alle: [
      'Ja? Ich trag gerade was. Also gleich. Theoretisch.',
      'Wenn ich noch ein Brett tragen muss, werde ich Philosoph.',
      'Tragen, tragen, tragen. Mein Rücken hat eine eigene Gewerkschaft gegründet.',
      'Ich bin Träger. Mein Traum? Ein Bollerwagen.',
    ],
    amazonen: [
      'Ich trage zwei Bretter auf einmal. Die Kerle schaffen nur eins. Und jammern dabei.',
      'Ja, Chefin? Oder Chef? Egal, ich trage einfach weiter.',
    ],
  },
  klick_arbeiter: {
    alle: [
      'Ich arbeite hier. Gefühlt seit dreihundert Jahren.',
      'Bitte nicht stören, ich bin im Flow.',
      'Ich hab schon mal überlegt zu kündigen. Aber wohin denn?',
    ],
    amazonen: ['Ich mache hier die Arbeit von drei Männern. Und habe trotzdem gute Laune.'],
  },
  klick_soldat: {
    alle: ['Melde gehorsamst: Alles ruhig. Zu ruhig.', 'Ich stehe hier Wache. Seit Stunden. Ein Eichhörnchen hat mich ausgelacht.'],
    roemer: ['Legionär Quintus. Ich hab Hunger und mein Helm ist zu klein.'],
    wikinger: ['Wann kämpfen wir endlich? Mir ist langweilig! LANGWEILIG!'],
    aegypter: ['Ich bewache diesen Turm. Und den Sand drumherum. Sehr viel Sand.'],
    amazonen: [
      'Bereit. Immer bereit. Ich hab sogar im Schlaf den Bogen in der Hand.',
      'Wenn die Kerle da drüben angreifen, verteile ich Lektionen. Kostenlos.',
    ],
  },
  gegner_spott: {
    alle: ['Da drüben bauen die schon ihr drittes Sägewerk. Angeber.'],
    amazonen: ['Die Amazonen sind schneller als ihr! Und schöner! Und pünktlicher!'],
    wikinger: ['Eure Türme sind klein! Unsere Bärte sind größer als eure Türme!'],
    roemer: ['Wir haben Aquädukte! Was habt ihr? Eben.'],
    aegypter: ['Unsere Katzen sind besser organisiert als euer ganzes Reich.'],
  },
};

const GERMAN_FEMALE = /(anna|petra|katja|marlene|vicki|helena|hedda|female|frau|woman|google deutsch)/i;
const GERMAN_MALE = /(hans|stefan|markus|conrad|yannick|male|mann|killian)/i;

export class Voice {
  constructor() {
    this.enabled = true;
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.voices = [];
    this.last = {};
    this.lastAny = 0;
    this.recent = [];
    this.onSubtitle = null;
    if (this.synth) {
      const load = () => (this.voices = this.synth.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith('de')));
      load();
      this.synth.addEventListener?.('voiceschanged', load);
    }
  }

  pick(event, faction) {
    const set = LINES[event];
    if (!set) return null;
    const pool = [...(set[faction] || []), ...(set.alle || [])];
    if (!pool.length) return null;
    const fresh = pool.filter((l) => !this.recent.includes(l));
    const line = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length || pool.length))];
    this.recent.push(line);
    if (this.recent.length > 12) this.recent.shift();
    return line;
  }

  chooseVoice(women) {
    if (!this.voices.length) return null;
    const re = women ? GERMAN_FEMALE : GERMAN_MALE;
    return this.voices.find((v) => re.test(v.name)) || this.voices[0];
  }

  // Spricht einen Spruch. cooldown = Mindestabstand für dieses Ereignis in Sekunden.
  say(event, faction, { cooldown = 8, priority = false, x, y } = {}) {
    const now = performance.now() / 1000;
    if (!priority && (now - (this.last[event] || -999) < cooldown || now - this.lastAny < 3)) return null;
    const text = this.pick(event, faction.key);
    if (!text) return null;
    this.last[event] = now;
    this.lastAny = now;
    this.onSubtitle?.(text, faction, x, y);
    this.speak(text, faction, priority);
    return text;
  }

  speak(text, faction, priority) {
    if (!this.enabled || !this.synth) return;
    if (priority) this.synth.cancel();
    else if (this.synth.speaking || this.synth.pending) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    const v = this.chooseVoice(faction.women);
    if (v) u.voice = v;
    u.pitch = faction.voice.pitch;
    u.rate = faction.voice.rate;
    u.volume = 0.9;
    this.synth.speak(u);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on && this.synth) this.synth.cancel();
  }
}
