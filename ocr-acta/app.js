// ===== Boot/UI =====
document.addEventListener("DOMContentLoaded", () => {
  $("btnLeer").addEventListener("click", onLeer);
  $("btnEditar").addEventListener("click", enableEdit);
});

const $ = id => document.getElementById(id);
const tbody = () => document.querySelector("#tablaResultados tbody");
function showToast(msg, ok=true){
  const t=$("toast"); t.textContent=msg; t.className="toast "+(ok?"ok":"err");
  t.style.display="block"; setTimeout(()=>t.style.display="none",2500);
}

// ===== Config planilla (códigos oficiales y nombres) =====
const PARTIDOS = [
  {code:"2200", name:"Fuerza Patria"},
  {code:"2201", name:"Potencia"},
  {code:"2202", name:"Es con Vos es con Nosotros"},
  {code:"2203", name:"Fte de Izq. y de Trabajadores - Unidad"},
  {code:"2204", name:"Somos Buenos Aires"},
  {code:"2205", name:"Nuevos Aires"},
  {code:"2206", name:"La Libertad Avanza"},
  {code:"2207", name:"Unión y Libertad"},
  {code:"2208", name:"Unión Liberal"},
  {code:"959",  name:"Movimiento Avanzada Socialista"},
  {code:"963",  name:"Frente Patriota Federal"},
  {code:"974",  name:"Política Obrera"},
  {code:"980",  name:"Partido Tiempo de Todos"},
  {code:"1003", name:"Construyendo Porvenir"},
  {code:"1006", name:"Partido Libertario"},
  {code:"1008", name:"Valores Republicanos"},
];

function limpiarTabla(){
  tbody().innerHTML="";
  ["totDip","totCon","blDip","blCon","imp","sob3Dip","sob3Con","sumDip","sumCon"].forEach(i=>$(i).textContent="—");
  $("sumTag").textContent="Suma total: — / —";
}
function ponerFila(nombre, d, c){
  const tr=document.createElement("tr");
  const tdN=document.createElement("td"), tdD=document.createElement("td"), tdC=document.createElement("td");
  tdN.textContent=nombre; tdD.textContent=d||""; tdC.textContent=c||"";
  tr.append(tdN,tdD,tdC); tbody().appendChild(tr);
}
function enableEdit(){
  [...tbody().querySelectorAll("td:nth-child(2), td:nth-child(3)")].forEach(td=>td.contentEditable="true");
  showToast("Edición habilitada");
}

// ===== Utiles OCR =====
const pad3 = s => (s==null||s==="") ? "" : String(s).replace(/\D/g,"").padStart(3,"0");
const onlyDigits = s => (s||"").replace(/[^0-9]/g,"");

async function ocrFull(file){
  return Tesseract.recognize(file,'spa+eng',{
    tessedit_pageseg_mode: "6",
    preserve_interword_spaces: "1",
    logger: m => {}
  });
}
async function ocrDigits(imgDataURL){
  return Tesseract.recognize(imgDataURL,'eng',{
    tessedit_char_whitelist: "0123456789",
    tessedit_pageseg_mode: "7",
    logger: m => {}
  });
}

// ===== Crops por zona =====
// Recorta de la imagen original (dataURL) usando coordenadas relativas
async function crop(dataURL, x, y, w, h){
  return new Promise((resolve)=>{
    const img=new Image();
    img.onload=()=>{
      const cnv=$("cnv"), ctx=cnv.getContext("2d");
      cnv.width = w; cnv.height = h;
      ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
      // ampliamos x2 y binarizamos simple
      const scale=2;
      const c2=document.createElement("canvas"); c2.width=w*scale; c2.height=h*scale;
      const g=c2.getContext("2d");
      g.imageSmoothingEnabled=false;
      g.drawImage(cnv,0,0,w,h,0,0,w*scale,h*scale);
      const id=g.getImageData(0,0,c2.width,c2.height);
      const d=id.data;
      for(let i=0;i<d.length;i+=4){
        const gray=(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]);
        const bw=gray>180?255:0;
        d[i]=d[i+1]=d[i+2]=bw; d[i+3]=255;
      }
      g.putImageData(id,0,0);
      resolve(c2.toDataURL("image/png"));
    };
    img.src=dataURL;
  });
}

// Busca una palabra y devuelve su bbox promedio (x0,x1,y0,y1)
function findWordBox(words, rx){
  const hits = words.filter(w=>rx.test(w.text.toLowerCase()));
  if(!hits.length) return null;
  const x0=Math.min(...hits.map(w=>w.bbox.x0));
  const x1=Math.max(...hits.map(w=>w.bbox.x1));
  const y0=Math.min(...hits.map(w=>w.bbox.y0));
  const y1=Math.max(...hits.map(w=>w.bbox.y1));
  return {x0,x1,y0,y1, ymid:(y0+y1)/2, h:(y1-y0), w:(x1-x0)};
}

