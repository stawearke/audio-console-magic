# Field relay (reporters on location -> your OBS)

1. Rent a small VPS (Ubuntu, ~$5/month, closest region to you). Point a domain name at it (A record), e.g. `relay.yourdomain.com`.
2. On the VPS:
   ```
   sudo bash setup-field-vps.sh relay.yourdomain.com 6 https://YOUR-APP-URL
   ```
   (6 = number of field units; YOUR-APP-URL = where this app is hosted over https.)
3. Open `/root/field-links.txt`. For each unit it gives:
   - **Reporter (browser)**: send this link to the reporter. They pick camera and mic and tap GO LIVE.
   - **OBS web source**: paste into Settings -> Source Mapping -> Add field source -> "Web page (WebRTC link)".
   - **SRT** lines: for pro apps (Larix, Moblin) and for OBS media sources.
4. In the app, Add field source creates `FIELD 1` and puts it on the source bus. Individual recording: Streaming -> Source Record.

Ports opened: 22, 80, 443 (tcp), 8189 (udp+tcp, WebRTC media), 8890 (udp, SRT).
