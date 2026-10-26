# Sprecherskript „Die Siedelei“

> Automatisch erzeugt aus `src/voice.js` mit `node tools/sprecherskript.mjs`. Nicht von Hand bearbeiten,
> sondern die Sprüche in `src/voice.js` ändern und das Skript neu laufen lassen.

Im Spiel werden die Sätze über die Sprachausgabe des Browsers gesprochen. Für eine echte Vertonung
nimmt man jede Zeile als eigene Datei auf. Der Dateiname steht in der Spalte **Datei**.

## Regieanweisungen

| Volk | Stimme | Tonfall |
|---|---|---|
| Römer | männlich, mittlere Lage | bürokratisch-stolz, leicht genervt |
| Wikinger | männlich, tief und laut | polternd, begeistert, etwas zu laut |
| Ägypter | männlich, klar | trocken, sarkastisch, majestätisch übertrieben |
| Amazonen | weiblich, kraftvoll | selbstbewusst, schlagfertig, frech gegenüber den Männervölkern |

Aufnahmeformat: 44,1 kHz, 16 Bit, mono, OGG oder WAV. Zwischen 0,3 s Stille vorne und hinten.

## Spielbeginn (`start`)

| Datei | Sprecher | Text |
|---|---|---|
| `alle_start_01.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Na dann, frisch ans Werk! Die Bäume fällen sich nicht von allein. |
| `alle_start_02.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Neues Land, neues Glück. Und hoffentlich neue Bretter. |
| `roemer_start_01.ogg` | Römer – männlich | Ave! Das Imperium beginnt hier. Mit einem Hauptquartier und vierzehn verwirrten Trägern. |
| `roemer_start_02.ogg` | Römer – männlich | Rom wurde nicht an einem Tag erbaut. Aber wir haben ja auch keinen Termin. |
| `wikinger_start_01.ogg` | Wikinger – männlich | Hört her! Wir bauen! Und wenn wir fertig sind, feiern wir. Und dann bauen wir wieder. |
| `wikinger_start_02.ogg` | Wikinger – männlich | Das Langschiff ist kaputt, also bleiben wir eben hier. Schöne Gegend eigentlich. |
| `aegypter_start_01.ogg` | Ägypter – männlich | Der Pharao wünscht ein Reich. Sofort. Gestern wäre ihm noch lieber gewesen. |
| `aegypter_start_02.ogg` | Ägypter – männlich | Sand haben wir genug. Jetzt fehlt nur noch alles andere. |
| `amazonen_start_01.ogg` | Amazonen – weiblich | Schwestern! Wir bauen hier ein Reich. Und diesmal liest jemand die Bauanleitung. |
| `amazonen_start_02.ogg` | Amazonen – weiblich | Die Donnerschwestern sind gelandet. Die Nachbarn dürfen schon mal nervös werden. |

## Spieler setzt eine Baustelle (`bau_platziert`)

| Datei | Sprecher | Text |
|---|---|---|
| `alle_bau_platziert_01.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Hier? Na gut, du bist der Chef. |
| `alle_bau_platziert_02.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Baustelle eröffnet. Kaffee steht bereit. |
| `alle_bau_platziert_03.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Ich hol schon mal die Bretter. Also, jemand holt die Bretter. |
| `alle_bau_platziert_04.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Gute Lage. Seeblick wäre schöner gewesen, aber gut. |
| `roemer_bau_platziert_01.ogg` | Römer – männlich | Formular siebzehn B ist ausgefüllt. Wir dürfen bauen! |
| `wikinger_bau_platziert_01.ogg` | Wikinger – männlich | Bauen! Hämmern! Laut sein! Mein Lieblingsteil. |
| `aegypter_bau_platziert_01.ogg` | Ägypter – männlich | Wird gemacht. Soll es dreieckig werden? Nein? Schade. |
| `amazonen_bau_platziert_01.ogg` | Amazonen – weiblich | Ausgezeichnete Wahl. Ich hätte es genauso gemacht. Nur schneller. |
| `amazonen_bau_platziert_02.ogg` | Amazonen – weiblich | Wird erledigt. Ohne Diskussion, ohne Pause, ohne Kerl, der danebensteht und Tipps gibt. |

## Gebäude fertiggestellt (`bau_fertig`)

