# Tüftelinsel

Ein Block-Bauspiel für den Browser, gemacht fürs iPad. Die ganze Inselwelt besteht aus Blöcken: Strände, Palmen, Hügel, Felsen und Korallen im flachen Wasser. Bis zu 4 Spieler bauen gemeinsam, jeder auf seinem eigenen Gerät.

**Spielen:** https://kaeptnzursee1910.github.io/Tueftelinsel/ (in Safari öffnen, dann „Teilen → Zum Home-Bildschirm“).

## Spielen

- **Allein spielen:** eine neue Insel erschaffen (Name und optional ein Startwert, gleicher Startwert = gleiche Insel) oder eine gespeicherte weiterspielen.
- **Abbauen und Bauen:** 34 eigene Blöcke, z. B. Planken, Strohdach, Lehmziegel, Muschelkalk, Korallenstein, Glas, Laterne, Meerkristall und bunte Tücher. Im 🧱 Block-Menü legst du sie in die Schnellleiste.
- **Fliegen:** 🕊️ auf dem iPad, am PC zweimal schnell die Leertaste.
- **Speichern:** automatisch auf dem Gerät (alle 30 Sekunden und beim Verlassen). Mit 💾 sicherst du eine Insel als Datei und kannst sie auf einem anderen Gerät wieder laden.

## Mehrspieler

Wie bei Horizon Rush: Ein Gerät tippt auf **Mehrspieler → Runde öffnen**, wählt eine Insel und bekommt einen 4-stelligen Code. Die anderen geben den Code ein oder öffnen den Einladungslink. Die Verbindung läuft über WebRTC (PeerJS); im Uni-WLAN hilft der Online-Schlüssel des Verbindungsservers. Ist er schon in Horizon Rush gespeichert, gilt er hier auch (gleiche Adresse).

Jedes Gerät erzeugt die Insel selbst aus dem Startwert. Übertragen werden nur die veränderten Blöcke und die Positionen der Spieler. Die Insel liegt beim Gastgeber und wird dort gespeichert.

## Steuerung

| iPad | PC | |
|---|---|---|
| Linker Daumen | WASD | Laufen |
| Rechts wischen | Maus | Umschauen |
| 🧱 Bauen | Rechte Maustaste | Block setzen |
| ⛏️ Abbauen | Linke Maustaste | Block entfernen |
| ⤒ | Leertaste | Springen / Schwimmen / Hochfliegen |
| 🕊️, ⤓ | 2× Leertaste, Umschalt | Fliegen, runter |
| Schnellleiste | 1–9, Mausrad | Block wählen |
| 🧱 Blöcke | E | Block-Menü |

## Technik

Reines HTML/JavaScript ohne Installation. Three.js (Grafik) und PeerJS liegen im Ordner `lib/`. Die Welt wird in Chunks von 16 × 16 × 64 Blöcken in einem Hintergrund-Worker erzeugt und zu Dreiecken verbaut (`js/gen.js`, `js/mesher.js`, `js/worker.js`). Alle Texturen werden beim Start im Code gemalt (`js/textures.js`).
