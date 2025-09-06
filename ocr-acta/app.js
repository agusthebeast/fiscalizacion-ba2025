// ====== BOOT ======
document.addEventListener("DOMContentLoaded", () => {
  bindUI();
  initFirebase();
});

// ====== UI ======
const $ = (id)=>document.getElementById(id);
function showToast(msg, ok=true){
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast " + (ok ? "ok":"err");
  t.style.display = "block";
  setTimeout(()=> t.style.display="none", 2600);
}
function openModal(){ $("modalConf").style.display="flex"; }
function closeModal(){ $("modalConf").style.display="none"; }

// ====== PARTIDOS ======
const PARTIDOS = [
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

// ====== TABLA ======
const tbody = ()=> document.querySelector("#tablaResultados tbody");
function limpiarTabla(){
  tbody().innerHTML = "";
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
  tbody().appendChild(tr);
}

// ====== OCR (simple y estable) ======
async function leerActa(file){
  $("ocrStatus").textContent = "Procesando OCR…";
  try{
    const { data } = await Tesseract.recognize(file, 'spa', { logger: _=>{} });
    $("ocrStatus").textContent = "Listo";
    $("confTag").textContent = "Conf: " + (data.confidence ? data.confidence.toFixed(1) + "%" : "—");
    parseByText(data.text || "");
  }catch(e){
    console.error(e);
    $("ocrStatus").textContent = "Error OCR";
    showToast("Error corriendo OCR", false);
  }
}

// ====== PARSER POR TEXTO (robusto con corrección de dígitos) ======
const normDigits = s => (s || "")
  .replace(/[Oo]/g,"0")
  .replace(/[Ss]/g,"5")
  .replace(/[Bb]/g,"8")
  .replace(/[lI]/g,"1")
  .replace(/[,;]/g,"")   // quita separadores
  .replace(/[^\w\s]/g, m => m); // deja símbolos

function parseByText(txt){
  limpiarTabla();

  // líneas crudas y línea “normalizada” para capturar números
  const rawLines = (txt||"").split(/\n+/).map(l=>l.trim()).filter(Boolean);
  const normLines = rawLines.map(normDigits);

  const findIdx = (needle) =>
    rawLines.findIndex(l => l.toLowerCase().includes(needle.toLowerCase()));

  // helper: dos números (2–3 cifras) en esta línea o la siguiente
  function getNums(idx, forbidNextIfContainsNoUsar=false){
    const re = /(\d{1,3})/g;
    let lineA = normLines[idx] || "";
    let lineB = normLines[idx+1] || "";

    // si la siguiente dice NO USAR, no la usamos para la 2da columna
    const nextHasNoUsar = /no\s*usar/i.test(rawLines[idx+1] || "");
    let numsA = [...lineA.matchAll(re)].map(x=>x[1]);
    let numsB = !forbidNextIfContainsNoUsar && !nextHasNoUsar ? [...lineB.matchAll(re)].map(x=>x[1]) : [];

    let nums = numsA.concat(numsB);
    // toma primeros dos
    let dip = nums[0] || "";
    let con = nums[1] || "";

    // blanquea 000
    if(dip==="000") dip="";
    if(con==="000") con="";
    return [dip, con];
  }

  // Cabeceras
  let iDist = findIdx("Distrito");
  if(iDist>=0){ $("inpDistrito").value ||= (normLines[iDist].match(/(\d{1,3})/)||[])[1] || ""; }
  let iCirc = findIdx("Circuito");
  if(iCirc>=0){ $("inpCircuito").value ||= (normLines[iCirc].match(/(\d{1,4})/)||[])[1] || ""; }
  let iMesa = findIdx("Mesa");
  if(iMesa>=0){ $("inpMesa").value ||= (normLines[iMesa].match(/(\d{1,4})/)||[])[1] || ""; }

  // Partidos
  for(const p of PARTIDOS){
    const i = findIdx(p);
    if(i>=0){
      const [dip, con] = getNums(i, true);
      // si la línea del partido incluye "NO USAR", vaciamos la 2da col
      const noUsarHere = /no\s*usar/i.test(rawLines[i]);
      ponerFila(p, dip, noUsarHere ? "" : con);
    } else {
      ponerFila(p, "", "");
    }
  }

  // Totales
  let iTot = findIdx("TOTAL VOTOS AGRUPACIONES");
  if(iTot<0) iTot = findIdx("AGRUPACIONES POLITICAS");
  if(iTot>=0){ const [d,c]=getNums(iTot); $("totDip").textContent=d; $("totCon").textContent=c; }

  const iBl = findIdx("VOTOS EN BLANCO");
  if(iBl>=0){ const [d,c]=getNums(iBl); $("blDip").textContent=d; $("blCon").textContent=c; }

  const iImp = findIdx("IDENTIDAD IMPUGNADA");
  if(iImp>=0){ const [d]=getNums(iImp); $("imp").textContent=d || "0"; }

  const iS3a = findIdx("SOBRE N° 3");
  const iS3b = findIdx("SOBRE N 3");
  const iS3c = findIdx("SOBRE Nº 3");
  const iS3 = [iS3a,iS3b,iS3c].find(i=>i>=0);
  if(iS3>=0){ const [d,c]=getNums(iS3); $("sob3Dip").textContent=d; $("sob3Con").textContent=c; }

  const iSum = findIdx("SUMA TOTAL DE VOTOS");
  if(iSum>=0){ const [d,c]=getNums(iSum); $("sumDip").textContent=d; $("sumCon").textContent=c; if(d&&c){ $("sumTag").textContent=`Suma total: ${d} / ${c}`; } }
}

// ====== PAYLOAD / SAVE ======
function construirPayload(){
  const filas = [...tbody().querySelectorAll("tr")].map(tr=>{
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

// ====== CLOUDINARY ======
const CLOUD_NAME = "dudrnu2mq";     // tu config
const UPLOAD_PRESET = "escrutinio"; // unsigned
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

// ====== FIREBASE ======
function initFirebase(){
  const firebaseConfig = {
    apiKey: "AIzaSyBBzTZfg0OfP0ESC6Gm3YixAmumVtGqjq0",
    authDomain: "fiscalizacionba2025.firebaseapp.com",
    projectId: "fiscalizacionba2025",
    storageBucket: "fiscalizacionba2025.firebasestorage.app",
    messagingSenderId: "565741056892",
    appId: "1:565741056892:web:28c7c807e410f8577e6af9"
  };
  firebase.initializeApp(firebaseConfig);
}
async function guardarFirestore(payload){
  const auth = firebase.auth();
  const db   = firebase.firestore();
  if(!auth.currentUser) await auth.signInAnonymously();
  await db.collection("actas").add(payload);
}

// ====== EVENTOS ======
function bindUI(){
  $("btnLeer").addEventListener("click", async ()=>{
    const f = $("fileActa").files?.[0];
    if(!f){ showToast("Subí una foto del acta.", false); return; }
    await leerActa(f);
  });

  $("btnEditar").addEventListener("click", ()=>{
    [...tbody().querySelectorAll("td:nth-child(2), td:nth-child(3)")].forEach(td=>td.contentEditable="true");
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
}
