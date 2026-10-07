# Watch/„Urmărește" v1 — plan
User decisions: (c) push+centru; setul maximal necesar; Worker-only (zero GH minutes); anonymous install-IDs, zero PII.
Followable: dosar (fond/apel/recurs+termene), firmă CUI (registre/bilanțuri), localitate (știri+anunțuri oficiale), act normativ, venue spectacole (Opera Cluj+Odeon), candidat: avertizări meteo județ (doar dacă sursa e machine-readable).
Architecture: D1 watch_items/watch_events/push_subs · /api/watch{,-events,-push} · detection sweep pe Worker cron (free) refolosind cache-urile familiilor existente + fetchuri mărginite (dosare) · Web Push VAPID prin SW PWA (bump SW version) · centru „Ce s-a schimbat" + badge + „Șterge-mi datele".
Honesty: „verificăm de X ori pe zi" per tip; pol.getAddress politicoase.
