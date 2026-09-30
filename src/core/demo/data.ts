/**
 * Static demo data: masters and the activity template used to generate each project's plan.
 * Everything here is fictional and is flagged isDemo when seeded.
 */

export const UOMS: [string, string][] = [
  ["cum", "Cubic metre"], ["sqm", "Square metre"], ["rmt", "Running metre"], ["kg", "Kilogram"],
  ["nos", "Numbers"], ["bag", "Bag (50 kg)"], ["tonne", "Tonne"], ["ltr", "Litre"], ["set", "Set"], ["coil", "Coil (90 m)"],
];

export const TRADES = ["Mason", "Carpenter", "Bar Bender", "Painter", "Plumber", "Electrician", "Helper", "Other"];

export const COST_CODES: [string, string][] = [
  ["CC-100", "Site preparation"], ["CC-200", "Foundation"], ["CC-300", "Superstructure"], ["CC-400", "Masonry"],
  ["CC-500", "Plastering"], ["CC-600", "MEP – Plumbing"], ["CC-650", "MEP – Electrical"], ["CC-700", "Flooring"],
  ["CC-800", "Finishes"], ["CC-900", "External works"],
];

export const MATERIAL_CATEGORIES = [
  "Cement", "Steel", "Aggregates & Sand", "Blocks & Bricks", "Concrete", "Shuttering", "Plumbing",
  "Electrical", "Flooring & Tiles", "Finishes", "Waterproofing",
];

// name, category, uom, standard unit cost (₹), reorder threshold
export const MATERIALS: [string, string, string, number, number][] = [
  ["Cement OPC 53", "Cement", "bag", 385, 200],
  ["TMT Fe550D 8mm", "Steel", "kg", 68, 800],
  ["TMT Fe550D 10mm", "Steel", "kg", 68, 800],
  ["TMT Fe550D 12mm", "Steel", "kg", 67, 800],
  ["TMT Fe550D 16mm", "Steel", "kg", 67, 800],
  ["Binding wire", "Steel", "kg", 82, 60],
  ["M-sand", "Aggregates & Sand", "tonne", 1450, 20],
  ["P-sand (plastering)", "Aggregates & Sand", "tonne", 1300, 15],
  ["20mm aggregate", "Aggregates & Sand", "tonne", 1100, 25],
  ["40mm aggregate", "Aggregates & Sand", "tonne", 1050, 25],
  ["AAC block 200mm", "Blocks & Bricks", "nos", 62, 500],
  ["AAC block 100mm", "Blocks & Bricks", "nos", 38, 400],
  ["Red brick", "Blocks & Bricks", "nos", 9, 1000],
  ["RMC M25", "Concrete", "cum", 5600, 0],
  ["RMC M20", "Concrete", "cum", 5300, 0],
  ["Shuttering plywood 12mm", "Shuttering", "nos", 1350, 20],
  ["CPVC pipe 1 inch", "Plumbing", "rmt", 210, 100],
  ["CPVC pipe 3/4 inch", "Plumbing", "rmt", 155, 100],
  ["PVC drain pipe 4 inch", "Plumbing", "rmt", 240, 60],
  ["Sanitary fittings set", "Plumbing", "set", 42000, 2],
  ["FRLS wire 2.5 sqmm", "Electrical", "coil", 3450, 5],
  ["FRLS wire 4 sqmm", "Electrical", "coil", 5200, 4],
  ["PVC conduit 25mm", "Electrical", "rmt", 42, 200],
  ["Modular switch (premium)", "Electrical", "nos", 380, 40],
  ["Italian marble", "Flooring & Tiles", "sqm", 9500, 20],
  ["Vitrified tile 800x800", "Flooring & Tiles", "sqm", 1450, 30],
  ["Teak wooden decking", "Flooring & Tiles", "sqm", 6800, 10],
  ["Tile adhesive", "Flooring & Tiles", "bag", 420, 20],
  ["Wall putty", "Finishes", "kg", 24, 200],
  ["Premium emulsion paint", "Finishes", "ltr", 620, 40],
  ["Gypsum board 12.5mm", "Finishes", "sqm", 340, 40],
  ["Waterproofing compound", "Waterproofing", "ltr", 280, 30],
];

