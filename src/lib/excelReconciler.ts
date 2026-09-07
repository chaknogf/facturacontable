/**
 * excelReconciler — Motor 100% client-side para conciliar CSV/XLSX
 * Usa xlsx (SheetJS) + papaparse, sin enviar datos a servidor.
 */
import * as XLSX from "xlsx";
import Papa from "papaparse";

export type ParsedFile = {
  filename: string;
  headers: string[];
  rows: Record<string, string>[];
  rawRows: string[][];
};

export type ConciliacionResult = {
  conciliados: Record<string, any>[];
  diferencias: Record<string, any>[];
  pendientes: Record<string, any>[];
  stats: {
    totalA: number;
    totalB: number;
    conciliadosCount: number;
    diferenciasCount: number;
    pendientesCount: number;
    montoConciliado: number;
    montoDiferencias: number;
    montoPendientesA: number;
    montoPendientesB: number;
  };
};

// ── Normalización ───────────────────────────────────────────────

export function normalizeKey(value: unknown): string {
  return String(value ?? "").trim();
}

export function parseAmount(value: unknown): number {
  if (value == null || value === "") return NaN;
  let s = String(value).trim();
  // Elimina símbolos de moneda comunes Q $ y espacios, deja dígitos, punto, coma, signo menos
  // Q1,234.56 -> 1234.56
  s = s.replace(/[Qq\$\s]/g, "");
  // Si contiene tanto coma como punto, asume coma = miles
  // Si solo coma y punto no existe, puede ser decimal con coma (GT usa punto, pero toleramos)
  if (s.includes(",") && !s.includes(".")) {
    // 1234,56 -> 1234.56 pero 1,234 -> 1234 (si no hay decimales)
    // Heurística: si última coma seguida de 2 dígitos => decimal
    const parts = s.split(",");
    const last = parts[parts.length - 1];
    if (last.length === 2 && /^\d+$/.test(last)) {
      s = parts.slice(0, -1).join("") + "." + last;
    } else {
      s = s.replace(/,/g, "");
    }
  } else {
    s = s.replace(/,/g, "");
  }
  s = s.replace(/[^0-9.\-]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}

export function formatGTQ(n: number): string {
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ", minimumFractionDigits: 2 }).format(n);
}

// ── Parsing ─────────────────────────────────────────────────────

function parseCSVText(text: string): string[][] {
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: "greedy",
    trimHeaders: false,
  });
  // Papa puede devolver arrays vacíos; filtrar filas totalmente vacías
  const rows = (result.data as string[][]).filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  return rows as string[][];
}

function rowsToParsed(filename: string, raw: string[][]): ParsedFile {
  if (raw.length === 0) return { filename, headers: [], rows: [], rawRows: [] };
  // headers = primera fila con trim y filtrando vacíos finales
  const headers = raw[0].map((h) => String(h ?? "").trim()).filter((h) => h !== "");
  // Si headers vacíos, genera Col1, Col2...
  const finalHeaders = headers.length ? headers : raw[0].map((_, i) => `Col${i + 1}`);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i];
    if (r.every((c) => String(c ?? "").trim() === "")) continue;
    const obj: Record<string, string> = {};
    finalHeaders.forEach((h, idx) => {
      obj[h] = String(r[idx] ?? "").trim();
    });
    rows.push(obj);
  }
  return { filename, headers: finalHeaders, rows, rawRows: raw };
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "csv" || file.type.includes("csv") || ext === "txt") {
    const text = await file.text();
    const raw = parseCSVText(text);
    return rowsToParsed(file.name, raw);
  }
  // XLSX / XLS — usa SheetJS
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", raw: false, codepage: 65001 });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) throw new Error(`El archivo ${file.name} no contiene hojas.`);
  const sheet = wb.Sheets[firstSheet];
  // sheet_to_json con header 1 para obtener matriz
  const raw = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "", raw: false }) as string[][];
  // Limpia filas vacías al final
  const cleaned = raw.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (cleaned.length === 0) throw new Error(`El archivo ${file.name} está vacío.`);
  return rowsToParsed(file.name, cleaned);
}