| Datei | Sprecher | Text |
|---|---|---|
| `alle_bau_fertig_01.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Fertig! Und nur zwei Bretter übrig. Die nehm ich mit nach Hause. |
| `alle_bau_fertig_02.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Das Gebäude steht. Bitte nicht dagegenlehnen. |
| `alle_bau_fertig_03.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Fertig. Pünktlich. Fast. |
| `roemer_bau_fertig_01.ogg` | Römer – männlich | Opus perfectum! Das heißt: Feierabend! |
| `wikinger_bau_fertig_01.ogg` | Wikinger – männlich | Steht! Und es hält sogar. Meistens. |
| `aegypter_bau_fertig_01.ogg` | Ägypter – männlich | Fertig. Es hält mindestens viertausend Jahre. Garantie. |
| `amazonen_bau_fertig_01.ogg` | Amazonen – weiblich | Fertig. Und keiner hat sich dabei den Daumen gehauen. Das ist bei uns Standard. |
| `amazonen_bau_fertig_02.ogg` | Amazonen – weiblich | Steht wie eine Eins. Die Männer da drüben brauchen dafür doppelt so lange. |

## Arbeiter tritt Dienst an (`arbeiter_da`)

| Datei | Sprecher | Text |
|---|---|---|
| `alle_arbeiter_da_01.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Bin da! Wo ist der Pausenraum? |
| `alle_arbeiter_da_02.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Neuer Arbeitsplatz, neues Glück. |
| `alle_arbeiter_da_03.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Ich fang dann mal an. Gleich. Nach dem Frühstück. |
| `amazonen_arbeiter_da_01.ogg` | Amazonen – weiblich | Bin da. Ab jetzt läuft der Laden. |

## Holzfäller findet keine Bäume (`mangel_baeume`)

| Datei | Sprecher | Text |
|---|---|---|
| `alle_mangel_baeume_01.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Keine Bäume mehr in Reichweite. Soll ich etwa Gras fällen? |
| `alle_mangel_baeume_02.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Der Wald ist alle. Ein Förster wäre jetzt nett. |
| `wikinger_mangel_baeume_01.ogg` | Wikinger – männlich | Kein Holz mehr! Wie sollen wir da Langschiffe bauen? Oder Bänke? |
| `amazonen_mangel_baeume_01.ogg` | Amazonen – weiblich | Keine Bäume mehr. Wer hat da nicht vorausgeplant? Ach ja. Niemand von uns. |

## Steinmetz findet keine Felsen (`mangel_felsen`)

| Datei | Sprecher | Text |
|---|---|---|
| `alle_mangel_felsen_01.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Hier gibt es keine Steine mehr. Nur noch Kiesel. Und die sind beleidigend klein. |
| `aegypter_mangel_felsen_01.ogg` | Ägypter – männlich | Keine Steine mehr! Wie soll man so eine Pyramide... ach, wir bauen ja gar keine. |

## Fischer findet keine Fische (`mangel_fische`)

| Datei | Sprecher | Text |
|---|---|---|
| `alle_mangel_fische_01.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Die Fische haben gekündigt. Wir brauchen ein anderes Ufer. |

## Keine Bretter mehr im Lager (`lager_leer`)

| Datei | Sprecher | Text |
|---|---|---|
| `alle_lager_leer_01.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Wir haben keine Bretter mehr! Ich wiederhole: KEINE. BRETTER. |
| `alle_lager_leer_02.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Das Lager ist leer. Und zwar so richtig leer. Mit Echo. |
| `amazonen_lager_leer_01.ogg` | Amazonen – weiblich | Keine Bretter mehr. Wir brauchen ein Sägewerk. Und zwar gestern. |

## Neuer Träger zieht ins Wohnhaus (`einzug`)

| Datei | Sprecher | Text |
|---|---|---|
| `alle_einzug_01.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Hallo! Ich bin neu hier. Wo kann ich was tragen? |
| `alle_einzug_02.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Neuer Träger meldet sich. Rücken ist frisch geölt. |
| `amazonen_einzug_01.ogg` | Amazonen – weiblich | Neue Schwester eingetroffen. Tragen? Kann ich. Kämpfen? Kann ich besser. |

## Kaserne bildet Soldat aus (`soldat_neu`)

