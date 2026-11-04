import type { Category, Rule, TxKind } from '../db/types'
import { normalize } from '../lib/text'

interface CatSeed {
  id: string
  name: string
  icon: string
  color: string
  kind?: 'gasto' | 'ingreso'
  children?: [id: string, name: string, icon: string][]
}

/**
 * Categorías predefinidas. Los colores son tonos de la paleta (pálido + tinta oscura del mismo tono);
 * aquí se guarda el tono medio y la interfaz deriva el fondo pálido y la tinta.
 */
const SEED: CatSeed[] = [
  {
    id: 'cat-hogar', name: 'Hogar', icon: 'home', color: '#2f6fd0',
    children: [
      ['cat-alquiler', 'Alquiler o hipoteca', 'key'],
      ['cat-luz', 'Luz', 'zap'],
      ['cat-agua', 'Agua', 'droplet'],
      ['cat-gas', 'Gas', 'flame'],
      ['cat-internet', 'Internet y móvil', 'wifi'],
      ['cat-comunidad', 'Comunidad', 'building'],
      ['cat-seguro-hogar', 'Seguro de hogar', 'shield'],
    ],
  },
  {
    id: 'cat-alimentacion', name: 'Alimentación', icon: 'basket', color: '#2f8a4c',
    children: [
      ['cat-supermercado', 'Supermercado', 'basket'],
      ['cat-restaurantes', 'Restaurantes', 'utensils'],
      ['cat-cafeterias', 'Cafeterías', 'coffee'],
      ['cat-comida-domicilio', 'Comida a domicilio', 'bike'],
    ],
  },
  {
    id: 'cat-transporte', name: 'Transporte', icon: 'car', color: '#b45309',
    children: [
      ['cat-gasolina', 'Gasolina', 'fuel'],
      ['cat-transporte-publico', 'Transporte público', 'train'],
      ['cat-parking', 'Parking y peajes', 'parking'],
      ['cat-taxi', 'Taxi y VTC', 'car'],
      ['cat-mantenimiento', 'Mantenimiento del coche', 'wrench'],
    ],
  },
  {
    id: 'cat-compras', name: 'Compras', icon: 'bag', color: '#a3456e',
    children: [
      ['cat-ropa', 'Ropa y calzado', 'shirt'],
      ['cat-electronica', 'Electrónica', 'laptop'],
      ['cat-casa-deco', 'Casa y decoración', 'sofa'],
      ['cat-online', 'Compras online', 'package'],
    ],
  },
  {
    id: 'cat-ocio', name: 'Ocio', icon: 'ticket', color: '#7a5bbf',
    children: [
      ['cat-suscripciones', 'Suscripciones', 'repeat'],
      ['cat-viajes', 'Viajes', 'plane'],
      ['cat-eventos', 'Cine y eventos', 'film'],
      ['cat-deporte', 'Deporte', 'dumbbell'],
    ],
  },
  {
    id: 'cat-salud', name: 'Salud', icon: 'heart', color: '#c2410c',
    children: [
      ['cat-farmacia', 'Farmacia', 'pill'],
      ['cat-medico', 'Médico y dentista', 'stethoscope'],
      ['cat-seguro-medico', 'Seguro médico', 'shield'],
    ],
  },
  { id: 'cat-educacion', name: 'Educación', icon: 'book', color: '#0f766e' },
  {
    id: 'cat-finanzas', name: 'Bancos e impuestos', icon: 'landmark', color: '#4b5563',
    children: [
      ['cat-comisiones', 'Comisiones', 'percent'],
      ['cat-impuestos', 'Impuestos', 'receipt'],
      ['cat-prestamos', 'Préstamos', 'landmark'],
    ],
  },
  { id: 'cat-bizum', name: 'Bizum', icon: 'phone', color: '#0e7490' },
  { id: 'cat-efectivo', name: 'Retirada de efectivo', icon: 'banknote', color: '#57534e' },
  { id: 'cat-otros-gastos', name: 'Otros gastos', icon: 'dots', color: '#6b7280' },
  { id: 'cat-sueldo', name: 'Sueldo', icon: 'briefcase', color: '#2f7a45', kind: 'ingreso' },
  { id: 'cat-reembolsos', name: 'Reembolsos', icon: 'undo', color: '#2f7a45', kind: 'ingreso' },
  { id: 'cat-intereses', name: 'Intereses y dividendos', icon: 'trending', color: '#2f7a45', kind: 'ingreso' },
  { id: 'cat-otros-ingresos', name: 'Otros ingresos', icon: 'plus', color: '#2f7a45', kind: 'ingreso' },
  { id: 'cat-inversion', name: 'Aportación a inversión', icon: 'trending', color: '#1d5fd6' },
  { id: 'cat-transferencia', name: 'Transferencia entre cuentas', icon: 'arrows', color: '#6b7280' },
]