// ===== Pipeline principal =====
async function onLeer(){
  const f=$("fileActa").files?.[0];
  if(!f){ showToast("Subí una foto del acta.",false); return; }

  limpiarTabla();
  $("ocrStatus").textContent="Procesando…";

  const fr = new FileReader();
  fr.onload = async e=>{
    const dataURL = e.target.result;

    // 1) OCR general para ubicar palabras y coordenadas
    const {data} = await ocrFull(f);
    $("confTag").textContent = "Conf: " + (data.confidence? data.confidence.toFixed(1) + "%":"—");

    const words = (data.words||[]).map(w=>({
      text:(w.text||"").trim(),
      bbox:w.bbox
    }));

    // 2) Encontrar X de columnas por headers
    const hdrDip = findWordBox(words,/diputados|senadores/);
    const hdrCon = findWordBox(words,/concejales/);
    // Si no aparecen, estimamos por porcentaje
    const imgW = data.image?.dims?.x || (data.paragraphs?.[0]?.bbox?.x1||2000);
    const imgH = data.image?.dims?.y || (data.paragraphs?.[0]?.bbox?.y1||3000);
    const colDipX = hdrDip ? hdrDip.x0 : Math.round(imgW*0.70);
    const colConX = hdrCon ? hdrCon.x0 : Math.round(imgW*0.86);
    const cellW   = Math.round(imgW*0.12); // ancho de celda
    const rowHpad = 18;                    // alto de recorte adicional

    // 3) Cabeceras (número a la derecha de la palabra)
    const getNumberRight = (rx)=>{
      const box = findWordBox(words, rx);
      if(!box) return "";
      const sameLine = words.filter(w=>{
        const y = (w.bbox.y0+w.bbox.y1)/2;
        return y>box.y0-20 && y<box.y1+20 && w.bbox.x0>box.x1;
      }).map(w=>onlyDigits(w.text)).filter(Boolean);
      return sameLine[0] || "";
    };
    $("inpDistrito").value = $("inpDistrito").value || getNumberRight(/distrito/);
    $("inpCircuito").value = $("inpCircuito").value || getNumberRight(/circuito/);
    $("inpMesa").value     = $("inpMesa").value     || getNumberRight(/mesa/);

    // 4) Para cada código de partido: y de la fila y recortes en ambas columnas
    for(const p of PARTIDOS){
      // código puede venir con guión: "2200" o "2200-"
      const rowWord = words.find(w=>/^\d{3,4}/.test(w.text) && w.text.startsWith(p.code));
      if(!rowWord){
        ponerFila(p.name,"","");
        continue;
      }
      const ymid = (rowWord.bbox.y0 + rowWord.bbox.y1)/2;
      const y0 = Math.max(0, Math.round(ymid - (rowWord.bbox.y1-rowWord.bbox.y0) - rowHpad));
      const h  = Math.min(imgH - y0, Math.round((rowWord.bbox.y1-rowWord.bbox.y0) + 2*rowHpad));

      // recortes
      const dipCrop = await crop(dataURL, Math.max(0,colDipX-10), y0, cellW, h);
      const conCrop = await crop(dataURL, Math.max(0,colConX-10), y0, cellW, h);

      // OCR solo dígitos en cada recorte
      const dipTxt = onlyDigits((await ocrDigits(dipCrop)).data.text);
      const conTxt = onlyDigits((await ocrDigits(conCrop)).data.text);

      // “NO USAR” aparece como texto; al forzar dígitos, queda vacío → lo dejamos vacío
      const dip = dipTxt ? pad3(dipTxt) : "";
      const con = conTxt ? pad3(conTxt) : "";

      ponerFila(p.name, dip, con);
    }

    // 5) Totales y extras (vía recortes por texto)
    const readNear = async (rxLeft, which="both")=>{
      const box = findWordBox(words, rxLeft);
      if(!box) return ["",""];
      const ymid = (box.y0+box.y1)/2;
      const y0 = Math.max(0, Math.round(ymid - (box.h) - rowHpad));
      const h  = Math.min(imgH - y0, Math.round(box.h + 2*rowHpad));
      const dipCrop = await crop(dataURL, Math.max(0,colDipX-10), y0, cellW, h);
      const conCrop = await crop(dataURL, Math.max(0,colConX-10), y0, cellW, h);
      const d = onlyDigits((await ocrDigits(dipCrop)).data.text);
      const c = onlyDigits((await ocrDigits(conCrop)).data.text);
      return [d?pad3(d):"", c?pad3(c):""];
    };

    const [td,tc] = await readNear(/total\s+votos\s+agrupaciones|agrupaciones\s+politicas/i);
    $("totDip").textContent = td || "—";
    $("totCon").textContent = tc || "—";

    const [bd,bc] = await readNear(/votos\s+en\s+blanco/i);
    $("blDip").textContent = bd || "—";
    $("blCon").textContent = bc || "—";

    const [sd,sc] = await readNear(/suma\s+total\s+de\s+votos/i);
    $("sumDip").textContent = sd || "—";
    $("sumCon").textContent = sc || "—";
    if(sd && sc) $("sumTag").textContent = `Suma total: ${sd} / ${sc}`;

    const [s3d,s3c] = await readNear(/sobre\s*n[º°]?\s*3/i);
    $("sob3Dip").textContent = s3d || "—";
    $("sob3Con").textContent = s3c || "—";

    const impBox = findWordBox(words,/identidad\s+impugnada/i);
    if(impBox){
      const ymid = (impBox.y0+impBox.y1)/2;
      const y0 = Math.max(0, Math.round(ymid - impBox.h - rowHpad));
      const h  = Math.min(imgH - y0, Math.round(impBox.h + 2*rowHpad));
      const dipCrop = await crop(dataURL, Math.max(0,colDipX-10), y0, cellW, h);
      const impTxt = onlyDigits((await ocrDigits(dipCrop)).data.text);
      $("imp").textContent = impTxt ? pad3(impTxt) : "000";
    } else {
      $("imp").textContent = "000";
    }

    $("ocrStatus").textContent="Listo";
    showToast("Lectura completa");
  };
  fr.readAsDataURL(f);
}
