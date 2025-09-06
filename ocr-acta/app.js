// ================== Boot ==================
let cvReady=false;
document.addEventListener("DOMContentLoaded", () => {
  if (window.cv) cv['onRuntimeInitialized'] = ()=>{ cvReady=true; };
  $("btnLeer").addEventListener("click", run);
  $("btnEditar").addEventListener("click", ()=>{
    [...document.querySelectorAll("#tablaResultados td:nth-child(2),#tablaResultados td:nth-child(3)")]
      .forEach(td=>td.contentEditable="true");
    toast("Edición habilitada");
  });
});

const $ = id => document.getElementById(id);
const tbody = () => document.querySelector("#tablaResultados tbody");
function toast(m,ok=true){ const t=$("toast"); t.textContent=m; t.className="toast "+(ok?"ok":"err"); t.style.display="block"; setTimeout(()=>t.style.display="none",2200); }

// ================== Datos básicos ==================
const ROW_CODES = [
  ["2200","Fuerza Patria"],
  ["2201","Potencia"],
  ["2202","Es con Vos es con Nosotros"],
  ["2203","Fte de Izq. y de Trabajadores - Unidad"],
  ["2204","Somos Buenos Aires"],
  ["2205","Nuevos Aires"],
  ["2206","La Libertad Avanza"],
  ["2207","Unión y Libertad"],
  ["2208","Unión Liberal"],
  ["959","Movimiento Avanzada Socialista"],
  ["963","Frente Patriota Federal"],
  ["974","Política Obrera"],
  ["980","Partido Tiempo de Todos"],
  ["1003","Construyendo Porvenir"],
  ["1006","Partido Libertario"],
  ["1008","Valores Republicanos"],
];
const FOOT_LABELS = [
  [/total\s+votos\s+agrupaciones|agrupaciones\s+politicas/i, "totDip", "totCon"],
  [/votos\s+en\s+blanco/i, "blDip", "blCon"],
  [/suma\s+total\s+de\s+votos/i, "sumDip", "sumCon"],
  [/sobre\s*n[º°]?\s*3/i, "sob3Dip", "sob3Con"],
  [/identidad\s+impugnada/i, "imp", null]
];

// ================== Util numérico ==================
const onlyDigits = s => (s||"").replace(/[^0-9]/g,"");
function clean3(s){ s=onlyDigits(s); if(!s) return ""; if(s.length>3) s=s.slice(0,3); return s.padStart(3,"0"); }
function setFoot(id, val){ if(id) $(id).textContent = val || "—"; }

// ================== OCR helpers ==================
async function ocrDigits(img){
  const { data } = await Tesseract.recognize(img, 'eng', {
    tessedit_char_whitelist: '0123456789',
    tessedit_pageseg_mode: '7'
  });
  return clean3(data.text);
}
async function ocrText(img){
  const { data } = await Tesseract.recognize(img, 'spa+eng', { logger: _=>{} });
  return data;
}

