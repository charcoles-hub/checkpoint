# Búsqueda "Por feeling" — Spec

**Fecha:** 2026-06-01  
**Estado:** Aprobado

## Objetivo

Permitir a cualquier usuario (registrado o no) describir en texto libre qué tipo de juego quiere y recibir una lista de coincidencias ordenadas por porcentaje de acierto.

---

## UI

### Toggle en la barra de búsqueda

- En la barra de búsqueda existente se añade un botón-link **"✦ Por feeling"** a la derecha, separado por un divisor vertical.
- Al hacer clic, el buscador cambia a modo feeling: fondo morado oscuro, placeholder cambia a *"Ej: algo como Zelda pero más oscuro y difícil..."*, aparece un botón "Buscar coincidencias →".
- Un enlace **"✕ Normal"** vuelve al modo búsqueda estándar.
- La descripción mínima para enviar: 10 caracteres (validación en frontend, no hace la llamada si no se cumple).
- Sin mención a "IA" en ningún texto visible de la UI.

### Resultados

- Lista vertical de cards (máx. 20) bajo el buscador, reemplazando la vista actual.
- Cada card: portada, nombre, tags coincidentes, badge de porcentaje (verde ≥70%, amarillo 40–69%), y rating medio de comunidad si existe.
- Encabezado: *"N coincidencias para '[descripción truncada]'"*.
- Si 0 resultados: mensaje + ejemplos de descripciones.
- Cada card es clicable y abre el modal de juego habitual.

---

## Backend

### Endpoint

```
GET /api/games/feeling?q=<texto>
```

Accesible sin autenticación.

### Flujo

1. Normalizar `q` (lowercase, strip). Si `len(q) < 10` → 400.
2. `cache_key = f"feeling:{hashlib.sha256(q.encode()).hexdigest()[:16]}"`
3. `cache_get(cache_key)` → si hit, devolver directamente.
4. Llamada a Gemini `gemini-2.0-flash-lite` (1500 req/día, 30 RPM en tier gratuito):
   - Prompt: *"Extract 4-7 RAWG API tags or genres that best match this game description. Return ONLY a JSON array of strings, no explanation. Description: {q}"*
   - Timeout: 5s. Si falla → 503.
5. Parsear respuesta como JSON array. Si falla el parse → 503.
6. **Comunidad**: query sobre `game_entries` donde `genres` contenga al menos 1 de los tags extraídos y `status IN ('played','playing')`. Agrupar por `appid`, contar tags coincidentes, calcular `AVG(rating::numeric)::float`.
7. **RAWG**: si comunidad devuelve < 8 juegos únicos, llamar `rawg_games_page()` con el tag más relevante (primero de la lista Gemini). Aplicar filtro `_NSFW_TAGS`.
8. **Scoring**: `score = round((matched / len(gemini_tags)) * 100)`. Descartar juegos con score < 40.
9. Ordenar: comunidad primero (tienen `community_rating`), luego RAWG; dentro de cada grupo por score desc.
10. `cache_set(cache_key, result, ttl_hours=24)`.
11. Devolver: `[{appid, name, cover_url, score, matched_tags, community_rating?}]`
    - `cover_url` para resultados de comunidad: generada con `img(appid)` (Steam CDN). Para resultados RAWG: la que devuelve `rawg_games_page()`.

### Variable de entorno nueva

`GEMINI_API_KEY` — añadir en Render. Usar `google-generativeai` (ya disponible o añadir a `requirements.txt`).

### Errores

| Situación | Respuesta |
|---|---|
| Gemini timeout / falla | 503 `{"error": "No se pudo procesar la descripción, inténtalo de nuevo"}` |
| 429 rate limit Gemini | 503 mismo mensaje |
| `q` < 10 chars | 400 `{"error": "Descripción demasiado corta"}` |
| 0 resultados tras scoring | 200 con array vacío, frontend muestra mensaje |

---

## Caché

- Clave: `feeling:{sha256(q)[:16]}`
- TTL: 24h
- Misma infraestructura `api_cache` existente (tabla en Supabase/SQLite)
- No se cachea si Gemini falla (no se escribe nada)

---

## Dependencias

- `google-generativeai` — añadir a `requirements.txt` (no está actualmente)
- `GEMINI_API_KEY` — nueva env var en Render
- No requiere migraciones de BD (usa tablas y columnas existentes)

---

## Fuera de scope

- Personalización por historial del usuario (todos reciben los mismos resultados para la misma descripción)
- Búsqueda combinada nombre + feeling en la misma query
- Gate premium (feature disponible para todos)
