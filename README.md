# Tancredi's Castle

Una città fantasy da esplorare in volo nel browser: al centro il castello di pietra grigia del re Tancredi, a
nord-ovest la Rocca d'Avorio a forma di teschio cornuto, a nord-est la Fortezza delle Serpi sotto i fulmini. Tramonto
arancio sotto un cielo blu acciaio e musica eroica a 8 bit, tutto originale.

**Si apre con Chrome o Edge su computer** (serve WebGPU): https://matto175.github.io/Tancredis-Castle/

**Si gioca con l'eroe, Tancredi il Prode.** W A S D per camminare, Shift per correre, Spazio per saltare, clic per il
colpo di spada, F per alzare la Spada del Tuono (si trasforma per 30 secondi), trascina il mouse per guardarti intorno, P
per passare al volo libero e tornare all'eroe. Gli stessi comandi sono anche pulsanti sullo schermo; su tablet il pollice
sinistro fa da joystick.

In volo: W A S D per volare, Q / E giù e su, mouse per guardarsi intorno, M per la musica, Esc per il menu.
O cambia l'ora del giorno (alba, giorno, tramonto, notte). Eventi: T la tempesta di fulmini sul castello, G il drago,
V la battaglia sul mare (si avviano anche dal menu).
Panorami: 1 vista dall'alto, 2 il viale verso il castello, 4 davanti alla porta del castello, 5 il quartiere dei
giardini, 6 la Rocca d'Avorio, 7 la Fortezza delle Serpi, 8 il girotondo, 9 il molo ovest.
Su telefono e tablet: tieni il dito giù per volare, fallo scorrere per girare.

## Com'è fatta

- `design/pianta.png`: la pianta della città, decisa prima di scrivere il codice.
- `docs/bibbia-dello-stile.md`: come deve essere il mondo (luoghi, colori, luce, musica, cosa non fare).
- `source/src/castles.js`: i tre castelli, costruiti con forme semplici (cilindri, coni, ellissoidi, tubi).
- `source/src/layout.js`: dove stanno la Rocca e la Fortezza e il terreno spianato sotto di loro.
- `source/src/hero.js`: l'eroe (camminata, salti, spada, trasformazione); il suo modello è in `events.js`, le animazioni
  in `sh_scene.js` (heroAt).
- `source/src/events.js`: il drago e le navi; `source/src/sh_scene.js` (dragonAt, shipAt) li fa muovere.
- `source/src/sh_base.js`: il cielo, le ore del giorno, la luna, le stelle e i fulmini; `source/src/music.js`: la musica e i
  suoni degli eventi.
- `docs/foto/`: foto di prova (castello, Rocca, Fortezza, notte, tempesta, drago, battaglia, eroe).

## Da dove viene

Tancredi's Castle è una versione modificata di **[Atlantis](https://github.com/Noniv/atlantis)** di Maksymilian
Dendura, pubblicata con licenza MIT (vedi [LICENSE](LICENSE)), passando per Virginia Bay (da cui restano le bambine e i
bambini che giocano). Il README originale, la bibbia dello stile e il prompt di Atlantis sono in `docs/atlantis/`.

Il mondo, i castelli, i nomi e la musica sono ispirati al genere fantasy eroico degli anni '80 ma inventati per
questo progetto: non riproducono personaggi, luoghi o musiche di altre opere.

## Ricostruire `index.html`

```
cd source
npm install
npm run build        # index.html compresso
npm run build:dev    # dev.html leggibile, con strumenti di prova
```