// ================== OpenCV: preproceso + grid ==================
async function run(){
  if(!cvReady){ toast("Cargando OpenCV… reintentá", false); return; }
  const file = $("fileActa").files?.[0];
  if(!file){ toast("Subí la foto del acta.", false); return; }

  $("ocrStatus").textContent="Procesando…";
  clearTable();

  // Cargar imagen a cv.Mat
  const dataURL = await fileToDataURL(file);
  const src = await urlToMat(dataURL);

  // 1) Escalar si es chica
  const maxSide = Math.max(src.cols, src.rows);
  if(maxSide < 1800){
    const scale = 1800/maxSide;
    const dst = new cv.Mat();
    cv.resize(src, dst, new cv.Size(0,0), scale, scale, cv.INTER_CUBIC);
    src.delete(); src=dst;
  }

  // 2) Gris + CLAHE + binarizado adaptativo
  let gray = new cv.Mat(); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
  let clahe = new cv.createCLAHE(2.0, new cv.Size(8,8)); clahe.apply(gray, gray); clahe.delete();
  let bin = new cv.Mat(); cv.adaptiveThreshold(gray, bin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 25, 15);

  // 3) Deskew (Hough)
  const angle = estimateSkew(bin);
  if(Math.abs(angle)>0.6){
    bin = rotateMat(bin, angle);
    gray = rotateMat(gray, angle);
    src  = rotateMat(src, angle);
  }

  // 4) Detectar líneas verticales y horizontales para columnas y filas
  const {vXs, hYs} = detectGrid(bin);

  // 5) Columnas: tomamos las dos más a la derecha (números)
  const sortedV = [...vXs].sort((a,b)=>a-b);
  const colDipX = sortedV[sortedV.length-2];
  const colConX = sortedV[sortedV.length-1];

  // 6) Filas por códigos: OCR sobre banda izquierda, anclando por “2200, 2201…”
  const yRows = await findRowYByCodes(src, gray, hYs);

  // 7) Leer cada celda (dip/con) recortando alrededor de (xcol, yrow)
  for(const [code,name] of ROW_CODES){
    const y = yRows.get(code);
    addRow(name, await readCell(src, colDipX, y), await readCell(src, colConX, y));
  }

  // 8) Pie de totales: buscar el texto y leer en columnas
  const wordsData = await ocrText(dataURL);
  $("confTag").textContent = "Conf: " + (wordsData.confidence ? wordsData.confidence.toFixed(1)+"%" : "—");
  const words = (wordsData.words||[]).map(w=>({text:(w.text||"").toLowerCase(), bbox:w.bbox}));
  for(const [rx, idL, idR] of FOOT_LABELS){
    const hit = words.filter(w=> rx.test(w.text));
    if(!hit.length) continue;
    const box = unionBox(hit);
    const y = (box.y0+box.y1)/2;
    setFoot(idL, await readCell(src, colDipX, y));
    if(idR) setFoot(idR, await readCell(src, colConX, y));
  }

  // 9) Sugerencia de cabecera (Distrito/Circuito/Mesa) leyendo el número derecho
  suggestHeader(words, src, [colDipX, colConX]);

  $("ocrStatus").textContent="Listo";
  toast("Lectura completa");
}

// ----------------- helpers OpenCV -----------------
function fileToDataURL(f){ return new Promise(r=>{ const fr=new FileReader(); fr.onload=e=>r(e.target.result); fr.readAsDataURL(f); }); }
function urlToMat(url){ return new Promise(res=>{ const img=new Image(); img.onload=()=>{ const mat=cv.imread(img); res(mat); }; img.src=url; }); }
function rotateMat(mat, ang){
  const center = new cv.Point(mat.cols/2, mat.rows/2);
  const M = cv.getRotationMatrix2D(center, ang, 1.0);
  const dst = new cv.Mat(); cv.warpAffine(mat, dst, M, new cv.Size(mat.cols, mat.rows), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
  M.delete(); mat.delete(); return dst;
}
function estimateSkew(bin){
  let edges=new cv.Mat(); cv.Canny(bin, edges, 50, 150);
  let lines=new cv.Mat(); cv.HoughLines(edges, lines, 1, Math.PI/180, 180);
  let angs=[]; for(let i=0;i<lines.rows;i++){ const rho=lines.data32F[i*2], theta=lines.data32F[i*2+1]; let a=(theta*180/Math.PI); if(a>90) a-=180; if(Math.abs(a)<30) angs.push(a); }
  edges.delete(); lines.delete();
  if(!angs.length) return 0;
  return angs.reduce((a,b)=>a+b,0)/angs.length;
}
function detectGrid(bin){
  const inv = new cv.Mat(); cv.bitwise_not(bin, inv);
  // vertical
  const vKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, 40));
  const vLines = new cv.Mat(); cv.morphologyEx(inv, vLines, cv.MORPH_OPEN, vKernel);
  const vXs = projectPeaks(vLines, 'x');
  vKernel.delete(); vLines.delete();
  // horizontal
  const hKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(60, 1));
  const hLines = new cv.Mat(); cv.morphologyEx(inv, hLines, cv.MORPH_OPEN, hKernel);
  const hYs = projectPeaks(hLines, 'y');
  hKernel.delete(); hLines.delete(); inv.delete();
  return { vXs, hYs };
}
function projectPeaks(mat, axis){
  const hist = [];
  if(axis==='x'){
    for(let x=0;x<mat.cols;x++){
      let sum=0; for(let y=0;y<mat.rows;y++) sum+=mat.ucharPtr(y,x)[0];
      hist.push(sum);
    }
  }else{
    for(let y=0;y<mat.rows;y++){
      let sum=0; for(let x=0;x<mat.cols;x++) sum+=mat.ucharPtr(y,x)[0];
      hist.push(sum);
    }
  }
  // picos por umbral relativo
  const max = Math.max(...hist); const thr = max*0.55;
  const peaks=[];
  for(let i=1;i<hist.length-1;i++){
    if(hist[i]>thr && hist[i]>=hist[i-1] && hist[i]>=hist[i+1]) peaks.push(i);
  }
  // dedup distancia mínima
  const dedup=[]; const minDist=20;
  for(const p of peaks){ if(dedup.length===0 || p-dedup[dedup.length-1]>minDist) dedup.push(p); }
  return dedup;
}
function unionBox(arr){
  return {
    x0: Math.min(...arr.map(w=>w.bbox.x0)),
    y0: Math.min(...arr.map(w=>w.bbox.y0)),
    x1: Math.max(...arr.map(w=>w.bbox.x1)),
    y1: Math.max(...arr.map(w=>w.bbox.y1)),
  };
}