| Datei | Sprecher | Text |
|---|---|---|
| `roemer_soldat_neu_01.ogg` | Römer – männlich | Legionär meldet sich zum Dienst. Wo ist die Kantine? |
| `roemer_soldat_neu_02.ogg` | Römer – männlich | Neuer Legionär! Helm sitzt, Sandalen drücken. |
| `wikinger_soldat_neu_01.ogg` | Wikinger – männlich | Berserker bereit! Wen soll ich anbrüllen? |
| `wikinger_soldat_neu_02.ogg` | Wikinger – männlich | Ich bin bereit! Ich habe meinen Bart extra gekämmt. |
| `aegypter_soldat_neu_01.ogg` | Ägypter – männlich | Speerträger zur Stelle. Die Pyramide kann warten. |
| `aegypter_soldat_neu_02.ogg` | Ägypter – männlich | Bereit zum Kampf. Sonnencreme ist aufgetragen. |
| `amazonen_soldat_neu_01.ogg` | Amazonen – weiblich | Kampfamazone einsatzbereit. Die Kerle da drüben können schon mal ihre Mama anrufen. |
| `amazonen_soldat_neu_02.ogg` | Amazonen – weiblich | Neue Kriegerin! Bogen gespannt, Zopf geflochten, Laune hervorragend. |
| `amazonen_soldat_neu_03.ogg` | Amazonen – weiblich | Ich bin bereit. Sag mir einfach, wen ich höflich, aber bestimmt besiegen soll. |

## Spieler befiehlt Angriff (`angriff`)

| Datei | Sprecher | Text |
|---|---|---|
| `alle_angriff_01.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Attacke! Also, ihr zuerst. |
| `alle_angriff_02.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Vorwärts! Und keiner bleibt stehen, um Blumen zu pflücken! |
| `roemer_angriff_01.ogg` | Römer – männlich | Für Rom! Und für die Rente! |
| `roemer_angriff_02.ogg` | Römer – männlich | Testudo! Ach nein, das üben wir noch. |
| `wikinger_angriff_01.ogg` | Wikinger – männlich | Waaaaah! Das war der ganze Plan. Waaaaah! |
| `wikinger_angriff_02.ogg` | Wikinger – männlich | Zum Angriff! Wer zuletzt ankommt, spült ab! |
| `aegypter_angriff_01.ogg` | Ägypter – männlich | Im Namen des Pharaos! Er schaut übrigens zu. Also gebt euch Mühe. |
| `amazonen_angriff_01.ogg` | Amazonen – weiblich | Schwestern, vorwärts! Und niemand bleibt stehen, um nach dem Weg zu fragen. Das machen nur die Kerle nicht. |
| `amazonen_angriff_02.ogg` | Amazonen – weiblich | Angriff! Wir sind schnell, wir sind viele, und wir haben uns vorher gedehnt. |

## Gegner greift an (`wir_werden_angegriffen`)

| Datei | Sprecher | Text |
|---|---|---|
| `alle_wir_werden_angegriffen_01.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Alarm! Die Nachbarn kommen zu Besuch. Und sie haben keinen Kuchen dabei. |
| `alle_wir_werden_angegriffen_02.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Feind in Sicht! Alle Mann auf die Türme! |
| `amazonen_wir_werden_angegriffen_01.ogg` | Amazonen – weiblich | Sie greifen uns an? Wie süß. Schwestern, auf die Türme! |

## Turm erobert (`erobert`)

| Datei | Sprecher | Text |
|---|---|---|
| `alle_erobert_01.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Turm erobert! Die Möbel bleiben, die Vormieter nicht. |
| `alle_erobert_02.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Gehört jetzt uns. Wer zuerst kommt, mahlt zuerst. |
| `amazonen_erobert_01.ogg` | Amazonen – weiblich | Turm erobert. Wir dekorieren gleich um. Lila steht dem Turm viel besser. |

## Eigener Turm verloren (`verloren`)

| Datei | Sprecher | Text |
|---|---|---|
| `alle_verloren_01.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Wir haben einen Turm verloren. Das war doch nur geliehen, oder? |
| `alle_verloren_02.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Turm verloren! Na toll. Da hing meine Wäsche. |
| `amazonen_verloren_01.ogg` | Amazonen – weiblich | Einen Turm verloren. Das gibt eine ernste Nachbesprechung. |

## Gebäude brennt ab (`brand`)

| Datei | Sprecher | Text |
|---|---|---|
| `alle_brand_01.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Es brennt! Wer hat da wieder mit Fackeln gespielt? |
| `alle_brand_02.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Unser Gebäude brennt ab! Hat jemand den Herd angelassen? |

## Spiel gewonnen (`sieg`)

| Datei | Sprecher | Text |
|---|---|---|
| `alle_sieg_01.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Sieg! Freibier für alle! Außer für die Verlierer. |
| `alle_sieg_02.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Gewonnen! Das gibt einen Eintrag ins Geschichtsbuch. |
| `amazonen_sieg_01.ogg` | Amazonen – weiblich | Sieg! War ja klar. Und jetzt: Wellness-Tag für alle Schwestern! |

