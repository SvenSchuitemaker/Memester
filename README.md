# Memester

Een Nederlandstalig multiplayer tijdlijnspel over internetmemes. Eén laptop host het spel, spelers gebruiken hun eigen telefoon.

## Draaien

Installeer Node.js 22 of hoger. Voer in de projectmap `npm ci` en daarna `npm start` uit. Open op de laptop `http://localhost:3000` voor een test in aparte browserprofielen of vensters.

Voor een spel met telefoons op hetzelfde netwerk open je op de hostlaptop de website via het lokale IP-adres van de laptop, bijvoorbeeld `http://192.168.1.42:3000`. De QR-code neemt het adres uit de browser over. De telefoons moeten dat adres kunnen bereiken.

Voor online spelen draai je het Node-proces op een webhost die `npm ci`, `npm start` en de omgevingsvariabele `PORT` ondersteunt. Gebruik één serverinstantie. Kamers worden in het geheugen bijgehouden en vervallen na een herstart of zes uur zonder activiteit.

## Spelen

1. De host kiest twee tot zes teams en maakt een lobby.
2. Spelers openen de lobby via de QR-code of typen de lobbycode van vijf tekens in. Ze vullen hun naam in en kiezen een team.
3. Als ieder team minstens één speler heeft, start de host het spel. Elk team begint met de kaarten 2010 en 2015 en één herlegtoken.
4. Iedereen ziet de actieve tijdlijn en de emoji-aanwijzing. Bij sommige kaarten kan de host ook een YouTube-clip afspelen. Het actieve team kiest een vakje en klikt op **Lock kaart**.
5. De server start zeven seconden. De oorspronkelijke kaart blijft liggen in de kleur van het actieve team. Elk ander team met een herlegtoken mag één vrij vakje claimen. Dat kost een token en plaatst een kaart in de eigen teamkleur.
6. De server onthult het jaar. Het team op de juiste plek krijgt de kaart in zijn eigen tijdlijn. Een team dat goed heeft herlegd krijgt ook zijn token terug. Bij een foute herlegging blijft het token verbruikt. Bij gelijke jaartallen is het vakje vóór de eerste kaart met dat jaar de juiste plek.
7. De host gaat door naar de volgende ronde. De teams wisselen af. Na de laatste meme wint het team met de meeste verdiende kaarten. Gelijke scores leveren een gelijkspel op.

De startset in `deck.js` bevat twaalf rondes. Het jaar is het jaar van het internetmoment dat op de kaart wordt bedoeld. De clip is optioneel en de emoji-aanwijzing blijft beschikbaar als YouTube de video niet kan afspelen.
