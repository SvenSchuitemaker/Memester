# Memester

Een Nederlandstalig multiplayer tijdlijnspel over internetmemes. Eén laptop host het spel, spelers gebruiken hun eigen telefoon.

## Draaien

Installeer Node.js 22 of hoger. Voer in de projectmap `npm ci` en daarna `npm start` uit. Open op de laptop `http://localhost:3000` voor een test in aparte browserprofielen of vensters.

Voor een spel met telefoons op hetzelfde netwerk open je op de hostlaptop de website via het lokale IP-adres van de laptop, bijvoorbeeld `http://192.168.1.42:3000`. De QR-code neemt het adres uit de browser over. De telefoons moeten dat adres kunnen bereiken.

Voor online spelen draai je het Node-proces op een webhost die `npm ci`, `npm start` en de omgevingsvariabele `PORT` ondersteunt. Gebruik één serverinstantie. Kamers worden in het geheugen bijgehouden en vervallen na een herstart of zes uur zonder activiteit.

## Spelen

1. De host kiest twee tot zes teams en maakt een lobby.
2. Spelers openen de lobby via de QR-code of typen de lobbycode van vijf tekens in. Ze vullen hun naam in en kiezen een team.
3. Start zodra elk team minstens twee spelers heeft. Elk team begint met 2010, 2015 en één herlegtoken.
4. Er zijn vier rondes. Elk team speelt één beurt per ronde:
   - **Emoji’s:** alleen de emoji-aanwijzing verschijnt. De memeclip wordt beschikbaar bij de onthulling.
   - **Video:** speel de memeclip af. Het jaartal verschijnt bij de onthulling.
   - **Tekenen:** één teamgenoot kiest **Ik ga tekenen**, bekijkt de meme privé en tekent op papier. De andere teamgenoten raden en plaatsen.
   - **Uitbeelden:** één teamgenoot kiest **Ik ga uitbeelden**, bekijkt de meme privé en beeldt die uit. De andere teamgenoten raden en plaatsen.
5. Het actieve team kiest een vakje en klikt op **Lock kaart**. Tijdens zeven seconden mogen andere teams met een herlegtoken een vrij vakje claimen. Iedere plaatsing blijft zichtbaar in de eigen teamkleur.
6. Het team op de juiste plek krijgt de kaart in zijn eigen tijdlijn. Bij een goede herlegging krijgt dat team ook zijn token terug. Bij gelijke jaartallen telt het vakje vóór de eerste kaart met dat jaar.
7. Na de laatste beurt wint het team met de meeste verdiende kaarten. Gelijke scores leveren een gelijkspel op.

De 24 kaarten staan in `deck.js`. De spelserver kiest per spel verschillende kaarten en reserveert clips voor de eerste twee rondes. YouTube moet bereikbaar zijn om de clips af te spelen.
