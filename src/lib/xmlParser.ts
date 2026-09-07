/**
 * xmlParser — Parser UBL universal multi-país (100% client-side)
 * Soporta: GT (SAT/FEL), MX (CFDI), CO (DIAN), PE (SUNAT), EC (SRI), LATAM Genérico
 * Detecta país por namespace / nodo raíz; fallback a selección manual del switch.
 */

export type CountryId = 'gt' | 'mx' | 'co' | 'pe' | 'ec' | 'latam';

export type CountryConfig = {
  id: CountryId;
  flag: string;
  label: string; // "Guatemala (SAT/FEL)"
  shortLabel: string; // "Guatemala"
  ente: string; // SAT, SAT CFDI, DIAN, SUNAT, SRI
  currency: string; // símbolo Q, $, S/
  currencyCode: string; // GTQ, MXN, COP, PEN, USD
  taxLabel: string; // IVA 12%, IVA 16%, IGV 18%, etc.
  idLabel: string; // NIT, RFC, RUC
  idLabelReceptor: string;
  exampleId: string;
  namespaces: string[]; // para detección
  rootHints: string[]; // nodos raíz
};

export const COUNTRY_CONFIGS: Record<CountryId, CountryConfig> = {
  gt: {
    id: 'gt',
    flag: '🇬🇹',
    label: 'Guatemala (SAT/FEL)',
    shortLabel: 'Guatemala',
    ente: 'SAT / FEL',
    currency: 'Q',
    currencyCode: 'GTQ',
    taxLabel: 'IVA 12% / 5% Peq.',
    idLabel: 'NIT',
    idLabelReceptor: 'NIT',
    exampleId: '1234567-8',
    namespaces: ['http://www.sat.gob.gt/dte/fel/0.1.0', 'http://www.sat.gob.gt', 'dte.sat.gob.gt', 'GTDocumento'],
    rootHints: ['GTDocumento', 'DatosGenerales', 'DTE'],
  },
  mx: {
    id: 'mx',
    flag: '🇲🇽',
    label: 'México (CFDI)',
    shortLabel: 'México',
    ente: 'SAT CFDI',
    currency: '$',
    currencyCode: 'MXN',
    taxLabel: 'IVA 16%',
    idLabel: 'RFC',
    idLabelReceptor: 'RFC',
    exampleId: 'XAXX010101000',
    namespaces: ['http://www.sat.gob.mx/cfd/4', 'http://www.sat.gob.mx/cfd/3', 'http://www.sat.gob.mx/TimbreFiscalDigital', 'cfdi:Comprobante', 'cfdi'],
    rootHints: ['Comprobante', 'cfdi:Comprobante', 'Conceptos'],
  },
  co: {
    id: 'co',
    flag: '🇨🇴',
    label: 'Colombia (DIAN)',
    shortLabel: 'Colombia',
    ente: 'DIAN',
    currency: '$',
    currencyCode: 'COP',
    taxLabel: 'IVA 19%',
    idLabel: 'NIT',
    idLabelReceptor: 'NIT',
    exampleId: '900123456-1',
    namespaces: ['urn:oasis:names:specification:ubl:schema:xsd:Invoice-2', 'dian:gov:co', 'Invoice'],
    rootHints: ['Invoice', 'cbc:ID', 'AccountingSupplierParty'],
  },
  pe: {
    id: 'pe',
    flag: '🇵🇪',
    label: 'Perú (SUNAT)',
    shortLabel: 'Perú',
    ente: 'SUNAT',
    currency: 'S/',
    currencyCode: 'PEN',
    taxLabel: 'IGV 18%',
    idLabel: 'RUC',
    idLabelReceptor: 'RUC',
    exampleId: '20123456789',
    namespaces: ['urn:sunat:names:specification:ubl:peru:schema', 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2', 'Invoice'],
    rootHints: ['Invoice', 'cbc:ID', 'AccountingSupplierParty'],
  },
  ec: {
    id: 'ec',
    flag: '🇪🇨',
    label: 'Ecuador (SRI)',
    shortLabel: 'Ecuador',
    ente: 'SRI',
    currency: '$',
    currencyCode: 'USD',
    taxLabel: 'IVA 15%',
    idLabel: 'RUC',
    idLabelReceptor: 'RUC',
    exampleId: '1790011223001',
    namespaces: ['autorizacion', 'factura', 'infoTributaria', 'infoFactura', 'sri.gob.ec'],
    rootHints: ['autorizacion', 'factura', 'infoTributaria'],
  },
  latam: {
    id: 'latam',
    flag: '🌎',
    label: 'General (UBL LATAM)',
    shortLabel: 'LATAM',
    ente: 'UBL 2.1',
    currency: '$',
    currencyCode: 'USD',
    taxLabel: 'IVA',
    idLabel: 'NIT/RUC',
    idLabelReceptor: 'NIT/RUC',
    exampleId: '—',
    namespaces: ['urn:oasis:names:specification:ubl', 'Invoice', 'CreditNote'],
    rootHints: ['Invoice', 'CreditNote', 'DespatchAdvice'],
  },
};

export type Item = { descripcion: string; cantidad: string; precio: string; total: string; unidad?: string };

export type Factura = {
  fileName: string;
  country: CountryId;
  ente: string;
  // Identificación
  emisorNombre?: string;
  emisorId?: string; // NIT/RFC/RUC según país
  emisorIdLabel?: string;
  receptorNombre?: string;
  receptorId?: string;
  receptorIdLabel?: string;
  emisorDireccion?: string;
  receptorDireccion?: string;
  // Folio
  serie?: string;
  numero?: string;
  folioFiscal?: string; // UUID / Número Autorización / CUFE
  fechaEmision?: string;
  // Montos
  moneda?: string;
  currencySymbol?: string;
  granTotal?: string;
  subTotal?: string;
  iva?: string;
  taxLabel?: string;
  items: Item[];
  rawXml?: string;
  // legacy alias para compat con pdf anterior
  emisorNIT?: string;
  receptorNIT?: string;
  numeroAcceso?: string;
};

// -------- helpers --------

function textByTag(doc: Document, localName: string): string | undefined {
  const els = doc.getElementsByTagNameNS('*', localName);
  if (els.length) return els[0].textContent?.trim() || undefined;
  const els2 = doc.getElementsByTagName(localName);
  if (els2.length) return els2[0].textContent?.trim() || undefined;
  return undefined;
}

function attrByTag(doc: Document, localName: string, attr: string): string | undefined {
  const els = doc.getElementsByTagNameNS('*', localName);
  if (els.length) return els[0].getAttribute(attr) ?? undefined;
  const els2 = doc.getElementsByTagName(localName);
  if (els2.length) return els2[0].getAttribute(attr) ?? undefined;
  return undefined;
}

function getAttr(el: Element | undefined, name: string): string | undefined {
  return el?.getAttribute(name) ?? undefined;
}

function allByTag(doc: Document, localName: string): Element[] {
  const a = Array.from(doc.getElementsByTagNameNS('*', localName) as unknown as Element[]);
  if (a.length) return a;
  return Array.from(doc.getElementsByTagName(localName) as unknown as Element[]);
}

function childText(el: Element, localName: string): string | undefined {
  const ns = el.getElementsByTagNameNS('*', localName)[0];
  if (ns?.textContent?.trim()) return ns.textContent.trim();
  const plain = (el as any).getElementsByTagName?.(localName)?.[0] as Element | undefined;
  return plain?.textContent?.trim() || undefined;
}

function getAttrCI(el: Element | undefined, names: string[]): string | undefined {
  if (!el) return undefined;
  for (const n of names) {
    const v = el.getAttribute(n) ?? el.getAttribute(n.toLowerCase()) ?? el.getAttribute(n.toUpperCase());
    if (v != null && v !== '') return v;
  }
  return undefined;
}

// -------- detección automática --------

export function detectCountry(xmlText: string, doc: Document): CountryId | null {
  const t = xmlText.toLowerCase();
  // GT
  if (t.includes('http://www.sat.gob.gt') || t.includes('gtdocumento') || t.includes('datosgenerales') && t.includes('nitemisor')) return 'gt';
  // MX — CFDI tiene cfdi:Comprobante y timbre
  if (t.includes('cfdi:comprobante') || t.includes('http://www.sat.gob.mx/cfd') || t.includes('timbrefiscaldigital') || t.includes('cfdi:emisor') && t.includes('rfc')) return 'mx';
  // EC SRI — autorizacion / factura / infoTributaria
  if (t.includes('<autorizacion') || (t.includes('infotributaria') && t.includes('ruc')) || t.includes('sri.gob.ec')) return 'ec';
  // CO/PE/LATAM UBL — Invoice con cac:AccountingSupplierParty
  // Heurística para PE: contiene urn:sunat
  if (t.includes('sunat') || t.includes('urn:sunat')) return 'pe';
  if (t.includes('dian') || (t.includes('cbc:id') && t.includes('accountingsupplierparty') && t.includes('cop'))) return 'co';
  // UBL genérico
  if (t.includes('<invoice') || t.includes('urn:oasis:names:specification:ubl')) {
    // decide entre col/pe/latam por idioma? fallback latam
    return 'latam';
  }
  return null;
}

// -------- parsers específicos --------

function parseGuatemala(doc: Document, xmlText: string, fileName: string): Factura {
  const datosGenerales = allByTag(doc, 'DatosGenerales')[0];
  const emisorEl = allByTag(doc, 'Emisor')[0];
  const receptorEl = allByTag(doc, 'Receptor')[0];
  const totalesEl = allByTag(doc, 'Totales')[0];
  const granTotal = getAttr(totalesEl, 'GranTotal') ?? attrByTag(doc, 'Totales', 'GranTotal') ?? textByTag(doc, 'GranTotal');
  const items: Item[] = [];
  const itemNodes = allByTag(doc, 'Item');
  const fallback = itemNodes.length ? itemNodes : allByTag(doc, 'Detalle');
  for (let i = 0; i < fallback.length; i++) {
    const it = fallback[i] as Element;
    // Solo procesa Item con atributos FEL
    if (it.tagName.toLowerCase().includes('detalle') && !it.hasAttribute('Descripcion') && !it.hasAttribute('descripcion')) {
      const txt = it.textContent?.trim();
      if (txt) items.push({ descripcion: txt.slice(0, 100), cantidad: '1', precio: '', total: '' });
      continue;
    }
    const desc = getAttrCI(it, ['Descripcion', 'descripcion', 'Description', 'Concepto']) ?? childText(it, 'Descripcion') ?? childText(it, 'descripcion') ?? it.textContent?.trim().slice(0, 80) ?? `Item ${i + 1}`;
    const cantidad = getAttrCI(it, ['Cantidad', 'cantidad', 'Quantity', 'InvoicedQuantity']) ?? childText(it, 'Cantidad') ?? childText(it, 'cantidad') ?? '1';
    let precio = getAttrCI(it, ['Precio', 'PrecioUnitario', 'ValorUnitario', 'Price', 'UnitPrice']) ?? childText(it, 'Precio') ?? childText(it, 'PrecioUnitario') ?? childText(it, 'ValorUnitario') ?? childText(it, 'PriceAmount') ?? '';
    let total = getAttrCI(it, ['Total', 'Importe', 'Monto', 'LineExtensionAmount']) ?? childText(it, 'Total') ?? childText(it, 'Importe') ?? childText(it, 'Monto') ?? '';
    // Fallback: si total vacío pero precio existe, calcula total = cantidad * precio
    if (!total && precio) total = precio;
    if (!total && precio && cantidad) {
      const p = parseFloat(String(precio).replace(',', '.').replace(/[^0-9.\-]/g, ''));
      const c = parseFloat(String(cantidad).replace(',', '.'));
      if (!isNaN(p) && !isNaN(c)) total = (p * c).toFixed(2);
    }
    // Fallback: si precio vacío pero total existe, usa total como precio unitario
    if (!precio && total) precio = total;
    if (!desc && !precio && !total) continue;
    items.push({ descripcion: desc, cantidad, precio, total, unidad: getAttrCI(it, ['UnidadMedida', 'BienOServicio', 'Unit']) ?? childText(it, 'UnidadMedida') });
  }
  const emisorNombre = getAttr(emisorEl, 'NombreComercial') ?? getAttr(emisorEl, 'Nombre') ?? getAttr(emisorEl, 'NombreEmisor') ?? '—';
  const emisorNIT = getAttr(emisorEl, 'NITEmisor') ?? getAttr(emisorEl, 'NIT') ?? attrByTag(doc, 'Emisor', 'NITEmisor') ?? '—';
  const receptorNombre = getAttr(receptorEl, 'NombreReceptor') ?? getAttr(receptorEl, 'Nombre') ?? attrByTag(doc, 'Receptor', 'NombreReceptor') ?? '—';
  const receptorNIT = getAttr(receptorEl, 'IDReceptor') ?? getAttr(receptorEl, 'NITReceptor') ?? getAttr(receptorEl, 'NIT') ?? '—';
  // Detección IVA Guatemala: 12% general vs 5% pequeño contribuyente vs exento
  const ivaRaw = getAttr(totalesEl, 'TotalImpuestos') ?? attrByTag(doc, 'Totales', 'TotalImpuestos') ?? textByTag(doc, 'TotalImpuestos') ?? getAttr(totalesEl, 'GranTotal') ? undefined : undefined;
  const lower = xmlText.toLowerCase();
  let taxLabel: string = COUNTRY_CONFIGS.gt.taxLabel;
  const isPeqText = lower.includes('pequeño contribuyente') || lower.includes('pequeno contribuyente') || lower.includes('fpeq') || (lower.includes('afiliacioniva') && lower.includes('peq')) || lower.includes('pequeño');
  const hasFrasePeq = xmlText.includes('CodigoEscenario="4"') || xmlText.includes("TipoFrase=\"4\"") || xmlText.includes('tipoFrase="4"');
  const ivaZero = ivaRaw === '0' || ivaRaw === '0.00' || ivaRaw === '0.0';
  // Busca nodos Impuesto con tasa explícita
  const impuestoNodes = [...allByTag(doc, 'Impuesto'), ...allByTag(doc, 'Impuestos')];
  let tasaDetectada: string | null = null;
  for (const n of impuestoNodes) {
    const txt = (n.textContent ?? '').toLowerCase();
    const nombre = (n.getAttribute('NombreCorto') ?? n.getAttribute('Nombre') ?? '').toLowerCase();
    const combined = txt + ' ' + nombre;
    if (combined.includes('5%') || combined.includes('pequeño')) tasaDetectada = '5% Pequeño Contribuyente';
    else if (combined.includes('12%')) tasaDetectada = 'IVA 12%';
    else if (combined.includes('exento')) tasaDetectada = 'Exento';
  }
  if (tasaDetectada) taxLabel = tasaDetectada;
  else if (isPeqText || hasFrasePeq) taxLabel = '5% Pequeño Contribuyente';
  else if (ivaZero && lower.includes('exento')) taxLabel = 'Exento';
  else if (ivaZero && isPeqText) taxLabel = '5% Pequeño Contribuyente';
  else taxLabel = 'IVA 12%';

  // Si el XML trae frases SAT con tipo 1 escenario 1 = general 12%, tipo 4 = peq 5%
  // Frase tipo 1: "Sujeto a pagos trimestrales" (general), tipo 2/3/4 son variantes peq

  return {
    fileName, country: 'gt', ente: COUNTRY_CONFIGS.gt.ente,
    emisorNombre, emisorId: emisorNIT, emisorIdLabel: 'NIT', receptorNombre, receptorId: receptorNIT, receptorIdLabel: 'NIT',
    emisorNIT, receptorNIT,
    emisorDireccion: getAttr(emisorEl, 'Direccion') ?? textByTag(doc, 'Direccion'),
    receptorDireccion: getAttr(receptorEl, 'Direccion'),
    serie: getAttr(datosGenerales, 'Serie'), numero: getAttr(datosGenerales, 'Numero'),
    folioFiscal: getAttr(datosGenerales, 'NumeroAcceso') ?? attrByTag(doc, 'DatosGenerales', 'NumeroAcceso'), numeroAcceso: getAttr(datosGenerales, 'NumeroAcceso'),
    fechaEmision: getAttr(datosGenerales, 'FechaHoraEmision'),
    moneda: getAttr(datosGenerales, 'CodigoMoneda') ?? 'GTQ', currencySymbol: 'Q',
    granTotal: granTotal ?? '—', iva: ivaRaw ?? getAttr(totalesEl, 'TotalImpuestos'), taxLabel,
    items: items.length ? items : [{ descripcion: 'Detalle no desglosado', cantidad: '1', precio: granTotal ?? '', total: granTotal ?? '' }],
    rawXml: xmlText.slice(0, 4000),
  };
}

function parseMexico(doc: Document, xmlText: string, fileName: string): Factura {
  const comp = allByTag(doc, 'Comprobante')[0];
  const emisorEl = allByTag(doc, 'Emisor')[0];
  const receptorEl = allByTag(doc, 'Receptor')[0];
  const timbre = allByTag(doc, 'TimbreFiscalDigital')[0];
  const uuid = getAttr(timbre, 'UUID') ?? attrByTag(doc, 'TimbreFiscalDigital', 'UUID');
  const conceptos = allByTag(doc, 'Concepto');
  const items: Item[] = [];
  for (let i = 0; i < conceptos.length; i++) {
    const c = conceptos[i] as Element;
    const desc = getAttrCI(c, ['Descripcion', 'Descripción', 'description']) ?? childText(c, 'Descripcion') ?? childText(c, 'Concepto') ?? `Concepto ${i + 1}`;
    const cant = getAttrCI(c, ['Cantidad', 'cantidad']) ?? childText(c, 'Cantidad') ?? '1';
    let precio = getAttrCI(c, ['ValorUnitario', 'Precio', 'PrecioUnitario', 'UnitPrice']) ?? childText(c, 'ValorUnitario') ?? childText(c, 'Precio') ?? '';
    let total = getAttrCI(c, ['Importe', 'Total', 'Monto']) ?? childText(c, 'Importe') ?? childText(c, 'Total') ?? '';
    if (!total && precio) total = precio;
    if (!total && precio && cant) {
      const p = parseFloat(String(precio).replace(/[^0-9.\-]/g, ''));
      const q = parseFloat(String(cant).replace(/[^0-9.\-]/g, ''));
      if (!isNaN(p) && !isNaN(q)) total = (p * q).toFixed(2);
    }
    if (!precio && total) precio = total;
    items.push({ descripcion: desc, cantidad: cant, precio, total, unidad: getAttrCI(c, ['Unidad', 'ClaveUnidad', 'UnidadMedida']) ?? childText(c, 'Unidad') });
  }
  const total = getAttr(comp, 'Total') ?? attrByTag(doc, 'Comprobante', 'Total') ?? textByTag(doc, 'Total');
  const subTotal = getAttr(comp, 'SubTotal');
  const impuestosEl = allByTag(doc, 'Impuestos')[0];
  const iva = getAttr(impuestosEl, 'TotalImpuestosTrasladados') ?? textByTag(doc, 'TotalImpuestosTrasladados');
  return {
    fileName, country: 'mx', ente: COUNTRY_CONFIGS.mx.ente,
    emisorNombre: getAttr(emisorEl, 'Nombre') ?? getAttr(emisorEl, 'Rfc') ?? '—',
    emisorId: getAttr(emisorEl, 'Rfc') ?? '—', emisorIdLabel: 'RFC',
    receptorNombre: getAttr(receptorEl, 'Nombre') ?? getAttr(receptorEl, 'Rfc') ?? '—',
    receptorId: getAttr(receptorEl, 'Rfc') ?? '—', receptorIdLabel: 'RFC',
    emisorNIT: getAttr(emisorEl, 'Rfc'), receptorNIT: getAttr(receptorEl, 'Rfc'),
    serie: getAttr(comp, 'Serie'), numero: getAttr(comp, 'Folio'),
    folioFiscal: uuid, fechaEmision: getAttr(comp, 'Fecha'),
    moneda: getAttr(comp, 'Moneda') ?? 'MXN', currencySymbol: '$',
    granTotal: total ?? '—', subTotal, iva, taxLabel: COUNTRY_CONFIGS.mx.taxLabel,
    items: items.length ? items : [{ descripcion: 'Conceptos no desglosados', cantidad: '1', precio: total ?? '', total: total ?? '' }],
    rawXml: xmlText.slice(0, 4000),
  };
}

function textFromUblParty(party: Element | undefined): { nombre?: string; id?: string } {
  if (!party) return {};
  // cbc:ID dentro de cac:PartyId, o cbc:CompanyID, o cac:PartyName
  const id = textByTag(party as unknown as Document, 'ID') ?? party.querySelector?.('ID')?.textContent?.trim();
  // fallback: busca CompanyID
  const companyId = allByTag(party as unknown as Document, 'CompanyID')[0]?.textContent?.trim();
  const nombre = allByTag(party as unknown as Document, 'RegistrationName')[0]?.textContent?.trim()
    ?? allByTag(party as unknown as Document, 'PartyName')[0]?.textContent?.trim()
    ?? party.textContent?.trim().slice(0, 60);
  return { nombre: nombre?.slice(0, 80) ?? '—', id: companyId ?? id ?? '—' };
}

function parseUBLGeneric(doc: Document, xmlText: string, fileName: string, country: CountryId): Factura {
  const cfg = COUNTRY_CONFIGS[country];
  // UBL Invoice
  const idEl = allByTag(doc, 'ID')[0];
  const issueDate = textByTag(doc, 'IssueDate');
  const issueTime = textByTag(doc, 'IssueTime');
  const supplierParty = allByTag(doc, 'AccountingSupplierParty')[0];
  const customerParty = allByTag(doc, 'AccountingCustomerParty')[0];
  const supplier = textFromUblParty(supplierParty);
  const customer = textFromUblParty(customerParty);
  // LegalMonetaryTotal
  const payableAmount = textByTag(doc, 'PayableAmount') ?? textByTag(doc, 'LineExtensionAmount') ?? attrByTag(doc, 'PayableAmount', 'PayableAmount');
  const taxTotal = textByTag(doc, 'TaxAmount') ?? allByTag(doc, 'TaxTotal')[0]?.textContent?.trim();
  const lines = allByTag(doc, 'InvoiceLine');
  // Fallback: algunos UBL usan CreditNoteLine
  const allLines = lines.length ? lines : allByTag(doc, 'CreditNoteLine');
  const items: Item[] = [];
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i] as Element;
    // Descripción: cbc:Description dentro de cac:Item
    const desc = childText(line, 'Description') ?? (() => {
      const itemEl = (line.getElementsByTagNameNS('*', 'Item')[0] ?? (line as any).getElementsByTagName?.('Item')?.[0]) as Element | undefined;
      return itemEl ? (childText(itemEl, 'Description') ?? childText(itemEl, 'Name') ?? itemEl.textContent?.trim().slice(0, 80)) : undefined;
    })() ?? `Línea ${i + 1}`;
    const qtyEl = (line.getElementsByTagNameNS('*', 'InvoicedQuantity')[0] ?? line.getElementsByTagNameNS('*', 'Quantity')[0] ?? line.getElementsByTagNameNS('*', 'CreditedQuantity')[0] ?? (line as any).getElementsByTagName?.('InvoicedQuantity')?.[0]) as Element | undefined;
    const qty = qtyEl?.textContent?.trim() ?? '1';
    // Precio unitario: cac:Price/cbc:PriceAmount
    let price = '';
    const priceContainer = line.getElementsByTagNameNS('*', 'Price')[0] as Element | undefined;
    if (priceContainer) {
      price = childText(priceContainer, 'PriceAmount') ?? priceContainer.textContent?.trim() ?? '';
    }
    if (!price) {
      const priceEl = line.getElementsByTagNameNS('*', 'PriceAmount')[0] as Element | undefined;
      price = priceEl?.textContent?.trim() ?? '';
    }
    if (!price) price = childText(line, 'PriceAmount') ?? '';
    // Total: cbc:LineExtensionAmount (total de línea)
    let total = childText(line, 'LineExtensionAmount') ?? '';
    if (!total) {
      const le = line.getElementsByTagNameNS('*', 'LineExtensionAmount')[0] as Element | undefined;
      total = le?.textContent?.trim() ?? '';
    }
    if (!total && price) total = price;
    if (!total && price && qty) {
      const p = parseFloat(price.replace(/[^0-9.\-]/g, ''));
      const q = parseFloat(qty.replace(/[^0-9.\-]/g, ''));
      if (!isNaN(p) && !isNaN(q)) total = (p * q).toFixed(2);
    }
    if (!price && total) price = total;
    const unidad = qtyEl?.getAttribute('unitCode') ?? qtyEl?.getAttribute('unitCodeListID') ?? undefined;
    items.push({ descripcion: desc?.slice(0, 80) ?? `Línea ${i+1}`, cantidad: qty, precio: price, total, unidad });
  }
  const folio = idEl?.textContent?.trim() ?? textByTag(doc, 'ID') ?? fileName.replace(/\.xml$/i, '');
  // intenta separar serie-numero
  let serie: string | undefined, numero: string | undefined;
  if (folio && folio.includes('-')) { const parts = folio.split('-'); serie = parts[0]; numero = parts.slice(1).join('-'); }
  else numero = folio;
  const moneda = allByTag(doc, 'PayableAmount')[0]?.getAttribute('currencyID') ?? allByTag(doc, 'DocumentCurrencyCode')[0]?.textContent?.trim() ?? cfg.currencyCode;
  return {
    fileName, country, ente: cfg.ente,
    emisorNombre: supplier.nombre ?? '—', emisorId: supplier.id ?? '—', emisorIdLabel: cfg.idLabel,
    receptorNombre: customer.nombre ?? '—', receptorId: customer.id ?? '—', receptorIdLabel: cfg.idLabelReceptor,
    emisorNIT: supplier.id, receptorNIT: customer.id,
    serie, numero, folioFiscal: folio, fechaEmision: issueDate ? (issueTime ? `${issueDate} ${issueTime}` : issueDate) : undefined,
    moneda, currencySymbol: cfg.currency, granTotal: payableAmount ?? '—', iva: taxTotal, taxLabel: cfg.taxLabel,
    items: items.length ? items : [{ descripcion: 'Detalle no desglosado', cantidad: '1', precio: payableAmount ?? '', total: payableAmount ?? '' }],
    rawXml: xmlText.slice(0, 4000),
  };
}

