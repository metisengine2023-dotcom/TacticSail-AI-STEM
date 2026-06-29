# TacticalSail v1

## Identita del progetto

TacticalSail v1 e il primo prototipo del progetto di The Mastery Mentors per simulare una regata reale vista dall'alto, in stile MetaSail.

Il fulcro non e una chat tattica generica. Il fulcro e la simulazione: una persona normale deve poter vedere come naviga un atleta, dove guadagna, dove perde, quali sono i suoi punti critici e come provare a batterlo.

Il sistema lavora su una regata 2D vista dall'alto, con track, boe, vento, velocita, mure, virate, abbattute e layline.

## Collegamento STEM

TacticalSail v1 e un progetto STEM perche unisce:

- Science: vento, pressione, conduzione della barca, velocita e VMG.
- Technology: lettura di screenshot MetaSail, dati dei bot, modello AI locale e simulazione 2D.
- Engineering: costruzione del motore tattico, gestione dati e pipeline di simulazione.
- Math: coordinate, traiettorie, distanza percorsa, layline, confronto tra velocita e guadagno tattico.

L'obiettivo e trasformare dati di regata reali in una simulazione comprensibile e tecnica.

## Area di lavoro

TacticalSail v1 lavora solo su Area B del Lago di Garda.

Area A non viene considerata in questa versione.

Il campo di regata e quello visto negli screenshot MetaSail. La mappa, le boe e i track sono la base del sistema. La tattica non viene inventata: parte dagli screenshot e viene trasformata in regole di simulazione.

## Base tattica

La tattica base e quella vista negli screenshot:

1. partire (solitamente mure a dritta)
2. virare immediatamente mure a sinistra (port tack)
3. andare dritti su mure a sinistra senza virate intermedie per massimizzare la velocità sul bordo lungo
4. arrivare in layline
5. virare mure a dritta e chiudere verso la boa

La prima bolina non deve cambiare troppo. Deve restare una tattica stabile, con piccole varianti.

Le varianti principali sono:

- vento buono leggermente piu a sinistra
- vento buono leggermente piu a destra
- vento scarso o instabile
- scelta tra partenza in boa e partenza in barca

La scelta tra boa e barca non deve essere un bottone. Deve emergere dalla simulazione delle manovre: virate, abbattute, angolo, velocita, pressione e posizione rispetto alla layline.

## Struttura del campo

Per TacticalSail v1 il campo principale da simulare e il campo esterno.

La sequenza di riferimento e:

1. partenza
2. bolina
3. lasco
4. poppa
5. seconda bolina
6. seconda poppa
7. lasco di arrivo
8. arrivo

Esiste anche il campo interno, ma in questa logica mantiene la stessa idea generale. La differenza principale e che, guardando lo screenshot, il gate da girare e il gate di destra. Dopo quella scelta si sale un attimo mure a destra, poi si torna mure a sinistra e si rifà la stessa logica della prima bolina.

## Gate, lasco e poppa

Sul campo esterno bisogna aggiungere queste regole:

- con il vento normale e il campo esterno, la scelta preferita e girare il gate di sinistra
- nel caso letto dallo screenshot interno, il gate di destra resta la scelta base
- se si gira il gate di destra, si prende la salita iniziale, si vira subito e si costruisce una regata centro-destra
- nella regata centro-destra bisogna stare attenti a buoni e scazzi, perche li i piccoli cambi di pressione pesano di piu

Sul lasco:

- se alcuni fanno il lasco troppo esterno e tu lo fai bene interno, puoi guadagnare perche loro fanno troppa strada
- se loro fanno un lasco esterno ma non troppo, possono rientrare prima sulla bolina successiva e tenere vantaggio
- quindi il sistema deve confrontare sempre angolo, distanza extra e tempo di rientro sulla gamba successiva

Sulla poppa:

- normalmente a destra c'e meno vento
- in condizioni normali la poppa a sinistra e generalmente migliore
- pero dipende dalla derivazione del vento e dal suo ingresso sul lago

## Vento speciale centro-sud / centro-sinistra

Quando il vento arriva da una punta vista da Riva del Garda tra centro-sud e centro-sinistra, la logica cambia in modo preciso:

- prima bolina: bisogna andare a sinistra
- poi si vira e si rifà la stessa tattica del campo
- seconda bolina: vale ancora la sinistra come lato buono
- poppa: la poppa interna puo diventare buona

Anche qui bisogna restare attenti a una piccola eccezione: qualche volta un piccolo scazzetto puo favorire di poco quelli che stanno un po' piu a destra, quindi il sistema non deve trattare la sinistra come un automatismo cieco.

## Vento e Ora

Per questa versione si considera solo l'Ora.

La logica iniziale e:

- a destra c'e meno vento
- troppo a destra c'e poco vento
- piu a sinistra c'e piu vento
- il centro e una zona intermedia
- sotto costa o in zone sporche il vento puo essere peggiore
- le raffiche devono essere simulate come zone locali di pressione piu forte

Il modello deve leggere la mappa del vento, non inventarla.

