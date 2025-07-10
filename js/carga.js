import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let usuario = null;
let datosUsuario = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) return location.href = "index.html";
  usuario = user;

  try {
    const docSnap = await getDoc(doc(db, "usuarios", user.uid));
    if (!docSnap.exists()) {
      mostrarMensaje("El usuario no tiene datos guardados");
      return;
    }

    datosUsuario = docSnap.data();
    if (!datosUsuario.mesas || !Array.isArray(datosUsuario.mesas)) {
      mostrarMensaje("No hay mesas asignadas para este usuario");
      return;
    }

    const mesaSelect = document.getElementById("mesaId");
    const infoBox = document.createElement("div");
    infoBox.id = "infoMesa";
    mesaSelect.after(infoBox);

    datosUsuario.mesas.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      mesaSelect.appendChild(opt);
    });

    mesaSelect.addEventListener("change", () => {
      const mesaId = mesaSelect.value.split("-")[1]; // extrae solo el número
      const detalle = datosUsuario.detalleMesas?.[mesaId];
      if (detalle) {
        infoBox.innerHTML = `
          <p><strong>Distrito:</strong> ${detalle.distrito}</p>
          <p><strong>Escuela:</strong> ${detalle.escuela}</p>
          <p><strong>Sección:</strong> ${detalle.seccion}</p>
        `;
      } else {
        infoBox.innerHTML = "";
      }
    });

    mesaSelect.dispatchEvent(new Event("change"));

  } catch (err) {
    console.error("Error obteniendo datos:", err);
    mostrarMensaje("Error al obtener datos del usuario");
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

  const mesaFull = document.getElementById("mesaId").value;
  if (!mesaFull) {
    mostrarMensaje("Seleccioná una mesa");
    return;
  }

  const mesaNum = mesaFull.split("-")[1]; // solo el número (ej. 86)
  const detalle = datosUsuario.detalleMesas?.[mesaNum] || {};
  const distrito = detalle.distrito || "desconocido";
  const seccion = detalle.seccion || "desconocido";

  const foto = document.getElementById("foto").files[0];
  if (!foto) {
    mostrarMensaje("Subí una foto del acta");
    return;
  }

  const url = await subirImagenACloudinary(foto, mesaFull, distrito);

  const listasDiv = document.querySelectorAll("#listas-container > div");
  const listas = {};
  listasDiv.forEach(div => {
    const nombre = div.querySelector(".lista-nombre").value.trim();
    if (!nombre) return;
    const gob = parseInt(div.querySelector(".gobernador").value) || 0;
    const dip = parseInt(div.querySelector(".diputados").value) || 0;
    listas[nombre] = { gobernador: gob, diputados: dip };
  });

  await setDoc(doc(db, "resultados", mesaFull), {
    distrito,
    seccion,
    numeroMesa: mesaFull,
    listas,
    imagenActa: url
  });

  mostrarMensaje("Cargado correctamente");
  location.reload();
});

async function subirImagenACloudinary(file, mesaFull, distrito) {
  const folderPath = `actas/${distrito.replace(/\s+/g, "_").toLowerCase()}/${mesaFull}`;
  const url = "https://api.cloudinary.com/v1_1/dudrnu2mq/image/upload";
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "escrutinio");
  formData.append("folder", folderPath);

  const res = await fetch(url, {
    method: "POST",
    body: formData
  });

  const responseData = await res.json();
  return responseData.secure_url;
}

function mostrarMensaje(texto) {
  const box = document.getElementById("mensaje");
  const txt = document.getElementById("mensaje-texto");
  txt.textContent = texto;
  box.style.display = "flex";
}