// ── Algoritmo de cruce ──────────────────────────────────────────

export function reconcile(
  dataA: ParsedFile,
  dataB: ParsedFile,
  keyA: string,
  keyB: string,
  montoA: string,
  montoB: string,
  tolerance = 0.01
): ConciliacionResult {
  // Map B por clave normalizada -> lista de filas (para duplicados)
  const mapB = new Map<string, { row: Record<string, string>; idx: number; used: boolean }[]>();
  dataB.rows.forEach((row, idx) => {
    const k = normalizeKey(row[keyB]);
    if (!k) return;
    const list = mapB.get(k) ?? [];
    list.push({ row, idx, used: false });
    mapB.set(k, list);
  });

  const conciliados: Record<string, any>[] = [];
  const diferencias: Record<string, any>[] = [];
  const pendientes: Record<string, any>[] = [];

  let montoConciliado = 0;
  let montoDiferencias = 0;

  // Recorrer A
  dataA.rows.forEach((rowA, idxA) => {
    const k = normalizeKey(rowA[keyA]);
    const aMonto = parseAmount(rowA[montoA]);
    if (!k) {
      pendientes.push({
        Origen: "A — Sin clave",
        Clave: "(vacía)",
        Monto_A: rowA[montoA] ?? "",
        Monto_A_num: isNaN(aMonto) ? "" : aMonto,
        Archivo: dataA.filename,
        Fila: idxA + 2,
        ...rowA,
      });
      return;
    }
    const candidates = mapB.get(k);
    if (!candidates || candidates.length === 0) {
      pendientes.push({
        Origen: "A → no está en B",
        Clave: k,
        Monto_A: rowA[montoA] ?? "",
        Monto_A_num: isNaN(aMonto) ? "" : aMonto,
        Archivo: dataA.filename,
        Fila: idxA + 2,
        ...rowA,
      });
      return;
    }
    // Toma el primer candidato no usado; si todos usados, toma el primero (duplicado)
    let candidate = candidates.find((c) => !c.used) ?? candidates[0];
    candidate.used = true;
    const bMonto = parseAmount(candidate.row[montoB]);
    const diff = isNaN(aMonto) || isNaN(bMonto) ? NaN : Math.abs(aMonto - bMonto);
    const cuadran = !isNaN(diff) && diff < tolerance;

    if (cuadran) {
      montoConciliado += isNaN(aMonto) ? 0 : aMonto;
      conciliados.push({
        Clave: k,
        Monto_A: isNaN(aMonto) ? rowA[montoA] : aMonto,
        Monto_B: isNaN(bMonto) ? candidate.row[montoB] : bMonto,
        Diferencia: isNaN(diff) ? "" : Number(diff.toFixed(2)),
        Estado: "Conciliado",
        Archivo_A: dataA.filename,
        Fila_A: idxA + 2,
        Archivo_B: dataB.filename,
        Fila_B: candidate.idx + 2,
        _rowA: rowA,
        _rowB: candidate.row,
      });
    } else {
      montoDiferencias += 1;
      diferencias.push({
        Clave: k,
        Monto_A: isNaN(aMonto) ? rowA[montoA] : aMonto,
        Monto_B: isNaN(bMonto) ? candidate.row[montoB] : bMonto,
        Diferencia: isNaN(aMonto) || isNaN(bMonto) ? "Monto no numérico" : Number((aMonto - bMonto).toFixed(2)),
        Diferencia_abs: isNaN(diff) ? "" : Number(diff.toFixed(2)),
        Estado: "Diferencia de monto",
        Archivo_A: dataA.filename,
        Fila_A: idxA + 2,
        Archivo_B: dataB.filename,
        Fila_B: candidate.idx + 2,
        _rowA: rowA,
        _rowB: candidate.row,
      });
    }
  });

  // Pendientes que quedaron en B sin usar
  let montoPendientesA = 0;
  let montoPendientesB = 0;
  pendientes.forEach((p) => {
    const v = parseAmount(p.Monto_A ?? p.Monto_A_num);
    if (!isNaN(v)) montoPendientesA += v;
  });

  for (const [, list] of mapB) {
    for (const c of list) {
      if (!c.used) {
        const bMonto = parseAmount(c.row[montoB]);
        if (!isNaN(bMonto)) montoPendientesB += bMonto;
        pendientes.push({
          Origen: "B → no está en A",
          Clave: normalizeKey(c.row[keyB]),
          Monto_B: c.row[montoB] ?? "",
          Monto_B_num: isNaN(bMonto) ? "" : bMonto,
          Archivo: dataB.filename,
          Fila: c.idx + 2,
          ...c.row,
        });
      }
    }
  }

  // Si hay pendientes de A con monto, ya sumado; falta sumar diff? ya
  const totalPendientes = pendientes.length;

  return {
    conciliados,
    diferencias,
    pendientes,
    stats: {
      totalA: dataA.rows.length,
      totalB: dataB.rows.length,
      conciliadosCount: conciliados.length,
      diferenciasCount: diferencias.length,
      pendientesCount: totalPendientes,
      montoConciliado,
      montoDiferencias: diferencias.length,
      montoPendientesA,
      montoPendientesB,
    },
  };
}