## Spiel verloren (`niederlage`)

| Datei | Sprecher | Text |
|---|---|---|
| `alle_niederlage_01.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Verloren. Aber wir hatten eine schöne Zeit, oder? |
| `alle_niederlage_02.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Niederlage. Ich hab ja gleich gesagt, wir hätten Fischer werden sollen. |
| `amazonen_niederlage_01.ogg` | Amazonen – weiblich | Verloren?! Das muss ein Rechenfehler sein. Wir fordern eine Revanche. |

## Spieler klickt Träger an (`klick_traeger`)

| Datei | Sprecher | Text |
|---|---|---|
| `alle_klick_traeger_01.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Ja? Ich trag gerade was. Also gleich. Theoretisch. |
| `alle_klick_traeger_02.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Wenn ich noch ein Brett tragen muss, werde ich Philosoph. |
| `alle_klick_traeger_03.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Tragen, tragen, tragen. Mein Rücken hat eine eigene Gewerkschaft gegründet. |
| `alle_klick_traeger_04.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Ich bin Träger. Mein Traum? Ein Bollerwagen. |
| `amazonen_klick_traeger_01.ogg` | Amazonen – weiblich | Ich trage zwei Bretter auf einmal. Die Kerle schaffen nur eins. Und jammern dabei. |
| `amazonen_klick_traeger_02.ogg` | Amazonen – weiblich | Ja, Chefin? Oder Chef? Egal, ich trage einfach weiter. |

## Spieler klickt Arbeiter an (`klick_arbeiter`)

| Datei | Sprecher | Text |
|---|---|---|
| `alle_klick_arbeiter_01.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Ich arbeite hier. Gefühlt seit dreihundert Jahren. |
| `alle_klick_arbeiter_02.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Bitte nicht stören, ich bin im Flow. |
| `alle_klick_arbeiter_03.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Ich hab schon mal überlegt zu kündigen. Aber wohin denn? |
| `amazonen_klick_arbeiter_01.ogg` | Amazonen – weiblich | Ich mache hier die Arbeit von drei Männern. Und habe trotzdem gute Laune. |

## Spieler klickt Soldat an (`klick_soldat`)

| Datei | Sprecher | Text |
|---|---|---|
| `alle_klick_soldat_01.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Melde gehorsamst: Alles ruhig. Zu ruhig. |
| `alle_klick_soldat_02.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Ich stehe hier Wache. Seit Stunden. Ein Eichhörnchen hat mich ausgelacht. |
| `roemer_klick_soldat_01.ogg` | Römer – männlich | Legionär Quintus. Ich hab Hunger und mein Helm ist zu klein. |
| `wikinger_klick_soldat_01.ogg` | Wikinger – männlich | Wann kämpfen wir endlich? Mir ist langweilig! LANGWEILIG! |
| `aegypter_klick_soldat_01.ogg` | Ägypter – männlich | Ich bewache diesen Turm. Und den Sand drumherum. Sehr viel Sand. |
| `amazonen_klick_soldat_01.ogg` | Amazonen – weiblich | Bereit. Immer bereit. Ich hab sogar im Schlaf den Bogen in der Hand. |
| `amazonen_klick_soldat_02.ogg` | Amazonen – weiblich | Wenn die Kerle da drüben angreifen, verteile ich Lektionen. Kostenlos. |

## Gegner stichelt (ab und zu) (`gegner_spott`)

| Datei | Sprecher | Text |
|---|---|---|
| `alle_gegner_spott_01.ogg` | Volksstimme (alle Völker, Sprecher passend zum gewählten Volk) | Da drüben bauen die schon ihr drittes Sägewerk. Angeber. |
| `amazonen_gegner_spott_01.ogg` | Amazonen – weiblich | Die Amazonen sind schneller als ihr! Und schöner! Und pünktlicher! |
| `wikinger_gegner_spott_01.ogg` | Wikinger – männlich | Eure Türme sind klein! Unsere Bärte sind größer als eure Türme! |
| `roemer_gegner_spott_01.ogg` | Römer – männlich | Wir haben Aquädukte! Was habt ihr? Eben. |
| `aegypter_gegner_spott_01.ogg` | Ägypter – männlich | Unsere Katzen sind besser organisiert als euer ganzes Reich. |

---
Insgesamt **101 Sätze**.
