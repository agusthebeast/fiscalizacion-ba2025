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

// ---------- partidos + patrones ----------
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
const patrones = partidos.map(p => ({
  nombre: p,
  re: new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[^\\n\\r]*?(\\d{1,3})[^\\n\\r]*?(\\d{1,3})", "i")
}));

const tbody = document.querySelector("#tablaResultados tbody");
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
function parsear(texto){
  limpiarTabla();
  const out = {};
  patrones.forEach(p=>{
    const m = texto.match(p.re);
    const d = m ? m[1] : "";
    const c = m ? m[2] : "";
    out[p.nombre] = {dip:d, con:c};
    ponerFila(p.nombre, d, c);
  });
  const pickNum = (re)=> (texto.match(re)||[])[1] || "";
  $("totDip").textContent = pickNum(/TOTAL VOTOS AGRUPACIONES.*?(\d{1,3})/is);
  $("totCon").textContent = pickNum(/TOTAL VOTOS AGRUPACIONES[\s\S]*?\n.*?(\d{1,3})/im) || pickNum(/AGRUPACIONES POLITICAS.*?\n.*?(\d{1,3})/is);
  $("blDip").textContent  = pickNum(/VOTOS EN BLANCO.*?(\d{1,3})/is);
  $("blCon").textContent  = (texto.match(/VOTOS EN BLANCO[\s\S]*?\n.*?(\d{1,3})/i)||[])[1] || "";
  $("imp").textContent    = pickNum(/IDENTIDAD IMPUGNADA.*?(\d{1,3})/is) || "0";
  const sob3 = texto.match(/SOBRE\s*N[º°]\s*3.*?(\d{1,3})[\s\S]*?(\d{1,3})/i);
  if(sob3){ $("sob3Dip").textContent = sob3[1]; $("sob3Con").textContent = sob3[2]; }
  const sum = texto.match(/SUMA TOTAL DE VOTOS.*?(\d{1,3})[\s\S]*?(\d{1,3})/i);
  if(sum){ $("sumDip").textContent = sum[1]; $("sumCon").textContent = sum[2]; $("sumTag").textContent = `Suma total: ${sum[1]} / ${sum[2]}`; }
  return out;
}

// ---------- OCR ----------
async function leerActa(file){
  $("ocrStatus").textContent = "Procesando OCR…";
  const { data } = await Tesseract.recognize(file, 'spa', {
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÑabcdefghijklmnopqrstuvwxyzáéíóñ 0123456789-./º°',
  });
  $("ocrStatus").textContent = "Listo";
  $("confTag").textContent = "Conf: " + (data.confidence ? data.confidence.toFixed(1) + "%" : "—");
  parsear(data.text);
  return data;
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

    // 1) Subir foto a Cloudinary (unsigned)
    const imgUrl = await subirCloudinary(imgFile);

    // 2) Guardar en Firestore
    payload.foto_url = imgUrl;
    await guardarFirestore(payload);

    showToast("Guardado OK");
  }catch(e){
    console.error(e);
    showToast("Fallo al guardar", false);
  }
});

// ---------- Construir datos desde la tabla ----------
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
    ocr_conf: $("confTag").textContent.replace("Conf:","").trim(),
    created_at: new Date().toISOString()
  };
}

// ---------- Cloudinary ----------
const CLOUD_NAME = "dudrnu2mq";         // (tu proyecto para actas)
const UPLOAD_PRESET = "escrutinio";     // unsigned
async function subirCloudinary(file){
  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET);
  form.append("folder", "actas"); // carpeta opcional
  const r = await fetch(url, { method:"POST", body: form });
  if(!r.ok) throw new Error("Cloudinary error");
  const j = await r.json();
  return j.secure_url;
}

// ---------- Firestore ----------
async function guardarFirestore(payload){
  // login anónimo
  if(!firebase.auth().currentUser){
    await firebase.auth().signInAnonymously();
  }
  const col = firebase.firestore().collection("actas");
  await col.add(payload);
}