Quando il progetto riceve un file GRIB vero, per esempio i componenti ufficiali DWD `u_10m` e `v_10m`, il vento viene convertito in una wind field locale di Area B tramite `scripts/build_wind_field.py`.
Il simulatore usa quel campo come base fisica e mantiene la logica tattica di Area B come livello di interpretazione.
Se il wind field non e ancora disponibile, il motore resta comunque attivo con la griglia sintetica di fallback coerente con la lettura dello screenshot.

Il flusso di gara non usa piu un countdown: scegli la partenza con `Q`, `W` o `E` e la simulazione parte subito.

## Screenshot MetaSail

Gli screenshot sono la base del sistema.

Il modello deve poter leggere:

- posizione della barca
- track
- velocita
- VMG
- rotta
- mure
- bolina
- poppa
- distanze
- boe
- layline
- comportamento degli avversari

Da questi elementi il sistema deve ricostruire come naviga l'atleta.

Se lo screenshot mostra mure a sinistra, la direzione base della simulazione deve seguire quella lettura. Se cambia lo screenshot, cambia la lettura, ma la tattica base resta stabile.

## Boe e campo

Le boe visibili nello screenshot di riferimento sono:

- ALFA ARC
- ALFA FIN
- ALFA FINISH
- ALFA FINISH END
- ALFA 3ST
- ALFA 1
- ALFA 2

Le coordinate iniziali estratte sono coordinate pixel dello screenshot, non coordinate GPS reali. In una versione successiva potranno essere convertite in coordinate normalizzate o geografiche.

## Bot simulati

TacticalSail v1 contiene 7 bot:

| Bot | Nome | Lato preferito | Avg speed | Avg VMG |
| --- | --- | --- | ---: | ---: |
| BOT_01 | Paolo | right | 6.01 | 4.005 |
| BOT_02 | Filippo | right | 6.105 | 3.967 |
| BOT_03 | Enrico | right | 6.041 | 3.92 |
| BOT_04 | Giuseppe | left | 6.036 | 4.029 |
| BOT_05 | Emanuele | left | 6.029 | 4.027 |
| BOT_06 | Elia | right | 6.256 | 3.908 |
| BOT_07 | Simeon | left | 6.076 | 4.014 |

Questi profili derivano dai dati estratti dal dataset v11 e servono come base per simulare atleti con comportamenti diversi.

## Come deve simulare

Il sistema deve seguire questa sequenza:

1. leggere screenshot e dati MetaSail
2. identificare Area B
3. leggere vento e pressione
4. leggere il bot o l'atleta da simulare
5. ricostruire velocita e stile di conduzione
6. simulare il movimento in 2D
7. decidere virate e abbattute
8. valutare layline e distanza percorsa
9. confrontare l'atleta con gli avversari
10. mostrare punti critici e traiettoria migliore

Il modello AI non deve essere l'unico motore fisico. La fisica base deve arrivare da dati, coordinate, velocita e regole. Il modello deve ragionare sulla tattica e spiegare le scelte.

## Modello AI

Il modello scelto e Qwen 3.5 4B, con backend locale scelto automaticamente:

- su Apple Silicon/macOS usa MLX con `mlx-community/Qwen3.5-4B-MLX-4bit`
- su Windows usa Transformers/PyTorch, con CUDA se disponibile, DirectML se installato, altrimenti CPU
- sugli altri sistemi usa il percorso Transformers/PyTorch compatibile

Non viene usato fine-tuning in questa versione. I dati vengono dati al modello tramite contesto strutturato:

- Area B
- tattica Ora
- bot
- dati estratti dal dataset v11
- screenshot MetaSail
- richiesta di simulazione

Questo permette di aggiornare dati e regole senza riaddestrare il modello.

## Dati del progetto

I dati principali sono:

- `data/area_b.example.json`: configurazione Area B
- `data/tactics/ora_area_b.example.json`: tattica Ora su Area B
- `data/bots/`: profili dei 7 bot
- `data/generated/bot_profiles.json`: bot generati dal dataset v11
- `data/generated/tactical_priors.json`: priorita tattiche estratte dal dataset
- `data/generated/examples.jsonl`: esempi normalizzati dal dataset v11

## Output atteso

TacticalSail v1 deve produrre:

- simulazione 2D della regata
- traiettoria del bot
- scelta delle manovre
- lettura del vento
- lato consigliato
- punto in cui virare
- ingresso in layline
- punti critici dell'atleta
- metodo per provare a batterlo

Deve anche saper distinguere:

- campo esterno e campo interno
- gate di destra e gate di sinistra
- lasco interno e lasco esterno
- poppa normale e poppa influenzata dal vento centro-sud / centro-sinistra
- prima bolina e seconda bolina con la stessa logica di campo

La risposta finale deve essere utile sia a chi guarda la regata dall'alto sia a chi vuole capire la tattica.

## Sintesi finale

TacticalSail v1 e un simulatore tattico per Area B del Lago di Garda.

Parte dagli screenshot MetaSail, legge track e dati, usa 7 bot con profili diversi, applica la tattica base dell'Ora, aggiunge la logica di gate, lasco, poppa e seconda bolina, e usa Qwen 3.5 4B 4 bit per ragionare sulle scelte.

La regola principale e semplice: simulare bene prima il Garda e Area B, poi eventualmente espandere.
