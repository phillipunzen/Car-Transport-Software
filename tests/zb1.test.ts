import { describe, expect, it } from "vitest";
import { parseVehicleText } from "../src/lib/ocr-parse";

// Typische OCR-Ausgaben (Tesseract) echter Zulassungsbescheinigungen Teil I:
// Tabellenlinien als "|", Feldnummern teils verschluckt/verfälscht, Störtext der
// mehrsprachigen Vordruckzeilen, linke und rechte Seite als eigene Blöcke.

const mazda = `Zulassungsbescheinigung Teil I
(Fahrzeugschein)
Nr. A-K-0-181/22-
Europäische Bundesrepublik
Gemeinschaft Deutschland
Cenpaoynencreo sa pernctpauna - Yact | / Permiso de circulacién. Parte |
A Amtliches Kennzeichen
A NW2000
C.1.1 Name oder Firmenname
KRAMER
HANS GÜNTER
11.2022
GERSTHOFEN, Datum: 30.06.2022

| 07.12.2015 | 7118 |AGD00017 3
| M1 | 4 AC
| JMZKEN92800457123 | 3 | 0
| MAZDA
| GH
| N92
| 80E
| MAZDA CX-5
| MAZDA (J)
| FZ.Z.PERS.BEF.B. 8 SPL.
| KOMBILIMOUSINE
| 715/2007*136/2014W
| EURO6;W;PI/CI; M, N1 I
| DIESEL
| 0002 36W0 02191
| 0.1: 2100 BIS 8% STEIG.*STUFE PM 5 AB TAG ERSTZUL.*DAT
UM ZUR EMISSIONSKLASSE: 07.12.2015*
02 02 0129/04500 204
04540 - 04555 1840
1670 - 1710 001703
225/65R17 102V
17.08.2015 K WQ341047`;

const mercedes = `Zulassungsbescheinigung Teil I
(Fahrzeugschein)
Nr. SE-K-1-132/21-00000
A Amtliches Kennzeichen
SE AS12 E
C.1.1 Name oder Firmenname
Mustermann
Max
Musterstr. 32
12345 Musterstadt
05.2024 Norderstedt
12.05.2021

B 12.05.2021 2.1 2222 2.2 AJO00030 7
J M1 4 AA
E W1K1771463J314348 3 7
D.1 Mercedes-Benz
F2A
X08QT2
HZAA051B
D.3 A 250 e
2 Mercedes-Benz
5 Fz.z.Pers.bef.b. 8 Spl.
Limousine
715/2007*2018/1832AP
EURO6;WLTP;AP;PI/CI; M, N1 I
Hybr.B/E ext.aufl.
0025 36AP 01332
7.2/8.2:+95 B.ANH.BETR.*O.1:1800 BIS 8% STEIG.*BATTERI
225/40 R19 93W XL C C1
08.10.2020 17 K GC589034`;

// Ohne erkannte Feldnummern, Marke nur in Großbuchstaben, leicht verrauscht
const noisy = `ZULASSUNGSBESCHEINIGUNG TEIL I
SE-AS 12E
12.05.2021 2222 AJO00030 7
Ml AA
W1K1771463J314348 37
MERCEDES-BENZ
F2A
XO8QT2
HZAA051B
A 250 e
MERCEDES-BENZ
FZ.Z.PERS.BEF.B. 8 SPL.
EURO6;WLTP;AP`;

describe("Zulassungsbescheinigung Teil I", () => {
  it("Mazda CX-5 (Feldnummern von OCR verschluckt)", () => {
    const v = parseVehicleText(mazda);
    expect(v.licensePlate).toBe("A-NW 2000");
    expect(v.vin).toBe("JMZKEN92800457123");
    expect(v.make).toBe("Mazda");
    expect(v.model).toBe("CX-5");
    expect(v.firstRegistration).toBe("07.12.2015");
  });

  it("Mercedes-Benz A 250 e mit E-Kennzeichen", () => {
    const v = parseVehicleText(mercedes);
    expect(v.licensePlate).toBe("SE-AS 12E");
    expect(v.vin).toBe("W1K1771463J314348");
    expect(v.make).toBe("Mercedes-Benz");
    expect(v.model).toBe("A 250 e");
    expect(v.firstRegistration).toBe("12.05.2021");
  });

  it("verrauschte Ausgabe ohne Feldnummern", () => {
    const v = parseVehicleText(noisy);
    expect(v.licensePlate).toBe("SE-AS 12E");
    expect(v.vin).toBe("W1K1771463J314348");
    expect(v.make).toBe("Mercedes-Benz");
    expect(v.model).toBe("A 250 e");
    expect(v.firstRegistration).toBe("12.05.2021");
  });
});

describe("Zulassungsbescheinigung – Randfälle", () => {
  it("D.1 nicht gelesen: erste Markenzeile ist die Handelsbezeichnung", () => {
    const v = parseVehicleText(`(A NW2000 |
07.12.2015 7118 AGD00017 3
JMZKEN92800457123 0
GH
°* \\MAZDA CX-5 .
* \\MAZDA (3) ;
FZ.Z.PERS.BEF.B. 8 SPL.`);
    expect(v.licensePlate).toBe("A-NW 2000");
    expect(v.make).toBe("Mazda");
    expect(v.model).toBe("CX-5");
  });
  it("verwirft Feldnummern und unplausible Daten", () => {
    const v = parseVehicleText(`ZULASSUNGSBESCHEINIGUNG
97.12.2015 7118 AGD00017
MAZDA
GH
N92
80E
03
MAZDA`);
    expect(v.model).toBeNull();
    expect(v.firstRegistration).toBeNull();
  });
  it("erkennt keine FIN aus langen Wörtern", () => {
    const v = parseVehicleText("ZULASSUNGSBESCHEINIGUNGTEIL1\nKOMBILIMOUSINE");
    expect(v.vin).toBeNull();
  });
});

describe("Kennzeichen im Fahrzeugschein", () => {
  it("ignoriert Fehltreffer mit Kleinbuchstaben aus anderen Feldern", () => {
    const v = parseVehicleText("ZULASSUNGSBESCHEINIGUNG TEIL I\nA Ta222  _” ]A3000030 7\nW1K1771463J314348 3 7");
    expect(v.licensePlate).toBeNull();
  });
});
