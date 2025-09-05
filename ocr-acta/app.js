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

// ---------- Parser por renglones ----------
function normalize(s){ return s.replace(/\s+/g," ").trim(); }
function isNumberToken(t){ return /^\d{1,3}$/.test(t); }

// agrupa palabras por línea usando y promedio
function buildLines(words){
  // bin de 12 px aprox para agrupar renglones
  const lines = new Map(); // key=lineId, value={y:avgY, words:[{text,x0,x1,y0,y1}]}
  for(const w of words){
    const yMid = (w.bbox.y0 + w.bbox.y1)/2;
    const lineId = Math.round(yMid/12);
    if(!lines.has(lineId)) lines.set(lineId, { y: yMid, words: [] });
    lines.get(lineId).words.push({
      text: w.text,
      x0: w.bbox.x0, x1: w.bbox.x1,
      y0: w.bbox.y0, y1: w.bbox.y1
    });
  }
  // ordena líneas por y y dentro por x
  const arr = Array.from(lines.entries()).map(([id,obj])=>{
    obj.words.sort((a,b)=>a.x0-b.x0);
    obj.text = normalize(obj.words.map(w=>w.text).join(" "));
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

function numsInLine(line){
  return line.words.filter(w=>isNumberToken(w.text)).map(w=>({n:w.text, x:w.x0}));
}

function pickTwoNumbers(lines, idx){
  if(idx<0) return ["",""];
  let nums = numsInLine(lines[idx]);
  if(nums.length < 2 && lines[idx+1]) nums = nums.concat(numsInLine(lines[idx+1]));
  if(nums.length < 2 && lines[idx-1]) nums = nums.concat(numsInLine(lines[idx-1]));
  nums.sort((a,b)=>a.x-b.x);
  return [nums[0]?.n || "", nums[1]?.n || ""];
}

function parseByLines(ocrData){
  limpiarTabla();

  const lines = buildLines(ocrData.words || []);
  // Campo cabecera: distrito / circuito / mesa
  const idxDist = findLineIdx(lines, "Distrito");
  const idxCirc = findLineIdx(lines, "Circuito");
  const idxMesa = findLineIdx(lines, "Mesa");

  $("inpDistrito").value ||= (()=>{
    if(idxDist<0) return "";
    const nums = numsInLine(lines[idxDist]).map(x=>x.n);
    return nums[0] ? nums[0] : "";
  })();

  $("inpCircuito").value ||= (()=>{
    if(idxCirc<0) return "";
    const nums = numsInLine(lines[idxCirc]).map(x=>x.n);
    return nums[0] ? nums[0] : "";
  })();

  $("inpMesa").value ||= (()=>{
    if(idxMesa<0) return "";
    const nums = numsInLine(lines[idxMesa]).map(x=>x.n);
    return nums[0] ? nums[0] : "";
  })();

  // Partidos: busca línea del nombre y toma dos números (dip/con) de esa o la siguiente
  for(const p of partidos){
    const i = findLineIdx(lines, p);
    const [dip, con] = pickTwoNumbers(lines, i);
    ponerFila(p, dip, con);
  }

  // Totales y otros campos
  // Total votos agrupaciones
  let iTot = findLineIdx(lines, "TOTAL VOTOS AGRUPACIONES");
  if(iTot<0) iTot = findLineIdx(lines, "AGRUPACIONES POLITICAS");
  if(iTot>=0){
    const [d,c] = pickTwoNumbers(lines, iTot);
    $("totDip").textContent = d || "—";
    $("totCon").textContent = c || "—";
  }

  // Votos en blanco
  const iBl = findLineIdx(lines, "VOTOS EN BLANCO");
  if(iBl>=0){
    const [d,c] = pickTwoNumbers(lines, iBl);
    $("blDip").textContent = d || "—";
    $("blCon").textContent = c || "—";
  }

  // Impugnados
  const iImp = findLineIdx(lines, "IDENTIDAD IMPUGNADA");
  if(iImp>=0){
    const [d] = pickTwoNumbers(lines, iImp);
    $("imp").textContent = d || "0";
  } else {
    $("imp").textContent = "0";
  }

  // Sobre N° 3
  let iS3 = findLineIdx(lines, "SOBRE N");
  if(iS3<0) iS3 = findLineIdx(lines, "SOBRE 3");
  if(iS3>=0){
    const [d,c] = pickTwoNumbers(lines, iS3);
    $("sob3Dip").textContent = d || "—";
    $("sob3Con").textContent = c || "—";
  }

  // Suma Total de votos
  const iSum = findLineIdx(lines, "SUMA TOTAL DE VOTOS");
  if(iSum>=0){
    const [d,c] = pickTwoNumbers(lines, iSum);
    $("sumDip").textContent = d || "—";
    $("sumCon").textContent = c || "—";
    if(d && c) $("sumTag").textContent = `Suma total: ${d} / ${c}`;
  }
}

// ---------- Eventos UI ----------
$("btnLeer").addEventListener("click", async ()=>{
  const f = $("fileActa").files?.[0];
  if(!f){ showToast("Subí una foto del acta.", false); return; }
  try { await leerActa(f); }
  catch(e){ console.error(e); showToast("Error corriendo OCR", false); }
});

$("btnEditar").addEventListener("click", ()=>{
  [...tbody.querySelectorAll("td:nth-child(2), td:nth-child(3)")].forEach(td=>td.contentEditable="true");
  showToast("Edición habilitada");
});
$("btnConfirmar").addEventListener("click", openModal);
$("cancelConf").addEventListener("click", closeModal);
$("okConf").addEventListener("click", async ()=>{
  closeModal();
  try{
    const payload = construirPayload();
    const imgFile = $("fileActa").files?.[0];
    if(!imgFile){ showToast("Falta la imagen", false); return; }

    const imgUrl = await subirCloudinary(imgFile);
    payload.foto_url = imgUrl;
    await guardarFirestore(payload);

    showToast("Guardado OK");
  }catch(e){
    console.error(e);
    showToast("Fallo al guardar", false);
  }
});

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
