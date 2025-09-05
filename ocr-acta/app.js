// ---------- util UI ----------
const $ = (id)=>document.getElementById(id);
function showToast(msg, ok=true){
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast " + (ok ? "ok":"err");
  t.style.display = "block";
  setTimeout(()=> t.style.display="none", 2500);
}
function openModal(){ $("modalConf").style.display="flex"; }
function closeModal(){ $("modalConf").style.display="none"; }

// ---------- partidos ----------
const partidos = [
  "Fuerza Patria",
  "Potencia",
  "Es con Vos es con Nosotros",
  "Fte de Izq. y de Trabajadores - Unidad",
  "Somos Buenos Aires",
  "Nuevos Aires",
  "La Libertad Avanza",
  "Unión y Libertad",
  "Unión Liberal",
  "Movimiento Avanzada Socialista",
  "Frente Patriota Federal",
  "Política Obrera",
  "Partido Tiempo de Todos",
  "Construyendo Porvenir",
  "Partido Libertario",
  "Valores Republicanos"
];

const tbody = document.querySelector("#tablaResultados tbody");

// ---------- Helpers tabla ----------
function limpiarTabla(){
  tbody.innerHTML = "";
  ["totDip","totCon","blDip","blCon","imp","sob3Dip","sob3Con","sumDip","sumCon"].forEach(id=>$(id).textContent="—");
  $("sumTag").textContent = "Suma total: — / —";
}
function ponerFila(nombre, d, c, editable=false){
  const tr = document.createElement("tr");
  const tdN = document.createElement("td");
  const tdD = document.createElement("td");
  const tdC = document.createElement("td");
  tdN.textContent = nombre;
  tdD.textContent = d ?? "";
  tdC.textContent = c ?? "";
  if(editable){ tdD.contentEditable="true"; tdC.contentEditable="true"; }
  tr.append(tdN, tdD, tdC);
  tbody.appendChild(tr);
}