function parseEcuador(doc: Document, xmlText: string, fileName: string): Factura {
  const cfg = COUNTRY_CONFIGS.ec;
  // SRI: <autorizacion><comprobante><factura> o directo
  const autorizacionEl = allByTag(doc, 'autorizacion')[0];
  const numeroAutorizacion = textByTag(autorizacionEl as unknown as Document, 'numeroAutorizacion') ?? allByTag(doc, 'numeroAutorizacion')[0]?.textContent?.trim();
  // El comprobante viene como CDATA con XML escapado
  let innerDoc: Document | null = null;
  const comprobanteText = allByTag(doc, 'comprobante')[0]?.textContent?.trim();
  if (comprobanteText && comprobanteText.includes('<factura')) {
    try { innerDoc = new DOMParser().parseFromString(comprobanteText, 'application/xml'); } catch {}
  }
  const targetDoc = innerDoc ?? doc;
  const infoTrib = allByTag(targetDoc, 'infoTributaria')[0];
  const infoFact = allByTag(targetDoc, 'infoFactura')[0];
  const rucEmisor = textByTag(infoTrib as unknown as Document, 'ruc') ?? allByTag(targetDoc, 'ruc')[0]?.textContent?.trim();
  const razonEmisor = textByTag(infoTrib as unknown as Document, 'razonSocial') ?? allByTag(targetDoc, 'razonSocial')[0]?.textContent?.trim();
  const idComp = textByTag(infoFact as unknown as Document, 'identificacionComprador') ?? allByTag(targetDoc, 'identificacionComprador')[0]?.textContent?.trim();
  const razonComp = textByTag(infoFact as unknown as Document, 'razonSocialComprador') ?? allByTag(targetDoc, 'razonSocialComprador')[0]?.textContent?.trim();
  const serieComp = textByTag(infoFact as unknown as Document, 'estab') && textByTag(infoFact as unknown as Document, 'ptoEmi') && textByTag(infoFact as unknown as Document, 'secuencial')
    ? `${textByTag(infoFact as unknown as Document, 'estab')}-${textByTag(infoFact as unknown as Document, 'ptoEmi')}-${textByTag(infoFact as unknown as Document, 'secuencial')}`
    : allByTag(targetDoc, 'secuencial')[0]?.textContent?.trim();
  const fecha = textByTag(infoFact as unknown as Document, 'fechaEmision') ?? allByTag(targetDoc, 'fechaEmision')[0]?.textContent?.trim();
  const totalSin = textByTag(infoFact as unknown as Document, 'totalSinImpuestos');
  const importeTotal = textByTag(infoFact as unknown as Document, 'importeTotal') ?? allByTag(targetDoc, 'importeTotal')[0]?.textContent?.trim();
  const totalImpuestos = allByTag(targetDoc, 'totalConImpuestos')[0]?.textContent?.trim()?.slice(0, 20);
  // detalles
  const detalles = allByTag(targetDoc, 'detalle');
  const items: Item[] = [];
  for (let i = 0; i < detalles.length; i++) {
    const d = detalles[i] as Element;
    const desc = childText(d, 'descripcion') ?? childText(d, 'Descripcion') ?? textByTag(d as unknown as Document, 'descripcion') ?? `Detalle ${i + 1}`;
    const cant = childText(d, 'cantidad') ?? childText(d, 'Cantidad') ?? '1';
    let precio = childText(d, 'precioUnitario') ?? childText(d, 'PrecioUnitario') ?? childText(d, 'precio') ?? '';
    let total = childText(d, 'precioTotalSinImpuesto') ?? childText(d, 'PrecioTotalSinImpuesto') ?? childText(d, 'precioTotal') ?? '';
    if (!total && precio) total = precio;
    if (!total && precio && cant) {
      const p = parseFloat(precio.replace(/[^0-9.\-]/g, ''));
      const q = parseFloat(cant.replace(/[^0-9.\-]/g, ''));
      if (!isNaN(p) && !isNaN(q)) total = (p * q).toFixed(2);
    }
    if (!precio && total) precio = total;
    items.push({ descripcion: desc, cantidad: cant, precio, total });
  }
  return {
    fileName, country: 'ec', ente: cfg.ente,
    emisorNombre: razonEmisor ?? '—', emisorId: rucEmisor ?? '—', emisorIdLabel: 'RUC',
    receptorNombre: razonComp ?? '—', receptorId: idComp ?? '—', receptorIdLabel: 'RUC',
    emisorNIT: rucEmisor, receptorNIT: idComp,
    serie: serieComp?.split('-').slice(0,2).join('-'), numero: serieComp?.split('-').pop(),
    folioFiscal: numeroAutorizacion ?? serieComp, fechaEmision: fecha,
    moneda: 'USD', currencySymbol: '$',
    granTotal: importeTotal ?? totalSin ?? '—', subTotal: totalSin, iva: totalImpuestos, taxLabel: cfg.taxLabel,
    items: items.length ? items : [{ descripcion: 'Detalle no desglosado', cantidad: '1', precio: importeTotal ?? '', total: importeTotal ?? '' }],
    rawXml: xmlText.slice(0, 4000),
  };
}

