import { db } from './firebase.js';
import {
  collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

document.getElementById("ver").addEventListener("click", async () => {
  const nivel = document.getElementById("nivel").value;
  const filtro = document.getElementById("filtro").value.trim();
  const resultadosRef = collection(db, "resultados");
  const snapshot = await getDocs(resultadosRef);
  const data = [];

  snapshot.forEach(doc => {
    const id = doc.id;
    if (
      nivel === "mesa" && id === filtro ||
      nivel === "escuela" && id.startsWith(filtro + "-") ||
      nivel === "distrito" && id.startsWith(filtro + "-") ||
      nivel === "seccion" && id.startsWith(filtro + "-") ||
      nivel === "provincia"
    ) {
      data.push({ id, ...doc.data() });
    }
  });

  mostrarResultados(data);
});

function mostrarResultados(data) {
  const div = document.getElementById("resultado");
  div.innerHTML = "";

  const resumen = {};

  data.forEach(item => {
    for (const lista in item.listas) {
      if (!resumen[lista]) resumen[lista] = { gobernador: 0, diputados: 0 };
      resumen[lista].gobernador += item.listas[lista].gobernador;
      resumen[lista].diputados += item.listas[lista].diputados;
    }
  });

  const tabla = document.createElement("table");
  tabla.innerHTML = "<tr><th>Lista</th><th>Gobernador</th><th>Diputados</th></tr>";

  for (const lista in resumen) {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${lista}</td><td>${resumen[lista].gobernador}</td><td>${resumen[lista].diputados}</td>`;
    tabla.appendChild(row);
  }

  div.appendChild(tabla);
}