// ---------- Preproceso de imagen (mejora OCR) ----------
function preprocessImage(file){
  return new Promise((resolve,reject)=>{
    const img = new Image();
    img.onload = ()=>{
      const scale = 1.8; // subir resolución
      const w = Math.round(img.width*scale);
      const h = Math.round(img.height*scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      // Gris + binarizado
      const imgData = ctx.getImageData(0,0,w,h);
      const d = imgData.data;
      for(let i=0;i<d.length;i+=4){
        const g = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
        const bw = g > 185 ? 255 : 0; // umbral suave
        d[i]=d[i+1]=d[i+2]=bw;
      }
      ctx.putImageData(imgData,0,0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    const fr = new FileReader();
    fr.onload = e => { img.src = e.target.result; };
    fr.readAsDataURL(file);
  });
}

// ---------- OCR con worker (PSM=6, preserva espacios) ----------
async function leerActa(file){
  $("ocrStatus").textContent = "Procesando OCR…";
  const pre = await preprocessImage(file);

  // Worker de Tesseract con params finos
  const { createWorker } = Tesseract;
  const worker = await createWorker("spa+eng", 1, {
    logger: m => { /* opcional: console.log(m) */ }
  });
  await worker.setParameters({
    tessedit_pageseg_mode: "6",               // una columna uniforme de texto
    preserve_interword_spaces: "1",
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÑabcdefghijklmnopqrstuvwxyzáéíóúñ 0123456789-./º°",
  });

  const { data } = await worker.recognize(pre);
  await worker.terminate();

  $("ocrStatus").textContent = "Listo";
  $("confTag").textContent = "Conf: " + (data.confidence ? data.confidence.toFixed(1) + "%" : "—");

  // Parse robusto con bbox por renglones
  parseByLines(data);
  return data;
}

// ---------- Parser por renglones (nuevo robusto con columnas) ----------
function normalizeSpace(s){ return s.replace(/\s+/g," ").trim(); }

// Corrige confusiones típicas de OCR y deja sólo dígitos (1–3 cifras)
function fixDigitChars(t){
  if(!t) return "";
  let s = t
    .replace(/[Oo]/g, "0")
    .replace(/[Ss]/g, "5")
    .replace(/[Bb]/g, "8")
    .replace(/[lI]/g, "1")
    .replace(/[Z]/g, "2")
    .replace(/[A]/g, "4"); // ocasional
  s = s.replace(/[^0-9]/g, "");
  // limita a 3 dígitos por casillero
  if(s.length > 3) s = s.slice(-3);
  return s;
}
function isNumLike(t){
  const s = fixDigitChars(t);
  return s.length >= 1 && s.length <= 3;
}
function asNumToken(t){
  const s = fixDigitChars(t);
  return /^\d{1,3}$/.test(s) ? s : "";
}

// Agrupa palabras por línea usando y medio (bin ~12px), conserva bbox
function buildLines(words){
  const lines = new Map();
  for(const w of words){
    const yMid = (w.bbox.y0 + w.bbox.y1)/2;
    const lineId = Math.round(yMid/12);
    if(!lines.has(lineId)) lines.set(lineId, { y: yMid, words: [] });
    lines.get(lineId).words.push({
      raw: w.text,
      text: w.text,
      x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0, y1: w.bbox.y1
    });
  }
  const arr = Array.from(lines.entries()).map(([id,obj])=>{
    obj.words.sort((a,b)=>a.x0-b.x0);
    obj.text = normalizeSpace(obj.words.map(w=>w.text).join(" "));
    obj.id = id;
    return obj;
  }).sort((a,b)=>a.y-b.y);
  return arr;
}

function findLineIdx(lines, needle){
  const n = needle.toLowerCase();
  for(let i=0;i<lines.length;i++){
    if(lines[i].text.toLowerCase().includes(n)) return i;
  }
  return -1;
}

function numberTokensInLine(line){
  // devuelve [{n, x}] sólo para tokens numéricos o num-like corregidos
  return line.words
    .map(w=>({ n: asNumToken(w.raw), x: w.x0 }))
    .filter(o=>o.n);
}

// Detecta las 2 columnas numéricas por clustering 1D (x). Devuelve {c1, c2} (x-centroids ordenados)
function detectColumns(lines){
  const xs = [];
  for(const ln of lines){
    for(const tok of numberTokensInLine(ln)){
      xs.push(tok.x);
    }
  }
  if(xs.length < 2){
    return null; // no se puede clusterizar; se usará fallback
  }
  xs.sort((a,b)=>a-b);
  // inicialización: percentil 25 y 75
  const p = (arr, q)=>arr[Math.max(0, Math.min(arr.length-1, Math.floor(q*(arr.length-1))))];
  let c1 = p(xs, 0.25), c2 = p(xs, 0.75);
  // 5 iteraciones de k-means 1D
  for(let it=0; it<5; it++){
    const g1 = [], g2 = [];
    for(const x of xs){
      (Math.abs(x-c1) <= Math.abs(x-c2) ? g1 : g2).push(x);
    }
    if(g1.length) c1 = g1.reduce((a,b)=>a+b,0)/g1.length;
    if(g2.length) c2 = g2.reduce((a,b)=>a+b,0)/g2.length;
  }
  // ordena izq→der
  if(c1 > c2){ const t=c1; c1=c2; c2=t; }
  return { c1, c2 };
}

// Toma dos números para una línea índice i usando columnas detectadas.
// Busca en línea i, luego i+1 y i-1, asigna por cercanía a centroides.
function pickTwoNumbersByColumns(lines, idx, cols){
  const bag = [];
  const pushNums = (ln)=>{
    if(!ln) return;
    for(const tok of numberTokensInLine(ln)){
      bag.push({ n: tok.n, x: tok.x });
    }
  };
  pushNums(lines[idx]);
  pushNums(lines[idx+1]);
  pushNums(lines[idx-1]);

  if(!bag.length){
    return ["",""]; // sin números cerca
  }
  if(!cols){
    // fallback: dos más a la derecha en X
    bag.sort((a,b)=>a.x-b.x);
    return [bag[bag.length-2]?.n || "", bag[bag.length-1]?.n || ""];
  }

  // asignación por cercanía a centroides
  let bestL = null, bestR = null, dL = 1e9, dR = 1e9;
  for(const t of bag){
    const d1 = Math.abs(t.x - cols.c1);
    const d2 = Math.abs(t.x - cols.c2);
    if(d1 <= d2){
      if(d1 < dL) { dL = d1; bestL = t.n; }
    } else {
      if(d2 < dR) { dR = d2; bestR = t.n; }
    }
  }
  return [bestL || "", bestR || ""];
}

function parseByLines(ocrData){
  limpiarTabla();

  const lines = buildLines(ocrData.words || []);
  const cols = detectColumns(lines); // {c1,c2} o null

  // Cabeceras (mejor intento: toma el primer número tras la palabra clave)
  const idxDist = findLineIdx(lines, "Distrito");
  const idxCirc = findLineIdx(lines, "Circuito");
  const idxMesa = findLineIdx(lines, "Mesa");

  if(idxDist>=0){
    const nums = numberTokensInLine(lines[idxDist]).map(x=>x.n);
    $("inpDistrito").value = $("inpDistrito").value || (nums[0] || "");
  }
  if(idxCirc>=0){
    const nums = numberTokensInLine(lines[idxCirc]).map(x=>x.n);
    $("inpCircuito").value = $("inpCircuito").value || (nums[0] || "");
  }
  if(idxMesa>=0){
    const nums = numberTokensInLine(lines[idxMesa]).map(x=>x.n);
    $("inpMesa").value = $("inpMesa").value || (nums[0] || "");
  }

  // Partidos → dos números por columnas
  for(const p of partidos){
    const i = findLineIdx(lines, p);
    const [dip, con] = pickTwoNumbersByColumns(lines, i, cols);
    ponerFila(p, dip, con);
  }

  // Totales y otros (siempre usando columnas detectadas)
  let iTot = findLineIdx(lines, "TOTAL VOTOS AGRUPACIONES");
  if(iTot<0) iTot = findLineIdx(lines, "AGRUPACIONES POLITICAS");
  if(iTot>=0){
    const [d,c] = pickTwoNumbersByColumns(lines, iTot, cols);
    $("totDip").textContent = d || "—";
    $("totCon").textContent = c || "—";
  }

  const iBl = findLineIdx(lines, "VOTOS EN BLANCO");
  if(iBl>=0){
    const [d,c] = pickTwoNumbersByColumns(lines, iBl, cols);
    $("blDip").textContent = d || "—";
    $("blCon").textContent = c || "—";
  }

  const iImp = findLineIdx(lines, "IDENTIDAD IMPUGNADA");
  if(iImp>=0){
    const [d] = pickTwoNumbersByColumns(lines, iImp, cols);
    $("imp").textContent = d || "0";
  } else {
    $("imp").textContent = "0";
  }

  let iS3 = findLineIdx(lines, "SOBRE N");
  if(iS3<0) iS3 = findLineIdx(lines, "SOBRE 3");
  if(iS3>=0){
    const [d,c] = pickTwoNumbersByColumns(lines, iS3, cols);
    $("sob3Dip").textContent = d || "—";
    $("sob3Con").textContent = c || "—";
  }

  const iSum = findLineIdx(lines, "SUMA TOTAL DE VOTOS");
  if(iSum>=0){
    const [d,c] = pickTwoNumbersByColumns(lines, iSum, cols);
    $("sumDip").textContent = d || "—";
    $("sumCon").textContent = c || "—";
    if(d && c) $("sumTag").textContent = `Suma total: ${d} / ${c}`;
  }
}


// ---------- Construir datos ----------
function construirPayload(){
  const filas = [...tbody.querySelectorAll("tr")].map(tr=>{
    const tds = tr.querySelectorAll("td");
    return { partido: tds[0].textContent.trim(), diputados: tds[1].textContent.trim(), concejales: tds[2].textContent.trim() };
  });
  return {
    distrito: $("inpDistrito").value.trim(),
    circuito: $("inpCircuito").value.trim(),
    mesa: $("inpMesa").value.trim(),
    partidos: filas,
    totales: {
      diputados: $("totDip").textContent.trim(),
      concejales: $("totCon").textContent.trim(),
      blancos: { diputados: $("blDip").textContent.trim(), concejales: $("blCon").textContent.trim() },
      impugnados: $("imp").textContent.trim(),
      sobre3: { diputados: $("sob3Dip").textContent.trim(), concejales: $("sob3Con").textContent.trim() },
      suma: { diputados: $("sumDip").textContent.trim(), concejales: $("sumCon").textContent.trim() }
    },
    created_at: new Date().toISOString()
  };
}

// ---------- Cloudinary ----------
const CLOUD_NAME = "dudrnu2mq";
const UPLOAD_PRESET = "escrutinio";
async function subirCloudinary(file){
  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET);
  form.append("folder", "actas");
  const r = await fetch(url, { method:"POST", body: form });
  if(!r.ok) throw new Error("Cloudinary error");
  const j = await r.json();
  return j.secure_url;
}

// ---------- Firestore ----------
async function guardarFirestore(payload){
  if(!firebase.auth().currentUser){
    await firebase.auth().signInAnonymously();
  }
  const col = firebase.firestore().collection("actas");
  await col.add(payload);
}