// localizar Y de cada código (ej. “2200”) leyendo banda izquierda
async function findRowYByCodes(src, gray, hYs){
  const map = new Map();
  // banda izquierda donde están los códigos
  const bandX = Math.round(src.cols*0.05);
  const bandW = Math.round(src.cols*0.25);
  for(let i=0;i<ROW_CODES.length;i++){
    const code = ROW_CODES[i][0];
    // barrer todas las franjas entre líneas horizontales y buscar el código
    let bestY=null, bestHit=0;
    for(let j=0;j<hYs.length-1;j++){
      const y0=hYs[j], y1=hYs[j+1];
      const h=y1-y0; if(h<18) continue;
      const crop = cropMat(src, bandX, y0, bandW, h);
      const { data } = await Tesseract.recognize(crop, 'eng', {
        tessedit_char_whitelist:'0123456789-',
        tessedit_pageseg_mode:'6'
      });
      const t = (data.text||"").replace(/\s/g,'');
      const score = t.includes(code) ? 1 : (t.includes(code.slice(0,3))?0.5:0);
      if(score>bestHit){ bestHit=score; bestY=(y0+y1)/2; }
    }
    map.set(code, bestY ?? Math.round((i+1)*src.rows/(ROW_CODES.length+4)));
  }
  return map;
}
function cropMat(mat, x, y, w, h){
  x=Math.max(0, Math.min(x, mat.cols-1));
  y=Math.max(0, Math.min(y, mat.rows-1));
  w=Math.min(w, mat.cols-x); h=Math.min(h, mat.rows-y);
  const roi = mat.roi(new cv.Rect(x,y,w,h));
  // upscale x2 + binarize
  let dst=new cv.Mat(); cv.resize(roi, dst, new cv.Size(w*2,h*2), 0,0, cv.INTER_CUBIC);
  cv.cvtColor(dst, dst, cv.COLOR_RGBA2GRAY, 0);
  cv.adaptiveThreshold(dst, dst, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY, 25, 10);
  // export to dataURL
  const canvas=document.createElement('canvas'); canvas.width=dst.cols; canvas.height=dst.rows;
  cv.imshow(canvas, dst);
  const url=canvas.toDataURL('image/png');
  roi.delete(); dst.delete();
  return url;
}
async function readCell(src, xCol, yMid){
  const w = Math.round(src.cols*0.11);
  const h = Math.round(src.rows*0.025);
  const x = Math.max(0, xCol - Math.round(w*0.1));
  const y = Math.max(0, Math.round(yMid - h/2));
  const crop = cropMat(src, x, y, w, h);
  return await ocrDigits(crop);
}

// cabeceras: tomar número a la derecha de palabra
async function suggestHeader(words, src, cols){
  const getRightNum = async (rx)=>{
    const hits = words.filter(w=> rx.test(w.text));
    if(!hits.length) return "";
    const b = unionBox(hits); const y=(b.y0+b.y1)/2;
    return await readCell(src, Math.min(...cols), y);
  };
  $("inpDistrito").value ||= await getRightNum(/distrito/);
  $("inpCircuito").value ||= await getRightNum(/circuito/);
  $("inpMesa").value     ||= await getRightNum(/mesa/);
}

// ================== Tabla ==================
function clearTable(){
  tbody().innerHTML="";
  ["totDip","totCon","blDip","blCon","imp","sob3Dip","sob3Con","sumDip","sumCon"].forEach(id=>$(id).textContent="—");
  $("sumTag").textContent="Suma total: — / —";
}
function addRow(name, d, c){
  const tr=document.createElement("tr");
  const tdN=document.createElement("td");
  const tdD=document.createElement("td");
  const tdC=document.createElement("td");
  tdN.textContent=name;
  tdD.textContent=d||"";
  tdC.textContent=c||"";
  tr.append(tdN,tdD,tdC); tbody().appendChild(tr);
}
