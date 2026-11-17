# Meine Wanderkarte

Öffentliche Wander-Website mit Satellitenkarte, Relief, Tourenfiltern, Heatmap auf Basis unterschiedlicher GPX-Routen, Statistiken und interaktiven Höhenprofilen.

## Website auf GitHub Pages veröffentlichen

1. Bei [github.com](https://github.com) anmelden und ein **öffentliches** Repository erstellen, z. B. `meine-wanderkarte`. Keine README automatisch erzeugen.
2. Den **Inhalt dieses Projektordners** in das Repository hochladen (einschließlich `.github/workflows/deploy.yml` und `gpx/`). Am einfachsten lokal mit Git, damit versteckte `.github`-Dateien mitkommen.
3. Unter **Settings → Pages → Build and deployment → Source** `GitHub Actions` auswählen.
4. Unter **Actions** prüfen, ob `Wanderkarte veröffentlichen` erfolgreich durchgelaufen ist. Falls nicht automatisch gestartet, `Run workflow` wählen.
5. Die öffentliche Adresse lautet normalerweise `https://DEIN-NUTZERNAME.github.io/meine-wanderkarte/`.

**Nur Personen mit Schreibberechtigung auf dein Repository dürfen GPX-Dateien hinzufügen oder ändern.** Die Website selbst bietet absichtlich kein öffentliches Upload-Formular. GitHub-Zugang und Zwei-Faktor-Authentifizierung schützen den Upload.

## Neue Wanderung hinzufügen

1. GitHub-Repository öffnen → Ordner `gpx` → **Add file → Upload files**.
2. Neue `.gpx`-Datei auswählen → **Commit changes**.
3. GitHub Actions baut die Website automatisch neu. Die URL bleibt gleich. Das dauert meist wenige Minuten.

Alternativ lokal Dateien in `gpx/` ablegen, `python build.py` ausführen und mit Git committen/pushen.

## Neue Features entwickeln

- `template.html` enthält das Layout, die Karte und die JavaScript-Funktionen.
- `build.py` erzeugt aus allen GPX-Dateien eine neue `site/index.html`.
- `.github/workflows/deploy.yml` veröffentlicht die neue Version nach Änderungen.
- Der Ordner `site/` wird automatisch erzeugt und muss nicht ins Repository.

## Datenschutz und Hinweise

**Achtung: Alle GPX-Tracks sind auf der öffentlichen Website sichtbar**, einschließlich möglicher Start- und Zielorte. Auch ein öffentliches GitHub-Repository macht die hochgeladenen Original-GPX-Dateien öffentlich. Vor dem Hochladen sensible Punkte entfernen.

Kilometer und Höhenmeter werden aus den GPX-Daten berechnet, nicht aus bestätigten Wanderaufzeichnungen. Höhenmeter können durch Messrauschen abweichen. Heatmap-Überlappungen werden auf einem Raster von ungefähr 90 m angenähert. Die Reliefansicht ist eine 2D-Schummerung und kein frei drehbares 3D-Modell.

Kartendaten und JavaScript-Bibliotheken werden über externe Internetdienste geladen. GitHub Pages ist kostenlos für öffentliche Repositories im Rahmen der Nutzungsbedingungen; ein eigener Domainname ist optional.