// ── Generación XLSX ─────────────────────────────────────────────

function cleanForSheet(rows: Record<string, any>[]): Record<string, any>[] {
  // Elimina claves internas _rowA/_rowB y normaliza
  return rows.map((r) => {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(r)) {
      if (k.startsWith("_")) continue;
      out[k] = v;
    }
    return out;
  });
}

export function buildWorkbook(result: ConciliacionResult): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const wsConciliados = XLSX.utils.json_to_sheet(cleanForSheet(result.conciliados));
  const wsDiferencias = XLSX.utils.json_to_sheet(cleanForSheet(result.diferencias));
  const wsPendientes = XLSX.utils.json_to_sheet(cleanForSheet(result.pendientes));

  // Ancho de columnas auto (aprox)
  [wsConciliados, wsDiferencias, wsPendientes].forEach((ws) => {
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    const cols: { wch: number }[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      let max = 10;
      for (let r = range.s.r; r <= range.e.r; r++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (cell?.v != null) {
          const len = String(cell.v).length;
          if (len > max) max = Math.min(32, len);
        }
      }
      cols.push({ wch: max + 2 });
    }
    ws["!cols"] = cols;
  });

  XLSX.utils.book_append_sheet(wb, wsConciliados, "Conciliados");
  XLSX.utils.book_append_sheet(wb, wsDiferencias, "Diferencias_Monto");
  XLSX.utils.book_append_sheet(wb, wsPendientes, "Pendientes");

  // Hoja Resumen extra
  const resumen = [
    { Métrica: "Total registros Archivo A", Valor: result.stats.totalA },
    { Métrica: "Total registros Archivo B", Valor: result.stats.totalB },
    { Métrica: "Conciliados (clave + monto cuadran)", Valor: result.stats.conciliadosCount },
    { Métrica: "Diferencias de monto", Valor: result.stats.diferenciasCount },
    { Métrica: "Pendientes / No encontrados", Valor: result.stats.pendientesCount },
    { Métrica: "Monto conciliado (GTQ)", Valor: result.stats.montoConciliado },
  ];
  const wsResumen = XLSX.utils.json_to_sheet(resumen);
  wsResumen["!cols"] = [{ wch: 38 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

  return wb;
}

export function downloadWorkbook(wb: XLSX.WorkBook, filename = "conciliacion.xlsx"): void {
  XLSX.writeFile(wb, filename);
}