// -------- API pública --------

export function parseFactura(xmlText: string, fileName: string, forcedCountry?: CountryId): Factura {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) throw new Error('XML inválido: ' + (err.textContent?.slice(0, 200) ?? ''));
  const detected = detectCountry(xmlText, doc);
  const country: CountryId = forcedCountry ?? detected ?? 'gt';
  switch (country) {
    case 'gt': return parseGuatemala(doc, xmlText, fileName);
    case 'mx': return parseMexico(doc, xmlText, fileName);
    case 'ec': return parseEcuador(doc, xmlText, fileName);
    case 'co':
    case 'pe':
    case 'latam':
      return parseUBLGeneric(doc, xmlText, fileName, country);
    default: return parseGuatemala(doc, xmlText, fileName);
  }
}

export function getCountryConfig(id: CountryId): CountryConfig {
  return COUNTRY_CONFIGS[id] ?? COUNTRY_CONFIGS.gt;
}

export function formatMoneyForCountry(value: string | undefined, cfg: CountryConfig): string {
  if (!value || value === '—') return '—';
  const n = Number(String(value).replace(',', '.').replace(/[^0-9.\-]/g, ''));
  if (isNaN(n)) return String(value);
  try {
    return new Intl.NumberFormat('es-GT', { style: 'currency', currency: cfg.currencyCode === 'GTQ' || cfg.currencyCode === 'PEN' || cfg.currencyCode === 'MXN' || cfg.currencyCode === 'COP' ? cfg.currencyCode : 'USD', minimumFractionDigits: 2 }).format(n);
  } catch {
    return `${cfg.currency} ${n.toFixed(2)}`;
  }
}