// name, category, contact, quality, delivery, price, service
export const VENDORS: [string, string, string, number, number, number, number][] = [
  ["Kovai Cement & Steel Depot", "Cement & Steel", "+91 90000 00101", 5, 4, 4, 4],
  ["Sri Murugan Sand & Aggregates", "Aggregates & Sand", "+91 90000 00102", 4, 3, 5, 4],
  ["Coimbatore Blocks & Bricks Co", "Blocks & Bricks", "+91 90000 00103", 4, 4, 4, 3],
  ["Tiruppur Ready-Mix Concrete", "Ready-mix concrete", "+91 90000 00104", 5, 4, 3, 4],
  ["Annamalai Sanitary & CP Fittings", "Plumbing & Sanitary", "+91 90000 00105", 5, 3, 3, 5],
  ["Salem Marble & Tiles House", "Flooring & Tiles", "+91 90000 00106", 5, 4, 3, 4],
  ["Cauvery Paints & Finishes", "Paint & Finishes", "+91 90000 00107", 4, 4, 4, 4],
];

// name, trade, contact
export const SUBCONTRACTORS: [string, string, string][] = [
  ["Kongu Shuttering Works", "Carpenter", "+91 90000 00201"],
  ["Balaji Bar Bending Contractors", "Bar Bender", "+91 90000 00202"],
  ["Sakthi Plumbing Services", "Plumber", "+91 90000 00203"],
  ["Vel Electricals & Wiring", "Electrician", "+91 90000 00204"],
  ["Murugan Plastering & Finishes", "Mason", "+91 90000 00205"],
];

// name, category, ownership
export const EQUIPMENT: [string, string, "COMPANY" | "RENTAL" | "SUBCONTRACTOR"][] = [
  ["Concrete mixer 10/7", "Concrete equipment", "COMPANY"],
  ["Needle vibrator", "Concrete equipment", "COMPANY"],
  ["Bar bending machine", "Bar bending", "COMPANY"],
  ["JCB backhoe loader (rental)", "Earthmoving", "RENTAL"],
  ["Scaffolding set (cuplock)", "Scaffolding & shuttering", "COMPANY"],
];

// name, trade, phone, daily wage
export const EMPLOYEES: [string, string, string, number][] = [
  ["Demo Mason 1", "Mason", "+91 90000 00301", 950],
  ["Demo Mason 2", "Mason", "+91 90000 00302", 900],
  ["Demo Carpenter 1", "Carpenter", "+91 90000 00303", 950],
  ["Demo Bar Bender 1", "Bar Bender", "+91 90000 00304", 900],
  ["Demo Plumber 1", "Plumber", "+91 90000 00305", 950],
  ["Demo Electrician 1", "Electrician", "+91 90000 00306", 980],
  ["Demo Painter 1", "Painter", "+91 90000 00307", 850],
  ["Demo Helper 1", "Helper", "+91 90000 00308", 650],
];

// name, trade, headcount, rate per manday
export const GANGS: [string, string, number, number][] = [
  ["Demo Mason Gang A", "Mason", 12, 1000],
  ["Demo Helper Gang A", "Helper", 20, 700],
  ["Demo Bar Bending Gang A", "Bar Bender", 8, 950],
  ["Demo Painting Gang A", "Painter", 10, 900],
];

export const CHECKLISTS: { name: string; description: string; items: string[] }[] = [
  {
    name: "Pre-concrete pour", description: "Sign-off before any RCC pour.",
    items: [
      "Shuttering is level, plumb and tight (no slurry leaks)",
      "Shuttering props and bracing are stable",
      "Reinforcement matches the approved drawing (diameter, spacing)",
      "Lap lengths and anchorage are as per drawing",
      "Cover blocks are in place at the correct thickness",
      "Bar chairs and spacers are fixed, no bars touching shuttering",
      "Conduits, sleeves and embedded items are fixed",
      "Shuttering surface is clean and shutter oil applied",
      "Concrete grade, quantity and slump confirmed with the RMC plant",
      "Vibrators and curing arrangements are ready",
    ],
  },
  {
    name: "Brickwork", description: "Checks for AAC block or brick masonry.",
    items: [
      "Alignment and plumb are within 3 mm per metre",
      "Joints are 10 mm and fully filled with mortar",
      "Blocks are wetted or the adhesive is applied as specified",
      "Mortar or adhesive mix is as specified",
      "Openings match the door and window schedule",
      "Lintels are provided over all openings",
      "Bonding at corners and junctions is correct",
      "Wall thickness and height match the drawing",
      "Curing is in progress",
    ],
  },
  {
    name: "Plastering", description: "Checks for internal and external plaster.",
    items: [
      "Surface is cleaned and lightly wetted before plastering",
      "Chicken mesh is fixed at masonry-to-concrete joints",
      "Plaster thickness is as specified (12 mm internal, 15–20 mm external)",
      "Surface is flat within 3 mm under a 2 m straightedge",
      "Corners and edges are straight and true",
      "No hollow sound when tapped",
      "No cracks after initial set",
      "Curing has started and is done for at least 7 days",
    ],
  },
];

