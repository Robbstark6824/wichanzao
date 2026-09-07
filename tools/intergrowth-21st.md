# INTERGROWTH-21st y datación fetal — fuentes y ecuaciones

Referencia de las fórmulas usadas por el módulo **Calculadora obstétrica** de `index.html`
(funciones `calc*`). Todas están verificadas contra las tablas oficiales publicadas
(ver anclas al final). Si se toca una constante, hay que volver a correr
`node tools/test-crecimiento-fetal.mjs` y `node tools/test-edad-gestacional.mjs`.

Unidades: `GA` = edad gestacional en **semanas decimales**; biometría en **mm**; PFE en **g**.

---

## 1. Datación por LCC (longitud céfalo-caudal / CRL)

### Robinson–Fleming 1975  (`calcEgPorLcc(lcc,'rf')`) — por defecto
`EG(días) = 8.052 · √(LCC · 1.037) + 23.73`  ·  LCC en mm, válido **5–84 mm**.
Estándar de ISUOG / NICE / RCOG.
Robinson HP, Fleming JEE. *Br J Obstet Gynaecol* 1975;82:702–710.

### INTERGROWTH-21st  (`calcEgPorLcc(lcc,'ig')`)
`EG(días) = 40.9041 + 3.21585 · √LCC + 0.348956 · LCC`  ·  LCC en mm, válido **15–95 mm**.
`DE(EG, días) = 2.39102 + 0.0193474 · LCC`
Papageorghiou AT, et al. *Ultrasound Obstet Gynecol* 2014;44:641–648.

## 2. Edad gestacional por FUR

Regla de Naegele: `FPP = FUR + 280 días`; `EG(días) = fecha − FUR`.
El motor real es `qxEG` / `qxFpp` / `qxFurEfectiva` (sección "Edad gestacional" de `index.html`).

## 3. ¿Redatar por la eco?  (`calcRedatar`)

Criterio ACOG / AIUM / SMFM (Committee Opinion 700, 2017; reafirmado 2021). Se redata
por la ecografía si `|FPP_FUR − FPP_eco|` supera el umbral del rango de EG por eco al
momento del estudio:

| EG por eco al estudio | Umbral |
|---|---|
| ≤ 8 sem 6 d (≤ 62 d) | 5 días |
| 9 sem 0 d – 15 sem 6 d | 7 días |
| 16 sem 0 d – 21 sem 6 d | 10 días |
| 22 sem 0 d – 27 sem 6 d | 14 días |
| ≥ 28 sem 0 d | 21 días |

---

## 4. Biometría fetal — percentiles INTERGROWTH-21st  (`CALC_IG`, `calcBiometriaPct`)

Papageorghiou AT, et al. *Lancet* 2014;384:869–879. Distribución **normal** (sin asimetría):
`z = (medida − mediana) / DE`, `percentil = Φ(z)`. Válido **GA 14–40 sem**.
Ecuaciones tomadas del paquete R `nutriverse/intergrowth`
(`R/03-calculate_fetal_growth.R`), verificadas contra las tablas oficiales.

```
DBP  mediana = 5.60878 + 0.158369·GA² − 0.00256379·GA³
     DE      = exp(0.101242 + 0.00150557·GA³ − 0.000771535·GA³·ln(GA) + 0.0000999638·GA³·ln(GA)²)

CC   mediana = −28.2849 + 1.69267·GA² − 0.397485·GA²·ln(GA)
     DE      = 1.98735 + 0.0136772·GA³ − 0.00726264·GA³·ln(GA) + 0.000976253·GA³·ln(GA)²

CA   mediana = −81.3243 + 11.6772·GA − 0.000561865·GA³
     DE      = −4.36302 + 0.121445·GA² − 0.0130256·GA³ + 0.00282143·GA³·ln(GA)

LF   mediana = −39.9616 + 4.32298·GA − 0.0380156·GA²
     DE      = exp(0.605843 − 42.0014·GA⁻² + 0.00000917972·GA³)
```

## 5. Peso fetal estimado (PFE)

### Hadlock 1985  (`calcHadlockEFW`)  — entradas en cm
Hadlock FP, et al. *Am J Obstet Gynecol* 1985;151:333–337. Elige variante según qué medidas haya:

```
DBP+CC+CA+LF : log₁₀(PFE) = 1.3596 + 0.0064·CC + 0.0424·CA + 0.174·LF + 0.00061·DBP·CA − 0.00386·CA·LF
CC+CA+LF     : log₁₀(PFE) = 1.326 − 0.00326·CA·LF + 0.0107·CC + 0.0438·CA + 0.158·LF
DBP+CA+LF    : log₁₀(PFE) = 1.335 − 0.0034·CA·LF + 0.0316·DBP + 0.0457·CA + 0.1623·LF
CA+LF        : log₁₀(PFE) = 1.304 + 0.05281·CA + 0.1938·LF − 0.004·CA·LF
```

### INTERGROWTH-21st / Stirnemann 2017  (`calcIntergrowthEFW`)  — CA y CC en cm
Stirnemann J, et al. *Ultrasound Obstet Gynecol* 2017;49:478–486.
```
ln(PFE) = 5.084820 − 54.06633·(CA/100)³ − 95.80076·(CA/100)³·ln(CA/100) + 3.136370·(CC/100)
```

## 6. Percentiles y z-score del PFE — INTERGROWTH-21st  (`calcEFWpct`)

Stirnemann 2017, Tabla 2. Método LMS (Box–Cox) sobre `Y = ln(PFE)`. Válido **GA 22–40 sem**.
```
μ(GA) = 4.956737 + 0.0005019687·GA³ − 0.0001227065·GA³·ln(GA)
σ(GA) = 10⁻⁴ · (−6.997171 + 0.057559·GA³ − 0.01493946·GA³·ln(GA))
λ(GA) = −4.257629 − 2162.234·GA⁻² + 0.0002301829·GA³

z            = [ (Y/μ)^λ − 1 ] / (σ·λ)                          (λ ≠ 0)
percentil_αg = exp( μ · [ z_α·σ·λ + 1 ]^(1/λ) )                 (z_α = cuantil normal de α)
```

## 7. Clasificación por percentil de PFE

`< p3` PEG severo · `< p10` PEG · `p10–p90` AEG · `> p90` GEG · `> p97` GEG severo.

---

## Anclas de validación (tablas oficiales, © University of Oxford)

**PFE INTERGROWTH-21st** (`GROW_EFW_ct_Table_values.pdf`):

| GA | p3 | p10 | p50 | p90 | p97 |
|----|----|-----|-----|-----|-----|
| 22 | 463 | 481 | 525 | 578 | 607 |
| 30 | 1106 | 1190 | 1396 | 1647 | 1783 |
| 33 | 1495 | 1630 | 1954 | 2332 | 2529 |
| 40 | 2574 | 2818 | 3338 | 3858 | 4101 |

**Biometría INTERGROWTH-21st, p50 (mm)** — `GROW_Fetal-ct_*_Table.pdf`:

| GA | DBP | CC | CA | LF |
|----|-----|-----|-----|-----|
| 20 | 48.4 | 172.5 | 147.7 | 31.3 |
| 33 | 85.9 | 301.5 | 283.8 | 61.3 |
| 40 | 94.9 | 333.9 | 349.8 | 72.1 |

Biometría p3 / p97 en GA 33: DBP 79.8 / 92.0 · CC 283.0 / 320.0 · CA 256.9 / 310.7 · LF 56.7 / 65.9.

El modelo paramétrico reproduce todas estas tablas con error ≤ 0.2 unidades (PFE ≤ 2 g).
