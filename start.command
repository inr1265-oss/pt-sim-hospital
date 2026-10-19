#!/bin/bash
cd "$(dirname "$0")"
[ -f server/config.json ] || cp server/config.example.json server/config.json
(sleep 1; open "http://localhost:8787") &
node server/server.js