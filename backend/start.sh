#!/bin/bash
echo "Instalowanie zależności..."
npm install

echo "Uruchamianie serwera milleVAT..."
# Uruchomienie w tle za pomocą node (lub pm2 jeśli dostępne)
if command -v pm2 &> /dev/null
then
    pm2 start index.js --name "millevat-api"
    echo "Serwer uruchomiony w tle (PM2)."
    pm2 logs millevat-api
else
    echo "Uruchamianie w trybie standardowym (aby zatrzymać wciśnij Ctrl+C)..."
    node index.js
fi