export function defaultCategories(): Category[] {
  const out: Category[] = []
  let order = 0
  for (const c of SEED) {
    out.push({ id: c.id, name: c.name, parentId: null, icon: c.icon, color: c.color, kind: c.kind ?? 'gasto', order: order++ })
    for (const [id, name, icon] of c.children ?? []) {
      out.push({ id, name, parentId: c.id, icon, color: c.color, kind: c.kind ?? 'gasto', order: order++ })
    }
  }
  return out
}

/** Palabras clave → categoría. Se comparan sin tildes ni mayúsculas. */
const RULE_SEED: [keywords: string[], categoryId: string, kind?: TxKind][] = [
  [['mercadona', 'lidl', 'carrefour', 'aldi', 'dia ', 'supermercados dia', 'alcampo', 'eroski', 'consum', 'hipercor', 'ahorramas', 'bonpreu', 'caprabo', 'gadis', 'froiz', 'el corte ingles super', 'bm supermercados', 'masymas', 'spar', 'condis'], 'cat-supermercado'],
  [['repsol', 'cepsa', 'moeve', 'bp ', 'galp', 'shell', 'petronor', 'ballenoil', 'plenoil', 'petroprix', 'gasolinera', 'estacion de servicio'], 'cat-gasolina'],
  [['netflix', 'spotify', 'hbo', 'max.com', 'disney', 'prime video', 'amazon prime', 'apple.com/bill', 'icloud', 'youtube premium', 'dazn', 'movistar plus', 'filmin', 'audible', 'chatgpt', 'openai', 'adobe', 'microsoft 365', 'google one', 'playstation', 'xbox', 'nintendo'], 'cat-suscripciones'],
  [['nomina', 'nómina', 'salario', 'haberes'], 'cat-sueldo', 'ingreso'],
  [['bizum'], 'cat-bizum'],
  [['trade republic', 'traderepublic'], 'cat-inversion', 'aportacion'],
  [['iberdrola', 'endesa', 'naturgy', 'holaluz', 'repsol luz', 'octopus energy', 'totalenergies', 'som energia', 'curenergia'], 'cat-luz'],
  [['canal de isabel', 'aigues', 'aguas de', 'emasesa', 'aqualia', 'emaya'], 'cat-agua'],
  [['movistar', 'vodafone', 'orange', 'yoigo', 'digi', 'pepephone', 'masmovil', 'lowi', 'simyo', 'o2 ', 'jazztel', 'finetwork'], 'cat-internet'],
  [['alquiler', 'hipoteca', 'prestamo hipotecario'], 'cat-alquiler'],
  [['comunidad de propietarios', 'cdad prop', 'comunidad prop'], 'cat-comunidad'],
  [['mapfre', 'mutua madrilena', 'linea directa', 'allianz', 'axa', 'generali', 'zurich', 'ocaso', 'santalucia'], 'cat-seguro-hogar'],
  [['sanitas', 'adeslas', 'asisa', 'dkv', 'cigna'], 'cat-seguro-medico'],
  [['farmacia', 'parafarmacia'], 'cat-farmacia'],
  [['clinica', 'dentista', 'dental', 'hospital', 'quiron', 'fisioterapia'], 'cat-medico'],
  [['renfe', 'metro de', 'emt ', 'tmb', 'alsa', 'avanza', 'cercanias', 'bicimad', 'ouigo', 'iryo', 'tram '], 'cat-transporte-publico'],
  [['parking', 'aparcamiento', 'empark', 'telpark', 'saba ', 'autopista', 'peaje', 'via t', 'ora '], 'cat-parking'],
  [['uber', 'cabify', 'bolt', 'free now', 'freenow', 'taxi'], 'cat-taxi'],
  [['itv', 'taller', 'norauto', 'midas', 'feu vert', 'neumaticos'], 'cat-mantenimiento'],
  [['glovo', 'just eat', 'uber eats', 'deliveroo', 'telepizza', 'dominos'], 'cat-comida-domicilio'],
  [['restaurante', 'mcdonald', 'burger king', 'kfc', 'foster', 'vips', 'goiko', 'taberna', 'tapas', 'pizzeria', 'sushi', 'bar '], 'cat-restaurantes'],
  [['starbucks', 'cafeteria', 'cafe ', 'granier', 'panaderia', 'pasteleria', 'horno'], 'cat-cafeterias'],
  [['zara', 'mango', 'primark', 'pull bear', 'bershka', 'stradivarius', 'massimo dutti', 'decathlon', 'kiabi', 'h m', 'hm ', 'zalando', 'shein', 'vinted', 'nike', 'adidas', 'deichmann'], 'cat-ropa'],
  [['media markt', 'mediamarkt', 'pccomponentes', 'fnac', 'apple store', 'worten', 'xiaomi'], 'cat-electronica'],
  [['ikea', 'leroy merlin', 'bricomart', 'bauhaus', 'maisons du monde', 'zara home', 'casa viva', 'jysk'], 'cat-casa-deco'],
  [['amazon', 'amzn', 'aliexpress', 'temu', 'ebay', 'paypal'], 'cat-online'],
  [['ryanair', 'vueling', 'iberia', 'air europa', 'booking', 'airbnb', 'hotel', 'expedia', 'edreams', 'easyjet', 'renfe viajeros'], 'cat-viajes'],
  [['cine', 'yelmo', 'cinesa', 'kinepolis', 'ticketmaster', 'entradas', 'teatro', 'museo'], 'cat-eventos'],
  [['gimnasio', 'basic fit', 'mcfit', 'altafit', 'vivagym', 'anytime fitness', 'holmes place', 'dir '], 'cat-deporte'],
  [['comision', 'comisión', 'cuota tarjeta', 'mantenimiento cuenta'], 'cat-comisiones'],
  [['agencia tributaria', 'aeat', 'hacienda', 'ayuntamiento', 'ibi ', 'dgt', 'tasa ', 'impuesto'], 'cat-impuestos'],
  [['cajero', 'reintegro', 'retirada efectivo', 'disposicion efectivo'], 'cat-efectivo'],
  [['devolucion', 'reembolso', 'abono compra'], 'cat-reembolsos', 'ingreso'],
  [['intereses', 'dividendo', 'remuneracion cuenta'], 'cat-intereses', 'ingreso'],
  [['academia', 'universidad', 'colegio', 'matricula', 'udemy', 'coursera', 'libreria', 'casa del libro'], 'cat-educacion'],
]

export function defaultRules(now = Date.now()): Rule[] {
  const out: Rule[] = []
  const seen = new Set<string>()
  for (const [keywords, categoryId, kind] of RULE_SEED) {
    for (const kw of keywords) {
      const keyword = normalize(kw)
      if (seen.has(keyword)) continue
      seen.add(keyword)
      out.push({ id: `rule-${keyword.replace(/ /g, '-')}`, keyword, categoryId, kind, custom: false, createdAt: now })
    }
  }
  return out
}
