import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let usuario = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) return location.href = "index.html";
  usuario = user;

  try {
    const docSnap = await getDoc(doc(db, "usuarios", user.uid));
    if (!docSnap.exists()) {
      alert("El usuario no tiene datos en Firestore");
      return;
    }

    const data = docSnap.data();
    if (!data.mesas || !Array.isArray(data.mesas)) {
      alert("No hay mesas asignadas para este usuario");
      return;
    }

    const mesaSelect = document.getElementById("mesaId");
    const infoBox = document.createElement("div");
    infoBox.id = "infoMesa";
    mesaSelect.after(infoBox);

    data.mesas.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      mesaSelect.appendChild(opt);
    });

    mesaSelect.addEventListener("change", () => {
      const mesaId = mesaSelect.value;
      const detalle = data.detalleMesas?.[mesaId];
      if (detalle) {
        infoBox.innerHTML = `
          <p><strong>Distrito:</strong> ${detalle.distrito}</p>
          <p><strong>Escuela:</strong> ${detalle.escuela}</p>
        `;
      } else {
        infoBox.innerHTML = "";
      }
    });

    // Disparar cambio para mostrar info de la primera mesa si hay una seleccionada
    mesaSelect.dispatchEvent(new Event("change"));

  } catch (err) {
    console.error("Error obteniendo datos:", err);
    alert("Error al obtener datos del usuario");
  }
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
  if (!mesaId) {
    alert("Seleccioná una mesa");
    return;
  }

  const foto = document.getElementById("foto").files[0];
  if (!foto) {
    alert("Subí una foto del acta");
    return;
  }

  const url = await subirImagenACloudinary(foto, mesaId);

  const listasDiv = document.querySelectorAll("#listas-container > div");
  const listas = {};
  listasDiv.forEach(div => {
    const nombre = div.querySelector(".lista-nombre").value.trim();
    if (!nombre) return;
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
  const distrito = data.detalleMesas?.[mesaId]?.distrito || "desconocido";
formData.append("folder", `actas/${distrito}/${mesaId}`);


  const res = await fetch(url, {
    method: "POST",
    body: formData
  });

  const data = await res.json();
  return data.secure_url;
}
