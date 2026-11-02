# Tüftelinsel

Ein 3D-Physik-Baukasten für den Browser, gemacht fürs iPad. Bis zu 4 Spieler bauen gemeinsam auf einer Insel: Kisten, Bretter, Räder, Seile, Federn, Schubdüsen und Ballons, dazu ein Fahrersitz zum Fahren.

**Spielen:** https://kaeptnzursee1910.github.io/Tueftelinsel/ (in Safari öffnen, dann „Teilen → Zum Home-Bildschirm“).

## Mehrspieler

Genau wie bei Horizon Rush: Ein Gerät tippt auf **Mehrspieler → Runde öffnen** und bekommt einen 4-stelligen Code. Die anderen geben den Code ein oder öffnen den Einladungslink. Die Verbindung läuft über WebRTC (PeerJS); im Uni-WLAN hilft der Online-Schlüssel des Verbindungsservers. Ist er schon in Horizon Rush gespeichert, gilt er hier auch (gleiche Adresse).

Der Gastgeber rechnet die Physik und schickt 20-mal pro Sekunde den Stand an alle. Jedes Gerät steuert seine eigene Figur selbst.

## Werkzeuge

| | Werkzeug | Was es macht |
|---|---|---|
| ✋ | Greifstrahl | Teil packen, bewegen, drehen, einfrieren |
| 🔥 | Schweißgerät | zwei Teile fest verbinden |
| 🚪 | Scharnier | Drehgelenk, Achse zeigt aus der ersten Fläche |
| 🪢 | Seil | zwei Punkte mit einem Seil verbinden |
| 🌀 | Feder | zwei Punkte mit einer Feder verbinden |
| ⚙️ | Rad | Rad mit Motor an ein Teil setzen |
| 🚀 | Schubdüse | Düse anbringen, mit „Benutzen“ an/aus |
| 🎈 | Ballon | Ballon am Seil an ein Teil hängen |
| 🧽 | Radierer | Teil löschen oder Verbindungen lösen |

## Technik

Reines HTML/JavaScript ohne Installation. Three.js (Grafik), Rapier (Physik, WebAssembly) und PeerJS liegen im Ordner `lib/`.
