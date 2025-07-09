import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let usuario = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) return location.href = "index.html";
  usuario = user;
  const docSnap = await getDoc(doc(db, "usuarios", user.uid));
  const data = docSnap.data();
  const mesaSelect = document.getElementById("mesaId");
  data.mesas.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    mesaSelect.appendChild(opt);
  });
});

document.getElementById("agregar-lista").addEventListener("click", () => {
  const container = document.getElementById("listas-container");
  const div = document.createElement("div");
  div.innerHTML = `
    <input type="text" placeholder="Nombre lista" class="lista-nombre" required />
    <input type="number" placeholder="Gobernador" class="gobernador" />
    <input type="number" placeholder="Diputados" class="diputados" />
    <hr/>
  `;
  container.appendChild(div);
});

document.getElementById("formulario-carga").addEventListener("submit", async (e) => {
  e.preventDefault();
  const mesaId = document.getElementById("mesaId").value;
  const foto = document.getElementById("foto").files[0];
  const url = await subirImagenACloudinary(foto, mesaId);

  const listasDiv = document.querySelectorAll("#listas-container > div");
  const listas = {};
  listasDiv.forEach(div => {
    const nombre = div.querySelector(".lista-nombre").value.trim();
    const gob = parseInt(div.querySelector(".gobernador").value) || 0;
    const dip = parseInt(div.querySelector(".diputados").value) || 0;
    listas[nombre] = { gobernador: gob, diputados: dip };
  });

  await setDoc(doc(db, "resultados", mesaId), {
    listas,
    imagenActa: url
  });

  alert("Cargado correctamente");
  location.reload();
});

async function subirImagenACloudinary(file, mesaId) {
  const url = "https://api.cloudinary.com/v1_1/dudrnu2mq/image/upload";
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "escrutinio");
  formData.append("folder", `actas/${mesaId}`);

  const res = await fetch(url, {
    method: "POST",
    body: formData
  });

  const data = await res.json();
  return data.secure_url;
}
