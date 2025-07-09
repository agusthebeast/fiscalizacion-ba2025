import { db } from './firebase.js';
import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const nivelSelect = document.getElementById("nivel");
const filtroSeccion = document.getElementById("filtro-seccion");
const filtroDistrito = document.getElementById("filtro-distrito");
const btnVer = document.getElementById("verResultados");
const canvas = document.getElementById("grafico");
let chart;

nivelSelect.addEventListener("change", () => {
  filtroSeccion.style.display = "none";
  filtroDistrito.style.display = "none";

  if (nivelSelect.value === "seccion") {
    filtroSeccion.style.display = "block";
  } else if (nivelSelect.value === "distrito") {
    filtroDistrito.style.display = "block";
  }
});

btnVer.addEventListener("click", async () => {
  const nivel = nivelSelect.value;
  let filtro = null;

  if (nivel === "seccion") {
    filtro = document.getElementById("seccionInput").value.trim();
    if (!filtro) return alert("Escribí una sección");
  } else if (nivel === "distrito") {
    filtro = document.getElementById("distritoInput").value.trim();
    if (!filtro) return alert("Escribí un distrito");
  }

  const datos = await obtenerResultados(nivel, filtro);
  graficar(datos);
});

async function obtenerResultados(nivel, filtro) {
  const resultadosRef = collection(db, "resultados");
  const snapshot = await getDocs(resultadosRef);

  const acumulado = {};

  snapshot.forEach(doc => {
    const data = doc.data();
    if (!data.listas || !data.distrito) return;

    const distrito = data.distrito;
    const seccion = data.seccion || ""; // por si luego lo añadimos
    const incluir =
      (nivel === "provincia") ||
      (nivel === "seccion" && seccion === filtro) ||
      (nivel === "distrito" && distrito === filtro);

    if (!incluir) return;

    for (const lista in data.listas) {
      const nombre = `Lista ${lista}`;
      const votos = (data.listas[lista].gobernador || 0) + (data.listas[lista].diputados || 0);

      if (!acumulado[nombre]) acumulado[nombre] = 0;
      acumulado[nombre] += votos;
    }
  });

  return acumulado;
}

function graficar(datos) {
  if (chart) chart.destroy();

  const labels = Object.keys(datos);
  const valores = Object.values(datos);

  chart = new Chart(canvas, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: valores
      }]
    }
  });
}