export const SOPS: [string, string][] = [
  ["Concrete curing", "1. Start curing within 12 hours of the pour.\n2. Keep surfaces continuously wet for at least 7 days.\n3. Record curing on the DPR remarks."],
  ["Site safety briefing", "1. Hold a 5-minute briefing before work starts each day.\n2. Check helmets, footwear and harnesses.\n3. Note any near-miss as an issue in BUILDFlow."],
  ["Material receipt and inspection", "1. Check the delivery challan against the PO.\n2. Inspect quality and count or weigh the material.\n3. Record the receipt in BUILDFlow the same day; reject damaged goods."],
];

// ───────────────────────── activity template ─────────────────────────

export interface TemplateRow {
  wbs: string[]; // path from the top-level WBS node to the leaf
  name: string;
  trade: string;
  uom: string;
  qty: number; // at scale 1.0 (a ₹3 Cr villa)
  share: number; // relative share of the planned cost budget
  prod: number; // target productivity, uom per manday
  ph: [number, number]; // planned start/finish as a fraction of the project duration
  crit: boolean;
  cc: string;
  mats: [string, number, number][]; // material, BOM coefficient per uom, wastage %
}

export const TEMPLATE: TemplateRow[] = [
  { wbs: ["Site Preparation", "Clearing & levelling"], name: "Site clearing and levelling", trade: "Helper", uom: "sqm", qty: 900, share: 0.01, prod: 60, ph: [0, 0.04], crit: false, cc: "CC-100", mats: [] },
  { wbs: ["Site Preparation", "Setting out"], name: "Setting out and marking", trade: "Mason", uom: "rmt", qty: 260, share: 0.005, prod: 40, ph: [0.02, 0.06], crit: false, cc: "CC-100", mats: [] },
  { wbs: ["Foundation", "Excavation"], name: "Earthwork excavation for foundation", trade: "Helper", uom: "cum", qty: 480, share: 0.02, prod: 12, ph: [0.04, 0.1], crit: true, cc: "CC-200", mats: [] },
  { wbs: ["Foundation", "PCC"], name: "PCC M10 below footings", trade: "Mason", uom: "cum", qty: 38, share: 0.015, prod: 3, ph: [0.09, 0.13], crit: true, cc: "CC-200",
    mats: [["Cement OPC 53", 4.6, 2], ["M-sand", 0.75, 5], ["20mm aggregate", 1.25, 5]] },
  { wbs: ["Foundation", "Footing"], name: "Footing reinforcement", trade: "Bar Bender", uom: "kg", qty: 5200, share: 0.05, prod: 90, ph: [0.12, 0.2], crit: true, cc: "CC-200",
    mats: [["TMT Fe550D 12mm", 0.55, 3], ["TMT Fe550D 16mm", 0.45, 3], ["Binding wire", 0.012, 2]] },
  { wbs: ["Foundation", "Footing"], name: "Footing concrete RMC M25", trade: "Mason", uom: "cum", qty: 92, share: 0.04, prod: 6, ph: [0.16, 0.22], crit: true, cc: "CC-200",
    mats: [["RMC M25", 1, 1.5]] },
  { wbs: ["Foundation", "Plinth beam"], name: "Plinth beam RCC", trade: "Mason", uom: "cum", qty: 34, share: 0.035, prod: 3.5, ph: [0.2, 0.27], crit: true, cc: "CC-200",
    mats: [["RMC M25", 1, 1.5], ["TMT Fe550D 12mm", 60, 3], ["TMT Fe550D 8mm", 25, 3], ["Shuttering plywood 12mm", 1.5, 8]] },
  { wbs: ["Superstructure", "Ground floor", "Columns"], name: "Columns – ground floor", trade: "Carpenter", uom: "cum", qty: 26, share: 0.04, prod: 2.5, ph: [0.25, 0.33], crit: true, cc: "CC-300",
    mats: [["RMC M25", 1, 1.5], ["TMT Fe550D 16mm", 90, 3], ["TMT Fe550D 8mm", 25, 3], ["Shuttering plywood 12mm", 2, 8]] },
  { wbs: ["Superstructure", "Ground floor", "Slab"], name: "Slab and beams – ground floor", trade: "Carpenter", uom: "cum", qty: 72, share: 0.06, prod: 4, ph: [0.3, 0.4], crit: true, cc: "CC-300",
    mats: [["RMC M25", 1, 1.5], ["TMT Fe550D 10mm", 70, 3], ["TMT Fe550D 12mm", 25, 3], ["Shuttering plywood 12mm", 3.5, 8]] },
  { wbs: ["Superstructure", "First floor", "Columns"], name: "Columns – first floor", trade: "Carpenter", uom: "cum", qty: 24, share: 0.035, prod: 2.5, ph: [0.38, 0.46], crit: true, cc: "CC-300",
    mats: [["RMC M25", 1, 1.5], ["TMT Fe550D 16mm", 90, 3], ["TMT Fe550D 8mm", 25, 3], ["Shuttering plywood 12mm", 2, 8]] },
  { wbs: ["Superstructure", "First floor", "Slab"], name: "Slab and beams – first floor", trade: "Carpenter", uom: "cum", qty: 70, share: 0.055, prod: 4, ph: [0.43, 0.53], crit: true, cc: "CC-300",
    mats: [["RMC M25", 1, 1.5], ["TMT Fe550D 10mm", 70, 3], ["TMT Fe550D 12mm", 25, 3], ["Shuttering plywood 12mm", 3.5, 8]] },
  { wbs: ["Masonry", "Ground floor"], name: "AAC block masonry – ground floor", trade: "Mason", uom: "sqm", qty: 260, share: 0.035, prod: 4.5, ph: [0.5, 0.6], crit: true, cc: "CC-400",
    mats: [["AAC block 200mm", 8.4, 3], ["Cement OPC 53", 0.08, 3], ["P-sand (plastering)", 0.012, 5]] },
  { wbs: ["Masonry", "First floor"], name: "AAC block masonry – first floor", trade: "Mason", uom: "sqm", qty: 240, share: 0.03, prod: 4.5, ph: [0.58, 0.68], crit: true, cc: "CC-400",
    mats: [["AAC block 200mm", 8.4, 3], ["Cement OPC 53", 0.08, 3], ["P-sand (plastering)", 0.012, 5]] },
  { wbs: ["Plastering", "Internal"], name: "Internal plastering", trade: "Mason", uom: "sqm", qty: 1450, share: 0.04, prod: 7, ph: [0.64, 0.76], crit: false, cc: "CC-500",
    mats: [["Cement OPC 53", 0.16, 3], ["P-sand (plastering)", 0.028, 5]] },
  { wbs: ["Plastering", "External"], name: "External plastering", trade: "Mason", uom: "sqm", qty: 620, share: 0.03, prod: 6, ph: [0.7, 0.8], crit: false, cc: "CC-500",
    mats: [["Cement OPC 53", 0.2, 3], ["P-sand (plastering)", 0.035, 5]] },
  { wbs: ["MEP", "Plumbing"], name: "Concealed drainage and soil lines", trade: "Plumber", uom: "rmt", qty: 380, share: 0.04, prod: 8, ph: [0.55, 0.72], crit: false, cc: "CC-600",
    mats: [["PVC drain pipe 4 inch", 1, 3]] },
  { wbs: ["MEP", "Plumbing"], name: "CPVC water supply lines", trade: "Plumber", uom: "rmt", qty: 520, share: 0.02, prod: 12, ph: [0.62, 0.78], crit: false, cc: "CC-600",
    mats: [["CPVC pipe 1 inch", 0.4, 3], ["CPVC pipe 3/4 inch", 0.6, 3]] },
  { wbs: ["MEP", "Electrical"], name: "Conduit and wiring", trade: "Electrician", uom: "rmt", qty: 2400, share: 0.05, prod: 25, ph: [0.55, 0.75], crit: false, cc: "CC-650",
    mats: [["PVC conduit 25mm", 1, 3], ["FRLS wire 2.5 sqmm", 0.011, 4], ["FRLS wire 4 sqmm", 0.004, 4]] },
  { wbs: ["MEP", "Electrical"], name: "Switchgear, DBs and switches", trade: "Electrician", uom: "nos", qty: 24, share: 0.04, prod: 1.5, ph: [0.74, 0.82], crit: false, cc: "CC-650",
    mats: [["Modular switch (premium)", 10, 2]] },
  { wbs: ["Flooring", "Italian marble"], name: "Italian marble flooring", trade: "Mason", uom: "sqm", qty: 380, share: 0.15, prod: 4, ph: [0.76, 0.9], crit: false, cc: "CC-700",
    mats: [["Italian marble", 1, 8], ["Cement OPC 53", 0.25, 3], ["P-sand (plastering)", 0.04, 5]] },
  { wbs: ["Flooring", "Wooden deck"], name: "Teak wooden deck", trade: "Carpenter", uom: "sqm", qty: 110, share: 0.05, prod: 3.5, ph: [0.84, 0.92], crit: false, cc: "CC-700",
    mats: [["Teak wooden decking", 1, 6]] },
  { wbs: ["Finishes", "Waterproofing"], name: "Terrace and wet-area waterproofing", trade: "Helper", uom: "sqm", qty: 180, share: 0.01, prod: 12, ph: [0.66, 0.74], crit: false, cc: "CC-800",
    mats: [["Waterproofing compound", 0.9, 5], ["Cement OPC 53", 0.2, 3]] },
  { wbs: ["Finishes", "Painting"], name: "Interior and exterior painting", trade: "Painter", uom: "sqm", qty: 2900, share: 0.06, prod: 18, ph: [0.86, 0.97], crit: false, cc: "CC-800",
    mats: [["Wall putty", 1.2, 5], ["Premium emulsion paint", 0.28, 4]] },
  { wbs: ["Finishes", "False ceiling"], name: "Gypsum false ceiling", trade: "Carpenter", uom: "sqm", qty: 300, share: 0.04, prod: 9, ph: [0.8, 0.9], crit: false, cc: "CC-800",
    mats: [["Gypsum board 12.5mm", 1, 6]] },
  { wbs: ["External works", "Compound wall"], name: "Compound wall", trade: "Mason", uom: "rmt", qty: 140, share: 0.04, prod: 3, ph: [0.8, 0.93], crit: false, cc: "CC-900",
    mats: [["Red brick", 90, 3], ["Cement OPC 53", 0.7, 3], ["P-sand (plastering)", 0.12, 5]] },
  { wbs: ["External works", "Paving and landscaping"], name: "External paving", trade: "Mason", uom: "sqm", qty: 260, share: 0.035, prod: 10, ph: [0.9, 1], crit: false, cc: "CC-900",
    mats: [["Vitrified tile 800x800", 1.05, 5], ["Cement OPC 53", 0.15, 3]] },
];

/** Extra BOQ lines with no single activity (share of contract value, client-rate basis). */
export const BOQ_EXTRAS: { code: string; description: string; uom: string; qty: number; valueShare: number; linkActivity?: string }[] = [
  { code: "B-101", description: "Preliminaries and site mobilisation", uom: "set", qty: 1, valueShare: 0.01 },
  { code: "B-102", description: "Teak doors and windows (supply and fix)", uom: "set", qty: 1, valueShare: 0.022 },
  { code: "B-103", description: "Sanitary fittings and CP fittings", uom: "set", qty: 1, valueShare: 0.013 },
  { code: "B-104", description: "External painting (weather-proof)", uom: "sqm", qty: 700, valueShare: 0.012, linkActivity: "Interior and exterior painting" },
];
